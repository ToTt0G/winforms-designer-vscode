// High-fidelity rendering of WinForms controls (Fluent / Classic) for the design
// surface and the interactive live preview.

import { memo, type CSSProperties, type ReactNode } from 'react';
import type { DesignNode, FontValue, StripItemNode } from '../../shared/model';
import { isEnumValue, isRawExpressionValue } from '../../shared/model';
import { TAB_HEADER_HEIGHT, type LayoutMap, type NodeLayout } from '../state/layoutEngine';
import {
  colorCss,
  displayText,
  fontToCss,
  getBool,
  getDock,
  getEnum,
  getFont,
  getNumber,
  getString,
  getText,
  resolveImage,
  type Rect,
} from '../state/nodeProps';
import { ControlIcon, Icon } from './ControlIcons';

export interface PreviewRuntime {
  values: Record<string, string>;
  checks: Record<string, boolean | 'indeterminate'>;
  setValue(id: string, v: string): void;
  setCheck(id: string, v: boolean): void;
  setRadio(groupParentId: string, id: string): void;
}

export interface RenderContext {
  layout: LayoutMap;
  renderStyle: 'fluent' | 'classic';
  resourceDataUris: Record<string, string>;
  mode: 'design' | 'preview';
  locked?: boolean;
  onTabClick?: (tabControlId: string, index: number) => void;
  onSplitterPointerDown?: (e: React.PointerEvent, nodeId: string) => void;
  preview?: PreviewRuntime;
}

interface Ambient {
  font: FontValue;
  foreColor: string;
  backColor: string;
}

const CONTROL_BG = '#F0F0F0';
const WINDOW_BG = '#FFFFFF';
const TEXT = '#000000';
const GRAY_TEXT = '#6D6D6D';

const AUTOSIZE_TEXT = new Set(['Label', 'LinkLabel', 'CheckBox', 'RadioButton']);

const TRANSPARENT_BG_TYPES = new Set([
  'Label',
  'LinkLabel',
  'CheckBox',
  'RadioButton',
  'GroupBox',
  'Panel',
  'FlowLayoutPanel',
  'TableLayoutPanel',
  'SplitContainer',
  'TabPage',
  'TrackBar',
  'PictureBox',
  'Splitter',
]);

const CURSOR_CSS: Record<string, string> = {
  Default: 'default',
  Arrow: 'default',
  UpArrow: 'default',
  Hand: 'pointer',
  IBeam: 'text',
  WaitCursor: 'wait',
  AppStarting: 'progress',
  Cross: 'crosshair',
  Help: 'help',
  No: 'not-allowed',
  SizeAll: 'move',
  SizeNESW: 'nesw-resize',
  SizeNS: 'ns-resize',
  SizeNWSE: 'nwse-resize',
  SizeWE: 'ew-resize',
  HSplit: 'row-resize',
  VSplit: 'col-resize',
  NoMove2D: 'all-scroll',
  NoMoveHoriz: 'ew-resize',
  NoMoveVert: 'ns-resize',
  PanEast: 'e-resize',
  PanNE: 'ne-resize',
  PanNorth: 'n-resize',
  PanNW: 'nw-resize',
  PanSE: 'se-resize',
  PanSouth: 's-resize',
  PanSW: 'sw-resize',
  PanWest: 'w-resize',
};

/** Parses a DateTimePicker `Value` such as `new System.DateTime(2026, 3, 14, 9, 30, 0, 0)`. */
function designedDate(node: DesignNode): Date | undefined {
  const v = node.properties.Value;
  const text = isRawExpressionValue(v) ? v.expression : typeof v === 'string' ? v : '';
  const m = text.match(/DateTime\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+))?/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** CSS cursor for a node's `Cursor` property (`Cursors.Hand` -> `pointer`), if set. */
export function cursorCss(node: DesignNode): string | undefined {
  const v = node.properties.Cursor;
  if (v === undefined) return undefined;
  const raw = isRawExpressionValue(v) ? v.expression : undefined;
  const name = raw ? raw.slice(raw.lastIndexOf('.') + 1) : getEnum(node, 'Cursor', '');
  return CURSOR_CSS[name];
}

function alignmentStyle(align: string): CSSProperties {
  const [v, h] = align.startsWith('Top')
    ? ['flex-start', align.slice(3)]
    : align.startsWith('Middle')
      ? ['center', align.slice(6)]
      : align.startsWith('Bottom')
        ? ['flex-end', align.slice(6)]
        : ['center', 'Center'];
  const justify = h === 'Left' ? 'flex-start' : h === 'Right' ? 'flex-end' : 'center';
  return { display: 'flex', alignItems: v, justifyContent: justify, textAlign: h === 'Left' ? 'left' : h === 'Right' ? 'right' : 'center' };
}

function horizontalAlign(node: DesignNode): CSSProperties['textAlign'] {
  const a = getEnum(node, 'TextAlign', 'Left');
  return a === 'Right' ? 'right' : a === 'Center' ? 'center' : 'left';
}

function borderClass(node: DesignNode, fallback = 'None'): string {
  const bs = getEnum(node, 'BorderStyle', fallback);
  return bs === 'FixedSingle' ? 'wf-border-single' : bs === 'Fixed3D' ? 'wf-border-3d' : '';
}

function rectStyle(r: Rect): CSSProperties {
  return { left: r.x, top: r.y, width: r.width, height: r.height };
}

