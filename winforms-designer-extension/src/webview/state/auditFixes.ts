// One-click fixes for Layout & Accessibility Auditor issues. Pure document transforms:
// each returns the same document instance when the issue cannot be fixed automatically.

import type { AuditRuleCode, DesignAuditIssue } from '../../shared/auditor';
import type { DesignDocument, DesignNode } from '../../shared/model';
import { isEnumValue } from '../../shared/model';
import type { LayoutMap } from './layoutEngine';
import { getText } from './nodeProps';
import { findNode, getNode, setProps, updateNode, updateNodes, walkTree } from './treeOps';

/** Rule codes that may have an automatic fix (dialog buttons additionally need a candidate Button). */
export const FIXABLE_AUDIT_CODES = new Set<AuditRuleCode>([
  'high-dpi-autoscale-none',
  'duplicate-tab-index',
  'dialog-missing-accept-button',
  'dialog-missing-cancel-button',
  'numeric-updown-range',
  'progress-bar-range',
  'split-container-distance',
  'missing-accessible-text',
]);

/** Mirrors the auditor's interactive (tab-stop) control set. */
const INTERACTIVE_TAB_TYPES = new Set<string>([
  'Button',
  'TextBox',
  'RichTextBox',
  'MaskedTextBox',
  'ComboBox',
  'CheckBox',
  'RadioButton',
  'ListBox',
  'CheckedListBox',
  'NumericUpDown',
  'DateTimePicker',
  'MonthCalendar',
  'TrackBar',
  'LinkLabel',
  'DataGridView',
  'ListView',
  'TreeView',
  'DomainUpDown',
  'PropertyGrid',
  'WebBrowser',
  'TabControl',
]);

const ACCEPT_RE = /ok|save|apply|submit|accept|confirm/i;
const CANCEL_RE = /cancel|close|abort|dismiss/i;

function numProp(n: DesignNode, name: string, fallback: number): number {
  const v = n.properties[name];
  return typeof v === 'number' ? v : fallback;
}

/** `btnSave` -> `Save`, `checkBoxRememberMe` -> `Remember Me`, `button1` -> `Button`. */
export function humanizeControlName(name: string, type: string): string {
  const prefixes = ['button', 'btn', 'cmd', 'checkBox', 'chk', 'cb', 'radioButton', 'rdo', 'rb', 'opt'];
  let core = name.replace(/^@/, '').replace(/\d+$/, '');
  for (const p of prefixes.sort((a, b) => b.length - a.length)) {
    if (core.toLowerCase().startsWith(p.toLowerCase()) && core.length > p.length && /[A-Z_]/.test(core[p.length])) {
      core = core.slice(p.length);
      break;
    }
    if (core.toLowerCase() === p.toLowerCase()) {
      core = '';
      break;
    }
  }
  const words = (core || type)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || type;
}

function allButtons(doc: DesignDocument): DesignNode[] {
  const out: DesignNode[] = [];
  walkTree(doc.form, (n) => {
    if (n.type === 'Button' && !n.inherited) out.push(n);
  });
  return out;
}

function refName(v: unknown): string | undefined {
  if (v && typeof v === 'object' && (v as { kind?: string }).kind === 'raw') return (v as { expression: string }).expression.replace(/^this\./, '');
  return undefined;
}

function buttonRef(doc: DesignDocument, btn: DesignNode) {
  const qualify = doc.metadata?.useThisQualifier !== false;
  return { kind: 'raw' as const, expression: `${qualify ? 'this.' : ''}${btn.name}` };
}

function pickButton(doc: DesignDocument, re: RegExp, exclude: string | undefined, fallbackFirst: boolean): DesignNode | undefined {
  const buttons = allButtons(doc).filter((b) => b.name !== exclude);
  const matches = (b: DesignNode) => re.test(b.name) || re.test(getText(b));
  return buttons.find(matches) ?? (fallbackFirst ? buttons.find((b) => !CANCEL_RE.test(b.name) && !CANCEL_RE.test(getText(b))) : undefined);
}

