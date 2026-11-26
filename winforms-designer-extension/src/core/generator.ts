// Pure-TypeScript WinForms .Designer.cs Code Generator
// Surgically updates InitializeComponent() and field declarations, preserving all surrounding code.
// Double round-trip (parse -> generate -> parse -> generate) is strictly idempotent.

import { getControlDefinition, getEventSignature, WINFORMS_ENUMS } from '../shared/catalog';
import type {
  ColorValue,
  DataBindingEntry,
  DataGridViewColumnNode,
  DesignDocument,
  DesignNode,
  DocumentStyleMetadata,
  EnumValue,
  EventSubscription,
  FieldDeclarationSpan,
  FlagsValue,
  FontValue,
  GenerateOptions,
  ListViewColumnNode,
  PaddingValue,
  PropertyValue,
  ResourceValue,
  SizeFValue,
  SizeValue,
  StripItemNode,
  TableTrackStyle,
  TreeNodeItem,
} from '../shared/model';
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
} from '../shared/model';
import { splitStatements, tokenizeCSharp } from './lexer';
import { doesRawDataBindingMatchEntry, doesRawExpressionMatchValue } from './parser';
import { encodeCSharpString } from './stringLiteral';

const DECIMAL_PROPERTIES = new Set<string>(['Value', 'Minimum', 'Maximum', 'Increment']);
const CHAR_PROPERTIES = new Set<string>(['PasswordChar', 'PromptChar']);

const CONTROL_REFERENCE_PROPERTIES = new Set<string>([
  'AcceptButton',
  'CancelButton',
  'MainMenuStrip',
  'ContextMenuStrip',
  'ImageList',
  'SmallImageList',
  'LargeImageList',
  'StateImageList',
  'DataSource',
  'ContainerControl',
  'Document',
  'BindingSource',
]);

const EXTRA_ENUM_FULL_NAMES: Record<string, string> = {
  Cursors: 'System.Windows.Forms.Cursors',
  FontStyle: 'System.Drawing.FontStyle',
  GraphicsUnit: 'System.Drawing.GraphicsUnit',
  Keys: 'System.Windows.Forms.Keys',
  SizeType: 'System.Windows.Forms.SizeType',
  ToolStripItemDisplayStyle: 'System.Windows.Forms.ToolStripItemDisplayStyle',
  ToolStripItemAlignment: 'System.Windows.Forms.ToolStripItemAlignment',
  ToolStripItemOverflow: 'System.Windows.Forms.ToolStripItemOverflow',
  ToolStripLayoutStyle: 'System.Windows.Forms.ToolStripLayoutStyle',
  ToolStripStatusLabelBorderSides: 'System.Windows.Forms.ToolStripStatusLabelBorderSides',
  Border3DSide: 'System.Windows.Forms.Border3DSide',
  Border3DStyle: 'System.Windows.Forms.Border3DStyle',
  DataGridViewTriState: 'System.Windows.Forms.DataGridViewTriState',
  DataGridViewColumnSortMode: 'System.Windows.Forms.DataGridViewColumnSortMode',
  DataGridViewAutoSizeColumnMode: 'System.Windows.Forms.DataGridViewAutoSizeColumnMode',
  DataGridViewAutoSizeRowsMode: 'System.Windows.Forms.DataGridViewAutoSizeRowsMode',
  DataGridViewRowHeadersWidthSizeMode: 'System.Windows.Forms.DataGridViewRowHeadersWidthSizeMode',
  DataGridViewEditMode: 'System.Windows.Forms.DataGridViewEditMode',
  DataGridViewCellBorderStyle: 'System.Windows.Forms.DataGridViewCellBorderStyle',
  DataGridViewHeaderBorderStyle: 'System.Windows.Forms.DataGridViewHeaderBorderStyle',
  DataGridViewClipboardCopyMode: 'System.Windows.Forms.DataGridViewClipboardCopyMode',
  DataGridViewContentAlignment: 'System.Windows.Forms.DataGridViewContentAlignment',
  ColumnHeaderStyle: 'System.Windows.Forms.ColumnHeaderStyle',
  ItemActivation: 'System.Windows.Forms.ItemActivation',
  Shortcut: 'System.Windows.Forms.Shortcut',
  ArrowDirection: 'System.Windows.Forms.ArrowDirection',
  AutoCompleteMode: 'System.Windows.Forms.AutoCompleteMode',
  AutoCompleteSource: 'System.Windows.Forms.AutoCompleteSource',
  ColorDepth: 'System.Windows.Forms.ColorDepth',
  ErrorBlinkStyle: 'System.Windows.Forms.ErrorBlinkStyle',
  ErrorIconAlignment: 'System.Windows.Forms.ErrorIconAlignment',
  ImeMode: 'System.Windows.Forms.ImeMode',
  InsertKeyMode: 'System.Windows.Forms.InsertKeyMode',
  LinkBehavior: 'System.Windows.Forms.LinkBehavior',
  MaskFormat: 'System.Windows.Forms.MaskFormat',
  TabDrawMode: 'System.Windows.Forms.TabDrawMode',
  TabSizeMode: 'System.Windows.Forms.TabSizeMode',
  ToolTipIcon: 'System.Windows.Forms.ToolTipIcon',
};

interface FlattenedField {
  name: string;
  shortType: string;
  instantiationType: string;
  fieldTypeName: string;
  modifier: string;
  constructorArgs?: string;
  explicitTypeChanged?: boolean;
}

interface TreeNodeEmitPlan {
  declLines: string[];
  perControl: Map<string, { configLines: string[]; rootVarNames: string[] }>;
}

interface EmitContext {
  prefix: string;
  useThis: boolean;
  useShorthandEvents: boolean;
  eventHandlerStyleOption: 'auto' | 'shorthand' | 'explicitDelegate';
  resourceVarName: string;
  eol: string;
  indent: string;
  bodyIndent: string;
  allValidNames: Set<string>;
  existingFields: DocumentStyleMetadata['existingFieldDeclarations'];
  treeNodePlan: TreeNodeEmitPlan;
}

/**
 * Serializes a `DesignDocument` back into valid, idiomatic WinForms `.Designer.cs` C# code.
 * When `doc.metadata.originalSource` and `initializeComponentRange` are present, performs
 * a surgical patch replacing ONLY `InitializeComponent()` and individual changed/deleted/added fields.
 */
