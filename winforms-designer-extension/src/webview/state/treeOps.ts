// Pure, immutable tree operations on DesignDocument: lookup, naming, insertion,
// deletion, cloning, reparenting, z-order, collections, alignment, anchors.

import { getControlDefinition } from '../../shared/catalog';
import type {
  DataGridViewColumnNode,
  DesignDocument,
  DesignNode,
  ListViewColumnNode,
  PropertyValue,
  StripItemNode,
  TableCellPosition,
  TableTrackStyle,
  TreeNodeItem,
} from '../../shared/model';
import {
  computeContainerLayout,
  computeLayoutTree,
  isContainerNode,
  type LayoutMap,
  type LayoutOptions,
  type SlotName,
} from './layoutEngine';
import {
  clampSize,
  getAnchor,
  getBool,
  getDock,
  getFont,
  getLocation,
  getNumber,
  getSize,
  getText,
  displayText,
  isRootNode,
  measureText,
  sizeProp,
  sizePropertyName,
  type Rect,
} from './nodeProps';

let idCounter = 0;
export function uid(prefix = 'n'): string {
  idCounter += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rnd}`;
}

export function deepClone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface FoundNode {
  node: DesignNode;
  parent: DesignNode | null;
  index: number;
  isComponent: boolean;
}

export function findNode(doc: DesignDocument, id: string): FoundNode | null {
  if (doc.form.id === id) return { node: doc.form, parent: null, index: 0, isComponent: false };
  const stack: DesignNode[] = [doc.form];
  while (stack.length) {
    const n = stack.pop()!;
    for (let i = 0; i < n.children.length; i++) {
      const c = n.children[i];
      if (c.id === id) return { node: c, parent: n, index: i, isComponent: false };
      stack.push(c);
    }
  }
  const ci = doc.components.findIndex((c) => c.id === id);
  if (ci >= 0) return { node: doc.components[ci], parent: null, index: ci, isComponent: true };
  return null;
}

export function getNode(doc: DesignDocument, id: string): DesignNode | undefined {
  return findNode(doc, id)?.node;
}

export function walkTree(node: DesignNode, fn: (n: DesignNode, parent: DesignNode | null, depth: number) => void, parent: DesignNode | null = null, depth = 0) {
  fn(node, parent, depth);
  for (const c of node.children) walkTree(c, fn, node, depth + 1);
}

export function allNodes(doc: DesignDocument): DesignNode[] {
  const out: DesignNode[] = [];
  walkTree(doc.form, (n) => out.push(n));
  out.push(...doc.components);
  return out;
}

export function ancestorsOf(doc: DesignDocument, id: string): DesignNode[] {
  const path: DesignNode[] = [];
  const rec = (n: DesignNode): boolean => {
    if (n.id === id) return true;
    for (const c of n.children) {
      if (rec(c)) {
        path.unshift(n);
        return true;
      }
    }
    return false;
  };
  rec(doc.form);
  return path;
}

export function isDescendantOf(doc: DesignDocument, id: string, ancestorId: string): boolean {
  return ancestorsOf(doc, id).some((a) => a.id === ancestorId);
}

/** Removes ids whose ancestor is also in the list (keeps top-level selections only). */
export function topLevelIds(doc: DesignDocument, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => !ancestorsOf(doc, id).some((a) => set.has(a.id)));
}

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function mapTree(node: DesignNode, fn: (n: DesignNode) => DesignNode): DesignNode {
  let changed = false;
  const kids = node.children.map((c) => {
    const nc = mapTree(c, fn);
    if (nc !== c) changed = true;
    return nc;
  });
  const base = changed ? { ...node, children: kids } : node;
  return fn(base);
}

export function updateNodes(doc: DesignDocument, ids: Iterable<string>, fn: (n: DesignNode) => DesignNode): DesignDocument {
  const set = new Set(ids);
  if (set.size === 0) return doc;
  const form = mapTree(doc.form, (n) => (set.has(n.id) ? fn(n) : n));
  let compsChanged = false;
  const components = doc.components.map((c) => {
    if (!set.has(c.id)) return c;
    compsChanged = true;
    return fn(c);
  });
  if (form === doc.form && !compsChanged) return doc;
  return { ...doc, form, components: compsChanged ? components : doc.components };
}

export function updateNode(doc: DesignDocument, id: string, fn: (n: DesignNode) => DesignNode): DesignDocument {
  return updateNodes(doc, [id], fn);
}

function samePropertyValue(a: PropertyValue | undefined, b: PropertyValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies a property patch. Any property whose value actually changes loses its preserved raw C#
 * expression so the generator serializes the designer's new value instead of the stale literal.
 */
export function setProps(node: DesignNode, patch: Record<string, PropertyValue | undefined>): DesignNode {
  const properties = { ...node.properties };
  let raw = node.rawPropertyExpressions;
  for (const [k, v] of Object.entries(patch)) {
    const changed = !samePropertyValue(node.properties[k], v);
    if (v === undefined) delete properties[k];
    else properties[k] = v;
    if (changed && raw && k in raw) {
      if (raw === node.rawPropertyExpressions) raw = { ...raw };
      delete raw[k];
    }
  }
  const out: DesignNode = { ...node, properties };
  if (raw !== node.rawPropertyExpressions) {
    if (raw && Object.keys(raw).length) out.rawPropertyExpressions = raw;
    else delete out.rawPropertyExpressions;
  }
  return out;
}

export function setNodeRect(node: DesignNode, rect: Partial<Rect>): DesignNode {
  const loc = getLocation(node);
  const size = getSize(node);
  const patch: Record<string, PropertyValue> = {};
  if (rect.x !== undefined || rect.y !== undefined) {
    const x = Math.round(rect.x ?? loc.x);
    const y = Math.round(rect.y ?? loc.y);
    if (x !== loc.x || y !== loc.y || !node.properties.Location) patch.Location = { kind: 'point', x, y };
  }
  if (rect.width !== undefined || rect.height !== undefined) {
    const w = Math.max(0, Math.round(rect.width ?? size.width));
    const h = Math.max(0, Math.round(rect.height ?? size.height));
    if (w !== size.width || h !== size.height || !node.properties[sizePropertyName(node)]) patch[sizePropertyName(node)] = sizeProp(w, h);
  }
  if (!Object.keys(patch).length) return node;
  // Forms are sized by ClientSize; an outer Size left beside it would fight the new value on load.
  const out = setProps(node, patch);
  return node.type === 'Form' && patch.ClientSize && out.properties.Size ? setProps(out, { Size: undefined }) : out;
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const CSHARP_KEYWORDS = new Set(
  'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(
    ' '
  )
);

export function collectNames(doc: DesignDocument, excludeId?: string): Set<string> {
  const names = new Set<string>();
  // Hand-written / preserved field declarations also occupy C# member names.
  let excludedName: string | undefined;
  if (excludeId) {
    const ex = findNamedEntity(doc, excludeId);
    excludedName = ex?.name;
  }
  for (const field of Object.keys(doc.metadata?.existingFieldDeclarations ?? {})) {
    if (field !== excludedName) names.add(field);
  }
  const addStrip = (items: StripItemNode[] | undefined) => {
    for (const it of items ?? []) {
      if (it.id !== excludeId) names.add(it.name);
      addStrip(it.dropDownItems);
    }
  };
  const addNode = (n: DesignNode) => {
    if (n.id !== excludeId) names.add(n.name);
    addStrip(n.stripItems);
    for (const c of n.columns ?? []) if (c.id !== excludeId) names.add(c.name);
    for (const c of n.listViewColumns ?? []) if (c.id !== excludeId) names.add(c.name);
  };
  walkTree(doc.form, addNode);
  doc.components.forEach(addNode);
  names.add(doc.className);
  return names;
}

/** Finds any named designer entity (control, component, strip item, grid / list-view column) by id. */
function findNamedEntity(doc: DesignDocument, id: string): { name: string } | undefined {
  let hit: { name: string } | undefined;
  const scanStrip = (items: StripItemNode[] | undefined) => {
    for (const it of items ?? []) {
      if (hit) return;
      if (it.id === id) hit = it;
      else scanStrip(it.dropDownItems);
    }
  };
  const scan = (n: DesignNode) => {
    if (hit) return;
    if (n.id === id) {
      hit = n;
      return;
    }
    scanStrip(n.stripItems);
    hit ??= n.columns?.find((c) => c.id === id) ?? n.listViewColumns?.find((c) => c.id === id);
  };
  walkTree(doc.form, scan);
  doc.components.forEach(scan);
  return hit;
}

/**
 * Reserves `base` itself when free (Visual Studio's first-instance naming, e.g. `fileToolStripMenuItem`),
 * otherwise the first free `base1`, `base2`… The returned name is added to `taken`.
 */
export function reserveExactOrNumberedName(doc: DesignDocument, base: string, taken: Set<string>): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '') || 'item';
  if (!taken.has(clean) && isValidIdentifier(clean)) {
    taken.add(clean);
    return clean;
  }
  return generateUniqueName(doc, clean, taken);
}

export function generateUniqueName(doc: DesignDocument, prefix: string, taken?: Set<string>): string {
  const names = taken ?? collectNames(doc);
  const base = prefix.replace(/[^A-Za-z0-9_]/g, '') || 'control';
  for (let i = 1; i < 100000; i++) {
    const candidate = `${base}${i}`;
    if (!names.has(candidate)) {
      names.add(candidate);
      return candidate;
    }
  }
  return `${base}_${uid('x')}`;
}

export function isValidIdentifier(name: string): boolean {
  if (!/^@?[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  if (!name.startsWith('@') && CSHARP_KEYWORDS.has(name)) return false;
  return true;
}

/** Returns an error message or null when `newName` is a valid, unique identifier. */
export function validateRename(doc: DesignDocument, id: string, newName: string): string | null {
  const name = newName.trim();
  if (!name) return 'Name cannot be empty.';
  if (!isValidIdentifier(name)) return `"${name}" is not a valid C# identifier.`;
  if (collectNames(doc, id).has(name)) return `A member named "${name}" already exists.`;
  return null;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

