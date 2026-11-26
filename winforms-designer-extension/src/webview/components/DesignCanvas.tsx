// Zoomable, pannable design surface: renders the form, and owns all direct
// manipulation (select, marquee, move, resize, reparent, snaplines, placement,
// splitter drag, form resize, tab order, inline edit, smart tags, context menu).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getControlDefinition } from '../../shared/catalog';
import type { DesignDocument, DesignNode } from '../../shared/model';
import {
  ancestorsOf,
  findNode,
  getNode,
  isMovable,
  newStripItem,
  reparentNodes,
  setNodeRect,
  setProps,
  setStripItems,
  topLevelIds,
  updateNode,
  updateNodes,
  type DesignerState,
  type DesignerStore,
  type InsertTarget,
} from '../state/designerStore';
import {
  computeSnaplines,
  getActiveTabIndex,
  isContainerNode,
  rectsIntersect,
  SNAP_BLUE,
  SNAP_MAGENTA,
  tableCellAtPoint,
  type Rect,
  type SlotLayout,
  type Snapline,
  type SnapTarget,
} from '../state/layoutEngine';
import { baselineOffset, clampSize, displayText, getDock, getEnum, getFont, getLocation, getNumber, getSize, getText, isRootNode } from '../state/nodeProps';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { Icon } from './ControlIcons';
import { FormClient, formSurfaceStyle, type RenderContext } from './ControlRenderer';
import { FormChrome, frameMetrics } from './FormChrome';
import { SmartTagPanel } from './SmartTag';

const PAD = 40;
export const TOOLBOX_MIME = 'application/x-winforms-control';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface DropTarget {
  containerId: string;
  slot: 'main' | 'Panel1' | 'Panel2';
}

interface MoveItem {
  id: string;
  abs: Rect;
  loc: { x: number; y: number };
  size: { width: number; height: number };
  movable: boolean;
}

type Gesture =
  | { kind: 'move'; pointerId: number; sx: number; sy: number; started: boolean; items: MoveItem[]; primaryId: string; parentId: string; slot: string; target?: DropTarget; fdx: number; fdy: number; clickId: string; wasSelected: boolean; additive: boolean }
  | { kind: 'resize'; pointerId: number; sx: number; sy: number; started: boolean; handle: Handle; items: MoveItem[]; primaryId: string }
  | { kind: 'formResize'; pointerId: number; sx: number; sy: number; started: boolean; handle: 'e' | 's' | 'se'; size: { width: number; height: number } }
  | { kind: 'splitter'; pointerId: number; sx: number; sy: number; started: boolean; nodeId: string; dist: number; vertical: boolean; extent: number; sw: number; min1: number; min2: number }
  | { kind: 'marquee'; pointerId: number; sx: number; sy: number; started: boolean; containerId: string; slot: string; base: string[] }
  | { kind: 'place'; pointerId: number; sx: number; sy: number; started: boolean; type: string; target: DropTarget }
  | { kind: 'pan'; pointerId: number; cx: number; cy: number; left: number; top: number };

interface Overlay {
  lines: Snapline[];
  drop: { rect: Rect; label: string } | null;
  marquee: Rect | null;
  ghosts: Rect[];
  tip: { x: number; y: number; text: string } | null;
}

const EMPTY_OVERLAY: Overlay = { lines: [], drop: null, marquee: null, ghosts: [], tip: null };

function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

function allowedHandles(doc: DesignDocument, node: DesignNode, locked: boolean): Set<Handle> {
  if (locked || isRootNode(node)) return new Set();
  const f = findNode(doc, node.id);
  if (f?.parent?.type === 'TabControl') return new Set();
  switch (getDock(node)) {
    case 'Fill':
      return new Set();
    case 'Top':
      return new Set(['s']);
    case 'Bottom':
      return new Set(['n']);
    case 'Left':
      return new Set(['e']);
    case 'Right':
      return new Set(['w']);
  }
  if (f?.parent && (f.parent.type === 'FlowLayoutPanel' || f.parent.type === 'TableLayoutPanel')) return new Set(['e', 's', 'se']);
  return new Set(HANDLES);
}

function handleCursor(h: Handle): string {
  return h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'ne' || h === 'sw' ? 'nesw-resize' : 'nwse-resize';
}

/**
 * Insertion index for a drop into a FlowLayoutPanel, following its FlowDirection: the first child whose
 * midpoint along the flow axis lies past the pointer (on the pointer's line) receives the drop.
 */
function flowInsertIndex(panel: DesignNode, kids: DesignNode[], p: { x: number; y: number }, layout: DesignerState['layout']): number {
  const dir = getEnum(panel, 'FlowDirection', 'LeftToRight');
  const horizontal = dir === 'LeftToRight' || dir === 'RightToLeft';
  for (let i = 0; i < kids.length; i++) {
    const b = layout.get(kids[i].id)?.bounds;
    if (!b) continue;
    // Lines are rows for horizontal flow and columns for vertical flow; earlier lines never take the drop.
    const beforeLine = horizontal ? p.y < b.y : p.x < b.x;
    const onLine = horizontal ? p.y >= b.y && p.y < b.y + b.height : p.x >= b.x && p.x < b.x + b.width;
    if (beforeLine) return i;
    if (!onLine) continue;
    switch (dir) {
      case 'RightToLeft':
        if (p.x > b.x + b.width / 2) return i;
        break;
      case 'TopDown':
        if (p.y < b.y + b.height / 2) return i;
        break;
      case 'BottomUp':
        if (p.y > b.y + b.height / 2) return i;
        break;
      default:
        if (p.x < b.x + b.width / 2) return i;
    }
  }
  return kids.length;
}

function tabOrderLabel(doc: DesignDocument, node: DesignNode): string {
  const chain = [...ancestorsOf(doc, node.id).filter((a) => !isRootNode(a)), node];
  return chain.map((n) => getNumber(n, 'TabIndex', 0)).join('.');
}