export function generateDesignerCs(doc: DesignDocument, options?: GenerateOptions): string {
  if (doc.metadata.readOnlyReason) {
    throw new Error(`Cannot generate designer code: ${doc.metadata.readOnlyReason}`);
  }

  const eol = doc.metadata.eol || '\r\n';
  const indent = doc.metadata.indent || '    ';

  const useThis =
    options?.useThisQualifier === 'always'
      ? true
      : options?.useThisQualifier === 'never'
        ? false
        : doc.metadata.useThisQualifier;

  const eventHandlerStyleOption: 'auto' | 'shorthand' | 'explicitDelegate' =
    options?.eventHandlerStyle ?? 'auto';

  const useShorthandEvents =
    eventHandlerStyleOption === 'shorthand'
      ? true
      : eventHandlerStyleOption === 'explicitDelegate'
        ? false
        : doc.metadata.useShorthandEvents;

  const original = doc.metadata.originalSource;
  const initRange = doc.metadata.initializeComponentRange;
  const fieldsRange = doc.metadata.fieldsRegionRange;
  const resourceVarName = doc.metadata.resourceVarName || 'resources';

  // Determine indentation levels
  const hasValidOriginal =
    Boolean(original) &&
    Boolean(initRange) &&
    initRange!.start >= 0 &&
    initRange!.end <= original.length &&
    initRange!.start <= initRange!.end;

  if (!hasValidOriginal && original.trim().length > 0 && !options?.allowFullFileGeneration) {
    throw new Error(
      'Cannot patch designer file safely: InitializeComponent() range is missing or invalid. Set allowFullFileGeneration: true to overwrite the entire file.'
    );
  }

  const methodIndent = hasValidOriginal
    ? detectLineIndent(original, initRange!.start)
    : !doc.namespaceName || doc.fileScopedNamespace
      ? indent
      : indent + indent;

  const bodyIndent = methodIndent + indent;
  const fieldIndent = methodIndent;

  // Collect all flattened fields & nodes in deterministic pre-order (throws on duplicate names)
  const { fields: allFields, inheritedNames } = collectAllFields(doc);
  const allValidNames = new Set<string>([
    ...allFields.map((f) => f.name),
    ...inheritedNames,
  ]);
  allValidNames.add(doc.form.name);
  allValidNames.add(doc.className);

  const visualNodesPreOrder = collectVisualNodesPreOrder(doc.form.children);
  const treeNodePlan = buildTreeNodeEmitPlan(visualNodesPreOrder, bodyIndent, indent);

  const ctx: EmitContext = {
    prefix: useThis ? 'this.' : '',
    useThis,
    useShorthandEvents,
    eventHandlerStyleOption,
    resourceVarName,
    eol,
    indent,
    bodyIndent,
    allValidNames,
    existingFields: doc.metadata.existingFieldDeclarations,
    treeNodePlan,
  };

  const needsComponents =
    doc.metadata.usesContainerComponents ||
    allFields.some((f) => f.constructorArgs?.includes('components'));

  const initMethodText = buildInitializeComponentMethod(
    doc,
    allFields,
    visualNodesPreOrder,
    needsComponents,
    ctx,
    methodIndent
  );
  const fieldsLines = allFields.map(
    (f) => `${fieldIndent}${f.modifier} ${f.fieldTypeName} ${f.name};`
  );

  // Surgical patch mode
  if (hasValidOriginal && initRange) {
    let result = original;
    const fieldSpans = doc.metadata.fieldSpans;

    const hasComponentsField =
      (fieldSpans !== undefined && 'components' in fieldSpans) ||
      'components' in doc.metadata.existingFieldDeclarations ||
      /\bIContainer\??\s+components\b/.test(original.slice(0, initRange.start));

    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    edits.push({
      start: initRange.start,
      end: initRange.end,
      replacement: initMethodText,
    });

    if (fieldSpans !== undefined) {
      // Surgical per-field declaration patching (never wipes helper methods, comments, or sibling declarators)
      const originalInitText = original.slice(initRange.start, initRange.end);
      const allFieldsByName = new Map<string, FlattenedField>();
      for (const f of allFields) {
        allFieldsByName.set(f.name, f);
      }

      // Group fieldSpans by statement identity so multi-declarator statements are patched atomically
      const stmtGroups = new Map<
        string,
        { statementStart: number; statementEnd: number; spans: FieldDeclarationSpan[] }
      >();
      for (const span of Object.values(fieldSpans)) {
        if (
          span.statementStart < 0 ||
          span.statementEnd > original.length ||
          span.statementStart > span.statementEnd
        ) {
          continue;
        }
        const key = `${span.statementStart}:${span.statementEnd}`;
        let group = stmtGroups.get(key);
        if (!group) {
          group = {
            statementStart: span.statementStart,
            statementEnd: span.statementEnd,
            spans: [],
          };
          stmtGroups.set(key, group);
        }
        group.spans.push(span);
      }

      for (const group of stmtGroups.values()) {
        const { statementStart, statementEnd, spans } = group;
        const isMulti = spans.length > 1 || spans[0].isMultiDeclarator;

        if (!isMulti) {
          const span = spans[0];
          const field = allFieldsByName.get(span.name);
          if (field) {
            // Existing field still present
            const typeChanged = field.fieldTypeName !== span.typeName;
            const modifierChanged = field.modifier !== span.modifier;
            if (span.beforeInit) {
              // Leave beforeInit fields in place; only update if explicitly changed & single-declarator without attributes/initializer
              if (field.explicitTypeChanged && !span.hasAttributesOrInitializer) {
                const lineIndent = detectLineIndent(original, statementStart);
                edits.push({
                  start: statementStart,
                  end: statementEnd,
                  replacement: `${lineIndent}${field.modifier} ${field.fieldTypeName} ${field.name};`,
                });
              }
            } else if ((typeChanged || modifierChanged) && !span.hasAttributesOrInitializer) {
              const lineIndent = detectLineIndent(original, statementStart);
              edits.push({
                start: statementStart,
                end: statementEnd,
                replacement: `${lineIndent}${field.modifier} ${field.fieldTypeName} ${field.name};`,
              });
            }
          } else {
            // Absent from allFields: delete ONLY if it was a designer field used in old InitializeComponent()
            if (span.name !== 'components' && isFieldUsedInInit(span.name, originalInitText)) {
              const removeEnd = advancePastTrailingNewline(original, statementEnd);
              edits.push({
                start: statementStart,
                end: removeEnd,
                replacement: '',
              });
            }
          }
        } else {
          // Multi-declarator field statement (e.g. `private Button button1, helper;`)
          const deletedNames = new Set<string>();
          for (const s of spans) {
            if (
              !allFieldsByName.has(s.name) &&
              s.name !== 'components' &&
              isFieldUsedInInit(s.name, originalInitText)
            ) {
              deletedNames.add(s.name);
            }
          }

          if (deletedNames.size === 0) {
            // Nothing deleted -> leave multi-declarator statement completely untouched
          } else if (deletedNames.size === spans.length) {
            // All declarators in this statement were deleted designer fields -> remove whole statement
            const removeEnd = advancePastTrailingNewline(original, statementEnd);
            edits.push({
              start: statementStart,
              end: removeEnd,
              replacement: '',
            });
          } else {
            // Surgically strip ONLY the deleted declarators while preserving surviving siblings verbatim
            const originalStmt = original.slice(statementStart, statementEnd);
            const patchedStmt = removeDeclaratorsFromMultiFieldStatement(
              originalStmt,
              deletedNames
            );
            if (patchedStmt !== null) {
              edits.push({
                start: statementStart,
                end: statementEnd,
                replacement: patchedStmt,
              });
            }
          }
        }
      }

      // Collect brand-new fields not yet declared anywhere in fieldSpans
      const newFieldLines: string[] = [];
      if (needsComponents && !hasComponentsField) {
        newFieldLines.push(`${fieldIndent}private System.ComponentModel.IContainer? components = null;`);
      }
      for (const f of allFields) {
        if (!(f.name in fieldSpans)) {
          newFieldLines.push(`${fieldIndent}${f.modifier} ${f.fieldTypeName} ${f.name};`);
        }
      }

      if (newFieldLines.length > 0) {
        const insertOffset =
          doc.metadata.fieldInsertOffset ??
          (fieldsRange && fieldsRange.end >= 0 && fieldsRange.end <= original.length
            ? advancePastTrailingNewline(original, fieldsRange.end)
            : undefined);

        if (insertOffset !== undefined && insertOffset >= 0 && insertOffset <= original.length) {
          const before = original.slice(0, insertOffset);
          const trimmedBefore = before.trimEnd();
          const needsLeadingNewline =
            before.length > 0 && !before.endsWith('\n') && !before.endsWith('\r');
          const needsBlankLine =
            !before.endsWith('\n\n') &&
            !before.endsWith('\r\n\r\n') &&
            (trimmedBefore.endsWith('#endregion') || trimmedBefore.endsWith('}'));
          const prefixStr = (needsLeadingNewline ? eol : '') + (needsBlankLine ? eol : '');
          edits.push({
            start: insertOffset,
            end: insertOffset,
            replacement: prefixStr + newFieldLines.join(eol) + eol,
          });
        }
      }
    } else {
      // Legacy fallback when fieldSpans is not provided on manually constructed DesignDocuments
      const emittedFieldsLines =
        needsComponents && !hasComponentsField
          ? [`${fieldIndent}private System.ComponentModel.IContainer? components = null;`, ...fieldsLines]
          : [...fieldsLines];

      const validFieldsRange =
        fieldsRange &&
        fieldsRange.start >= 0 &&
        fieldsRange.end <= original.length &&
        fieldsRange.start <= fieldsRange.end;

      if (validFieldsRange && fieldsRange) {
        if (fieldsRange.start === fieldsRange.end) {
          if (emittedFieldsLines.length > 0) {
            const before = original.slice(0, fieldsRange.start);
            const trimmedBefore = before.trimEnd();
            const needsBlankLine =
              !before.endsWith('\n\n') &&
              !before.endsWith('\r\n\r\n') &&
              (trimmedBefore.endsWith('#endregion') || trimmedBefore.endsWith('}'));
            const prefixStr = needsBlankLine ? eol : '';
            edits.push({
              start: fieldsRange.start,
              end: fieldsRange.end,
              replacement: prefixStr + emittedFieldsLines.join(eol) + eol,
            });
          }
        } else {
          const preservedUserLines = extractPreservedUserFieldLines(
            original,
            fieldsRange,
            initRange,
            allValidNames
          );
          const combinedFieldLines = [...emittedFieldsLines, ...preservedUserLines];
          if (combinedFieldLines.length > 0) {
            edits.push({
              start: fieldsRange.start,
              end: fieldsRange.end,
              replacement: combinedFieldLines.join(eol),
            });
          } else {
            const removeEnd = advancePastTrailingNewline(original, fieldsRange.end);
            edits.push({
              start: fieldsRange.start,
              end: removeEnd,
              replacement: '',
            });
          }
        }
      }
    }

    // Verify strictly disjoint non-overlapping spans before applying edits
    const sortedAsc = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < sortedAsc.length; i++) {
      if (sortedAsc[i].start < sortedAsc[i - 1].end) {
        throw new Error(
          `Cannot patch designer file safely: overlapping edit spans [${sortedAsc[i - 1].start}, ${sortedAsc[i - 1].end}] and [${sortedAsc[i].start}, ${sortedAsc[i].end}].`
        );
      }
    }

    for (let i = sortedAsc.length - 1; i >= 0; i--) {
      const edit = sortedAsc[i];
      result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    }
    return result;
  }

  // Full file generation from scratch
  return buildFullDesignerFile(doc, initMethodText, fieldsLines, eol, indent);
}

// ---------------------------------------------------------------------------
// InitializeComponent() Builder
// ---------------------------------------------------------------------------