const TEXT_DEFAULT_TYPES = new Set([
  'Button',
  'Label',
  'LinkLabel',
  'CheckBox',
  'RadioButton',
  'GroupBox',
  'TabPage',
  'MenuStrip',
  'ToolStrip',
  'StatusStrip',
  'BindingNavigator',
]);

export function nextTabIndex(parent: DesignNode): number {
  let max = -1;
  for (const c of parent.children) max = Math.max(max, getNumber(c, 'TabIndex', -1));
  return max + 1;
}

export function createTabPage(doc: DesignDocument, taken: Set<string>, index: number): DesignNode {
  const def = getControlDefinition('TabPage');
  const name = generateUniqueName(doc, 'tabPage', taken);
  return {
    id: uid('tp'),
    name,
    type: 'TabPage',
    fullTypeName: def?.fullTypeName ?? 'System.Windows.Forms.TabPage',
    properties: {
      ...deepClone(def?.defaultProperties ?? {}),
      Text: name,
      TabIndex: index,
      Location: { kind: 'point', x: 4, y: 24 },
      Size: sizeProp(def?.defaultSize.width ?? 272, def?.defaultSize.height ?? 154),
    },
    events: {},
    children: [],
  };
}

export function createControl(
  doc: DesignDocument,
  type: string,
  opts: { location?: { x: number; y: number }; size?: { width: number; height: number }; parent?: DesignNode; taken?: Set<string> } = {}
): DesignNode {
  const def = getControlDefinition(type);
  const taken = opts.taken ?? collectNames(doc);
  const prefix = def?.namePrefix ?? type.charAt(0).toLowerCase() + type.slice(1);
  const name = generateUniqueName(doc, prefix, taken);
  const properties: Record<string, PropertyValue> = deepClone(def?.defaultProperties ?? {});
  const node: DesignNode = {
    id: uid(def?.isComponent ? 'c' : 'n'),
    name,
    type: def?.type ?? type,
    fullTypeName: def?.fullTypeName ?? type,
    isUnknownType: !def,
    isComponent: !!def?.isComponent,
    properties,
    events: {},
    children: [],
  };
  if (def?.isComponent) {
    if (def.takesComponentsArg || ['Timer', 'ImageList', 'ToolTip', 'NotifyIcon', 'ErrorProvider', 'ContextMenuStrip', 'BindingSource', 'HelpProvider'].includes(def.type)) {
      node.constructorArgs = 'this.components';
    }
    if (def.type === 'ContextMenuStrip') node.stripItems = [];
    return node;
  }
  const size = opts.size ?? def?.defaultSize ?? { width: 100, height: 23 };
  properties.Location = { kind: 'point', x: Math.round(opts.location?.x ?? 12), y: Math.round(opts.location?.y ?? 12) };
  properties.Size = sizeProp(Math.max(size.width, 1), Math.max(size.height, 1));
  if (TEXT_DEFAULT_TYPES.has(node.type)) properties.Text = name;
  if (node.type !== 'TabPage') properties.TabIndex = opts.parent ? nextTabIndex(opts.parent) : 0;
  switch (node.type) {
    case 'TabControl':
      node.children = [createTabPage(doc, taken, 0), createTabPage(doc, taken, 1)];
      break;
    case 'TableLayoutPanel':
      node.tableLayout = {
        columnStyles: [
          { sizeType: 'Percent', value: 50 },
          { sizeType: 'Percent', value: 50 },
        ],
        rowStyles: [
          { sizeType: 'Percent', value: 50 },
          { sizeType: 'Percent', value: 50 },
        ],
      };
      break;
    case 'MenuStrip':
    case 'ToolStrip':
    case 'StatusStrip':
      node.stripItems = [];
      break;
    case 'DataGridView':
      node.columns = [];
      break;
    case 'ListBox':
    case 'ComboBox':
    case 'CheckedListBox':
    case 'DomainUpDown':
      node.items = [];
      break;
  }
  if (opts.size === undefined && node.type in AUTO_TEXT_TYPES && getBool(node, 'AutoSize', false)) {
    return applyAutoSize(node, opts.parent);
  }
  return node;
}

