// Shared WinForms Designer Document Model

export type PropertyValue =
  | string
  | number
  | boolean
  | PointValue
  | SizeValue
  | SizeFValue
  | PaddingValue
  | ColorValue
  | FontValue
  | EnumValue
  | FlagsValue
  | ResourceValue
  | RawExpressionValue;

export interface PointValue {
  kind: 'point';
  x: number;
  y: number;
}

export interface SizeValue {
  kind: 'size';
  width: number;
  height: number;
}

export interface SizeFValue {
  kind: 'sizeF';
  width: number;
  height: number;
}

export interface PaddingValue {
  kind: 'padding';
  all?: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ColorValue {
  kind: 'color';
  /** System color name ("Control"), Web named color ("SteelBlue"), or hex ("#2563EB") */
  value: string;
  isSystem?: boolean;
  isNamed?: boolean;
  a?: number;
  r?: number;
  g?: number;
  b?: number;
}

export interface FontValue {
  kind: 'font';
  family: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  unit?: 'Point' | 'Pixel' | 'Display' | 'Document' | 'Inch' | 'Millimeter' | 'World';
  gdiCharSet?: number;
}

export interface EnumValue {
  kind: 'enum';
  typeName: string;
  value: string;
}

export interface FlagsValue {
  kind: 'flags';
  typeName: string;
  values: string[];
}

export interface ResourceValue {
  kind: 'resource';
  resourceName: string;
  resourceType: 'Image' | 'Icon' | 'Object' | 'String';
  relativePath?: string;
  /** Preserved C# cast type if non-standard (e.g. "System.Drawing.Size") */
  castType?: string;
  /** Preserved original C# lookup expression when untouched */
  rawExpression?: string;
}

export interface EventSubscription {
  eventName: string;
  handlerName: string;
  delegateType?: string;
  isExplicit?: boolean;
}

export interface RawExpressionValue {
  kind: 'raw';
  expression: string;
}

export interface TableTrackStyle {
  sizeType: 'Percent' | 'Absolute' | 'AutoSize';
  value: number;
}

export interface TableCellPosition {
  column?: number;
  row?: number;
  columnSpan?: number;
  rowSpan?: number;
  /** True when the child was added with the 3-arg Controls.Add(ctrl, col, row) overload */
  explicit?: boolean;
}

export interface StripItemNode {
  id: string;
  name: string;
  type:
    | 'ToolStripMenuItem'
    | 'ToolStripButton'
    | 'ToolStripLabel'
    | 'ToolStripSeparator'
    | 'ToolStripTextBox'
    | 'ToolStripComboBox'
    | 'ToolStripDropDownButton'
    | 'ToolStripSplitButton'
    | 'ToolStripProgressBar'
    | 'ToolStripStatusLabel';
  text?: string;
  properties: Record<string, PropertyValue>;
  events: Record<string, string>;
  dropDownItems?: StripItemNode[];
  rawStatements?: string[];
}

export interface DataGridViewColumnNode {
  id: string;
  name: string;
  columnType:
    | 'DataGridViewTextBoxColumn'
    | 'DataGridViewButtonColumn'
    | 'DataGridViewCheckBoxColumn'
    | 'DataGridViewComboBoxColumn'
    | 'DataGridViewImageColumn'
    | 'DataGridViewLinkColumn';
  headerText: string;
  width?: number;
  readOnly?: boolean;
  visible?: boolean;
  properties?: Record<string, PropertyValue>;
  /** True when the user explicitly changed columnType in the designer */
  explicitTypeChanged?: boolean;
}

export interface ListViewColumnNode {
  id: string;
  name: string;
  text: string;
  width: number;
  properties?: Record<string, PropertyValue>;
  rawStatements?: string[];
}

export interface TreeNodeItem {
  id: string;
  text: string;
  name?: string;
  children?: TreeNodeItem[];
}

export interface DesignNode {
  id: string;
  /** C# field/control name (e.g. "button1") or form Name */
  name: string;
  /** Short WinForms type name (e.g. "Button", "Form", "UserControl", or custom control name) */
  type: string;
  /** Fully-qualified type name if known/custom (e.g. "System.Windows.Forms.Button" or "MyApp.ChartBox") */
  fullTypeName?: string;
  /** True when control type is not in the standard WinForms catalog */
  isUnknownType?: boolean;
  /** True for non-visual components placed in the Component Tray */
  isComponent?: boolean;
  /** Control property values (parsed from InitializeComponent or set by user) */
  properties: Record<string, PropertyValue>;
  /** Original raw C# RHS expressions for untouched parsed properties (preserves exact hex/float/decimal/char syntax) */
  rawPropertyExpressions?: Record<string, string>;
  /** Event subscriptions: eventName -> primary handlerMethodName */
  events: Record<string, string>;
  /** Ordered full event subscription list (preserves multi-handler subscriptions & original delegate types) */
  eventSubscriptions?: EventSubscription[];
  /** Visual child controls */
  children: DesignNode[];
  /** Slot when direct child of SplitContainer */
  panelSlot?: 'Panel1' | 'Panel2';
  /** Cell coordinates when direct child of TableLayoutPanel */
  tableCell?: TableCellPosition;
  /** Column & Row track definitions when type === 'TableLayoutPanel' */
  tableLayout?: {
    columnStyles: TableTrackStyle[];
    rowStyles: TableTrackStyle[];
  };
  /** Strip items when type is MenuStrip, ToolStrip, StatusStrip, or ContextMenuStrip */
  stripItems?: StripItemNode[];
  /** Columns for DataGridView */
  columns?: DataGridViewColumnNode[];
  /** Column headers for ListView */
  listViewColumns?: ListViewColumnNode[];
  /** String items for ListBox, ComboBox, CheckedListBox, DomainUpDown */
  items?: string[];
  /** Tree nodes for TreeView */
  treeNodes?: TreeNodeItem[];
  /** Unhandled raw C# statements targeting this control, preserved verbatim on save */
  rawStatements?: string[];
  /** C# field access modifier (defaults to "private") */
  fieldModifier?: string;
  /** Raw constructor args if non-empty (e.g. "this.components" or "components") */
  constructorArgs?: string;
}

export interface ResourceEntry {
  name: string;
  kind: 'fileRef' | 'string' | 'base64' | 'other';
  /** Raw value from .resx <value> element */
  value: string;
  /** Parsed relative file path if kind === 'fileRef' */
  filePath?: string;
  /** CLR type string from .resx type or ResXFileRef */
  clrType?: string;
  /** MIME type if base64/binary */
  mimeType?: string;
}

export type ResourceMap = Record<string, ResourceEntry>;

export interface ParseDiagnostic {
  severity: 'info' | 'warning' | 'error';
  message: string;
  line?: number;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface FieldDeclarationSpan {
  name: string;
  modifier: string;
  typeName: string;
  /** Full statement span (line start through trailing `;`) */
  statementStart: number;
  statementEnd: number;
  /** True if part of a multi-declarator field (`private Button a, b;`) */
  isMultiDeclarator: boolean;
  /** True if declared above InitializeComponent() */
  beforeInit: boolean;
  /** True if the field carries attributes or an initializer (`= ...`) */
  hasAttributesOrInitializer?: boolean;
  rawLine?: string;
}

export interface DocumentStyleMetadata {
  eol: '\r\n' | '\n';
  indent: string;
  useThisQualifier: boolean;
  useShorthandEvents: boolean;
  usesComponentResourceManager: boolean;
  /** Local variable name used for ComponentResourceManager (defaults to "resources") */
  resourceVarName?: string;
  /** Exact original ComponentResourceManager declaration statement */
  resourceManagerStatement?: string;
  usesContainerComponents: boolean;
  hasSuspendResumeLayout: boolean;
  originalSource: string;
  /** Non-empty when the file cannot be safely written back visually (e.g. expression-bodied InitializeComponent or #if directives) */
  readOnlyReason?: string;
  /** Host TextDocument version at parse time for conflict detection */
  documentVersion?: number;
  /** Span of the InitializeComponent() method (from method signature or opening brace through closing brace) */
  initializeComponentRange?: TextRange;
  /** Span of field declarations after #endregion (inside class closing brace) */
  fieldsRegionRange?: TextRange;
  /** Individual field declaration spans for surgical non-destructive updates */
  fieldSpans?: Record<string, FieldDeclarationSpan>;
  /** Insertion offset right before class closing brace for new designer fields */
  fieldInsertOffset?: number;
  /** Existing field declarations preserved for custom types/modifiers */
  existingFieldDeclarations: Record<string, { modifier: string; typeName: string; rawLine?: string }>;
  /** Raw unhandled statements inside InitializeComponent preserved verbatim */
  unhandledTopLevelStatements: string[];
  /** Unhandled top-level statements that appeared after control blocks in source order */
  unhandledTrailingStatements?: string[];
  /** Extra top-level local variable declarations or helper statements */
  usingDirectives: string[];
}

export interface DesignDocument {
  namespaceName: string;
  fileScopedNamespace: boolean;
  className: string;
  baseType: 'Form' | 'UserControl';
  form: DesignNode;
  components: DesignNode[];
  resources: ResourceMap;
  parseDiagnostics: ParseDiagnostic[];
  metadata: DocumentStyleMetadata;
}

export interface CodeBehindMethod {
  name: string;
  line: number;
  column: number;
  parameters: string;
  isEventHandlerLike: boolean;
}

export interface CodeBehindInfo {
  className: string;
  baseType: 'Form' | 'UserControl' | string;
  namespaceName: string;
  fileScopedNamespace: boolean;
  methods: CodeBehindMethod[];
}

export interface DesignerSettings {
  gridSize: number;
  layoutMode: 'snaplines' | 'grid';
  showGrid: boolean;
  renderStyle: 'fluent' | 'classic';
  useThisQualifier: 'auto' | 'always' | 'never';
  eventHandlerStyle: 'auto' | 'shorthand' | 'explicitDelegate';
}

export interface GenerateOptions {
  useThisQualifier?: 'auto' | 'always' | 'never';
  eventHandlerStyle?: 'auto' | 'shorthand' | 'explicitDelegate';
  /** Must be explicitly true to generate a brand-new full file when initializeComponentRange is absent */
  allowFullFileGeneration?: boolean;
}

export interface ResxEntryInput {
  name: string;
  kind: 'fileRef' | 'string';
  /** Relative path from .resx directory (for fileRef) or string value (for string) */
  value: string;
  /** 'Bitmap' | 'Icon' for fileRef */
  assetType?: 'Bitmap' | 'Icon';
}

export interface ScaffoldOptions {
  className: string;
  namespaceName: string;
  baseType: 'Form' | 'UserControl';
  fileScopedNamespace?: boolean;
  nullable?: boolean;
  eol?: '\r\n' | '\n';
}

// Type guard helpers for PropertyValue
export function isPointValue(v: PropertyValue | undefined): v is PointValue {
  return typeof v === 'object' && v !== null && v.kind === 'point';
}

export function isSizeValue(v: PropertyValue | undefined): v is SizeValue {
  return typeof v === 'object' && v !== null && v.kind === 'size';
}

export function isSizeFValue(v: PropertyValue | undefined): v is SizeFValue {
  return typeof v === 'object' && v !== null && v.kind === 'sizeF';
}

export function isPaddingValue(v: PropertyValue | undefined): v is PaddingValue {
  return typeof v === 'object' && v !== null && v.kind === 'padding';
}

export function isColorValue(v: PropertyValue | undefined): v is ColorValue {
  return typeof v === 'object' && v !== null && v.kind === 'color';
}

export function isFontValue(v: PropertyValue | undefined): v is FontValue {
  return typeof v === 'object' && v !== null && v.kind === 'font';
}

export function isEnumValue(v: PropertyValue | undefined): v is EnumValue {
  return typeof v === 'object' && v !== null && v.kind === 'enum';
}

export function isFlagsValue(v: PropertyValue | undefined): v is FlagsValue {
  return typeof v === 'object' && v !== null && v.kind === 'flags';
}

export function isResourceValue(v: PropertyValue | undefined): v is ResourceValue {
  return typeof v === 'object' && v !== null && v.kind === 'resource';
}

export function isRawExpressionValue(v: PropertyValue | undefined): v is RawExpressionValue {
  return typeof v === 'object' && v !== null && v.kind === 'raw';
}
