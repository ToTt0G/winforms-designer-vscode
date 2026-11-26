import * as vscode from 'vscode';

export const GITHUB_REPO_URL = 'https://github.com/ToTt0G/winforms-designer-vscode';
export const STAR_PROMPT_STATE_KEY = 'winformsDesigner.starPrompt.v1';

export const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes between distinct sessions
export const MIN_USAGE_AGE_MS = 10 * 60 * 1000; // 10 minutes of active usage
export const SNOOZE_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days after clicking "Later"
export const MIN_EDITS_MULTI_SESSION = 6;
export const MIN_EDITS_SINGLE_SESSION = 12;
export const MIN_EDITS_AFTER_SNOOZE = 5;
export const MIN_EDITS_AFTER_UPDATE = 2;
export const MAX_LIFETIME_PROMPTS = 3;

export interface StarPromptPersistedState {
  status: 'pending' | 'snoozed' | 'dismissed' | 'starred';
  editCount: number;
  sessionsCount: number;
  firstUsedAt: number;
  lastSessionAt: number;
  snoozedUntil?: number;
  snoozeBaseEditCount?: number;
  lastSeenVersion?: string;
  promptedCount: number;
}

export type StarPromptAction = 'star' | 'later' | 'dismiss';

interface StateMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void> | void;
}

/**
 * Tracks meaningful visual-editing engagement in VS Code's globalState and decides
 * when to show a single, unobtrusive GitHub Star prompt.
 */
export class StarPromptController {
  private shownThisRun = false;
  private updatedAfterRealUse = false;
  private editsThisRun = 0;

  constructor(
    private readonly memento: StateMemento | undefined,
    private readonly now: () => number = () => Date.now(),
    private readonly openExternal: (url: string) => Thenable<boolean> | Promise<boolean> = (url) =>
      vscode.env.openExternal(vscode.Uri.parse(url))
  ) {}

  public getState(): StarPromptPersistedState | undefined {
    return this.memento?.get<StarPromptPersistedState>(STAR_PROMPT_STATE_KEY);
  }

  public async recordSessionOpen(currentVersion?: string): Promise<void> {
    if (!this.memento) {
      return;
    }

    const ts = this.now();
    const prev = this.memento.get<StarPromptPersistedState>(STAR_PROMPT_STATE_KEY);

    if (!prev) {
      await this.memento.update(STAR_PROMPT_STATE_KEY, {
        status: 'pending',
        editCount: 0,
        sessionsCount: 1,
        firstUsedAt: ts,
        lastSessionAt: ts,
        lastSeenVersion: currentVersion,
        promptedCount: 0,
      } satisfies StarPromptPersistedState);
      return;
    }

    let changed = false;
    const next: StarPromptPersistedState = { ...prev };

    if (ts - prev.lastSessionAt >= SESSION_GAP_MS) {
      next.sessionsCount = (prev.sessionsCount || 0) + 1;
      next.lastSessionAt = ts;
      changed = true;
    }

    if (
      currentVersion &&
      prev.lastSeenVersion &&
      prev.lastSeenVersion !== currentVersion &&
      prev.editCount >= MIN_EDITS_AFTER_SNOOZE
    ) {
      this.updatedAfterRealUse = true;
    }

    if (currentVersion && prev.lastSeenVersion !== currentVersion) {
      next.lastSeenVersion = currentVersion;
      changed = true;
    }

    if (changed) {
      await this.memento.update(STAR_PROMPT_STATE_KEY, next);
    }
  }

  /**
   * Records a successful visual design edit and returns true if this is a good,
   * unobtrusive moment to show the GitHub Star prompt (at most once per host session).
   */
  public async recordSuccessfulEdit(): Promise<boolean> {
    if (!this.memento) {
      return false;
    }

    const ts = this.now();
    const prev = this.memento.get<StarPromptPersistedState>(STAR_PROMPT_STATE_KEY);
    const next: StarPromptPersistedState = prev
      ? { ...prev, editCount: (prev.editCount || 0) + 1 }
      : {
          status: 'pending',
          editCount: 1,
          sessionsCount: 1,
          firstUsedAt: ts,
          lastSessionAt: ts,
          promptedCount: 0,
        };

    this.editsThisRun += 1;

    const shouldShow = this.isEligibleToShow(next, ts);
    if (shouldShow) {
      this.shownThisRun = true;
      next.promptedCount = (next.promptedCount || 0) + 1;
    }

    await this.memento.update(STAR_PROMPT_STATE_KEY, next);
    return shouldShow;
  }

  public async handleAction(action: StarPromptAction): Promise<void> {
    const ts = this.now();

    if (action === 'star') {
      await this.openExternal(GITHUB_REPO_URL);
    }

    if (!this.memento) {
      return;
    }

    const prev = this.memento.get<StarPromptPersistedState>(STAR_PROMPT_STATE_KEY);
    const base: StarPromptPersistedState = prev ?? {
      status: 'pending',
      editCount: 0,
      sessionsCount: 1,
      firstUsedAt: ts,
      lastSessionAt: ts,
      promptedCount: 1,
    };

    const next: StarPromptPersistedState = { ...base };
    if (action === 'star') {
      next.status = 'starred';
      next.snoozedUntil = undefined;
    } else if (action === 'dismiss') {
      next.status = 'dismissed';
      next.snoozedUntil = undefined;
    } else {
      next.status = 'snoozed';
      next.snoozedUntil = ts + SNOOZE_DURATION_MS;
      next.snoozeBaseEditCount = base.editCount;
    }

    this.shownThisRun = true;
    await this.memento.update(STAR_PROMPT_STATE_KEY, next);
  }

  private isEligibleToShow(state: StarPromptPersistedState, ts: number): boolean {
    if (this.shownThisRun) {
      return false;
    }
    if (state.status === 'dismissed' || state.status === 'starred') {
      return false;
    }
    if ((state.promptedCount || 0) >= MAX_LIFETIME_PROMPTS) {
      return false;
    }

    if (state.status === 'snoozed') {
      if (state.snoozedUntil !== undefined && ts < state.snoozedUntil) {
        return false;
      }
      const requiredAfterSnooze = (state.snoozeBaseEditCount ?? 0) + MIN_EDITS_AFTER_SNOOZE;
      return state.editCount >= requiredAfterSnooze;
    }

    // Returning user after an extension update
    if (this.updatedAfterRealUse && this.editsThisRun >= MIN_EDITS_AFTER_UPDATE) {
      return true;
    }

    // Multi-session or sustained design session
    if (
      state.editCount >= MIN_EDITS_MULTI_SESSION &&
      (state.sessionsCount >= 2 || ts - state.firstUsedAt >= MIN_USAGE_AGE_MS)
    ) {
      return true;
    }

    // Productive single first session
    if (state.editCount >= MIN_EDITS_SINGLE_SESSION) {
      return true;
    }

    return false;
  }
}
