// Studio shell: toolbar, left (Toolbox + Outline), canvas (+ tray), right (Properties),
// status line, modal hosts and global keyboard shortcuts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auditDesignDocument } from '../shared/auditor';
import { getNode, useDesigner, type DesignerStore } from './state/designerStore';
import { getLocation, getSize, hasTextProperty, isRootNode } from './state/nodeProps';
import { CollectionEditorHost } from './components/CollectionEditors';
import { ComponentTray } from './components/ComponentTray';
import { Icon } from './components/ControlIcons';
import { DesignCanvas } from './components/DesignCanvas';
import { DocumentOutline } from './components/DocumentOutline';
import { PreviewModal } from './components/PreviewModal';
import { PropertyGrid } from './components/PropertyGrid';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Keyboard routes out of the design surface: F4 → Properties object selector,
 * Ctrl+F6 / Ctrl+Shift+T → Toolbox search. Returns the selector to focus, if any.
 */
function focusExitTarget(e: KeyboardEvent): string | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F4' && !mod && !e.altKey && !e.shiftKey) return '[data-testid="object-selector"]';
  if (mod && !e.altKey && (e.key === 'F6' || (e.shiftKey && e.key.toLowerCase() === 't'))) return '[data-testid="toolbox-search"]';
  return null;
}

/** Marks recent locally-handled shortcuts so duplicated host / clipboard events are ignored. */
export const recentLocal = { undo: 0, redo: 0, copy: 0, cut: 0, paste: 0 };

