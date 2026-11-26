// Live, interactive (non-design) preview of the form: resize to test Dock/Anchor,
// switch tabs, drag splitters, type into inputs and toggle checks; simulate Windows
// DPI scaling and jump between common window sizes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DesignDocument, DesignNode } from '../../shared/model';
import { getNode, propagateAnchors, setNodeRect, setProps, updateNode, updateNodes, type DesignerState, type DesignerStore } from '../state/designerStore';
import { computeLayoutTree } from '../state/layoutEngine';
import { clampSize, getBool, getEnum, getSize, getNumber, getString } from '../state/nodeProps';
import { Icon } from './ControlIcons';
import { cursorCss, FormClient, formSurfaceStyle, localizedText, type PreviewRuntime, type RenderContext } from './ControlRenderer';
import { FormChrome } from './FormChrome';

const DPI_SCALES = [1, 1.25, 1.5] as const;

type SizePreset = { id: string; label: string; title: string; size?: { width: number; height: number } };
const SIZE_PRESETS: SizePreset[] = [
  { id: 'design', label: 'Design', title: "Reset to the form's designed ClientSize" },
  { id: 'compact', label: 'Compact', title: 'Compact window, 640 × 400', size: { width: 640, height: 400 } },
  { id: 'wide', label: 'Wide', title: 'Wide window, 1024 × 640', size: { width: 1024, height: 640 } },
];

/** Formats a NumericUpDown value the way the control displays it. */
function numericText(n: DesignNode): string {
  const dp = getNumber(n, 'DecimalPlaces', 0);
  const min = getNumber(n, 'Minimum', 0);
  const max = getNumber(n, 'Maximum', 100);
  const v = Math.min(Math.max(getNumber(n, 'Value', min), min), Math.max(min, max));
  const text = v.toFixed(dp);
  return getBool(n, 'ThousandsSeparator', false) ? Number(text).toLocaleString('en-US', { minimumFractionDigits: dp }) : text;
}

/** Initial interactive state seeded from the designed property values. */
function seedRuntime(doc: DesignDocument): { values: Record<string, string>; checks: Record<string, boolean | 'indeterminate'> } {
  const values: Record<string, string> = {};
  const checks: Record<string, boolean | 'indeterminate'> = {};
  const walk = (n: DesignNode) => {
    switch (n.type) {
      case 'TextBox':
      case 'RichTextBox':
      case 'MaskedTextBox':
        values[n.id] = getString(n, 'Text');
        break;
      case 'NumericUpDown':
        values[n.id] = numericText(n);
        break;
      case 'DomainUpDown':
        values[n.id] = getString(n, 'Text') || (n.items?.[0] ?? '');
        break;
      case 'ComboBox': {
        const items = n.items ?? [];
        const idx = getNumber(n, 'SelectedIndex', -1);
        const text = getString(n, 'Text');
        const style = getEnum(n, 'DropDownStyle', 'DropDown');
        values[n.id] = idx >= 0 && idx < items.length ? items[idx] : text || (style === 'DropDownList' ? items[0] ?? '' : '');
        break;
      }
      case 'CheckBox': {
        const cs = getEnum(n, 'CheckState', '');
        checks[n.id] = cs === 'Indeterminate' ? 'indeterminate' : cs === 'Checked' || getBool(n, 'Checked', false);
        break;
      }
      case 'RadioButton':
        checks[n.id] = getBool(n, 'Checked', false);
        break;
    }
    n.children.forEach(walk);
  };
  walk(doc.form);
  return { values, checks };
}

