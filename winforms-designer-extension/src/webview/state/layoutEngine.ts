// WinForms layout solver (Dock / Flow / Table / Split / Tab / GroupBox) and the
// Visual Studio-style snapline engine.

import { getControlDefinition } from '../../shared/catalog';
import type { DesignNode, TableCellPosition, TableTrackStyle } from '../../shared/model';
import {
  displayText,
  getAnchor,
  getBool,
  getDock,
  getEnum,
  getFont,
  getLocation,
  getNumber,
  getPadding,
  getSize,
  getText,
  measureText,
  readPadding,
  type Rect,
} from './nodeProps';

export type { Rect } from './nodeProps';

export type SlotName = 'main' | 'Panel1' | 'Panel2';

export interface SlotLayout {
  slot: SlotName;
  /** Coordinate origin that child `Location` values are relative to. */
  origin: { x: number; y: number };
  /** Visible / clipping area for children. */
  clip: Rect;
  /** DisplayRectangle used for docking, flow and table layout (clip minus padding). */
  display: Rect;
  hidden?: boolean;
}

export interface TableGrid {
  /** Column boundary x positions (columns + 1 entries). */
  xs: number[];
  /** Row boundary y positions (rows + 1 entries). */
  ys: number[];
  columnCount: number;
  rowCount: number;
  border: number;
}

export interface TabHeader {
  id: string;
  index: number;
  rect: Rect;
  text: string;
  selected: boolean;
}

export interface ContainerLayout {
  slots: SlotLayout[];
  children: Map<string, { rect: Rect; slot: SlotName; hidden?: boolean; cell?: ResolvedCell }>;
  splitter?: Rect;
  tabHeaders?: TabHeader[];
  tabBody?: Rect;
  table?: TableGrid;
}

export interface NodeLayout {
  id: string;
  parentId: string | null;
  slot?: SlotName;
  /** Bounds in absolute form-client coordinates. */
  bounds: Rect;
  /** Bounds relative to the parent slot origin. */
  rel: Rect;
  hidden: boolean;
  depth: number;
  container?: ContainerLayout;
  /** Absolute slot layouts (only for containers). */
  slots?: SlotLayout[];
  cell?: ResolvedCell;
}

export type LayoutMap = Map<string, NodeLayout>;

export interface LayoutOptions {
  /** Design-time selected TabPage index per TabControl id. */
  activeTabs?: Record<string, number>;
}

export const TAB_HEADER_HEIGHT = 25;
export const GROUPBOX_INSET = { top: 18, left: 6, right: 6, bottom: 6 };

export function isContainerNode(node: DesignNode): boolean {
  if (node.children.length > 0) return true;
  const def = getControlDefinition(node.type);
  return !!def?.isContainer;
}

function borderWidth(node: DesignNode): number {
  const bs = getEnum(node, 'BorderStyle', node.type === 'SplitContainer' ? 'None' : 'None');
  if (bs === 'FixedSingle') return 1;
  if (bs === 'Fixed3D') return 2;
  return 0;
}

function inset(r: Rect, l: number, t: number, rr: number, b: number): Rect {
  return { x: r.x + l, y: r.y + t, width: Math.max(0, r.width - l - rr), height: Math.max(0, r.height - t - b) };
}

function slotPadding(node: DesignNode, slot: 'Panel1' | 'Panel2') {
  return readPadding(node.properties[`${slot}.Padding`] ?? node.properties[`${slot}Padding`], 0);
}

export function getActiveTabIndex(node: DesignNode, opts: LayoutOptions): number {
  const pages = node.children;
  if (pages.length === 0) return -1;
  const fromOpts = opts.activeTabs?.[node.id];
  const idx = fromOpts ?? getNumber(node, 'SelectedIndex', 0);
  return Math.min(Math.max(0, idx), pages.length - 1);
}