function buildInitializeComponentMethod(
  doc: DesignDocument,
  allFields: FlattenedField[],
  visualNodesPreOrder: DesignNode[],
  needsComponents: boolean,
  ctx: EmitContext,
  methodIndent: string
): string {
  const { prefix, eol, bodyIndent } = ctx;
  const lines: string[] = [];

  lines.push(`${methodIndent}private void InitializeComponent()`);
  lines.push(`${methodIndent}{`);

  const needsResources =
    hasAnyResourceValue(doc) ||
    (doc.metadata.usesComponentResourceManager && anyRawReferencesResources(doc));

  // 1. Container, ResourceManager, and TreeNode local declarations
  if (needsComponents) {
    lines.push(`${bodyIndent}${prefix}components = new System.ComponentModel.Container();`);
  }
  if (needsResources) {
    if (doc.metadata.resourceManagerStatement && doc.metadata.resourceManagerStatement.trim()) {
      lines.push(`${bodyIndent}${doc.metadata.resourceManagerStatement.trim()}`);
    } else {
      lines.push(
        `${bodyIndent}System.ComponentModel.ComponentResourceManager ${ctx.resourceVarName} = new System.ComponentModel.ComponentResourceManager(typeof(${doc.className}));`
      );
    }
  }
  for (const declLine of ctx.treeNodePlan.declLines) {
    lines.push(declLine);
  }

  // 2. Instantiations
  for (const field of allFields) {
    const ctorArgs = resolveConstructorArgs(field.constructorArgs, prefix);
    lines.push(`${bodyIndent}${prefix}${field.name} = new ${field.instantiationType}(${ctorArgs});`);
  }

  // 3. BeginInit() / SuspendLayout()
  const ownComponents = doc.components.filter((c) => !c.inherited);
  const allNodesForInit = [...visualNodesPreOrder, ...ownComponents];
  const emitSuspendResume = doc.metadata.hasSuspendResumeLayout !== false;

  if (emitSuspendResume) {
    for (const node of allNodesForInit) {
      const def = getControlDefinition(node.type);
      const isInit = Boolean(def?.supportsInitialize);
      const isLayout = shouldSuspendNodeLayout(node);

      if (isInit) {
        lines.push(
          `${bodyIndent}((System.ComponentModel.ISupportInitialize)(${prefix}${node.name})).BeginInit();`
        );
      }
      if (node.type === 'SplitContainer') {
        lines.push(`${bodyIndent}${prefix}${node.name}.Panel1.SuspendLayout();`);
        lines.push(`${bodyIndent}${prefix}${node.name}.Panel2.SuspendLayout();`);
        lines.push(`${bodyIndent}${prefix}${node.name}.SuspendLayout();`);
      } else if (isLayout) {
        lines.push(`${bodyIndent}${prefix}${node.name}.SuspendLayout();`);
      }
    }
    lines.push(`${bodyIndent}${prefix}SuspendLayout();`);
  } else {
    // Still emit BeginInit for ISupportInitialize controls even if SuspendLayout was disabled
    for (const node of allNodesForInit) {
      if (getControlDefinition(node.type)?.supportsInitialize) {
        lines.push(
          `${bodyIndent}((System.ComponentModel.ISupportInitialize)(${prefix}${node.name})).BeginInit();`
        );
      }
    }
  }

  // 4. Unhandled top-level statements (preserved verbatim; emitted before control blocks so local vars like DataGridViewCellStyle are in scope)
  for (const rawStmt of doc.metadata.unhandledTopLevelStatements) {
    const trimmed = rawStmt.trim();
    if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
      lines.push(`${bodyIndent}${trimmed}`);
    }
  }

  // 5. Visual control configuration blocks (pre-order)
  for (const node of visualNodesPreOrder) {
    emitNodeConfigBlock(node, ctx, lines);
  }

  // 6. Component configuration blocks
  for (const comp of ownComponents) {
    emitNodeConfigBlock(comp, ctx, lines);
  }

  // 7. Root Form / UserControl configuration block
  emitFormConfigBlock(doc, ctx, lines);

  // 7b. Unhandled trailing statements that appeared after control blocks in source order
  if (doc.metadata.unhandledTrailingStatements) {
    for (const rawStmt of doc.metadata.unhandledTrailingStatements) {
      const trimmed = rawStmt.trim();
      if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
        lines.push(`${bodyIndent}${trimmed}`);
      }
    }
  }

  // 8. ResumeLayout() / PerformLayout() / EndInit()
  if (emitSuspendResume) {
    for (const node of allNodesForInit) {
      const def = getControlDefinition(node.type);
      const isInit = Boolean(def?.supportsInitialize);
      const isLayout = shouldSuspendNodeLayout(node);

      if (node.type === 'SplitContainer') {
        lines.push(`${bodyIndent}${prefix}${node.name}.Panel1.ResumeLayout(false);`);
        lines.push(`${bodyIndent}${prefix}${node.name}.Panel2.ResumeLayout(false);`);
        lines.push(
          `${bodyIndent}((System.ComponentModel.ISupportInitialize)(${prefix}${node.name})).EndInit();`
        );
        lines.push(`${bodyIndent}${prefix}${node.name}.ResumeLayout(false);`);
      } else {
        if (isInit) {
          lines.push(
            `${bodyIndent}((System.ComponentModel.ISupportInitialize)(${prefix}${node.name})).EndInit();`
          );
        }
        if (isLayout) {
          lines.push(`${bodyIndent}${prefix}${node.name}.ResumeLayout(false);`);
          if (shouldPerformNodeLayout(node)) {
            lines.push(`${bodyIndent}${prefix}${node.name}.PerformLayout();`);
          }
        }
      }
    }
    lines.push(`${bodyIndent}${prefix}ResumeLayout(false);`);
    if (doc.form.children.some((c) => !c.inherited)) {
      lines.push(`${bodyIndent}${prefix}PerformLayout();`);
    }
  } else {
    for (const node of allNodesForInit) {
      if (getControlDefinition(node.type)?.supportsInitialize) {
        lines.push(
          `${bodyIndent}((System.ComponentModel.ISupportInitialize)(${prefix}${node.name})).EndInit();`
        );
      }
    }
  }

  lines.push(`${methodIndent}}`);
  return lines.join(eol);
}

function emitNodeConfigBlock(node: DesignNode, ctx: EmitContext, lines: string[]): void {
  const { prefix, bodyIndent, indent } = ctx;
  const target = `${prefix}${node.name}`;

  lines.push(`${bodyIndent}//`);
  lines.push(`${bodyIndent}// ${node.name}`);
  lines.push(`${bodyIndent}//`);

  // Collect sortable statements vs structured collection statements
  const propKeys = Object.keys(node.properties).sort();
  const emittedSpecial = new Set<string>();

  // Helper to emit child/collection statements at clean alphabetical positions (matching VS style)
  // TableLayoutPanel ColumnStyles / RowStyles / Controls.Add
  if (node.type === 'TableLayoutPanel') {
    if ('ColumnCount' in node.properties) {
      emitPropertyAssignment(
        target,
        'ColumnCount',
        node.properties.ColumnCount,
        node.type,
        ctx,
        lines,
        node.rawPropertyExpressions
      );
      emittedSpecial.add('ColumnCount');
    }
    if (node.tableLayout?.columnStyles) {
      for (const style of node.tableLayout.columnStyles) {
        lines.push(`${bodyIndent}${target}.ColumnStyles.Add(${serializeTableTrackStyle('ColumnStyle', style)});`);
      }
    }
    for (const child of node.children) {
      if (child.inherited) continue;
      const hasExplicitCell =
        child.tableCell?.explicit !== false &&
        child.tableCell?.column !== undefined &&
        child.tableCell?.row !== undefined;
      if (hasExplicitCell) {
        lines.push(
          `${bodyIndent}${target}.Controls.Add(${prefix}${child.name}, ${child.tableCell!.column}, ${child.tableCell!.row});`
        );
      } else {
        lines.push(`${bodyIndent}${target}.Controls.Add(${prefix}${child.name});`);
      }
      if (child.tableCell?.columnSpan && child.tableCell.columnSpan > 1) {
        lines.push(`${bodyIndent}${target}.SetColumnSpan(${prefix}${child.name}, ${child.tableCell.columnSpan});`);
      }
      if (child.tableCell?.rowSpan && child.tableCell.rowSpan > 1) {
        lines.push(`${bodyIndent}${target}.SetRowSpan(${prefix}${child.name}, ${child.tableCell.rowSpan});`);
      }
    }
    if ('RowCount' in node.properties) {
      emitPropertyAssignment(
        target,
        'RowCount',
        node.properties.RowCount,
        node.type,
        ctx,
        lines,
        node.rawPropertyExpressions
      );
      emittedSpecial.add('RowCount');
    }
    if (node.tableLayout?.rowStyles) {
      for (const style of node.tableLayout.rowStyles) {
        lines.push(`${bodyIndent}${target}.RowStyles.Add(${serializeTableTrackStyle('RowStyle', style)});`);
      }
    }
  } else if (node.type === 'SplitContainer') {
    // Emit Panel1/Panel2 controls cleanly
    for (const child of node.children) {
      if (child.inherited) continue;
      const slot = child.panelSlot === 'Panel2' ? 'Panel2' : 'Panel1';
      lines.push(`${bodyIndent}${target}.${slot}.Controls.Add(${prefix}${child.name});`);
    }
  } else if (node.children.length > 0) {
    // Panel, GroupBox, TabControl, TabPage, FlowLayoutPanel, custom containers
    for (const child of node.children) {
      if (child.inherited) continue;
      lines.push(`${bodyIndent}${target}.Controls.Add(${prefix}${child.name});`);
    }
  }

  // Strip items: MenuStrip, ToolStrip, StatusStrip, ContextMenuStrip
  if (node.stripItems && node.stripItems.length > 0) {
    emitAddRange(
      `${target}.Items.AddRange`,
      'System.Windows.Forms.ToolStripItem',
      node.stripItems.map((item) => `${prefix}${item.name}`),
      bodyIndent,
      indent,
      lines
    );
  }

  // DataGridView columns
  if (node.columns && node.columns.length > 0) {
    emitAddRange(
      `${target}.Columns.AddRange`,
      'System.Windows.Forms.DataGridViewColumn',
      node.columns.map((col) => `${prefix}${col.name}`),
      bodyIndent,
      indent,
      lines
    );
  }

  // ListView columns
  if (node.listViewColumns && node.listViewColumns.length > 0) {
    emitAddRange(
      `${target}.Columns.AddRange`,
      'System.Windows.Forms.ColumnHeader',
      node.listViewColumns.map((col) => `${prefix}${col.name}`),
      bodyIndent,
      indent,
      lines
    );
  }

  // List control string items (ComboBox, ListBox, CheckedListBox, DomainUpDown)
  if (node.items && node.items.length > 0) {
    emitAddRange(
      `${target}.Items.AddRange`,
      'object',
      node.items.map((item) => encodeCSharpString(item)),
      bodyIndent,
      indent,
      lines
    );
  }

  // TreeView nodes
  const treePlan = ctx.treeNodePlan.perControl.get(node.name);
  if (treePlan && treePlan.rootVarNames.length > 0) {
    for (const cfgLine of treePlan.configLines) {
      lines.push(cfgLine);
    }
    emitAddRange(
      `${target}.Nodes.AddRange`,
      'System.Windows.Forms.TreeNode',
      treePlan.rootVarNames,
      bodyIndent,
      indent,
      lines
    );
  }

  // DataBindings
  if (node.dataBindings && node.dataBindings.length > 0) {
    emitDataBindings(target, node.dataBindings, ctx, lines);
  }

  // Properties (alphabetical)
  for (const key of propKeys) {
    if (emittedSpecial.has(key)) continue;
    emitPropertyAssignment(
      target,
      key,
      node.properties[key],
      node.type,
      ctx,
      lines,
      node.rawPropertyExpressions
    );
  }

  // Events (preserving multi-handler subscriptions and explicit delegate types)
  for (const sub of reconcileEventSubscriptions(node.events, node.eventSubscriptions)) {
    emitEventSubscription(target, node.type, sub, ctx, lines);
  }

  // Raw statements targeting this node
  if (node.rawStatements) {
    for (const raw of node.rawStatements) {
      const trimmed = raw.trim();
      if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
        lines.push(`${bodyIndent}${trimmed}`);
      }
    }
  }

  // Emit nested strip item config blocks immediately after parent strip
  if (node.stripItems && node.stripItems.length > 0) {
    for (const item of node.stripItems) {
      emitStripItemConfigBlock(item, ctx, lines);
    }
  }

  // Emit DataGridView column config blocks immediately after DataGridView
  if (node.columns && node.columns.length > 0) {
    for (const col of node.columns) {
      emitDgvColumnConfigBlock(col, ctx, lines);
    }
  }

  // Emit ListView column header config blocks immediately after ListView
  if (node.listViewColumns && node.listViewColumns.length > 0) {
    for (const col of node.listViewColumns) {
      emitListViewColumnConfigBlock(col, ctx, lines);
    }
  }
}

