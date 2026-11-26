// Typed helpers for reading / writing WinForms property values on DesignNodes.

import type { CSSProperties } from 'react';
import {
  getControlDefinition,
  getPropertiesForControl,
  resolveColorToCss,
  SYSTEM_COLORS,
  WEB_NAMED_COLORS,
} from '../../shared/catalog';
import type {
  ColorValue,
  DesignNode,
  FontValue,
  PaddingValue,
  PropertyValue,
  SizeValue,
} from '../../shared/model';
import {
  isColorValue,
  isEnumValue,
  isFlagsValue,
  isFontValue,
  isPaddingValue,
  isPointValue,
  isRawExpressionValue,
  isResourceValue,
  isSizeFValue,
  isSizeValue,
} from '../../shared/model';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockStyle = 'None' | 'Top' | 'Bottom' | 'Left' | 'Right' | 'Fill';
export type AnchorEdge = 'Top' | 'Bottom' | 'Left' | 'Right';

export const DEFAULT_FONT: FontValue = { kind: 'font', family: 'Segoe UI', size: 9, unit: 'Point' };

export function isRootNode(node: DesignNode): boolean {
  return node.type === 'Form' || node.type === 'UserControl';
}

export function getProp(node: DesignNode, name: string): PropertyValue | undefined {
  return node.properties[name];
}

export function getBool(node: DesignNode, name: string, fallback: boolean): boolean {
  const v = node.properties[name];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fallback;
}

/** Parses C# numeric literals such as `100`, `100M`, `1.5F`, `new decimal(new int[] { 100, 0, 0, 0 })`. */
export function parseNumericLiteral(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const plain = t.replace(/^\((.*)\)$/, '$1').replace(/[mMfFdDlLuU]+$/, '');
  if (plain !== '' && Number.isFinite(Number(plain))) return Number(plain);
  const bits = t.match(/new\s+(?:decimal|System\.Decimal)\s*\(\s*new\s+int\s*\[\s*\]\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*\)/);
  if (bits) {
    const lo = Number(bits[1]) >>> 0;
    const mid = Number(bits[2]) >>> 0;
    const hi = Number(bits[3]) >>> 0;
    const flags = Number(bits[4]) >>> 0;
    const scale = (flags >> 16) & 0xff;
    const sign = flags & 0x80000000 ? -1 : 1;
    return (sign * (lo + mid * 2 ** 32 + hi * 2 ** 64)) / 10 ** scale;
  }
  const ctor = t.match(/new\s+(?:decimal|System\.Decimal)\s*\(\s*(-?[\d.]+)[mMfFdD]?\s*\)/);
  if (ctor && Number.isFinite(Number(ctor[1]))) return Number(ctor[1]);
  return undefined;
}

export function getNumber(node: DesignNode, name: string, fallback: number): number {
  const v = node.properties[name];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return parseNumericLiteral(v) ?? fallback;
  if (isRawExpressionValue(v)) return parseNumericLiteral(v.expression) ?? fallback;
  return fallback;
}

export function getString(node: DesignNode, name: string, fallback = ''): string {
  const v = node.properties[name];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

export function getEnum(node: DesignNode, name: string, fallback: string): string {
  const v = node.properties[name];
  if (isEnumValue(v)) return v.value;
  if (typeof v === 'string' && v) return v.includes('.') ? v.slice(v.lastIndexOf('.') + 1) : v;
  return fallback;
}

export function getText(node: DesignNode): string {
  const v = node.properties.Text;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && v.kind === 'raw') return v.expression;
  return '';
}

/** Strips WinForms mnemonic ampersands ("&File" -> "File", "R&&D" -> "R&D"). */
export function displayText(text: string): string {
  return text.replace(/&(&?)/g, (_m, amp: string) => (amp ? '&' : ''));
}

export function getLocation(node: DesignNode): { x: number; y: number } {
  const v = node.properties.Location;
  if (isPointValue(v)) return { x: v.x, y: v.y };
  return { x: 0, y: 0 };
}

export function getSize(node: DesignNode): { width: number; height: number } {
  if (node.type === 'Form') {
    const cs = node.properties.ClientSize;
    if (isSizeValue(cs)) return { width: cs.width, height: cs.height };
    const s = node.properties.Size;
    if (isSizeValue(s)) return { width: Math.max(0, s.width - 16), height: Math.max(0, s.height - 39) };
    return { width: 800, height: 450 };
  }
  const v = node.properties.Size;
  if (isSizeValue(v)) return { width: v.width, height: v.height };
  const def = getControlDefinition(node.type);
  if (def && def.defaultSize.width > 0) return { ...def.defaultSize };
  return { width: 100, height: 23 };
}

export function sizeProp(width: number, height: number): SizeValue {
  return { kind: 'size', width: Math.round(width), height: Math.round(height) };
}

export function sizePropertyName(node: DesignNode): 'ClientSize' | 'Size' {
  return node.type === 'Form' ? 'ClientSize' : 'Size';
}

