// Pure-TypeScript WinForms .Designer.cs Parser
// Parses Visual Studio 2019/2022/2026 & .NET Framework 4.x / .NET 6-10 .Designer.cs files into DesignDocument.

import { getControlDefinition, WINFORMS_ENUMS } from '../shared/catalog';
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
  type ColorValue,
  type DataBindingEntry,
  type DataGridViewColumnNode,
  type DesignDocument,
  type DesignNode,
  type DocumentStyleMetadata,
  type EnumValue,
  type EventSubscription,
  type FieldDeclarationSpan,
  type FlagsValue,
  type FontValue,
  type ListViewColumnNode,
  type PaddingValue,
  type ParseDiagnostic,
  type PointValue,
  type PropertyValue,
  type ResourceMap,
  type ResourceValue,
  type SizeFValue,
  type SizeValue,
  type StripItemNode,
  type TableTrackStyle,
  type TextRange,
  type TreeNodeItem,
} from '../shared/model';
import {
  findMatchingBrace,
  findMatchingDelimiter,
  splitStatements,
  tokenizeCSharp,
  type StatementSlice,
  type Token,
} from './lexer';
import { parseResx } from './resx';
import { decodeCSharpString, encodeCSharpString, isCSharpStringLiteral } from './stringLiteral';

export interface ParseDesignerOptions {
  baseType?: 'Form' | 'UserControl';
  customBaseClass?: string;
  resxXml?: string;
}

const STRIP_ITEM_TYPES = new Set<StripItemNode['type']>([
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
]);

const DGV_COLUMN_TYPES = new Set<DataGridViewColumnNode['columnType']>([
  'DataGridViewTextBoxColumn',
  'DataGridViewButtonColumn',
  'DataGridViewCheckBoxColumn',
  'DataGridViewComboBoxColumn',
  'DataGridViewImageColumn',
  'DataGridViewLinkColumn',
]);

const EXTRA_KNOWN_ENUMS = new Set<string>([
  'Cursors',
  'FontStyle',
  'GraphicsUnit',
  'Keys',
  'SizeType',
  'ToolStripItemDisplayStyle',
  'ToolStripItemAlignment',
  'ToolStripItemOverflow',
  'ToolStripLayoutStyle',
  'ToolStripStatusLabelBorderSides',
  'Border3DSide',
  'Border3DStyle',
  'DataGridViewTriState',
  'DataGridViewColumnSortMode',
  'DataGridViewAutoSizeColumnMode',
  'DataGridViewAutoSizeRowsMode',
  'DataGridViewRowHeadersWidthSizeMode',
  'DataGridViewEditMode',
  'DataGridViewCellBorderStyle',
  'DataGridViewHeaderBorderStyle',
  'DataGridViewClipboardCopyMode',
  'DataGridViewContentAlignment',
  'ColumnHeaderStyle',
  'ItemActivation',
  'Shortcut',
  'ArrowDirection',
  'AutoCompleteMode',
  'AutoCompleteSource',
  'CloseReason',
  'ColorDepth',
  'ColumnStyle',
  'ErrorBlinkStyle',
  'ErrorIconAlignment',
  'ImeMode',
  'InsertKeyMode',
  'LinkBehavior',
  'MaskFormat',
  'RichTextBoxFinds',
  'TabDrawMode',
  'TabSizeMode',
  'TextFormatFlags',
  'ToolTipIcon',
]);

const CHAR_PROPERTIES = new Set<string>(['PasswordChar', 'PromptChar']);

const INTEGER_CAST_TYPES = new Set<string>([
  'byte',
  'sbyte',
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
  'Byte',
  'SByte',
  'Int16',
  'UInt16',
  'Int32',
  'UInt32',
  'Int64',
  'UInt64',
]);

const NUMERIC_CAST_TYPES = new Set<string>([
  ...INTEGER_CAST_TYPES,
  'float',
  'double',
  'decimal',
  'Single',
  'Double',
  'Decimal',
]);

const FIELD_MODIFIER_KEYWORDS = new Set<string>([
  'private',
  'public',
  'protected',
  'internal',
  'static',
  'readonly',
  'new',
  'volatile',
]);

const VALUE_CONSTRUCTOR_TYPES = new Set<string>([
  'Point',
  'PointF',
  'Size',
  'SizeF',
  'Padding',
  'Font',
  'Rectangle',
  'RectangleF',
  'decimal',
  'Decimal',
  'Uri',
]);

interface ChildRef {
  name: string;
  panelSlot?: 'Panel1' | 'Panel2';
  column?: number;
  row?: number;
  explicitTableCell?: boolean;
}

interface ParsedTreeNode {
  varName: string;
  text: string;
  name?: string;
  childRefs: Array<string | TreeNodeItem>;
  sourceStatements: string[];
  attached: boolean;
}

interface ParsedInstance {
  name: string;
  type: string;
  fullTypeName: string;
  constructorArgs?: string;
  properties: Record<string, PropertyValue>;
  rawPropertyExpressions: Record<string, string>;
  events: Record<string, string>;
  eventSubscriptions: EventSubscription[];
  rawStatements: string[];
  dataBindings: DataBindingEntry[];
  items?: string[];
  treeNodeRefs: Array<string | TreeNodeItem>;
  stripItemRefs: string[];
  columnRefs: string[];
  listViewColumnRefs: string[];
  childRefs: ChildRef[];
  columnSpans: Map<string, number>;
  rowSpans: Map<string, number>;
  columnStyles: TableTrackStyle[];
  rowStyles: TableTrackStyle[];
  usedSupportInitialize: boolean;
}

interface FieldDeclInfo {
  name: string;
  modifier: string;
  typeName: string;
  rawLine: string;
  lineStart: number;
  end: number;
  afterEndRegion: boolean;
  isMultiDeclarator: boolean;
  hasAttributesOrInitializer: boolean;
}

/**
 * Parses a WinForms `.Designer.cs` source string into a structured `DesignDocument`.
 * Non-destructive: unrecognized properties, controls, and statements are preserved verbatim.
 */