function emitStripItemConfigBlock(item: StripItemNode, ctx: EmitContext, lines: string[]): void {
  const { prefix, bodyIndent, indent } = ctx;
  const target = `${prefix}${item.name}`;

  lines.push(`${bodyIndent}//`);
  lines.push(`${bodyIndent}// ${item.name}`);
  lines.push(`${bodyIndent}//`);

  if (item.dropDownItems && item.dropDownItems.length > 0) {
    emitAddRange(
      `${target}.DropDownItems.AddRange`,
      'System.Windows.Forms.ToolStripItem',
      item.dropDownItems.map((sub) => `${prefix}${sub.name}`),
      bodyIndent,
      indent,
      lines
    );
  }

  // Merge `item.text` and `item.properties` without duplicating `Text` or `Name`
  const mergedProps: Record<string, PropertyValue> = { ...item.properties };
  if (item.text !== undefined) {
    mergedProps.Text = item.text;
  }
  if (!('Name' in mergedProps)) {
    mergedProps.Name = item.name;
  }

  for (const key of Object.keys(mergedProps).sort()) {
    emitPropertyAssignment(target, key, mergedProps[key], item.type, ctx, lines);
  }

  for (const evName of Object.keys(item.events).sort()) {
    const handler = item.events[evName];
    if (!handler) continue;
    emitEventSubscription(target, item.type, { eventName: evName, handlerName: handler }, ctx, lines);
  }

  if (item.rawStatements) {
    for (const raw of item.rawStatements) {
      const trimmed = raw.trim();
      if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
        lines.push(`${bodyIndent}${trimmed}`);
      }
    }
  }

  if (item.dropDownItems && item.dropDownItems.length > 0) {
    for (const sub of item.dropDownItems) {
      emitStripItemConfigBlock(sub, ctx, lines);
    }
  }
}

function emitDgvColumnConfigBlock(
  col: DataGridViewColumnNode,
  ctx: EmitContext,
  lines: string[]
): void {
  const { prefix, bodyIndent } = ctx;
  const target = `${prefix}${col.name}`;

  lines.push(`${bodyIndent}//`);
  lines.push(`${bodyIndent}// ${col.name}`);
  lines.push(`${bodyIndent}//`);

  const mergedProps: Record<string, PropertyValue> = {
    ...(col.properties ?? {}),
    HeaderText: col.headerText,
    Name: col.name,
  };
  if (col.width !== undefined) mergedProps.Width = col.width;
  if (col.readOnly !== undefined) mergedProps.ReadOnly = col.readOnly;
  if (col.visible !== undefined) mergedProps.Visible = col.visible;

  for (const key of Object.keys(mergedProps).sort()) {
    emitPropertyAssignment(target, key, mergedProps[key], col.columnType, ctx, lines);
  }
}

function emitListViewColumnConfigBlock(
  col: ListViewColumnNode,
  ctx: EmitContext,
  lines: string[]
): void {
  const { prefix, bodyIndent } = ctx;
  const target = `${prefix}${col.name}`;

  lines.push(`${bodyIndent}//`);
  lines.push(`${bodyIndent}// ${col.name}`);
  lines.push(`${bodyIndent}//`);

  const mergedProps: Record<string, PropertyValue> = {
    ...(col.properties ?? {}),
    Text: col.text,
    Width: col.width,
  };
  for (const key of Object.keys(mergedProps).sort()) {
    emitPropertyAssignment(target, key, mergedProps[key], 'ColumnHeader', ctx, lines);
  }

  if (col.rawStatements) {
    for (const raw of col.rawStatements) {
      const trimmed = raw.trim();
      if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
        lines.push(`${bodyIndent}${trimmed}`);
      }
    }
  }
}

function emitFormConfigBlock(doc: DesignDocument, ctx: EmitContext, lines: string[]): void {
  const { prefix, bodyIndent } = ctx;
  const form = doc.form;

  lines.push(`${bodyIndent}//`);
  lines.push(`${bodyIndent}// ${doc.className}`);
  lines.push(`${bodyIndent}//`);

  const propKeys = Object.keys(form.properties).sort();
  const preferClientSize = doc.baseType === 'Form' && 'ClientSize' in form.properties;
  let controlsEmitted = false;

  const emitControls = () => {
    if (controlsEmitted) return;
    controlsEmitted = true;
    for (const child of form.children) {
      if (child.inherited) continue;
      lines.push(`${bodyIndent}${prefix}Controls.Add(${prefix}${child.name});`);
    }
  };

  for (const key of propKeys) {
    if (key === 'Localizable') continue;
    if (
      form.inheritedDefaultProperties &&
      Object.prototype.hasOwnProperty.call(form.inheritedDefaultProperties, key) &&
      JSON.stringify(form.properties[key]) === JSON.stringify(form.inheritedDefaultProperties[key])
    ) {
      continue;
    }
    if (preferClientSize && key === 'Size' && isSizeValue(form.properties.Size)) continue;
    // Emit Controls.Add right in alphabetical order (after ClientSize, before Name/Text)
    if (!controlsEmitted && key > 'Controls') {
      emitControls();
    }
    emitPropertyAssignment(
      prefix.slice(0, -1),
      key,
      form.properties[key],
      form.type,
      ctx,
      lines,
      form.rawPropertyExpressions
    );
  }
  emitControls();

  if (form.dataBindings && form.dataBindings.length > 0) {
    emitDataBindings(prefix.slice(0, -1), form.dataBindings, ctx, lines);
  }

  for (const sub of reconcileEventSubscriptions(form.events, form.eventSubscriptions)) {
    emitEventSubscription(prefix.slice(0, -1), form.type, sub, ctx, lines);
  }

  if (form.rawStatements) {
    for (const raw of form.rawStatements) {
      const trimmed = raw.trim();
      if (trimmed && !isDanglingRawStatement(trimmed, ctx.allValidNames, ctx.existingFields)) {
        lines.push(`${bodyIndent}${trimmed}`);
      }
    }
  }
}

function emitAddRange(
  methodExpr: string,
  arrayType: string,
  items: string[],
  bodyIndent: string,
  indent: string,
  lines: string[]
): void {
  lines.push(`${bodyIndent}${methodExpr}(new ${arrayType}[] {`);
  for (let i = 0; i < items.length; i++) {
    const suffix = i < items.length - 1 ? ',' : '});';
    lines.push(`${bodyIndent}${indent}${items[i]}${suffix}`);
  }
}

