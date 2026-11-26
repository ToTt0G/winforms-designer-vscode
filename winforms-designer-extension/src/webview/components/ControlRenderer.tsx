// High-fidelity rendering of WinForms controls (Fluent / Classic) for the design
// surface and the interactive live preview.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DesignNode, FontValue, PropertyValue, ResourceMap, StripItemNode } from '../../shared/model';
import { isEnumValue, isRawExpressionValue, isResourceValue } from '../../shared/model';
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
  setCheck(id: string, v: boolean | 'indeterminate'): void;
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
  /** Localized resource strings for the active (non-default) culture, keyed `name.Text` / `$this.Text`. */
  cultureStrings?: Record<string, string>;
  /** Neutral form .resx entries (used to resolve resources.GetString(...) Text values). */
  resources?: ResourceMap;
  /** On-canvas strip editing ("Type Here" / "+", rename, remove); absent when not editable. */
  strip?: StripEditContext;
  /** Name of the form's AcceptButton; that Button draws the WinForms default-button cue. */
  acceptButtonName?: string;
  /** Live preview: a ToolStripItem (menu item / tool button) was clicked. */
  onStripItemClick?: (item: StripItemNode) => void;
}

export interface StripEditContext {
  /** Strip currently showing an inline input, and the item being renamed (null = adding). */
  editing: { stripId: string; itemId: string | null } | null;
  onCommit(stripId: string, itemId: string | null, text: string | null): void;
}

/** Text shown for `node`, preferring the active culture's localized value, then neutral .resx strings. */
export function localizedText(
  node: DesignNode,
  cultureStrings?: Record<string, string>,
  resources?: ResourceMap
): string {
  const key = node.type === 'Form' || node.type === 'UserControl' ? '$this.Text' : `${node.name}.Text`;
  if (cultureStrings) {
    const v = cultureStrings[key];
    if (v !== undefined) return v;
  }
  const prop = node.properties.Text;
  if (isResourceValue(prop) && resources) {
    const entry = resources[prop.resourceName];
    if (entry && entry.kind === 'string') return entry.value;
  }
  return getText(node);
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
      : node.type === 'TabPage' && getBool(node, 'UseVisualStyleBackColor', true) && ctx.renderStyle === 'fluent'
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
  if (node.inherited && ctx.mode === 'design') cls.push('wf-inherited');
  if (AUTOSIZE_TEXT.has(node.type) && getBool(node, 'AutoSize', node.type !== 'CheckBox' && node.type !== 'RadioButton' ? true : false)) cls.push('wf-autosize');
  return (
    <div className={cls.join(' ')} data-node-id={node.id} data-node-type={node.type} style={style}>
      <ControlBody node={node} nl={nl} ctx={ctx} amb={childAmb} font={font} />
      {nl.slots ? <ContainerTargets node={node} nl={nl} /> : null}
      {node.children.length ? <Children node={node} nl={nl} ctx={ctx} amb={childAmb} /> : null}
      {node.inherited && ctx.mode === 'design' ? (
        <span className="wf-inherited-badge" title={`Inherited from ${node.inheritedFrom ?? 'base class'}`} aria-label={`Inherited from ${node.inheritedFrom ?? 'base class'}`} data-inherited-badge={node.id}>
          <Icon name="inherited" size={9} />
        </span>
      ) : null}
    </div>
  );
});