export function parseDesignerCs(source: string, options?: ParseDesignerOptions): DesignDocument {
  const diagnostics: ParseDiagnostic[] = [];
  const resources: ResourceMap = options?.resxXml ? parseResx(options.resxXml) : {};
  const eol: '\r\n' | '\n' = source.includes('\r\n') ? '\r\n' : '\n';

  const tokens = tokenizeCSharp(source);

  // 1. Parse file structure: using directives, namespace, class, InitializeComponent, fields
  const usingDirectives: string[] = [];
  let namespaceName = '';
  let fileScopedNamespace = false;
  let className = '';
  let detectedBaseTypeFromClass: 'Form' | 'UserControl' | undefined;
  let detectedCustomBaseClass: string | undefined;
  let classOpenBraceIndex = -1;
  let classCloseBraceIndex = -1;
  let hasUnmatchedClassBrace = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'eof') break;

    // Top-level using directive (before or inside namespace, outside class)
    if (
      classOpenBraceIndex < 0 &&
      ((tok.kind === 'keyword' && tok.text === 'using') ||
        (tok.kind === 'keyword' &&
          tok.text === 'global' &&
          i + 1 < tokens.length &&
          tokens[i + 1].text === 'using'))
    ) {
      let j = i;
      while (j < tokens.length && tokens[j].text !== ';' && tokens[j].kind !== 'eof') {
        j++;
      }
      if (j < tokens.length && tokens[j].text === ';') {
        usingDirectives.push(source.slice(tok.start, tokens[j].end).trim());
        i = j;
        continue;
      }
    }

    if (tok.kind === 'keyword' && tok.text === 'namespace' && !namespaceName) {
      let j = i + 1;
      const parts: string[] = [];
      while (
        j < tokens.length &&
        tokens[j].text !== ';' &&
        tokens[j].text !== '{' &&
        tokens[j].kind !== 'eof'
      ) {
        parts.push(tokens[j].text);
        j++;
      }
      namespaceName = parts.join('');
      if (j < tokens.length && tokens[j].text === ';') {
        fileScopedNamespace = true;
      }
      i = j;
      continue;
    }

    if (tok.kind === 'keyword' && tok.text === 'class' && classOpenBraceIndex < 0) {
      const nameTok = tokens[i + 1];
      if (nameTok && (nameTok.kind === 'identifier' || nameTok.kind === 'keyword')) {
        className = nameTok.text;
        let j = i + 2;
        if (j < tokens.length && tokens[j].text === ':') {
          j++;
          const baseParts: string[] = [];
          while (
            j < tokens.length &&
            tokens[j].text !== '{' &&
            tokens[j].text !== ',' &&
            tokens[j].text !== 'where' &&
            tokens[j].kind !== 'eof'
          ) {
            baseParts.push(tokens[j].text);
            j++;
          }
          const rawBase = baseParts.join('');
          const baseWithoutGenerics = rawBase.replace(/<[\s\S]*>$/, '');
          const shortBase = extractShortTypeName(baseWithoutGenerics);
          if (shortBase === 'UserControl') detectedBaseTypeFromClass = 'UserControl';
          else if (shortBase === 'Form') detectedBaseTypeFromClass = 'Form';
          else if (isCustomBaseClassName(shortBase)) detectedCustomBaseClass = shortBase;
        }
        while (j < tokens.length && tokens[j].text !== '{' && tokens[j].kind !== 'eof') {
          j++;
        }
        if (j < tokens.length && tokens[j].text === '{') {
          classOpenBraceIndex = j;
          classCloseBraceIndex = findMatchingBrace(tokens, j);
          if (classCloseBraceIndex < 0) {
            hasUnmatchedClassBrace = true;
            diagnostics.push({
              severity: 'warning',
              message: `Class '${className}' has an unmatched opening brace.`,
              line: tokens[j].line,
            });
            classCloseBraceIndex = tokens.length - 1;
          }
          break;
        }
      }
    }
  }

  if (!className) {
    diagnostics.push({
      severity: 'warning',
      message: 'Could not find a class declaration in designer source.',
    });
  }

  // 2. Scan class body for InitializeComponent(), #endregion, and field declarations
  let initMethodStartTokenIndex = -1;
  let initOpenBraceIndex = -1;
  let initCloseBraceIndex = -1;
  let hasUnmatchedInitBrace = false;
  let foundExpressionBodiedInit = false;
  let endRegionTokenIndex = -1;
  const fieldDecls: FieldDeclInfo[] = [];

  if (classOpenBraceIndex >= 0 && classCloseBraceIndex > classOpenBraceIndex) {
    let i = classOpenBraceIndex + 1;
    let seenEndRegion = false;
    let pendingAttrStartTokenIndex = -1;

    while (i < classCloseBraceIndex) {
      const tok = tokens[i];

      if (tok.kind === 'preprocessor') {
        if (/^#\s*endregion\b/.test(tok.text) && initCloseBraceIndex >= 0 && endRegionTokenIndex < 0) {
          endRegionTokenIndex = i;
          seenEndRegion = true;
        }
        i++;
        continue;
      }

      // Track attribute lists `[...]` attached to upcoming member
      if (tok.kind === 'punctuation' && tok.text === '[') {
        if (pendingAttrStartTokenIndex < 0) {
          pendingAttrStartTokenIndex = i;
        }
        const closeBracket = findMatchingDelimiter(tokens, i, '[', ']');
        i = closeBracket >= 0 ? closeBracket + 1 : i + 1;
        continue;
      }

      if (tok.kind === 'punctuation' && tok.text === '{') {
        pendingAttrStartTokenIndex = -1;
        const cb = findMatchingBrace(tokens, i);
        i = cb >= 0 ? cb + 1 : i + 1;
        continue;
      }

      const hasAttributes = pendingAttrStartTokenIndex >= 0;
      const memberStart = i;
      const declStartTokenIndex = hasAttributes ? pendingAttrStartTokenIndex : memberStart;
      pendingAttrStartTokenIndex = -1;
      const modifiers: string[] = [];
      while (
        i < classCloseBraceIndex &&
        tokens[i].kind === 'keyword' &&
        (FIELD_MODIFIER_KEYWORDS.has(tokens[i].text) ||
          tokens[i].text === 'override' ||
          tokens[i].text === 'virtual' ||
          tokens[i].text === 'abstract' ||
          tokens[i].text === 'sealed' ||
          tokens[i].text === 'async' ||
          tokens[i].text === 'partial')
      ) {
        modifiers.push(tokens[i].text);
        i++;
      }

      // Scan ahead for `(`, `;`, `{`, `=>`
      let j = i;
      let angleDepth = 0;
      let bracketDepth = 0;
      while (j < classCloseBraceIndex) {
        const t = tokens[j];
        if (t.text === '<') angleDepth++;
        else if (t.text === '>' && angleDepth > 0) angleDepth--;
        else if (t.text === '[') bracketDepth++;
        else if (t.text === ']' && bracketDepth > 0) bracketDepth--;
        else if (angleDepth === 0 && bracketDepth === 0) {
          if (t.text === '(' || t.text === ';' || t.text === '{' || t.text === '=>') {
            break;
          }
        }
        j++;
      }

      if (j >= classCloseBraceIndex) break;

      // Case A: Method (contains `(` without prior `=`)
      let hasEqBeforeParen = false;
      for (let k = i; k < j; k++) {
        if (tokens[k].text === '=') {
          hasEqBeforeParen = true;
          break;
        }
      }

      if (tokens[j].text === '(' && !hasEqBeforeParen) {
        const methodNameTok = j > i ? tokens[j - 1] : undefined;
        const closeParen = findMatchingDelimiter(tokens, j, '(', ')');
        if (closeParen < 0) {
          i = j + 1;
          continue;
        }
        let bodyIdx = closeParen + 1;
        while (
          bodyIdx < classCloseBraceIndex &&
          tokens[bodyIdx].text !== '{' &&
          tokens[bodyIdx].text !== ';' &&
          tokens[bodyIdx].text !== '=>'
        ) {
          bodyIdx++;
        }
        if (bodyIdx < classCloseBraceIndex && tokens[bodyIdx].text === '{') {
          const closeBrace = findMatchingBrace(tokens, bodyIdx);
          if (methodNameTok && methodNameTok.text === 'InitializeComponent') {
            initMethodStartTokenIndex = memberStart;
            initOpenBraceIndex = bodyIdx;
            if (closeBrace < 0) {
              hasUnmatchedInitBrace = true;
              initCloseBraceIndex = classCloseBraceIndex - 1;
              diagnostics.push({
                severity: 'warning',
                message: 'InitializeComponent() has an unmatched opening brace.',
                line: tokens[bodyIdx].line,
              });
            } else {
              initCloseBraceIndex = closeBrace;
            }
          }
          i = closeBrace >= 0 ? closeBrace + 1 : bodyIdx + 1;
          continue;
        } else if (bodyIdx < classCloseBraceIndex && tokens[bodyIdx].text === '=>') {
          if (methodNameTok && methodNameTok.text === 'InitializeComponent') {
            foundExpressionBodiedInit = true;
            diagnostics.push({
              severity: 'warning',
              message: 'InitializeComponent() is expression-bodied and cannot be edited visually.',
              line: methodNameTok.line,
            });
          }
          while (bodyIdx < classCloseBraceIndex && tokens[bodyIdx].text !== ';') bodyIdx++;
          i = bodyIdx + 1;
          continue;
        } else {
          i = bodyIdx + 1;
          continue;
        }
      }

      // Case B: Property / nested type with `{`
      if (tokens[j].text === '{') {
        const cb = findMatchingBrace(tokens, j);
        i = cb >= 0 ? cb + 1 : j + 1;
        continue;
      }

      // Case C: Expression-bodied property `=> ...;`
      if (tokens[j].text === '=>') {
        while (j < classCloseBraceIndex && tokens[j].text !== ';') j++;
        i = j + 1;
        continue;
      }

      // Case D: Field declaration ending with `;` (could have `= expr` before `;`)
      let semiIdx = j;
      if (tokens[semiIdx].text !== ';') {
        let pDepth = 0;
        let bDepth = 0;
        while (semiIdx < classCloseBraceIndex) {
          if (tokens[semiIdx].text === '(') pDepth++;
          else if (tokens[semiIdx].text === ')') pDepth = Math.max(0, pDepth - 1);
          else if (tokens[semiIdx].text === '{') bDepth++;
          else if (tokens[semiIdx].text === '}') bDepth = Math.max(0, bDepth - 1);
          else if (tokens[semiIdx].text === ';' && pDepth === 0 && bDepth === 0) break;
          semiIdx++;
        }
      }

      if (semiIdx < classCloseBraceIndex && tokens[semiIdx].text === ';') {
        // Parse `<TypeName> <field1> [= ...], <field2> [= ...];` (supports multi-declarator fields & generics)
        const declTokens = tokens.slice(i, semiIdx);
        const declaratorSlices = splitFieldDeclarators(declTokens);
        if (declaratorSlices.length > 0) {
          const isMultiDeclarator = declaratorSlices.length > 1;
          const firstSlice = declaratorSlices[0];
          const firstEqIdx = findTopLevelOperator(firstSlice, '=');
          const firstBeforeEq = firstEqIdx >= 0 ? firstEqIdx : firstSlice.length;
          if (firstBeforeEq >= 2) {
            const firstNameTok = firstSlice[firstBeforeEq - 1];
            if (firstNameTok.kind === 'identifier') {
              const typeStart = firstSlice[0].start;
              const typeEnd = firstSlice[firstBeforeEq - 2].end;
              const typeName = source.slice(typeStart, typeEnd).replace(/\s+/g, '');
              const stmtStart = findSafeStatementStart(source, tokens[declStartTokenIndex].start);
              const rawLine = source.slice(stmtStart, tokens[semiIdx].end);
              const modifierStr = modifiers.length > 0 ? modifiers.join(' ') : 'private';
              const anySliceHasInit = declaratorSlices.some(
                (s) => findTopLevelOperator(s, '=') >= 0
              );

              fieldDecls.push({
                name: firstNameTok.text,
                modifier: modifierStr,
                typeName,
                rawLine,
                lineStart: stmtStart,
                end: tokens[semiIdx].end,
                afterEndRegion: seenEndRegion,
                isMultiDeclarator,
                hasAttributesOrInitializer: hasAttributes || firstEqIdx >= 0 || (isMultiDeclarator && anySliceHasInit),
              });

              for (let d = 1; d < declaratorSlices.length; d++) {
                const slice = declaratorSlices[d];
                if (slice.length === 0) continue;
                const eqPos = findTopLevelOperator(slice, '=');
                const namePos = eqPos >= 0 ? eqPos - 1 : slice.length - 1;
                if (namePos === 0 && slice[0].kind === 'identifier') {
                  fieldDecls.push({
                    name: slice[0].text,
                    modifier: modifierStr,
                    typeName,
                    rawLine,
                    lineStart: stmtStart,
                    end: tokens[semiIdx].end,
                    afterEndRegion: seenEndRegion,
                    isMultiDeclarator,
                    hasAttributesOrInitializer: hasAttributes || eqPos >= 0 || anySliceHasInit,
                  });
                }
              }
            }
          }
        }
        i = semiIdx + 1;
        continue;
      }

      i = j + 1;
    }
  }

  const existingFieldDeclarations: DocumentStyleMetadata['existingFieldDeclarations'] = {};
  for (const fd of fieldDecls) {
    existingFieldDeclarations[fd.name] = {
      modifier: fd.modifier,
      typeName: fd.typeName,
      rawLine: fd.rawLine,
    };
  }

  // Compute initializeComponentRange: line start of method signature through closing `}`
  let initializeComponentRange: TextRange | undefined;
  let readOnlyReason: string | undefined;

  if (
    initMethodStartTokenIndex >= 0 &&
    initCloseBraceIndex >= 0 &&
    !hasUnmatchedClassBrace &&
    !hasUnmatchedInitBrace
  ) {
    initializeComponentRange = {
      start: findLineStart(source, tokens[initMethodStartTokenIndex].start),
      end: tokens[initCloseBraceIndex].end,
    };
  } else if (source.trim().length > 0) {
    if (hasUnmatchedClassBrace) {
      readOnlyReason =
        'Cannot edit visually: class declaration has unmatched braces.';
    } else if (hasUnmatchedInitBrace) {
      readOnlyReason =
        'Cannot edit visually: InitializeComponent() has unmatched braces.';
    } else if (foundExpressionBodiedInit) {
      readOnlyReason =
        'Cannot edit visually: InitializeComponent() must be a block-bodied method.';
    } else {
      diagnostics.push({
        severity: 'warning',
        message: 'Could not find InitializeComponent() method.',
      });
      readOnlyReason =
        'Cannot edit visually: InitializeComponent() must be a block-bodied method.';
    }
  }

  // Check for conditional compilation directives (#if/#elif/#else/#endif) inside InitializeComponent()
  if (initOpenBraceIndex >= 0 && initCloseBraceIndex > initOpenBraceIndex) {
    for (let k = initOpenBraceIndex + 1; k < initCloseBraceIndex; k++) {
      const t = tokens[k];
      if (t.kind === 'preprocessor' && /^#\s*(?:if|elif|else|endif)\b/.test(t.text)) {
        diagnostics.push({
          severity: 'warning',
          message: `InitializeComponent() contains conditional compilation directive (${t.text.trim()}).`,
          line: t.line,
        });
        if (!readOnlyReason) {
          readOnlyReason =
            'InitializeComponent() contains conditional compilation directives (#if/#endif). Edit this file in the C# text editor to preserve conditional branches.';
        }
        break;
      }
    }
  }

  // Populate individual fieldSpans for surgical per-field patching
  const fieldSpans: Record<string, FieldDeclarationSpan> = {};
  for (const fd of fieldDecls) {
    const beforeInit =
      initializeComponentRange !== undefined ? fd.lineStart < initializeComponentRange.start : false;
    fieldSpans[fd.name] = {
      name: fd.name,
      modifier: fd.modifier,
      typeName: fd.typeName,
      statementStart: fd.lineStart,
      statementEnd: fd.end,
      isMultiDeclarator: fd.isMultiDeclarator,
      beforeInit,
      ...(fd.hasAttributesOrInitializer ? { hasAttributesOrInitializer: true } : {}),
      rawLine: fd.rawLine,
    };
  }

  // Detect indentation unit
  const indent = detectIndent(
    source,
    tokens,
    classOpenBraceIndex,
    initMethodStartTokenIndex,
    initOpenBraceIndex,
    initCloseBraceIndex
  );

  // 3. Parse InitializeComponent() statements
  const instances = new Map<string, ParsedInstance>();
  const formProperties: Record<string, PropertyValue> = {};
  const formRawPropertyExpressions: Record<string, string> = {};
  const formEvents: Record<string, string> = {};
  const formEventSubscriptions: EventSubscription[] = [];
  const formRawStatements: string[] = [];
  const formDataBindings: DataBindingEntry[] = [];
  const formChildRefs: ChildRef[] = [];
  const unhandledTopLevelStatements: string[] = [];
  const pendingTrailingStatements: Array<{ text: string; localVarName?: string }> = [];
  const localVars = new Set<string>();
  const parsedTreeNodes = new Map<string, ParsedTreeNode>();

  let thisCount = 0;
  let noThisCount = 0;
  let shorthandEventCount = 0;
  let explicitEventCount = 0;
  let usesComponentResourceManager = false;
  let resourceManagerStatement: string | undefined;
  let usesContainerComponents = false;
  let hasSuspendResumeLayout = false;
  let resourceVarName = 'resources';
  let seenControlConfig = false;

  const pushUnhandled = (stmtText: string, localVarName?: string): void => {
    if (!seenControlConfig) {
      unhandledTopLevelStatements.push(stmtText);
    } else {
      pendingTrailingStatements.push({ text: stmtText, localVarName });
    }
  };

  if (initOpenBraceIndex >= 0 && initCloseBraceIndex > initOpenBraceIndex) {
    const statements = splitStatements(tokens, source, initOpenBraceIndex + 1, initCloseBraceIndex);

    for (const stmt of statements) {
      if (stmt.tokens.length === 0) continue;
      const lastTok = stmt.tokens[stmt.tokens.length - 1];
      if (lastTok.text !== ';') {
        diagnostics.push({
          severity: 'warning',
          message: `Unterminated statement in InitializeComponent(): ${stmt.text.slice(0, 60)}`,
          line: stmt.line,
        });
        pushUnhandled(stmt.text.trim());
        continue;
      }

      const bodyTokens = stmt.tokens.slice(0, -1); // strip trailing `;`
      if (bodyTokens.length === 0) continue;

      // 3a. ComponentResourceManager local variable declaration
      if (isComponentResourceManagerDecl(bodyTokens)) {
        usesComponentResourceManager = true;
        resourceManagerStatement = stmt.text.trim();
        const eqIdx = findTopLevelOperator(bodyTokens, '=');
        if (eqIdx > 0 && bodyTokens[eqIdx - 1].kind === 'identifier') {
          resourceVarName = bodyTokens[eqIdx - 1].text;
          localVars.add(resourceVarName);
        }
        continue;
      }

      // 3b. Local variable declaration (`TreeNode`, `DataGridViewCellStyle`, `var x = ...;`)
      if (isLocalVariableDeclaration(bodyTokens, existingFieldDeclarations)) {
        const parsedTn = tryParseTreeNodeDeclaration(bodyTokens, stmt.text.trim());
        if (parsedTn) {
          localVars.add(parsedTn.varName);
          parsedTreeNodes.set(parsedTn.varName, parsedTn);
          continue;
        }
        let declaredVar: string | undefined;
        const eqIdx = findTopLevelOperator(bodyTokens, '=');
        if (eqIdx > 0 && bodyTokens[eqIdx - 1].kind === 'identifier') {
          declaredVar = bodyTokens[eqIdx - 1].text;
          localVars.add(declaredVar);
        }
        pushUnhandled(stmt.text.trim(), declaredVar);
        continue;
      }

      // 3c. ISupportInitialize BeginInit() / EndInit()
      const supportInitTarget = tryParseSupportInitializeCall(bodyTokens);
      if (supportInitTarget) {
        if (supportInitTarget.usedThis) thisCount++;
        else noThisCount++;
        const inst = instances.get(supportInitTarget.targetName);
        if (inst) {
          inst.usedSupportInitialize = true;
        }
        continue;
      }

      // 3d. Check for `+=` event subscription
      const plusEqIdx = findTopLevelOperator(bodyTokens, '+=');
      if (plusEqIdx > 0) {
        const lhs = bodyTokens.slice(0, plusEqIdx);
        const rhs = bodyTokens.slice(plusEqIdx + 1);
        const target = parseTargetChain(lhs, instances, existingFieldDeclarations);
        const eventHandler = parseEventHandlerRhs(rhs, source);

        if (target && eventHandler) {
          if (target.usedThis) thisCount++;
          else noThisCount++;
          if (eventHandler.isExplicit) explicitEventCount++;
          else shorthandEventCount++;

          const sub: EventSubscription = {
            eventName: target.chain[0],
            handlerName: eventHandler.handlerName,
            ...(eventHandler.delegateType ? { delegateType: eventHandler.delegateType } : {}),
            isExplicit: eventHandler.isExplicit,
          };

          if (target.owner === '__form__' && target.chain.length === 1) {
            seenControlConfig = true;
            if (!(target.chain[0] in formEvents)) {
              formEvents[target.chain[0]] = eventHandler.handlerName;
            }
            formEventSubscriptions.push(sub);
            continue;
          }
          if (target.owner !== '__form__' && target.chain.length === 1) {
            seenControlConfig = true;
            const inst = getOrCreateInstance(
              instances,
              target.owner,
              existingFieldDeclarations
            );
            if (!(target.chain[0] in inst.events)) {
              inst.events[target.chain[0]] = eventHandler.handlerName;
            }
            inst.eventSubscriptions.push(sub);
            continue;
          }
        }
        pushUnhandled(stmt.text.trim());
        continue;
      }

      // 3e. Check for `=` assignment (instantiation OR property assignment)
      const eqIdx = findTopLevelOperator(bodyTokens, '=');
      if (eqIdx > 0) {
        const lhs = bodyTokens.slice(0, eqIdx);
        const rhs = bodyTokens.slice(eqIdx + 1);

        // Check `this.components = new System.ComponentModel.Container()` / `components = new Container()`
        const lhsRef = parseSimpleFieldRef(lhs);
        if (lhsRef && lhsRef.name === 'components' && isContainerInstantiation(rhs)) {
          if (lhsRef.usedThis) thisCount++;
          else noThisCount++;
          usesContainerComponents = true;
          continue;
        }

        // Check control/component instantiation: `[this.]<name> = new <Type>(<args>)` or `[this.]<name> = new(<args>)`
        if (lhsRef && isNewObjectInstantiation(rhs)) {
          const parsedNew = parseNewObjectInstantiation(
            rhs,
            source,
            lhsRef.name,
            existingFieldDeclarations
          );
          if (parsedNew && !VALUE_CONSTRUCTOR_TYPES.has(parsedNew.shortType)) {
            if (lhsRef.usedThis) thisCount++;
            else noThisCount++;
            if (parsedNew.fullTypeName === 'System.ComponentModel.Container' && lhsRef.name === 'components') {
              usesContainerComponents = true;
              continue;
            }
            const existingInst = instances.get(lhsRef.name);
            if (existingInst) {
              existingInst.type = parsedNew.shortType;
              existingInst.fullTypeName = parsedNew.fullTypeName;
              existingInst.constructorArgs = parsedNew.constructorArgs;
            } else {
              instances.set(lhsRef.name, {
                name: lhsRef.name,
                type: parsedNew.shortType,
                fullTypeName: parsedNew.fullTypeName,
                constructorArgs: parsedNew.constructorArgs,
                properties: {},
                rawPropertyExpressions: {},
                events: {},
                eventSubscriptions: [],
                rawStatements: [],
                dataBindings: [],
                treeNodeRefs: [],
                stripItemRefs: [],
                columnRefs: [],
                listViewColumnRefs: [],
                childRefs: [],
                columnSpans: new Map(),
                rowSpans: new Map(),
                columnStyles: [],
                rowStyles: [],
                usedSupportInitialize: false,
              });
            }
            continue;
          }
        }

        // Check if LHS targets a known local var (TreeNode property vs generic unhandled top-level)
        if (lhs.length > 0 && lhs[0].kind === 'identifier' && localVars.has(lhs[0].text)) {
          const tn = parsedTreeNodes.get(lhs[0].text);
          if (tn && lhs.length === 3 && lhs[1].text === '.' && (lhs[2].text === 'Name' || lhs[2].text === 'Text')) {
            const strVal = tryParseStringExpression(rhs);
            if (strVal !== null) {
              if (lhs[2].text === 'Name') tn.name = strVal;
              else tn.text = strVal;
              tn.sourceStatements.push(stmt.text.trim());
              continue;
            }
          }
          pushUnhandled(stmt.text.trim(), lhs[0].text);
          continue;
        }

        // Property assignment on Form or control/component/item/column
        const target = parseTargetChain(lhs, instances, existingFieldDeclarations);
        if (target && target.chain.length >= 1) {
          seenControlConfig = true;
          if (target.usedThis) thisCount++;
          else noThisCount++;
          const propName = target.chain.join('.');
          const rawExpr =
            rhs.length > 0
              ? source.slice(rhs[0].start, rhs[rhs.length - 1].end).trim()
              : '';
          const val = parsePropertyValue(
            rhs,
            source,
            propName,
            resourceVarName,
            resources,
            instances,
            existingFieldDeclarations
          );
          if (isResourceValue(val)) {
            usesComponentResourceManager = true;
          }

          if (target.owner === '__form__') {
            formProperties[propName] = val;
            if (rawExpr) {
              formRawPropertyExpressions[propName] = rawExpr;
            }
          } else {
            const inst = getOrCreateInstance(
              instances,
              target.owner,
              existingFieldDeclarations
            );
            inst.properties[propName] = val;
            if (rawExpr) {
              inst.rawPropertyExpressions[propName] = rawExpr;
            }
          }
          continue;
        }

        pushUnhandled(stmt.text.trim());
        continue;
      }

      // 3f. Method invocation statements (SuspendLayout, ResumeLayout, Controls.Add, Items.AddRange, etc.)
      if (bodyTokens[0].kind === 'identifier' && localVars.has(bodyTokens[0].text)) {
        const tn = parsedTreeNodes.get(bodyTokens[0].text);
        if (tn && tryHandleTreeNodeMethodCall(tn, bodyTokens, stmt.text.trim())) {
          continue;
        }
        pushUnhandled(stmt.text.trim(), bodyTokens[0].text);
        continue;
      }

      const call = parseMethodCall(bodyTokens, instances, existingFieldDeclarations);
      if (call) {
        const methodName = call.chain[call.chain.length - 1];
        const prefixChain = call.chain.slice(0, -1).join('.');

        // Layout suspension calls: SuspendLayout(), ResumeLayout(...), PerformLayout()
        if (
          (methodName === 'SuspendLayout' ||
            methodName === 'ResumeLayout' ||
            methodName === 'PerformLayout') &&
          (prefixChain === '' || prefixChain === 'Panel1' || prefixChain === 'Panel2')
        ) {
          if (call.usedThis) thisCount++;
          else noThisCount++;
          hasSuspendResumeLayout = true;
          continue;
        }

        if (call.usedThis) thisCount++;
        else noThisCount++;

        const handled = handleCollectionOrHierarchyCall(
          call.owner,
          prefixChain,
          methodName,
          call.argTokenSlices,
          source,
          instances,
          formChildRefs,
          formDataBindings,
          parsedTreeNodes
        );
        if (handled) {
          seenControlConfig = true;
          continue;
        }

        // Unhandled method call targeting a specific control or the form -> preserve in rawStatements
        if (call.owner === '__form__') {
          seenControlConfig = true;
          formRawStatements.push(stmt.text.trim());
        } else if (instances.has(call.owner) || existingFieldDeclarations[call.owner]) {
          seenControlConfig = true;
          getOrCreateInstance(instances, call.owner, existingFieldDeclarations).rawStatements.push(
            stmt.text.trim()
          );
        } else {
          pushUnhandled(stmt.text.trim());
        }
        continue;
      }

      // Unrecognized statement
      pushUnhandled(stmt.text.trim());
    }
  }

  // Partition pendingTrailingStatements: if a local var declared in a trailing statement
  // is actually referenced by a control/form property (e.g. mid-method DataGridViewCellStyle),
  // hoist it to unhandledTopLevelStatements so it stays in scope before control blocks!
  const unhandledTrailingStatements: string[] = [];
  if (pendingTrailingStatements.length > 0) {
    const collectBindingExprs = (bindings: DataBindingEntry[]): string[] =>
      bindings.flatMap((b) =>
        [b.rawExpression, b.dataSource, b.extraArgs].filter((s): s is string => Boolean(s))
      );
    const allControlRawExprs: string[] = [
      ...Object.values(formRawPropertyExpressions),
      ...formRawStatements,
      ...collectBindingExprs(formDataBindings),
    ];
    for (const inst of instances.values()) {
      allControlRawExprs.push(
        ...Object.values(inst.rawPropertyExpressions),
        ...inst.rawStatements,
        ...collectBindingExprs(inst.dataBindings)
      );
    }
    const referencedLocalVars = new Set<string>();
    for (const item of pendingTrailingStatements) {
      if (item.localVarName && item.localVarName !== resourceVarName) {
        const varRe = new RegExp(`\\b${escapeRegExp(item.localVarName)}\\b`);
        if (allControlRawExprs.some((expr) => varRe.test(expr))) {
          referencedLocalVars.add(item.localVarName);
        }
      }
    }
    for (const item of pendingTrailingStatements) {
      if (item.localVarName && referencedLocalVars.has(item.localVarName)) {
        unhandledTopLevelStatements.push(item.text);
      } else {
        unhandledTrailingStatements.push(item.text);
      }
    }
  }

  // 4. Compute fieldsRegionRange & fieldInsertOffset cleanly
  let fieldsRegionRange: TextRange | undefined;
  let fieldInsertOffset: number | undefined;
  const afterRegionFields = fieldDecls.filter((f) => f.afterEndRegion);
  const designerFieldNames = new Set<string>(instances.keys());

  // Consider fields after #endregion (excluding `components` if it somehow appeared there)
  const designerAfterRegionFields = afterRegionFields.filter(
    (f) => f.name !== 'components' && (designerFieldNames.has(f.name) || isLikelyWinFormsFieldType(f.typeName))
  );

  if (designerAfterRegionFields.length > 0) {
    fieldsRegionRange = {
      start: designerAfterRegionFields[0].lineStart,
      end: designerAfterRegionFields[designerAfterRegionFields.length - 1].end,
    };
    fieldInsertOffset = advancePastTrailingNewline(
      source,
      designerAfterRegionFields[designerAfterRegionFields.length - 1].end
    );
  } else if (endRegionTokenIndex >= 0 && classCloseBraceIndex >= 0 && !hasUnmatchedClassBrace) {
    // Zero-width insertion range right before the class closing `}` line
    const closeLineStart = findLineStart(source, tokens[classCloseBraceIndex].start);
    fieldsRegionRange = {
      start: closeLineStart,
      end: closeLineStart,
    };
    fieldInsertOffset = closeLineStart;
  } else {
    // No #endregion; check designer fields after InitializeComponent()
    const initEndOffset = initializeComponentRange?.end ?? 0;
    const fieldsAfterInit = fieldDecls.filter(
      (f) =>
        f.lineStart > initEndOffset &&
        f.name !== 'components' &&
        (designerFieldNames.has(f.name) || isLikelyWinFormsFieldType(f.typeName))
    );
    if (fieldsAfterInit.length > 0) {
      fieldsRegionRange = {
        start: fieldsAfterInit[0].lineStart,
        end: fieldsAfterInit[fieldsAfterInit.length - 1].end,
      };
      fieldInsertOffset = advancePastTrailingNewline(
        source,
        fieldsAfterInit[fieldsAfterInit.length - 1].end
      );
    } else if (classCloseBraceIndex >= 0 && !hasUnmatchedClassBrace) {
      // Fallback: zero-width insertion range right before the class closing `}` line
      const closeLineStart = findLineStart(source, tokens[classCloseBraceIndex].start);
      fieldsRegionRange = {
        start: closeLineStart,
        end: closeLineStart,
      };
      fieldInsertOffset = closeLineStart;
    }
  }

  // 5. Determine baseType ('Form' | 'UserControl')
  let baseType: 'Form' | 'UserControl' = 'Form';
  if (options?.baseType) {
    baseType = options.baseType;
  } else if (detectedBaseTypeFromClass) {
    baseType = detectedBaseTypeFromClass;
  } else if (
    'Size' in formProperties &&
    !('ClientSize' in formProperties) &&
    !('Text' in formProperties) &&
    !('StartPosition' in formProperties)
  ) {
    baseType = 'UserControl';
  }

  // 6. Assemble hierarchical DesignNode tree and components list
  const attachedNames = new Set<string>();

  const buildStripItem = (name: string): StripItemNode | null => {
    const inst = instances.get(name);
    if (!inst) return null;
    attachedNames.add(name);

    const itemType = STRIP_ITEM_TYPES.has(inst.type as StripItemNode['type'])
      ? (inst.type as StripItemNode['type'])
      : 'ToolStripMenuItem';

    const dropDownItems: StripItemNode[] = [];
    for (const subName of inst.stripItemRefs) {
      const sub = buildStripItem(subName);
      if (sub) dropDownItems.push(sub);
    }

    const text = typeof inst.properties.Text === 'string' ? inst.properties.Text : undefined;

    const node: StripItemNode = {
      id: makeStableId(inst.name),
      name: inst.name,
      type: itemType,
      ...(text !== undefined ? { text } : {}),
      properties: { ...inst.properties },
      events: { ...inst.events },
      ...(dropDownItems.length > 0 ? { dropDownItems } : {}),
      ...(inst.rawStatements.length > 0 ? { rawStatements: [...inst.rawStatements] } : {}),
    };
    return node;
  };

  const buildDgvColumn = (name: string): DataGridViewColumnNode | null => {
    const inst = instances.get(name);
    if (!inst) return null;
    attachedNames.add(name);

    const colType = DGV_COLUMN_TYPES.has(inst.type as DataGridViewColumnNode['columnType'])
      ? (inst.type as DataGridViewColumnNode['columnType'])
      : 'DataGridViewTextBoxColumn';

    const extraProps: Record<string, PropertyValue> = {};
    let headerText = '';
    let width: number | undefined;
    let readOnly: boolean | undefined;
    let visible: boolean | undefined;

    for (const [k, v] of Object.entries(inst.properties)) {
      if (k === 'HeaderText' && typeof v === 'string') {
        headerText = v;
      } else if (k === 'Name') {
        // Already stored as `name`
      } else if (k === 'Width' && typeof v === 'number') {
        width = v;
      } else if (k === 'ReadOnly' && typeof v === 'boolean') {
        readOnly = v;
      } else if (k === 'Visible' && typeof v === 'boolean') {
        visible = v;
      } else {
        extraProps[k] = v;
      }
    }

    const col: DataGridViewColumnNode = {
      id: makeStableId(inst.name),
      name: inst.name,
      columnType: colType,
      headerText,
      ...(width !== undefined ? { width } : {}),
      ...(readOnly !== undefined ? { readOnly } : {}),
      ...(visible !== undefined ? { visible } : {}),
      ...(Object.keys(extraProps).length > 0 ? { properties: extraProps } : {}),
    };
    return col;
  };

  const buildListViewColumn = (name: string): ListViewColumnNode | null => {
    const inst = instances.get(name);
    if (!inst) return null;
    attachedNames.add(name);

    const extraProps: Record<string, PropertyValue> = {};
    for (const [k, v] of Object.entries(inst.properties)) {
      if (k === 'Text' || k === 'Width') continue;
      extraProps[k] = v;
    }

    return {
      id: makeStableId(inst.name),
      name: inst.name,
      text: typeof inst.properties.Text === 'string' ? inst.properties.Text : inst.name,
      width: typeof inst.properties.Width === 'number' ? inst.properties.Width : 60,
      ...(Object.keys(extraProps).length > 0 ? { properties: extraProps } : {}),
      ...(inst.rawStatements.length > 0 ? { rawStatements: [...inst.rawStatements] } : {}),
    };
  };

  const buildDesignNode = (
    name: string,
    parentInst?: ParsedInstance,
    childRef?: ChildRef,
    visited = new Set<string>()
  ): DesignNode | null => {
    if (visited.has(name)) return null;
    const inst = instances.get(name);
    if (!inst) return null;
    visited.add(name);
    attachedNames.add(name);

    const def = getControlDefinition(inst.type);
    const isUnknownType = !def;
    const isComponent = def ? def.isComponent : false;
    const fieldDecl = existingFieldDeclarations[name];

    const children: DesignNode[] = [];
    for (const cr of inst.childRefs) {
      const childNode = buildDesignNode(cr.name, inst, cr, visited);
      if (childNode) {
        children.push(childNode);
      }
    }

    // Build strip items if present
    let stripItems: StripItemNode[] | undefined;
    if (inst.stripItemRefs.length > 0) {
      stripItems = [];
      for (const sName of inst.stripItemRefs) {
        const sItem = buildStripItem(sName);
        if (sItem) stripItems.push(sItem);
      }
    }

    // Build DataGridView columns if present
    let columns: DataGridViewColumnNode[] | undefined;
    if (inst.columnRefs.length > 0) {
      columns = [];
      for (const cName of inst.columnRefs) {
        const col = buildDgvColumn(cName);
        if (col) columns.push(col);
      }
    }

    // Build ListView columns if present
    let listViewColumns: ListViewColumnNode[] | undefined;
    if (inst.listViewColumnRefs.length > 0) {
      listViewColumns = [];
      for (const cName of inst.listViewColumnRefs) {
        const col = buildListViewColumn(cName);
        if (col) listViewColumns.push(col);
      }
    }

    // TableLayoutPanel track styles
    const tableLayout =
      inst.type === 'TableLayoutPanel' &&
      (inst.columnStyles.length > 0 || inst.rowStyles.length > 0)
        ? {
            columnStyles: inst.columnStyles,
            rowStyles: inst.rowStyles,
          }
        : undefined;

    // Table cell position when child of TableLayoutPanel
    let tableCell: DesignNode['tableCell'];
    if (parentInst?.type === 'TableLayoutPanel') {
      const colSpan = parentInst.columnSpans.get(name);
      const rowSpan = parentInst.rowSpans.get(name);
      const hasExplicitPos =
        childRef !== undefined &&
        childRef.column !== undefined &&
        childRef.row !== undefined;
      if (hasExplicitPos) {
        tableCell = {
          explicit: true,
          column: childRef!.column,
          row: childRef!.row,
          ...(colSpan && colSpan > 1 ? { columnSpan: colSpan } : {}),
          ...(rowSpan && rowSpan > 1 ? { rowSpan: rowSpan } : {}),
        };
      } else if ((colSpan && colSpan > 1) || (rowSpan && rowSpan > 1)) {
        tableCell = {
          explicit: false,
          ...(colSpan && colSpan > 1 ? { columnSpan: colSpan } : {}),
          ...(rowSpan && rowSpan > 1 ? { rowSpan: rowSpan } : {}),
        };
      }
    }

    // Build TreeView nodes if present
    let treeNodes: TreeNodeItem[] | undefined;
    if (inst.treeNodeRefs.length > 0) {
      treeNodes = buildTreeNodeItems(inst.treeNodeRefs, parsedTreeNodes, inst.name);
    }

    const node: DesignNode = {
      id: makeStableId(inst.name),
      name: inst.name,
      type: inst.type,
      fullTypeName: inst.fullTypeName,
      ...(isUnknownType ? { isUnknownType: true } : {}),
      ...(isComponent ? { isComponent: true } : {}),
      properties: { ...inst.properties },
      ...(Object.keys(inst.rawPropertyExpressions).length > 0
        ? { rawPropertyExpressions: { ...inst.rawPropertyExpressions } }
        : {}),
      events: { ...inst.events },
      ...(inst.eventSubscriptions.length > 0
        ? { eventSubscriptions: [...inst.eventSubscriptions] }
        : {}),
      children,
      ...(childRef?.panelSlot ? { panelSlot: childRef.panelSlot } : {}),
      ...(tableCell ? { tableCell } : {}),
      ...(tableLayout ? { tableLayout } : {}),
      ...(stripItems && stripItems.length > 0 ? { stripItems } : {}),
      ...(columns && columns.length > 0 ? { columns } : {}),
      ...(listViewColumns && listViewColumns.length > 0 ? { listViewColumns } : {}),
      ...(inst.items && inst.items.length > 0 ? { items: [...inst.items] } : {}),
      ...(treeNodes && treeNodes.length > 0 ? { treeNodes } : {}),
      ...(inst.dataBindings.length > 0 ? { dataBindings: [...inst.dataBindings] } : {}),
      ...(inst.rawStatements.length > 0 ? { rawStatements: [...inst.rawStatements] } : {}),
      ...(fieldDecl?.modifier && fieldDecl.modifier !== 'private'
        ? { fieldModifier: fieldDecl.modifier }
        : {}),
      ...(inst.constructorArgs ? { constructorArgs: inst.constructorArgs } : {}),
    };

    return node;
  };

  const formChildren: DesignNode[] = [];
  for (const cr of formChildRefs) {
    const child = buildDesignNode(cr.name, undefined, cr);
    if (child) {
      formChildren.push(child);
    }
  }

  // Remaining unattached instances: components (Timer, SaveFileDialog, ImageList, ContextMenuStrip, etc.)
  const components: DesignNode[] = [];
  for (const [name, inst] of instances) {
    if (attachedNames.has(name)) continue;
    // Skip detached strip items / columns (shouldn't happen unless orphaned)
    if (STRIP_ITEM_TYPES.has(inst.type as StripItemNode['type'])) continue;
    if (DGV_COLUMN_TYPES.has(inst.type as DataGridViewColumnNode['columnType'])) continue;
    if (inst.type === 'ColumnHeader') continue;

    const compNode = buildDesignNode(name);
    if (compNode) {
      const def = getControlDefinition(inst.type);
      if (def?.isComponent || !def || inst.constructorArgs?.includes('components')) {
        compNode.isComponent = true;
        components.push(compNode);
      } else {
        // Unattached visual control: preserve in components or form? Keep as component so nothing is lost
        components.push(compNode);
      }
    }
  }

  // Any unattached local TreeNode declarations are preserved verbatim so nothing is lost
  for (const tn of parsedTreeNodes.values()) {
    if (!tn.attached) {
      for (const s of tn.sourceStatements) {
        unhandledTopLevelStatements.push(s);
      }
    }
  }

  const formName =
    typeof formProperties.Name === 'string' && formProperties.Name.length > 0
      ? formProperties.Name
      : className || 'Form1';

  const form: DesignNode = {
    id: '__form__',
    name: formName,
    type: baseType,
    fullTypeName:
      baseType === 'UserControl'
        ? 'System.Windows.Forms.UserControl'
        : 'System.Windows.Forms.Form',
    properties: formProperties,
    ...(Object.keys(formRawPropertyExpressions).length > 0
      ? { rawPropertyExpressions: formRawPropertyExpressions }
      : {}),
    events: formEvents,
    ...(formEventSubscriptions.length > 0
      ? { eventSubscriptions: formEventSubscriptions }
      : {}),
    children: formChildren,
    ...(formDataBindings.length > 0 ? { dataBindings: formDataBindings } : {}),
    ...(formRawStatements.length > 0 ? { rawStatements: formRawStatements } : {}),
  };

  const customBaseClass = options?.customBaseClass ?? detectedCustomBaseClass;

  const useThisQualifier = thisCount === 0 && noThisCount === 0 ? true : thisCount >= noThisCount;
  const useShorthandEvents =
    shorthandEventCount === 0 && explicitEventCount === 0
      ? true
      : shorthandEventCount >= explicitEventCount;

  const metadata: DocumentStyleMetadata = {
    eol,
    indent,
    useThisQualifier,
    useShorthandEvents,
    usesComponentResourceManager,
    ...(usesComponentResourceManager ? { resourceVarName } : {}),
    ...(resourceManagerStatement ? { resourceManagerStatement } : {}),
    usesContainerComponents,
    hasSuspendResumeLayout: initOpenBraceIndex < 0 ? true : hasSuspendResumeLayout,
    originalSource: source,
    ...(readOnlyReason ? { readOnlyReason } : {}),
    ...(initializeComponentRange ? { initializeComponentRange } : {}),
    ...(fieldsRegionRange ? { fieldsRegionRange } : {}),
    fieldSpans,
    ...(fieldInsertOffset !== undefined ? { fieldInsertOffset } : {}),
    existingFieldDeclarations,
    unhandledTopLevelStatements,
    ...(unhandledTrailingStatements.length > 0 ? { unhandledTrailingStatements } : {}),
    usingDirectives,
  };

  return {
    namespaceName,
    fileScopedNamespace,
    className: className || formName,
    baseType,
    ...(customBaseClass ? { customBaseClass } : {}),
    form,
    components,
    resources,
    parseDiagnostics: diagnostics,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Internal Parsing Helpers
// ---------------------------------------------------------------------------

function makeStableId(name: string): string {
  return name === '__form__' ? 'node___form__' : name;
}

function getOrCreateInstance(
  instances: Map<string, ParsedInstance>,
  name: string,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): ParsedInstance {
  let inst = instances.get(name);
  if (!inst) {
    const fieldType = existingFields[name]?.typeName?.replace(/\?$/, '') ?? 'Control';
    const shortType = extractShortTypeName(fieldType);
    const def = getControlDefinition(shortType);
    inst = {
      name,
      type: shortType,
      fullTypeName: fieldType.includes('.') ? fieldType : (def?.fullTypeName ?? fieldType),
      properties: {},
      rawPropertyExpressions: {},
      events: {},
      eventSubscriptions: [],
      rawStatements: [],
      dataBindings: [],
      treeNodeRefs: [],
      stripItemRefs: [],
      columnRefs: [],
      listViewColumnRefs: [],
      childRefs: [],
      columnSpans: new Map(),
      rowSpans: new Map(),
      columnStyles: [],
      rowStyles: [],
      usedSupportInitialize: false,
    };
    instances.set(name, inst);
  }
  return inst;
}

function extractShortTypeName(typeName: string): string {
  const cleaned = typeName.replace(/^global::/, '').replace(/\?$/, '');
  const dotIdx = cleaned.lastIndexOf('.');
  return dotIdx >= 0 ? cleaned.slice(dotIdx + 1) : cleaned;
}

const NON_CUSTOM_BASE_TYPES = new Set<string>([
  'Form',
  'UserControl',
  'object',
  'Object',
  'IDisposable',
  'IComponent',
  'ISupportInitialize',
]);

function isCustomBaseClassName(shortBase: string): boolean {
  if (!shortBase || NON_CUSTOM_BASE_TYPES.has(shortBase)) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(shortBase);
}

function isLikelyWinFormsFieldType(typeName: string): boolean {
  const cleaned = typeName.replace(/^global::/, '').replace(/\?$/, '');
  if (cleaned.startsWith('System.Windows.Forms.')) return true;
  if (cleaned.startsWith('System.Drawing.Printing.')) return true;
  if (cleaned.startsWith('System.ComponentModel.BackgroundWorker')) return true;
  if (cleaned.startsWith('System.IO.FileSystemWatcher')) return true;
  const short = extractShortTypeName(cleaned);
  return (
    Boolean(getControlDefinition(short)) ||
    STRIP_ITEM_TYPES.has(short as StripItemNode['type']) ||
    DGV_COLUMN_TYPES.has(short as DataGridViewColumnNode['columnType']) ||
    short === 'ColumnHeader'
  );
}

function isComponentResourceManagerDecl(tokens: Token[]): boolean {
  return tokens.some((t) => t.text === 'ComponentResourceManager');
}

function isLocalVariableDeclaration(
  tokens: Token[],
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): boolean {
  const eqIdx = findTopLevelOperator(tokens, '=');
  if (eqIdx < 2) return false;
  // Pattern: `<Type> <varName> = ...` where first token is NOT `this` and there is no `.` before the last ident?
  // Note: `<Namespace>.<Type> <varName> = ...` HAS dots, followed by space + identifier `<varName>` with NO dot between type and varName!
  if (tokens[0].text === 'this') return false;
  if (tokens[0].text === 'var' && eqIdx === 2 && tokens[1].kind === 'identifier') {
    return true;
  }
  // Check if tokens[eqIdx - 1] is an identifier AND tokens[eqIdx - 2] is NOT `.` (meaning `<Type> <varName>`)
  const varTok = tokens[eqIdx - 1];
  const prevTok = tokens[eqIdx - 2];
  if (
    varTok.kind === 'identifier' &&
    prevTok.text !== '.' &&
    prevTok.text !== '::' &&
    !existingFields[tokens[0].text]
  ) {
    // Make sure it's not something like `x[0] = ...` (prevTok would be `]`)
    if (prevTok.kind === 'identifier' || prevTok.kind === 'keyword' || prevTok.text === '?' || prevTok.text === '>' || prevTok.text === ']') {
      // If prevTok is `]`, check if it's an array type `Type[] varName` vs indexer `arr[0]` (varTok wouldn't be identifier after `]`, wait: `Type[] varName` DOES have varTok as identifier!)
      return true;
    }
  }
  return false;
}

function tryParseSupportInitializeCall(
  tokens: Token[]
): { targetName: string; usedThis: boolean } | null {
  // Matches: ((System.ComponentModel.ISupportInitialize)(this.splitMain)).BeginInit()
  // or ((ISupportInitialize)splitMain).EndInit()
  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];
  const methodTok = tokens[tokens.length - 3];
  const dotTok = tokens[tokens.length - 4];
  if (
    !last ||
    !prev ||
    !methodTok ||
    !dotTok ||
    last.text !== ')' ||
    prev.text !== '(' ||
    dotTok.text !== '.' ||
    (methodTok.text !== 'BeginInit' && methodTok.text !== 'EndInit')
  ) {
    return null;
  }

  const receiverTokens = tokens.slice(0, tokens.length - 4);
  if (!receiverTokens.some((t) => t.text === 'ISupportInitialize')) {
    return null;
  }

  // Extract target field name from the casted expression
  // Walk backwards from end of receiverTokens (stripping closing parens)
  let end = receiverTokens.length - 1;
  while (end >= 0 && receiverTokens[end].text === ')') end--;
  if (end < 0) return null;
  const targetTok = receiverTokens[end];
  if (targetTok.kind !== 'identifier') return null;

  const usedThis =
    end >= 2 && receiverTokens[end - 1].text === '.' && receiverTokens[end - 2].text === 'this';

  return { targetName: targetTok.text, usedThis };
}