export function getMinMaxSize(node: DesignNode): { min: { width: number; height: number }; max: { width: number; height: number } } {
  const mn = node.properties.MinimumSize;
  const mx = node.properties.MaximumSize;
  let min = isSizeValue(mn) ? { width: mn.width, height: mn.height } : { width: 0, height: 0 };
  let max = isSizeValue(mx) ? { width: mx.width, height: mx.height } : { width: 0, height: 0 };
  if (node.type === 'Form') {
    // Min/Max are expressed as window size; convert to an approximate client size.
    min = { width: Math.max(0, min.width - 16), height: Math.max(0, min.height - 39) };
    max = { width: max.width ? Math.max(0, max.width - 16) : 0, height: max.height ? Math.max(0, max.height - 39) : 0 };
  }
  return { min, max };
}

export function clampSize(node: DesignNode, width: number, height: number): { width: number; height: number } {
  const { min, max } = getMinMaxSize(node);
  let w = Math.max(width, min.width, 1);
  let h = Math.max(height, min.height, 1);
  if (max.width > 0) w = Math.min(w, max.width);
  if (max.height > 0) h = Math.min(h, max.height);
  return { width: Math.round(w), height: Math.round(h) };
}

export function getDock(node: DesignNode): DockStyle {
  const defDock = getControlDefinition(node.type)?.defaultDock ?? 'None';
  const v = getEnum(node, 'Dock', defDock);
  return (['None', 'Top', 'Bottom', 'Left', 'Right', 'Fill'] as const).includes(v as DockStyle) ? (v as DockStyle) : defDock;
}

export function getAnchor(node: DesignNode): Set<AnchorEdge> {
  const v = node.properties.Anchor;
  if (isFlagsValue(v)) return new Set(v.values.filter((x): x is AnchorEdge => ['Top', 'Bottom', 'Left', 'Right'].includes(x)));
  if (isEnumValue(v)) {
    if (v.value === 'None') return new Set();
    return new Set(
      v.value
        .split(/[|,\s]+/)
        .map((s) => s.trim())
        .filter((x): x is AnchorEdge => ['Top', 'Bottom', 'Left', 'Right'].includes(x))
    );
  }
  return new Set<AnchorEdge>(['Top', 'Left']);
}

export function zeroPadding(): PaddingValue {
  return { kind: 'padding', all: 0, left: 0, top: 0, right: 0, bottom: 0 };
}

export function readPadding(v: PropertyValue | undefined, fallback = 0): PaddingValue {
  if (isPaddingValue(v)) {
    if (v.all !== undefined && v.all >= 0 && v.left === undefined) {
      return { kind: 'padding', all: v.all, left: v.all, top: v.all, right: v.all, bottom: v.all };
    }
    return v;
  }
  if (typeof v === 'number') return { kind: 'padding', all: v, left: v, top: v, right: v, bottom: v };
  return { kind: 'padding', all: fallback, left: fallback, top: fallback, right: fallback, bottom: fallback };
}

export function getPadding(node: DesignNode, name = 'Padding'): PaddingValue {
  return readPadding(node.properties[name], name === 'Margin' ? 3 : 0);
}

export function makePadding(left: number, top: number, right: number, bottom: number): PaddingValue {
  const all = left === top && top === right && right === bottom ? left : -1;
  return { kind: 'padding', all, left, top, right, bottom };
}

export function getFont(node: DesignNode, inherited?: FontValue): FontValue {
  const v = node.properties.Font;
  if (isFontValue(v)) return v;
  return inherited ?? DEFAULT_FONT;
}

export function fontPx(font: FontValue): number {
  switch (font.unit) {
    case 'Pixel':
    case 'World':
      return font.size;
    case 'Inch':
      return font.size * 96;
    case 'Millimeter':
      return (font.size * 96) / 25.4;
    case 'Document':
      return (font.size * 96) / 300;
    default:
      return (font.size * 96) / 72;
  }
}

export function fontToCss(font: FontValue): CSSProperties {
  const decorations: string[] = [];
  if (font.underline) decorations.push('underline');
  if (font.strikeout) decorations.push('line-through');
  return {
    fontFamily: `"${font.family}", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`,
    fontSize: `${+fontPx(font).toFixed(2)}px`,
    fontWeight: font.bold ? 700 : 400,
    fontStyle: font.italic ? 'italic' : 'normal',
    textDecoration: decorations.length ? decorations.join(' ') : undefined,
  };
}

export function colorCss(v: PropertyValue | undefined, fallback: string): string {
  if (isColorValue(v)) {
    if (v.value === 'Transparent' || v.a === 0) return 'transparent';
    return resolveColorToCss(v, fallback);
  }
  if (typeof v === 'string' && v) {
    return resolveColorToCss({ value: v }, fallback);
  }
  return fallback;
}

export function colorFromCss(value: string): ColorValue {
  if (SYSTEM_COLORS[value]) return { kind: 'color', value, isSystem: true };
  if (WEB_NAMED_COLORS[value]) return { kind: 'color', value, isNamed: true };
  const hex = value.replace('#', '');
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return { kind: 'color', value: `#${hex.slice(0, 6).toUpperCase()}`, r, g, b, a };
  }
  return { kind: 'color', value };
}

