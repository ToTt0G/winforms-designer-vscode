// Inline and popover value editors used by the Property Grid.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SYSTEM_COLORS, WEB_NAMED_COLORS, WINFORMS_ENUMS, type PropertyDefinition } from '../../shared/catalog';
import type { ColorValue, DesignDocument, DesignNode, FontValue, PropertyValue } from '../../shared/model';
import { isColorValue, isEnumValue, isFlagsValue, isFontValue, isRawExpressionValue } from '../../shared/model';
import { colorCss, colorFromCss, colorToHex, DEFAULT_FONT, fontToCss, formatValue } from '../state/nodeProps';
import { Popover } from './ContextMenu';
import { Icon } from './ControlIcons';

export interface EditorProps {
  def: PropertyDefinition;
  value: PropertyValue | undefined;
  mixed: boolean;
  disabled?: boolean;
  onChange: (v: PropertyValue | undefined) => void;
}

type Anchor = { x: number; y: number; width: number; height: number };

function anchorOf(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** Text input that commits on Enter / blur and reverts on Escape. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  className,
  type = 'text',
  disabled,
  monospace,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  type?: 'text' | 'number';
  disabled?: boolean;
  monospace?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  // Latest draft, readable synchronously from blur handlers that fire before React re-renders.
  const draftRef = useRef(value);
  // Set when Enter already committed or Escape cancelled, so the blur that follows is a no-op.
  const settledRef = useRef(false);
  useEffect(() => {
    if (!editing.current) {
      setDraft(value);
      draftRef.current = value;
    }
  }, [value]);
  const commit = () => {
    editing.current = false;
    if (settledRef.current) return;
    settledRef.current = true;
    const next = draftRef.current;
    if (next !== value) onCommit(next);
  };
  const cancel = () => {
    editing.current = false;
    settledRef.current = true;
    draftRef.current = value;
    setDraft(value);
  };
  return (
    <input
      className={`wd-pg-input ${monospace ? 'mono' : ''} ${className ?? ''}`}
      value={draft}
      type={type}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      spellCheck={false}
      onFocus={() => {
        editing.current = true;
        settledRef.current = false;
      }}
      onChange={(e) => {
        draftRef.current = e.target.value;
        settledRef.current = false;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function StringEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const text = mixed ? '' : formatValue(value);
  if (def.editor === 'multilineString') {
    return <MultilineEditor value={text} onChange={(v) => onChange(v)} disabled={disabled} label={def.name} />;
  }
  return <CommitInput value={text} onCommit={(v) => onChange(v)} disabled={disabled} ariaLabel={def.name} />;
}

function MultilineEditor({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState(value);
  return (
    <div className="wd-pg-composite">
      <CommitInput value={value.replace(/\r?\n/g, '⏎')} onCommit={(v) => onChange(v.replace(/⏎/g, '\n'))} disabled={disabled} ariaLabel={label} />
      <button
        type="button"
        className="wd-pg-dd"
        aria-label={`Edit ${label} lines`}
        disabled={disabled}
        onClick={(e) => {
          setDraft(value);
          setOpen(open ? null : anchorOf(e.currentTarget.parentElement!));
        }}
      >
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-multiline">
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label={label} />
          <div className="wd-pop-actions">
            <button type="button" className="wd-btn secondary" onClick={() => setOpen(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="wd-btn"
              onClick={() => {
                onChange(draft);
                setOpen(null);
              }}
            >
              OK
            </button>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

export function NumberEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const text = mixed ? '' : formatValue(value);
  return (
    <CommitInput
      value={text}
      disabled={disabled}
      ariaLabel={def.name}
      onCommit={(v) => {
        const t = v.trim();
        if (t === '') return onChange(undefined);
        let n = Number(t);
        if (!Number.isFinite(n)) return;
        if (def.editor === 'number') n = Math.round(n);
        if (def.min !== undefined) n = Math.max(def.min, n);
        if (def.max !== undefined) n = Math.min(def.max, n);
        onChange(n);
      }}
    />
  );
}

export function BoolEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const v = mixed ? '' : value === undefined ? String(def.defaultValue ?? false) : String(value === true || value === 'true');
  return (
    <select className="wd-pg-select" value={v} disabled={disabled} aria-label={def.name} onChange={(e) => onChange(e.target.value === 'true')}>
      {mixed ? <option value="" /> : null}
      <option value="true">True</option>
      <option value="false">False</option>
    </select>
  );
}

export function EnumEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const typeName = def.enumType ?? '';
  const values = WINFORMS_ENUMS[typeName]?.values ?? [];
  const cur = mixed ? '' : isEnumValue(value) ? value.value : typeof value === 'string' ? value : isEnumValue(def.defaultValue) ? def.defaultValue.value : '';
  return (
    <select
      className="wd-pg-select"
      value={cur}
      disabled={disabled}
      aria-label={def.name}
      onChange={(e) => onChange({ kind: 'enum', typeName, value: e.target.value })}
    >
      {mixed || !values.includes(cur) ? <option value={cur}>{cur}</option> : null}
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Anchor / Dock / ContentAlignment visual editors
// ---------------------------------------------------------------------------

export function AnchorEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const current = isFlagsValue(value) ? value.values : isFlagsValue(def.defaultValue) ? def.defaultValue.values : ['Top', 'Left'];
  const set = new Set(current.filter((v) => v !== 'None'));
  const toggle = (edge: string) => {
    const next = new Set(set);
    if (next.has(edge)) next.delete(edge);
    else next.add(edge);
    const order = ['Top', 'Bottom', 'Left', 'Right'].filter((e) => next.has(e));
    onChange({ kind: 'flags', typeName: 'AnchorStyles', values: order.length ? order : ['None'] });
  };
  return (
    <>
      <button type="button" className="wd-pg-picker" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span>{mixed ? '' : set.size ? [...set].join(', ') : 'None'}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-anchor">
          <div className="wd-anchor-cross" role="group" aria-label="Anchor edges">
            <div className="wd-anchor-center" />
            {(['Top', 'Bottom', 'Left', 'Right'] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                className={`wd-anchor-arm ${edge.toLowerCase()} ${set.has(edge) ? 'on' : ''}`}
                aria-pressed={set.has(edge)}
                aria-label={edge}
                title={edge}
                onClick={() => toggle(edge)}
              />
            ))}
          </div>
          <p className="wd-pop-hint">Click an arm to bind that edge to the container.</p>
        </Popover>
      ) : null}
    </>
  );
}

export function DockEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const cur = mixed ? '' : isEnumValue(value) ? value.value : 'None';
  const pick = (v: string) => {
    onChange({ kind: 'enum', typeName: 'DockStyle', value: v });
    setOpen(null);
  };
  return (
    <>
      <button type="button" className="wd-pg-picker" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span>{cur}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-dock">
          <div className="wd-dock-grid" role="radiogroup" aria-label="Dock">
            {(['Top', 'Left', 'Fill', 'Right', 'Bottom'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={cur === d} className={`wd-dock-zone ${d.toLowerCase()} ${cur === d ? 'on' : ''}`} title={d} onClick={() => pick(d)}>
                {d === 'Fill' ? 'Fill' : ''}
              </button>
            ))}
          </div>
          <button type="button" className={`wd-dock-none ${cur === 'None' ? 'on' : ''}`} onClick={() => pick('None')}>
            None
          </button>
        </Popover>
      ) : null}
    </>
  );
}