const AUTO_TEXT_TYPES: Record<string, { padX: number; minH: number }> = {
  Label: { padX: 3, minH: 0 },
  LinkLabel: { padX: 3, minH: 0 },
  CheckBox: { padX: 22, minH: 19 },
  RadioButton: { padX: 22, minH: 19 },
};

/** Recomputes Size for AutoSize Label / CheckBox / RadioButton from their text. */
export function applyAutoSize(node: DesignNode, parent?: DesignNode | null): DesignNode {
  const spec = AUTO_TEXT_TYPES[node.type];
  if (!spec || !getBool(node, 'AutoSize', false)) return node;
  const font = getFont(node, parent ? getFont(parent) : undefined);
  const m = measureText(displayText(getText(node)) || ' ', font);
  return setNodeRect(node, { width: Math.ceil(m.width) + spec.padX, height: Math.max(spec.minH, m.height) });
}

export function newStripItem(doc: DesignDocument, type: StripItemNode['type'], text?: string, taken?: Set<string>): StripItemNode {
  const names = taken ?? collectNames(doc);
  const prefix = type === 'ToolStripSeparator' ? 'toolStripSeparator' : type.charAt(0).toLowerCase() + type.slice(1);
  const name = generateUniqueName(doc, prefix, names);
  return {
    id: uid('si'),
    name,
    type,
    text: type === 'ToolStripSeparator' ? undefined : text ?? name,
    properties: {},
    events: {},
    dropDownItems: type === 'ToolStripMenuItem' || type === 'ToolStripDropDownButton' || type === 'ToolStripSplitButton' ? [] : undefined,
  };
}