function findTopLevelOperator(tokens: Token[], op: string): number {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === '(') paren++;
    else if (t.text === ')') paren = Math.max(0, paren - 1);
    else if (t.text === '{') brace++;
    else if (t.text === '}') brace = Math.max(0, brace - 1);
    else if (t.text === '[') bracket++;
    else if (t.text === ']') bracket = Math.max(0, bracket - 1);
    else if (paren === 0 && brace === 0 && bracket === 0 && t.kind === 'operator' && t.text === op) {
      return i;
    }
  }
  return -1;
}

function parseSimpleFieldRef(tokens: Token[]): { name: string; usedThis: boolean } | null {
  if (tokens.length === 1 && tokens[0].kind === 'identifier') {
    return { name: tokens[0].text, usedThis: false };
  }
  if (
    tokens.length === 3 &&
    tokens[0].text === 'this' &&
    tokens[1].text === '.' &&
    tokens[2].kind === 'identifier'
  ) {
    return { name: tokens[2].text, usedThis: true };
  }
  return null;
}

function isContainerInstantiation(rhs: Token[]): boolean {
  if (rhs.length < 3 || rhs[0].text !== 'new') return false;
  return rhs.some((t) => t.text === 'Container');
}

function isNewObjectInstantiation(rhs: Token[]): boolean {
  if (rhs.length < 3 || rhs[0].text !== 'new') return false;
  // Must end with `)` matching the constructor `(` (and not be `new Type[] { ... }` or `new Point(...)`?
  // Wait: LHS is a simple field ref `[this.]<name>`, so `this.btn = new Button();` or `btn = new();` is always field instantiation!)
  const last = rhs[rhs.length - 1];
  if (last.text !== ')') return false;
  // Find first `(`
  const openParen = rhs.findIndex((t) => t.text === '(');
  if (openParen < 1) return false;
  const closeParen = findMatchingDelimiter(rhs, openParen, '(', ')');
  return closeParen === rhs.length - 1;
}