/** Solves the layout of a container's direct children within a container of `size`. */
export function computeContainerLayout(
  container: DesignNode,
  size: { width: number; height: number },
  opts: LayoutOptions = {}
): ContainerLayout {
  const W = size.width;
  const H = size.height;
  const full: Rect = { x: 0, y: 0, width: W, height: H };
  const result: ContainerLayout = { slots: [], children: new Map() };

  switch (container.type) {
    case 'TabControl': {
      const alignment = getEnum(container, 'Alignment', 'Top');
      const bottom = alignment === 'Bottom';
      const body: Rect = bottom
        ? { x: 0, y: 0, width: W, height: Math.max(0, H - TAB_HEADER_HEIGHT) }
        : { x: 0, y: TAB_HEADER_HEIGHT, width: W, height: Math.max(0, H - TAB_HEADER_HEIGHT) };
      const page = inset(body, 3, 1, 3, 3);
      result.tabBody = body;
      result.slots.push({ slot: 'main', origin: { x: 0, y: 0 }, clip: full, display: page });
      const active = getActiveTabIndex(container, opts);
      const font = getFont(container);
      let x = 2;
      result.tabHeaders = container.children.map((child, index) => {
        const text = displayText(getText(child) || child.name);
        const w = Math.max(42, Math.ceil(measureText(text, font).width) + 20);
        const rect: Rect = { x, y: bottom ? H - TAB_HEADER_HEIGHT : 0, width: w, height: TAB_HEADER_HEIGHT };
        x += w + 1;
        return { id: child.id, index, rect, text, selected: index === active };
      });
      container.children.forEach((child, index) => {
        result.children.set(child.id, { rect: { ...page }, slot: 'main', hidden: index !== active });
      });
      return result;
    }
    case 'SplitContainer': {
      const b = borderWidth(container);
      const inner = inset(full, b, b, b, b);
      const vertical = getEnum(container, 'Orientation', 'Vertical') === 'Vertical';
      const sw = Math.max(1, getNumber(container, 'SplitterWidth', 4));
      const extent = vertical ? inner.width : inner.height;
      const dist = Math.min(Math.max(0, getNumber(container, 'SplitterDistance', Math.round(extent / 2))), Math.max(0, extent - sw));
      const c1 = getBool(container, 'Panel1Collapsed', false);
      const c2 = getBool(container, 'Panel2Collapsed', false);
      let p1: Rect;
      let p2: Rect;
      let splitter: Rect | undefined;
      if (c1 && !c2) {
        p1 = { ...inner, width: vertical ? 0 : inner.width, height: vertical ? inner.height : 0 };
        p2 = inner;
      } else if (c2 && !c1) {
        p1 = inner;
        p2 = { ...inner, width: vertical ? 0 : inner.width, height: vertical ? inner.height : 0 };
      } else if (vertical) {
        p1 = { x: inner.x, y: inner.y, width: dist, height: inner.height };
        splitter = { x: inner.x + dist, y: inner.y, width: sw, height: inner.height };
        p2 = { x: inner.x + dist + sw, y: inner.y, width: Math.max(0, inner.width - dist - sw), height: inner.height };
      } else {
        p1 = { x: inner.x, y: inner.y, width: inner.width, height: dist };
        splitter = { x: inner.x, y: inner.y + dist, width: inner.width, height: sw };
        p2 = { x: inner.x, y: inner.y + dist + sw, width: inner.width, height: Math.max(0, inner.height - dist - sw) };
      }
      result.splitter = splitter;
      const pad1 = slotPadding(container, 'Panel1');
      const pad2 = slotPadding(container, 'Panel2');
      const s1: SlotLayout = {
        slot: 'Panel1',
        origin: { x: p1.x, y: p1.y },
        clip: p1,
        display: inset(p1, pad1.left, pad1.top, pad1.right, pad1.bottom),
        hidden: c1 && !c2,
      };
      const s2: SlotLayout = {
        slot: 'Panel2',
        origin: { x: p2.x, y: p2.y },
        clip: p2,
        display: inset(p2, pad2.left, pad2.top, pad2.right, pad2.bottom),
        hidden: c2 && !c1,
      };
      result.slots.push(s1, s2);
      for (const slot of [s1, s2]) {
        const kids = container.children.filter((c) => (c.panelSlot ?? 'Panel1') === slot.slot);
        layoutDocked(kids, slot, result, slot.slot, !!slot.hidden);
      }
      return result;
    }
    case 'GroupBox': {
      const pad = getPadding(container);
      const display = inset(
        full,
        GROUPBOX_INSET.left + pad.left,
        GROUPBOX_INSET.top + pad.top,
        GROUPBOX_INSET.right + pad.right,
        GROUPBOX_INSET.bottom + pad.bottom
      );
      const slot: SlotLayout = { slot: 'main', origin: { x: 0, y: 0 }, clip: inset(full, 1, 1, 1, 1), display };
      result.slots.push(slot);
      layoutDocked(container.children, slot, result, 'main', false);
      return result;
    }
    default: {
      const b = container.type === 'Form' ? 0 : borderWidth(container);
      const clip = inset(full, b, b, b, b);
      const pad = getPadding(container);
      const slot: SlotLayout = {
        slot: 'main',
        origin: { x: b, y: b },
        clip,
        display: inset(clip, pad.left, pad.top, pad.right, pad.bottom),
      };
      result.slots.push(slot);
      if (container.type === 'FlowLayoutPanel') {
        layoutFlow(container, slot, result);
      } else if (container.type === 'TableLayoutPanel') {
        layoutTable(container, slot, result);
      } else {
        layoutDocked(container.children, slot, result, 'main', false);
      }
      return result;
    }
  }
}

