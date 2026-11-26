// Immutable designer state, undo/redo with coalesced gestures, clipboard and host sync.

import { useSyncExternalStore } from 'react';
import { getControlDefinition } from '../../shared/catalog';
import type { CodeBehindMethod, DesignDocument, DesignerSettings, DesignNode, PropertyValue, ResourceValue } from '../../shared/model';
import type { HostToWebviewMessage, ThemeKind, WebviewToHostMessage } from '../../shared/protocol';
import { autoPlaceCells, computeLayoutTree, getActiveTabIndex, isContainerNode, type LayoutMap } from './layoutEngine';
import { getDock, getLocation, getSize, isRootNode, sizePropertyName } from './nodeProps';
import {
  addTabPage,
  alignSelection,
  ancestorsOf,
  applyAutoSize,
  cloneWithFreshIdentity,
  collectNames,
  createControl,
  defaultEventFor,
  findFreeLocation,
  findNode,
  getNode,
  handlerNameFor,
  insertNodes,
  isMovable,
  propagateAnchors,
  removeNodes,
  reorderZ,
  rewriteControlRefs,
  setNodeRect,
  setProps,
  topLevelIds,
  updateNode,
  updateNodes,
  validateRename,
  walkTree,
  type AlignOp,
  type InsertTarget,
} from './treeOps';

export * from './treeOps';

export type RenderStyle = 'fluent' | 'classic';

export const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const HISTORY_LIMIT = 100;

export const DEFAULT_SETTINGS: DesignerSettings = {
  gridSize: 8,
  layoutMode: 'snaplines',
  showGrid: true,
  renderStyle: 'fluent',
  useThisQualifier: 'auto',
  eventHandlerStyle: 'auto',
};

export type CollectionEditorKind = 'items' | 'columns' | 'tabPages' | 'stripItems' | 'tableLayout' | 'treeNodes' | 'listViewColumns';

export interface DesignerState {
  doc: DesignDocument | null;
  layout: LayoutMap;
  fileName: string;
  codeBehindFileName?: string;
  hasCodeBehind: boolean;
  codeBehindHandlers: CodeBehindMethod[];
  resourceDataUris: Record<string, string>;
  settings: DesignerSettings;
  themeKind: ThemeKind;
  /** Selected node ids; index 0 is the primary selection. */
  selection: string[];
  hoverId: string | null;
  zoom: number;
  tabOrderMode: boolean;
  /** Next TabIndex per container id while in tab-order mode. */
  tabOrderNext: Record<string, number>;
  tabOrderAssigned: string[];
  locked: boolean;
  activeTabs: Record<string, number>;
  placementTool: string | null;
  draggingToolboxType: string | null;
  previewOpen: boolean;
  inlineEditId: string | null;
  collectionEditor: { kind: CollectionEditorKind; nodeId: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Short message for the status line (last action). */
  status: string;
  /** Visual tone of `status` (sync conflicts / rejections use warning or error). */
  statusTone: 'info' | 'warning' | 'error';
  isStandalone: boolean;
  /** True when the host marked the document unsafe to write back visually (`metadata.readOnlyReason`). */
  readOnly: boolean;
  readOnlyReason: string;
  /** GitHub star prompt requested by the host; null when hidden. */
  starPrompt: { repoUrl: string } | null;
}

type Listener = () => void;

interface ClipboardEntry {
  nodes: DesignNode[];
  sourceParentId: string | null;
  pasteCount: number;
}

export class DesignerStore {
  private state: DesignerState;
  private listeners = new Set<Listener>();
  private undoStack: DesignDocument[] = [];
  private redoStack: DesignDocument[] = [];
  private gestureBase: DesignDocument | null = null;
  private clipboard: ClipboardEntry | null = null;
  private pendingImages = new Map<string, { nodeId: string; propertyName: string }>();
  /** Event bindings created optimistically while the host creates / locates the handler method. */
  private pendingBinds = new Map<string, { methodName: string; preBindDoc: DesignDocument; boundDoc: DesignDocument }>();
  /** Host TextDocument version the current document is based on (from init / documentUpdated / applyAck). */
  private documentVersion: number | undefined;
  /** Monotonic counter identifying each applyDocument sent to the host. */
  private revision = 0;
  private layoutCache: { form: DesignNode | null; tabs: Record<string, number> | null; map: LayoutMap } = { form: null, tabs: null, map: new Map() };