function emitDataBindings(
  target: string,
  bindings: DataBindingEntry[],
  ctx: EmitContext,
  lines: string[]
): void {
  const lhs = target ? `${target}.DataBindings.Add` : 'DataBindings.Add';
  for (const entry of bindings) {
    if (
      entry.rawExpression &&
      doesRawDataBindingMatchEntry(entry.rawExpression, entry)
    ) {
      lines.push(`${ctx.bodyIndent}${lhs}(${entry.rawExpression.trim()});`);
      continue;
    }

    const propLit = encodeCSharpString(entry.propertyName);
    const trimmedDs = entry.dataSource.trim();
    const isSimpleIdent =
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedDs) && trimmedDs !== 'this' && trimmedDs !== 'null';
    const dsExpr =
      isSimpleIdent && entry.sourceQualifier !== 'none'
        ? `${ctx.prefix}${trimmedDs}`
        : trimmedDs;
    const memberLit = encodeCSharpString(entry.dataMember);
    const extraSuffix = entry.extraArgs?.trim() ? `, ${entry.extraArgs.trim()}` : '';
    const fmtSuffix = extraSuffix
      ? `, ${entry.formattingEnabled === true ? 'true' : 'false'}${extraSuffix}`
      : entry.formattingEnabled === true
        ? ', true'
        : entry.formattingEnabled === false
          ? ', false'
          : '';
    lines.push(
      `${ctx.bodyIndent}${lhs}(new System.Windows.Forms.Binding(${propLit}, ${dsExpr}, ${memberLit}${fmtSuffix}));`
    );
  }
}

function emitPropertyAssignment(
  target: string,
  propName: string,
  value: PropertyValue,
  controlType: string,
  ctx: EmitContext,
  lines: string[],
  rawPropertyExpressions?: Record<string, string>
): void {
  // Localizable is a design-time-only WinForms designer property and NOT a runtime Form/Control property
  if (propName === 'Localizable') {
    return;
  }
  if (isDanglingControlRefProperty(propName, value, ctx.allValidNames, ctx.existingFields)) {
    return;
  }
  const lhs = target ? `${target}.${propName}` : propName;
  const rawExpr = rawPropertyExpressions?.[propName];
  if (
    rawExpr &&
    doesRawExpressionMatchValue(rawExpr, value, propName, ctx.resourceVarName)
  ) {
    lines.push(`${ctx.bodyIndent}${lhs} = ${rawExpr};`);
    return;
  }
  const rhs = serializePropertyValue(value, propName, controlType, ctx.resourceVarName);
  lines.push(`${ctx.bodyIndent}${lhs} = ${rhs};`);
}

function reconcileEventSubscriptions(
  events: Record<string, string>,
  subscriptions?: EventSubscription[]
): EventSubscription[] {
  if (!subscriptions || subscriptions.length === 0) {
    const out: EventSubscription[] = [];
    for (const evName of Object.keys(events).sort()) {
      const handler = events[evName];
      if (handler) {
        out.push({ eventName: evName, handlerName: handler });
      }
    }
    return out;
  }

  const out: EventSubscription[] = [];
  const seenPrimaryForEvent = new Set<string>();
  const emittedPairs = new Set<string>();

  for (const sub of subscriptions) {
    const uiHandler = events[sub.eventName];
    if (!uiHandler) {
      // Removed via UI
      continue;
    }
    if (!seenPrimaryForEvent.has(sub.eventName)) {
      seenPrimaryForEvent.add(sub.eventName);
      const effectiveHandler = uiHandler;
      const pairKey = `${sub.eventName}\0${effectiveHandler}`;
      if (!emittedPairs.has(pairKey)) {
        emittedPairs.add(pairKey);
        out.push({
          ...sub,
          handlerName: effectiveHandler,
        });
      }
    } else {
      const pairKey = `${sub.eventName}\0${sub.handlerName}`;
      if (!emittedPairs.has(pairKey)) {
        emittedPairs.add(pairKey);
        out.push(sub);
      }
    }
  }

  // Append any brand-new events added in the UI not yet in subscriptions
  for (const evName of Object.keys(events).sort()) {
    const handler = events[evName];
    if (!handler || seenPrimaryForEvent.has(evName)) continue;
    out.push({ eventName: evName, handlerName: handler });
  }

  return out;
}

function emitEventSubscription(
  target: string,
  controlType: string,
  sub: EventSubscription,
  ctx: EmitContext,
  lines: string[]
): void {
  const lhs = target ? `${target}.${sub.eventName}` : sub.eventName;
  const handlerRef = `${ctx.prefix}${sub.handlerName}`;

  const useExplicit =
    ctx.eventHandlerStyleOption === 'explicitDelegate'
      ? true
      : ctx.eventHandlerStyleOption === 'shorthand'
        ? false
        : sub.isExplicit !== undefined
          ? sub.isExplicit
          : !ctx.useShorthandEvents;

  if (!useExplicit) {
    lines.push(`${ctx.bodyIndent}${lhs} += ${handlerRef};`);
  } else {
    const delegateType =
      sub.delegateType || getEventSignature(controlType, sub.eventName).delegateType;
    lines.push(`${ctx.bodyIndent}${lhs} += new ${delegateType}(${handlerRef});`);
  }
}

// ---------------------------------------------------------------------------
// PropertyValue Serialization
// ---------------------------------------------------------------------------

function serializePropertyValue(
  value: PropertyValue,
  propName: string,
  controlType: string,
  resourceVarName = 'resources'
): string {
  if (typeof value === 'string') {
    if (CHAR_PROPERTIES.has(propName)) {
      return encodeCSharpChar(value);
    }
    return encodeCSharpString(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (controlType === 'NumericUpDown' && DECIMAL_PROPERTIES.has(propName)) {
      return Number.isInteger(value) ? `${value}` : `${value}M`;
    }
    return `${value}`;
  }

  if (isPointValue(value)) {
    return `new System.Drawing.Point(${Math.round(value.x)}, ${Math.round(value.y)})`;
  }

  if (isSizeValue(value)) {
    return `new System.Drawing.Size(${Math.round(value.width)}, ${Math.round(value.height)})`;
  }

  if (isSizeFValue(value)) {
    return `new System.Drawing.SizeF(${formatFloatLiteral(value.width)}, ${formatFloatLiteral(value.height)})`;
  }

  if (isPaddingValue(value)) {
    return serializePadding(value);
  }

  if (isColorValue(value)) {
    return serializeColor(value);
  }

  if (isFontValue(value)) {
    return serializeFont(value);
  }

  if (isEnumValue(value)) {
    return serializeEnum(value);
  }

  if (isFlagsValue(value)) {
    return serializeFlags(value);
  }

  if (isResourceValue(value)) {
    return serializeResource(value, resourceVarName);
  }

  if (isRawExpressionValue(value)) {
    return value.expression;
  }

  return String(value);
}

function encodeCSharpChar(value: string): string {
  if (!value || value.length === 0) return "'\\0'";
  const ch = value[0];
  if (ch === '\\') return "'\\\\'";
  if (ch === "'") return "'\\''";
  if (ch === '\0') return "'\\0'";
  if (ch === '\n') return "'\\n'";
  if (ch === '\r') return "'\\r'";
  if (ch === '\t') return "'\\t'";
  return `'${ch}'`;
}

function formatFloatLiteral(n: number): string {
  return `${n}F`;
}

function serializePadding(pad: PaddingValue): string {
  if (
    pad.all !== undefined &&
    pad.left === pad.all &&
    pad.top === pad.all &&
    pad.right === pad.all &&
    pad.bottom === pad.all
  ) {
    return `new System.Windows.Forms.Padding(${pad.all})`;
  }
  if (pad.left === pad.top && pad.top === pad.right && pad.right === pad.bottom) {
    return `new System.Windows.Forms.Padding(${pad.left})`;
  }
  return `new System.Windows.Forms.Padding(${pad.left}, ${pad.top}, ${pad.right}, ${pad.bottom})`;
}

function serializeColor(color: ColorValue): string {
  if (color.isSystem) {
    return `System.Drawing.SystemColors.${color.value}`;
  }
  if (color.isNamed) {
    return `System.Drawing.Color.${color.value}`;
  }
  if (color.r !== undefined && color.g !== undefined && color.b !== undefined) {
    if (color.a !== undefined && color.a < 255) {
      return `System.Drawing.Color.FromArgb(${color.a}, ${color.r}, ${color.g}, ${color.b})`;
    }
    return `System.Drawing.Color.FromArgb(${color.r}, ${color.g}, ${color.b})`;
  }
  // Parse hex string like "#2563EB" if r/g/b weren't populated
  const hexMatch = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(color.value);
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16);
    const g = parseInt(hexMatch[1].slice(2, 4), 16);
    const b = parseInt(hexMatch[1].slice(4, 6), 16);
    if (hexMatch[2]) {
      const a = parseInt(hexMatch[2], 16);
      if (a < 255) {
        return `System.Drawing.Color.FromArgb(${a}, ${r}, ${g}, ${b})`;
      }
    }
    return `System.Drawing.Color.FromArgb(${r}, ${g}, ${b})`;
  }
  return `System.Drawing.Color.${color.value}`;
}