export function AlignmentEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const cur = mixed ? '' : isEnumValue(value) ? value.value : isEnumValue(def.defaultValue) ? def.defaultValue.value : 'MiddleCenter';
  const values = WINFORMS_ENUMS.ContentAlignment.values;
  return (
    <>
      <button type="button" className="wd-pg-picker" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span>{cur}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-align">
          <div className="wd-align-grid" role="radiogroup" aria-label={def.name}>
            {values.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={cur === v}
                title={v}
                className={cur === v ? 'on' : ''}
                onClick={() => {
                  onChange({ kind: 'enum', typeName: 'ContentAlignment', value: v });
                  setOpen(null);
                }}
              />
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}

export function FlagsEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const typeName = def.enumType ?? '';
  const all = WINFORMS_ENUMS[typeName]?.values ?? [];
  const cur = isFlagsValue(value) ? value.values : [];
  return (
    <>
      <button type="button" className="wd-pg-picker" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span>{mixed ? '' : cur.join(', ') || 'None'}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)}>
          {all
            .filter((v) => v !== 'None')
            .map((v) => (
              <label key={v} className="wd-task-check">
                <input
                  type="checkbox"
                  checked={cur.includes(v)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...cur, v] : cur.filter((x) => x !== v);
                    onChange({ kind: 'flags', typeName, values: next.length ? next : ['None'] });
                  }}
                />
                <span>{v}</span>
              </label>
            ))}
        </Popover>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Color picker (Custom / Web / System)
// ---------------------------------------------------------------------------

const CURATED = [
  '#000000', '#404040', '#7F7F7F', '#BFBFBF', '#E6E6E6', '#FFFFFF',
  '#C42B1C', '#E74856', '#F7630C', '#FFB900', '#FCE100', '#BAD80A',
  '#107C10', '#00B294', '#038387', '#00B7C3', '#0078D4', '#0063B1',
  '#004E8C', '#6B69D6', '#8764B8', '#881798', '#B146C2', '#E3008C',
  '#5D5A58', '#68768A', '#515C6B', '#567C73', '#486860', '#7E735F',
];

