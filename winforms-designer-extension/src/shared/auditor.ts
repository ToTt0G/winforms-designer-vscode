// Pure-TypeScript WinForms Layout & Accessibility Auditor

import { getControlDefinition } from './catalog';
import {
  isEnumValue,
  isPointValue,
  isSizeValue,
  type DesignDocument,
  type DesignNode,
} from './model';

export type AuditSeverity = 'error' | 'warning' | 'info';

export type AuditRuleCode =
  | 'overlapping-controls'
  | 'out-of-bounds'
  | 'duplicate-tab-index'
  | 'dialog-missing-accept-button'
  | 'dialog-missing-cancel-button'
  | 'missing-accessible-text'
  | 'numeric-updown-range'
  | 'progress-bar-range'
  | 'split-container-distance';

export interface DesignAuditIssue {
  code: AuditRuleCode;
  severity: AuditSeverity;
  nodeId: string;
  controlName: string;
  relatedControlName?: string;
  message: string;
}

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

const ACCESSIBLE_TEXT_REQUIRED_TYPES = new Set<string>(['Button', 'CheckBox', 'RadioButton']);

const AUTO_LAYOUT_CONTAINERS = new Set<string>([
  'TabControl',
  'FlowLayoutPanel',
  'TableLayoutPanel',
]);

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Audits a parsed or edited `DesignDocument` for layout defects, accessibility gaps,
 * dialog usability omissions, and invalid WinForms property ranges.
 */
export function auditDesignDocument(doc: DesignDocument): DesignAuditIssue[] {
  const issues: DesignAuditIssue[] = [];

  // 1. Dialog AcceptButton / CancelButton check on FixedDialog forms
  if (doc.baseType === 'Form') {
    const borderStyle = doc.form.properties.FormBorderStyle;
    if (isEnumValue(borderStyle) && borderStyle.value === 'FixedDialog') {
      if (!doc.form.properties.AcceptButton) {
        issues.push({
          code: 'dialog-missing-accept-button',
          severity: 'info',
          nodeId: doc.form.id,
          controlName: doc.form.name,
          message: `Dialog "${doc.form.name}" uses FormBorderStyle.FixedDialog without an AcceptButton.`,
        });
      }
      if (!doc.form.properties.CancelButton) {
        issues.push({
          code: 'dialog-missing-cancel-button',
          severity: 'info',
          nodeId: doc.form.id,
          controlName: doc.form.name,
          message: `Dialog "${doc.form.name}" uses FormBorderStyle.FixedDialog without a CancelButton.`,
        });
      }
    }
  }

  // 2. Recursively audit container layout and individual control rules
  auditContainer(doc.form, undefined, issues);

  return issues;
}