function serializeFont(font: FontValue): string {
  const family = encodeCSharpString(font.family);
  const size = formatFloatLiteral(font.size);
  const styles: string[] = [];
  if (font.bold) styles.push('System.Drawing.FontStyle.Bold');
  if (font.italic) styles.push('System.Drawing.FontStyle.Italic');
  if (font.underline) styles.push('System.Drawing.FontStyle.Underline');
  if (font.strikeout) styles.push('System.Drawing.FontStyle.Strikeout');

  const styleExpr =
    styles.length === 0
      ? 'System.Drawing.FontStyle.Regular'
      : styles.length === 1
        ? styles[0]
        : `((System.Drawing.FontStyle)(${styles.join(' | ')}))`;

  const unit = font.unit ?? 'Point';

  if (font.gdiCharSet !== undefined) {
    return `new System.Drawing.Font(${family}, ${size}, ${styleExpr}, System.Drawing.GraphicsUnit.${unit}, ((byte)(${font.gdiCharSet})))`;
  }
  if (styles.length === 0 && unit === 'Point') {
    return `new System.Drawing.Font(${family}, ${size}, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point)`;
  }
  return `new System.Drawing.Font(${family}, ${size}, ${styleExpr}, System.Drawing.GraphicsUnit.${unit})`;
}

function resolveEnumFullType(typeName: string): string {
  if (typeName.includes('.')) return typeName;
  if (WINFORMS_ENUMS[typeName]) return WINFORMS_ENUMS[typeName].fullTypeName;
  if (EXTRA_ENUM_FULL_NAMES[typeName]) return EXTRA_ENUM_FULL_NAMES[typeName];
  return `System.Windows.Forms.${typeName}`;
}

function serializeEnum(en: EnumValue): string {
  const fullType = resolveEnumFullType(en.typeName);
  return `${fullType}.${en.value}`;
}

function serializeFlags(fl: FlagsValue): string {
  const fullType = resolveEnumFullType(fl.typeName);
  if (fl.values.length === 0) {
    return `${fullType}.None`;
  }
  if (fl.values.length === 1) {
    return `${fullType}.${fl.values[0]}`;
  }
  const combined = fl.values.map((v) => `${fullType}.${v}`).join(' | ');
  return `((${fullType})(${combined}))`;
}

function serializeResource(res: ResourceValue, resourceVarName = 'resources'): string {
  if (res.rawExpression) {
    return res.rawExpression;
  }
  const nameLit = encodeCSharpString(res.resourceName);
  if (res.castType) {
    return `((${res.castType})(${resourceVarName}.GetObject(${nameLit})))`;
  }
  switch (res.resourceType) {
    case 'Image':
      return `((System.Drawing.Image)(${resourceVarName}.GetObject(${nameLit})))`;
    case 'Icon':
      return `((System.Drawing.Icon)(${resourceVarName}.GetObject(${nameLit})))`;
    case 'String':
      return `${resourceVarName}.GetString(${nameLit})`;
    default:
      return `${resourceVarName}.GetObject(${nameLit})`;
  }
}

function serializeTableTrackStyle(
  styleClass: 'ColumnStyle' | 'RowStyle',
  style: TableTrackStyle
): string {
  if (style.sizeType === 'AutoSize') {
    return `new System.Windows.Forms.${styleClass}(System.Windows.Forms.SizeType.AutoSize)`;
  }
  return `new System.Windows.Forms.${styleClass}(System.Windows.Forms.SizeType.${style.sizeType}, ${formatFloatLiteral(style.value)})`;
}

// ---------------------------------------------------------------------------
// Tree Collection & Helper Utilities
// ---------------------------------------------------------------------------

function collectVisualNodesPreOrder(children: DesignNode[]): DesignNode[] {
  const result: DesignNode[] = [];
  const visit = (nodes: DesignNode[]) => {
    for (const n of nodes) {
      if (n.inherited) continue;
      result.push(n);
      if (n.children.length > 0) {
        visit(n.children);
      }
    }
  };
  visit(children);
  return result;
}

function extractShortTypeName(typeName: string): string {
  const cleaned = typeName.replace(/^global::/, '').replace(/\?$/, '');
  const dotIdx = cleaned.lastIndexOf('.');
  return dotIdx >= 0 ? cleaned.slice(dotIdx + 1) : cleaned;
}

function collectAllFields(doc: DesignDocument): {
  fields: FlattenedField[];
  inheritedNames: Set<string>;
} {
  const fields: FlattenedField[] = [];
  const seenNames = new Set<string>();
  const inheritedNames = new Set<string>();
  const existing = doc.metadata.existingFieldDeclarations;

  const recordInheritedNames = (node: DesignNode): void => {
    inheritedNames.add(node.name);
    const recordStrip = (items: StripItemNode[] | undefined) => {
      if (!items) return;
      for (const item of items) {
        inheritedNames.add(item.name);
        recordStrip(item.dropDownItems);
      }
    };
    recordStrip(node.stripItems);
    if (node.columns) {
      for (const col of node.columns) inheritedNames.add(col.name);
    }
    if (node.listViewColumns) {
      for (const col of node.listViewColumns) inheritedNames.add(col.name);
    }
    for (const child of node.children) {
      recordInheritedNames(child);
    }
  };

  // First pass: register all inherited names so derived controls cannot collide with them
  const scanForInherited = (nodes: DesignNode[]): void => {
    for (const n of nodes) {
      if (n.inherited) {
        recordInheritedNames(n);
      } else {
        scanForInherited(n.children);
      }
    }
  };
  scanForInherited(doc.form.children);
  for (const comp of doc.components) {
    if (comp.inherited) {
      recordInheritedNames(comp);
    }
  }

  const pushField = (field: FlattenedField): void => {
    if (seenNames.has(field.name) || inheritedNames.has(field.name)) {
      throw new Error(`Duplicate control/field name detected: "${field.name}"`);
    }
    seenNames.add(field.name);
    fields.push(field);
  };

  const pushStripItems = (items: StripItemNode[] | undefined) => {
    if (!items) return;
    for (const item of items) {
      const ex = existing[item.name];
      const fieldTypeName = ex?.typeName ?? `System.Windows.Forms.${item.type}`;
      pushField({
        name: item.name,
        shortType: item.type,
        instantiationType: fieldTypeName.replace(/\?$/, ''),
        fieldTypeName,
        modifier: ex?.modifier ?? 'private',
      });
      pushStripItems(item.dropDownItems);
    }
  };

  const pushNode = (node: DesignNode) => {
    if (node.inherited) return;
    const def = getControlDefinition(node.type);
    const ex = existing[node.name];
    const instantiationType =
      node.fullTypeName?.replace(/\?$/, '') ||
      ex?.typeName?.replace(/\?$/, '') ||
      def?.fullTypeName ||
      `System.Windows.Forms.${node.type}`;

    const fieldTypeName = ex?.typeName ?? instantiationType;
    const modifier = node.fieldModifier ?? ex?.modifier ?? 'private';
    const constructorArgs =
      node.constructorArgs !== undefined
        ? node.constructorArgs
        : def?.takesComponentsArg
          ? 'components'
          : undefined;

    pushField({
      name: node.name,
      shortType: node.type,
      instantiationType,
      fieldTypeName,
      modifier,
      constructorArgs,
    });

    // Strip items immediately after their strip (matches Visual Studio)
    pushStripItems(node.stripItems);

    // DataGridView columns immediately after DataGridView
    if (node.columns) {
      for (const col of node.columns) {
        const colEx = existing[col.name];
        const existingShort = colEx ? extractShortTypeName(colEx.typeName) : undefined;
        const typeChanged =
          Boolean(col.explicitTypeChanged) ||
          (existingShort !== undefined && existingShort !== col.columnType);
        const colFieldType = typeChanged
          ? `System.Windows.Forms.${col.columnType}`
          : (colEx?.typeName ?? `System.Windows.Forms.${col.columnType}`);
        pushField({
          name: col.name,
          shortType: col.columnType,
          instantiationType: colFieldType.replace(/\?$/, ''),
          fieldTypeName: colFieldType,
          modifier: colEx?.modifier ?? 'private',
          ...(typeChanged ? { explicitTypeChanged: true } : {}),
        });
      }
    }

    // ListView columns immediately after ListView
    if (node.listViewColumns) {
      for (const col of node.listViewColumns) {
        const colEx = existing[col.name];
        const lvFieldType = colEx?.typeName ?? 'System.Windows.Forms.ColumnHeader';
        pushField({
          name: col.name,
          shortType: 'ColumnHeader',
          instantiationType: lvFieldType.replace(/\?$/, ''),
          fieldTypeName: lvFieldType,
          modifier: colEx?.modifier ?? 'private',
        });
      }
    }

    // Visual children recursively
    for (const child of node.children) {
      pushNode(child);
    }
  };

  for (const child of doc.form.children) {
    pushNode(child);
  }
  for (const comp of doc.components) {
    pushNode(comp);
  }

  return { fields, inheritedNames };
}

function resolveConstructorArgs(args: string | undefined, prefix: string): string {
  if (!args) return '';
  const trimmed = args.trim();
  if (trimmed === 'components' || trimmed === 'this.components') {
    return `${prefix}components`;
  }
  return trimmed;
}