export function App({ store }: { store: DesignerStore }) {
  const state = useDesigner();
  const [leftW, setLeftW] = useState(() => readNumber('wd.leftWidth', 232));
  const [rightW, setRightW] = useState(() => readNumber('wd.rightWidth', 316));
  const [outlineH, setOutlineH] = useState(() => readNumber('wd.outlineHeight', 260));
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const leftRef = useRef<HTMLElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const doc0 = state.doc;
  const auditIssues = useMemo(() => (doc0 ? auditDesignDocument(doc0) : []), [doc0]);
  const shortcutsOpenRef = useRef(shortcutsOpen);
  shortcutsOpenRef.current = shortcutsOpen;

  useEffect(() => {
    document.documentElement.dataset.theme = state.themeKind;
  }, [state.themeKind]);

  // ---- global keyboard shortcuts -------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = store.getState();
      if (!st.doc || st.collectionEditor || st.previewOpen || shortcutsOpenRef.current) return;
      // Focus exits work from anywhere (canvas, inputs, lists) so keyboard users are never trapped.
      const focusExit = focusExitTarget(e);
      if (focusExit) {
        const el = document.querySelector<HTMLElement>(focusExit);
        if (el) {
          e.preventDefault();
          e.stopPropagation();
          el.focus();
          if (el instanceof HTMLInputElement) el.select();
          return;
        }
      }
      if (isEditableTarget(e.target)) return;
      if ((e.target as HTMLElement)?.closest?.('.wd-menu, .wd-popover, .wd-modal')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      const active = document.activeElement as HTMLElement | null;
      // Designer-surface keys only apply when focus is on the canvas (or nowhere in particular),
      // so toolbar buttons and lists keep native keyboard behaviour.
      const inCanvas = !active || active === document.body || !!active.closest('.wd-canvas');
      // Tab only cycles controls while the design surface itself owns focus; elsewhere it moves focus natively.
      const canvasFocused = !!active?.closest('.wd-canvas');
      const onControl = !!active?.closest('button, [role="menuitem"], [role="option"], [role="tab"], a');
      const lower = key.toLowerCase();
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (mod && lower === 'z' && !e.shiftKey) {
        if (e.defaultPrevented) return;
        handled();
        recentLocal.undo = Date.now();
        store.undo();
        return;
      }
      if (mod && (lower === 'y' || (lower === 'z' && e.shiftKey))) {
        if (e.defaultPrevented) return;
        handled();
        recentLocal.redo = Date.now();
        store.redo();
        return;
      }
      if (mod && (lower === 'c' || lower === 'x' || lower === 'v')) {
        if (e.defaultPrevented) return; // VS Code routes clipboard via DOM copy/cut/paste events
        handled();
        if (lower === 'c') {
          recentLocal.copy = Date.now();
          store.copySelection();
        } else if (lower === 'x') {
          recentLocal.cut = Date.now();
          if (!st.locked) store.copySelection(true);
        } else {
          recentLocal.paste = Date.now();
          if (!st.locked) store.paste();
        }
        return;
      }
      if (mod && lower === 'd') {
        handled();
        if (!st.locked) store.duplicateSelection();
        return;
      }
      if (mod && lower === 'a') {
        handled();
        store.selectAll();
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        handled();
        store.zoomStep(1);
        return;
      }
      if (mod && key === '-') {
        handled();
        store.zoomStep(-1);
        return;
      }
      if (mod && key === '0') {
        handled();
        store.setZoom(1);
        return;
      }
      if (key === '?' && !mod) {
        handled();
        setShortcutsOpen(true);
        return;
      }
      switch (key) {
        case 'Delete':
        case 'Backspace':
          if (onControl && !inCanvas) return;
          handled();
          if (!st.locked) store.deleteSelection();
          return;
        case 'Escape':
          handled();
          if (st.placementTool) store.setState({ placementTool: null });
          else if (st.tabOrderMode) store.toggleTabOrder(false);
          else if (st.inlineEditId) store.setState({ inlineEditId: null });
          else store.selectParent();
          return;
        case 'F2': {
          handled();
          const id = st.selection[0];
          const n = id ? getNode(st.doc, id) : undefined;
          if (n && !n.isComponent && hasTextProperty(n.type) && !st.locked && !st.readOnly) store.setState({ inlineEditId: n.id });
          return;
        }
        case 'F7':
          handled();
          store.post({ type: 'viewCode' });
          return;
        case 'Tab':
          if (!canvasFocused || mod || e.altKey) return;
          handled();
          store.cycleSelection(e.shiftKey ? -1 : 1);
          return;
        case 'Enter':
          if (st.tabOrderMode || !inCanvas) return;
          if (st.selection[0]) {
            handled();
            store.navigateToDefaultEvent(st.selection[0]);
          }
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (onControl && !inCanvas) return;
          handled();
          const step = mod ? 1 : st.settings.gridSize;
          const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
          const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
          store.nudge(dx, dy, e.shiftKey);
          return;
        }
      }
    };
    const clip = (kind: 'copy' | 'cut' | 'paste') => (e: ClipboardEvent) => {
      const st = store.getState();
      if (!st.doc || isEditableTarget(document.activeElement) || st.collectionEditor || st.previewOpen) return;
      if (Date.now() - recentLocal[kind] < 400) return;
      e.preventDefault();
      if (kind === 'copy') store.copySelection();
      else if (st.locked) return;
      else if (kind === 'cut') store.copySelection(true);
      else store.paste();
    };
    const onCopy = clip('copy');
    const onCut = clip('cut');
    const onPaste = clip('paste');
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [store]);

  // ---- pane resizing ----------------------------------------------------------
  const startDrag = useCallback(
    (e: React.PointerEvent, kind: 'left' | 'right' | 'outline') => {
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const start = kind === 'left' ? leftW : kind === 'right' ? rightW : outlineH;
      const move = (ev: PointerEvent) => {
        if (kind === 'left') setLeftW(Math.min(420, Math.max(168, start + ev.clientX - sx)));
        else if (kind === 'right') setRightW(Math.min(560, Math.max(232, start - (ev.clientX - sx))));
        else {
          const total = leftRef.current?.clientHeight ?? 600;
          setOutlineH(Math.min(total - 120, Math.max(96, start - (ev.clientY - sy))));
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.classList.remove('wd-resizing');
      };
      document.body.classList.add('wd-resizing');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [leftW, rightW, outlineH]
  );

  useEffect(() => writeNumber('wd.leftWidth', leftW), [leftW]);
  useEffect(() => writeNumber('wd.rightWidth', rightW), [rightW]);
  useEffect(() => writeNumber('wd.outlineHeight', outlineH), [outlineH]);

  if (!state.doc) {
    return (
      <div className="wd-loading" role="status">
        <Icon name="Form" size={20} />
        <span>Loading the designer…</span>
      </div>
    );
  }

  const doc = state.doc;
  const primary = state.selection[0] ? getNode(doc, state.selection[0]) : undefined;
  const primaryLayout = primary ? state.layout.get(primary.id) : undefined;
  const cols = `${leftOpen ? `${leftW}px 1px` : '0px 0px'} minmax(0, 1fr) ${rightOpen ? `1px ${rightW}px` : '0px 0px'}`;

  return (
    <div className={`wd-app ${state.tabOrderMode ? 'tab-order' : ''} ${state.readOnly ? 'read-only' : ''}`}>
      <Toolbar state={state} store={store} auditIssues={auditIssues} onShowShortcuts={() => setShortcutsOpen(true)} />
      {state.readOnly ? (
        <div className="wd-readonly-banner" role="status" data-testid="readonly-banner">
          <Icon name="lock" size={14} />
          <p className="wd-readonly-text">
            <b>Read-only.</b> <span>{state.readOnlyReason}</span>{' '}
            <span className="wd-muted">You can still select, inspect, zoom and preview.</span>
          </p>
          <button type="button" className="wd-btn secondary small" data-testid="readonly-open-code" onClick={() => store.post({ type: 'viewDesignerCode' })}>
            <Icon name="code" size={12} />
            Open in C# Editor
          </button>
        </div>
      ) : null}
      <div className="wd-main" style={{ gridTemplateColumns: cols }}>
        <aside className={`wd-left ${leftOpen ? '' : 'closed'}`} ref={leftRef} style={{ gridTemplateRows: `minmax(120px, 1fr) 1px ${outlineH}px` }}>
          <Toolbox store={store} placementTool={state.placementTool} />
          <div className="wd-splitter-h" role="separator" aria-orientation="horizontal" onPointerDown={(e) => startDrag(e, 'outline')} />
          <DocumentOutline state={state} store={store} />
        </aside>
        <div className="wd-splitter-v" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, 'left')} />
        <main className="wd-center">
          <DesignCanvas state={state} store={store} />
          <ComponentTray state={state} store={store} />
        </main>
        <div className="wd-splitter-v" role="separator" aria-orientation="vertical" onPointerDown={(e) => startDrag(e, 'right')} />
        <aside className={`wd-right ${rightOpen ? '' : 'closed'}`}>
          <PropertyGrid state={state} store={store} />
        </aside>
      </div>
      <footer className="wd-status">
        <button type="button" className="wd-status-btn" aria-pressed={leftOpen} title={leftOpen ? 'Hide Toolbox and Outline' : 'Show Toolbox and Outline'} onClick={() => setLeftOpen(!leftOpen)}>
          <Icon name="Panel" size={12} />
        </button>
        {state.placementTool ? (
          <span className="wd-status-mode">Click or drag on the form to place a {state.placementTool}. Esc cancels.</span>
        ) : state.tabOrderMode ? (
          <span className="wd-status-mode">Click controls in the order focus should move. Esc to finish.</span>
        ) : primary ? (
          <span className="wd-status-sel">
            <b>{state.selection.length > 1 ? `${state.selection.length} selected` : primary.name}</b>
            {state.selection.length === 1 ? <span className="wd-muted">{primary.type}</span> : null}
            {primaryLayout && !isRootNode(primary) && !primary.isComponent ? (
              <span className="wd-num">
                {getLocation(primary).x}, {getLocation(primary).y}
              </span>
            ) : null}
            {!primary.isComponent ? (
              <span className="wd-num">
                {getSize(primary).width} × {getSize(primary).height}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="wd-tb-spacer" />
        {state.readOnly ? (
          <span className="wd-status-tag readonly" title={state.readOnlyReason}>
            Read-only
          </span>
        ) : null}
        {state.status ? (
          <span className={`wd-status-last ${state.statusTone}`} role={state.statusTone === 'info' ? undefined : 'alert'}>
            {state.status}
          </span>
        ) : null}
        {state.isStandalone ? <span className="wd-status-tag">Standalone preview</span> : null}
        <button type="button" className="wd-status-btn" aria-pressed={rightOpen} title={rightOpen ? 'Hide Properties' : 'Show Properties'} onClick={() => setRightOpen(!rightOpen)}>
          <Icon name="properties" size={12} />
        </button>
      </footer>
      <CollectionEditorHost editor={state.collectionEditor} store={store} />
      {state.previewOpen ? <PreviewModal state={state} store={store} /> : null}
      {shortcutsOpen ? <ShortcutsModal onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