/** Applies the automatic fix for one issue; returns `doc` unchanged when no fix applies. */
export function applyAuditFix(doc: DesignDocument, issue: DesignAuditIssue, layout?: LayoutMap): DesignDocument {
  switch (issue.code) {
    case 'high-dpi-autoscale-none': {
      const form = doc.form;
      const raw = form.rawPropertyExpressions;
      return updateNode(doc, form.id, (n) => {
        const out = setProps(n, {
          AutoScaleMode: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' },
          AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
        });
        if (raw && ('AutoScaleMode' in raw || 'AutoScaleDimensions' in raw)) {
          const r = { ...(out.rawPropertyExpressions ?? {}) };
          delete r.AutoScaleMode;
          delete r.AutoScaleDimensions;
          if (Object.keys(r).length) out.rawPropertyExpressions = r;
          else delete out.rawPropertyExpressions;
        }
        return out;
      });
    }
    case 'duplicate-tab-index': {
      const f = findNode(doc, issue.nodeId);
      if (!f?.parent) return doc;
      const parent = f.parent;
      const slot = parent.type === 'SplitContainer' ? f.node.panelSlot ?? 'Panel1' : undefined;
      const group = parent.children
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => INTERACTIVE_TAB_TYPES.has(c.type) && (slot === undefined || (c.panelSlot ?? 'Panel1') === slot));
      // Inherited controls keep their TabIndex; everyone else gets sequential, non-colliding numbers.
      const reserved = new Set(group.filter(({ c }) => c.inherited).map(({ c }) => numProp(c, 'TabIndex', -1)));
      const editable = group
        .filter(({ c }) => !c.inherited)
        .sort((a, b) => numProp(a.c, 'TabIndex', Number.MAX_SAFE_INTEGER) - numProp(b.c, 'TabIndex', Number.MAX_SAFE_INTEGER) || a.i - b.i);
      const assign = new Map<string, number>();
      let next = 0;
      for (const { c } of editable) {
        while (reserved.has(next)) next++;
        assign.set(c.id, next++);
      }
      return updateNodes(doc, assign.keys(), (n) => (n.properties.TabIndex === assign.get(n.id) ? n : setProps(n, { TabIndex: assign.get(n.id)! })));
    }
    case 'dialog-missing-accept-button': {
      if (doc.form.properties.AcceptButton) return doc;
      const btn = pickButton(doc, ACCEPT_RE, refName(doc.form.properties.CancelButton), true);
      return btn ? updateNode(doc, doc.form.id, (n) => setProps(n, { AcceptButton: buttonRef(doc, btn) })) : doc;
    }
    case 'dialog-missing-cancel-button': {
      if (doc.form.properties.CancelButton) return doc;
      const btn = pickButton(doc, CANCEL_RE, refName(doc.form.properties.AcceptButton), false);
      return btn ? updateNode(doc, doc.form.id, (n) => setProps(n, { CancelButton: buttonRef(doc, btn) })) : doc;
    }
    case 'numeric-updown-range':
    case 'progress-bar-range': {
      const node = getNode(doc, issue.nodeId);
      if (!node || node.inherited) return doc;
      let min = numProp(node, 'Minimum', 0);
      let max = numProp(node, 'Maximum', 100);
      if (min > max) [min, max] = [max, min];
      if (issue.code === 'progress-bar-range' && min === max) max = min + 100;
      const patch: Record<string, number> = {};
      if (min !== numProp(node, 'Minimum', 0)) patch.Minimum = min;
      if (max !== numProp(node, 'Maximum', 100)) patch.Maximum = max;
      const v = node.properties.Value;
      if (typeof v === 'number' && (v < min || v > max)) patch.Value = Math.min(max, Math.max(min, v));
      return Object.keys(patch).length ? updateNode(doc, node.id, (n) => setProps(n, patch)) : doc;
    }
    case 'split-container-distance': {
      const node = getNode(doc, issue.nodeId);
      if (!node || node.inherited) return doc;
      const o = node.properties.Orientation;
      const horizontal = isEnumValue(o) && o.value === 'Horizontal';
      const bounds = layout?.get(node.id)?.bounds;
      const size = node.properties.Size;
      const sizeObj = size && typeof size === 'object' && 'width' in size ? (size as { width: number; height: number }) : undefined;
      const axis = horizontal ? bounds?.height ?? sizeObj?.height : bounds?.width ?? sizeObj?.width;
      if (!axis) return doc;
      const sw = numProp(node, 'SplitterWidth', 4);
      const min1 = numProp(node, 'Panel1MinSize', 25);
      const min2 = numProp(node, 'Panel2MinSize', 25);
      const max = Math.max(min1, axis - min2 - sw);
      const cur = numProp(node, 'SplitterDistance', min1);
      const dist = Math.round(Math.min(max, Math.max(min1, cur)));
      return dist === cur ? doc : updateNode(doc, node.id, (n) => setProps(n, { SplitterDistance: dist }));
    }
    case 'missing-accessible-text': {
      const node = getNode(doc, issue.nodeId);
      if (!node || node.inherited) return doc;
      return updateNode(doc, node.id, (n) => setProps(n, { AccessibleName: humanizeControlName(n.name, n.type) }));
    }
    default:
      return doc;
  }
}

/** True when `applyAuditFix` would change the document for this issue. */
export function canFixAuditIssue(doc: DesignDocument, issue: DesignAuditIssue, layout?: LayoutMap): boolean {
  return FIXABLE_AUDIT_CODES.has(issue.code) && applyAuditFix(doc, issue, layout) !== doc;
}