function parseNewObjectInstantiation(
  rhs: Token[],
  source: string,
  fieldName: string,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): { shortType: string; fullTypeName: string; constructorArgs?: string } | null {
  const openParen = rhs.findIndex((t) => t.text === '(');
  if (openParen < 1) return null;
  const closeParen = findMatchingDelimiter(rhs, openParen, '(', ')');
  if (closeParen !== rhs.length - 1) return null;

  const argsRaw = source.slice(rhs[openParen].end, rhs[closeParen].start).trim();
  const constructorArgs = argsRaw.length > 0 ? argsRaw : undefined;

  let rawType = '';
  if (openParen === 1) {
    // Target-typed `new(...)` -> resolve from existingFieldDeclarations
    rawType = existingFields[fieldName]?.typeName?.replace(/\?$/, '') ?? '';
    if (!rawType) return null;
  } else {
    rawType = source
      .slice(rhs[1].start, rhs[openParen - 1].end)
      .replace(/\s+/g, '')
      .replace(/^global::/, '');
  }

  const shortType = extractShortTypeName(rawType);
  const def = getControlDefinition(shortType);
  const existingType = existingFields[fieldName]?.typeName?.replace(/^global::/, '').replace(/\?$/, '');
  const fullTypeName = rawType.includes('.')
    ? rawType
    : (existingType?.includes('.')
        ? existingType
        : (def?.fullTypeName ?? rawType));

  return { shortType, fullTypeName, constructorArgs };
}

function parseTargetChain(
  lhs: Token[],
  instances: Map<string, ParsedInstance>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): { owner: string; chain: string[]; usedThis: boolean } | null {
  if (lhs.length === 0) return null;

  // Must be dot-separated identifiers (with optional leading `this.`)
  let idx = 0;
  let usedThis = false;
  if (lhs[0].text === 'this') {
    if (lhs.length < 3 || lhs[1].text !== '.') return null;
    usedThis = true;
    idx = 2;
  }

  const segments: string[] = [];
  while (idx < lhs.length) {
    const t = lhs[idx];
    if (t.kind !== 'identifier' && t.kind !== 'keyword') return null;
    segments.push(t.text);
    idx++;
    if (idx < lhs.length) {
      if (lhs[idx].text !== '.') return null;
      idx++;
    }
  }

  if (segments.length === 0) return null;

  if (segments.length === 1) {
    // `[this.]Prop = ...` -> Form property/event
    return { owner: '__form__', chain: segments, usedThis };
  }

  // Multiple segments: `first.rest...`
  const first = segments[0];
  if (instances.has(first) || existingFields[first]) {
    return { owner: first, chain: segments.slice(1), usedThis };
  }

  // Otherwise could be form sub-property like `this.Controls.Add` or `this.Padding`
  return { owner: '__form__', chain: segments, usedThis };
}