export function newGridColumn(doc: DesignDocument, columnType: DataGridViewColumnNode['columnType'] = 'DataGridViewTextBoxColumn', taken?: Set<string>): DataGridViewColumnNode {
  const name = generateUniqueName(doc, 'Column', taken);
  return { id: uid('col'), name, columnType, headerText: name, visible: true };
}

// ---------------------------------------------------------------------------
// Insertion / deletion / reparenting
// ---------------------------------------------------------------------------

export interface InsertTarget {
  parentId: string;
  slot?: 'Panel1' | 'Panel2';
  cell?: TableCellPosition;
  /** Insert index in parent's children (default: front of z-order, index 0). */
  index?: number;
}

function placeChild(parent: DesignNode, child: DesignNode, target: InsertTarget): DesignNode {
  let c = child;
  if (parent.type === 'SplitContainer') c = { ...c, panelSlot: target.slot ?? 'Panel1' };
  else if (c.panelSlot) {
    c = { ...c };
    delete c.panelSlot;
  }
  if (parent.type === 'TableLayoutPanel') c = { ...c, tableCell: target.cell ?? undefined };
  else if (c.tableCell) {
    c = { ...c };
    delete c.tableCell;
  }
  const kids = [...parent.children];
  const docked = getDock(c) !== 'None' && getDock(c) !== 'Fill';
  // Docked edge controls (strips, panels) go to the back of the z-order so they dock first.
  const idx = target.index ?? (docked ? kids.length : 0);
  kids.splice(Math.max(0, Math.min(idx, kids.length)), 0, c);
  return { ...parent, children: kids };
}

export function insertNodes(doc: DesignDocument, nodes: DesignNode[], target: InsertTarget): DesignDocument {
  const comps = nodes.filter((n) => n.isComponent);
  const controls = nodes.filter((n) => !n.isComponent);
  let next = doc;
  if (comps.length) next = { ...next, components: [...next.components, ...comps] };
  if (controls.length) {
    next = updateNode(next, target.parentId, (p) => {
      let parent = p;
      // Insert in reverse so the first node ends up at the requested index.
      for (let i = controls.length - 1; i >= 0; i--) parent = placeChild(parent, controls[i], target);
      return parent;
    });
  }
  return next;
}

export function removeNodes(doc: DesignDocument, ids: Iterable<string>): DesignDocument {
  const set = new Set(ids);
  set.delete(doc.form.id);
  if (set.size === 0) return doc;
  const strip = (n: DesignNode): DesignNode => {
    const kept = n.children.filter((c) => !set.has(c.id));
    const kids = kept.map(strip);
    const changed = kept.length !== n.children.length || kids.some((k, i) => k !== kept[i]);
    return changed ? { ...n, children: kids } : n;
  };
  const form = strip(doc.form);
  const components = doc.components.filter((c) => !set.has(c.id));
  return { ...doc, form, components: components.length === doc.components.length ? doc.components : components };
}