function auditContainer(
  container: DesignNode,
  parentClientSize: { width: number; height: number } | undefined,
  issues: DesignAuditIssue[]
): void {
  const containerSize = getContainerClientSize(container, parentClientSize);

  // Partition children into sibling groups (SplitContainer separates Panel1 & Panel2)
  const siblingGroups: Array<{
    children: DesignNode[];
    boundsSize: { width: number; height: number } | undefined;
  }> = [];

  if (container.type === 'SplitContainer') {
    const panel1Children = container.children.filter((c) => c.panelSlot !== 'Panel2');
    const panel2Children = container.children.filter((c) => c.panelSlot === 'Panel2');
    const panelSizes = getSplitContainerPanelSizes(container, containerSize);
    siblingGroups.push(
      { children: panel1Children, boundsSize: panelSizes.panel1 },
      { children: panel2Children, boundsSize: panelSizes.panel2 }
    );
  } else {
    siblingGroups.push({ children: container.children, boundsSize: containerSize });
  }

  const isAutoLayout = AUTO_LAYOUT_CONTAINERS.has(container.type);
  const autoScroll = container.properties.AutoScroll === true;

  for (const group of siblingGroups) {
    // 2a. Check overlapping sibling non-docked controls & out-of-bounds controls
    if (!isAutoLayout) {
      const positioned: Array<{ node: DesignNode; rect: Rect }> = [];

      for (const child of group.children) {
        if (child.properties.Visible === false) continue;
        if (isDocked(child)) continue;

        const rect = getControlRect(child);
        if (!rect) continue;

        positioned.push({ node: child, rect });

        // Out-of-bounds check
        if (group.boundsSize) {
          const { width: pw, height: ph } = group.boundsSize;
          const outLeftTop = rect.x < 0 || rect.y < 0;
          const outRightBottom =
            !autoScroll && (rect.x + rect.width > pw || rect.y + rect.height > ph);
          if (outLeftTop || outRightBottom) {
            issues.push({
              code: 'out-of-bounds',
              severity: 'warning',
              nodeId: child.id,
              controlName: child.name,
              message: `Control "${child.name}" (${rect.x}, ${rect.y}, ${rect.width}x${rect.height}) extends outside "${container.name}" (${pw}x${ph}).`,
            });
          }
        }
      }

      // Pairwise overlap check among non-docked siblings in the same container
      for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
          const a = positioned[i];
          const b = positioned[j];
          if (rectsOverlap(a.rect, b.rect)) {
            issues.push({
              code: 'overlapping-controls',
              severity: 'warning',
              nodeId: b.node.id,
              controlName: b.node.name,
              relatedControlName: a.node.name,
              message: `Control "${b.node.name}" overlaps sibling "${a.node.name}" inside "${container.name}".`,
            });
          }
        }
      }
    }

    // 2b. Duplicate TabIndex check among interactive siblings in the same container
    const seenTabIndices = new Map<number, DesignNode>();
    for (const child of group.children) {
      if (!isInteractiveTabControl(child)) continue;
      const tabIndex = child.properties.TabIndex;
      if (typeof tabIndex !== 'number') continue;
      const first = seenTabIndices.get(tabIndex);
      if (first) {
        issues.push({
          code: 'duplicate-tab-index',
          severity: 'warning',
          nodeId: child.id,
          controlName: child.name,
          relatedControlName: first.name,
          message: `Control "${child.name}" shares duplicate TabIndex ${tabIndex} with "${first.name}" in "${container.name}".`,
        });
      } else {
        seenTabIndices.set(tabIndex, child);
      }
    }

    // 2c. Per-control rules and recursion
    for (const child of group.children) {
      auditSingleControl(child, group.boundsSize, issues);
      if (child.children.length > 0) {
        auditContainer(child, group.boundsSize, issues);
      }
    }
  }
}

function auditSingleControl(
  node: DesignNode,
  parentSize: { width: number; height: number } | undefined,
  issues: DesignAuditIssue[]
): void {
  // Accessible text on Button / CheckBox / RadioButton
  if (ACCESSIBLE_TEXT_REQUIRED_TYPES.has(node.type)) {
    const text = typeof node.properties.Text === 'string' ? node.properties.Text.trim() : '';
    const accessibleName =
      typeof node.properties.AccessibleName === 'string'
        ? node.properties.AccessibleName.trim()
        : '';
    if (!text && !accessibleName) {
      issues.push({
        code: 'missing-accessible-text',
        severity: 'warning',
        nodeId: node.id,
        controlName: node.name,
        message: `${node.type} "${node.name}" has neither Text nor AccessibleName set.`,
      });
    }
  }

  // NumericUpDown Minimum / Maximum / Value range check
  if (node.type === 'NumericUpDown') {
    const min = typeof node.properties.Minimum === 'number' ? node.properties.Minimum : 0;
    const max = typeof node.properties.Maximum === 'number' ? node.properties.Maximum : 100;
    if (min > max) {
      issues.push({
        code: 'numeric-updown-range',
        severity: 'error',
        nodeId: node.id,
        controlName: node.name,
        message: `NumericUpDown "${node.name}" has Minimum (${min}) greater than Maximum (${max}).`,
      });
    } else if (typeof node.properties.Value === 'number') {
      const val = node.properties.Value;
      if (val < min || val > max) {
        issues.push({
          code: 'numeric-updown-range',
          severity: 'error',
          nodeId: node.id,
          controlName: node.name,
          message: `NumericUpDown "${node.name}" has Value (${val}) outside [${min}, ${max}].`,
        });
      }
    }
  }

  // ProgressBar Minimum / Maximum / Value range check
  if (node.type === 'ProgressBar') {
    const min = typeof node.properties.Minimum === 'number' ? node.properties.Minimum : 0;
    const max = typeof node.properties.Maximum === 'number' ? node.properties.Maximum : 100;
    if (min >= max) {
      issues.push({
        code: 'progress-bar-range',
        severity: 'error',
        nodeId: node.id,
        controlName: node.name,
        message: `ProgressBar "${node.name}" has Minimum (${min}) greater than or equal to Maximum (${max}).`,
      });
    } else if (typeof node.properties.Value === 'number') {
      const val = node.properties.Value;
      if (val < min || val > max) {
        issues.push({
          code: 'progress-bar-range',
          severity: 'error',
          nodeId: node.id,
          controlName: node.name,
          message: `ProgressBar "${node.name}" has Value (${val}) outside [${min}, ${max}].`,
        });
      }
    }
  }

  // SplitContainer SplitterDistance check (respecting Panel1MinSize, Panel2MinSize, and SplitterWidth)
  if (node.type === 'SplitContainer') {
    const dist = node.properties.SplitterDistance;
    if (typeof dist === 'number') {
      const size = getContainerClientSize(node, parentSize);
      if (size) {
        const orientation = node.properties.Orientation;
        const isHorizontal = isEnumValue(orientation) && orientation.value === 'Horizontal';
        const axisLimit = isHorizontal ? size.height : size.width;
        const splitterWidth =
          typeof node.properties.SplitterWidth === 'number' ? node.properties.SplitterWidth : 4;
        const panel1Min =
          typeof node.properties.Panel1MinSize === 'number' ? node.properties.Panel1MinSize : 25;
        const panel2Min =
          typeof node.properties.Panel2MinSize === 'number' ? node.properties.Panel2MinSize : 25;
        const maxDist = axisLimit - panel2Min - splitterWidth;
        if (dist < panel1Min || (axisLimit > 0 && maxDist >= panel1Min && dist > maxDist) || (axisLimit > 0 && dist >= axisLimit)) {
          issues.push({
            code: 'split-container-distance',
            severity: 'error',
            nodeId: node.id,
            controlName: node.name,
            message: `SplitContainer "${node.name}" has SplitterDistance (${dist}) outside valid bounds [${panel1Min}, ${Math.max(panel1Min, maxDist)}] for ${isHorizontal ? 'height' : 'width'} ${axisLimit}.`,
          });
        }
      }
    }
  }
}