function parseEventHandlerRhs(
  rhs: Token[],
  source: string
): { handlerName: string; isExplicit: boolean; delegateType?: string } | null {
  if (rhs.length === 0) return null;

  // Shorthand: `btn_Click` or `this.btn_Click`
  const simple = parseSimpleFieldRef(rhs);
  if (simple) {
    return { handlerName: simple.name, isExplicit: false };
  }

  // Explicit delegate: `new [System.]EventHandler([this.]btn_Click)`
  if (rhs[0].text === 'new') {
    const openParen = rhs.findIndex((t) => t.text === '(');
    if (openParen > 1) {
      const closeParen = findMatchingDelimiter(rhs, openParen, '(', ')');
      if (closeParen === rhs.length - 1) {
        const inner = rhs.slice(openParen + 1, closeParen);
        const ref = parseSimpleFieldRef(inner);
        if (ref) {
          const delegateType = source
            .slice(rhs[1].start, rhs[openParen - 1].end)
            .replace(/\s+/g, '');
          return { handlerName: ref.name, isExplicit: true, delegateType };
        }
      }
    }
  }

  return null;
}

function parseMethodCall(
  tokens: Token[],
  instances: Map<string, ParsedInstance>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): {
  owner: string;
  chain: string[];
  argTokenSlices: Token[][];
  usedThis: boolean;
} | null {
  if (tokens.length < 3 || tokens[tokens.length - 1].text !== ')') return null;

  // Find matching `(` for the trailing `)`
  let depth = 0;
  let openParen = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].text === ')') depth++;
    else if (tokens[i].text === '(') {
      depth--;
      if (depth === 0) {
        openParen = i;
        break;
      }
    }
  }
  if (openParen <= 0) return null;

  const calleeTokens = tokens.slice(0, openParen);
  const target = parseTargetChain(calleeTokens, instances, existingFields);
  if (!target || target.chain.length === 0) return null;

  const argTokens = tokens.slice(openParen + 1, tokens.length - 1);
  const argTokenSlices = splitTokenArguments(argTokens);

  return {
    owner: target.owner,
    chain: target.chain,
    argTokenSlices,
    usedThis: target.usedThis,
  };
}