/** Standard WinForms DefaultLayout: docking in reverse z-order, then absolute Location for the rest. */
function layoutDocked(children: DesignNode[], slot: SlotLayout, result: ContainerLayout, slotName: SlotName, hidden: boolean) {
  const ox = slot.origin.x;
  const oy = slot.origin.y;
  const rem = { x: slot.display.x - ox, y: slot.display.y - oy, width: slot.display.width, height: slot.display.height };
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    const dock = getDock(child);
    const size = getSize(child);
    let rect: Rect;
    switch (dock) {
      case 'Top': {
        const h = Math.min(size.height, Math.max(0, rem.height));
        rect = { x: rem.x, y: rem.y, width: rem.width, height: size.height };
        rem.y += h;
        rem.height -= h;
        break;
      }
      case 'Bottom': {
        const h = Math.min(size.height, Math.max(0, rem.height));
        rect = { x: rem.x, y: rem.y + rem.height - size.height, width: rem.width, height: size.height };
        rem.height -= h;
        break;
      }
      case 'Left': {
        const w = Math.min(size.width, Math.max(0, rem.width));
        rect = { x: rem.x, y: rem.y, width: size.width, height: rem.height };
        rem.x += w;
        rem.width -= w;
        break;
      }
      case 'Right': {
        const w = Math.min(size.width, Math.max(0, rem.width));
        rect = { x: rem.x + rem.width - size.width, y: rem.y, width: size.width, height: rem.height };
        rem.width -= w;
        break;
      }
      case 'Fill':
        rect = { x: rem.x, y: rem.y, width: Math.max(0, rem.width), height: Math.max(0, rem.height) };
        break;
      default: {
        const loc = getLocation(child);
        rect = { x: loc.x, y: loc.y, width: size.width, height: size.height };
      }
    }
    result.children.set(child.id, { rect, slot: slotName, hidden });
  }
}

function layoutFlow(container: DesignNode, slot: SlotLayout, result: ContainerLayout) {
  const dir = getEnum(container, 'FlowDirection', 'LeftToRight');
  const wrap = getBool(container, 'WrapContents', true);
  const d = { x: slot.display.x - slot.origin.x, y: slot.display.y - slot.origin.y, width: slot.display.width, height: slot.display.height };
  const horizontal = dir === 'LeftToRight' || dir === 'RightToLeft';
  let main = 0; // cursor along flow axis (relative to display start)
  let cross = 0; // cursor along cross axis
  let lineExtent = 0;
  const mainLimit = horizontal ? d.width : d.height;
  for (const child of container.children) {
    const size = getSize(child);
    const m = getPadding(child, 'Margin');
    const mainSize = horizontal ? size.width + m.left + m.right : size.height + m.top + m.bottom;
    const crossSize = horizontal ? size.height + m.top + m.bottom : size.width + m.left + m.right;
    if (wrap && main > 0 && main + mainSize > mainLimit) {
      main = 0;
      cross += lineExtent;
      lineExtent = 0;
    }
    let x: number;
    let y: number;
    if (horizontal) {
      x = main + m.left;
      y = cross + m.top;
      if (dir === 'RightToLeft') x = d.width - x - size.width;
    } else {
      y = main + m.top;
      x = cross + m.left;
      if (dir === 'BottomUp') y = d.height - y - size.height;
    }
    result.children.set(child.id, { rect: { x: d.x + x, y: d.y + y, width: size.width, height: size.height }, slot: 'main' });
    main += mainSize;
    lineExtent = Math.max(lineExtent, crossSize);
  }
}