/** Moves nodes into a new container. `locations` are relative to the target slot origin. */
export function reparentNodes(
  doc: DesignDocument,
  ids: string[],
  target: InsertTarget,
  locations: Record<string, { x: number; y: number }>
): DesignDocument {
  const top = topLevelIds(doc, ids).filter((id) => id !== target.parentId && !isDescendantOf(doc, target.parentId, id) && id !== doc.form.id);
  if (top.length === 0) return doc;
  const moving = top
    .map((id) => getNode(doc, id))
    .filter((n): n is DesignNode => !!n && !n.isComponent)
    .map((n) => (locations[n.id] ? setNodeRect(n, locations[n.id]) : n));
  let next = removeNodes(doc, top);
  next = insertNodes(next, moving, target);
  return next;
}

// ---------------------------------------------------------------------------
// Clipboard / duplicate
// ---------------------------------------------------------------------------

function renameStripItems(doc: DesignDocument, items: StripItemNode[] | undefined, taken: Set<string>): StripItemNode[] | undefined {
  if (!items) return items;
  return items.map((it) => ({
    ...it,
    id: uid('si'),
    name: generateUniqueName(doc, it.name.replace(/\d+$/, ''), taken),
    dropDownItems: renameStripItems(doc, it.dropDownItems, taken),
  }));
}

/** Deep-clones a subtree assigning fresh ids and unique names. */
export function cloneWithFreshIdentity(doc: DesignDocument, node: DesignNode, taken: Set<string>): DesignNode {
  const c = deepClone(node);
  const rec = (n: DesignNode): DesignNode => {
    const base = n.name.replace(/\d+$/, '') || getControlDefinition(n.type)?.namePrefix || 'control';
    const name = generateUniqueName(doc, base, taken);
    const renamedText = typeof n.properties.Text === 'string' && n.properties.Text === n.name;
    const withText = renamedText ? setProps(n, { Text: name }) : n;
    const clone: DesignNode = {
      ...withText,
      id: uid(n.isComponent ? 'c' : 'n'),
      name,
      children: n.children.map(rec),
      stripItems: renameStripItems(doc, n.stripItems, taken),
      columns: n.columns?.map((col) => ({ ...col, id: uid('col'), name: generateUniqueName(doc, col.name.replace(/\d+$/, ''), taken) })),
      listViewColumns: n.listViewColumns?.map((col) => ({ ...col, id: uid('lvc'), name: generateUniqueName(doc, col.name.replace(/\d+$/, ''), taken) })),
    };
    // Clones pasted/duplicated into a derived form are new editable derived controls, not inherited.
    delete clone.inherited;
    delete clone.inheritedFrom;
    return clone;
  };
  return rec(c);
}

// ---------------------------------------------------------------------------
// Z-order
// ---------------------------------------------------------------------------