function splitTokenArguments(tokens: Token[]): Token[][] {
  if (tokens.length === 0) return [];
  const args: Token[][] = [];
  let current: Token[] = [];
  let paren = 0;
  let brace = 0;
  let bracket = 0;

  for (const t of tokens) {
    if (t.text === '(') paren++;
    else if (t.text === ')') paren = Math.max(0, paren - 1);
    else if (t.text === '{') brace++;
    else if (t.text === '}') brace = Math.max(0, brace - 1);
    else if (t.text === '[') bracket++;
    else if (t.text === ']') bracket = Math.max(0, bracket - 1);
    else if (t.text === ',' && paren === 0 && brace === 0 && bracket === 0) {
      args.push(current);
      current = [];
      continue;
    }
    current.push(t);
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function handleCollectionOrHierarchyCall(
  owner: string,
  prefixChain: string,
  methodName: string,
  args: Token[][],
  source: string,
  instances: Map<string, ParsedInstance>,
  formChildRefs: ChildRef[],
  formDataBindings: DataBindingEntry[],
  parsedTreeNodes: Map<string, ParsedTreeNode>
): boolean {
  // 0. DataBindings.Add(...) on either the Form or a control
  if (prefixChain === 'DataBindings' && methodName === 'Add') {
    const entry = parseDataBindingAddArgs(args, source);
    if (!entry) return false;
    if (owner === '__form__') {
      formDataBindings.push(entry);
      return true;
    }
    const targetInst = instances.get(owner);
    if (!targetInst) return false;
    targetInst.dataBindings.push(entry);
    return true;
  }

  // 1. Controls.Add / Controls.AddRange / Controls.SetChildIndex / Panel1.Controls.* / Panel2.Controls.* / TabPages.*
  if (
    (prefixChain === 'Controls' ||
      prefixChain === 'Panel1.Controls' ||
      prefixChain === 'Panel2.Controls' ||
      prefixChain === 'TabPages') &&
    (methodName === 'Add' || methodName === 'AddRange' || methodName === 'SetChildIndex')
  ) {
    const panelSlot: 'Panel1' | 'Panel2' | undefined =
      prefixChain === 'Panel1.Controls'
        ? 'Panel1'
        : prefixChain === 'Panel2.Controls'
          ? 'Panel2'
          : undefined;

    const targetList =
      owner === '__form__' ? formChildRefs : instances.get(owner)?.childRefs;
    if (!targetList) return false;

    if (methodName === 'SetChildIndex' && args.length === 2) {
      const ref = parseSimpleFieldRef(args[0]);
      const desiredIndex = tryParseNumber(args[1]);
      if (!ref || desiredIndex === null) return false;
      const existingIdx = targetList.findIndex(
        (c) => c.name === ref.name && (panelSlot === undefined || c.panelSlot === panelSlot)
      );
      if (existingIdx < 0) {
        // Control might be inherited from base Form; preserve SetChildIndex verbatim in rawStatements
        return false;
      }
      const [moved] = targetList.splice(existingIdx, 1);
      const clampedIdx = Math.max(0, Math.min(Math.trunc(desiredIndex), targetList.length));
      targetList.splice(clampedIdx, 0, moved);
      return true;
    }

    if (methodName === 'Add') {
      // Controls.Add(ctrl) OR TableLayoutPanel Controls.Add(ctrl, col, row)
      if (args.length === 1) {
        const ref = parseSimpleFieldRef(args[0]);
        if (!ref) return false;
        targetList.push({ name: ref.name, ...(panelSlot ? { panelSlot } : {}) });
        return true;
      }
      if (args.length === 3) {
        const ref = parseSimpleFieldRef(args[0]);
        const col = tryParseNumber(args[1]);
        const row = tryParseNumber(args[2]);
        if (!ref || col === null || row === null) return false;
        targetList.push({ name: ref.name, column: col, row, explicitTableCell: true });
        return true;
      }
      return false;
    }

    if (methodName === 'AddRange' && args.length === 1) {
      const elements = extractArrayElements(args[0]);
      if (!elements) return false;
      const refs: string[] = [];
      for (const el of elements) {
        const ref = parseSimpleFieldRef(el);
        if (!ref) return false;
        refs.push(ref.name);
      }
      for (const r of refs) {
        targetList.push({ name: r, ...(panelSlot ? { panelSlot } : {}) });
      }
      return true;
    }
  }

  // All remaining calls require a non-form instance
  if (owner === '__form__') return false;
  const inst = instances.get(owner);
  if (!inst) return false;

  // 2. TableLayoutPanel SetColumnSpan / SetRowSpan
  if (prefixChain === '' && (methodName === 'SetColumnSpan' || methodName === 'SetRowSpan')) {
    if (args.length === 2) {
      const ref = parseSimpleFieldRef(args[0]);
      const span = tryParseNumber(args[1]);
      if (ref && span !== null) {
        if (methodName === 'SetColumnSpan') inst.columnSpans.set(ref.name, span);
        else inst.rowSpans.set(ref.name, span);
        return true;
      }
    }
    return false;
  }

  // 3. TableLayoutPanel ColumnStyles.Add / RowStyles.Add
  if ((prefixChain === 'ColumnStyles' || prefixChain === 'RowStyles') && methodName === 'Add') {
    if (args.length === 1) {
      const trackStyle = parseTableTrackStyle(args[0]);
      if (trackStyle) {
        if (prefixChain === 'ColumnStyles') inst.columnStyles.push(trackStyle);
        else inst.rowStyles.push(trackStyle);
        return true;
      }
    }
    return false;
  }

  // 4. Strip Items / DropDownItems & ListBox/ComboBox/CheckedListBox/DomainUpDown Items
  if (
    (prefixChain === 'Items' || prefixChain === 'DropDownItems') &&
    (methodName === 'Add' || methodName === 'AddRange')
  ) {
    const isStrip =
      inst.type === 'MenuStrip' ||
      inst.type === 'ToolStrip' ||
      inst.type === 'StatusStrip' ||
      inst.type === 'ContextMenuStrip' ||
      STRIP_ITEM_TYPES.has(inst.type as StripItemNode['type']);

    if (isStrip) {
      if (methodName === 'Add' && args.length === 1) {
        const ref = parseSimpleFieldRef(args[0]);
        if (!ref) return false;
        inst.stripItemRefs.push(ref.name);
        return true;
      }
      if (methodName === 'AddRange' && args.length === 1) {
        const elements = extractArrayElements(args[0]);
        if (!elements) return false;
        const refs: string[] = [];
        for (const el of elements) {
          const ref = parseSimpleFieldRef(el);
          if (!ref) return false;
          refs.push(ref.name);
        }
        inst.stripItemRefs.push(...refs);
        return true;
      }
      return false;
    }

    // List controls: ListBox, ComboBox, CheckedListBox, DomainUpDown
    if (methodName === 'Add' && args.length === 1) {
      const str = tryParseStringExpression(args[0]);
      if (str !== null) {
        inst.items = inst.items ?? [];
        inst.items.push(str);
        return true;
      }
      return false;
    }
    if (methodName === 'AddRange' && args.length === 1) {
      const elements = extractArrayElements(args[0]);
      if (!elements) return false;
      const strings: string[] = [];
      for (const el of elements) {
        const str = tryParseStringExpression(el);
        if (str === null) return false;
        strings.push(str);
      }
      inst.items = inst.items ?? [];
      inst.items.push(...strings);
      return true;
    }
    return false;
  }

  // 5. DataGridView / ListView Columns.Add / Columns.AddRange
  if (prefixChain === 'Columns' && (methodName === 'Add' || methodName === 'AddRange')) {
    const isListView = inst.type === 'ListView';
    const targetRefs = isListView ? inst.listViewColumnRefs : inst.columnRefs;

    if (methodName === 'Add' && args.length === 1) {
      const ref = parseSimpleFieldRef(args[0]);
      if (!ref) return false;
      targetRefs.push(ref.name);
      return true;
    }
    if (methodName === 'AddRange' && args.length === 1) {
      const elements = extractArrayElements(args[0]);
      if (!elements) return false;
      const refs: string[] = [];
      for (const el of elements) {
        const ref = parseSimpleFieldRef(el);
        if (!ref) return false;
        refs.push(ref.name);
      }
      targetRefs.push(...refs);
      return true;
    }
    return false;
  }

  // 6. TreeView Nodes.Add / Nodes.AddRange
  if (prefixChain === 'Nodes' && (methodName === 'Add' || methodName === 'AddRange')) {
    if (methodName === 'Add') {
      if (args.length === 1) {
        const ref = parseSimpleFieldRef(args[0]);
        if (ref && !ref.usedThis && parsedTreeNodes.has(ref.name)) {
          inst.treeNodeRefs.push(ref.name);
          return true;
        }
        const inlineTn = tryParseInlineTreeNode(args[0], parsedTreeNodes);
        if (inlineTn) {
          inst.treeNodeRefs.push(inlineTn);
          return true;
        }
        const text = tryParseStringExpression(args[0]);
        if (text !== null) {
          inst.treeNodeRefs.push({ id: '', text });
          return true;
        }
      } else if (args.length === 2) {
        const key = tryParseStringExpression(args[0]);
        const text = tryParseStringExpression(args[1]);
        if (key !== null && text !== null) {
          inst.treeNodeRefs.push({ id: '', name: key, text });
          return true;
        }
      }
      return false;
    }

    if (methodName === 'AddRange' && args.length === 1) {
      const elements = extractArrayElements(args[0]);
      if (!elements) return false;
      const parsedRefs: Array<string | TreeNodeItem> = [];
      for (const el of elements) {
        const ref = parseSimpleFieldRef(el);
        if (ref && !ref.usedThis && parsedTreeNodes.has(ref.name)) {
          parsedRefs.push(ref.name);
          continue;
        }
        const inlineTn = tryParseInlineTreeNode(el, parsedTreeNodes);
        if (inlineTn) {
          parsedRefs.push(inlineTn);
          continue;
        }
        return false;
      }
      inst.treeNodeRefs.push(...parsedRefs);
      return true;
    }
    return false;
  }

  void source;
  return false;
}

function normalizeBindingDataSource(rawExpr: string): string {
  const trimmed = rawExpr.trim();
  const simpleThisMatch = /^this\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  if (simpleThisMatch) {
    return simpleThisMatch[1];
  }
  return trimmed;
}

function tryParseBooleanLiteral(tokens: Token[]): boolean | undefined {
  const u = unwrapOuterParens(tokens);
  if (u.length === 1 && u[0].kind === 'keyword') {
    if (u[0].text === 'true') return true;
    if (u[0].text === 'false') return false;
  }
  return undefined;
}

function parseDataBindingAddArgs(args: Token[][], source: string): DataBindingEntry | null {
  if (args.length === 0) return null;

  const firstTok = args[0][0];
  const lastSlice = args[args.length - 1];
  const lastTok = lastSlice[lastSlice.length - 1];
  if (!firstTok || !lastTok) return null;
  const rawExpression = source.slice(firstTok.start, lastTok.end).trim();

  // Case 1: DataBindings.Add(new [System.Windows.Forms.]Binding(prop, dataSource, dataMember[, formattingEnabled[, updateMode...]]))
  if (args.length === 1) {
    const inner = unwrapOuterParens(args[0]);
    if (inner.length < 4 || inner[0].text !== 'new') return null;
    const openParen = inner.findIndex((t) => t.text === '(');
    if (openParen < 2) return null;
    const closeParen = findMatchingDelimiter(inner, openParen, '(', ')');
    if (closeParen !== inner.length - 1) return null;

    const rawType = inner
      .slice(1, openParen)
      .map((t) => t.text)
      .join('');
    if (extractShortTypeName(rawType) !== 'Binding') return null;

    const bArgs = splitTokenArguments(inner.slice(openParen + 1, closeParen));
    return parseBindingArgTuple(bArgs, source, rawExpression);
  }

  // Case 2: Shorthand DataBindings.Add("Text", this.bindingSource1, "Name"[, true[, updateMode...]])
  if (args.length >= 3) {
    return parseBindingArgTuple(args, source, rawExpression);
  }

  return null;
}

function parseBindingArgTuple(
  bArgs: Token[][],
  source: string,
  rawExpression: string
): DataBindingEntry | null {
  if (bArgs.length < 3) return null;
  const propertyName = tryParseStringExpression(bArgs[0]);
  if (propertyName === null) return null;

  const dsTokens = bArgs[1];
  if (dsTokens.length === 0) return null;
  const rawDataSource = source.slice(dsTokens[0].start, dsTokens[dsTokens.length - 1].end).trim();
  if (!rawDataSource) return null;
  const hadThisPrefix = /^this\.[A-Za-z_][A-Za-z0-9_]*$/.test(rawDataSource);
  const isBareIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawDataSource) && rawDataSource !== 'this' && rawDataSource !== 'null';
  const sourceQualifier: 'this' | 'none' | undefined = hadThisPrefix
    ? 'this'
    : isBareIdent
      ? 'none'
      : undefined;
  const dataSource = normalizeBindingDataSource(rawDataSource);

  const dataMember = tryParseStringExpression(bArgs[2]);
  if (dataMember === null) return null;

  let formattingEnabled: boolean | undefined;
  if (bArgs.length >= 4) {
    const parsedBool = tryParseBooleanLiteral(bArgs[3]);
    if (parsedBool === undefined) {
      return null;
    }
    formattingEnabled = parsedBool;
  }

  let extraArgs: string | undefined;
  if (bArgs.length >= 5) {
    const firstExtra = bArgs[4][0];
    const lastExtraSlice = bArgs[bArgs.length - 1];
    const lastExtra = lastExtraSlice[lastExtraSlice.length - 1];
    if (firstExtra && lastExtra) {
      const sliced = source.slice(firstExtra.start, lastExtra.end).trim();
      if (sliced) {
        extraArgs = sliced;
      }
    }
  }

  return {
    propertyName,
    dataSource,
    dataMember,
    ...(formattingEnabled !== undefined ? { formattingEnabled } : {}),
    ...(extraArgs !== undefined ? { extraArgs } : {}),
    ...(sourceQualifier !== undefined ? { sourceQualifier } : {}),
    ...(rawExpression ? { rawExpression } : {}),
  };
}

/**
 * Checks whether a preserved raw C# DataBindings.Add(...) argument list still
 * parses to the same structured `DataBindingEntry`.
 */
export function doesRawDataBindingMatchEntry(
  rawExpr: string,
  entry: DataBindingEntry
): boolean {
  const trimmed = rawExpr.trim();
  if (!trimmed) return false;
  const tokens = tokenizeCSharp(trimmed).filter((t) => t.kind !== 'eof');
  if (tokens.length === 0) return false;
  const args = splitTokenArguments(tokens);
  const parsed = parseDataBindingAddArgs(args, trimmed);
  if (!parsed) return false;
  return (
    parsed.propertyName === entry.propertyName &&
    parsed.dataSource === normalizeBindingDataSource(entry.dataSource) &&
    parsed.dataMember === entry.dataMember &&
    Boolean(parsed.formattingEnabled) === Boolean(entry.formattingEnabled) &&
    (parsed.extraArgs ?? '') === (entry.extraArgs ?? '')
  );
}

function extractArrayElements(tokens: Token[]): Token[][] | null {
  const unwrapped = unwrapOuterParens(tokens);
  if (unwrapped.length < 2) return null;

  // C# 12 collection expression: `[a, b, c]`
  if (unwrapped[0].text === '[' && unwrapped[unwrapped.length - 1].text === ']') {
    return splitTokenArguments(unwrapped.slice(1, -1));
  }

  // `new Type[] { a, b, c }` or `new[] { a, b, c }` or `{ a, b, c }`
  const openBrace = unwrapped.findIndex((t) => t.text === '{');
  if (openBrace < 0) return null;
  const closeBrace = findMatchingBrace(unwrapped, openBrace);
  if (closeBrace !== unwrapped.length - 1) return null;

  const inner = unwrapped.slice(openBrace + 1, closeBrace);
  return splitTokenArguments(inner);
}

function parseTableTrackStyle(tokens: Token[]): TableTrackStyle | null {
  const unwrapped = unwrapOuterParens(tokens);
  if (unwrapped.length < 3 || unwrapped[0].text !== 'new') return null;

  const openParen = unwrapped.findIndex((t) => t.text === '(');
  if (openParen < 2) return null;
  const closeParen = findMatchingDelimiter(unwrapped, openParen, '(', ')');
  if (closeParen !== unwrapped.length - 1) return null;

  const typeText = unwrapped
    .slice(1, openParen)
    .map((t) => t.text)
    .join('');
  const shortType = extractShortTypeName(typeText);
  if (shortType !== 'ColumnStyle' && shortType !== 'RowStyle') return null;

  const args = splitTokenArguments(unwrapped.slice(openParen + 1, closeParen));
  if (args.length === 0) {
    return { sizeType: 'AutoSize', value: 0 };
  }

  const sizeTypeToken = args[0][args[0].length - 1]?.text;
  if (
    sizeTypeToken !== 'Percent' &&
    sizeTypeToken !== 'Absolute' &&
    sizeTypeToken !== 'AutoSize'
  ) {
    return null;
  }

  const value = args.length >= 2 ? (tryParseNumber(args[1]) ?? 0) : 0;
  return { sizeType: sizeTypeToken, value };
}

// ---------------------------------------------------------------------------
// Property Value Parsing
// ---------------------------------------------------------------------------

function parsePropertyValue(
  rawTokens: Token[],
  source: string,
  propName: string,
  resourceVarName: string,
  resources: ResourceMap,
  instances: Map<string, ParsedInstance>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): PropertyValue {
  const rawExpr =
    rawTokens.length > 0
      ? source.slice(rawTokens[0].start, rawTokens[rawTokens.length - 1].end).trim()
      : '';
  const tokens = unwrapOuterParens(rawTokens);
  if (tokens.length === 0) {
    return { kind: 'raw', expression: rawExpr };
  }

  // 1. Boolean
  if (tokens.length === 1 && tokens[0].kind === 'keyword') {
    if (tokens[0].text === 'true') return true;
    if (tokens[0].text === 'false') return false;
  }

  // 2. String literal (including `"a" + "b"` and `string.Empty`)
  const strVal = tryParseStringExpression(tokens);
  if (strVal !== null) return strVal;

  // 3. Char literal (only decode as string for known CHAR_PROPERTIES like PasswordChar / PromptChar)
  if (tokens.length === 1 && tokens[0].kind === 'char') {
    const leafProp = propName.includes('.') ? propName.slice(propName.lastIndexOf('.') + 1) : propName;
    if (CHAR_PROPERTIES.has(leafProp)) {
      const ch = decodeCharLiteral(tokens[0].text);
      if (ch !== null) return ch;
    }
    return { kind: 'raw', expression: rawExpr };
  }

  // 4. Number literal (including casts like `((byte)(0))`)
  const numVal = tryParseNumber(tokens);
  if (numVal !== null) return numVal;

  // 5. Resource expression: `resources.GetObject("...")` / `((Image)(resources.GetObject("...")))`
  const resVal = tryParseResourceValue(rawTokens, source, propName, resourceVarName, resources);
  if (resVal) return resVal;

  // 6. `new ...(...)` constructors: decimal, Point, Size, SizeF, Padding, Font
  if (tokens[0].text === 'new') {
    const ctorVal = tryParseNewExpression(tokens);
    if (ctorVal !== null) return ctorVal;
  }

  // 6b. String arrays: `new string[] { "Line 1", "Line 2" }` / `["Line 1", "Line 2"]`
  const strArrayExpr = tryParseStringArrayExpression(tokens);
  if (strArrayExpr !== null) {
    return { kind: 'raw', expression: strArrayExpr };
  }

  // 7. Color: `Color.FromArgb(...)`, `Color.<Name>`, `SystemColors.<Name>`
  const colorVal = tryParseColorValue(tokens);
  if (colorVal) return colorVal;

  // 8. Flags or Enum (including `((AnchorStyles)((AnchorStyles.Top | AnchorStyles.Left)))`)
  const enumOrFlags = tryParseEnumOrFlags(tokens, propName, instances, existingFields);
  if (enumOrFlags) return enumOrFlags;

  // 9. Fallback: preserve raw C# expression verbatim
  return { kind: 'raw', expression: rawExpr };
}

function unwrapOuterParens(tokens: Token[]): Token[] {
  let result = tokens;
  while (result.length >= 2 && result[0].text === '(') {
    const closeIdx = findMatchingDelimiter(result, 0, '(', ')');
    if (closeIdx === result.length - 1) {
      result = result.slice(1, -1);
    } else {
      break;
    }
  }
  return result;
}

function tryParseStringExpression(tokens: Token[]): string | null {
  const t = unwrapOuterParens(tokens);
  if (t.length === 0) return null;

  // `string.Empty` or `System.String.Empty` or `global::System.String.Empty`
  const joined = t.map((tok) => tok.text).join('').replace(/^global::/, '');
  if (joined === 'string.Empty' || joined === 'System.String.Empty' || joined === 'String.Empty') {
    return '';
  }

  // Single string literal (exclude interpolated strings with `{...}` that aren't plain literals)
  if (t.length === 1 && t[0].kind === 'string' && isCSharpStringLiteral(t[0].text)) {
    return decodeCSharpString(t[0].text);
  }

  // Concatenation of string literals: `"line1" + "line2"`
  if (t.length >= 3 && t.length % 2 === 1) {
    let out = '';
    for (let i = 0; i < t.length; i++) {
      if (i % 2 === 0) {
        if (t[i].kind !== 'string' || !isCSharpStringLiteral(t[i].text)) return null;
        out += decodeCSharpString(t[i].text);
      } else if (t[i].text !== '+') {
        return null;
      }
    }
    return out;
  }

  return null;
}

function decodeCharLiteral(text: string): string | null {
  if (text.length < 3 || !text.startsWith("'") || !text.endsWith("'")) return null;
  const inner = text.slice(1, -1);
  return decodeCSharpString(`"${inner.replace(/"/g, '\\"')}"`);
}

function hasFractionalOrFloatLiteral(tokens: Token[]): boolean {
  for (const tok of tokens) {
    if (tok.kind !== 'number') continue;
    const noUnderscores = tok.text.replace(/_/g, '');
    if (/^0[xXbB]/.test(noUnderscores)) continue;
    if (/[.eEfFdDmM]/.test(noUnderscores)) {
      return true;
    }
  }
  return false;
}

function tryParseNumber(tokens: Token[]): number | null {
  const t = unwrapOuterParens(tokens);
  if (t.length === 0) return null;

  // Unwrap numeric cast: `(byte)(0)`, `(int)(((byte)(120)))`, `(decimal)100`
  if (t[0].text === '(') {
    const closeIdx = findMatchingDelimiter(t, 0, '(', ')');
    if (closeIdx > 1 && closeIdx < t.length - 1) {
      const castTypeTokens = t.slice(1, closeIdx);
      const castTypeName = extractShortTypeName(castTypeTokens.map((x) => x.text).join(''));
      if (NUMERIC_CAST_TYPES.has(castTypeName)) {
        const innerSlice = t.slice(closeIdx + 1);
        // Do NOT strip narrowing casts like `(int)0.75` or `(byte)2.5F` into floating-point values
        if (INTEGER_CAST_TYPES.has(castTypeName) && hasFractionalOrFloatLiteral(innerSlice)) {
          return null;
        }
        const innerVal = tryParseNumber(innerSlice);
        if (innerVal === null) return null;
        if (INTEGER_CAST_TYPES.has(castTypeName) && !Number.isInteger(innerVal)) {
          return null;
        }
        return innerVal;
      }
    }
  }

  let sign = 1;
  let idx = 0;
  if (t[0].text === '-' && t.length === 2) {
    sign = -1;
    idx = 1;
  } else if (t[0].text === '+' && t.length === 2) {
    idx = 1;
  } else if (t.length !== 1) {
    return null;
  }

  const tok = t[idx];
  if (tok.kind !== 'number') return null;

  const noUnderscores = tok.text.replace(/_/g, '');
  if (!noUnderscores) return null;

  let val: number;
  if (/^0[xX]/.test(noUnderscores)) {
    // Only strip integer suffixes u/U/l/L from hex literals — NEVER f/F/d/D/m/M!
    const hexClean = noUnderscores.replace(/[uUlL]+$/, '');
    if (hexClean.length <= 2) return null;
    val = parseInt(hexClean.slice(2), 16);
  } else if (/^0[bB]/.test(noUnderscores)) {
    const binClean = noUnderscores.replace(/[uUlL]+$/, '');
    if (binClean.length <= 2) return null;
    val = parseInt(binClean.slice(2), 2);
  } else {
    const decClean = noUnderscores.replace(/[fFdDmMuUlL]+$/, '');
    if (!decClean) return null;
    val = Number(decClean);
  }
  return Number.isFinite(val) ? sign * val : null;
}

function tryParseNewExpression(tokens: Token[]): PropertyValue | null {
  const openParen = tokens.findIndex((t) => t.text === '(');
  if (openParen < 2) return null;
  const closeParen = findMatchingDelimiter(tokens, openParen, '(', ')');
  if (closeParen !== tokens.length - 1) return null;

  const rawType = tokens
    .slice(1, openParen)
    .map((t) => t.text)
    .join('');
  const shortType = extractShortTypeName(rawType);
  const args = splitTokenArguments(tokens.slice(openParen + 1, closeParen));

  // new decimal(new int[] { low, mid, high, flags })
  if (shortType === 'decimal' || shortType === 'Decimal') {
    if (args.length === 1) {
      const elements = extractArrayElements(args[0]);
      if (elements && elements.length === 4) {
        const bits = elements.map((el) => tryParseNumber(el));
        if (bits.every((b): b is number => b !== null)) {
          if (!isLosslessDotNetDecimal(bits[0], bits[1], bits[2], bits[3])) {
            return null;
          }
          return decodeDotNetDecimalBits(bits[0], bits[1], bits[2], bits[3]);
        }
      }
      const singleNum = tryParseNumber(args[0]);
      if (singleNum !== null) return singleNum;
    }
    return null;
  }

  // new Point(x, y)
  if (shortType === 'Point' && args.length === 2) {
    const x = tryParseNumber(args[0]);
    const y = tryParseNumber(args[1]);
    if (x !== null && y !== null) {
      const pt: PointValue = { kind: 'point', x, y };
      return pt;
    }
    return null;
  }

  // new Size(w, h)
  if (shortType === 'Size' && args.length === 2) {
    const width = tryParseNumber(args[0]);
    const height = tryParseNumber(args[1]);
    if (width !== null && height !== null) {
      const sz: SizeValue = { kind: 'size', width, height };
      return sz;
    }
    return null;
  }

  // new SizeF(w, h)
  if (shortType === 'SizeF' && args.length === 2) {
    const width = tryParseNumber(args[0]);
    const height = tryParseNumber(args[1]);
    if (width !== null && height !== null) {
      const szf: SizeFValue = { kind: 'sizeF', width, height };
      return szf;
    }
    return null;
  }

  // new Padding(all) or new Padding(l, t, r, b)
  if (shortType === 'Padding') {
    if (args.length === 1) {
      const all = tryParseNumber(args[0]);
      if (all !== null) {
        const pad: PaddingValue = {
          kind: 'padding',
          all,
          left: all,
          top: all,
          right: all,
          bottom: all,
        };
        return pad;
      }
    } else if (args.length === 4) {
      const left = tryParseNumber(args[0]);
      const top = tryParseNumber(args[1]);
      const right = tryParseNumber(args[2]);
      const bottom = tryParseNumber(args[3]);
      if (left !== null && top !== null && right !== null && bottom !== null) {
        const pad: PaddingValue = {
          kind: 'padding',
          ...(left === top && top === right && right === bottom ? { all: left } : {}),
          left,
          top,
          right,
          bottom,
        };
        return pad;
      }
    }
    return null;
  }

  // new Font(family, size[, style[, unit[, gdiCharSet[, gdiVerticalFont]]]])
  if (shortType === 'Font' && args.length >= 2 && args.length <= 6) {
    const family = tryParseStringExpression(args[0]);
    const size = tryParseNumber(args[1]);
    if (family === null || size === null) return null;

    let bold = false;
    let italic = false;
    let underline = false;
    let strikeout = false;
    let unit: FontValue['unit'] = 'Point';
    let gdiCharSet: number | undefined;

    if (args.length >= 3) {
      const styleArg = args[2];
      const styleFlags = extractFontStyles(styleArg);
      if (!styleFlags) {
        // Could be `new Font(family, size, GraphicsUnit.Pixel)` (3-arg GraphicsUnit overload!)
        const maybeUnit = extractGraphicsUnit(styleArg);
        if (maybeUnit) {
          unit = maybeUnit;
        } else {
          return null;
        }
      } else {
        bold = styleFlags.has('Bold');
        italic = styleFlags.has('Italic');
        underline = styleFlags.has('Underline');
        strikeout = styleFlags.has('Strikeout');
      }
    }

    if (args.length >= 4) {
      const u = extractGraphicsUnit(args[3]);
      if (u) unit = u;
    }

    if (args.length >= 5) {
      const cs = tryParseNumber(args[4]);
      if (cs !== null) gdiCharSet = cs;
    }

    const fontVal: FontValue = {
      kind: 'font',
      family,
      size,
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...(underline ? { underline: true } : {}),
      ...(strikeout ? { strikeout: true } : {}),
      unit,
      ...(gdiCharSet !== undefined ? { gdiCharSet } : {}),
    };
    return fontVal;
  }

  return null;
}

/**
 * Checks whether a .NET `decimal` bit pattern can be represented losslessly as a JS `number`.
 */
function isLosslessDotNetDecimal(low: number, mid: number, high: number, flags: number): boolean {
  const scale = (flags >>> 16) & 0xff;
  const magnitude =
    BigInt(low >>> 0) + (BigInt(mid >>> 0) << 32n) + (BigInt(high >>> 0) << 64n);
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
    return false;
  }
  if (scale > 15) {
    return false;
  }
  // Verify exact round-trip of scaled decimal digits
  const num = Number(magnitude) / Math.pow(10, scale);
  if (!Number.isFinite(num)) return false;
  const magStr = magnitude.toString();
  const expectedStr =
    scale === 0
      ? magStr
      : magStr.length <= scale
        ? `0.${'0'.repeat(scale - magStr.length)}${magStr}`.replace(/\.?0+$/, '') || '0'
        : `${magStr.slice(0, magStr.length - scale)}.${magStr.slice(magStr.length - scale)}`.replace(/\.?0+$/, '') || '0';
  return String(num) === expectedStr;
}

