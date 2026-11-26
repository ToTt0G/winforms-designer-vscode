import * as assert from 'node:assert/strict';
import Module from 'node:module';
import { after, describe, it } from 'node:test';

// Minimal vscode mock so importing starPrompt.ts does not require the VS Code host
const mockVscode = {
  Uri: {
    parse: (raw: string) => ({ toString: () => raw }),
  },
  env: {
    openExternal: async () => true,
  },
};

const moduleInternal = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleInternal._load;
moduleInternal._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === 'vscode') return mockVscode;
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const starMod = require('../../src/extension/starPrompt') as typeof import('../../src/extension/starPrompt');

after(() => {
  moduleInternal._load = originalLoad;
});

function createMemoryMemento() {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    async update(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  };
}

describe('StarPromptController', () => {
  it('stays quiet during initial edits and triggers on the 12th edit of a productive first session', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const opened: string[] = [];
    const ctrl = new starMod.StarPromptController(
      memento,
      () => clock,
      async (url) => {
        opened.push(url);
        return true;
      }
    );

    await ctrl.recordSessionOpen('1.0.1');

    for (let i = 1; i < starMod.MIN_EDITS_SINGLE_SESSION; i++) {
      assert.equal(await ctrl.recordSuccessfulEdit(), false, `should not prompt on edit #${i}`);
    }

    assert.equal(await ctrl.recordSuccessfulEdit(), true, 'should prompt on 12th edit');
    // Never prompts a second time in the same host run
    assert.equal(await ctrl.recordSuccessfulEdit(), false);
    assert.equal(opened.length, 0);
  });

  it('triggers after 6 edits across 2 sessions separated by >= 30 minutes', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const ctrl1 = new starMod.StarPromptController(memento, () => clock, async () => true);

    await ctrl1.recordSessionOpen('1.0.1');
    for (let i = 0; i < 4; i++) {
      assert.equal(await ctrl1.recordSuccessfulEdit(), false);
    }

    // Advance 35 minutes and simulate a new VS Code session
    clock += 35 * 60 * 1000;
    const ctrl2 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl2.recordSessionOpen('1.0.1');
    assert.equal(await ctrl2.recordSuccessfulEdit(), false); // 5th total edit
    assert.equal(await ctrl2.recordSuccessfulEdit(), true); // 6th total edit across 2 sessions
  });

  it('opens GitHub and permanently suppresses future prompts when user clicks Star', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const opened: string[] = [];
    const ctrl = new starMod.StarPromptController(
      memento,
      () => clock,
      async (url) => {
        opened.push(url);
        return true;
      }
    );

    await ctrl.handleAction('star');
    assert.deepEqual(opened, [starMod.GITHUB_REPO_URL]);
    assert.equal(ctrl.getState()?.status, 'starred');

    // Even after 30 days and 20 edits in a fresh session, never prompts again
    clock += 30 * 24 * 60 * 60 * 1000;
    const ctrlNext = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrlNext.recordSessionOpen('1.0.2');
    for (let i = 0; i < 20; i++) {
      assert.equal(await ctrlNext.recordSuccessfulEdit(), false);
    }
  });

  it('permanently suppresses prompts on dismiss', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const ctrl = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl.handleAction('dismiss');
    assert.equal(ctrl.getState()?.status, 'dismissed');

    clock += 60 * 24 * 60 * 60 * 1000;
    const ctrlNext = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrlNext.recordSessionOpen('1.0.2');
    for (let i = 0; i < 20; i++) {
      assert.equal(await ctrlNext.recordSuccessfulEdit(), false);
    }
  });

  it('snoozes for 14 days and requires 5 fresh edits on Later, and respects after-update engagement', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const ctrl1 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl1.recordSessionOpen('1.0.0');
    for (let i = 0; i < 12; i++) {
      await ctrl1.recordSuccessfulEdit();
    }
    await ctrl1.handleAction('later');
    assert.equal(ctrl1.getState()?.status, 'snoozed');

    // 7 days later: still snoozed
    clock += 7 * 24 * 60 * 60 * 1000;
    const ctrl2 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl2.recordSessionOpen('1.0.1');
    for (let i = 0; i < 10; i++) {
      assert.equal(await ctrl2.recordSuccessfulEdit(), false);
    }

    // 15 days after snooze: needs 5 fresh edits (note ctrl2 already added 10, so next edit passes)
    clock += 8 * 24 * 60 * 60 * 1000;
    const ctrl3 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl3.recordSessionOpen('1.0.1');
    assert.equal(await ctrl3.recordSuccessfulEdit(), true);
  });

  it('prompts returning users after an extension update once they make 2 edits', async () => {
    const memento = createMemoryMemento();
    let clock = 1_700_000_000_000;
    const ctrl1 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl1.recordSessionOpen('1.0.0');
    for (let i = 0; i < 5; i++) {
      assert.equal(await ctrl1.recordSuccessfulEdit(), false);
    }

    // User updates to 1.0.1 in a new run
    const ctrl2 = new starMod.StarPromptController(memento, () => clock, async () => true);
    await ctrl2.recordSessionOpen('1.0.1');
    assert.equal(await ctrl2.recordSuccessfulEdit(), false);
    assert.equal(await ctrl2.recordSuccessfulEdit(), true);
  });

  it('gracefully no-ops when globalState memento is unavailable', async () => {
    const ctrl = new starMod.StarPromptController(undefined);
    await ctrl.recordSessionOpen('1.0.1');
    assert.equal(await ctrl.recordSuccessfulEdit(), false);
  });
});