export function ColorEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const cv = isColorValue(value) ? value : isColorValue(def.defaultValue) ? def.defaultValue : undefined;
  const css = colorCss(cv, 'transparent');
  return (
    <>
      <button type="button" className="wd-pg-picker color" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span className="wd-swatch" style={{ background: css }} />
        <span>{mixed ? '' : formatValue(cv)}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-color">
          <ColorPicker
            value={cv}
            onPick={(c) => {
              onChange(c);
            }}
            onDone={() => setOpen(null)}
          />
        </Popover>
      ) : null}
    </>
  );
}

export function ColorPicker({ value, onPick, onDone }: { value?: ColorValue; onPick: (c: ColorValue) => void; onDone: () => void }) {
  const [tab, setTab] = useState<'custom' | 'web' | 'system'>(value?.isSystem ? 'system' : value?.isNamed ? 'web' : 'custom');
  const [query, setQuery] = useState('');
  const hex = colorToHex(value);
  const rgb = useMemo(() => {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: value?.a ?? 255 };
  }, [hex, value?.a]);
  const setRgb = (patch: Partial<typeof rgb>) => {
    const n = { ...rgb, ...patch };
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v || 0)));
    const r = clamp(n.r);
    const g = clamp(n.g);
    const b = clamp(n.b);
    const a = clamp(n.a);
    const hx = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    onPick({ kind: 'color', value: hx, r, g, b, a });
  };
  const web = Object.entries(WEB_NAMED_COLORS).filter(([n]) => n.toLowerCase().includes(query.toLowerCase()));
  const sys = Object.entries(SYSTEM_COLORS).filter(([n]) => n.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="wd-colorpicker">
      <div className="wd-tabs" role="tablist">
        {(['custom', 'web', 'system'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'custom' ? 'Custom' : t === 'web' ? 'Web' : 'System'}
          </button>
        ))}
      </div>
      {tab === 'custom' ? (
        <div className="wd-cp-custom">
          <div className="wd-cp-row">
            <input type="color" value={hex} aria-label="Pick color" onChange={(e) => onPick(colorFromCss(e.target.value))} />
            <CommitInput value={hex} ariaLabel="Hex" monospace onCommit={(v) => onPick(colorFromCss(v.startsWith('#') ? v : `#${v}`))} />
          </div>
          <div className="wd-cp-channels">
            {(['r', 'g', 'b', 'a'] as const).map((ch) => (
              <label key={ch}>
                <span>{ch.toUpperCase()}</span>
                <CommitInput value={String(rgb[ch])} ariaLabel={ch.toUpperCase()} onCommit={(v) => setRgb({ [ch]: Number(v) })} />
              </label>
            ))}
          </div>
          <div className="wd-cp-swatches">
            {CURATED.map((c) => (
              <button key={c} type="button" title={c} aria-label={c} className={hex === c ? 'on' : ''} style={{ background: c }} onClick={() => onPick(colorFromCss(c))} />
            ))}
          </div>
        </div>
      ) : (
        <div className="wd-cp-list">
          <input className="wd-pg-input" placeholder={`Search ${tab === 'web' ? 'web' : 'system'} colors`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search colors" />
          <ul role="listbox">
            {(tab === 'web' ? web : sys).map(([name, css]) => (
              <li
                key={name}
                role="option"
                aria-selected={value?.value === name}
                className={value?.value === name ? 'on' : ''}
                onClick={() => {
                  onPick(tab === 'web' ? { kind: 'color', value: name, isNamed: true } : { kind: 'color', value: name, isSystem: true });
                  onDone();
                }}
              >
                <span className="wd-swatch" style={{ background: css }} />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Font picker
// ---------------------------------------------------------------------------

const FONT_FAMILIES = [
  'Segoe UI',
  'Segoe UI Semibold',
  'Segoe UI Variable Text',
  'Microsoft Sans Serif',
  'Tahoma',
  'Verdana',
  'Arial',
  'Calibri',
  'Cambria',
  'Candara',
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'Courier New',
  'Georgia',
  'Lucida Console',
  'Times New Roman',
  'Trebuchet MS',
  'Bahnschrift',
];

export function FontEditor({ value, mixed, onChange, disabled, def }: EditorProps) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const f: FontValue = isFontValue(value) ? value : isFontValue(def.defaultValue) ? def.defaultValue : DEFAULT_FONT;
  const update = (patch: Partial<FontValue>) => onChange({ ...f, ...patch, kind: 'font' });
  const families = FONT_FAMILIES.includes(f.family) ? FONT_FAMILIES : [f.family, ...FONT_FAMILIES];
  return (
    <>
      <button type="button" className="wd-pg-picker" disabled={disabled} aria-label={def.name} onClick={(e) => setOpen(open ? null : anchorOf(e.currentTarget))}>
        <span>{mixed ? '' : formatValue(f)}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} className="wd-pop-font">
          <div className="wd-font-row">
            <select className="wd-pg-select" value={f.family} aria-label="Font family" onChange={(e) => update({ family: e.target.value })}>
              {families.map((fam) => (
                <option key={fam} value={fam}>
                  {fam}
                </option>
              ))}
            </select>
            <label className="wd-font-size">
              <CommitInput value={String(f.size)} ariaLabel="Font size" onCommit={(v) => Number(v) > 0 && update({ size: Math.round(Number(v) * 4) / 4 })} />
              <span>pt</span>
            </label>
          </div>
          <div className="wd-font-styles" role="group" aria-label="Font style">
            {(
              [
                ['bold', 'B'],
                ['italic', 'I'],
                ['underline', 'U'],
                ['strikeout', 'S'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={!!f[k]} aria-label={k} className={`wd-font-toggle ${k} ${f[k] ? 'on' : ''}`} onClick={() => update({ [k]: !f[k] })}>
                {label}
              </button>
            ))}
          </div>
          <div className="wd-font-preview" style={fontToCss(f)}>
            The quick brown fox jumps over the lazy dog
          </div>
        </Popover>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Image / icon picker
// ---------------------------------------------------------------------------

export function ImageEditor({
  value,
  dataUri,
  onPick,
  onClear,
  disabled,
}: {
  value: PropertyValue | undefined;
  dataUri?: string;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const name = value && typeof value === 'object' && value.kind === 'resource' ? value.resourceName : value ? formatValue(value) : '';
  return (
    <div className="wd-pg-image">
      <span className="wd-thumb">{dataUri ? <img src={dataUri} alt="" /> : <Icon name="image" size={12} />}</span>
      <span className="wd-pg-image-name">{name || '(none)'}</span>
      {name ? (
        <button type="button" className="wd-icon-btn" aria-label="Clear image" title="Clear" disabled={disabled} onClick={onClear}>
          <Icon name="close" size={12} />
        </button>
      ) : null}
      <button type="button" className="wd-pg-ellipsis" aria-label="Choose image" title="Choose image…" disabled={disabled} onClick={onPick}>
        …
      </button>
    </div>
  );
}

export function CollectionButton({ label, onOpen, disabled }: { label: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <div className="wd-pg-image">
      <span className="wd-pg-image-name">{label}</span>
      <button type="button" className="wd-pg-ellipsis" aria-label="Edit collection" title="Edit collection…" disabled={disabled} onClick={onOpen}>
        …
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control reference picker (AcceptButton, CancelButton, MainMenuStrip, ImageList…)
// ---------------------------------------------------------------------------

/** Name referenced by a `{ kind: 'raw' }` control reference, without any `this.` qualifier. */
export function controlRefName(value: PropertyValue | undefined): string {
  if (isRawExpressionValue(value)) return value.expression.trim().replace(/^this\./, '');
  if (typeof value === 'string') return value.trim().replace(/^this\./, '');
  return '';
}

/** Controls and components in the document whose type is accepted by a controlRef property. */
export function controlRefCandidates(doc: DesignDocument, types: string[] | undefined, excludeId?: string): DesignNode[] {
  const allowed = new Set(types ?? []);
  const out: DesignNode[] = [];
  const walk = (n: DesignNode) => {
    if (n.id !== excludeId && (allowed.size === 0 || allowed.has(n.type))) out.push(n);
    n.children.forEach(walk);
  };
  doc.form.children.forEach(walk);
  doc.components.forEach(walk);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function ControlRefEditor({
  value,
  mixed,
  onChange,
  disabled,
  def,
  doc,
  excludeId,
}: EditorProps & { doc: DesignDocument; excludeId?: string }) {
  const candidates = useMemo(() => controlRefCandidates(doc, def.controlRefTypes, excludeId), [doc, def.controlRefTypes, excludeId]);
  const cur = mixed ? '' : controlRefName(value);
  const known = !cur || candidates.some((c) => c.name === cur);
  return (
    <select
      className="wd-pg-select"
      value={mixed ? '\u0000mixed' : cur}
      disabled={disabled}
      aria-label={def.name}
      data-testid={`controlref-${def.name}`}
      onChange={(e) => {
        const name = e.target.value;
        if (!name) return onChange(undefined);
        onChange({ kind: 'raw', expression: (doc.metadata.useThisQualifier ? 'this.' : '') + name });
      }}
    >
      {mixed ? <option value={'\u0000mixed'} /> : null}
      <option value="">(none)</option>
      {!known ? <option value={cur}>{cur} (missing)</option> : null}
      {candidates.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