/**
 * Decodes .NET `new decimal(new int[] { low, mid, high, flags })` into a JS number.
 */
export function decodeDotNetDecimalBits(
  low: number,
  mid: number,
  high: number,
  flags: number
): number {
  const negative = (flags & 0x80000000) !== 0;
  const scale = (flags >>> 16) & 0xff;
  const magnitude =
    BigInt(low >>> 0) + (BigInt(mid >>> 0) << 32n) + (BigInt(high >>> 0) << 64n);
  const num = Number(magnitude) / Math.pow(10, scale);
  return negative ? (num === 0 ? 0 : -num) : num;
}

function extractFontStyles(tokens: Token[]): Set<string> | null {
  const members = extractBitwiseEnumMembers(tokens, 'FontStyle');
  if (!members) return null;
  return new Set(members);
}

function extractGraphicsUnit(tokens: Token[]): FontValue['unit'] | null {
  const t = unwrapOuterParens(tokens);
  const joined = t.map((x) => x.text).join('').replace(/^global::/, '');
  const match = /^(?:System\.Drawing\.)?GraphicsUnit\.(Point|Pixel|Display|Document|Inch|Millimeter|World)$/.exec(
    joined
  );
  return match ? (match[1] as FontValue['unit']) : null;
}

function tryParseColorValue(tokens: Token[]): ColorValue | null {
  const t = unwrapOuterParens(tokens);
  if (t.length < 3) return null;

  // Check `[global::][System.Drawing.]Color.FromArgb(...)`
  const openParen = t.findIndex((tok) => tok.text === '(');
  if (openParen > 0) {
    const closeParen = findMatchingDelimiter(t, openParen, '(', ')');
    if (closeParen === t.length - 1) {
      const callee = t
        .slice(0, openParen)
        .map((x) => x.text)
        .join('')
        .replace(/^global::/, '');
      if (callee === 'Color.FromArgb' || callee === 'System.Drawing.Color.FromArgb') {
        const args = splitTokenArguments(t.slice(openParen + 1, closeParen));
        if (args.length === 3) {
          const r = tryParseNumber(args[0]);
          const g = tryParseNumber(args[1]);
          const b = tryParseNumber(args[2]);
          if (r !== null && g !== null && b !== null) {
            return { kind: 'color', value: rgbToHex(r, g, b), a: 255, r, g, b };
          }
        } else if (args.length === 4) {
          const a = tryParseNumber(args[0]);
          const r = tryParseNumber(args[1]);
          const g = tryParseNumber(args[2]);
          const b = tryParseNumber(args[3]);
          if (a !== null && r !== null && g !== null && b !== null) {
            return { kind: 'color', value: rgbToHex(r, g, b), a, r, g, b };
          }
        } else if (args.length === 1) {
          const argb = tryParseNumber(args[0]);
          if (argb !== null) {
            const u = argb >>> 0;
            const a = (u >>> 24) & 0xff;
            const r = (u >>> 16) & 0xff;
            const g = (u >>> 8) & 0xff;
            const b = u & 0xff;
            return { kind: 'color', value: rgbToHex(r, g, b), a, r, g, b };
          }
        }
      }
    }
    return null;
  }

  const joined = t.map((x) => x.text).join('').replace(/^global::/, '');
  const sysMatch = /^(?:System\.Drawing\.)?SystemColors\.([A-Za-z_]\w*)$/.exec(joined);
  if (sysMatch) {
    return { kind: 'color', value: sysMatch[1], isSystem: true };
  }

  const namedMatch = /^(?:System\.Drawing\.)?Color\.([A-Za-z_]\w*)$/.exec(joined);
  if (namedMatch) {
    return { kind: 'color', value: namedMatch[1], isNamed: true };
  }

  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    clamp(r).toString(16).toUpperCase().padStart(2, '0') +
    clamp(g).toString(16).toUpperCase().padStart(2, '0') +
    clamp(b).toString(16).toUpperCase().padStart(2, '0')
  );
}

function tryParseResourceValue(
  rawTokens: Token[],
  source: string,
  propName: string,
  resourceVarName: string,
  resources: ResourceMap
): ResourceValue | null {
  const rawExpression =
    rawTokens.length > 0
      ? source.slice(rawTokens[0].start, rawTokens[rawTokens.length - 1].end).trim()
      : '';
  let castHint = '';
  let inner = unwrapOuterParens(rawTokens);

  // Strip C-style cast prefix: `((System.Drawing.Image)(...))` or `(Image)resources.GetObject(...)`
  while (inner.length >= 4 && inner[0].text === '(') {
    const closeIdx = findMatchingDelimiter(inner, 0, '(', ')');
    if (closeIdx > 1 && closeIdx < inner.length - 1) {
      castHint = inner
        .slice(1, closeIdx)
        .map((t) => t.text)
        .join('');
      inner = unwrapOuterParens(inner.slice(closeIdx + 1));
    } else {
      break;
    }
  }

  // Strip trailing `as System.Drawing.Image`
  const asIdx = inner.findIndex((t) => t.kind === 'keyword' && t.text === 'as');
  if (asIdx > 0) {
    castHint = inner
      .slice(asIdx + 1)
      .map((t) => t.text)
      .join('');
    inner = unwrapOuterParens(inner.slice(0, asIdx));
  }

  // Expect `<resourceVarName>.GetObject("...")` or `<resourceVarName>.GetString("...")`
  if (
    inner.length === 6 &&
    (inner[0].text === resourceVarName || inner[0].text === 'resources') &&
    inner[1].text === '.' &&
    (inner[2].text === 'GetObject' || inner[2].text === 'GetString') &&
    inner[3].text === '(' &&
    inner[4].kind === 'string' &&
    inner[5].text === ')'
  ) {
    const resourceName = decodeCSharpString(inner[4].text);
    const method = inner[2].text;
    const leafProp = propName.includes('.') ? propName.slice(propName.lastIndexOf('.') + 1) : propName;
    let resourceType: ResourceValue['resourceType'] = 'Object';
    if (method === 'GetString') {
      resourceType = 'String';
    } else if (castHint.includes('Icon') || (!castHint && leafProp === 'Icon')) {
      resourceType = 'Icon';
    } else if (
      castHint.includes('Image') ||
      castHint.includes('Bitmap') ||
      (!castHint && (leafProp === 'Image' || leafProp === 'BackgroundImage'))
    ) {
      resourceType = 'Image';
    }

    const relativePath = resources[resourceName]?.filePath;
    const normalizedCast = castHint.replace(/^global::/, '').trim();
    return {
      kind: 'resource',
      resourceName,
      resourceType,
      ...(relativePath ? { relativePath } : {}),
      ...(normalizedCast ? { castType: normalizedCast } : {}),
      ...(rawExpression ? { rawExpression } : {}),
    };
  }

  return null;
}

function tryParseEnumOrFlags(
  tokens: Token[],
  propName: string,
  instances: Map<string, ParsedInstance>,
  existingFields: DocumentStyleMetadata['existingFieldDeclarations']
): EnumValue | FlagsValue | null {
  let inner = unwrapOuterParens(tokens);
  let castEnumShort: string | null = null;

  // Unwrap enum cast: `((System.Windows.Forms.AnchorStyles)(...))`
  while (inner.length >= 4 && inner[0].text === '(') {
    const closeIdx = findMatchingDelimiter(inner, 0, '(', ')');
    if (closeIdx > 1 && closeIdx < inner.length - 1) {
      const castType = inner
        .slice(1, closeIdx)
        .map((t) => t.text)
        .join('');
      const shortCast = extractShortTypeName(castType);
      if (WINFORMS_ENUMS[shortCast] || EXTRA_KNOWN_ENUMS.has(shortCast)) {
        castEnumShort = shortCast;
        inner = unwrapOuterParens(inner.slice(closeIdx + 1));
        continue;
      }
    }
    break;
  }

  // Split by bitwise `|` recursively (unwrapping inner enum casts too)
  const operands = splitBitwiseOr(inner);
  if (!operands || operands.length === 0) return null;

  let enumShortType: string | null = castEnumShort;
  const members: string[] = [];

  for (const opTokens of operands) {
    let u = unwrapOuterParens(opTokens);
    // Unwrap optional inner enum cast on operand (e.g. `((Keys)(Keys.Control))`)
    while (u.length >= 4 && u[0].text === '(') {
      const closeIdx = findMatchingDelimiter(u, 0, '(', ')');
      if (closeIdx > 1 && closeIdx < u.length - 1) {
        const innerCast = extractShortTypeName(
          u
            .slice(1, closeIdx)
            .map((t) => t.text)
            .join('')
        );
        if (WINFORMS_ENUMS[innerCast] || EXTRA_KNOWN_ENUMS.has(innerCast)) {
          if (!enumShortType) enumShortType = innerCast;
          u = unwrapOuterParens(u.slice(closeIdx + 1));
          continue;
        }
      }
      break;
    }

    // Must be dotted identifier chain `[global::][Ns.]EnumType.Member`
    if (u.length < 3) return null;
    const joined = u.map((t) => t.text).join('').replace(/^global::/, '');
    if (!/^(?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*$/.test(joined)) return null;

    const parts = joined.split('.');
    const first = parts[0];
    if (first === 'this' || instances.has(first) || existingFields[first]) return null;

    const member = parts[parts.length - 1];
    const typeShort = parts[parts.length - 2];

    if (typeShort === 'Color' || typeShort === 'SystemColors' || typeShort === 'String' || typeShort === 'string') {
      return null;
    }

    const isKnownEnum =
      Boolean(WINFORMS_ENUMS[typeShort]) ||
      EXTRA_KNOWN_ENUMS.has(typeShort) ||
      joined.startsWith('System.Windows.Forms.') ||
      joined.startsWith('System.Drawing.');

    if (!isKnownEnum && operands.length === 1 && !castEnumShort) {
      return null;
    }

    if (enumShortType === null) {
      enumShortType = typeShort;
    } else if (enumShortType !== typeShort) {
      return null;
    }

    if (!members.includes(member)) {
      members.push(member);
    }
  }

  if (!enumShortType || members.length === 0) return null;

  const leafProp = propName.includes('.') ? propName.slice(propName.lastIndexOf('.') + 1) : propName;
  if (operands.length > 1 || enumShortType === 'AnchorStyles' || leafProp === 'Anchor') {
    return {
      kind: 'flags',
      typeName: enumShortType,
      values: members,
    };
  }

  return {
    kind: 'enum',
    typeName: enumShortType,
    value: members[0],
  };
}

function extractBitwiseEnumMembers(tokens: Token[], expectedEnum: string): string[] | null {
  let inner = unwrapOuterParens(tokens);
  while (inner.length >= 4 && inner[0].text === '(') {
    const closeIdx = findMatchingDelimiter(inner, 0, '(', ')');
    if (closeIdx > 1 && closeIdx < inner.length - 1) {
      const castShort = extractShortTypeName(
        inner
          .slice(1, closeIdx)
          .map((t) => t.text)
          .join('')
      );
      if (castShort === expectedEnum) {
        inner = unwrapOuterParens(inner.slice(closeIdx + 1));
        continue;
      }
    }
    break;
  }

  const operands = splitBitwiseOr(inner);
  if (!operands || operands.length === 0) return null;

  const members: string[] = [];
  for (const op of operands) {
    const u = unwrapOuterParens(op);
    const joined = u.map((t) => t.text).join('').replace(/^global::/, '');
    const parts = joined.split('.');
    if (parts.length < 2) return null;
    if (parts[parts.length - 2] !== expectedEnum) return null;
    members.push(parts[parts.length - 1]);
  }
  return members;
}

function splitBitwiseOr(tokens: Token[]): Token[][] | null {
  const inner = unwrapOuterParens(tokens);
  if (inner.length === 0) return null;

  const parts: Token[][] = [];
  let current: Token[] = [];
  let paren = 0;

  for (const t of inner) {
    if (t.text === '(') paren++;
    else if (t.text === ')') paren = Math.max(0, paren - 1);
    else if (t.kind === 'operator' && t.text === '|' && paren === 0) {
      if (current.length === 0) return null;
      const sub = splitBitwiseOr(current);
      if (!sub) return null;
      parts.push(...sub);
      current = [];
      continue;
    }
    current.push(t);
  }

  if (parts.length === 0) {
    return [inner];
  }
  if (current.length === 0) return null;
  const sub = splitBitwiseOr(current);
  if (!sub) return null;
  parts.push(...sub);
  return parts;
}

function detectIndent(
  source: string,
  tokens: Token[],
  classOpenBraceIndex: number,
  initMethodStartTokenIndex: number,
  initOpenBraceIndex: number,
  initCloseBraceIndex: number
): string {
  if (initMethodStartTokenIndex >= 0 && initOpenBraceIndex >= 0 && initCloseBraceIndex > initOpenBraceIndex + 1) {
    const methodTok = tokens[initMethodStartTokenIndex];
    const methodIndent = getLineIndent(source, methodTok.start);
    const firstStmtTok = tokens[initOpenBraceIndex + 1];
    const stmtIndent = getLineIndent(source, firstStmtTok.start);
    if (stmtIndent.startsWith(methodIndent) && stmtIndent.length > methodIndent.length) {
      return stmtIndent.slice(methodIndent.length);
    }
  }
  if (classOpenBraceIndex >= 0 && initMethodStartTokenIndex >= 0) {
    const classIndent = getLineIndent(source, tokens[classOpenBraceIndex].start);
    const methodIndent = getLineIndent(source, tokens[initMethodStartTokenIndex].start);
    if (methodIndent.startsWith(classIndent) && methodIndent.length > classIndent.length) {
      return methodIndent.slice(classIndent.length);
    }
  }
  return '    ';
}

function getLineIndent(source: string, offset: number): string {
  const lineStart = findLineStart(source, offset);
  let i = lineStart;
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) {
    i++;
  }
  return source.slice(lineStart, i);
}

function findLineStart(source: string, offset: number): number {
  let i = offset;
  while (i > 0 && source[i - 1] !== '\n' && source[i - 1] !== '\r') {
    i--;
  }
  return i;
}