function tableBorder(container: DesignNode): number {
  const s = getEnum(container, 'CellBorderStyle', 'None');
  if (s === 'None') return 0;
  if (s === 'Single') return 1;
  if (s === 'InsetDouble' || s === 'OutsetDouble') return 3;
  return 2;
}

export function getTableTracks(container: DesignNode): { columns: TableTrackStyle[]; rows: TableTrackStyle[] } {
  const colCount = Math.max(1, getNumber(container, 'ColumnCount', container.tableLayout?.columnStyles.length || 2));
  const placed = autoPlaceCells(container, colCount);
  const rowCountProp = getNumber(container, 'RowCount', container.tableLayout?.rowStyles.length || 0);
  const rowCount = Math.max(1, rowCountProp, placed.maxRow + 1);
  const cs = container.tableLayout?.columnStyles ?? [];
  const rs = container.tableLayout?.rowStyles ?? [];
  const columns = Array.from({ length: colCount }, (_, i) => cs[i] ?? { sizeType: 'AutoSize' as const, value: 0 });
  const rows = Array.from({ length: rowCount }, (_, i) => rs[i] ?? { sizeType: 'AutoSize' as const, value: 0 });
  return { columns, rows };
}

/** A table cell position with every coordinate resolved. */
export interface ResolvedCell {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

function hasExplicitCell(tc: TableCellPosition | undefined): tc is TableCellPosition & { column: number; row: number } {
  return !!tc && tc.explicit !== false && typeof tc.column === 'number' && typeof tc.row === 'number' && tc.column >= 0 && tc.row >= 0;
}

/**
 * Resolves explicit/implicit cell positions in row-major order (WinForms GrowStyle.AddRows).
 * Explicit cells are claimed first; implicit children (no column/row, or `explicit: false`) then flow
 * into the first free run of cells that fits their ColumnSpan × RowSpan.
 */
export function autoPlaceCells(container: DesignNode, columnCount?: number): { cells: Map<string, ResolvedCell>; maxRow: number } {
  const cols = Math.max(1, columnCount ?? getNumber(container, 'ColumnCount', 2));
  const occupied = new Set<string>();
  const cells = new Map<string, ResolvedCell>();
  let maxRow = -1;
  const mark = (c: ResolvedCell) => {
    for (let dx = 0; dx < c.columnSpan; dx++) for (let dy = 0; dy < c.rowSpan; dy++) occupied.add(`${c.column + dx},${c.row + dy}`);
    maxRow = Math.max(maxRow, c.row + c.rowSpan - 1);
  };
  const spans = (tc: TableCellPosition | undefined, column: number) => ({
    columnSpan: Math.max(1, Math.min(tc?.columnSpan ?? 1, cols - column)),
    rowSpan: Math.max(1, tc?.rowSpan ?? 1),
  });
  for (const child of container.children) {
    const tc = child.tableCell;
    if (hasExplicitCell(tc)) {
      const column = Math.min(tc.column, cols - 1);
      const c: ResolvedCell = { column, row: tc.row, ...spans(tc, column) };
      cells.set(child.id, c);
      mark(c);
    }
  }
  const fits = (column: number, row: number, cs: number, rs: number) => {
    if (column + cs > cols) return false;
    for (let dx = 0; dx < cs; dx++) for (let dy = 0; dy < rs; dy++) if (occupied.has(`${column + dx},${row + dy}`)) return false;
    return true;
  };
  let cursor = 0;
  for (const child of container.children) {
    if (cells.has(child.id)) continue;
    const tc = child.tableCell;
    const wantCs = Math.max(1, Math.min(tc?.columnSpan ?? 1, cols));
    const wantRs = Math.max(1, tc?.rowSpan ?? 1);
    let pos = cursor;
    // Bounded scan: a fit always exists within the rows already used plus the requested span.
    const limit = (Math.max(0, maxRow) + wantRs + container.children.length + 2) * cols;
    while (pos < limit && !fits(pos % cols, Math.floor(pos / cols), wantCs, wantRs)) pos++;
    const column = pos % cols;
    const c: ResolvedCell = { column, row: Math.floor(pos / cols), ...spans(tc, column) };
    cells.set(child.id, c);
    mark(c);
    cursor = pos + 1;
  }
  return { cells, maxRow };
}

function solveTracks(tracks: TableTrackStyle[], available: number, autoSizes: number[]): number[] {
  const sizes = tracks.map((t, i) => (t.sizeType === 'Absolute' ? t.value : t.sizeType === 'AutoSize' ? autoSizes[i] ?? 0 : 0));
  const fixed = sizes.reduce((a, b) => a + b, 0);
  const pctTotal = tracks.reduce((a, t) => a + (t.sizeType === 'Percent' ? t.value : 0), 0);
  const remaining = Math.max(0, available - fixed);
  if (pctTotal > 0) {
    tracks.forEach((t, i) => {
      if (t.sizeType === 'Percent') sizes[i] = (remaining * t.value) / pctTotal;
    });
  } else if (remaining > 0 && sizes.length > 0) {
    sizes[sizes.length - 1] += remaining;
  }
  // Integer pixel distribution
  let acc = 0;
  let prev = 0;
  return sizes.map((s) => {
    acc += s;
    const v = Math.round(acc) - prev;
    prev = Math.round(acc);
    return v;
  });
}

function layoutTable(container: DesignNode, slot: SlotLayout, result: ContainerLayout) {
  const d = { x: slot.display.x - slot.origin.x, y: slot.display.y - slot.origin.y, width: slot.display.width, height: slot.display.height };
  const { columns, rows } = getTableTracks(container);
  const { cells } = autoPlaceCells(container, columns.length);
  const border = tableBorder(container);
  const colAuto = new Array(columns.length).fill(0);
  const rowAuto = new Array(rows.length).fill(0);
  for (const child of container.children) {
    const c = cells.get(child.id);
    if (!c) continue;
    const s = getSize(child);
    const m = getPadding(child, 'Margin');
    if (c.columnSpan === 1 && c.column < colAuto.length) colAuto[c.column] = Math.max(colAuto[c.column], s.width + m.left + m.right);
    if (c.rowSpan === 1 && c.row < rowAuto.length) rowAuto[c.row] = Math.max(rowAuto[c.row], s.height + m.top + m.bottom);
  }
  const widths = solveTracks(columns, d.width - border * (columns.length + 1), colAuto);
  const heights = solveTracks(rows, d.height - border * (rows.length + 1), rowAuto);
  const xs = [d.x];
  widths.forEach((w, i) => xs.push(xs[i] + border + w));
  const ys = [d.y];
  heights.forEach((h, i) => ys.push(ys[i] + border + h));
  // Close outer edge with trailing border
  xs[xs.length - 1] += border;
  ys[ys.length - 1] += border;
  result.table = {
    xs: xs.map((x) => x + slot.origin.x),
    ys: ys.map((y) => y + slot.origin.y),
    columnCount: columns.length,
    rowCount: rows.length,
    border,
  };
  for (const child of container.children) {
    const c = cells.get(child.id) ?? { column: 0, row: 0, columnSpan: 1, rowSpan: 1 };
    const col = Math.min(c.column, columns.length - 1);
    const row = Math.min(c.row, rows.length - 1);
    const cs = Math.max(1, Math.min(c.columnSpan, columns.length - col));
    const rs = Math.max(1, Math.min(c.rowSpan, rows.length - row));
    const cell: Rect = {
      x: xs[col] + border,
      y: ys[row] + border,
      width: Math.max(0, xs[col + cs] - xs[col] - border - (col + cs === columns.length ? border : 0)),
      height: Math.max(0, ys[row + rs] - ys[row] - border - (row + rs === rows.length ? border : 0)),
    };
    const m = getPadding(child, 'Margin');
    const inner = inset(cell, m.left, m.top, m.right, m.bottom);
    const s = getSize(child);
    const dock = getDock(child);
    let rect: Rect;
    if (dock === 'Fill') rect = inner;
    else {
      const a = getAnchor(child);
      const stretchX = (a.has('Left') && a.has('Right')) || dock === 'Top' || dock === 'Bottom';
      const stretchY = (a.has('Top') && a.has('Bottom')) || dock === 'Left' || dock === 'Right';
      const w = stretchX ? inner.width : Math.min(s.width, Math.max(s.width, 0));
      const h = stretchY ? inner.height : s.height;
      const x = stretchX || a.has('Left') || dock === 'Left' ? inner.x : a.has('Right') || dock === 'Right' ? inner.x + inner.width - w : inner.x + (inner.width - w) / 2;
      const y = stretchY || a.has('Top') || dock === 'Top' ? inner.y : a.has('Bottom') || dock === 'Bottom' ? inner.y + inner.height - h : inner.y + (inner.height - h) / 2;
      rect = { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
    }
    result.children.set(child.id, { rect, slot: 'main', cell: { column: col, row, columnSpan: cs, rowSpan: rs } });
  }
}

function offsetRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}

/** Full recursive solve: absolute bounds for every node in the form tree. */
export function computeLayoutTree(root: DesignNode, opts: LayoutOptions = {}): LayoutMap {
  const map: LayoutMap = new Map();
  const size = getSize(root);
  const rootBounds: Rect = { x: 0, y: 0, width: size.width, height: size.height };
  const visit = (node: DesignNode, nl: NodeLayout) => {
    map.set(node.id, nl);
    if (!isContainerNode(node)) return;
    const cl = computeContainerLayout(node, { width: nl.bounds.width, height: nl.bounds.height }, opts);
    nl.container = cl;
    nl.slots = cl.slots.map((s) => ({
      ...s,
      origin: { x: s.origin.x + nl.bounds.x, y: s.origin.y + nl.bounds.y },
      clip: offsetRect(s.clip, nl.bounds.x, nl.bounds.y),
      display: offsetRect(s.display, nl.bounds.x, nl.bounds.y),
    }));
    for (const child of node.children) {
      const c = cl.children.get(child.id);
      if (!c) continue;
      const slot = nl.slots.find((s) => s.slot === c.slot) ?? nl.slots[0];
      visit(child, {
        id: child.id,
        parentId: node.id,
        slot: c.slot,
        rel: c.rect,
        bounds: offsetRect(c.rect, slot.origin.x, slot.origin.y),
        hidden: nl.hidden || !!c.hidden || !!slot.hidden,
        depth: nl.depth + 1,
        cell: c.cell,
      });
    }
  };
  visit(root, { id: root.id, parentId: null, bounds: rootBounds, rel: rootBounds, hidden: false, depth: 0 });
  return map;
}

/** Finds the slot of `container` whose clip rect contains the absolute point. */
export function slotAtPoint(nl: NodeLayout, x: number, y: number): SlotLayout | undefined {
  if (!nl.slots) return undefined;
  return nl.slots.find((s) => !s.hidden && x >= s.clip.x && y >= s.clip.y && x < s.clip.x + s.clip.width && y < s.clip.y + s.clip.height) ?? nl.slots.find((s) => !s.hidden);
}

/** Cell index of a TableLayoutPanel at an absolute point. */
export function tableCellAtPoint(nl: NodeLayout, x: number, y: number): { column: number; row: number } | undefined {
  const t = nl.container?.table;
  if (!t) return undefined;
  const ox = nl.bounds.x;
  const oy = nl.bounds.y;
  let column = -1;
  let row = -1;
  for (let i = 0; i < t.xs.length - 1; i++) if (x >= t.xs[i] + ox && x < t.xs[i + 1] + ox) column = i;
  for (let i = 0; i < t.ys.length - 1; i++) if (y >= t.ys[i] + oy && y < t.ys[i + 1] + oy) row = i;
  if (column < 0) column = x < t.xs[0] + ox ? 0 : t.columnCount - 1;
  if (row < 0) row = y < t.ys[0] + oy ? 0 : t.rowCount - 1;
  return { column, row };
}

// ---------------------------------------------------------------------------
// Snaplines
// ---------------------------------------------------------------------------

export const SNAP_BLUE = '#2B88D8';
export const SNAP_MAGENTA = '#D946EF';

export type SnaplineKind = 'edge' | 'center' | 'margin' | 'padding' | 'baseline';

export interface Snapline {
  kind: SnaplineKind;
  orientation: 'vertical' | 'horizontal';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

export interface SnapTarget {
  rect: Rect;
  /** Absolute y of the text baseline, if the control has text. */
  baseline?: number;
}

export interface SnapEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export interface SnapOptions {
  threshold?: number;
  /** Edges that are moving (resize); omit for a whole-rect move. */
  edges?: SnapEdges;
  /** Baseline offset from top of the moving rect. */
  movingBaseline?: number;
  spacing?: number[];
  containerMargin?: number;
}

export interface SnapResult {
  /** Delta to apply to the moving edges (x for left/right, y for top/bottom). */
  dx: number;
  dy: number;
  lines: Snapline[];
}

interface Candidate {
  delta: number;
  priority: number;
}

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const cx = (r: Rect) => r.x + r.width / 2;
const cy = (r: Rect) => r.y + r.height / 2;
const overlapY = (a: Rect, b: Rect) => Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
const overlapX = (a: Rect, b: Rect) => Math.min(right(a), right(b)) - Math.max(a.x, b.x);

export function computeSnaplines(
  moving: Rect,
  siblings: SnapTarget[],
  container: Rect,
  snapThreshold = 6,
  options: SnapOptions = {}
): SnapResult {
  const threshold = options.threshold ?? snapThreshold;
  const edges = options.edges ?? { left: true, right: true, top: true, bottom: true };
  const isMove = !options.edges;
  const spacing = options.spacing ?? [6, 12];
  const margin = options.containerMargin ?? 12;
  const mb = options.movingBaseline;

  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  const pushX = (target: number, edge: number, priority: number) => {
    const d = target - edge;
    if (Math.abs(d) <= threshold) xs.push({ delta: d, priority });
  };
  const pushY = (target: number, edge: number, priority: number) => {
    const d = target - edge;
    if (Math.abs(d) <= threshold) ys.push({ delta: d, priority });
  };

  for (const s of siblings) {
    const r = s.rect;
    if (edges.left) {
      pushX(r.x, moving.x, 1);
      if (overlapY(moving, r) > -threshold) for (const g of spacing) pushX(right(r) + g, moving.x, 2);
    }
    if (edges.right) {
      pushX(right(r), right(moving), 1);
      if (overlapY(moving, r) > -threshold) for (const g of spacing) pushX(r.x - g, right(moving), 2);
    }
    if (isMove) pushX(cx(r), cx(moving), 3);
    if (edges.top) {
      pushY(r.y, moving.y, 1);
      if (overlapX(moving, r) > -threshold) for (const g of spacing) pushY(bottom(r) + g, moving.y, 2);
    }
    if (edges.bottom) {
      pushY(bottom(r), bottom(moving), 1);
      if (overlapX(moving, r) > -threshold) for (const g of spacing) pushY(r.y - g, bottom(moving), 2);
    }
    if (isMove) pushY(cy(r), cy(moving), 3);
    if (isMove && mb !== undefined && s.baseline !== undefined) pushY(s.baseline, moving.y + mb, 0);
  }
  if (edges.left) pushX(container.x + margin, moving.x, 4);
  if (edges.right) pushX(right(container) - margin, right(moving), 4);
  if (edges.top) pushY(container.y + margin, moving.y, 4);
  if (edges.bottom) pushY(bottom(container) - margin, bottom(moving), 4);

  const best = (cands: Candidate[]) => {
    let pick: Candidate | undefined;
    for (const c of cands) {
      if (!pick) pick = c;
      else {
        const da = Math.abs(c.delta);
        const db = Math.abs(pick.delta);
        if (da < db - 0.5 || (Math.abs(da - db) <= 0.5 && c.priority < pick.priority)) pick = c;
      }
    }
    return pick?.delta ?? 0;
  };
  const dx = Math.round(best(xs));
  const dy = Math.round(best(ys));

  const snapped: Rect = { ...moving };
  if (isMove) {
    snapped.x += dx;
    snapped.y += dy;
  } else {
    if (edges.left) {
      snapped.x += dx;
      snapped.width -= dx;
    } else if (edges.right) snapped.width += dx;
    if (edges.top) {
      snapped.y += dy;
      snapped.height -= dy;
    } else if (edges.bottom) snapped.height += dy;
  }
  return { dx, dy, lines: describeSnaplines(snapped, siblings, container, { edges, isMove, spacing, margin, movingBaseline: mb }) };
}

function describeSnaplines(
  m: Rect,
  siblings: SnapTarget[],
  container: Rect,
  o: { edges: SnapEdges; isMove: boolean; spacing: number[]; margin: number; movingBaseline?: number }
): Snapline[] {
  const lines: Snapline[] = [];
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const seen = new Set<string>();
  const add = (l: Snapline) => {
    const k = `${l.kind}:${l.orientation}:${Math.round(l.x1)}:${Math.round(l.y1)}:${Math.round(l.x2)}:${Math.round(l.y2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    lines.push(l);
  };
  let baselineHit = false;
  for (const s of siblings) {
    if (o.isMove && o.movingBaseline !== undefined && s.baseline !== undefined && eq(s.baseline, m.y + o.movingBaseline)) {
      baselineHit = true;
      const y = s.baseline;
      add({ kind: 'baseline', orientation: 'horizontal', x1: Math.min(m.x, s.rect.x), y1: y, x2: Math.max(right(m), right(s.rect)), y2: y });
    }
  }
  for (const s of siblings) {
    const r = s.rect;
    const vSpan = (x: number) => ({ y1: Math.min(m.y, r.y), y2: Math.max(bottom(m), bottom(r)), x1: x, x2: x });
    const hSpan = (y: number) => ({ x1: Math.min(m.x, r.x), x2: Math.max(right(m), right(r)), y1: y, y2: y });
    if (o.edges.left && eq(m.x, r.x)) add({ kind: 'edge', orientation: 'vertical', ...vSpan(m.x) });
    if (o.edges.right && eq(right(m), right(r))) add({ kind: 'edge', orientation: 'vertical', ...vSpan(right(m)) });
    if (o.isMove && eq(cx(m), cx(r))) add({ kind: 'center', orientation: 'vertical', ...vSpan(cx(m)) });
    if (!baselineHit) {
      if (o.edges.top && eq(m.y, r.y)) add({ kind: 'edge', orientation: 'horizontal', ...hSpan(m.y) });
      if (o.edges.bottom && eq(bottom(m), bottom(r))) add({ kind: 'edge', orientation: 'horizontal', ...hSpan(bottom(m)) });
      if (o.isMove && eq(cy(m), cy(r))) add({ kind: 'center', orientation: 'horizontal', ...hSpan(cy(m)) });
    }
    for (const g of o.spacing) {
      const ov = overlapY(m, r);
      const yMid = ov > 0 ? Math.max(m.y, r.y) + ov / 2 : cy(m);
      if (o.edges.left && eq(m.x, right(r) + g)) add({ kind: 'margin', orientation: 'horizontal', x1: right(r), x2: m.x, y1: yMid, y2: yMid, label: String(g) });
      if (o.edges.right && eq(right(m), r.x - g)) add({ kind: 'margin', orientation: 'horizontal', x1: right(m), x2: r.x, y1: yMid, y2: yMid, label: String(g) });
      const ox = overlapX(m, r);
      const xMid = ox > 0 ? Math.max(m.x, r.x) + ox / 2 : cx(m);
      if (o.edges.top && eq(m.y, bottom(r) + g)) add({ kind: 'margin', orientation: 'vertical', y1: bottom(r), y2: m.y, x1: xMid, x2: xMid, label: String(g) });
      if (o.edges.bottom && eq(bottom(m), r.y - g)) add({ kind: 'margin', orientation: 'vertical', y1: bottom(m), y2: r.y, x1: xMid, x2: xMid, label: String(g) });
    }
  }
  const mg = o.margin;
  if (o.edges.left && eq(m.x, container.x + mg)) add({ kind: 'padding', orientation: 'horizontal', x1: container.x, x2: m.x, y1: cy(m), y2: cy(m), label: String(mg) });
  if (o.edges.right && eq(right(m), right(container) - mg)) add({ kind: 'padding', orientation: 'horizontal', x1: right(m), x2: right(container), y1: cy(m), y2: cy(m), label: String(mg) });
  if (o.edges.top && eq(m.y, container.y + mg)) add({ kind: 'padding', orientation: 'vertical', y1: container.y, y2: m.y, x1: cx(m), x2: cx(m), label: String(mg) });
  if (o.edges.bottom && eq(bottom(m), bottom(container) - mg)) add({ kind: 'padding', orientation: 'vertical', y1: bottom(m), y2: bottom(container), x1: cx(m), x2: cx(m), label: String(mg) });
  return lines;
}

export function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}