function ControlBody({ node, nl, ctx, amb, font }: { node: DesignNode; nl: NodeLayout; ctx: RenderContext; amb: Ambient; font: FontValue }) {
  const text = displayText(localizedText(node, ctx.cultureStrings, ctx.resources));
  const W = nl.bounds.width;
  const H = nl.bounds.height;
  const fluent = ctx.renderStyle === 'fluent';
  const design = ctx.mode === 'design';
  const pv = ctx.preview;

  switch (node.type) {
    case 'Button':
      return <ButtonBody node={node} ctx={ctx} text={text} isDefault={!!ctx.acceptButtonName && ctx.acceptButtonName === node.name} />;
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
      // RichTextBox scroll bars appear only when needed (Forced* always); TextBox scroll bars are always drawn.
      const rich = node.type === 'RichTextBox';
      const showV = multiline && (rich ? scroll.startsWith('Forced') && scroll !== 'ForcedHorizontal' : scroll === 'Vertical' || scroll === 'Both');
      const showH = multiline && (rich ? scroll === 'ForcedHorizontal' || scroll === 'ForcedBoth' : scroll === 'Horizontal' || scroll === 'Both');
      const wrap = getBool(node, 'WordWrap', true) && !showH;
      const shown = pwd && value ? (pwd[0] ?? '●').repeat(value.length) : value;
      // Design and preview draw the very same <input>/<textarea> (inert at design time) so text metrics match pixel-for-pixel.
      const live = !!pv;
      const current = live ? pv!.values[node.id] || (node.type === 'MaskedTextBox' ? value : '') : shown;
      const onChange = live ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => pv!.setValue(node.id, e.target.value) : undefined;
      const inputCls = live ? 'wf-live-input' : 'wf-live-input wf-static-input';
      const common = { className: inputCls, value: current, readOnly: readOnly || !live, placeholder, onChange, tabIndex: live ? undefined : -1, 'aria-hidden': live ? undefined : true };
      return (
        <div className={`wf-fill wf-textbox wf-tb-${bs} ${multiline ? 'wf-multiline' : ''}`} style={{ background: bg }}>
          {multiline ? (
            <textarea {...common} wrap={wrap ? 'soft' : 'off'} style={{ textAlign, width: 'auto', height: 'auto', right: showV ? 17 : 0, bottom: showH ? 17 : 0 }} />
          ) : (
            <input {...common} type={live && pwd ? 'password' : 'text'} style={{ textAlign }} />
          )}
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
      const threeState = !radio && getBool(node, 'ThreeState', false);
      const onClick = pv
        ? () => {
            if (radio) pv.setRadio(nl.parentId ?? '', node.id);
            else if (threeState) pv.setCheck(node.id, state === false ? true : state === true ? 'indeterminate' : false);
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
            <CheckGlyph state={state} />
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
      const designed = getString(node, 'Text') || (style === 'DropDownList' ? items[0] ?? '' : '');
      const shown = pv ? pv.values[node.id] ?? designed : designed;
      if (style === 'Simple') {
        return (
          <div className="wf-fill wf-listbox wf-combo-simple">
            <div className="wf-combo-simple-edit">{shown}</div>
            {items.map((it, i) => (
              <div key={i} className={`wf-list-item ${pv && it === shown ? 'selected' : ''}`} onClick={pv ? () => pv.setValue(node.id, it) : undefined}>
                {it}
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className={`wf-fill wf-combo ${style === 'DropDownList' ? 'wf-combo-list' : 'wf-combo-edit'}`}>
          <div className="wf-combo-text">{shown}</div>
          <div className="wf-combo-button">
            <Chevron />
          </div>
          {pv && items.length ? (
            // Invisible native <select> keeps the designed pixels identical while still opening a real list.
            <select className="wf-live-select" aria-label={node.name} value={shown} onChange={(e) => pv.setValue(node.id, e.target.value)}>
              {items.includes(shown) ? null : <option value={shown}>{shown}</option>}
              {items.map((it, i) => (
                <option key={i} value={it}>
                  {it}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      );
    }
    case 'ListBox':
    case 'CheckedListBox': {
      const items = node.items ?? [];
      const checked = node.type === 'CheckedListBox';
      const sel = pv ? Number(pv.values[node.id] ?? -1) : -1;
      return (
        <div className={`wf-fill wf-listbox ${listBorderClass(node)}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
          {items.length === 0 && design ? <div className="wf-design-hint">{node.name}</div> : null}
          {items.map((it, i) => {
            const key = `${node.id}:${i}`;
            const isChecked = pv?.checks[key] === true;
            return (
              <div
                key={i}
                className={`wf-list-item ${sel === i ? 'selected' : ''}`}
                onClick={
                  pv
                    ? (e) => {
                        const onGlyph = (e.target as HTMLElement).closest('.wf-check-glyph');
                        // CheckedListBox: the first click selects, a click on the selected item (or its box) toggles it.
                        if (checked && (onGlyph || sel === i || getBool(node, 'CheckOnClick', false))) pv.setCheck(key, !isChecked);
                        pv.setValue(node.id, String(i));
                      }
                    : undefined
                }
              >
                {checked ? <CheckGlyph state={isChecked} small /> : null}
                <span>{it}</span>
              </div>
            );
          })}
        </div>
      );
    }
    case 'NumericUpDown':
    case 'DomainUpDown': {
      let value: string;
      if (node.type === 'NumericUpDown') value = formatNumeric(node, getNumber(node, 'Value', getNumber(node, 'Minimum', 0)));
      else value = getString(node, 'Text') || (node.items?.[0] ?? '');
      const current = pv ? pv.values[node.id] ?? value : value;
      const spin = (dir: 1 | -1) => {
        if (!pv) return;
        if (node.type === 'NumericUpDown') {
          const min = getNumber(node, 'Minimum', 0);
          const max = Math.max(min, getNumber(node, 'Maximum', 100));
          const inc = getNumber(node, 'Increment', 1);
          const parsed = Number(current.replace(/,/g, ''));
          const base = Number.isFinite(parsed) ? parsed : min;
          pv.setValue(node.id, formatNumeric(node, Math.min(max, Math.max(min, base + dir * inc))));
        } else {
          const items = node.items ?? [];
          if (!items.length) return;
          const i = items.indexOf(current);
          // DomainUpDown: "up" moves toward the start of the list.
          pv.setValue(node.id, items[Math.min(items.length - 1, Math.max(0, (i < 0 ? 0 : i) - dir))]);
        }
      };
      const updownCls = getEnum(node, 'BorderStyle', 'Fixed3D');
      return (
        <div className={`wf-fill wf-updown wf-tb-${updownCls}`}>
          {pv ? (
            <input className="wf-live-input" value={current} onChange={(e) => pv.setValue(node.id, e.target.value)} style={{ textAlign: horizontalAlign(node) }} />
          ) : (
            <input className="wf-live-input wf-static-input" readOnly tabIndex={-1} aria-hidden value={value} style={{ textAlign: horizontalAlign(node) }} />
          )}
          <div className="wf-spin">
            <span
              className="wf-spin-btn"
              onPointerDown={
                pv
                  ? (e) => {
                      e.preventDefault();
                      spin(1);
                    }
                  : undefined
              }
            >
              <SpinArrow up />
            </span>
            <span
              className="wf-spin-btn"
              onPointerDown={
                pv
                  ? (e) => {
                      e.preventDefault();
                      spin(-1);
                    }
                  : undefined
              }
            >
              <SpinArrow />
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
          ? formatDotNetDate(now, 'M/d/yyyy')
          : fmt === 'Time'
            ? formatDotNetDate(now, 'h:mm:ss tt')
            : fmt === 'Custom'
              ? formatDotNetDate(now, getString(node, 'CustomFormat') || 'M/d/yyyy')
              : formatDotNetDate(now, 'dddd, MMMM d, yyyy');
      const upDown = getBool(node, 'ShowUpDown', false);
      const showCheck = getBool(node, 'ShowCheckBox', false);
      const checkedDesigned = getBool(node, 'Checked', true);
      const isChecked = showCheck ? (pv && pv.checks[node.id] !== undefined ? pv.checks[node.id] === true : checkedDesigned) : true;
      return (
        <div className={`wf-fill wf-combo wf-combo-edit wf-dtp ${isChecked ? '' : 'wf-dtp-off'}`}>
          {showCheck ? (
            <span
              className="wf-dtp-check"
              onPointerDown={
                pv
                  ? (e) => {
                      e.preventDefault();
                      pv.setCheck(node.id, !isChecked);
                    }
                  : undefined
              }
            >
              <CheckGlyph state={isChecked} small />
            </span>
          ) : null}
          <div className="wf-combo-text">{str}</div>
          {upDown ? (
            <div className="wf-spin">
              <span className="wf-spin-btn">
                <SpinArrow up />
              </span>
              <span className="wf-spin-btn">
                <SpinArrow />
              </span>
            </div>
          ) : (
            <div className="wf-combo-button">
              <Chevron />
            </div>
          )}
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
        <div className={`wf-fill wf-progress ${style === 'Marquee' ? 'wf-marquee' : ''} ${style === 'Continuous' ? 'wf-continuous' : ''}`}>
          {style === 'Marquee' ? <div className="wf-progress-marquee" /> : <div className="wf-progress-fill" style={{ width: `${pct * 100}%` }} />}
        </div>
      );
    }
    case 'TrackBar':
      return <TrackBarBody node={node} W={W} H={H} pv={pv} />;
    case 'ListView':
      return <ListViewBody node={node} pv={pv} />;
    case 'TreeView':
      return <TreeViewBody node={node} design={design} pv={pv} />;
    case 'DataGridView':
      return <DataGridBody node={node} W={W} H={H} interactive={!!pv} />;
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

function ButtonBody({ node, ctx, text, isDefault }: { node: DesignNode; ctx: RenderContext; text: string; isDefault: boolean }) {
  const flat = getEnum(node, 'FlatStyle', 'Standard');
  const useVs = getBool(node, 'UseVisualStyleBackColor', true);
  const hasBack = !!node.properties.BackColor && (!useVs || flat === 'Flat' || flat === 'Popup');
  const align = getEnum(node, 'TextAlign', 'MiddleCenter');
  const img = resolveImage(node, 'Image', ctx.resourceDataUris);
  const rel = getEnum(node, 'TextImageRelation', 'Overlay');
  const dir: CSSProperties['flexDirection'] =
    rel === 'ImageAboveText' ? 'column' : rel === 'TextAboveImage' ? 'column-reverse' : rel === 'TextBeforeImage' ? 'row-reverse' : 'row';
  const st: CSSProperties & Record<string, string | number> = { ...alignmentStyle(align) };
  const back = hasBack ? colorCss(node.properties.BackColor, CONTROL_BG) : undefined;
  if (back) st.backgroundColor = back;
  const cls = ['wf-fill', 'wf-button', `wf-btn-${flat.toLowerCase()}`];
  if (hasBack) cls.push('wf-has-back');
  if (isDefault) cls.push('wf-default');
  if (flat === 'Flat') {
    // FlatAppearance: BorderColor (default WindowFrame), BorderSize, MouseOverBackColor, MouseDownBackColor.
    const bc = node.properties['FlatAppearance.BorderColor'];
    const bsz = getNumber(node, 'FlatAppearance.BorderSize', 1);
    st.border = bsz > 0 ? `${bsz}px solid ${bc ? colorCss(bc, '#646464') : isDefault ? '#000000' : '#646464'}` : 'none';
    const over = node.properties['FlatAppearance.MouseOverBackColor'];
    const down = node.properties['FlatAppearance.MouseDownBackColor'];
    if (over) {
      st['--wf-flat-over'] = colorCss(over, '#E5F1FB');
      cls.push('wf-flat-over');
    }
    if (down) {
      st['--wf-flat-down'] = colorCss(down, '#CCE4F7');
      cls.push('wf-flat-down');
    }
  }
  return (
    <div className={cls.join(' ')} style={st}>
      <span className="wf-btn-content" style={{ flexDirection: dir }}>
        {img ? <img src={img} alt="" draggable={false} className="wf-btn-img" /> : null}
        {text ? <span className="wf-btn-text">{text}</span> : null}
      </span>
    </div>
  );
}

/** 13×13 ComCtl32 check box (12×12 inside lists / grids). */
function CheckGlyph({ state, small }: { state: boolean | 'indeterminate'; small?: boolean }) {
  return (
    <span className={`wf-check-glyph ${small ? 'small' : ''} ${state === true ? 'on' : state === 'indeterminate' ? 'mixed' : ''}`}>
      {state === true ? (
        <svg viewBox="0 0 11 11" width={small ? 9 : 10} height={small ? 9 : 10} aria-hidden>
          <path d="M1.6 5.6 4.2 8.2 9.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="square" />
        </svg>
      ) : null}
    </span>
  );
}

/** Small solid triangle used by up-down spinners (NumericUpDown / DomainUpDown / DateTimePicker). */
function SpinArrow({ up }: { up?: boolean }) {
  return (
    <svg width="7" height="4" viewBox="0 0 7 4" aria-hidden>
      <path d={up ? 'M0 4h7L3.5 0.5z' : 'M0 0h7L3.5 3.5z'} fill="currentColor" />
    </svg>
  );
}

/** Border treatment shared by the edit-style controls (TextBox, ListBox, ListView, TreeView…). */
function listBorderClass(node: DesignNode, fallback = 'Fixed3D'): string {
  return `wf-tb-${getEnum(node, 'BorderStyle', fallback)}`;
}

/** Formats a NumericUpDown value as the control displays it (DecimalPlaces / ThousandsSeparator / Hexadecimal). */
function formatNumeric(node: DesignNode, v: number): string {
  const dp = getNumber(node, 'DecimalPlaces', 0);
  if (getBool(node, 'Hexadecimal', false)) return Math.trunc(v).toString(16).toUpperCase();
  const fixed = v.toFixed(dp);
  return getBool(node, 'ThousandsSeparator', false) ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : fixed;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Formats a date with .NET custom date/time format tokens (en-US), as DateTimePicker.CustomFormat does. */
export function formatDotNetDate(d: Date, fmt: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    const c = fmt[i];
    if (c === "'" || c === '"') {
      const end = fmt.indexOf(c, i + 1);
      out += fmt.slice(i + 1, end < 0 ? undefined : end);
      i = end < 0 ? fmt.length : end + 1;
      continue;
    }
    if (c === '\\') {
      out += fmt[i + 1] ?? '';
      i += 2;
      continue;
    }
    let n = 1;
    while (fmt[i + n] === c) n++;
    const h = d.getHours();
    switch (c) {
      case 'y': {
        const y = d.getFullYear();
        out += n === 1 ? String(y % 100) : n === 2 ? pad(y % 100) : pad(y, n);
        break;
      }
      case 'M': {
        const m = d.getMonth();
        out += n >= 4 ? MONTH_NAMES[m] : n === 3 ? MONTH_NAMES[m].slice(0, 3) : n === 2 ? pad(m + 1) : String(m + 1);
        break;
      }
      case 'd':
        out += n >= 4 ? DAY_NAMES[d.getDay()] : n === 3 ? DAY_NAMES[d.getDay()].slice(0, 3) : n === 2 ? pad(d.getDate()) : String(d.getDate());
        break;
      case 'H':
        out += n >= 2 ? pad(h) : String(h);
        break;
      case 'h':
        out += n >= 2 ? pad(h % 12 || 12) : String(h % 12 || 12);
        break;
      case 'm':
        out += n >= 2 ? pad(d.getMinutes()) : String(d.getMinutes());
        break;
      case 's':
        out += n >= 2 ? pad(d.getSeconds()) : String(d.getSeconds());
        break;
      case 't':
        out += n >= 2 ? (h < 12 ? 'AM' : 'PM') : h < 12 ? 'A' : 'P';
        break;
      case 'f':
      case 'F':
        out += c === 'f' ? '0'.repeat(n) : '';
        break;
      case 'g':
        out += 'A.D.';
        break;
      case 'z':
        out += '+00:00'.slice(0, n >= 3 ? 6 : 3);
        break;
      default:
        out += c.repeat(n);
    }
    i += n;
  }
  return out;
}

function Chevron({ up, left, right }: { up?: boolean; left?: boolean; right?: boolean }) {
  const d = up ? 'M2.5 7 6 3.5 9.5 7' : left ? 'M7 2.5 3.5 6 7 9.5' : right ? 'M5 2.5 8.5 6 5 9.5' : 'M2.5 4.5 6 8l3.5-3.5';
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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

function TrackBarBody({ node, W, H, pv }: { node: DesignNode; W: number; H: number; pv?: PreviewRuntime }) {
  const vertical = getEnum(node, 'Orientation', 'Horizontal') === 'Vertical';
  const min = getNumber(node, 'Minimum', 0);
  const max = Math.max(min, getNumber(node, 'Maximum', 10));
  const designed = Math.min(max, Math.max(min, getNumber(node, 'Value', 0)));
  const live = pv ? Number(pv.values[node.id]) : NaN;
  const val = Number.isFinite(live) ? live : designed;
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
  // Vertical TrackBars run Maximum at the top, like the native control.
  const thumbPos = 13 + len * (vertical ? 1 - pct : pct);
  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = vertical ? r.height / Math.max(1, H) : r.width / Math.max(1, W);
    const off = ((vertical ? e.clientY - r.top : e.clientX - r.left) / (scale || 1) - 13) / Math.max(1, len);
    const frac = Math.min(1, Math.max(0, vertical ? 1 - off : off));
    const small = Math.max(1, getNumber(node, 'SmallChange', 1));
    pv!.setValue(node.id, String(Math.min(max, Math.max(min, min + Math.round(((max - min) * frac) / small) * small))));
  };
  const thumbShape = ticks === 'Both' || ticks === 'None' ? 'rect' : ticks === 'TopLeft' ? 'tl' : 'br';
  return (
    <div
      className={`wf-fill wf-trackbar ${vertical ? 'vertical' : ''}`}
      onPointerDown={
        pv
          ? (e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }
          : undefined
      }
      onPointerMove={pv ? (e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e) : undefined}
    >
      <div className="wf-track-rail" />
      {tickEls}
      <div className={`wf-track-thumb ${thumbShape}`} style={vertical ? { top: thumbPos } : { left: thumbPos }} />
    </div>
  );
}

function ListViewBody({ node, pv }: { node: DesignNode; pv?: PreviewRuntime }) {
  const view = getEnum(node, 'View', 'LargeIcon');
  const cols = node.listViewColumns ?? [];
  const grid = getBool(node, 'GridLines', false);
  const checks = getBool(node, 'CheckBoxes', false);
  const fullRow = getBool(node, 'FullRowSelect', false);
  const headerStyle = getEnum(node, 'HeaderStyle', 'Clickable');
  // Only real, designed items are drawn: an empty compiled ListView is just a clean white client area.
  const items = node.items ?? [];
  const sel = pv ? Number(pv.values[node.id] ?? -1) : -1;
  const pick = (i: number) => (pv ? () => pv.setValue(node.id, String(i)) : undefined);
  const check = (i: number) => {
    if (!checks) return null;
    const key = `${node.id}:${i}`;
    return (
      <span
        className="wf-lv-check"
        onClick={
          pv
            ? (e) => {
                e.stopPropagation();
                pv.setCheck(key, pv.checks[key] !== true);
              }
            : undefined
        }
      >
        <CheckGlyph state={pv?.checks[key] === true} small />
      </span>
    );
  };
  let body: ReactNode = null;
  if (view === 'Details') {
    body = (
      <>
        {headerStyle !== 'None' ? (
          <div className={`wf-lv-header ${headerStyle === 'Clickable' ? 'clickable' : ''}`}>
            {cols.map((c) => (
              <span key={c.id} style={{ width: c.width }}>
                {c.text}
              </span>
            ))}
            <span className="wf-lv-filler" />
          </div>
        ) : null}
        <div className={`wf-lv-details ${grid ? 'grid' : ''}`}>
          {cols.length
            ? items.map((text, i) => (
                <div key={i} className={`wf-lv-drow ${sel === i ? (fullRow ? 'selected full' : 'selected') : ''}`} onClick={pick(i)}>
                  {cols.map((c, ci) => (
                    <span key={c.id} style={{ width: c.width }}>
                      {ci === 0 ? check(i) : null}
                      <span className="wf-lv-celltext">{ci === 0 ? text : ''}</span>
                    </span>
                  ))}
                </div>
              ))
            : null}
        </div>
      </>
    );
  } else if (items.length) {
    const cls = view === 'Tile' ? 'tile' : view === 'SmallIcon' ? 'small' : view === 'List' ? 'list' : 'large';
    body = (
      <div className={`wf-lv-items ${cls}`}>
        {items.map((text, i) => (
          <div key={i} className={`wf-lv-item ${sel === i ? 'selected' : ''}`} onClick={pick(i)}>
            {check(i)}
            <span className="wf-lv-label">{text}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`wf-fill wf-listview ${listBorderClass(node)}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
      {body}
    </div>
  );
}

function TreeViewBody({ node, design, pv }: { node: DesignNode; design: boolean; pv?: PreviewRuntime }) {
  const nodes = node.treeNodes ?? [];
  const lines = getBool(node, 'ShowLines', true);
  const plusMinus = getBool(node, 'ShowPlusMinus', true);
  const rootLines = getBool(node, 'ShowRootLines', true);
  const checks = getBool(node, 'CheckBoxes', false);
  const fullRow = getBool(node, 'FullRowSelect', false);
  const indent = Math.max(0, getNumber(node, 'Indent', 19));
  // Compiled TreeViews start collapsed (nodes only expand when code calls Expand()); the preview toggles them.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sel = pv ? pv.values[node.id] : undefined;
  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));
  const lead = rootLines ? 1 : 0;
  const render = (items: typeof nodes, depth: number): ReactNode =>
    items.map((it, idx) => {
      const kids = it.children ?? [];
      const open = !!expanded[it.id] && kids.length > 0;
      const last = idx === items.length - 1;
      const level = depth + lead;
      const key = `${node.id}:t:${it.id}`;
      return (
        <div key={it.id} className="wf-tree-node">
          <div className={`wf-tree-row ${sel === it.id ? (fullRow ? 'selected full' : 'selected') : ''}`} style={{ paddingLeft: 3 + Math.max(0, level - 1) * indent }}>
            {level > 0 ? (
              <span className={`wf-tree-joint ${lines ? 'lines' : ''} ${last ? 'last' : ''} ${depth === 0 && idx === 0 ? 'first' : ''}`} style={{ width: indent }}>
                {plusMinus && kids.length ? (
                  <span
                    className="wf-tree-pm"
                    onPointerDown={
                      pv
                        ? (e) => {
                            e.preventDefault();
                            toggle(it.id);
                          }
                        : undefined
                    }
                  >
                    <i />
                    {open ? null : <b />}
                  </span>
                ) : null}
              </span>
            ) : null}
            {checks ? (
              <span
                className="wf-tree-check"
                onClick={
                  pv
                    ? (e) => {
                        e.stopPropagation();
                        pv.setCheck(key, pv.checks[key] !== true);
                      }
                    : undefined
                }
              >
                <CheckGlyph state={pv?.checks[key] === true} small />
              </span>
            ) : null}
            <span
              className="wf-tree-text"
              onClick={pv ? () => pv.setValue(node.id, it.id) : undefined}
              onDoubleClick={pv && kids.length ? () => toggle(it.id) : undefined}
            >
              {it.text}
            </span>
          </div>
          {open ? <div className={`wf-tree-kids ${lines && !last ? 'lines' : ''}`}>{render(kids, depth + 1)}</div> : null}
        </div>
      );
    });
  return (
    <div className={`wf-fill wf-treeview ${listBorderClass(node)}`} style={{ background: node.properties.BackColor ? undefined : WINDOW_BG }}>
      {nodes.length ? render(nodes, 0) : design ? <div className="wf-design-hint">{node.name}</div> : null}
    </div>
  );
}

function propBool(props: Record<string, PropertyValue> | undefined, key: string, fallback: boolean): boolean {
  const v = props?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

function propNumber(props: Record<string, PropertyValue> | undefined, key: string, fallback: number): number {
  const v = props?.[key];
  return typeof v === 'number' ? v : fallback;
}

function DataGridBody({ node, W, H, interactive }: { node: DesignNode; W: number; H: number; interactive: boolean }) {
  const cols = (node.columns ?? []).filter((c) => c.visible !== false);
  const rowHeaders = getBool(node, 'RowHeadersVisible', true);
  const colHeaders = getBool(node, 'ColumnHeadersVisible', true);
  const sizeMode = getEnum(node, 'AutoSizeColumnsMode', 'None');
  const bs = getEnum(node, 'BorderStyle', 'FixedSingle');
  const inset = bs === 'Fixed3D' ? 2 : bs === 'FixedSingle' ? 1 : 0;
  const gutter = rowHeaders ? Math.max(4, getNumber(node, 'RowHeadersWidth', 41)) : 0;
  const avail = Math.max(0, W - 2 * inset - gutter);
  const minW = (c: (typeof cols)[number]) => Math.max(2, propNumber(c.properties, 'MinimumWidth', 5));
  let widths: number[];
  if (sizeMode === 'Fill' && cols.length) {
    const weights = cols.map((c) => Math.max(0.0001, propNumber(c.properties, 'FillWeight', 100)));
    const total = weights.reduce((a, b) => a + b, 0);
    // Integer column widths that add up exactly to the client width, like DataGridView's fill algorithm.
    let used = 0;
    widths = weights.map((w, i) => {
      const px = i === cols.length - 1 ? avail - used : Math.floor((avail * w) / total);
      used += px;
      return Math.max(minW(cols[i]), px);
    });
  } else widths = cols.map((c) => Math.max(minW(c), c.width ?? 100));
  const headerH = Math.max(4, getNumber(node, 'ColumnHeadersHeight', 25));
  const rowH = Math.max(4, getNumber(node, 'RowTemplate.Height', 25));
  const addRow = getBool(node, 'AllowUserToAddRows', true) && !getBool(node, 'ReadOnly', false);
  const bg = colorCss(node.properties.BackgroundColor, '#ABABAB');
  const gridColor = colorCss(node.properties.GridColor, '#A0A0A0');
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);
  const total = gutter + widths.reduce((a, b) => a + b, 0);
  const st: CSSProperties & Record<string, string> = { background: bg, '--wf-dg-grid': gridColor };
  void H;
  return (
    <div className={`wf-fill wf-datagrid ${bs === 'None' ? '' : `wf-tb-${bs}`}`} style={st}>
      {colHeaders && (cols.length || rowHeaders) ? (
        <div className="wf-dg-header" style={{ height: headerH, width: total }}>
          {rowHeaders ? <span className="wf-dg-corner" style={{ width: gutter }} /> : null}
          {cols.map((c, i) => {
            const sortable = c.columnType !== 'DataGridViewCheckBoxColumn' && c.columnType !== 'DataGridViewButtonColumn' && c.columnType !== 'DataGridViewImageColumn';
            const sorted = sort?.id === c.id ? sort.dir : null;
            return (
              <span
                key={c.id}
                className={`wf-dg-colhead ${sorted ? 'sorted' : ''}`}
                style={{ width: widths[i] }}
                onClick={
                  interactive && sortable
                    ? () => setSort((s) => (s?.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: 'asc' }))
                    : undefined
                }
              >
                <span className="wf-dg-headtext">{c.headerText}</span>
                {sorted ? (
                  <svg className="wf-dg-sort" width="9" height="5" viewBox="0 0 9 5" aria-hidden>
                    <path d={sorted === 'asc' ? 'M0.5 4.5 4.5 0.5l4 4' : 'M0.5 0.5l4 4 4-4'} fill="none" stroke="currentColor" />
                  </svg>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
      {addRow && cols.length ? (
        // A compiled grid with no data shows exactly one "new row" (*) – never a block of empty rows.
        <div className="wf-dg-row new" style={{ height: rowH, width: total }}>
          {rowHeaders ? (
            <span className="wf-dg-rowhead" style={{ width: gutter }}>
              <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden>
                <path d="M3.5 0v7M0.5 1.75l6 3.5M0.5 5.25l6-3.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            </span>
          ) : null}
          {cols.map((c, i) => (
            <span key={c.id} className="wf-dg-cell" style={{ width: widths[i] }}>
              {c.columnType === 'DataGridViewCheckBoxColumn' ? <CheckGlyph state={false} small /> : null}
              {c.columnType === 'DataGridViewButtonColumn' ? <span className="wf-dg-btn" /> : null}
              {c.columnType === 'DataGridViewComboBoxColumn' && propBool(c.properties, 'DisplayStyleForCurrentCellOnly', false) === false ? (
                <span className="wf-dg-combo">
                  <Chevron />
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
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
            style={h.selected && appearance === 'Normal' ? { left: h.rect.x - 2, width: h.rect.width + 4 } : { left: h.rect.x, width: h.rect.width + (appearance === 'Normal' ? 2 : 0) }}
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

/** Crisp inline text input used for on-canvas strip item add / rename. */
function StripInlineInput({ initial, testId, placeholder, onDone }: { initial: string; testId: string; placeholder?: string; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      ref={ref}
      className="wf-strip-input"
      value={value}
      size={Math.max(6, value.length + 1)}
      placeholder={placeholder}
      spellCheck={false}
      aria-label={placeholder ?? 'Item text'}
      data-testid={testId}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(value.trim() && value !== initial ? value : null)}
    />
  );
}

const KEY_NAMES: Record<string, string> = {
  Control: 'Ctrl',
  Shift: 'Shift',
  Alt: 'Alt',
  Delete: 'Del',
  Insert: 'Ins',
  Escape: 'Esc',
  Return: 'Enter',
  Enter: 'Enter',
  Back: 'Backspace',
  Oemplus: '+',
  Oemminus: '-',
  Oemcomma: ',',
  OemPeriod: '.',
  PageUp: 'PgUp',
  Next: 'PgDn',
  PageDown: 'PgDn',
};

/** Right-aligned shortcut text for a ToolStripMenuItem (ShortcutKeyDisplayString, else ShortcutKeys). */
function shortcutText(it: StripItemNode): string {
  if (it.properties.ShowShortcutKeys === false) return '';
  const disp = it.properties.ShortcutKeyDisplayString;
  if (typeof disp === 'string' && disp) return disp;
  const v = it.properties.ShortcutKeys;
  if (!v) return '';
  const names: string[] =
    typeof v === 'object' && v && 'kind' in v
      ? v.kind === 'flags'
        ? v.values
        : v.kind === 'enum'
          ? [v.value]
          : v.kind === 'raw'
            ? [...v.expression.matchAll(/Keys\.(\w+)/g)].map((m) => m[1])
            : []
      : typeof v === 'string'
        ? v.split(/[,|+]\s*/)
        : [];
  const mods = ['Control', 'Shift', 'Alt'].filter((m) => names.includes(m));
  const key = names.filter((n) => !mods.includes(n) && n !== 'None')[0];
  if (!key) return '';
  const keyName = KEY_NAMES[key] ?? (/^D\d$/.test(key) ? key.slice(1) : key);
  return [...mods.map((m) => KEY_NAMES[m]), keyName].join('+');
}

function itemEnabled(it: StripItemNode): boolean {
  return it.properties.Enabled !== false;
}

function itemVisible(it: StripItemNode): boolean {
  return it.properties.Visible !== false;
}

/** A live-preview ToolStripDropDownMenu, portalled outside the scrolling preview stage and viewport-clamped. */
function MenuDropDown({
  items,
  anchor,
  side,
  renderStyle,
  onPick,
}: {
  items: StripItemNode[];
  anchor: HTMLElement;
  side: 'below' | 'right';
  renderStyle: 'fluent' | 'classic';
  onPick: (it: StripItemNode) => void;
}) {
  const [sub, setSub] = useState<{ id: string; el: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const host = anchor.closest<HTMLElement>('.wd-preview') ?? anchor.ownerDocument.body;
  const ar = anchor.getBoundingClientRect();
  const initialLeft = side === 'below' ? ar.left : ar.right - 4;
  const initialTop = side === 'below' ? ar.bottom : ar.top - 3;
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: initialLeft, top: initialTop });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const mr = el.getBoundingClientRect();
    const curAr = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = side === 'below' ? curAr.left : curAr.right - 4;
    let top = side === 'below' ? curAr.bottom : curAr.top - 3;
    if (side === 'right' && left + mr.width > vw - 6) {
      left = curAr.left - mr.width + 4;
    }
    if (left + mr.width > vw - 6) left = Math.max(6, vw - mr.width - 6);
    if (left < 6) left = 6;
    if (side === 'below' && top + mr.height > vh - 6 && curAr.top - mr.height >= 6) {
      top = curAr.top - mr.height;
    }
    if (top + mr.height > vh - 6) top = Math.max(6, vh - mr.height - 6);
    if (top < 6) top = 6;
    setPos({ left, top });
  }, [anchor, side, items.length]);

  const minWidth = Math.max(
    100,
    ...items.map((it) => {
      const sz = it.properties.Size;
      return typeof sz === 'object' && sz && 'width' in sz && typeof sz.width === 'number' ? sz.width + 4 : 0;
    })
  );
  const visible = items.filter(itemVisible);
  const hasShortcut = visible.some((it) => shortcutText(it));
  return createPortal(
    <div
      ref={menuRef}
      className={`wf-dropdown wf-dd-${renderStyle}`}
      role="menu"
      style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth, zIndex: 200 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {visible.map((it) => {
        if (it.type === 'ToolStripSeparator') return <div key={it.id} className="wf-dd-sep" role="separator" />;
        const kids = (it.dropDownItems ?? []).filter(itemVisible);
        const enabled = itemEnabled(it);
        const checked = it.properties.Checked === true || (isEnumValue(it.properties.CheckState) && it.properties.CheckState.value !== 'Unchecked');
        const sc = shortcutText(it);
        return (
          <div
            key={it.id}
            role="menuitem"
            aria-disabled={!enabled || undefined}
            data-strip-item={it.id}
            className={`wf-dd-item ${enabled ? '' : 'disabled'} ${sub?.id === it.id ? 'open' : ''}`}
            onPointerEnter={(e) => setSub(kids.length && enabled ? { id: it.id, el: e.currentTarget } : null)}
            onClick={(e) => {
              if (!enabled) return;
              if (kids.length) {
                setSub({ id: it.id, el: e.currentTarget });
                return;
              }
              onPick(it);
            }}
          >
            <span className="wf-dd-gutter">
              {checked ? (
                <span className="wf-dd-checkmark">
                  <svg width="10" height="10" viewBox="0 0 11 11" aria-hidden>
                    <path d="M1.6 5.6 4.2 8.2 9.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.45" />
                  </svg>
                </span>
              ) : null}
            </span>
            <span className="wf-dd-text">{displayText(it.text ?? '')}</span>
            {hasShortcut ? <span className="wf-dd-shortcut">{sc}</span> : null}
            <span className="wf-dd-arrow">
              {kids.length ? (
                <svg width="4" height="7" viewBox="0 0 4 7" aria-hidden>
                  <path d="M0 0l4 3.5L0 7z" fill="currentColor" />
                </svg>
              ) : null}
            </span>
          </div>
        );
      })}
      {sub
        ? (() => {
            const parent = visible.find((i) => i.id === sub.id);
            return parent ? <MenuDropDown key={sub.id} items={parent.dropDownItems ?? []} anchor={sub.el} side="right" renderStyle={renderStyle} onPick={onPick} /> : null;
          })()
        : null}
    </div>,
    host
  );
}

function StripBody({ node, ctx }: { node: DesignNode; ctx: RenderContext }) {
  const items = (node.stripItems ?? []).filter((it) => ctx.mode === 'design' || itemVisible(it));
  const kind = node.type;
  const grip = kind === 'ToolStrip' && getEnum(node, 'GripStyle', 'Visible') === 'Visible';
  const sizing = kind === 'StatusStrip' && getBool(node, 'SizingGrip', true);
  const design = ctx.mode === 'design';
  const live = ctx.mode === 'preview';
  const strip = design && !node.inherited ? ctx.strip : undefined;
  const editing = strip?.editing?.stripId === node.id ? strip.editing : null;
  // Live preview "menu mode": the open top-level item and the element its dropdown hangs from.
  const [open, setOpen] = useState<{ id: string; el: HTMLElement } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(null);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.wf-dropdown') || (t && rootRef.current?.contains(t))) return;
      setOpen(null);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);
  const pick = (it: StripItemNode) => {
    setOpen(null);
    ctx.onStripItemClick?.(it);
  };
  const openItem = open ? items.find((i) => i.id === open.id) : undefined;
  const openKids = openItem?.dropDownItems?.filter(itemVisible) ?? [];
  const itemKind = kind === 'MenuStrip' ? 'menu' : kind === 'StatusStrip' ? 'status' : 'btn';
  return (
    <div ref={rootRef} className={`wf-fill wf-strip wf-${kind.toLowerCase()} ${strip ? 'wf-strip-editable' : ''}`}>
      {grip ? <span className="wf-grip" /> : null}
      {items.map((it) => {
        if (it.type === 'ToolStripSeparator') return <span key={it.id} className="wf-strip-sep" data-strip-item={it.id} />;
        if (editing && editing.itemId === it.id) {
          return (
            <span key={it.id} className="wf-strip-item editing" data-strip-item={it.id}>
              <StripInlineInput initial={it.text ?? ''} testId="strip-inline-edit" onDone={(v) => strip!.onCommit(node.id, it.id, v)} />
            </span>
          );
        }
        const enabled = itemEnabled(it);
        const hasKids = (it.dropDownItems ?? []).some(itemVisible);
        const isLabel = it.type === 'ToolStripLabel' || it.type === 'ToolStripStatusLabel';
        const interactive = live && enabled && !isLabel && it.type !== 'ToolStripTextBox' && it.type !== 'ToolStripComboBox' && it.type !== 'ToolStripProgressBar';
        const checked = it.properties.Checked === true;
        const spring = it.type === 'ToolStripStatusLabel' && it.properties.Spring === true;
        const right = isEnumValue(it.properties.Alignment) && it.properties.Alignment.value === 'Right';
        return (
          <span
            key={it.id}
            data-strip-item={it.id}
            data-strip-owner={node.id}
            className={`wf-strip-item ${itemKind} ${isLabel ? 'label' : ''} ${open?.id === it.id ? 'open' : ''} ${checked ? 'checked' : ''} ${enabled ? '' : 'disabled'} ${spring ? 'spring' : ''}`}
            style={right ? { marginLeft: 'auto' } : undefined}
            title={strip ? `${it.name} — double-click to rename` : live && typeof it.properties.ToolTipText === 'string' ? it.properties.ToolTipText : undefined}
            onPointerDown={
              interactive && hasKids
                ? (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const el = e.currentTarget;
                    setOpen((o) => (o?.id === it.id ? null : { id: it.id, el }));
                  }
                : undefined
            }
            onPointerEnter={
              interactive && open && open.id !== it.id
                ? (e) => {
                    setOpen({ id: it.id, el: e.currentTarget });
                  }
                : undefined
            }
            onClick={interactive && !hasKids ? () => pick(it) : undefined}
          >
            {stripItemContent(it)}
            {strip && !editing ? (
              <span className="wf-strip-del" role="button" aria-label={`Delete ${it.name}`} title={`Delete ${it.name}`} data-strip-del={it.id} data-strip-owner={node.id}>
                ×
              </span>
            ) : null}
          </span>
        );
      })}
      {editing && editing.itemId === null ? (
        <span className="wf-strip-item editing adding">
          <StripInlineInput initial="" testId="strip-inline-add" placeholder={kind === 'MenuStrip' ? 'Type Here' : 'Item text'} onDone={(v) => strip!.onCommit(node.id, null, v)} />
        </span>
      ) : strip ? (
        <span className="wf-strip-add" data-strip-add={node.id} title={kind === 'MenuStrip' ? 'Type here to add a menu item' : 'Add item'}>
          {kind === 'MenuStrip' ? 'Type Here' : <Icon name="plus" size={10} />}
        </span>
      ) : null}
      {sizing ? <span className="wf-sizing-grip" /> : null}
      {live && open && openKids.length ? (
        <MenuDropDown key={open.id} items={openKids} anchor={open.el} side="below" renderStyle={ctx.renderStyle} onPick={pick} />
      ) : null}
    </div>
  );
}

/** Renders the client area children of the root form/user control. */
export function FormClient({ root, ctx }: { root: DesignNode; ctx: RenderContext }) {
  const accept = ctx.acceptButtonName ?? controlRefName(root.properties.AcceptButton);
  const fullCtx = useMemo(() => (accept === ctx.acceptButtonName ? ctx : { ...ctx, acceptButtonName: accept }), [ctx, accept]);
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
      <Children node={root} nl={nl} ctx={fullCtx} amb={amb} />
    </>
  );
}

/** Control name referenced by a Form property such as `AcceptButton = this.btnOk`. */
function controlRefName(v: PropertyValue | undefined): string | undefined {
  if (isRawExpressionValue(v)) return v.expression.trim().replace(/^this\./, '') || undefined;
  return typeof v === 'string' && v ? v : undefined;
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