function findSafeStatementStart(source: string, tokenStart: number): number {
  const lineStart = findLineStart(source, tokenStart);
  const leading = source.slice(lineStart, tokenStart);
  return /^[ \t]*$/.test(leading) ? lineStart : tokenStart;
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a preserved raw C# property expression still parses to the same
 * `PropertyValue` (meaning the property has not been edited since parsing).
 */
export function doesRawExpressionMatchValue(
  rawExpr: string,
  value: PropertyValue,
  propName: string,
  resourceVarName = 'resources'
): boolean {
  const trimmed = rawExpr.trim();
  if (!trimmed) return false;
  const tokens = tokenizeCSharp(trimmed).filter((t) => t.kind !== 'eof');
  if (tokens.length === 0) return false;
  const parsed = parsePropertyValue(
    tokens,
    trimmed,
    propName,
    resourceVarName,
    {},
    new Map(),
    {}
  );
  return propertyValuesEqual(parsed, value);
}

function propertyValuesEqual(a: PropertyValue, b: PropertyValue): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(a, b) || a === b;
  }
  if (typeof a === 'string' || typeof a === 'boolean') {
    return a === b;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (a.kind !== b.kind) return false;

  if (isPointValue(a) && isPointValue(b)) {
    return a.x === b.x && a.y === b.y;
  }
  if (isSizeValue(a) && isSizeValue(b)) {
    return a.width === b.width && a.height === b.height;
  }
  if (isSizeFValue(a) && isSizeFValue(b)) {
    return a.width === b.width && a.height === b.height;
  }
  if (isPaddingValue(a) && isPaddingValue(b)) {
    return (
      a.left === b.left &&
      a.top === b.top &&
      a.right === b.right &&
      a.bottom === b.bottom
    );
  }
  if (isColorValue(a) && isColorValue(b)) {
    return (
      a.value === b.value &&
      Boolean(a.isSystem) === Boolean(b.isSystem) &&
      Boolean(a.isNamed) === Boolean(b.isNamed) &&
      a.a === b.a &&
      a.r === b.r &&
      a.g === b.g &&
      a.b === b.b
    );
  }
  if (isFontValue(a) && isFontValue(b)) {
    return (
      a.family === b.family &&
      a.size === b.size &&
      Boolean(a.bold) === Boolean(b.bold) &&
      Boolean(a.italic) === Boolean(b.italic) &&
      Boolean(a.underline) === Boolean(b.underline) &&
      Boolean(a.strikeout) === Boolean(b.strikeout) &&
      (a.unit ?? 'Point') === (b.unit ?? 'Point') &&
      a.gdiCharSet === b.gdiCharSet
    );
  }
  if (isEnumValue(a) && isEnumValue(b)) {
    return a.typeName === b.typeName && a.value === b.value;
  }
  if (isFlagsValue(a) && isFlagsValue(b)) {
    return (
      a.typeName === b.typeName &&
      a.values.length === b.values.length &&
      a.values.every((v, idx) => v === b.values[idx])
    );
  }
  if (isResourceValue(a) && isResourceValue(b)) {
    return (
      a.resourceName === b.resourceName &&
      a.resourceType === b.resourceType &&
      a.castType === b.castType
    );
  }
  if (isRawExpressionValue(a) && isRawExpressionValue(b)) {
    return a.expression === b.expression;
  }
  return false;
}

function splitFieldDeclarators(tokens: Token[]): Token[][] {
  if (tokens.length === 0) return [];
  const slices: Token[][] = [];
  let current: Token[] = [];
  let angle = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;

  for (const t of tokens) {
    if (t.text === '<') angle++;
    else if (t.text === '>' && angle > 0) angle--;
    else if (t.text === '(') paren++;
    else if (t.text === ')' && paren > 0) paren--;
    else if (t.text === '{') brace++;
    else if (t.text === '}' && brace > 0) brace--;
    else if (t.text === '[') bracket++;
    else if (t.text === ']' && bracket > 0) bracket--;
    else if (t.text === ',' && angle === 0 && paren === 0 && brace === 0 && bracket === 0) {
      if (current.length > 0) {
        slices.push(current);
        current = [];
      }
      continue;
    }
    current.push(t);
  }
  if (current.length > 0) {
    slices.push(current);
  }
  return slices;
}

function tryParseTreeNodeDeclaration(
  bodyTokens: Token[],
  rawStatement: string
): ParsedTreeNode | null {
  const eqIdx = findTopLevelOperator(bodyTokens, '=');
  if (eqIdx < 2) return null;
  const varTok = bodyTokens[eqIdx - 1];
  if (varTok.kind !== 'identifier') return null;

  const lhsTypeRaw = bodyTokens
    .slice(0, eqIdx - 1)
    .map((t) => t.text)
    .join('');
  const lhsShort = extractShortTypeName(lhsTypeRaw);
  const isTreeNodeLhs = lhsShort === 'TreeNode' || lhsTypeRaw === 'var';
  if (!isTreeNodeLhs) return null;

  const rhs = unwrapOuterParens(bodyTokens.slice(eqIdx + 1));
  const parsedNew = parseTreeNodeNewArgs(rhs);
  if (!parsedNew) return null;

  return {
    varName: varTok.text,
    text: parsedNew.text,
    childRefs: parsedNew.childRefs,
    sourceStatements: [rawStatement],
    attached: false,
  };
}

function parseTreeNodeNewArgs(
  rhs: Token[]
): { text: string; childRefs: Array<string | TreeNodeItem> } | null {
  if (rhs.length < 3 || rhs[0].text !== 'new') return null;
  const openParen = rhs.findIndex((t) => t.text === '(');
  if (openParen < 1) return null;
  const closeParen = findMatchingDelimiter(rhs, openParen, '(', ')');
  if (closeParen !== rhs.length - 1) return null;

  if (openParen > 1) {
    const rawType = rhs
      .slice(1, openParen)
      .map((t) => t.text)
      .join('');
    if (extractShortTypeName(rawType) !== 'TreeNode') return null;
  }

  const args = splitTokenArguments(rhs.slice(openParen + 1, closeParen));
  if (args.length === 0) {
    return { text: '', childRefs: [] };
  }

  const text = tryParseStringExpression(args[0]);
  if (text === null) return null;

  const childRefs: Array<string | TreeNodeItem> = [];
  // Overloads: (text), (text, TreeNode[]), (text, imgIdx, selImgIdx), (text, imgIdx, selImgIdx, TreeNode[])
  let childrenArg: Token[] | undefined;
  if (args.length === 2) {
    childrenArg = args[1];
  } else if (args.length === 4) {
    childrenArg = args[3];
  }

  if (childrenArg) {
    const elements = extractArrayElements(childrenArg);
    if (!elements) return null;
    for (const el of elements) {
      const ref = parseSimpleFieldRef(el);
      if (ref && !ref.usedThis) {
        childRefs.push(ref.name);
        continue;
      }
      const nested = parseTreeNodeNewArgs(unwrapOuterParens(el));
      if (nested) {
        childRefs.push({
          id: '',
          text: nested.text,
          ...(nested.childRefs.length > 0
            ? {
                children: nested.childRefs.filter(
                  (c): c is TreeNodeItem => typeof c !== 'string'
                ),
              }
            : {}),
        });
        continue;
      }
      return null;
    }
  }

  return { text, childRefs };
}

function tryParseInlineTreeNode(
  tokens: Token[],
  parsedTreeNodes: Map<string, ParsedTreeNode>
): TreeNodeItem | null {
  const parsed = parseTreeNodeNewArgs(unwrapOuterParens(tokens));
  if (!parsed) return null;
  const children = buildTreeNodeItems(parsed.childRefs, parsedTreeNodes, 'inline');
  return {
    id: '',
    text: parsed.text,
    ...(children.length > 0 ? { children } : {}),
  };
}

function tryHandleTreeNodeMethodCall(
  tn: ParsedTreeNode,
  bodyTokens: Token[],
  rawStatement: string
): boolean {
  // Match `<varName>.Nodes.Add(...)` or `<varName>.Nodes.AddRange(...)`
  if (bodyTokens.length < 7 || bodyTokens[bodyTokens.length - 1].text !== ')') return false;
  if (
    bodyTokens[1].text !== '.' ||
    bodyTokens[2].text !== 'Nodes' ||
    bodyTokens[3].text !== '.' ||
    (bodyTokens[4].text !== 'Add' && bodyTokens[4].text !== 'AddRange') ||
    bodyTokens[5].text !== '('
  ) {
    return false;
  }
  const closeParen = findMatchingDelimiter(bodyTokens, 5, '(', ')');
  if (closeParen !== bodyTokens.length - 1) return false;

  const methodName = bodyTokens[4].text;
  const args = splitTokenArguments(bodyTokens.slice(6, closeParen));

  if (methodName === 'Add') {
    if (args.length === 1) {
      const ref = parseSimpleFieldRef(args[0]);
      if (ref && !ref.usedThis) {
        tn.childRefs.push(ref.name);
        tn.sourceStatements.push(rawStatement);
        return true;
      }
      const text = tryParseStringExpression(args[0]);
      if (text !== null) {
        tn.childRefs.push({ id: '', text });
        tn.sourceStatements.push(rawStatement);
        return true;
      }
    } else if (args.length === 2) {
      const key = tryParseStringExpression(args[0]);
      const text = tryParseStringExpression(args[1]);
      if (key !== null && text !== null) {
        tn.childRefs.push({ id: '', name: key, text });
        tn.sourceStatements.push(rawStatement);
        return true;
      }
    }
    return false;
  }

  if (methodName === 'AddRange' && args.length === 1) {
    const elements = extractArrayElements(args[0]);
    if (!elements) return false;
    const refs: Array<string | TreeNodeItem> = [];
    for (const el of elements) {
      const ref = parseSimpleFieldRef(el);
      if (ref && !ref.usedThis) {
        refs.push(ref.name);
        continue;
      }
      const inline = parseTreeNodeNewArgs(unwrapOuterParens(el));
      if (inline) {
        refs.push({ id: '', text: inline.text });
        continue;
      }
      return false;
    }
    tn.childRefs.push(...refs);
    tn.sourceStatements.push(rawStatement);
    return true;
  }

  return false;
}

function buildTreeNodeItems(
  refs: Array<string | TreeNodeItem>,
  parsedTreeNodes: Map<string, ParsedTreeNode>,
  ownerPrefix: string,
  visited = new Set<string>()
): TreeNodeItem[] {
  const result: TreeNodeItem[] = [];
  let idx = 0;
  for (const ref of refs) {
    if (typeof ref === 'string') {
      if (visited.has(ref)) continue;
      const tn = parsedTreeNodes.get(ref);
      if (!tn) continue;
      visited.add(ref);
      tn.attached = true;
      const childItems =
        tn.childRefs.length > 0
          ? buildTreeNodeItems(tn.childRefs, parsedTreeNodes, `${ownerPrefix}_${idx}`, visited)
          : [];
      const id = tn.name ? makeStableId(tn.name) : `${ownerPrefix}_tn_${idx}`;
      result.push({
        id,
        text: tn.text,
        ...(tn.name !== undefined ? { name: tn.name } : {}),
        ...(childItems.length > 0 ? { children: childItems } : {}),
      });
    } else {
      const id = ref.id || (ref.name ? makeStableId(ref.name) : `${ownerPrefix}_tn_${idx}`);
      result.push({
        id,
        text: ref.text,
        ...(ref.name !== undefined ? { name: ref.name } : {}),
        ...(ref.children && ref.children.length > 0
          ? { children: buildTreeNodeItems(ref.children, parsedTreeNodes, `${ownerPrefix}_${idx}`, visited) }
          : {}),
      });
    }
    idx++;
  }
  return result;
}

function tryParseStringArrayExpression(tokens: Token[]): string | null {
  const t = unwrapOuterParens(tokens);
  if (t.length < 2) return null;

  let isStringArray = false;
  if (t[0].text === '[' && t[t.length - 1].text === ']') {
    isStringArray = true;
  } else if (t[0].text === 'new') {
    const openBrace = t.findIndex((tok) => tok.text === '{');
    if (openBrace > 0) {
      const prefixText = t
        .slice(1, openBrace)
        .map((x) => x.text)
        .join('')
        .replace(/^global::/, '');
      if (
        prefixText === 'string[]' ||
        prefixText === 'System.String[]' ||
        prefixText === 'String[]' ||
        prefixText === '[]'
      ) {
        isStringArray = true;
      }
    }
  }

  if (!isStringArray) return null;
  const elements = extractArrayElements(t);
  if (!elements) return null;

  const decoded: string[] = [];
  for (const el of elements) {
    const s = tryParseStringExpression(el);
    if (s === null) return null;
    decoded.push(s);
  }

  if (decoded.length === 0) {
    return 'new string[] { }';
  }
  return `new string[] { ${decoded.map(encodeCSharpString).join(', ')} }`;
}

// ---------------------------------------------------------------------------
// Extender Provider Helpers (ToolTip.SetToolTip, ErrorProvider.SetError, etc.)
// ---------------------------------------------------------------------------

export interface ExtenderEntry {
  providerName: string;
  providerType: string;
  methodName: string;
  targetControlName: string;
  value: string;
}

const EXTENDER_METHOD_RE =
  /^(?:this\.)?([A-Za-z_][A-Za-z0-9_]*)\.(SetToolTip|SetError|SetHelpString|SetHelpKeyword)\(\s*(?:this\.)?([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([\s\S]+?)\s*\)\s*;?$/;

/**
 * Extracts WinForms extender provider assignments (such as `toolTip1.SetToolTip(button1, "Help")`
 * and `errorProvider1.SetError(textBox1, "Required")`) from component `rawStatements`.
 */
export function extractExtenderValues(doc: DesignDocument): ExtenderEntry[] {
  const entries: ExtenderEntry[] = [];
  for (const comp of doc.components) {
    if (!comp.rawStatements) continue;
    for (const stmt of comp.rawStatements) {
      const match = EXTENDER_METHOD_RE.exec(stmt.trim());
      if (!match) continue;
      const [, providerName, methodName, targetControlName, rawArg] = match;
      const argTokens = tokenizeCSharp(rawArg).filter((t) => t.kind !== 'eof');
      const decoded = tryParseStringExpression(argTokens);
      if (decoded !== null) {
        entries.push({
          providerName,
          providerType: comp.type,
          methodName,
          targetControlName,
          value: decoded,
        });
      }
    }
  }
  return entries;
}

/**
 * Adds, updates, or removes (when `value === null` or empty string) a WinForms extender call
 * such as `SetToolTip` or `SetError` on the named extender component in `doc.components`.
 */
export function setExtenderValue(
  doc: DesignDocument,
  providerName: string,
  methodName: 'SetToolTip' | 'SetError' | 'SetHelpString' | 'SetHelpKeyword',
  targetControlName: string,
  value: string | null
): boolean {
  const comp = doc.components.find((c) => c.name === providerName);
  if (!comp) return false;

  const prefix = doc.metadata.useThisQualifier ? 'this.' : '';
  const stmts = comp.rawStatements ? [...comp.rawStatements] : [];
  const existingIdx = stmts.findIndex((s) => {
    const m = EXTENDER_METHOD_RE.exec(s.trim());
    return m !== null && m[1] === providerName && m[2] === methodName && m[3] === targetControlName;
  });

  if (value === null || value === '') {
    if (existingIdx >= 0) {
      stmts.splice(existingIdx, 1);
      comp.rawStatements = stmts.length > 0 ? stmts : undefined;
      return true;
    }
    return false;
  }

  const nextStmt = `${prefix}${providerName}.${methodName}(${prefix}${targetControlName}, ${encodeCSharpString(value)});`;
  if (existingIdx >= 0) {
    stmts[existingIdx] = nextStmt;
  } else {
    stmts.push(nextStmt);
  }
  comp.rawStatements = stmts;
  return true;
}