function shouldSuspendNodeLayout(node: DesignNode): boolean {
  const def = getControlDefinition(node.type);
  if (node.type === 'SplitContainer') return true;
  if (node.type === 'ContextMenuStrip') {
    return Boolean(node.stripItems && node.stripItems.length > 0);
  }
  if (def?.supportsLayoutSuspension) {
    return (
      node.children.length > 0 ||
      Boolean(node.stripItems && node.stripItems.length > 0) ||
      def.isContainer
    );
  }
  return node.children.length > 0;
}

function shouldPerformNodeLayout(node: DesignNode): boolean {
  if (
    node.type === 'MenuStrip' ||
    node.type === 'ToolStrip' ||
    node.type === 'StatusStrip' ||
    node.type === 'BindingNavigator'
  ) {
    return true;
  }
  // PerformLayout on containers that hold AutoSize controls (e.g. Label, CheckBox, RadioButton)
  return node.children.some(
    (c) =>
      c.properties.AutoSize === true ||
      c.type === 'Label' ||
      c.type === 'CheckBox' ||
      c.type === 'RadioButton'
  );
}

function hasAnyResourceValue(doc: DesignDocument): boolean {
  const checkProps = (props: Record<string, PropertyValue>): boolean =>
    Object.values(props).some((v) => isResourceValue(v));

  const checkStripItems = (items: StripItemNode[] | undefined): boolean => {
    if (!items) return false;
    return items.some((it) => checkProps(it.properties) || checkStripItems(it.dropDownItems));
  };

  const checkNode = (node: DesignNode): boolean => {
    if (node.inherited) return false;
    if (checkProps(node.properties)) return true;
    if (checkStripItems(node.stripItems)) return true;
    if (node.columns?.some((c) => c.properties && checkProps(c.properties))) return true;
    if (node.listViewColumns?.some((c) => c.properties && checkProps(c.properties))) return true;
    return node.children.some(checkNode);
  };

  return checkNode(doc.form) || doc.components.some(checkNode);
}

function anyRawReferencesResources(doc: DesignDocument): boolean {
  const resVar = doc.metadata.resourceVarName || 'resources';
  const resRe = new RegExp(`\\b(?:${escapeRegExp(resVar)}|resources)\\.`);
  const checkRaw = (list?: string[]): boolean =>
    Boolean(list?.some((s) => resRe.test(s)));

  if (checkRaw(doc.metadata.unhandledTopLevelStatements)) return true;
  if (checkRaw(doc.metadata.unhandledTrailingStatements)) return true;

  const checkStripItems = (items?: StripItemNode[]): boolean => {
    if (!items) return false;
    return items.some((it) => checkRaw(it.rawStatements) || checkStripItems(it.dropDownItems));
  };

  const checkNode = (node: DesignNode): boolean => {
    if (node.inherited) return false;
    return (
      checkRaw(node.rawStatements) ||
      checkStripItems(node.stripItems) ||
      Boolean(node.listViewColumns?.some((c) => checkRaw(c.rawStatements))) ||
      node.children.some(checkNode)
    );
  };

  return checkNode(doc.form) || doc.components.some(checkNode);
}

function detectLineIndent(source: string, lineStart: number): string {
  let i = lineStart;
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) {
    i++;
  }
  return source.slice(lineStart, i);
}

function buildFullDesignerFile(
  doc: DesignDocument,
  initMethodText: string,
  fieldsLines: string[],
  eol: string,
  indent: string
): string {
  const lines: string[] = [];

  if (doc.metadata.usingDirectives.length > 0) {
    for (const u of doc.metadata.usingDirectives) {
      lines.push(u);
    }
    lines.push('');
  }

  const classIndent = !doc.namespaceName || doc.fileScopedNamespace ? '' : indent;
  const m = classIndent + indent;
  const b = m + indent;
  const b2 = b + indent;

  if (doc.namespaceName) {
    if (doc.fileScopedNamespace) {
      lines.push(`namespace ${doc.namespaceName};`, '');
    } else {
      lines.push(`namespace ${doc.namespaceName}`, '{');
    }
  }

  lines.push(
    `${classIndent}partial class ${doc.className}`,
    `${classIndent}{`,
    `${m}/// <summary>`,
    `${m}///  Required designer variable.`,
    `${m}/// </summary>`,
    `${m}private System.ComponentModel.IContainer? components = null;`,
    '',
    `${m}/// <summary>`,
    `${m}///  Clean up any resources being used.`,
    `${m}/// </summary>`,
    `${m}/// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>`,
    `${m}protected override void Dispose(bool disposing)`,
    `${m}{`,
    `${b}if (disposing && (components != null))`,
    `${b}{`,
    `${b2}components.Dispose();`,
    `${b}}`,
    `${b}base.Dispose(disposing);`,
    `${m}}`,
    '',
    `${m}#region Windows Form Designer generated code`,
    '',
    `${m}/// <summary>`,
    `${m}///  Required method for Designer support - do not modify`,
    `${m}///  the contents of this method with the code editor.`,
    `${m}/// </summary>`,
    initMethodText,
    '',
    `${m}#endregion`
  );

  if (fieldsLines.length > 0) {
    lines.push('');
    lines.push(...fieldsLines);
  }

  lines.push(`${classIndent}}`);

  if (doc.namespaceName && !doc.fileScopedNamespace) {
    lines.push('}');
  }

  return lines.join(eol) + eol;
}

// ---------------------------------------------------------------------------
// TreeNode Planning, Dangling Reference Protection & User Field Preservation
// ---------------------------------------------------------------------------

function buildTreeNodeEmitPlan(
  visualNodes: DesignNode[],
  bodyIndent: string,
  indent: string
): TreeNodeEmitPlan {
  const declLines: string[] = [];
  const perControl = new Map<string, { configLines: string[]; rootVarNames: string[] }>();
  let counter = 1;

  for (const node of visualNodes) {
    if (!node.treeNodes || node.treeNodes.length === 0) continue;
    const configLines: string[] = [];
    const rootVarNames: string[] = [];

    const emitItem = (item: TreeNodeItem): string => {
      const childVarNames: string[] = [];
      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          childVarNames.push(emitItem(child));
        }
      }

      const varName = `treeNode${counter++}`;
      const textLit = encodeCSharpString(item.text);
      if (childVarNames.length > 0) {
        declLines.push(
          `${bodyIndent}System.Windows.Forms.TreeNode ${varName} = new System.Windows.Forms.TreeNode(${textLit}, new System.Windows.Forms.TreeNode[] {`
        );
        for (let i = 0; i < childVarNames.length; i++) {
          const suffix = i < childVarNames.length - 1 ? ',' : '});';
          declLines.push(`${bodyIndent}${indent}${childVarNames[i]}${suffix}`);
        }
      } else {
        declLines.push(
          `${bodyIndent}System.Windows.Forms.TreeNode ${varName} = new System.Windows.Forms.TreeNode(${textLit});`
        );
      }

      if (item.name) {
        configLines.push(`${bodyIndent}${varName}.Name = ${encodeCSharpString(item.name)};`);
      }
      configLines.push(`${bodyIndent}${varName}.Text = ${textLit};`);
      return varName;
    };

    for (const rootItem of node.treeNodes) {
      rootVarNames.push(emitItem(rootItem));
    }

    perControl.set(node.name, { configLines, rootVarNames });
  }

  return { declLines, perControl };
}

function isDanglingControlRefProperty(
  propName: string,
  value: PropertyValue,
  allValidNames: Set<string>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): boolean {
  const leafProp = propName.includes('.') ? propName.slice(propName.lastIndexOf('.') + 1) : propName;
  if (!CONTROL_REFERENCE_PROPERTIES.has(leafProp)) return false;
  if (!isRawExpressionValue(value)) return false;

  // Strip outer parens and optional C-style cast like `((System.Windows.Forms.IButtonControl)(this.btnOk))`
  let expr = value.expression.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (expr.startsWith('(') && expr.endsWith(')')) {
      expr = expr.slice(1, -1).trim();
      changed = true;
      continue;
    }
    const castMatch = /^\([A-Za-z_][\w.<>?:]*\)\s*([\s\S]+)$/.exec(expr);
    if (castMatch) {
      expr = castMatch[1].trim();
      changed = true;
    }
  }

  const refMatch = /^(?:this\.)?([A-Za-z_][A-Za-z0-9_]*)$/.exec(expr);
  if (!refMatch) return false;
  const refName = refMatch[1];
  if (refName === 'this' || refName === 'null') return false;
  return refName in existingFields && !allValidNames.has(refName);
}

function isDanglingRawStatement(
  rawStmt: string,
  allValidNames: Set<string>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): boolean {
  // Check calls like `this.toolTip1.SetToolTip(this.deletedBtn, "...");` or `this.Controls.SetChildIndex(this.deletedBtn, 0);`
  const callMatch =
    /^(?:this\.)?[A-Za-z_][\w.]*\(\s*(?:this\.)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|\))/.exec(
      rawStmt.trim()
    );
  if (callMatch) {
    const firstArg = callMatch[1];
    if (
      firstArg !== 'this' &&
      firstArg !== 'null' &&
      firstArg !== 'true' &&
      firstArg !== 'false' &&
      firstArg in existingFields &&
      !allValidNames.has(firstArg)
    ) {
      return true;
    }
  }
  return false;
}

const WINFORMS_FIELD_TYPE_PREFIXES = [
  'System.Windows.Forms.',
  'System.Drawing.Printing.',
  'System.ComponentModel.BackgroundWorker',
  'System.IO.FileSystemWatcher',
];