function isDocked(node: DesignNode): boolean {
  const dock = node.properties.Dock;
  if (isEnumValue(dock) && dock.value !== 'None') {
    return true;
  }
  const def = getControlDefinition(node.type);
  if (!dock && def?.defaultDock && def.defaultDock !== 'None') {
    return true;
  }
  return false;
}

function isInteractiveTabControl(node: DesignNode): boolean {
  if (node.properties.TabStop === false) return false;
  return INTERACTIVE_TAB_TYPES.has(node.type);
}

function getControlRect(node: DesignNode): Rect | null {
  const loc = node.properties.Location;
  const sz = node.properties.Size;
  const x = isPointValue(loc) ? loc.x : 0;
  const y = isPointValue(loc) ? loc.y : 0;

  let width: number | undefined;
  let height: number | undefined;
  if (isSizeValue(sz)) {
    width = sz.width;
    height = sz.height;
  } else {
    const def = getControlDefinition(node.type);
    if (def) {
      width = def.defaultSize.width;
      height = def.defaultSize.height;
    }
  }

  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function getContainerClientSize(
  node: DesignNode,
  parentSize: { width: number; height: number } | undefined
): { width: number; height: number } | undefined {
  if (isSizeValue(node.properties.ClientSize)) {
    return { width: node.properties.ClientSize.width, height: node.properties.ClientSize.height };
  }
  if (isSizeValue(node.properties.Size)) {
    return { width: node.properties.Size.width, height: node.properties.Size.height };
  }
  if (isDocked(node) && parentSize) {
    const dock = node.properties.Dock;
    if (isEnumValue(dock) && dock.value === 'Fill') {
      return parentSize;
    }
  }
  return undefined;
}

function getSplitContainerPanelSizes(
  split: DesignNode,
  splitSize: { width: number; height: number } | undefined
): {
  panel1: { width: number; height: number } | undefined;
  panel2: { width: number; height: number } | undefined;
} {
  if (!splitSize) return { panel1: undefined, panel2: undefined };
  const orientation = split.properties.Orientation;
  const isHorizontal = isEnumValue(orientation) && orientation.value === 'Horizontal';
  const splitterWidth =
    typeof split.properties.SplitterWidth === 'number' ? split.properties.SplitterWidth : 4;
  const dist =
    typeof split.properties.SplitterDistance === 'number'
      ? split.properties.SplitterDistance
      : Math.floor((isHorizontal ? splitSize.height : splitSize.width) / 2);

  if (isHorizontal) {
    return {
      panel1: { width: splitSize.width, height: Math.max(0, dist) },
      panel2: {
        width: splitSize.width,
        height: Math.max(0, splitSize.height - dist - splitterWidth),
      },
    };
  }
  return {
    panel1: { width: Math.max(0, dist), height: splitSize.height },
    panel2: {
      width: Math.max(0, splitSize.width - dist - splitterWidth),
      height: splitSize.height,
    },
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