export function PreviewModal({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const [original] = useState(() => state.doc!);
  const designSize = useMemo(() => getSize(original.form), [original]);
  const [size, setSize] = useState(designSize);
  const [dpi, setDpi] = useState<number>(1);
  const [splitters, setSplitters] = useState<Record<string, number>>({});
  const [activeTabs, setActiveTabs] = useState<Record<string, number>>(() => ({ ...state.activeTabs }));
  const [seed] = useState(() => seedRuntime(original));
  const [values, setValues] = useState<Record<string, string>>(seed.values);
  const [checks, setChecks] = useState<Record<string, boolean | 'indeterminate'>>(seed.checks);
  const windowRef = useRef<HTMLDivElement>(null);
  const [windowBox, setWindowBox] = useState<{ width: number; height: number } | null>(null);
  const dpiRef = useRef(dpi);
  dpiRef.current = dpi;
  const [status, setStatus] = useState('Resize the window, switch tabs and type into inputs to test the layout.');
  const dragRef = useRef<{ kind: 'size'; sx: number; sy: number; w: number; h: number } | { kind: 'split'; id: string; sx: number; sy: number; dist: number; vertical: boolean; extent: number; sw: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const style = state.settings.renderStyle;

  const doc = useMemo(() => {
    let next = updateNodes(original, Object.keys(splitters), (n) => setProps(n, { SplitterDistance: splitters[n.id] }));
    next = updateNode(next, original.form.id, (n) => setNodeRect(n, size));
    return propagateAnchors(original, next, { activeTabs });
  }, [original, size, splitters, activeTabs]);
  const layout = useMemo(() => computeLayoutTree(doc.form, { activeTabs }), [doc, activeTabs]);

  const close = useCallback(() => store.setState({ previewOpen: false }), [store]);

  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      // An open ToolStrip dropdown consumes the first Escape (it closes itself), like a real menu loop.
      if (e.key === 'Escape' && document.querySelector('.wd-preview .wf-dropdown')) {
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const k = dpiRef.current;
      if (d.kind === 'size') setSize(clampSize(original.form, Math.max(120, d.w + (e.clientX - d.sx) / k), Math.max(80, d.h + (e.clientY - d.sy) / k)));
      else {
        const delta = (d.vertical ? e.clientX - d.sx : e.clientY - d.sy) / k;
        const dist = Math.round(Math.min(d.extent - d.sw - 25, Math.max(25, d.dist + delta)));
        setSplitters((s) => ({ ...s, [d.id]: dist }));
      }
    };
    const up = () => (dragRef.current = null);
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [close, original.form]);

  // The window is scaled with a transform (smooth), so reserve its scaled footprint for scrolling.
  useLayoutEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const measure = () => setWindowBox({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyPreset = (p: SizePreset) => setSize(p.size ? clampSize(original.form, p.size.width, p.size.height) : designSize);
  const presetActive = (p: SizePreset) => {
    const target = p.size ? clampSize(original.form, p.size.width, p.size.height) : designSize;
    return target.width === size.width && target.height === size.height;
  };

  const runtime: PreviewRuntime = useMemo(
    () => ({
      values,
      checks,
      setValue: (id, v) => setValues((s) => ({ ...s, [id]: v })),
      setCheck: (id, v) => setChecks((s) => ({ ...s, [id]: v })),
      setRadio: (parentId, id) => {
        const parent = getNode(doc, parentId);
        const next: Record<string, boolean> = {};
        parent?.children.filter((c) => c.type === 'RadioButton').forEach((c) => (next[c.id] = c.id === id));
        setChecks((s) => ({ ...s, ...next }));
      },
    }),
    [values, checks, doc]
  );

  const ctx: RenderContext = useMemo(
    () => ({
      layout,
      renderStyle: style,
      resourceDataUris: state.resourceDataUris,
      mode: 'preview',
      preview: runtime,
      cultureStrings: state.activeCulture !== 'default' ? state.cultureStrings : undefined,
      resources: doc.resources,
      onTabClick: (id, index) => setActiveTabs((s) => ({ ...s, [id]: index })),
      onStripItemClick: (item) => {
        const handler = item.events?.Click;
        setStatus(handler ? `${item.name} clicked, which runs ${handler}()` : `${item.name} clicked. No Click handler is bound yet.`);
      },
      onSplitterPointerDown: (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        const n = getNode(doc, id);
        const nl = layout.get(id);
        if (!n || !nl) return;
        const vertical = getEnum(n, 'Orientation', 'Vertical') === 'Vertical';
        const sp = nl.container?.splitter;
        dragRef.current = {
          kind: 'split',
          id,
          sx: e.clientX,
          sy: e.clientY,
          dist: sp ? (vertical ? sp.x : sp.y) : getNumber(n, 'SplitterDistance', 100),
          vertical,
          extent: vertical ? nl.bounds.width : nl.bounds.height,
          sw: getNumber(n, 'SplitterWidth', 4),
        };
      },
    }),
    [layout, style, state.resourceDataUris, runtime, doc, state.activeCulture, state.cultureStrings]
  );

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.wf-cap-btn.close')) {
      close();
      return;
    }
    const el = t.closest<HTMLElement>('[data-node-id]');
    const n = el ? getNode(doc, el.dataset.nodeId!) : undefined;
    if (!n) return;
    const handler = n.events.Click ?? (n.type === 'LinkLabel' ? n.events.LinkClicked : undefined);
    if (n.type === 'Button' || n.type === 'LinkLabel') setStatus(handler ? `${n.name} clicked, which runs ${handler}()` : `${n.name} clicked. No Click handler is bound yet.`);
  };

  return (
    <div className="wd-modal-backdrop preview" role="dialog" aria-modal="true" aria-label="Form preview">
      <div className="wd-preview">
        <header className="wd-preview-head">
          <Icon name="preview" />
          <h2>Preview</h2>
          <span className="wd-muted wd-num" data-testid="preview-size">
            {doc.form.name} • {size.width} × {size.height}
            {dpi !== 1 ? ` @ ${Math.round(dpi * 100)}%` : ''}
          </span>
          <span className="wd-tb-spacer" />
          <div className="wd-preview-bar" role="group" aria-label="Preview options">
            <span className="wd-preview-bar-label">DPI</span>
            <div className="wd-segment" role="radiogroup" aria-label="DPI scale">
              {DPI_SCALES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={dpi === k}
                  className={dpi === k ? 'on' : ''}
                  title={`Simulate ${Math.round(k * 100)}% Windows display scaling`}
                  data-testid={`preview-dpi-${Math.round(k * 100)}`}
                  onClick={() => setDpi(k)}
                >
                  {Math.round(k * 100)}%
                </button>
              ))}
            </div>
            <span className="wd-preview-bar-label">Size</span>
            <div className="wd-segment" role="group" aria-label="Window size presets">
              {SIZE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={presetActive(p)}
                  className={presetActive(p) ? 'on' : ''}
                  title={p.title}
                  data-testid={`preview-size-${p.id}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                  {p.size ? <span className="wd-preview-dim">{p.size.width}×{p.size.height}</span> : null}
                </button>
              ))}
            </div>
          </div>
          <button ref={closeRef} type="button" className="wd-icon-btn" aria-label="Close preview" onClick={close}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="wd-preview-stage">
          <div className="wd-preview-scale" style={windowBox ? { width: windowBox.width * dpi, height: windowBox.height * dpi } : undefined}>
          <div ref={windowRef} className="wd-preview-window" onClick={onClick} style={{ transform: dpi === 1 ? undefined : `scale(${dpi})` }} data-dpi={dpi}>
            <FormChrome
              root={doc.form}
              style={style}
              resourceDataUris={state.resourceDataUris}
              titleOverride={localizedText(doc.form, state.activeCulture !== 'default' ? state.cultureStrings : undefined, doc.resources)}
            >
              <div className={`wf-client wf-${style} wf-live`} style={{ width: size.width, height: size.height, ...formSurfaceStyle(doc.form, state.resourceDataUris), cursor: cursorCss(doc.form) }}>
                <FormClient root={doc.form} ctx={ctx} />
              </div>
            </FormChrome>
            <span
              className="wd-preview-grip"
              title="Drag to resize"
              onPointerDown={(e) => {
                e.preventDefault();
                dragRef.current = { kind: 'size', sx: e.clientX, sy: e.clientY, w: size.width, h: size.height };
              }}
            />
          </div>
          </div>
        </div>
        <footer className="wd-preview-foot" aria-live="polite">
          {status}
        </footer>
      </div>
    </div>
  );
}