  constructor(private readonly send: (msg: WebviewToHostMessage) => void, isStandalone: boolean) {
    this.state = {
      doc: null,
      layout: new Map(),
      fileName: '',
      hasCodeBehind: false,
      codeBehindHandlers: [],
      resourceDataUris: {},
      settings: { ...DEFAULT_SETTINGS },
      themeKind: 'dark',
      selection: [],
      hoverId: null,
      zoom: 1,
      tabOrderMode: false,
      tabOrderNext: {},
      tabOrderAssigned: [],
      locked: false,
      activeTabs: {},
      placementTool: null,
      draggingToolboxType: null,
      previewOpen: false,
      inlineEditId: null,
      collectionEditor: null,
      canUndo: false,
      canRedo: false,
      status: '',
      statusTone: 'info',
      isStandalone,
      readOnly: false,
      readOnlyReason: '',
      starPrompt: null,
    };
  }

  // ---- subscription -------------------------------------------------------

  getState = (): DesignerState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  setState(patch: Partial<DesignerState>) {
    const next = { ...this.state, ...patch };
    const reason = next.doc?.metadata?.readOnlyReason?.trim() ?? '';
    next.readOnly = reason.length > 0;
    next.readOnlyReason = reason;
    if (next.readOnly) {
      // Mutating modes can never be active on a read-only document.
      next.collectionEditor = null;
      next.placementTool = null;
      next.tabOrderMode = false;
      next.inlineEditId = null;
      next.draggingToolboxType = null;
    }
    if (patch.status !== undefined && patch.statusTone === undefined) next.statusTone = 'info';
    if (next.doc && (next.doc.form !== this.layoutCache.form || next.activeTabs !== this.layoutCache.tabs)) {
      this.layoutCache = { form: next.doc.form, tabs: next.activeTabs, map: computeLayoutTree(next.doc.form, { activeTabs: next.activeTabs }) };
    }
    next.layout = this.layoutCache.map;
    next.canUndo = this.undoStack.length > 0;
    next.canRedo = this.redoStack.length > 0;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  post(msg: WebviewToHostMessage) {
    this.send(msg);
  }

  get readOnly(): boolean {
    return this.state.readOnly;
  }

  /** Returns false (and explains why in the status line) when the document cannot be edited. */
  private ensureWritable(): boolean {
    if (!this.state.readOnly) return true;
    this.setState({ status: `Read-only: ${this.state.readOnlyReason}`, statusTone: 'warning' });
    return false;
  }

  /** Sends a document to the host tagged with the base version it was derived from. */
  private sendApply(document: DesignDocument, description: string) {
    this.revision += 1;
    this.send({ type: 'applyDocument', document, description, baseDocumentVersion: this.documentVersion, revision: this.revision });
  }

  // ---- document commits ---------------------------------------------------

  private sanitizeSelection(doc: DesignDocument, sel: string[]): string[] {
    return sel.filter((id) => !!findNode(doc, id));
  }

  /** Commits a new document as one undo step and syncs it to the host. */
  commit(next: DesignDocument, description: string, patch: Partial<DesignerState> = {}) {
    const prev = this.state.doc;
    if (!prev || next === prev) {
      if (Object.keys(patch).length) this.setState(patch);
      return;
    }
    if (!this.ensureWritable()) return;
    const adjusted = propagateAnchors(prev, next, { activeTabs: this.state.activeTabs });
    this.undoStack.push(prev);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    const selection = this.sanitizeSelection(adjusted, patch.selection ?? this.state.selection);
    this.setState({ ...patch, doc: adjusted, selection, status: description });
    this.sendApply(adjusted, description);
  }

  update(fn: (doc: DesignDocument) => DesignDocument, description: string, patch: Partial<DesignerState> = {}) {
    const doc = this.state.doc;
    if (!doc) return;
    this.commit(fn(doc), description, patch);
  }

  beginGesture() {
    if (!this.state.doc || this.state.readOnly) return;
    this.gestureBase = this.state.doc;
  }

  get inGesture(): boolean {
    return this.gestureBase !== null;
  }

  /** Live (60fps) update during a drag; does not touch history or the host. */
  updateGesture(fn: (base: DesignDocument) => DesignDocument) {
    const base = this.gestureBase;
    if (!base) return;
    const next = propagateAnchors(base, fn(base), { activeTabs: this.state.activeTabs });
    this.setState({ doc: next });
  }

  endGesture(description: string, patch: Partial<DesignerState> = {}) {
    const base = this.gestureBase;
    this.gestureBase = null;
    const cur = this.state.doc;
    if (!base || !cur) return;
    if (cur === base || JSON.stringify(cur.form) === JSON.stringify(base.form)) {
      this.setState({ doc: base, ...patch });
      return;
    }
    this.undoStack.push(base);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    const selection = this.sanitizeSelection(cur, patch.selection ?? this.state.selection);
    this.setState({ ...patch, selection, status: description });
    this.sendApply(cur, description);
  }

  cancelGesture() {
    const base = this.gestureBase;
    this.gestureBase = null;
    if (base) this.setState({ doc: base });
  }

  undo() {
    const doc = this.state.doc;
    if (!doc || !this.undoStack.length || !this.ensureWritable()) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(doc);
    this.setState({ doc: prev, selection: this.sanitizeSelection(prev, this.state.selection), status: 'Undo' });
    this.sendApply(prev, 'Undo');
  }

  redo() {
    const doc = this.state.doc;
    if (!doc || !this.redoStack.length || !this.ensureWritable()) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(doc);
    this.setState({ doc: next, selection: this.sanitizeSelection(next, this.state.selection), status: 'Redo' });
    this.sendApply(next, 'Redo');
  }

  // ---- host messages ------------------------------------------------------

  handleHostMessage(msg: HostToWebviewMessage) {
    switch (msg.type) {
      case 'init':
        this.undoStack = [];
        this.redoStack = [];
        this.gestureBase = null;
        this.pendingBinds.clear();
        this.documentVersion = msg.documentVersion ?? msg.document.metadata?.documentVersion;
        this.setState({
          doc: msg.document,
          fileName: msg.fileName,
          codeBehindFileName: msg.codeBehindFileName,
          hasCodeBehind: msg.hasCodeBehind,
          codeBehindHandlers: msg.codeBehindHandlers,
          resourceDataUris: msg.resourceDataUris ?? {},
          settings: { ...DEFAULT_SETTINGS, ...msg.settings },
          themeKind: msg.themeKind,
          selection: [msg.document.form.id],
          activeTabs: {},
          status: 'Loaded',
        });
        break;
      case 'documentUpdated': {
        const old = this.state.doc;
        const version = msg.documentVersion ?? msg.document.metadata?.documentVersion;
        if (version !== undefined) this.documentVersion = version;
        // External edits, conflicts and rejected applies invalidate local history: those snapshots no
        // longer describe the text on disk, and replaying them would clobber the newer edit.
        const reason = msg.reason;
        const discardHistory = msg.source === 'external' || reason === 'external' || reason === 'conflict' || reason === 'rejected';
        if (discardHistory) {
          this.undoStack = [];
          this.redoStack = [];
        }
        // pendingBinds survive: the host may echo the bind's documentUpdated before eventHandlerReady.
        this.gestureBase = null;
        const doc = msg.document;
        const byName = new Map<string, string>();
        walkTree(doc.form, (n) => byName.set(n.name, n.id));
        doc.components.forEach((c) => byName.set(c.name, c.id));
        const selection = this.state.selection
          .map((id) => {
            if (findNode(doc, id)) return id;
            const oldNode = old ? getNode(old, id) : undefined;
            return oldNode ? byName.get(oldNode.name) : undefined;
          })
          .filter((x): x is string => !!x);
        this.setState({
          doc,
          codeBehindHandlers: msg.codeBehindHandlers,
          resourceDataUris: { ...this.state.resourceDataUris, ...msg.resourceDataUris },
          selection: selection.length ? selection : [doc.form.id],
          ...syncStatusFor(msg.source, reason, this.state.status),
        });
        break;
      }
      case 'applyAck':
        if (msg.accepted) {
          this.documentVersion = msg.documentVersion;
        } else {
          // The host follows a rejection with documentUpdated(reason: 'rejected' | 'conflict') carrying
          // the authoritative text; until then make the failure visible.
          if (msg.documentVersion !== undefined) this.documentVersion = msg.documentVersion;
          this.setState({ status: msg.reason ? `Edit rejected — ${msg.reason}` : 'Edit rejected — reverted', statusTone: 'error' });
        }
        break;
      case 'settingsChanged':
        this.setState({ settings: { ...DEFAULT_SETTINGS, ...msg.settings } });
        break;
      case 'themeChanged':
        this.setState({ themeKind: msg.themeKind });
        break;
      case 'imagePicked': {
        const pending = this.pendingImages.get(msg.requestId);
        this.pendingImages.delete(msg.requestId);
        if (!pending || msg.cancelled) return;
        if (msg.error) {
          this.setState({ status: msg.error });
          return;
        }
        if (msg.resource) {
          if (!this.ensureWritable()) return;
          const resource: ResourceValue = msg.resource;
          const uris = msg.dataUri ? { ...this.state.resourceDataUris, [resource.resourceName]: msg.dataUri } : this.state.resourceDataUris;
          this.setState({ resourceDataUris: uris });
          this.update((d) => updateNode(d, pending.nodeId, (n) => setProps(n, { [pending.propertyName]: resource })), `Set ${pending.propertyName}`);
        }
        break;
      }
      case 'eventHandlerReady':
        this.handleEventHandlerReady(msg);
        break;
      case 'showStarPrompt':
        this.setState({ starPrompt: { repoUrl: msg.repoUrl } });
        break;
      case 'command':
        switch (msg.command) {
          case 'undo':
            this.undo();
            break;
          case 'redo':
            this.redo();
            break;
          case 'toggleTabOrder':
            this.toggleTabOrder();
            break;
          case 'toggleGrid':
            this.updateSetting('showGrid', !this.state.settings.showGrid);
            break;
          case 'toggleSnaplines':
            this.updateSetting('layoutMode', this.state.settings.layoutMode === 'snaplines' ? 'grid' : 'snaplines');
            break;
          case 'zoomIn':
            this.zoomStep(1);
            break;
          case 'zoomOut':
            this.zoomStep(-1);
            break;
          case 'zoomReset':
            this.setZoom(1);
            break;
        }
        break;
    }
  }

  /** Hides the star prompt and reports the user's choice to the host. */
  respondToStarPrompt(action: 'star' | 'later' | 'dismiss') {
    this.setState({ starPrompt: null });
    this.send({ type: 'starPromptAction', action });
  }

  // ---- settings / view ----------------------------------------------------

  updateSetting<K extends keyof DesignerSettings>(key: K, value: DesignerSettings[K]) {
    this.setState({ settings: { ...this.state.settings, [key]: value } });
    this.send({ type: 'updateSetting', key, value });
  }

  setZoom(z: number) {
    this.setState({ zoom: Math.min(4, Math.max(0.25, Math.round(z * 100) / 100)) });
  }

  zoomStep(dir: 1 | -1) {
    const z = this.state.zoom;
    const next = dir > 0 ? ZOOM_LEVELS.find((l) => l > z + 0.001) ?? 4 : [...ZOOM_LEVELS].reverse().find((l) => l < z - 0.001) ?? 0.25;
    this.setZoom(next);
  }

  // ---- selection ----------------------------------------------------------

  select(ids: string[], mode: 'replace' | 'toggle' | 'add' = 'replace') {
    const doc = this.state.doc;
    if (!doc) return;
    let sel: string[];
    if (mode === 'replace') sel = ids;
    else if (mode === 'add') sel = [...this.state.selection, ...ids.filter((i) => !this.state.selection.includes(i))];
    else {
      sel = [...this.state.selection];
      for (const id of ids) {
        const i = sel.indexOf(id);
        if (i >= 0) sel.splice(i, 1);
        else sel.push(id);
      }
    }
    sel = sel.filter((id) => !!findNode(doc, id));
    // Reveal selected controls hidden inside inactive tab pages.
    let activeTabs = this.state.activeTabs;
    for (const id of sel.slice(0, 1)) {
      const chain = [...ancestorsOf(doc, id), getNode(doc, id)!];
      chain.forEach((n, i) => {
        if (n?.type === 'TabControl' && chain[i + 1]) {
          const idx = n.children.findIndex((c) => c.id === chain[i + 1].id);
          if (idx >= 0 && (activeTabs[n.id] ?? -1) !== idx) activeTabs = { ...activeTabs, [n.id]: idx };
        }
      });
    }
    this.setState({ selection: sel, activeTabs, inlineEditId: null });
  }

  setPrimary(id: string) {
    const sel = this.state.selection.filter((s) => s !== id);
    this.setState({ selection: [id, ...sel] });
  }

  selectAll() {
    const doc = this.state.doc;
    if (!doc) return;
    const primary = this.state.selection[0];
    const f = primary ? findNode(doc, primary) : null;
    const container = f?.parent ?? doc.form;
    const ids = container.children.map((c) => c.id);
    if (ids.length) this.select(ids);
  }

  selectParent() {
    const doc = this.state.doc;
    const id = this.state.selection[0];
    if (!doc || !id) return;
    const f = findNode(doc, id);
    if (f?.parent) {
      const p = f.parent.type === 'TabPage' && f.parent.children.length === 0 ? f.parent : f.parent;
      this.select([p.id]);
    }
  }

  setActiveTab(tabControlId: string, index: number) {
    this.setState({ activeTabs: { ...this.state.activeTabs, [tabControlId]: index } });
  }

  // ---- editing ------------------------------------------------------------

  /** Resolves where new / pasted controls should go based on the current selection. */
  activeContainerTarget(): InsertTarget {
    const doc = this.state.doc!;
    const id = this.state.selection[0];
    const f = id ? findNode(doc, id) : null;
    if (f && !f.isComponent) {
      let n = f.node;
      if (n.type === 'TabControl') {
        // Same resolution the canvas uses: design-time active tab, else the control's SelectedIndex.
        const page = n.children[getActiveTabIndex(n, { activeTabs: this.state.activeTabs })];
        if (page) return { parentId: page.id };
      }
      if (isContainerNode(n) && n.type !== 'TabControl') return { parentId: n.id, slot: n.type === 'SplitContainer' ? 'Panel1' : undefined };
      if (f.parent) {
        n = f.parent;
        if (n.type === 'TabControl') {
          // A selected TabPage's parent is the TabControl itself; insert into the page (never the TabControl).
          return { parentId: f.node.id };
        }
        return { parentId: n.id, slot: n.type === 'SplitContainer' ? f.node.panelSlot ?? 'Panel1' : undefined };
      }
    }
    return { parentId: doc.form.id };
  }

  addControl(type: string, target?: InsertTarget, rect?: { x: number; y: number; width?: number; height?: number }) {
    const doc = this.state.doc;
    if (!doc) return;
    const def = getControlDefinition(type);
    const t: InsertTarget = { ...(target ?? this.activeContainerTarget()) };
    const parent = getNode(doc, t.parentId) ?? doc.form;
    if (def?.isComponent) {
      const node = createControl(doc, type);
      this.commit(insertNodes(doc, [node], t), `Add ${node.name}`, { selection: [node.id], placementTool: null });
      return;
    }
    const layout = this.state.layout;
    const nl = layout.get(parent.id);
    const slot = nl?.slots?.find((s) => s.slot === (t.slot ?? 'main')) ?? nl?.slots?.[0];
    let location = rect ? { x: rect.x, y: rect.y } : undefined;
    if (!location && slot) {
      location = findFreeLocation(parent, { x: slot.display.x - slot.origin.x + 12, y: slot.display.y - slot.origin.y + 12 });
    }
    const size = rect?.width && rect?.height ? { width: rect.width, height: rect.height } : undefined;
    let node = createControl(doc, type, { location, size, parent });
    if (def?.defaultDock && def.defaultDock !== 'None' && slot) {
      const s = getSize(node);
      node = setNodeRect(node, { x: 0, y: 0, width: def.defaultDock === 'Left' || def.defaultDock === 'Right' ? s.width : slot.display.width, height: s.height });
    }
    if (parent.type === 'TableLayoutPanel') {
      const cell = t.cell;
      if (cell && typeof cell.column === 'number' && typeof cell.row === 'number') {
        // Dropping onto an occupied cell falls back to implicit (next free cell) placement.
        const occupied = [...autoPlaceCells(parent).cells.values()].some(
          (c) => cell.column! >= c.column && cell.column! < c.column + c.columnSpan && cell.row! >= c.row && cell.row! < c.row + c.rowSpan
        );
        t.cell = occupied ? undefined : { ...cell, explicit: true };
      } else {
        t.cell = undefined;
      }
    }
    this.commit(insertNodes(doc, [node], t), `Add ${node.name}`, { selection: [node.id], placementTool: null });
  }

  deleteSelection() {
    const doc = this.state.doc;
    if (!doc) return;
    const ids = this.state.selection.filter((id) => id !== doc.form.id);
    if (!ids.length) return;
    const f = findNode(doc, ids[0]);
    const parentId = f?.parent?.id ?? doc.form.id;
    this.commit(removeNodes(doc, ids), ids.length === 1 ? `Delete ${f?.node.name}` : `Delete ${ids.length} controls`, { selection: [parentId] });
  }

  copySelection(cut = false) {
    const doc = this.state.doc;
    if (!doc) return;
    const ids = topLevelIds(doc, this.state.selection.filter((id) => id !== doc.form.id));
    if (!ids.length) return;
    const nodes = ids.map((id) => getNode(doc, id)!).filter(Boolean);
    const f = findNode(doc, ids[0]);
    this.clipboard = { nodes: JSON.parse(JSON.stringify(nodes)) as DesignNode[], sourceParentId: f?.parent?.id ?? null, pasteCount: 0 };
    try {
      void navigator.clipboard?.writeText(nodes.map((n) => n.name).join('\n'));
    } catch {
      /* clipboard may be unavailable */
    }
    if (cut) this.commit(removeNodes(doc, ids), `Cut ${ids.length === 1 ? nodes[0].name : `${ids.length} controls`}`, { selection: [f?.parent?.id ?? doc.form.id] });
    else this.setState({ status: `Copied ${nodes.length === 1 ? nodes[0].name : `${nodes.length} controls`}` });
  }

  get hasClipboard(): boolean {
    return !!this.clipboard?.nodes.length;
  }

  paste() {
    const doc = this.state.doc;
    const clip = this.clipboard;
    if (!doc || !clip) return;
    const target = this.activeContainerTarget();
    clip.pasteCount += 1;
    this.pasteNodes(clip.nodes, target, clip.sourceParentId === target.parentId ? 12 * clip.pasteCount : 0, 'Paste');
  }

  duplicateSelection() {
    const doc = this.state.doc;
    if (!doc) return;
    const ids = topLevelIds(doc, this.state.selection.filter((id) => id !== doc.form.id));
    if (!ids.length) return;
    const f = findNode(doc, ids[0]);
    const nodes = ids.map((id) => getNode(doc, id)!).filter(Boolean);
    const target: InsertTarget = f?.isComponent ? { parentId: doc.form.id } : { parentId: f?.parent?.id ?? doc.form.id, slot: f?.node.panelSlot };
    this.pasteNodes(nodes, target, 12, 'Duplicate');
  }

  private pasteNodes(nodes: DesignNode[], target: InsertTarget, offset: number, verb: string) {
    const doc = this.state.doc!;
    const taken = collectNames(doc);
    const parent = getNode(doc, target.parentId);
    const clones = nodes.map((n) => {
      let c = cloneWithFreshIdentity(doc, n, taken);
      if (!c.isComponent && getDock(c) === 'None') {
        const loc = getLocation(c);
        c = setNodeRect(c, { x: loc.x + offset, y: loc.y + offset });
      }
      if (!c.isComponent && parent && parent.type !== 'SplitContainer') delete c.panelSlot;
      return c;
    });
    this.commit(insertNodes(doc, clones, target), `${verb} ${clones.length === 1 ? clones[0].name : `${clones.length} controls`}`, {
      selection: clones.map((c) => c.id),
    });
  }

  align(op: AlignOp) {
    const doc = this.state.doc;
    if (!doc) return;
    this.commit(alignSelection(doc, this.state.selection, op, this.state.layout), labelForAlign(op));
  }

  zOrder(where: 'front' | 'back') {
    const doc = this.state.doc;
    if (!doc) return;
    this.commit(reorderZ(doc, this.state.selection.filter((id) => id !== doc.form.id), where), where === 'front' ? 'Bring to Front' : 'Send to Back');
  }

  /** Moves (and optionally resizes) the selection by a delta, e.g. arrow-key nudge. */
  nudge(dx: number, dy: number, resize: boolean) {
    const doc = this.state.doc;
    if (!doc || this.state.locked) return;
    const ids = this.state.selection.filter((id) => id !== doc.form.id && (resize || isMovable(doc, id, this.state.layout)));
    if (!ids.length) {
      if (resize && this.state.selection[0] === doc.form.id) {
        const s = getSize(doc.form);
        this.commit(updateNode(doc, doc.form.id, (n) => setNodeRect(n, { width: s.width + dx, height: s.height + dy })), 'Resize form');
      }
      return;
    }
    this.commit(
      updateNodes(doc, ids, (n) => {
        if (resize) {
          const s = getSize(n);
          return setNodeRect(n, { width: Math.max(1, s.width + dx), height: Math.max(1, s.height + dy) });
        }
        const l = getLocation(n);
        return setNodeRect(n, { x: l.x + dx, y: l.y + dy });
      }),
      resize ? 'Resize' : 'Move'
    );
  }

  setProperty(ids: string[], name: string, value: PropertyValue | undefined, description?: string) {
    const doc = this.state.doc;
    if (!doc || !ids.length) return;
    if (name === 'Name') {
      if (ids.length !== 1 || typeof value !== 'string') return;
      this.rename(ids[0], value);
      return;
    }
    let next = updateNodes(doc, ids, (n) => {
      let propName = name;
      if (name === 'Size' && n.type === 'Form') propName = sizePropertyName(n);
      let out = setProps(n, { [propName]: value });
      // A Form's size is authored as ClientSize; drop a conflicting outer Size once ClientSize is set.
      if (n.type === 'Form' && propName === 'ClientSize' && value !== undefined && out.properties.Size) out = setProps(out, { Size: undefined });
      if (name === 'Dock') {
        // Keep the control where it was visually when undocking.
        const nl = this.state.layout.get(n.id);
        if (nl && (value === undefined || (typeof value === 'object' && 'value' in value && value.value === 'None'))) {
          out = setNodeRect(out, { x: nl.rel.x, y: nl.rel.y, width: nl.rel.width, height: nl.rel.height });
        }
      }
      if (name === 'Text' || name === 'Font' || name === 'AutoSize') {
        const f = findNode(doc, n.id);
        out = applyAutoSize(out, f?.parent);
      }
      return out;
    });
    if (name === 'SelectedIndex') {
      const at = { ...this.state.activeTabs };
      ids.forEach((id) => delete at[id]);
      this.setState({ activeTabs: at });
    }
    if (next === doc) return;
    this.commit(next, description ?? `Set ${name}`);
  }

  rename(id: string, newName: string): string | null {
    const doc = this.state.doc;
    if (!doc) return 'No document';
    const node = getNode(doc, id);
    if (!node || node.name === newName.trim()) return null;
    const err = validateRename(doc, id, newName);
    if (err) {
      this.setState({ status: err });
      this.send({ type: 'showMessage', level: 'warning', message: err });
      return err;
    }
    const name = newName.trim();
    const renamed = updateNode(doc, id, (n) => {
      const out = { ...n, name };
      if (getStringText(n) === n.name && !isRootNode(n) && ['TabPage', 'MenuStrip', 'ToolStrip', 'StatusStrip'].includes(n.type)) return applyAutoSize(setProps(out, { Text: name }));
      return out;
    });
    this.commit(rewriteControlRefs(renamed, node.name, name), `Rename ${node.name} to ${name}`);
    return null;
  }

  addTabPage(tabControlId: string) {
    const doc = this.state.doc;
    if (!doc) return;
    const { doc: next, pageId } = addTabPage(doc, tabControlId);
    const tc = getNode(next, tabControlId);
    const idx = tc ? tc.children.length - 1 : 0;
    this.commit(next, 'Add Tab', { activeTabs: { ...this.state.activeTabs, [tabControlId]: idx }, selection: pageId ? [pageId] : this.state.selection });
  }

  removeTabPage(tabControlId: string) {
    const doc = this.state.doc;
    const tc = doc ? getNode(doc, tabControlId) : undefined;
    if (!doc || !tc || tc.children.length === 0) return;
    const idx = Math.min(this.state.activeTabs[tabControlId] ?? 0, tc.children.length - 1);
    const page = tc.children[idx];
    this.commit(removeNodes(doc, [page.id]), `Remove ${page.name}`, {
      activeTabs: { ...this.state.activeTabs, [tabControlId]: Math.max(0, idx - 1) },
      selection: [tabControlId],
    });
  }

  // ---- events / code navigation --------------------------------------------

  navigateToEvent(nodeId: string, eventName: string, createIfMissing = true) {
    const doc = this.state.doc;
    if (!doc) return;
    const node = getNode(doc, nodeId);
    if (!node) return;
    let methodName = node.events[eventName];
    if (!methodName && !createIfMissing) return;
    if (!methodName) {
      // Binding a new handler edits the designer file; a read-only document only allows navigation.
      if (!this.ensureWritable()) return;
      methodName = handlerNameFor(doc, node, eventName);
      const bound = methodName;
      this.commit(updateNode(doc, nodeId, (n) => ({ ...n, events: { ...n.events, [eventName]: bound } })), `Bind ${eventName}`);
      const boundDoc = this.state.doc;
      if (boundDoc && boundDoc !== doc) this.pendingBinds.set(`${nodeId}\u0000${eventName}`, { methodName, preBindDoc: doc, boundDoc });
    }
    this.send({
      type: 'navigateToEvent',
      nodeId,
      controlName: node.name,
      controlType: node.type,
      eventName,
      methodName,
      createIfMissing,
    });
  }

  private handleEventHandlerReady(msg: Extract<HostToWebviewMessage, { type: 'eventHandlerReady' }>) {
    const key = `${msg.nodeId}\u0000${msg.eventName}`;
    const pending = this.pendingBinds.get(key);
    this.pendingBinds.delete(key);
    if (msg.success !== false) {
      this.setState({ codeBehindHandlers: msg.codeBehindHandlers });
      return;
    }
    const error = msg.error || `Could not create event handler ${msg.methodName}`;
    const doc = this.state.doc;
    if (pending && doc && pending.methodName === msg.methodName) {
      if (doc === pending.boundDoc && this.undoStack[this.undoStack.length - 1] === pending.preBindDoc) {
        // Nothing else happened since the optimistic bind: drop it from history entirely.
        this.undoStack.pop();
        this.setState({ doc: pending.preBindDoc, codeBehindHandlers: msg.codeBehindHandlers, status: error, statusTone: 'error' });
        this.sendApply(pending.preBindDoc, `Unbind ${msg.eventName}`);
        return;
      }
      const node = getNode(doc, msg.nodeId);
      if (node && node.events[msg.eventName] === msg.methodName && !this.state.readOnly) {
        this.commit(
          updateNode(doc, msg.nodeId, (n) => {
            const events = { ...n.events };
            delete events[msg.eventName];
            return { ...n, events };
          }),
          `Unbind ${msg.eventName}`
        );
      }
    }
    this.setState({ codeBehindHandlers: msg.codeBehindHandlers, status: error, statusTone: 'error' });
  }

  navigateToDefaultEvent(nodeId: string) {
    const doc = this.state.doc;
    const node = doc ? getNode(doc, nodeId) : undefined;
    if (!node) return;
    this.navigateToEvent(nodeId, defaultEventFor(node), true);
  }

  setEventHandler(ids: string[], eventName: string, methodName: string | undefined) {
    const doc = this.state.doc;
    if (!doc) return;
    this.commit(
      updateNodes(doc, ids, (n) => {
        const events = { ...n.events };
        if (methodName) events[eventName] = methodName;
        else delete events[eventName];
        return { ...n, events };
      }),
      methodName ? `Bind ${eventName}` : `Unbind ${eventName}`
    );
  }

  // ---- images ---------------------------------------------------------------

  pickImage(nodeId: string, propertyName: string, acceptIcon = false) {
    const doc = this.state.doc;
    const node = doc ? getNode(doc, nodeId) : undefined;
    if (!node || !this.ensureWritable()) return;
    const requestId = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    this.pendingImages.set(requestId, { nodeId, propertyName });
    this.send({ type: 'pickImage', requestId, nodeId, controlName: node.name, propertyName, acceptIcon });
  }

  /**
   * Clears an image property non-destructively: the property (and its raw C# expression) is removed
   * from the node only. The .resx entry is left alone so Undo restores the exact ResourceValue and
   * other controls sharing the resource keep working; the host prunes unreferenced entries on save.
   */
  clearImage(nodeId: string, propertyName: string) {
    const doc = this.state.doc;
    const node = doc ? getNode(doc, nodeId) : undefined;
    if (!node || node.properties[propertyName] === undefined) return;
    this.update((d) => updateNode(d, nodeId, (n) => setProps(n, { [propertyName]: undefined })), `Clear ${propertyName}`);
  }

  // ---- tab order ------------------------------------------------------------

  toggleTabOrder(on?: boolean) {
    const active = on ?? !this.state.tabOrderMode;
    if (active && !this.ensureWritable()) return;
    this.setState({ tabOrderMode: active, tabOrderNext: {}, tabOrderAssigned: [], placementTool: null });
  }

  assignTabIndex(nodeId: string) {
    const doc = this.state.doc;
    if (!doc) return;
    const f = findNode(doc, nodeId);
    if (!f?.parent) return;
    const key = f.parent.id;
    const index = this.state.tabOrderNext[key] ?? 0;
    this.commit(updateNode(doc, nodeId, (n) => setProps(n, { TabIndex: index })), `TabIndex ${f.node.name} = ${index}`, {
      tabOrderNext: { ...this.state.tabOrderNext, [key]: index + 1 },
      tabOrderAssigned: [...this.state.tabOrderAssigned.filter((i) => i !== nodeId), nodeId],
    });
  }

  /** Tab / Shift+Tab: moves selection along TabIndex order among siblings. */
  cycleSelection(dir: 1 | -1) {
    const doc = this.state.doc;
    if (!doc) return;
    const order: DesignNode[] = [];
    const rec = (n: DesignNode) => {
      const kids = [...n.children].sort((a, b) => num(a, 'TabIndex') - num(b, 'TabIndex'));
      for (const k of kids) {
        order.push(k);
        rec(k);
      }
    };
    rec(doc.form);
    if (!order.length) return;
    const cur = order.findIndex((n) => n.id === this.state.selection[0]);
    const next = order[(cur + dir + order.length) % order.length] ?? order[0];
    this.select([next.id]);
  }
}

function syncStatusFor(
  source: 'external' | 'host',
  reason: 'external' | 'undo' | 'redo' | 'conflict' | 'rejected' | undefined,
  current: string
): Pick<DesignerState, 'status' | 'statusTone'> {
  switch (reason) {
    case 'conflict':
      return { status: 'Synced external edit — your last change conflicted and was reverted', statusTone: 'warning' };
    case 'rejected':
      return { status: 'Edit rejected — reverted', statusTone: 'error' };
    case 'undo':
      return { status: 'Undo (from editor)', statusTone: 'info' };
    case 'redo':
      return { status: 'Redo (from editor)', statusTone: 'info' };
    case 'external':
      return { status: 'Synced external edit', statusTone: 'info' };
  }
  return source === 'external' ? { status: 'Synced external edit', statusTone: 'info' } : { status: current, statusTone: 'info' };
}

function num(n: DesignNode, p: string): number {
  const v = n.properties[p];
  return typeof v === 'number' ? v : 0;
}

function getStringText(n: DesignNode): string {
  const v = n.properties.Text;
  return typeof v === 'string' ? v : '';
}

export function labelForAlign(op: AlignOp): string {
  const map: Record<AlignOp, string> = {
    alignLeft: 'Align Lefts',
    alignCenter: 'Align Centers',
    alignRight: 'Align Rights',
    alignTop: 'Align Tops',
    alignMiddle: 'Align Middles',
    alignBottom: 'Align Bottoms',
    sameWidth: 'Make Same Width',
    sameHeight: 'Make Same Height',
    sameSize: 'Make Same Size',
    spaceHorizontally: 'Make Horizontal Spacing Equal',
    spaceVertically: 'Make Vertical Spacing Equal',
    centerHorizontally: 'Center Horizontally',
    centerVertically: 'Center Vertically',
  };
  return map[op];
}

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------

let storeSingleton: DesignerStore | null = null;

export function setStore(store: DesignerStore) {
  storeSingleton = store;
}

export function getStore(): DesignerStore {
  if (!storeSingleton) throw new Error('Designer store not initialised');
  return storeSingleton;
}

export function useDesigner(): DesignerState {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