/** Renders all children of a container node, in WinForms z-order (index 0 on top). */
function Children({ node, nl, ctx, amb }: { node: DesignNode; nl: NodeLayout; ctx: RenderContext; amb: Ambient }) {
  if (!nl.slots || node.children.length === 0) return null;
  return (
    <>
      {nl.slots.map((slot) => {
        if (slot.hidden) return null;
        const kids = node.children.filter((c) => (node.type === 'SplitContainer' ? (c.panelSlot ?? 'Panel1') === slot.slot : true));
        if (!kids.length) return null;
        const left = slot.origin.x - nl.bounds.x;
        const top = slot.origin.y - nl.bounds.y;
        const width = slot.clip.x + slot.clip.width - slot.origin.x;
        const height = slot.clip.y + slot.clip.height - slot.origin.y;
        return (
          <div key={slot.slot} className="wf-slot" style={{ left, top, width, height }}>
            {[...kids].reverse().map((child) => (
              <NodeView key={child.id} node={child} ctx={ctx} amb={amb} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/** Drop/hit target areas for containers (rendered beneath children). */
function ContainerTargets({ node, nl }: { node: DesignNode; nl: NodeLayout }) {
  if (!nl.slots || node.type === 'TabControl') return null;
  return (
    <>
      {nl.slots.map((slot) =>
        slot.hidden ? null : (
          <div
            key={`t-${slot.slot}`}
            className="wf-drop-area"
            data-container-id={node.id}
            data-slot={slot.slot}
            style={rectStyle({ x: slot.clip.x - nl.bounds.x, y: slot.clip.y - nl.bounds.y, width: slot.clip.width, height: slot.clip.height })}
          />
        )
      )}
    </>
  );
}

export const NodeView = memo(function NodeView({ node, ctx, amb }: { node: DesignNode; ctx: RenderContext; amb: Ambient }) {
  const nl = ctx.layout.get(node.id);
  if (!nl || nl.hidden) return null;
  const font = getFont(node, amb.font);
  const foreColor = colorCss(node.properties.ForeColor, amb.foreColor);
  const ownBack = node.properties.BackColor;
  const backColor = ownBack ? colorCss(ownBack, amb.backColor) : TRANSPARENT_BG_TYPES.has(node.type) ? 'transparent' : '';
  const childAmb: Ambient = {
    font,
    foreColor,
    backColor: ownBack
      ? colorCss(ownBack, amb.backColor)
      : node.type === 'TabPage' && getBool(node, 'UseVisualStyleBackColor', true)
        ? WINDOW_BG
        : amb.backColor,
  };
  const enabled = getBool(node, 'Enabled', true);
  const style: CSSProperties = {
    ...rectStyle(nl.rel),
    ...fontToCss(font),
    color: foreColor,
  };
  if (backColor) style.backgroundColor = backColor;
  if (ctx.mode === 'preview') {
    const cur = cursorCss(node);
    if (cur) style.cursor = cur;
  }
  const bgImage = resolveImage(node, 'BackgroundImage', ctx.resourceDataUris);
  if (bgImage) {
    const layout = getEnum(node, 'BackgroundImageLayout', 'Tile');
    style.backgroundImage = `url("${bgImage}")`;
    style.backgroundRepeat = layout === 'Tile' ? 'repeat' : 'no-repeat';
    style.backgroundSize = layout === 'Stretch' ? '100% 100%' : layout === 'Zoom' ? 'contain' : 'auto';
    style.backgroundPosition = layout === 'Center' || layout === 'Zoom' ? 'center' : '0 0';
  }
  const cls = ['wf-ctl', `wf-${node.type}`];
  if (!enabled) cls.push('wf-disabled');
  if (node.isUnknownType) cls.push('wf-unknown-type');
  if (getDock(node) !== 'None') cls.push('wf-docked');
  if (AUTOSIZE_TEXT.has(node.type) && getBool(node, 'AutoSize', node.type !== 'CheckBox' && node.type !== 'RadioButton' ? true : false)) cls.push('wf-autosize');
  return (
    <div className={cls.join(' ')} data-node-id={node.id} data-node-type={node.type} style={style}>
      <ControlBody node={node} nl={nl} ctx={ctx} amb={childAmb} font={font} />
      {nl.slots ? <ContainerTargets node={node} nl={nl} /> : null}
      {node.children.length ? <Children node={node} nl={nl} ctx={ctx} amb={childAmb} /> : null}
    </div>
  );
});

function ControlBody({ node, nl, ctx, amb, font }: { node: DesignNode; nl: NodeLayout; ctx: RenderContext; amb: Ambient; font: FontValue }) {
  const text = displayText(getText(node));
  const W = nl.bounds.width;
  const H = nl.bounds.height;
  const fluent = ctx.renderStyle === 'fluent';
  const design = ctx.mode === 'design';
  const pv = ctx.preview;

  switch (node.type) {
    case 'Button':
      return <ButtonBody node={node} ctx={ctx} text={text} />;
    case 'Label':
    case 'LinkLabel': {
      const align = getEnum(node, 'TextAlign', 'TopLeft');
      const autoSize = getBool(node, 'AutoSize', node.type === 'Label' || node.type === 'LinkLabel');
      const st: CSSProperties = { ...alignmentStyle(align), whiteSpace: autoSize ? 'pre' : 'pre-wrap' };
      if (node.type === 'LinkLabel') {
        st.color = colorCss(node.properties.LinkColor, '#0066CC');
        st.textDecoration = 'underline';
      }
      return (
        <div className={`wf-fill wf-label ${borderClass(node)}`} style={st}>
          <span>{text}</span>
        </div>
      );
    }
    case 'TextBox':
    case 'MaskedTextBox':
    case 'RichTextBox': {
      const multiline = node.type === 'RichTextBox' || getBool(node, 'Multiline', false);
      const readOnly = getBool(node, 'ReadOnly', false);
      const pwd = getString(node, 'PasswordChar') || (getBool(node, 'UseSystemPasswordChar', false) ? '●' : '');
      let value = getString(node, 'Text');
      if (node.type === 'MaskedTextBox' && !value) {
        const mask = getString(node, 'Mask');
        const prompt = getString(node, 'PromptChar', '_') || '_';
        value = mask.replace(/[09#LA?&Ca]/g, prompt).replace(/\\(.)/g, '$1');
      }
      const placeholder = getString(node, 'PlaceholderText');
      const scroll = getEnum(node, 'ScrollBars', node.type === 'RichTextBox' ? 'Both' : 'None');
      const bs = getEnum(node, 'BorderStyle', 'Fixed3D');
      const bg = node.properties.BackColor ? undefined : readOnly ? CONTROL_BG : WINDOW_BG;
      const textAlign = horizontalAlign(node);
      const showV = multiline && (scroll === 'Vertical' || scroll === 'Both' || scroll === 'ForcedVertical' || scroll === 'ForcedBoth');
      const showH = multiline && (scroll === 'Horizontal' || scroll === 'ForcedHorizontal' || scroll === 'ForcedBoth');
      if (pv) {
        const v = pv.values[node.id] ?? getString(node, 'Text');
        const common = {
          className: 'wf-live-input',
          value: v,
          readOnly,
          placeholder,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => pv.setValue(node.id, e.target.value),
          style: { textAlign, font: 'inherit', color: 'inherit' } as CSSProperties,
        };
        return (
          <div className={`wf-fill wf-textbox wf-tb-${bs}`} style={{ background: bg }}>
            {multiline ? <textarea {...common} /> : <input {...common} type={pwd ? 'password' : 'text'} />}
          </div>
        );
      }
      const shown = pwd && value ? (pwd[0] ?? '●').repeat(value.length) : value;
      return (
        <div className={`wf-fill wf-textbox wf-tb-${bs} ${multiline ? 'wf-multiline' : ''}`} style={{ background: bg }}>
          <div className="wf-tb-text" style={{ textAlign, whiteSpace: multiline ? (getBool(node, 'WordWrap', true) ? 'pre-wrap' : 'pre') : 'pre' }}>
            {shown ? shown : placeholder ? <span className="wf-placeholder">{placeholder}</span> : null}
          </div>
          {showV ? <ScrollBarGlyph vertical /> : null}
          {showH ? <ScrollBarGlyph /> : null}
        </div>
      );
    }
    case 'CheckBox':
    case 'RadioButton': {
      const radio = node.type === 'RadioButton';
      let state: boolean | 'indeterminate' = getBool(node, 'Checked', false);
      const cs = getEnum(node, 'CheckState', '');
      if (cs === 'Checked') state = true;
      if (cs === 'Indeterminate') state = 'indeterminate';
      if (pv && pv.checks[node.id] !== undefined) state = pv.checks[node.id];
      const appearance = getEnum(node, 'Appearance', 'Normal');
      const onClick = pv
        ? () => {
            if (radio) pv.setRadio(nl.parentId ?? '', node.id);
            else pv.setCheck(node.id, state !== true);
          }
        : undefined;
      if (appearance === 'Button') {
        return (
          <div className={`wf-fill wf-button wf-btn-standard ${state === true ? 'wf-pressed' : ''}`} onClick={onClick} style={alignmentStyle('MiddleCenter')}>
            <span>{text}</span>
          </div>
        );
      }
      const align = getEnum(node, 'CheckAlign', 'MiddleLeft');
      const right = align.endsWith('Right');
      return (
        <div className="wf-fill wf-check-row" style={{ flexDirection: right ? 'row-reverse' : 'row' }} onClick={onClick}>
          {radio ? (
            <span className={`wf-radio-glyph ${state === true ? 'on' : ''}`} />
          ) : (
            <span className={`wf-check-glyph ${state === true ? 'on' : state === 'indeterminate' ? 'mixed' : ''}`}>
              {state === true ? (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          )}
          <span className="wf-check-text" style={{ textAlign: right ? 'right' : 'left' }}>
            {text}
          </span>
        </div>
      );
    }
    case 'ComboBox': {
      const style = getEnum(node, 'DropDownStyle', 'DropDown');
      const items = node.items ?? [];
      const shown = getString(node, 'Text') || (style === 'DropDownList' ? items[0] ?? '' : '');
      if (pv && items.length) {
        return (
          <div className={`wf-fill wf-combo ${style === 'DropDownList' ? 'wf-combo-list' : ''}`}>
            <select className="wf-live-select" value={pv.values[node.id] ?? shown} onChange={(e) => pv.setValue(node.id, e.target.value)}>
              {items.map((it, i) => (
                <option key={i} value={it}>
                  {it}
                </option>
              ))}
            </select>
          </div>
        );
      }
      if (style === 'Simple') {
        return (
          <div className="wf-fill wf-listbox wf-border-3d">
            <div className="wf-combo-simple-edit">{shown}</div>
            {items.map((it, i) => (
              <div key={i} className="wf-list-item">
                {it}
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className={`wf-fill wf-combo ${style === 'DropDownList' ? 'wf-combo-list' : ''}`}>
          <div className="wf-combo-text">{shown}</div>
          <div className="wf-combo-button">
            <Chevron />
          </div>
        </div>
      );
    }
    case 'ListBox':
    case 'CheckedListBox': {
      const items = node.items ?? [];
      const checked = node.type === 'CheckedListBox';
      return (
        <div className={`wf-fill wf-listbox ${borderClass(node, 'Fixed3D')}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
          {items.length === 0 && design ? <div className="wf-design-hint">{node.name}</div> : null}
          {items.map((it, i) => (
            <div key={i} className="wf-list-item">
              {checked ? <span className={`wf-check-glyph small ${pv?.checks[`${node.id}:${i}`] ? 'on' : ''}`} /> : null}
              <span>{it}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'NumericUpDown':
    case 'DomainUpDown': {
      let value: string;
      if (node.type === 'NumericUpDown') {
        const dp = getNumber(node, 'DecimalPlaces', 0);
        const v = getNumber(node, 'Value', getNumber(node, 'Minimum', 0));
        value = v.toFixed(dp);
        if (getBool(node, 'ThousandsSeparator', false)) value = Number(value).toLocaleString('en-US', { minimumFractionDigits: dp });
      } else value = getString(node, 'Text') || (node.items?.[0] ?? '');
      return (
        <div className="wf-fill wf-updown">
          {pv ? (
            <input className="wf-live-input" value={pv.values[node.id] ?? value} onChange={(e) => pv.setValue(node.id, e.target.value)} style={{ textAlign: horizontalAlign(node) }} />
          ) : (
            <div className="wf-tb-text" style={{ textAlign: horizontalAlign(node) }}>
              {value}
            </div>
          )}
          <div className="wf-spin">
            <span>
              <Chevron up />
            </span>
            <span>
              <Chevron />
            </span>
          </div>
        </div>
      );
    }
    case 'DateTimePicker': {
      const fmt = getEnum(node, 'Format', 'Long');
      const now = designedDate(node) ?? new Date();
      const str =
        fmt === 'Short'
          ? now.toLocaleDateString('en-US')
          : fmt === 'Time'
            ? now.toLocaleTimeString('en-US')
            : fmt === 'Custom'
              ? getString(node, 'CustomFormat') || now.toLocaleDateString('en-US')
              : now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const upDown = getBool(node, 'ShowUpDown', false);
      return (
        <div className="wf-fill wf-combo wf-dtp">
          {getBool(node, 'ShowCheckBox', false) ? <span className={`wf-check-glyph small ${getBool(node, 'Checked', true) ? 'on' : ''}`} /> : null}
          <div className="wf-combo-text">{str}</div>
          <div className="wf-combo-button">
            {upDown ? (
              <div className="wf-spin inline">
                <Chevron up />
                <Chevron />
              </div>
            ) : (
              <CalendarGlyph />
            )}
          </div>
        </div>
      );
    }
    case 'MonthCalendar':
      return <MonthCalendarBody fluent={fluent} />;
    case 'PictureBox': {
      const src = resolveImage(node, 'Image', ctx.resourceDataUris);
      const mode = getEnum(node, 'SizeMode', 'Normal');
      const fit: CSSProperties['objectFit'] = mode === 'StretchImage' ? 'fill' : mode === 'Zoom' ? 'contain' : 'none';
      const pos = mode === 'CenterImage' || mode === 'Zoom' ? 'center' : 'left top';
      return (
        <div className={`wf-fill wf-picture ${borderClass(node)} ${!src && design ? 'wf-picture-empty' : ''}`}>
          {src ? (
            <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: pos }} />
          ) : design ? (
            <div className="wf-picture-placeholder">
              <Icon name="PictureBox" size={Math.min(28, Math.max(12, Math.min(W, H) / 3))} />
            </div>
          ) : null}
        </div>
      );
    }
    case 'ProgressBar': {
      const min = getNumber(node, 'Minimum', 0);
      const max = getNumber(node, 'Maximum', 100);
      const val = getNumber(node, 'Value', 0);
      const pct = max > min ? Math.min(1, Math.max(0, (val - min) / (max - min))) : 0;
      const style = getEnum(node, 'Style', 'Blocks');
      return (
        <div className={`wf-fill wf-progress ${style === 'Marquee' ? 'wf-marquee' : ''}`}>
          {style === 'Marquee' ? <div className="wf-progress-marquee" /> : <div className="wf-progress-fill" style={{ width: `${pct * 100}%` }} />}
        </div>
      );
    }
    case 'TrackBar':
      return <TrackBarBody node={node} W={W} H={H} />;
    case 'ListView':
      return <ListViewBody node={node} design={design} />;
    case 'TreeView':
      return <TreeViewBody node={node} design={design} />;
    case 'DataGridView':
      return <DataGridBody node={node} W={W} H={H} />;
    case 'GroupBox': {
      const flat = getEnum(node, 'FlatStyle', 'Standard') === 'Flat';
      return (
        <div className={`wf-fill wf-groupbox ${flat ? 'flat' : ''}`}>
          <div className="wf-group-frame" />
          {text ? <div className="wf-group-legend" style={{ background: amb.backColor }}>{text}</div> : null}
        </div>
      );
    }
    case 'Panel':
    case 'TabPage':
    case 'UserControl': {
      const bc = borderClass(node);
      return <div className={`wf-fill ${bc} ${!bc && design && node.type === 'Panel' ? 'wf-design-dashed' : ''}`} />;
    }
    case 'FlowLayoutPanel': {
      const dir = getEnum(node, 'FlowDirection', 'LeftToRight');
      const arrow = dir === 'LeftToRight' ? '→' : dir === 'RightToLeft' ? '←' : dir === 'TopDown' ? '↓' : '↑';
      const bc = borderClass(node);
      return (
        <div className={`wf-fill ${bc} ${!bc && design ? 'wf-design-dashed' : ''}`}>
          {design ? (
            <span className="wf-layout-badge" title={`FlowDirection = ${dir}${getBool(node, 'WrapContents', true) ? ', wrapping' : ''}`}>
              {arrow}
            </span>
          ) : null}
        </div>
      );
    }
    case 'TableLayoutPanel':
      return <TableGridBody node={node} nl={nl} design={design} />;
    case 'SplitContainer':
      return <SplitContainerBody node={node} nl={nl} ctx={ctx} />;
    case 'TabControl':
      return <TabControlBody node={node} nl={nl} ctx={ctx} />;
    case 'MenuStrip':
    case 'ToolStrip':
    case 'StatusStrip':
    case 'ContextMenuStrip':
      return <StripBody node={node} ctx={ctx} />;
    case 'BindingNavigator':
      return (
        <div className="wf-fill wf-strip wf-toolstrip">
          <span className="wf-grip" />
          {['⏮', '◀'].map((g) => (
            <span key={g} className="wf-strip-btn glyph">
              {g}
            </span>
          ))}
          <span className="wf-strip-sep" />
          <span className="wf-nav-pos">0</span>
          <span className="wf-strip-label">of {'{0}'}</span>
          <span className="wf-strip-sep" />
          {['▶', '⏭'].map((g) => (
            <span key={g} className="wf-strip-btn glyph">
              {g}
            </span>
          ))}
          <span className="wf-strip-sep" />
          <span className="wf-strip-btn glyph">＋</span>
          <span className="wf-strip-btn glyph">✕</span>
        </div>
      );
    case 'HScrollBar':
    case 'VScrollBar': {
      const vertical = node.type === 'VScrollBar';
      const min = getNumber(node, 'Minimum', 0);
      const max = getNumber(node, 'Maximum', 100);
      const val = getNumber(node, 'Value', 0);
      const large = getNumber(node, 'LargeChange', 10);
      const track = (vertical ? H : W) - 34;
      const thumb = Math.max(12, (track * large) / Math.max(1, max - min + 1));
      const pos = ((val - min) / Math.max(1, max - min - large + 1)) * (track - thumb);
      return (
        <div className={`wf-fill wf-scrollbar ${vertical ? 'vertical' : ''}`}>
          <span className="wf-sb-arrow">
            <Chevron up={vertical} left={!vertical} />
          </span>
          <span className="wf-sb-track">
            <span className="wf-sb-thumb" style={vertical ? { top: Math.max(0, pos), height: thumb } : { left: Math.max(0, pos), width: thumb }} />
          </span>
          <span className="wf-sb-arrow">
            <Chevron right={!vertical} />
          </span>
        </div>
      );
    }
    case 'Splitter':
      return <div className={`wf-fill wf-splitter-ctl ${borderClass(node)}`} />;
    case 'PropertyGrid':
      return (
        <div className="wf-fill wf-propgrid">
          {getBool(node, 'ToolbarVisible', true) ? (
            <div className="wf-pg-toolbar">
              <Icon name="categorized" size={12} />
              <Icon name="alphabetical" size={12} />
            </div>
          ) : null}
          <div className="wf-pg-rows">
            {['Appearance', 'Behavior', 'Layout'].map((c) => (
              <div key={c} className="wf-pg-cat">
                <b>{c}</b>
                <div className="wf-pg-row">
                  <span />
                  <span />
                </div>
                <div className="wf-pg-row">
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
          {getBool(node, 'HelpVisible', true) ? <div className="wf-pg-help" /> : null}
        </div>
      );
    case 'WebBrowser':
      return (
        <div className="wf-fill wf-webbrowser">
          <Icon name="WebBrowser" size={22} />
          <span>{getString(node, 'Url') || 'about:blank'}</span>
        </div>
      );
    case 'PrintPreviewControl':
      return (
        <div className="wf-fill wf-printpreview">
          <div className="wf-pp-page">
            <i />
            <i />
            <i />
            <i style={{ width: '60%' }} />
          </div>
        </div>
      );
    default:
      if (node.isUnknownType || !nl.slots) {
        return (
          <div className="wf-fill wf-blueprint">
            <div className="wf-blueprint-label">
              <ControlIcon type={node.type} size={14} />
              <b>{node.name}</b>
              <span title={node.fullTypeName ?? node.type}>{node.type}</span>
            </div>
          </div>
        );
      }
      return <div className={`wf-fill ${borderClass(node)}`} />;
  }
}

function ButtonBody({ node, ctx, text }: { node: DesignNode; ctx: RenderContext; text: string }) {
  const flat = getEnum(node, 'FlatStyle', 'Standard');
  const useVs = getBool(node, 'UseVisualStyleBackColor', true);
  const hasBack = !!node.properties.BackColor && (!useVs || flat === 'Flat' || flat === 'Popup');
  const align = getEnum(node, 'TextAlign', 'MiddleCenter');
  const img = resolveImage(node, 'Image', ctx.resourceDataUris);
  const rel = getEnum(node, 'TextImageRelation', 'Overlay');
  const dir: CSSProperties['flexDirection'] =
    rel === 'ImageAboveText' ? 'column' : rel === 'TextAboveImage' ? 'column-reverse' : rel === 'TextBeforeImage' ? 'row-reverse' : 'row';
  const st: CSSProperties = { ...alignmentStyle(align) };
  if (hasBack) st.backgroundColor = colorCss(node.properties.BackColor, CONTROL_BG);
  if (flat === 'Flat') {
    const bc = node.properties['FlatAppearance.BorderColor'];
    const bsz = getNumber(node, 'FlatAppearance.BorderSize', 1);
    st.border = `${bsz}px solid ${bc ? colorCss(bc, '#000') : hasBack ? 'transparent' : '#000'}`;
  }
  return (
    <div className={`wf-fill wf-button wf-btn-${flat.toLowerCase()} ${hasBack ? 'wf-has-back' : ''}`} style={st}>
      <span className="wf-btn-content" style={{ flexDirection: dir }}>
        {img ? <img src={img} alt="" draggable={false} className="wf-btn-img" /> : null}
        {text ? <span className="wf-btn-text">{text}</span> : null}
      </span>
    </div>
  );
}

function Chevron({ up, left, right }: { up?: boolean; left?: boolean; right?: boolean }) {
  const d = up ? 'M2.5 7 6 3.5 9.5 7' : left ? 'M7 2.5 3.5 6 7 9.5' : right ? 'M5 2.5 8.5 6 5 9.5' : 'M2.5 4.5 6 8l3.5-3.5';
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="12" rx="1" fill="none" stroke="currentColor" />
      <path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor" />
      <rect x="9" y="9" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

function ScrollBarGlyph({ vertical }: { vertical?: boolean }) {
  return (
    <div className={`wf-inline-scroll ${vertical ? 'vertical' : 'horizontal'}`}>
      <span className="wf-sb-arrow">
        <Chevron up={vertical} left={!vertical} />
      </span>
      <span className="wf-sb-track">
        <span className="wf-sb-thumb" />
      </span>
      <span className="wf-sb-arrow">
        <Chevron right={!vertical} />
      </span>
    </div>
  );
}

function MonthCalendarBody({ fluent }: { fluent: boolean }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className={`wf-fill wf-monthcal ${fluent ? '' : 'classic'}`}>
      <div className="wf-mc-head">
        <Chevron left />
        <b>{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <Chevron right />
      </div>
      <div className="wf-mc-grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d} className="wf-mc-dow">
            {d}
          </span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className={`wf-mc-day ${d.getMonth() !== now.getMonth() ? 'other' : ''} ${d.toDateString() === now.toDateString() ? 'today' : ''}`}>
            {d.getDate()}
          </span>
        ))}
      </div>
      <div className="wf-mc-foot">Today: {now.toLocaleDateString('en-US')}</div>
    </div>
  );
}

function TrackBarBody({ node, W, H }: { node: DesignNode; W: number; H: number }) {
  const vertical = getEnum(node, 'Orientation', 'Horizontal') === 'Vertical';
  const min = getNumber(node, 'Minimum', 0);
  const max = getNumber(node, 'Maximum', 10);
  const val = getNumber(node, 'Value', 0);
  const freq = Math.max(1, getNumber(node, 'TickFrequency', 1));
  const ticks = getEnum(node, 'TickStyle', 'BottomRight');
  const len = (vertical ? H : W) - 26;
  const count = Math.min(200, Math.floor((max - min) / freq));
  const pct = max > min ? (val - min) / (max - min) : 0;
  const tickEls: ReactNode[] = [];
  for (let i = 0; i <= count; i++) {
    const p = 13 + (len * (i * freq)) / Math.max(1, max - min);
    const st: CSSProperties = vertical ? { top: p } : { left: p };
    if (ticks === 'BottomRight' || ticks === 'Both') tickEls.push(<i key={`b${i}`} className="wf-tick br" style={st} />);
    if (ticks === 'TopLeft' || ticks === 'Both') tickEls.push(<i key={`t${i}`} className="wf-tick tl" style={st} />);
  }
  const thumbPos = 13 + len * pct;
  return (
    <div className={`wf-fill wf-trackbar ${vertical ? 'vertical' : ''}`}>
      <div className="wf-track-rail">
        <div className="wf-track-fill" style={vertical ? { height: `${pct * 100}%` } : { width: `${pct * 100}%` }} />
      </div>
      {tickEls}
      <div className="wf-track-thumb" style={vertical ? { top: thumbPos } : { left: thumbPos }} />
    </div>
  );
}

const LV_SAMPLE_ROWS: string[][] = [
  ['Annual Report.docx', 'Document', '3/14/2026'],
  ['Budget 2026.xlsx', 'Workbook', '3/12/2026'],
  ['Customers.csv', 'CSV File', '3/09/2026'],
  ['Logo.png', 'PNG Image', '2/27/2026'],
  ['Notes.txt', 'Text File', '2/21/2026'],
  ['Presentation.pptx', 'Presentation', '2/18/2026'],
  ['Setup.exe', 'Application', '1/30/2026'],
  ['Archive.zip', 'Compressed', '1/12/2026'],
];

const LV_DEFAULT_COLUMNS = [
  { id: 'lv-d-name', name: '', text: 'Name', width: 140 },
  { id: 'lv-d-type', name: '', text: 'Type', width: 90 },
  { id: 'lv-d-mod', name: '', text: 'Modified', width: 90 },
];

function LvDocIcon({ size, tone }: { size: 16 | 32; tone: number }) {
  const hues = ['#2b6cb0', '#2f855a', '#b7791f', '#9b2c2c', '#6b46c1', '#2c7a7b', '#4a5568', '#975a16'];
  const c = hues[tone % hues.length];
  return (
    <svg className="wf-lv-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M7 3h12l7 7v19H7z" fill="#ffffff" stroke="#8a8a8a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M19 3v7h7" fill="#eeeeee" stroke="#8a8a8a" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="10" y="15" width="13" height="2.4" rx="1" fill={c} />
      <rect x="10" y="19.5" width="13" height="2" rx="1" fill={c} opacity=".55" />
      <rect x="10" y="23.5" width="9" height="2" rx="1" fill={c} opacity=".55" />
    </svg>
  );
}

function ListViewBody({ node, design }: { node: DesignNode; design: boolean }) {
  const view = getEnum(node, 'View', 'LargeIcon');
  const cols = node.listViewColumns?.length ? node.listViewColumns : LV_DEFAULT_COLUMNS;
  const grid = getBool(node, 'GridLines', false);
  const checks = getBool(node, 'CheckBoxes', false);
  const headerStyle = getEnum(node, 'HeaderStyle', 'Clickable');
  const items = node.items?.length ? node.items.map((t, i) => [t, LV_SAMPLE_ROWS[i % LV_SAMPLE_ROWS.length][1], LV_SAMPLE_ROWS[i % LV_SAMPLE_ROWS.length][2]]) : LV_SAMPLE_ROWS;
  const sample = design || !!node.items?.length;
  const check = (i: number) => (checks ? <span className={`wf-check-glyph small ${i === 1 ? 'on' : ''}`} /> : null);
  let body: ReactNode = null;
  if (view === 'Details') {
    body = (
      <>
        {headerStyle !== 'None' ? (
          <div className="wf-lv-header">
            {cols.map((c) => (
              <span key={c.id} style={{ width: c.width }}>
                {c.text}
              </span>
            ))}
            <span className="wf-lv-filler" />
          </div>
        ) : null}
        <div className={`wf-lv-details ${grid ? 'grid' : ''}`}>
          {sample
            ? items.map((row, i) => (
                <div key={i} className="wf-lv-drow">
                  {cols.map((c, ci) => (
                    <span key={c.id} style={{ width: c.width }}>
                      {ci === 0 ? check(i) : null}
                      {ci === 0 ? <LvDocIcon size={16} tone={i} /> : null}
                      <span className="wf-lv-celltext">{row[ci] ?? ''}</span>
                    </span>
                  ))}
                </div>
              ))
            : null}
        </div>
      </>
    );
  } else if (sample) {
    const cls = view === 'Tile' ? 'tile' : view === 'SmallIcon' ? 'small' : view === 'List' ? 'list' : 'large';
    body = (
      <div className={`wf-lv-items ${cls}`}>
        {items.map((row, i) => (
          <div key={i} className="wf-lv-item">
            {view !== 'LargeIcon' && view !== 'Tile' ? check(i) : null}
            <LvDocIcon size={view === 'LargeIcon' || view === 'Tile' ? 32 : 16} tone={i} />
            {view === 'Tile' ? (
              <span className="wf-lv-tiletext">
                <span>{row[0]}</span>
                <span className="wf-lv-sub">{row[1]}</span>
              </span>
            ) : (
              <span className="wf-lv-label">
                {view === 'LargeIcon' ? check(i) : null}
                {row[0]}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`wf-fill wf-listview ${borderClass(node, 'Fixed3D')}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
      {body}
    </div>
  );
}

function TreeViewBody({ node, design }: { node: DesignNode; design: boolean }) {
  const nodes = node.treeNodes ?? [];
  const lines = getBool(node, 'ShowLines', true);
  const checks = getBool(node, 'CheckBoxes', false);
  const render = (items: typeof nodes, depth: number): ReactNode =>
    items.map((it) => (
      <div key={it.id}>
        <div className="wf-tree-row" style={{ paddingLeft: 4 + depth * 16 }}>
          <span className="wf-tree-toggle">{it.children?.length ? <Chevron /> : null}</span>
          {checks ? <span className="wf-check-glyph small" /> : null}
          <span>{it.text}</span>
        </div>
        {it.children?.length ? render(it.children, depth + 1) : null}
      </div>
    ));
  return (
    <div className={`wf-fill wf-treeview ${borderClass(node, 'Fixed3D')} ${lines ? 'lines' : ''}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
      {nodes.length ? render(nodes, 0) : design ? <div className="wf-design-hint">{node.name}</div> : null}
    </div>
  );
}

function DataGridBody({ node, W, H }: { node: DesignNode; W: number; H: number }) {
  const cols = (node.columns ?? []).filter((c) => c.visible !== false);
  const rowHeaders = getBool(node, 'RowHeadersVisible', true);
  const colHeaders = getBool(node, 'ColumnHeadersVisible', true);
  const fill = getEnum(node, 'AutoSizeColumnsMode', 'None') === 'Fill';
  const gutter = rowHeaders ? 41 : 0;
  const avail = Math.max(0, W - gutter - 2);
  const widths = fill && cols.length ? cols.map(() => avail / cols.length) : cols.map((c) => c.width ?? 100);
  const headerH = 25;
  const rowH = 22;
  const addRow = getBool(node, 'AllowUserToAddRows', true);
  const rowsShown = Math.max(0, Math.min(40, Math.floor((H - (colHeaders ? headerH : 0)) / rowH)));
  const bg = colorCss(node.properties.BackgroundColor, '#ABABAB');
  return (
    <div className={`wf-fill wf-datagrid ${borderClass(node, 'FixedSingle')}`} style={{ background: bg }}>
      {colHeaders ? (
        <div className="wf-dg-header" style={{ height: headerH }}>
          {rowHeaders ? <span className="wf-dg-corner" style={{ width: gutter }} /> : null}
          {cols.map((c, i) => (
            <span key={c.id} className="wf-dg-colhead" style={{ width: widths[i] }}>
              {c.headerText}
            </span>
          ))}
        </div>
      ) : null}
      {cols.length > 0
        ? Array.from({ length: rowsShown }, (_, r) => (
            <div key={r} className={`wf-dg-row ${r % 2 ? 'alt' : ''} ${addRow && r === 0 ? 'new' : ''}`} style={{ height: rowH }}>
              {rowHeaders ? (
                <span className="wf-dg-rowhead" style={{ width: gutter }}>
                  {r === 0 ? (addRow ? '*' : '▸') : ''}
                </span>
              ) : null}
              {cols.map((c, i) => (
                <span key={c.id} className="wf-dg-cell" style={{ width: widths[i] }}>
                  {c.columnType === 'DataGridViewCheckBoxColumn' ? <span className="wf-check-glyph small" /> : null}
                  {c.columnType === 'DataGridViewButtonColumn' ? <span className="wf-dg-btn" /> : null}
                  {c.columnType === 'DataGridViewComboBoxColumn' ? (
                    <span className="wf-dg-combo">
                      <Chevron />
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ))
        : null}
    </div>
  );
}

function TableGridBody({ node, nl, design }: { node: DesignNode; nl: NodeLayout; design: boolean }) {
  const t = nl.container?.table;
  const bc = borderClass(node);
  const cellStyle = getEnum(node, 'CellBorderStyle', 'None');
  if (!t) return <div className="wf-fill" />;
  const lines: ReactNode[] = [];
  const solid = cellStyle !== 'None';
  if (design || solid) {
    const yTop = t.ys[0];
    const yBot = t.ys[t.ys.length - 1];
    const xL = t.xs[0];
    const xR = t.xs[t.xs.length - 1];
    t.xs.forEach((x, i) =>
      lines.push(<i key={`x${i}`} className={`wf-tl-line v ${solid ? 'solid' : ''}`} style={{ left: x, top: yTop, height: yBot - yTop }} />)
    );
    t.ys.forEach((y, i) =>
      lines.push(<i key={`y${i}`} className={`wf-tl-line h ${solid ? 'solid' : ''}`} style={{ top: y, left: xL, width: xR - xL }} />)
    );
  }
  return (
    <div className={`wf-fill ${bc}`}>
      {lines}
    </div>
  );
}

function SplitContainerBody({ node, nl, ctx }: { node: DesignNode; nl: NodeLayout; ctx: RenderContext }) {
  const cl = nl.container;
  const sp = cl?.splitter;
  const vertical = getEnum(node, 'Orientation', 'Vertical') === 'Vertical';
  const fixed = getBool(node, 'IsSplitterFixed', false);
  const bc = borderClass(node);
  const p1Back = node.properties['Panel1.BackColor'];
  const p2Back = node.properties['Panel2.BackColor'];
  return (
    <div className={`wf-fill ${bc}`}>
      {cl?.slots.map((s) =>
        s.hidden ? null : (
          <div
            key={s.slot}
            className={`wf-split-panel ${ctx.mode === 'design' ? 'design' : ''}`}
            style={{
              ...rectStyle(s.clip),
              background: s.slot === 'Panel1' ? (p1Back ? colorCss(p1Back, 'transparent') : undefined) : p2Back ? colorCss(p2Back, 'transparent') : undefined,
            }}
          />
        )
      )}
      {sp ? (
        <div
          className={`wf-split-bar ${vertical ? 'vertical' : 'horizontal'} ${fixed ? 'fixed' : ''}`}
          data-splitter={node.id}
          style={rectStyle(sp)}
          onPointerDown={ctx.onSplitterPointerDown && !fixed ? (e) => ctx.onSplitterPointerDown!(e, node.id) : undefined}
        >
          <span className="wf-split-grip" />
        </div>
      ) : null}
    </div>
  );
}

function TabControlBody({ node, nl, ctx }: { node: DesignNode; nl: NodeLayout; ctx: RenderContext }) {
  const cl = nl.container;
  const headers = cl?.tabHeaders ?? [];
  const body = cl?.tabBody;
  const bottom = getEnum(node, 'Alignment', 'Top') === 'Bottom';
  const appearance = getEnum(node, 'Appearance', 'Normal');
  const lastRight = headers.length ? headers[headers.length - 1].rect.x + headers[headers.length - 1].rect.width : 2;
  return (
    <div className={`wf-fill wf-tabcontrol ${bottom ? 'bottom' : ''} ${appearance !== 'Normal' ? 'buttons' : ''}`}>
      {body ? <div className="wf-tab-body" style={rectStyle(body)} /> : null}
      <div className="wf-tab-strip" style={{ top: bottom ? nl.bounds.height - TAB_HEADER_HEIGHT : 0, height: TAB_HEADER_HEIGHT }}>
        {headers.map((h) => (
          <div
            key={h.id}
            className={`wf-tab-header ${h.selected ? 'selected' : ''}`}
            data-tab-control={node.id}
            data-tab-index={h.index}
            style={{ left: h.rect.x, width: h.rect.width }}
            onPointerDown={
              ctx.onTabClick
                ? (e) => {
                    if (e.button !== 0) return;
                    ctx.onTabClick!(node.id, h.index);
                  }
                : undefined
            }
          >
            <span>{h.text}</span>
          </div>
        ))}
        {ctx.mode === 'design' && !ctx.locked ? (
          <button className="wf-tab-add" data-add-tab={node.id} style={{ left: lastRight + 4 }} title="Add tab page" tabIndex={-1}>
            <Icon name="plus" size={10} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function stripItemContent(it: StripItemNode): ReactNode {
  const text = displayText(it.text ?? '');
  switch (it.type) {
    case 'ToolStripSeparator':
      return null;
    case 'ToolStripTextBox':
      return <span className="wf-strip-textbox">{text}</span>;
    case 'ToolStripComboBox':
      return (
        <span className="wf-strip-combo">
          {text}
          <Chevron />
        </span>
      );
    case 'ToolStripProgressBar':
      return (
        <span className="wf-strip-progress">
          <i />
        </span>
      );
    case 'ToolStripDropDownButton':
    case 'ToolStripSplitButton':
      return (
        <>
          <span>{text}</span>
          <Chevron />
        </>
      );
    default:
      return <span>{text}</span>;
  }
}

function StripBody({ node, ctx }: { node: DesignNode; ctx: RenderContext }) {
  const items = node.stripItems ?? [];
  const kind = node.type;
  const grip = kind === 'ToolStrip' && getEnum(node, 'GripStyle', 'Visible') === 'Visible';
  const sizing = kind === 'StatusStrip' && getBool(node, 'SizingGrip', true);
  const design = ctx.mode === 'design';
  return (
    <div className={`wf-fill wf-strip wf-${kind.toLowerCase()}`}>
      {grip ? <span className="wf-grip" /> : null}
      {items.map((it) =>
        it.type === 'ToolStripSeparator' ? (
          <span key={it.id} className="wf-strip-sep" data-strip-item={it.id} />
        ) : (
          <span
            key={it.id}
            data-strip-item={it.id}
            className={`wf-strip-item ${kind === 'MenuStrip' ? 'menu' : kind === 'StatusStrip' ? 'status' : 'btn'} ${it.type === 'ToolStripLabel' || it.type === 'ToolStripStatusLabel' ? 'label' : ''}`}
            style={isEnumValue(it.properties.Alignment) && it.properties.Alignment.value === 'Right' ? { marginLeft: 'auto' } : undefined}
          >
            {stripItemContent(it)}
          </span>
        )
      )}
      {design && !ctx.locked ? (
        <span className="wf-strip-add" data-strip-add={node.id} title={kind === 'MenuStrip' ? 'Type here to add a menu item' : 'Add item'}>
          {kind === 'MenuStrip' ? 'Type Here' : <Icon name="plus" size={10} />}
        </span>
      ) : null}
      {sizing ? <span className="wf-sizing-grip" /> : null}
    </div>
  );
}

/** Renders the client area children of the root form/user control. */
export function FormClient({ root, ctx }: { root: DesignNode; ctx: RenderContext }) {
  const nl = ctx.layout.get(root.id);
  if (!nl) return null;
  const font = getFont(root);
  const amb: Ambient = {
    font,
    foreColor: colorCss(root.properties.ForeColor, TEXT),
    backColor: colorCss(root.properties.BackColor, CONTROL_BG),
  };
  return (
    <>
      <ContainerTargets node={root} nl={nl} />
      <Children node={root} nl={nl} ctx={ctx} amb={amb} />
    </>
  );
}

export function formSurfaceStyle(root: DesignNode, resourceDataUris: Record<string, string>): CSSProperties {
  const font = getFont(root);
  const st: CSSProperties = {
    ...fontToCss(font),
    color: colorCss(root.properties.ForeColor, TEXT),
    backgroundColor: colorCss(root.properties.BackColor, CONTROL_BG),
  };
  const bg = resolveImage(root, 'BackgroundImage', resourceDataUris);
  if (bg) {
    const layout = getEnum(root, 'BackgroundImageLayout', 'Tile');
    st.backgroundImage = `url("${bg}")`;
    st.backgroundRepeat = layout === 'Tile' ? 'repeat' : 'no-repeat';
    st.backgroundSize = layout === 'Stretch' ? '100% 100%' : layout === 'Zoom' ? 'contain' : 'auto';
    st.backgroundPosition = layout === 'Center' || layout === 'Zoom' ? 'center' : '0 0';
  }
  return st;
}

export { GRAY_TEXT };