export function DesignCanvas({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const doc = state.doc!;
  const root = doc.form;
  const { layout, zoom, settings } = state;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastMoveRef = useRef<PointerEvent | null>(null);
  const spaceRef = useRef(false);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [smartTag, setSmartTag] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [toolboxDrop, setToolboxDrop] = useState<{ rect: Rect; label: string } | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [dragging, setDragging] = useState<Gesture['kind'] | null>(null);

  const style = settings.renderStyle;
  const fm = frameMetrics(root, style);
  const clientSize = getSize(root);
  const frameW = clientSize.width + fm.border * 2;
  const frameH = clientSize.height + fm.caption + fm.border * 2;
  const clientOffset = { x: PAD + fm.border * zoom, y: PAD + (fm.border + fm.caption) * zoom };

  // ---- viewport / zoom ------------------------------------------------------

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setViewport({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fit = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const z = Math.min((el.clientWidth - PAD * 2) / frameW, (el.clientHeight - PAD * 2) / frameH);
      store.setZoom(Math.max(0.25, Math.min(2, Math.floor(z * 100) / 100)));
    };
    window.addEventListener('wd-fit', fit);
    return () => window.removeEventListener('wd-fit', fit);
  }, [frameW, frameH, store]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left + el.scrollLeft;
      const py = e.clientY - r.top + el.scrollTop;
      const old = store.getState().zoom;
      const next = Math.min(4, Math.max(0.25, +(old * Math.exp(-e.deltaY * 0.0015)).toFixed(3)));
      store.setZoom(next);
      const ratio = store.getState().zoom / old;
      requestAnimationFrame(() => {
        el.scrollLeft = (px - PAD) * ratio + PAD - (e.clientX - r.left);
        el.scrollTop = (py - PAD) * ratio + PAD - (e.clientY - r.top);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"]')) {
        if (!spaceRef.current) {
          spaceRef.current = true;
          setCursor('grab');
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setCursor(undefined);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- coordinate helpers ---------------------------------------------------

  const toDesign = useCallback(
    (clientX: number, clientY: number) => {
      const r = clientRef.current?.getBoundingClientRect();
      const z = store.getState().zoom;
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
    },
    [store]
  );

  const slotOf = useCallback((containerId: string, slot: string): SlotLayout | undefined => {
    const nl = store.getState().layout.get(containerId);
    return nl?.slots?.find((s) => s.slot === slot) ?? nl?.slots?.[0];
  }, [store]);

  const findDropTarget = useCallback(
    (clientX: number, clientY: number, exclude: Set<string>): DropTarget => {
      const st = store.getState();
      const d = st.doc!;
      const excludedEls = [...exclude]
        .map((id) => clientRef.current?.querySelector(`[data-node-id="${CSS.escape(id)}"]`))
        .filter((x): x is Element => !!x);
      for (const el of document.elementsFromPoint(clientX, clientY)) {
        if (!(el instanceof HTMLElement)) continue;
        const cid = el.dataset.containerId;
        if (!cid) continue;
        if (excludedEls.some((m) => m.contains(el))) continue;
        const node = getNode(d, cid);
        if (!node) continue;
        if (node.type === 'TabControl') {
          const page = node.children[getActiveTabIndex(node, { activeTabs: st.activeTabs })];
          if (!page || exclude.has(page.id)) continue;
          return { containerId: page.id, slot: 'main' };
        }
        return { containerId: cid, slot: (el.dataset.slot as DropTarget['slot']) ?? 'main' };
      }
      return { containerId: d.form.id, slot: 'main' };
    },
    [store]
  );

  const snapTargets = useCallback(
    (containerId: string, slot: string, exclude: Set<string>): SnapTarget[] => {
      const st = store.getState();
      const container = getNode(st.doc!, containerId);
      if (!container) return [];
      const ambient = getFont(container);
      const out: SnapTarget[] = [];
      for (const k of container.children) {
        if (exclude.has(k.id)) continue;
        if (container.type === 'SplitContainer' && (k.panelSlot ?? 'Panel1') !== slot) continue;
        const nl = st.layout.get(k.id);
        if (!nl || nl.hidden) continue;
        const b = baselineOffset(k, nl.bounds.height, getFont(k, ambient));
        out.push({ rect: nl.bounds, baseline: b !== undefined ? nl.bounds.y + b : undefined });
      }
      return out;
    },
    [store]
  );

  const dropLabel = (t: DropTarget) => {
    const n = getNode(store.getState().doc!, t.containerId);
    return `Drop into ${n?.name ?? 'form'}${n?.type === 'SplitContainer' ? `.${t.slot}` : ''}`;
  };

  // ---- gesture processing ---------------------------------------------------

  const processMove = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      const st = store.getState();
      const d = st.doc!;
      if (g.kind === 'pan') {
        const el = scrollerRef.current;
        if (el) {
          el.scrollLeft = g.left - (e.clientX - g.cx);
          el.scrollTop = g.top - (e.clientY - g.cy);
        }
        return;
      }
      const p = toDesign(e.clientX, e.clientY);
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (!g.started) {
        if (Math.hypot(dx * st.zoom, dy * st.zoom) < 3) return;
        g.started = true;
        setDragging(g.kind);
        if (g.kind !== 'marquee' && g.kind !== 'place') store.beginGesture();
      }
      const grid = settings.gridSize;
      const useGrid = st.settings.layoutMode === 'grid' && !e.altKey;
      const useSnap = st.settings.layoutMode === 'snaplines' && !e.altKey;
      const threshold = Math.max(2, 6 / st.zoom);

      switch (g.kind) {
        case 'move': {
          const exclude = new Set(g.items.map((i) => i.id));
          const target = findDropTarget(e.clientX, e.clientY, exclude);
          g.target = target;
          const primary = g.items.find((i) => i.id === g.primaryId) ?? g.items[0];
          const rect: Rect = { ...primary.abs, x: primary.abs.x + dx, y: primary.abs.y + dy };
          const slot = slotOf(target.containerId, target.slot);
          const tnode = getNode(d, target.containerId);
          const managedTarget = tnode?.type === 'FlowLayoutPanel' || tnode?.type === 'TableLayoutPanel';
          let sdx = 0;
          let sdy = 0;
          let lines: Snapline[] = [];
          if (slot && !managedTarget) {
            if (useSnap) {
              const res = computeSnaplines(rect, snapTargets(target.containerId, target.slot, exclude), slot.display, threshold, {
                movingBaseline: baselineOffset(getNode(d, primary.id)!, primary.abs.height, getFont(getNode(d, primary.id)!)),
              });
              sdx = res.dx;
              sdy = res.dy;
              lines = res.lines;
            } else if (useGrid) {
              const rx = rect.x - slot.origin.x;
              const ry = rect.y - slot.origin.y;
              sdx = Math.round(rx / grid) * grid - rx;
              sdy = Math.round(ry / grid) * grid - ry;
            }
          }
          g.fdx = Math.round(dx + sdx);
          g.fdy = Math.round(dy + sdy);
          const movable = g.items.filter((i) => i.movable);
          store.updateGesture((base) =>
            updateNodes(base, movable.map((i) => i.id), (n) => {
              const it = movable.find((m) => m.id === n.id)!;
              return setNodeRect(n, { x: it.loc.x + g.fdx, y: it.loc.y + g.fdy });
            })
          );
          const reparenting = target.containerId !== g.parentId || target.slot !== g.slot || managedTarget;
          const tnl = st.layout.get(target.containerId);
          const tslot = tnl?.slots?.find((s) => s.slot === target.slot) ?? tnl?.slots?.[0];
          const relX = primary.abs.x + g.fdx - (slot?.origin.x ?? 0);
          const relY = primary.abs.y + g.fdy - (slot?.origin.y ?? 0);
          setOverlay({
            lines,
            drop: reparenting && tslot ? { rect: tslot.clip, label: dropLabel(target) } : null,
            marquee: null,
            ghosts: g.items.map((i) => ({ ...i.abs, x: i.abs.x + g.fdx, y: i.abs.y + g.fdy })),
            tip: { x: primary.abs.x + g.fdx, y: primary.abs.y + g.fdy + primary.abs.height, text: `${Math.round(relX)}, ${Math.round(relY)}` },
          });
          break;
        }
        case 'resize': {
          const h = g.handle;
          const primary = g.items.find((i) => i.id === g.primaryId) ?? g.items[0];
          const r = primary.abs;
          const edges = { left: h.includes('w'), right: h.includes('e'), top: h.includes('n'), bottom: h.includes('s') };
          const nr: Rect = {
            x: r.x + (edges.left ? dx : 0),
            y: r.y + (edges.top ? dy : 0),
            width: r.width + (edges.right ? dx : edges.left ? -dx : 0),
            height: r.height + (edges.bottom ? dy : edges.top ? -dy : 0),
          };
          const nl = st.layout.get(primary.id);
          const pslot = nl?.parentId ? slotOf(nl.parentId, nl.slot ?? 'main') : undefined;
          let lines: Snapline[] = [];
          if (pslot && useSnap) {
            const res = computeSnaplines(nr, snapTargets(nl!.parentId!, nl!.slot ?? 'main', new Set(g.items.map((i) => i.id))), pslot.display, threshold, { edges });
            if (edges.left) {
              nr.x += res.dx;
              nr.width -= res.dx;
            } else if (edges.right) nr.width += res.dx;
            if (edges.top) {
              nr.y += res.dy;
              nr.height -= res.dy;
            } else if (edges.bottom) nr.height += res.dy;
            lines = res.lines;
          } else if (pslot && useGrid) {
            const snap = (v: number, o: number) => Math.round((v - o) / grid) * grid + o;
            if (edges.left) {
              const nx = snap(nr.x, pslot.origin.x);
              nr.width += nr.x - nx;
              nr.x = nx;
            }
            if (edges.right) nr.width = snap(nr.x + nr.width, pslot.origin.x) - nr.x;
            if (edges.top) {
              const ny = snap(nr.y, pslot.origin.y);
              nr.height += nr.y - ny;
              nr.y = ny;
            }
            if (edges.bottom) nr.height = snap(nr.y + nr.height, pslot.origin.y) - nr.y;
          }
          if (nr.width < 1) {
            if (edges.left) nr.x = r.x + r.width - 1;
            nr.width = 1;
          }
          if (nr.height < 1) {
            if (edges.top) nr.y = r.y + r.height - 1;
            nr.height = 1;
          }
          const ddx = Math.round(nr.x - r.x);
          const ddy = Math.round(nr.y - r.y);
          const dw = Math.round(nr.width - r.width);
          const dh = Math.round(nr.height - r.height);
          store.updateGesture((base) =>
            updateNodes(base, g.items.map((i) => i.id), (n) => {
              const it = g.items.find((m) => m.id === n.id)!;
              const sz = clampSize(n, it.size.width + dw, it.size.height + dh);
              if (getDock(n) !== 'None') return setNodeRect(n, sz);
              return setNodeRect(n, { x: it.loc.x + ddx, y: it.loc.y + ddy, ...sz });
            })
          );
          const finalNode = getNode(store.getState().doc!, primary.id);
          const fs = finalNode ? getSize(finalNode) : { width: nr.width, height: nr.height };
          setOverlay({ ...EMPTY_OVERLAY, lines, tip: { x: nr.x + nr.width, y: nr.y + nr.height, text: `${fs.width} × ${fs.height}` } });
          break;
        }
        case 'formResize': {
          let w = g.size.width + (g.handle !== 's' ? dx : 0);
          let h = g.size.height + (g.handle !== 'e' ? dy : 0);
          if (useGrid) {
            w = Math.round(w / grid) * grid;
            h = Math.round(h / grid) * grid;
          }
          const sz = clampSize(d.form, Math.max(40, w), Math.max(30, h));
          store.updateGesture((base) => updateNode(base, base.form.id, (n) => setNodeRect(n, sz)));
          setOverlay({ ...EMPTY_OVERLAY, tip: { x: sz.width, y: sz.height, text: `${sz.width} × ${sz.height}` } });
          break;
        }
        case 'splitter': {
          const delta = g.vertical ? dx : dy;
          // Same bounds WinForms (and the auditor) enforce: Panel1MinSize <= distance <= extent - SplitterWidth - Panel2MinSize.
          const max = Math.max(g.min1, g.extent - g.sw - g.min2);
          const dist = Math.round(Math.min(max, Math.max(g.min1, g.dist + delta)));
          store.updateGesture((base) => updateNode(base, g.nodeId, (n) => setProps(n, { SplitterDistance: dist })));
          const nl = st.layout.get(g.nodeId);
          setOverlay({ ...EMPTY_OVERLAY, tip: nl ? { x: nl.bounds.x + (g.vertical ? dist : 8), y: nl.bounds.y + (g.vertical ? 24 : dist), text: `SplitterDistance ${dist}` } : null });
          break;
        }
        case 'marquee': {
          const rect = normRect(g.sx, g.sy, p.x, p.y);
          const container = getNode(d, g.containerId);
          const hits = (container?.children ?? [])
            .filter((k) => (container?.type === 'SplitContainer' ? (k.panelSlot ?? 'Panel1') === g.slot : true))
            .filter((k) => {
              const nl = st.layout.get(k.id);
              return nl && !nl.hidden && rectsIntersect(nl.bounds, rect);
            })
            .map((k) => k.id);
          const sel = [...g.base, ...hits.filter((h) => !g.base.includes(h))];
          const prevSel = st.selection;
          if (sel.length !== prevSel.length || sel.some((s, i) => s !== prevSel[i])) store.setState({ selection: sel.length ? sel : [g.containerId] });
          setOverlay({ ...EMPTY_OVERLAY, marquee: rect });
          break;
        }
        case 'place': {
          let r = normRect(g.sx, g.sy, p.x, p.y);
          if (useGrid) {
            const snap = (v: number) => Math.round(v / grid) * grid;
            r = normRect(snap(g.sx), snap(g.sy), snap(p.x), snap(p.y));
          }
          setOverlay({ ...EMPTY_OVERLAY, marquee: r, tip: { x: r.x + r.width, y: r.y + r.height, text: `${Math.round(r.width)} × ${Math.round(r.height)}` } });
          break;
        }
      }
    },
    [findDropTarget, settings.gridSize, slotOf, snapTargets, store, toDesign]
  );

  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current;
      // Only the pointer that started the gesture drives it (ignore a second finger / pen).
      if (!g || e.pointerId !== g.pointerId) return;
      lastMoveRef.current = e;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (lastMoveRef.current) processMove(lastMoveRef.current);
      });
    },
    [processMove]
  );

  const finishGesture = useCallback(
    (e: PointerEvent, cancelled = false) => {
      const g = gestureRef.current;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Flush the final pointer position while the gesture is still live, so a fast release lands
      // exactly where the pointer went up (processMove is a no-op once gestureRef is cleared).
      if (!cancelled && g && g.kind !== 'pan') processMove(e);
      gestureRef.current = null;
      lastMoveRef.current = null;
      setOverlay(EMPTY_OVERLAY);
      setDragging(null);
      if (!g) return;
      if (g.kind === 'pan') {
        setCursor(spaceRef.current ? 'grab' : undefined);
        return;
      }
      if (cancelled) {
        store.cancelGesture();
        return;
      }
      const st = store.getState();
      const d = st.doc!;
      switch (g.kind) {
        case 'move': {
          if (!g.started) {
            if (!g.additive && g.wasSelected) {
              if (st.selection.length > 1) store.setPrimary(g.clickId);
              else store.select([g.clickId]);
            }
            return;
          }
          const target = g.target;
          const tnode = target ? getNode(d, target.containerId) : undefined;
          const managedTarget = tnode?.type === 'FlowLayoutPanel' || tnode?.type === 'TableLayoutPanel';
          if (target && tnode && (target.containerId !== g.parentId || target.slot !== g.slot || managedTarget)) {
            const p = toDesign(e.clientX, e.clientY);
            const ids = g.items.map((i) => i.id);
            const tnl = st.layout.get(target.containerId);
            const slot = slotOf(target.containerId, target.slot);
            store.updateGesture((base) => {
              const moved = updateNodes(base, g.items.filter((i) => i.movable).map((i) => i.id), (n) => {
                const it = g.items.find((m) => m.id === n.id)!;
                return setNodeRect(n, { x: it.loc.x + g.fdx, y: it.loc.y + g.fdy });
              });
              if (tnode.type === 'TableLayoutPanel' && tnl) {
                const cell = tableCellAtPoint(tnl, p.x, p.y);
                const occupant = tnode.children.find((c) => {
                  const cnl = st.layout.get(c.id);
                  return cnl?.cell && cell && cnl.cell.column === cell.column && cnl.cell.row === cell.row && !ids.includes(c.id);
                });
                const movingNode = getNode(d, ids[0]);
                const explicitCell = cell
                  ? { explicit: true, column: cell.column, row: cell.row, columnSpan: movingNode?.tableCell?.columnSpan, rowSpan: movingNode?.tableCell?.rowSpan }
                  : undefined;
                let next = reparentNodes(moved, ids.slice(0, 1), { parentId: tnode.id, cell: explicitCell }, {});
                if (occupant && target.containerId === g.parentId) {
                  // Swap: the displaced control takes the dragged control's old cell, explicitly.
                  const from = st.layout.get(ids[0])?.cell;
                  if (from)
                    next = updateNode(next, occupant.id, (n) => ({
                      ...n,
                      tableCell: { explicit: true, column: from.column, row: from.row, columnSpan: n.tableCell?.columnSpan, rowSpan: n.tableCell?.rowSpan },
                    }));
                }
                return next;
              }
              if (tnode.type === 'FlowLayoutPanel') {
                const kids = tnode.children.filter((c) => !ids.includes(c.id));
                const index = flowInsertIndex(tnode, kids, p, st.layout);
                return reparentNodes(moved, ids, { parentId: tnode.id, index }, {});
              }
              const locations: Record<string, { x: number; y: number }> = {};
              for (const it of g.items) {
                locations[it.id] = { x: Math.round(it.abs.x + g.fdx - (slot?.origin.x ?? 0)), y: Math.round(it.abs.y + g.fdy - (slot?.origin.y ?? 0)) };
              }
              const t: InsertTarget = { parentId: tnode.id, slot: target.slot === 'main' ? undefined : target.slot };
              return reparentNodes(moved, ids, t, locations);
            });
            store.endGesture(`Move to ${tnode.name}`);
          } else {
            store.endGesture(g.items.length === 1 ? `Move ${getNode(d, g.items[0].id)?.name ?? ''}` : `Move ${g.items.length} controls`);
          }
          break;
        }
        case 'resize':
          if (g.started) store.endGesture(g.items.length === 1 ? `Resize ${getNode(d, g.items[0].id)?.name ?? ''}` : `Resize ${g.items.length} controls`);
          break;
        case 'formResize':
          if (g.started) store.endGesture(`Resize ${d.form.name}`);
          break;
        case 'splitter':
          if (g.started) store.endGesture('Move splitter');
          break;
        case 'marquee':
          if (!g.started) store.select([g.containerId]);
          break;
        case 'place': {
          const p = toDesign(e.clientX, e.clientY);
          const slot = slotOf(g.target.containerId, g.target.slot);
          let r = normRect(g.sx, g.sy, p.x, p.y);
          if (st.settings.layoutMode === 'grid') {
            const gs = st.settings.gridSize;
            const snap = (v: number) => Math.round(v / gs) * gs;
            r = normRect(snap(g.sx), snap(g.sy), snap(p.x), snap(p.y));
          }
          const big = g.started && r.width >= 4 && r.height >= 4;
          const ox = slot?.origin.x ?? 0;
          const oy = slot?.origin.y ?? 0;
          const tnode = getNode(d, g.target.containerId);
          const tnl = st.layout.get(g.target.containerId);
          const hitCell = tnode?.type === 'TableLayoutPanel' && tnl ? tableCellAtPoint(tnl, g.sx, g.sy) : undefined;
          const cell = hitCell ? { ...hitCell, explicit: true } : undefined;
          store.addControl(
            g.type,
            { parentId: g.target.containerId, slot: g.target.slot === 'main' ? undefined : g.target.slot, cell },
            big ? { x: r.x - ox, y: r.y - oy, width: Math.round(r.width), height: Math.round(r.height) } : { x: Math.round(g.sx - ox), y: Math.round(g.sy - oy) }
          );
          break;
        }
      }
    },
    [processMove, slotOf, store, toDesign]
  );

  useEffect(() => {
    const up = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (g && e.pointerId === g.pointerId) finishGesture(e);
    };
    const cancel = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (g && e.pointerId === g.pointerId) finishGesture(e, true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gestureRef.current) {
        e.stopPropagation();
        finishGesture(new PointerEvent('pointerup'), true);
      }
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
    };
  }, [finishGesture, onWindowMove]);

  useEffect(
    () => () => {
      // Unmount: never let a queued frame touch a disposed canvas or a stale gesture.
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      gestureRef.current = null;
      lastMoveRef.current = null;
    },
    []
  );

  // ---- pointer down entry points --------------------------------------------

  const beginResize = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;
    const st = store.getState();
    const d = st.doc!;
    const ids = st.selection.filter((id) => {
      const n = getNode(d, id);
      return n && !n.isComponent && !isRootNode(n) && allowedHandles(d, n, st.locked || st.readOnly).size > 0;
    });
    if (!ids.length) return;
    const p = toDesign(e.clientX, e.clientY);
    gestureRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      sx: p.x,
      sy: p.y,
      started: false,
      handle,
      primaryId: ids.includes(st.selection[0]) ? st.selection[0] : ids[0],
      items: ids.map((id) => {
        const n = getNode(d, id)!;
        return { id, abs: st.layout.get(id)!.bounds, loc: getLocation(n), size: getSize(n), movable: true };
      }),
    };
  };

  const beginFormResize = (e: React.PointerEvent, handle: 'e' | 's' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0 || store.getState().locked || store.getState().readOnly) return;
    const p = toDesign(e.clientX, e.clientY);
    store.select([root.id]);
    gestureRef.current = { kind: 'formResize', pointerId: e.pointerId, sx: p.x, sy: p.y, started: false, handle, size: getSize(store.getState().doc!.form) };
  };

  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (e.button !== 0) return;
      const st = store.getState();
      if (st.locked || st.readOnly || st.tabOrderMode) return;
      e.stopPropagation();
      e.preventDefault();
      const n = getNode(st.doc!, nodeId);
      const nl = st.layout.get(nodeId);
      if (!n || !nl) return;
      store.select([nodeId]);
      const vertical = (n.properties.Orientation && typeof n.properties.Orientation === 'object' && 'value' in n.properties.Orientation ? n.properties.Orientation.value : 'Vertical') === 'Vertical';
      const p = toDesign(e.clientX, e.clientY);
      const sp = nl.container?.splitter;
      gestureRef.current = {
        kind: 'splitter',
        pointerId: e.pointerId,
        sx: p.x,
        sy: p.y,
        started: false,
        nodeId,
        dist: sp ? (vertical ? sp.x : sp.y) : getNumber(n, 'SplitterDistance', 100),
        vertical,
        extent: vertical ? nl.bounds.width : nl.bounds.height,
        sw: Math.max(1, getNumber(n, 'SplitterWidth', 4)),
        min1: Math.max(0, getNumber(n, 'Panel1MinSize', 25)),
        min2: Math.max(0, getNumber(n, 'Panel2MinSize', 25)),
      };
    },
    [store, toDesign]
  );

  const onTabClick = useCallback((tabControlId: string, index: number) => store.setActiveTab(tabControlId, index), [store]);

  const quickAddStripItem = (nodeId: string) => {
    const type0 = getNode(store.getState().doc!, nodeId)?.type;
    if (!type0) return;
    const type = type0 === 'MenuStrip' || type0 === 'ContextMenuStrip' ? 'ToolStripMenuItem' : type0 === 'StatusStrip' ? 'ToolStripStatusLabel' : 'ToolStripButton';
    const d = store.getState().doc!;
    const n = getNode(d, nodeId)!;
    const item = newStripItem(d, type);
    store.update((doc2) => setStripItems(doc2, nodeId, [...(getNode(doc2, nodeId)?.stripItems ?? n.stripItems ?? []), item]), `Add ${item.name}`, { selection: [nodeId] });
  };

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    const st = store.getState();
    const d = st.doc!;
    setMenu(null);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      const el = scrollerRef.current!;
      gestureRef.current = { kind: 'pan', pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.wd-inline-edit, .wd-smarttag, .wd-handle, .wd-form-handle')) return;
    const addTab = target.closest<HTMLElement>('[data-add-tab]');
    const frozen = st.locked || st.readOnly;
    if (addTab && !frozen) {
      e.preventDefault();
      store.addTabPage(addTab.dataset.addTab!);
      return;
    }
    const stripAdd = target.closest<HTMLElement>('[data-strip-add]');
    if (stripAdd && !frozen) {
      e.preventDefault();
      quickAddStripItem(stripAdd.dataset.stripAdd!);
      return;
    }
    const p = toDesign(e.clientX, e.clientY);
    const insideClient = clientRef.current?.contains(target);
    // Placement tool armed from the Toolbox: draw a rectangle.
    if (st.placementTool) {
      e.preventDefault();
      const t = insideClient ? findDropTarget(e.clientX, e.clientY, new Set()) : { containerId: d.form.id, slot: 'main' as const };
      const def = getControlDefinition(st.placementTool);
      if (def?.isComponent) {
        store.addControl(st.placementTool);
        return;
      }
      gestureRef.current = { kind: 'place', pointerId: e.pointerId, sx: p.x, sy: p.y, started: false, type: st.placementTool, target: t };
      return;
    }
    const nodeEl = insideClient ? target.closest<HTMLElement>('[data-node-id]') : null;
    const hitId = nodeEl?.dataset.nodeId ?? d.form.id;
    const hit = getNode(d, hitId) ?? d.form;
    if (st.tabOrderMode) {
      e.preventDefault();
      if (!isRootNode(hit)) store.assignTabIndex(hit.id);
      return;
    }
    if (!insideClient && !target.closest('[data-form-caption]')) {
      store.select([d.form.id]);
      return;
    }
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    scrollerRef.current?.focus({ preventScroll: true });
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const wasSelected = st.selection.includes(hit.id);
    const movable = !frozen && !isRootNode(hit) && isMovable(d, hit.id, st.layout);
    const parent = findNode(d, hit.id)?.parent;
    const managed = !!parent && (parent.type === 'FlowLayoutPanel' || parent.type === 'TableLayoutPanel') && !frozen;
    const container = isRootNode(hit) || (isContainerNode(hit) && !movable && !managed);
    if (additive) {
      if (!isRootNode(hit)) store.select([hit.id], 'toggle');
      if (container && isRootNode(hit)) {
        gestureRef.current = { kind: 'marquee', pointerId: e.pointerId, sx: p.x, sy: p.y, started: false, containerId: hit.id, slot: 'main', base: st.selection };
      }
      return;
    }
    if (container) {
      // Empty area of a non-movable container: start a marquee inside the clicked slot.
      const slotEl = target.closest<HTMLElement>('[data-container-id]');
      const slot = slotEl?.dataset.containerId === hit.id ? slotEl.dataset.slot ?? 'main' : 'main';
      let containerId = hit.id;
      if (hit.type === 'TabControl') {
        const page = hit.children[getActiveTabIndex(hit, { activeTabs: st.activeTabs })];
        if (page) containerId = page.id;
      }
      if (!wasSelected) store.select([hit.id]);
      gestureRef.current = { kind: 'marquee', pointerId: e.pointerId, sx: p.x, sy: p.y, started: false, containerId, slot, base: [] };
      return;
    }
    if (!wasSelected) store.select([hit.id]);
    const sel = wasSelected ? store.getState().selection : [hit.id];
    const ids = topLevelIds(d, sel).filter((id) => {
      const n = getNode(d, id);
      if (!n || n.isComponent || isRootNode(n)) return false;
      const pf = findNode(d, id)?.parent;
      return isMovable(d, id, st.layout) || (!!pf && (pf.type === 'FlowLayoutPanel' || pf.type === 'TableLayoutPanel'));
    });
    if (frozen || !ids.length || (!movable && !managed)) {
      gestureRef.current = null;
      return;
    }
    const nl = st.layout.get(hit.id);
    gestureRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      sx: p.x,
      sy: p.y,
      started: false,
      primaryId: ids.includes(hit.id) ? hit.id : ids[0],
      parentId: nl?.parentId ?? d.form.id,
      slot: nl?.slot ?? 'main',
      fdx: 0,
      fdy: 0,
      clickId: hit.id,
      wasSelected,
      additive,
      items: ids.map((id) => {
        const n = getNode(d, id)!;
        return { id, abs: st.layout.get(id)!.bounds, loc: getLocation(n), size: getSize(n), movable: isMovable(d, id, st.layout) };
      }),
    };
  };

  const onSurfacePointerMove = (e: React.PointerEvent) => {
    if (gestureRef.current) return;
    const target = e.target as HTMLElement;
    const nodeEl = clientRef.current?.contains(target) ? target.closest<HTMLElement>('[data-node-id]') : null;
    const id = nodeEl?.dataset.nodeId ?? null;
    if (store.getState().hoverId !== id) store.setState({ hoverId: id });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = store.getState();
    if (st.tabOrderMode || st.placementTool) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-tab-index], [data-add-tab], [data-strip-add], .wd-handle, .wd-form-handle, .wd-inline-edit, .wd-smarttag')) return;
    if (!clientRef.current?.contains(target) && !target.closest('[data-form-caption]')) return;
    const nodeEl = clientRef.current?.contains(target) ? target.closest<HTMLElement>('[data-node-id]') : null;
    const id = nodeEl?.dataset.nodeId ?? st.doc!.form.id;
    store.navigateToDefaultEvent(id);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const st = store.getState();
    const target = e.target as HTMLElement;
    const nodeEl = clientRef.current?.contains(target) ? target.closest<HTMLElement>('[data-node-id]') : null;
    const id = nodeEl?.dataset.nodeId ?? st.doc!.form.id;
    if (!st.selection.includes(id)) store.select([id]);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // ---- toolbox HTML5 drag & drop ----------------------------------------------

  const onDragOver = (e: React.DragEvent) => {
    const type = store.getState().draggingToolboxType;
    if (!type && !e.dataTransfer.types.includes(TOOLBOX_MIME)) return;
    if (store.getState().readOnly) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const def = type ? getControlDefinition(type) : undefined;
    if (def?.isComponent) {
      if (toolboxDrop) setToolboxDrop(null);
      return;
    }
    const t = findDropTarget(e.clientX, e.clientY, new Set());
    const slot = slotOf(t.containerId, t.slot);
    if (slot) {
      const label = dropLabel(t);
      if (!toolboxDrop || toolboxDrop.label !== label) setToolboxDrop({ rect: slot.clip, label });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(TOOLBOX_MIME) || store.getState().draggingToolboxType;
    setToolboxDrop(null);
    store.setState({ draggingToolboxType: null });
    if (!type) return;
    e.preventDefault();
    if (store.getState().readOnly) {
      store.addControl(type); // refused by the store with a read-only status message
      return;
    }
    const def = getControlDefinition(type);
    if (def?.isComponent) {
      store.addControl(type);
      return;
    }
    const t = findDropTarget(e.clientX, e.clientY, new Set());
    const slot = slotOf(t.containerId, t.slot);
    const p = toDesign(e.clientX, e.clientY);
    const st = store.getState();
    let x = p.x - (slot?.origin.x ?? 0);
    let y = p.y - (slot?.origin.y ?? 0);
    if (st.settings.layoutMode === 'grid') {
      x = Math.round(x / st.settings.gridSize) * st.settings.gridSize;
      y = Math.round(y / st.settings.gridSize) * st.settings.gridSize;
    }
    const tnode = getNode(st.doc!, t.containerId);
    const tnl = st.layout.get(t.containerId);
    const hitCell = tnode?.type === 'TableLayoutPanel' && tnl ? tableCellAtPoint(tnl, p.x, p.y) : undefined;
    const cell = hitCell ? { ...hitCell, explicit: true } : undefined;
    store.addControl(type, { parentId: t.containerId, slot: t.slot === 'main' ? undefined : t.slot, cell }, { x: Math.round(x), y: Math.round(y) });
  };

  // ---- render ---------------------------------------------------------------

  const ctx: RenderContext = useMemo(
    () => ({
      layout,
      renderStyle: style,
      resourceDataUris: state.resourceDataUris,
      mode: 'design',
      locked: state.locked || state.readOnly,
      onTabClick,
      onSplitterPointerDown,
    }),
    [layout, style, state.resourceDataUris, state.locked, state.readOnly, onTabClick, onSplitterPointerDown]
  );

  const artW = Math.max(viewport.width, frameW * zoom + PAD * 2 + 120);
  const artH = Math.max(viewport.height, frameH * zoom + PAD * 2 + 120);
  const z = zoom;
  const sc = (r: Rect): CSSProperties => ({ left: r.x * z, top: r.y * z, width: r.width * z, height: r.height * z });

  const selected = state.selection.map((id) => getNode(doc, id)).filter((n): n is DesignNode => !!n && !n.isComponent);
  const primary = selected[0];
  const primaryLayout = primary && !isRootNode(primary) ? layout.get(primary.id) : undefined;
  const showSmartTag = selected.length === 1 && primary && !isRootNode(primary) && primaryLayout && !primaryLayout.hidden && !state.tabOrderMode;
  const inlineNode = state.inlineEditId ? getNode(doc, state.inlineEditId) : undefined;
  const inlineLayout = inlineNode ? layout.get(inlineNode.id) : undefined;
  const hoverLayout = state.hoverId && !state.selection.includes(state.hoverId) && state.hoverId !== root.id ? layout.get(state.hoverId) : undefined;
  const gestureKind = dragging;

  const menuItems = (): MenuItem[] => {
    const multi = selected.length >= 2;
    const hasCtl = state.selection.some((id) => id !== root.id);
    const frozen = state.locked || state.readOnly;
    return [
      { id: 'code', label: 'View Code', icon: 'code', shortcut: 'F7', onSelect: () => store.post({ type: 'viewCode' }) },
      { id: 's0', separator: true },
      { id: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', disabled: !hasCtl || frozen, onSelect: () => store.copySelection(true) },
      { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', disabled: !hasCtl, onSelect: () => store.copySelection() },
      { id: 'paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', disabled: !store.hasClipboard || frozen, onSelect: () => store.paste() },
      { id: 'dup', label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: !hasCtl || frozen, onSelect: () => store.duplicateSelection() },
      { id: 'del', label: 'Delete', icon: 'trash', shortcut: 'Del', disabled: !hasCtl || frozen, onSelect: () => store.deleteSelection() },
      { id: 's1', separator: true },
      { id: 'front', label: 'Bring to Front', icon: 'bringToFront', disabled: !hasCtl || frozen, onSelect: () => store.zOrder('front') },
      { id: 'back', label: 'Send to Back', icon: 'sendToBack', disabled: !hasCtl || frozen, onSelect: () => store.zOrder('back') },
      {
        id: 'align',
        label: 'Align',
        icon: 'alignLeft',
        disabled: !multi || frozen,
        submenu: [
          { id: 'al', label: 'Lefts', icon: 'alignLeft', onSelect: () => store.align('alignLeft') },
          { id: 'ac', label: 'Centers', icon: 'alignCenter', onSelect: () => store.align('alignCenter') },
          { id: 'ar', label: 'Rights', icon: 'alignRight', onSelect: () => store.align('alignRight') },
          { id: 'sx', separator: true },
          { id: 'at', label: 'Tops', icon: 'alignTop', onSelect: () => store.align('alignTop') },
          { id: 'am', label: 'Middles', icon: 'alignMiddle', onSelect: () => store.align('alignMiddle') },
          { id: 'ab', label: 'Bottoms', icon: 'alignBottom', onSelect: () => store.align('alignBottom') },
        ],
      },
      {
        id: 'size',
        label: 'Make Same Size',
        icon: 'sameSize',
        disabled: !multi || frozen,
        submenu: [
          { id: 'sw', label: 'Width', icon: 'sameWidth', onSelect: () => store.align('sameWidth') },
          { id: 'sh', label: 'Height', icon: 'sameHeight', onSelect: () => store.align('sameHeight') },
          { id: 'ss', label: 'Both', icon: 'sameSize', onSelect: () => store.align('sameSize') },
        ],
      },
      { id: 's2', separator: true },
      { id: 'parent', label: 'Select Parent', icon: 'selectParent', shortcut: 'Esc', disabled: !hasCtl, onSelect: () => store.selectParent() },
      { id: 'lock', label: 'Lock Controls', icon: 'lock', checked: state.locked, onSelect: () => store.setState({ locked: !store.getState().locked }) },
    ];
  };

  const gridStyle: CSSProperties | undefined = settings.showGrid
    ? { backgroundSize: `${settings.gridSize}px ${settings.gridSize}px`, backgroundPosition: `0 0` }
    : undefined;

  const cursorStyle = cursor ?? (state.placementTool ? 'crosshair' : state.tabOrderMode ? 'pointer' : undefined);

  return (
    <div
      ref={scrollerRef}
      className={`wd-canvas ${state.placementTool ? 'placing' : ''} ${state.tabOrderMode ? 'tab-order' : ''}`}
      tabIndex={0}
      aria-label="Design surface"
      style={{ cursor: cursorStyle }}
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerLeave={() => store.getState().hoverId && store.setState({ hoverId: null })}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!scrollerRef.current?.contains(e.relatedTarget as Node)) setToolboxDrop(null);
      }}
      onDrop={onDrop}
    >
      <div className="wd-artboard" style={{ width: artW, height: artH }}>
        <div className="wd-form-host" style={{ left: PAD, top: PAD, width: frameW * z, height: frameH * z }}>
          <div className="wd-form-scale" style={{ width: frameW, height: frameH, transform: `scale(${z})` }}>
            <FormChrome root={root} style={style} resourceDataUris={state.resourceDataUris}>
              <div
                ref={clientRef}
                className={`wf-client wf-${style}`}
                data-container-id={root.id}
                data-slot="main"
                style={{ width: clientSize.width, height: clientSize.height, ...formSurfaceStyle(root, state.resourceDataUris) }}
              >
                {gridStyle ? <div className="wf-grid" style={gridStyle} /> : null}
                <FormClient root={root} ctx={ctx} />
              </div>
            </FormChrome>
          </div>
        </div>

        <div className="wd-overlay" style={{ left: clientOffset.x, top: clientOffset.y }}>
          {hoverLayout && !hoverLayout.hidden && !gestureKind ? <div className="wd-hover" style={sc(hoverLayout.bounds)} /> : null}

          {state.tabOrderMode
            ? [...layout.values()]
                .filter((nl) => nl.id !== root.id && !nl.hidden)
                .map((nl) => {
                  const n = getNode(doc, nl.id);
                  if (!n) return null;
                  const assigned = state.tabOrderAssigned.includes(n.id);
                  return (
                    <div
                      key={nl.id}
                      className={`wd-taborder-badge ${assigned ? 'assigned' : ''}`}
                      style={{ left: nl.bounds.x * z, top: nl.bounds.y * z }}
                      title={`${n.name} — TabIndex ${getNumber(n, 'TabIndex', 0)}`}
                    >
                      {tabOrderLabel(doc, n)}
                    </div>
                  );
                })
            : null}

          {!state.tabOrderMode &&
            selected.map((n, i) => {
              if (isRootNode(n)) return null;
              const nl = layout.get(n.id);
              if (!nl || nl.hidden) return null;
              const isPrimary = i === 0;
              const frozen = state.locked || state.readOnly;
              const allowed = allowedHandles(doc, n, frozen);
              return (
                <div key={n.id} className={`wd-sel ${isPrimary ? 'primary' : 'secondary'} ${frozen ? 'locked' : ''}`} style={sc(nl.bounds)}>
                  {frozen ? (
                    <span className="wd-sel-lock">
                      <Icon name="lock" size={10} />
                    </span>
                  ) : (
                    HANDLES.map((h) => (
                      <span
                        key={h}
                        className={`wd-handle h-${h} ${allowed.has(h) ? '' : 'inactive'}`}
                        style={{ cursor: allowed.has(h) ? handleCursor(h) : 'default' }}
                        onPointerDown={allowed.has(h) ? (e) => beginResize(e, h) : (e) => e.stopPropagation()}
                      />
                    ))
                  )}
                </div>
              );
            })}

          {overlay.ghosts.map((r, i) => (
            <div key={`g${i}`} className="wd-ghost" style={sc(r)} />
          ))}

          {overlay.drop || toolboxDrop ? (
            <div className="wd-drop-target" style={sc((overlay.drop ?? toolboxDrop)!.rect)}>
              <span className="wd-drop-tag">{(overlay.drop ?? toolboxDrop)!.label}</span>
            </div>
          ) : null}

          {overlay.marquee ? <div className={`wd-marquee ${gestureKind === 'place' ? 'place' : ''}`} style={sc(overlay.marquee)} /> : null}

          {overlay.lines.length ? (
            <svg className="wd-snaplines" width={clientSize.width * z + 2} height={clientSize.height * z + 2} style={{ overflow: 'visible' }}>
              {overlay.lines.map((l, i) => {
                const color = l.kind === 'baseline' ? SNAP_MAGENTA : SNAP_BLUE;
                const x1 = Math.round(l.x1 * z) + 0.5;
                const y1 = Math.round(l.y1 * z) + 0.5;
                const x2 = Math.round(l.x2 * z) + 0.5;
                const y2 = Math.round(l.y2 * z) + 0.5;
                const dashed = l.kind === 'center';
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} strokeDasharray={dashed ? '3 2' : undefined} />
                    {l.kind === 'margin' || l.kind === 'padding' ? (
                      <>
                        {l.orientation === 'horizontal' ? (
                          <>
                            <line x1={x1} y1={y1 - 3} x2={x1} y2={y1 + 3} stroke={color} />
                            <line x1={x2} y1={y2 - 3} x2={x2} y2={y2 + 3} stroke={color} />
                          </>
                        ) : (
                          <>
                            <line x1={x1 - 3} y1={y1} x2={x1 + 3} y2={y1} stroke={color} />
                            <line x1={x2 - 3} y1={y2} x2={x2 + 3} y2={y2} stroke={color} />
                          </>
                        )}
                        {l.label ? (
                          <g transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}>
                            <rect x={-8} y={l.orientation === 'horizontal' ? -15 : -6} width={16} height={11} rx={2} fill={color} />
                            <text x={0} y={l.orientation === 'horizontal' ? -6.5 : 2.5} textAnchor="middle" className="wd-snap-label">
                              {l.label}
                            </text>
                          </g>
                        ) : null}
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          ) : null}

          {overlay.tip ? (
            <div className="wd-tip" style={{ left: overlay.tip.x * z + 8, top: overlay.tip.y * z + 8 }}>
              {overlay.tip.text}
            </div>
          ) : null}

          {showSmartTag && !gestureKind && !state.locked ? (
            <button
              type="button"
              className={`wd-smarttag ${smartTag ? 'open' : ''}`}
              title={`${primary!.type} Tasks`}
              aria-label={`${primary!.type} Tasks`}
              style={{ left: (primaryLayout!.bounds.x + primaryLayout!.bounds.width) * z + 4, top: primaryLayout!.bounds.y * z - 1 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSmartTag(smartTag ? null : { x: r.left, y: r.top, width: r.width, height: r.height });
              }}
            >
              <Icon name="smartTag" size={10} />
            </button>
          ) : null}

          {inlineNode && inlineLayout && !inlineLayout.hidden ? (
            <InlineEditor
              key={inlineNode.id}
              node={inlineNode}
              style={sc(inlineLayout.bounds)}
              zoom={z}
              onCommit={(v) => {
                store.setState({ inlineEditId: null });
                if (v !== getText(inlineNode)) store.setProperty([inlineNode.id], 'Text', v);
              }}
              onCancel={() => store.setState({ inlineEditId: null })}
            />
          ) : null}

          {root.type === 'Form' && !state.locked && !state.readOnly ? (
            <>
              <span
                className={`wd-form-handle e ${state.selection[0] === root.id ? 'active' : ''}`}
                style={{ left: clientSize.width * z + fm.border * z - 3, top: (clientSize.height * z) / 2 - 4 }}
                onPointerDown={(e) => beginFormResize(e, 'e')}
              />
              <span
                className={`wd-form-handle s ${state.selection[0] === root.id ? 'active' : ''}`}
                style={{ left: (clientSize.width * z) / 2 - 4, top: clientSize.height * z + fm.border * z - 3 }}
                onPointerDown={(e) => beginFormResize(e, 's')}
              />
              <span
                className={`wd-form-handle se ${state.selection[0] === root.id ? 'active' : ''}`}
                style={{ left: clientSize.width * z + fm.border * z - 3, top: clientSize.height * z + fm.border * z - 3 }}
                onPointerDown={(e) => beginFormResize(e, 'se')}
              />
            </>
          ) : root.type !== 'Form' && !state.locked && !state.readOnly ? (
            <span
              className={`wd-form-handle se ${state.selection[0] === root.id ? 'active' : ''}`}
              style={{ left: clientSize.width * z - 4, top: clientSize.height * z - 4 }}
              onPointerDown={(e) => beginFormResize(e, 'se')}
            />
          ) : null}
          <div className="wd-form-size" style={{ left: 0, top: clientSize.height * z + fm.border * z + 8 }}>
            {root.name} <span>{clientSize.width} × {clientSize.height}</span>
          </div>
        </div>
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} /> : null}
      {smartTag && showSmartTag ? <SmartTagPanel node={primary!} store={store} anchor={smartTag} onClose={() => setSmartTag(null)} /> : null}
    </div>
  );
}

function InlineEditor({
  node,
  style,
  zoom,
  onCommit,
  onCancel,
}: {
  node: DesignNode;
  style: CSSProperties;
  zoom: number;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(getText(node));
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const font = getFont(node);
  const multiline = node.type === 'RichTextBox' || node.properties.Multiline === true;
  return (
    <textarea
      ref={ref}
      className="wd-inline-edit"
      aria-label={`Edit text of ${node.name}`}
      value={value}
      spellCheck={false}
      style={{ ...style, minWidth: 60 * zoom, fontSize: `${(font.size * 96) / 72 * zoom}px`, fontFamily: `"${font.family}", "Segoe UI", system-ui, sans-serif` }}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (!multiline || e.ctrlKey)) {
          e.preventDefault();
          done.current = true;
          onCommit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(value);
      }}
    />
  );
}

export { displayText };