export function reorderZ(doc: DesignDocument, ids: string[], where: 'front' | 'back'): DesignDocument {
  let next = doc;
  for (const id of ids) {
    const f = findNode(next, id);
    if (!f || !f.parent) continue;
    next = updateNode(next, f.parent.id, (p) => {
      const kids = p.children.filter((c) => c.id !== id);
      if (where === 'front') kids.unshift(f.node);
      else kids.push(f.node);
      return { ...p, children: kids };
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export function addTabPage(doc: DesignDocument, tabControlId: string): { doc: DesignDocument; pageId?: string } {
  const tc = getNode(doc, tabControlId);
  if (!tc || tc.type !== 'TabControl') return { doc };
  const taken = collectNames(doc);
  const page = createTabPage(doc, taken, tc.children.length);
  const loc = tc.children[0]?.properties.Location;
  const size = tc.children[0]?.properties.Size;
  if (loc) page.properties.Location = deepClone(loc);
  if (size) page.properties.Size = deepClone(size);
  return { doc: updateNode(doc, tabControlId, (n) => ({ ...n, children: [...n.children, page] })), pageId: page.id };
}

export function setTabPages(doc: DesignDocument, tabControlId: string, pages: DesignNode[]): DesignDocument {
  return updateNode(doc, tabControlId, (n) => {
    const max = Math.max(0, pages.length - 1);
    const sel = Math.min(getNumber(n, 'SelectedIndex', 0), max);
    return setProps({ ...n, children: pages.map((p, i) => setProps(p, { TabIndex: i })) }, { SelectedIndex: sel === 0 ? n.properties.SelectedIndex : sel });
  });
}

export function setStripItems(doc: DesignDocument, id: string, items: StripItemNode[]): DesignDocument {
  return updateNode(doc, id, (n) => ({ ...n, stripItems: items }));
}

export function setGridColumns(doc: DesignDocument, id: string, columns: DataGridViewColumnNode[]): DesignDocument {
  return updateNode(doc, id, (n) => ({ ...n, columns }));
}

export function setTreeNodes(doc: DesignDocument, id: string, treeNodes: TreeNodeItem[]): DesignDocument {
  return updateNode(doc, id, (n) => ({ ...n, treeNodes }));
}

export function setListViewColumns(doc: DesignDocument, id: string, listViewColumns: ListViewColumnNode[]): DesignDocument {
  return updateNode(doc, id, (n) => ({ ...n, listViewColumns }));
}

/**
 * Rewrites `{ kind: 'raw' }` control references (AcceptButton, CancelButton, MainMenuStrip,
 * ContextMenuStrip, ImageList…) after a control is renamed, preserving any `this.` qualifier.
 */
export function rewriteControlRefs(doc: DesignDocument, oldName: string, newName: string): DesignDocument {
  if (!oldName || oldName === newName) return doc;
  const fix = (n: DesignNode): DesignNode => {
    let patch: Record<string, PropertyValue> | null = null;
    for (const [k, v] of Object.entries(n.properties)) {
      if (typeof v !== 'object' || v === null || v.kind !== 'raw') continue;
      const expr = v.expression.trim();
      if (expr === oldName) (patch ??= {})[k] = { kind: 'raw', expression: newName };
      else if (expr === `this.${oldName}`) (patch ??= {})[k] = { kind: 'raw', expression: `this.${newName}` };
    }
    return patch ? setProps(n, patch) : n;
  };
  const ids: string[] = [];
  const visit = (n: DesignNode) => {
    ids.push(n.id);
    n.children.forEach(visit);
  };
  visit(doc.form);
  doc.components.forEach(visit);
  return updateNodes(doc, ids, fix);
}

export function setItems(doc: DesignDocument, id: string, items: string[]): DesignDocument {
  return updateNode(doc, id, (n) => ({ ...n, items }));
}

export function setTableLayout(doc: DesignDocument, id: string, columnStyles: TableTrackStyle[], rowStyles: TableTrackStyle[]): DesignDocument {
  return updateNode(doc, id, (n) =>
    setProps({ ...n, tableLayout: { columnStyles, rowStyles } }, { ColumnCount: Math.max(1, columnStyles.length), RowCount: Math.max(1, rowStyles.length) })
  );
}

export function standardMenuItems(doc: DesignDocument): StripItemNode[] {
  const taken = collectNames(doc);
  const mk = (text: string, children: string[] = []): StripItemNode => {
    const base = text.replace(/[^A-Za-z]/g, '');
    const name = reserveExactOrNumberedName(doc, `${base.charAt(0).toLowerCase()}${base.slice(1)}ToolStripMenuItem`, taken);
    return {
      id: uid('si'),
      name,
      type: 'ToolStripMenuItem',
      text,
      properties: {},
      events: {},
      dropDownItems: children.map((c) => (c === '-' ? newStripItem(doc, 'ToolStripSeparator', undefined, taken) : mk(c))),
    };
  };
  return [
    mk('&File', ['&New', '&Open', '-', '&Save', 'Save &As', '-', 'E&xit']),
    mk('&Edit', ['&Undo', '&Redo', '-', 'Cu&t', '&Copy', '&Paste', '-', 'Select &All']),
    mk('&Tools', ['&Customize', '&Options']),
    mk('&Help', ['&Contents', '&Index', '-', '&About...']),
  ];
}

export function standardToolItems(doc: DesignDocument): StripItemNode[] {
  const taken = collectNames(doc);
  const btn = (text: string): StripItemNode => {
    const base = text.replace(/[^A-Za-z]/g, '').toLowerCase();
    const name = reserveExactOrNumberedName(doc, `${base}ToolStripButton`, taken);
    return { id: uid('si'), name, type: 'ToolStripButton', text, properties: {}, events: {} };
  };
  return [
    btn('&New'),
    btn('&Open'),
    btn('&Save'),
    btn('&Print'),
    newStripItem(doc, 'ToolStripSeparator', undefined, taken),
    btn('Cu&t'),
    btn('&Copy'),
    btn('&Paste'),
    newStripItem(doc, 'ToolStripSeparator', undefined, taken),
    btn('He&lp'),
  ];
}

// ---------------------------------------------------------------------------
// Alignment / sizing / spacing (relative to primary selection)
// ---------------------------------------------------------------------------

export type AlignOp =
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignTop'
  | 'alignMiddle'
  | 'alignBottom'
  | 'sameWidth'
  | 'sameHeight'
  | 'sameSize'
  | 'spaceHorizontally'
  | 'spaceVertically'
  | 'centerHorizontally'
  | 'centerVertically';

export function isMovable(doc: DesignDocument, id: string, layout: LayoutMap): boolean {
  const f = findNode(doc, id);
  if (!f || !f.parent || f.isComponent) return false;
  if (getDock(f.node) !== 'None') return false;
  const pt = f.parent.type;
  if (pt === 'TabControl' || pt === 'FlowLayoutPanel' || pt === 'TableLayoutPanel') return false;
  if (getBool(f.node, 'Locked', false)) return false;
  return layout.has(id);
}

export function alignSelection(doc: DesignDocument, ids: string[], op: AlignOp, layout: LayoutMap): DesignDocument {
  const movable = ids.filter((id) => isMovable(doc, id, layout));
  if (movable.length === 0) return doc;
  const primaryId = movable.includes(ids[0]) ? ids[0] : movable[0];
  const P = layout.get(primaryId)!.bounds;
  const rects = new Map(movable.map((id) => [id, { ...layout.get(id)!.bounds }]));
  const others = movable.filter((id) => id !== primaryId);
  switch (op) {
    case 'alignLeft':
      others.forEach((id) => (rects.get(id)!.x = P.x));
      break;
    case 'alignRight':
      others.forEach((id) => {
        const r = rects.get(id)!;
        r.x = P.x + P.width - r.width;
      });
      break;
    case 'alignCenter':
      others.forEach((id) => {
        const r = rects.get(id)!;
        r.x = Math.round(P.x + P.width / 2 - r.width / 2);
      });
      break;
    case 'alignTop':
      others.forEach((id) => (rects.get(id)!.y = P.y));
      break;
    case 'alignBottom':
      others.forEach((id) => {
        const r = rects.get(id)!;
        r.y = P.y + P.height - r.height;
      });
      break;
    case 'alignMiddle':
      others.forEach((id) => {
        const r = rects.get(id)!;
        r.y = Math.round(P.y + P.height / 2 - r.height / 2);
      });
      break;
    case 'sameWidth':
      others.forEach((id) => (rects.get(id)!.width = P.width));
      break;
    case 'sameHeight':
      others.forEach((id) => (rects.get(id)!.height = P.height));
      break;
    case 'sameSize':
      others.forEach((id) => {
        const r = rects.get(id)!;
        r.width = P.width;
        r.height = P.height;
      });
      break;
    case 'spaceHorizontally':
    case 'spaceVertically': {
      if (movable.length < 3) return doc;
      const horiz = op === 'spaceHorizontally';
      const sorted = [...movable].sort((a, b) => (horiz ? rects.get(a)!.x - rects.get(b)!.x : rects.get(a)!.y - rects.get(b)!.y));
      const first = rects.get(sorted[0])!;
      const last = rects.get(sorted[sorted.length - 1])!;
      const span = horiz ? last.x + last.width - first.x : last.y + last.height - first.y;
      const total = sorted.reduce((acc, id) => acc + (horiz ? rects.get(id)!.width : rects.get(id)!.height), 0);
      const gap = (span - total) / (sorted.length - 1);
      let cursor = horiz ? first.x : first.y;
      sorted.forEach((id) => {
        const r = rects.get(id)!;
        if (horiz) {
          r.x = Math.round(cursor);
          cursor += r.width + gap;
        } else {
          r.y = Math.round(cursor);
          cursor += r.height + gap;
        }
      });
      break;
    }
    case 'centerHorizontally':
    case 'centerVertically': {
      const parentId = layout.get(primaryId)!.parentId;
      const parentNl = parentId ? layout.get(parentId) : undefined;
      const slot = parentNl?.slots?.find((s) => s.slot === (layout.get(primaryId)!.slot ?? 'main')) ?? parentNl?.slots?.[0];
      if (!slot) return doc;
      const area = slot.clip;
      const group = movable.filter((id) => layout.get(id)!.parentId === parentId);
      const minX = Math.min(...group.map((id) => rects.get(id)!.x));
      const minY = Math.min(...group.map((id) => rects.get(id)!.y));
      const maxX = Math.max(...group.map((id) => rects.get(id)!.x + rects.get(id)!.width));
      const maxY = Math.max(...group.map((id) => rects.get(id)!.y + rects.get(id)!.height));
      const dx = op === 'centerHorizontally' ? Math.round(area.x + area.width / 2 - (minX + maxX) / 2) : 0;
      const dy = op === 'centerVertically' ? Math.round(area.y + area.height / 2 - (minY + maxY) / 2) : 0;
      group.forEach((id) => {
        const r = rects.get(id)!;
        r.x += dx;
        r.y += dy;
      });
      break;
    }
  }
  return applyAbsoluteRects(doc, rects, layout);
}

/** Applies new absolute rects to nodes by translating deltas into each node's Location/Size. */
export function applyAbsoluteRects(doc: DesignDocument, rects: Map<string, Rect>, layout: LayoutMap): DesignDocument {
  return updateNodes(doc, rects.keys(), (n) => {
    const nl = layout.get(n.id);
    const r = rects.get(n.id);
    if (!nl || !r) return n;
    const loc = getLocation(n);
    const dx = r.x - nl.bounds.x;
    const dy = r.y - nl.bounds.y;
    const clamped = clampSize(n, r.width, r.height);
    return setNodeRect(n, { x: loc.x + dx, y: loc.y + dy, width: clamped.width, height: clamped.height });
  });
}

// ---------------------------------------------------------------------------
// Anchor propagation (WinForms runtime behaviour applied at design time)
// ---------------------------------------------------------------------------

function isLayoutManaged(parent: DesignNode, child: DesignNode): boolean {
  if (getDock(child) !== 'None') return true;
  return parent.type === 'TabControl' || parent.type === 'FlowLayoutPanel' || parent.type === 'TableLayoutPanel';
}

function applyAnchor(child: DesignNode, dw: number, dh: number): DesignNode {
  const a = getAnchor(child);
  const loc = getLocation(child);
  const size = getSize(child);
  let { x, y } = loc;
  let { width, height } = size;
  if (dw) {
    if (a.has('Left') && a.has('Right')) width += dw;
    else if (a.has('Right')) x += dw;
    else if (!a.has('Left')) x += Math.round(dw / 2);
  }
  if (dh) {
    if (a.has('Top') && a.has('Bottom')) height += dh;
    else if (a.has('Bottom')) y += dh;
    else if (!a.has('Top')) y += Math.round(dh / 2);
  }
  return setNodeRect(child, { x, y, width: Math.max(0, width), height: Math.max(0, height) });
}

/**
 * When a container's client area changes size between `oldDoc` and `newDoc`, adjusts
 * every anchored (non-docked) child exactly like WinForms' DefaultLayout does.
 */
export function propagateAnchors(oldDoc: DesignDocument, newDoc: DesignDocument, opts: LayoutOptions = {}): DesignDocument {
  if (oldDoc.form === newDoc.form) return newDoc;
  const oldLayout = computeLayoutTree(oldDoc.form, opts);
  const fix = (node: DesignNode, size: { width: number; height: number }): DesignNode => {
    if (!isContainerNode(node) || node.children.length === 0) return node;
    const oldNl = oldLayout.get(node.id);
    const cl = computeContainerLayout(node, size, opts);
    let changed = false;
    const kids = node.children.map((child) => {
      let c = child;
      const placement = cl.children.get(child.id);
      const slotName: SlotName = placement?.slot ?? 'main';
      const managed = isLayoutManaged(node, child);
      const oldChild = oldLayout.get(child.id);
      if (!managed && oldNl && oldChild && oldChild.parentId === node.id) {
        const oldSlot = oldNl.slots?.find((s) => s.slot === slotName);
        const newSlot = cl.slots.find((s) => s.slot === slotName);
        if (oldSlot && newSlot) {
          const dw = newSlot.clip.width - oldSlot.clip.width;
          const dh = newSlot.clip.height - oldSlot.clip.height;
          if (dw || dh) c = applyAnchor(child, dw, dh);
        }
      }
      const childSize = managed && placement ? { width: placement.rect.width, height: placement.rect.height } : getSize(c);
      const fixed = fix(c, childSize);
      if (fixed !== child) changed = true;
      return fixed;
    });
    return changed ? { ...node, children: kids } : node;
  };
  const form = fix(newDoc.form, getSize(newDoc.form));
  return form === newDoc.form ? newDoc : { ...newDoc, form };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function defaultEventFor(node: DesignNode): string {
  if (isRootNode(node)) return 'Load';
  return getControlDefinition(node.type)?.defaultEvent ?? 'Click';
}

export function handlerNameFor(doc: DesignDocument, node: DesignNode, eventName: string): string {
  const owner = isRootNode(node) ? doc.className || node.name : node.name;
  return `${owner}_${eventName}`;
}

/** Finds a free location (cascading) for a new control inside a container slot. */
export function findFreeLocation(container: DesignNode, start: { x: number; y: number }, step = 12): { x: number; y: number } {
  const used = new Set(container.children.map((c) => `${getLocation(c).x},${getLocation(c).y}`));
  let { x, y } = start;
  for (let i = 0; i < 40 && used.has(`${x},${y}`); i++) {
    x += step;
    y += step;
  }
  return { x, y };
}