export function colorToHex(v: ColorValue | undefined): string {
  if (!v) return '#000000';
  const css = resolveColorToCss(v, '#000000');
  if (css.startsWith('#')) return css.length === 7 ? css.toUpperCase() : css;
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return '#000000';
}

export function resourceNameOf(v: PropertyValue | undefined): string | undefined {
  if (isResourceValue(v)) return v.resourceName;
  return undefined;
}

const PROJECT_RESOURCE_RE = /^(?:global::)?(?:[\w.]+\.)?Properties\.Resources\.([A-Za-z_]\w*)$/;

/** Key of a project-wide `Properties.Resources.<Key>` expression, if the value is one. */
export function projectResourceKey(expression: string): string | undefined {
  return PROJECT_RESOURCE_RE.exec(expression.trim())?.[1];
}

export function resolveImage(
  node: DesignNode,
  propName: string,
  resourceDataUris: Record<string, string>
): string | undefined {
  const v = node.properties[propName];
  if (isResourceValue(v)) {
    return resourceDataUris[v.resourceName] ?? (v.relativePath ? resourceDataUris[v.relativePath] : undefined);
  }
  if (isRawExpressionValue(v)) {
    const key = projectResourceKey(v.expression);
    if (key) return resourceDataUris[`Properties.Resources.${key}`] ?? resourceDataUris[key];
  }
  return resourceDataUris[`${node.name}.${propName}`] ?? (isRootNode(node) ? resourceDataUris[`$this.${propName}`] : undefined);
}

/** Short user-facing rendering of a property value for the property grid. */
export function formatValue(v: PropertyValue | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  switch (v.kind) {
    case 'point':
      return `${v.x}, ${v.y}`;
    case 'size':
    case 'sizeF':
      return `${v.width}, ${v.height}`;
    case 'padding':
      return v.all !== undefined && v.all >= 0 ? `${v.all}` : `${v.left}, ${v.top}, ${v.right}, ${v.bottom}`;
    case 'color':
      if (v.isSystem || v.isNamed) return v.value;
      if (v.r !== undefined) return v.a !== undefined && v.a < 255 ? `${v.a}, ${v.r}, ${v.g}, ${v.b}` : `${v.r}, ${v.g}, ${v.b}`;
      return v.value;
    case 'font': {
      const styles = [v.bold && 'Bold', v.italic && 'Italic', v.underline && 'Underline', v.strikeout && 'Strikeout'].filter(Boolean);
      return `${v.family}, ${+v.size.toFixed(2)}pt${styles.length ? `, style=${styles.join(', ')}` : ''}`;
    }
    case 'enum':
      return v.value;
    case 'flags':
      return v.values.length ? v.values.join(', ') : 'None';
    case 'resource':
      return v.resourceName;
    case 'raw':
      return v.expression;
  }
  return '';
}

export function valuesEqual(a: PropertyValue | undefined, b: PropertyValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isSizeLike(v: PropertyValue | undefined): v is SizeValue {
  return isSizeValue(v) || isSizeFValue(v);
}

/** True for controls whose Text is meaningful & shown on the design surface. */
export function hasTextProperty(type: string): boolean {
  return getPropertiesForControl(type).some((p) => p.name === 'Text');
}

let measureCanvas: HTMLCanvasElement | null = null;
export function measureText(text: string, font: FontValue): { width: number; height: number } {
  const px = fontPx(font);
  if (typeof document === 'undefined') return { width: text.length * px * 0.55, height: Math.ceil(px * 1.33) };
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return { width: text.length * px * 0.55, height: Math.ceil(px * 1.33) };
  ctx.font = `${font.italic ? 'italic ' : ''}${font.bold ? '700 ' : '400 '}${px}px "${font.family}", "Segoe UI", system-ui, sans-serif`;
  const lines = text.split(/\r?\n/);
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return { width: Math.ceil(width), height: Math.ceil(px * 1.33) * lines.length };
}

/** Distance from the control's top edge to its text baseline (for magenta snaplines). */
export function baselineOffset(node: DesignNode, height: number, font: FontValue): number | undefined {
  const px = fontPx(font);
  const ascent = px * 0.93;
  const lineH = px * 1.33;
  switch (node.type) {
    case 'Label':
    case 'LinkLabel': {
      const align = getEnum(node, 'TextAlign', 'TopLeft');
      if (align.startsWith('Middle')) return Math.round(height / 2 - lineH / 2 + ascent);
      if (align.startsWith('Bottom')) return Math.round(height - lineH + ascent);
      return Math.round(ascent + 1);
    }
    case 'TextBox':
    case 'MaskedTextBox':
    case 'ComboBox':
    case 'NumericUpDown':
    case 'DomainUpDown':
    case 'DateTimePicker':
      if (node.type === 'TextBox' && getBool(node, 'Multiline', false)) return Math.round(3 + ascent);
      return Math.round(height / 2 - lineH / 2 + ascent);
    case 'Button':
    case 'CheckBox':
    case 'RadioButton':
      return Math.round(height / 2 - lineH / 2 + ascent);
    default:
      return undefined;
  }
}