const EXTRA_DESIGNER_FIELD_SHORT_TYPES = new Set<string>([
  'ToolStripMenuItem',
  'ToolStripButton',
  'ToolStripLabel',
  'ToolStripSeparator',
  'ToolStripTextBox',
  'ToolStripComboBox',
  'ToolStripDropDownButton',
  'ToolStripSplitButton',
  'ToolStripProgressBar',
  'ToolStripStatusLabel',
  'DataGridViewTextBoxColumn',
  'DataGridViewButtonColumn',
  'DataGridViewCheckBoxColumn',
  'DataGridViewComboBoxColumn',
  'DataGridViewImageColumn',
  'DataGridViewLinkColumn',
  'ColumnHeader',
]);

function isDesignerFieldType(typeName: string): boolean {
  const cleaned = typeName.replace(/^global::/, '').replace(/\?$/, '');
  if (WINFORMS_FIELD_TYPE_PREFIXES.some((p) => cleaned.startsWith(p))) return true;
  const dotIdx = cleaned.lastIndexOf('.');
  const short = dotIdx >= 0 ? cleaned.slice(dotIdx + 1) : cleaned;
  return Boolean(getControlDefinition(short)) || EXTRA_DESIGNER_FIELD_SHORT_TYPES.has(short);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFieldUsedInInit(fieldName: string, originalInitText: string): boolean {
  const escaped = escapeRegExp(fieldName);
  const assignRe = new RegExp(`(?:^|[^\\w.])(?:this\\.)?${escaped}\\s*=\\s*new\\b`);
  if (assignRe.test(originalInitText)) return true;
  const memberRe = new RegExp(`(?:^|[^\\w.])(?:this\\.)?${escaped}\\.[A-Za-z_]`);
  return memberRe.test(originalInitText);
}

function advancePastTrailingNewline(source: string, offset: number): number {
  let i = offset;
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) {
    i++;
  }
  if (source.startsWith('\r\n', i)) return i + 2;
  if (source[i] === '\n' || source[i] === '\r') return i + 1;
  return offset;
}

/**
 * Surgically removes only the named declarators from a multi-declarator C# field statement
 * (e.g. `    private Button button1, helper;` minus `button1` -> `    private Button helper;`),
 * preserving exact indentation, attributes, modifiers, type spelling, and surviving sibling initializers.
 */
function removeDeclaratorsFromMultiFieldStatement(
  stmtText: string,
  deletedNames: Set<string>
): string | null {
  const tokens = tokenizeCSharp(stmtText).filter((t) => t.kind !== 'eof');
  if (tokens.length === 0) return null;
  const semiIdx = tokens.length - 1;
  if (tokens[semiIdx].text !== ';') return null;

  // Skip leading attributes `[...]` and field modifiers
  let idx = 0;
  while (idx < semiIdx) {
    if (tokens[idx].kind === 'punctuation' && tokens[idx].text === '[') {
      let depth = 0;
      while (idx < semiIdx) {
        if (tokens[idx].text === '[') depth++;
        else if (tokens[idx].text === ']') {
          depth--;
          if (depth === 0) {
            idx++;
            break;
          }
        }
        idx++;
      }
      continue;
    }
    if (
      tokens[idx].kind === 'keyword' &&
      (tokens[idx].text === 'private' ||
        tokens[idx].text === 'public' ||
        tokens[idx].text === 'protected' ||
        tokens[idx].text === 'internal' ||
        tokens[idx].text === 'static' ||
        tokens[idx].text === 'readonly' ||
        tokens[idx].text === 'new' ||
        tokens[idx].text === 'volatile' ||
        tokens[idx].text === 'const')
    ) {
      idx++;
      continue;
    }
    break;
  }

  const declTokens = tokens.slice(idx, semiIdx);
  const chunks: typeof declTokens[] = [];
  let cur: typeof declTokens = [];
  let angle = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;

  for (const t of declTokens) {
    if (t.text === '<') angle++;
    else if (t.text === '>' && angle > 0) angle--;
    else if (t.text === '(') paren++;
    else if (t.text === ')' && paren > 0) paren--;
    else if (t.text === '{') brace++;
    else if (t.text === '}' && brace > 0) brace--;
    else if (t.text === '[') bracket++;
    else if (t.text === ']' && bracket > 0) bracket--;
    else if (t.text === ',' && angle === 0 && paren === 0 && brace === 0 && bracket === 0) {
      if (cur.length > 0) chunks.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length > 0) chunks.push(cur);
  if (chunks.length < 2) return null;

  // Locate first declarator name token in chunks[0]
  const first = chunks[0];
  let firstEqIdx = first.length;
  for (let k = 0; k < first.length; k++) {
    if (first[k].kind === 'operator' && first[k].text === '=') {
      firstEqIdx = k;
      break;
    }
  }
  if (firstEqIdx < 2 || first[firstEqIdx - 1].kind !== 'identifier') return null;

  const firstNameTok = first[firstEqIdx - 1];
  const prefixText = stmtText.slice(0, firstNameTok.start);
  const survivingDeclarators: string[] = [];

  if (!deletedNames.has(firstNameTok.text)) {
    survivingDeclarators.push(stmtText.slice(firstNameTok.start, first[first.length - 1].end));
  }

  for (let c = 1; c < chunks.length; c++) {
    const ch = chunks[c];
    if (ch.length === 0) continue;
    const nameTok = ch[0];
    if (nameTok.kind === 'identifier' && deletedNames.has(nameTok.text)) {
      continue;
    }
    survivingDeclarators.push(stmtText.slice(ch[0].start, ch[ch.length - 1].end));
  }

  if (survivingDeclarators.length === 0) return '';
  return `${prefixText}${survivingDeclarators.join(', ')};`;
}

function extractPreservedUserFieldLines(
  original: string,
  fieldsRange: { start: number; end: number },
  initRange: { start: number; end: number },
  allValidNames: Set<string>
): string[] {
  const regionText = original.slice(fieldsRange.start, fieldsRange.end);
  if (!regionText.trim()) return [];

  const originalInitText = original.slice(initRange.start, initRange.end);
  const tokens = tokenizeCSharp(regionText);
  const stmts = splitStatements(tokens, regionText);
  const preserved: string[] = [];

  for (const stmt of stmts) {
    if (stmt.tokens.length === 0) continue;
    const body = stmt.tokens[stmt.tokens.length - 1].text === ';'
      ? stmt.tokens.slice(0, -1)
      : stmt.tokens;
    if (body.length < 2) continue;

    // Skip field modifiers
    let idx = 0;
    while (
      idx < body.length &&
      body[idx].kind === 'keyword' &&
      (body[idx].text === 'private' ||
        body[idx].text === 'public' ||
        body[idx].text === 'protected' ||
        body[idx].text === 'internal' ||
        body[idx].text === 'static' ||
        body[idx].text === 'readonly' ||
        body[idx].text === 'new' ||
        body[idx].text === 'volatile' ||
        body[idx].text === 'const')
    ) {
      idx++;
    }

    const declTokens = body.slice(idx);
    // Split multi-declarators on top-level commas
    const declarators: string[] = [];
    let typeName = '';
    let angle = 0;
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    const chunks: typeof declTokens[] = [];
    let cur: typeof declTokens = [];
    for (const t of declTokens) {
      if (t.text === '<') angle++;
      else if (t.text === '>' && angle > 0) angle--;
      else if (t.text === '(') paren++;
      else if (t.text === ')' && paren > 0) paren--;
      else if (t.text === '{') brace++;
      else if (t.text === '}' && brace > 0) brace--;
      else if (t.text === '[') bracket++;
      else if (t.text === ']' && bracket > 0) bracket--;
      else if (t.text === ',' && angle === 0 && paren === 0 && brace === 0 && bracket === 0) {
        if (cur.length > 0) chunks.push(cur);
        cur = [];
        continue;
      }
      cur.push(t);
    }
    if (cur.length > 0) chunks.push(cur);

    if (chunks.length > 0) {
      const first = chunks[0];
      let eqPos = first.length;
      for (let k = 0; k < first.length; k++) {
        if (first[k].kind === 'operator' && first[k].text === '=') {
          eqPos = k;
          break;
        }
      }
      if (eqPos >= 2 && first[eqPos - 1].kind === 'identifier') {
        typeName = regionText
          .slice(first[0].start, first[eqPos - 2].end)
          .replace(/\s+/g, '');
        declarators.push(first[eqPos - 1].text);
        for (let c = 1; c < chunks.length; c++) {
          if (chunks[c].length > 0 && chunks[c][0].kind === 'identifier') {
            declarators.push(chunks[c][0].text);
          }
        }
      }
    }

    // Determine if this declaration belongs to the designer or is a custom user field
    const isDesignerDecl =
      declarators.length > 0 &&
      declarators.some((name) => {
        if (name === 'components') return false;
        if (allValidNames.has(name)) return true;
        if (isDesignerFieldType(typeName)) return true;
        const initAssignRe = new RegExp(`(?:^|[^\\w.])${escapeRegExp(name)}\\s*=\\s*new\\b`);
        return initAssignRe.test(originalInitText);
      });

    if (!isDesignerDecl) {
      // Capture full line from line-start inside regionText through statement end
      let lineStart = stmt.start;
      while (lineStart > 0 && regionText[lineStart - 1] !== '\n' && regionText[lineStart - 1] !== '\r') {
        lineStart--;
      }
      preserved.push(regionText.slice(lineStart, stmt.end));
    }
  }

  return preserved;
}
