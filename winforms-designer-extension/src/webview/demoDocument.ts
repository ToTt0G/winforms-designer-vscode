// Rich built-in demo form used when the webview runs standalone in a browser
// (E2E tests, screenshots). Mirrors samples/OrderManagerDemo/MainForm.Designer.cs.

import type {
  CodeBehindMethod,
  DataGridViewColumnNode,
  DesignDocument,
  DesignNode,
  PropertyValue,
  StripItemNode,
} from '../shared/model';
import type { HostToWebviewMessage } from '../shared/protocol';

const pt = (x: number, y: number): PropertyValue => ({ kind: 'point', x, y });
const sz = (width: number, height: number): PropertyValue => ({ kind: 'size', width, height });
const en = (typeName: string, value: string): PropertyValue => ({ kind: 'enum', typeName, value });
const anchor = (...values: string[]): PropertyValue => ({ kind: 'flags', typeName: 'AnchorStyles', values });
const pad = (n: number): PropertyValue => ({ kind: 'padding', all: n, left: n, top: n, right: n, bottom: n });

function ctl(
  type: string,
  name: string,
  properties: Record<string, PropertyValue>,
  children: DesignNode[] = [],
  extra: Partial<DesignNode> = {}
): DesignNode {
  return {
    id: `demo_${name}`,
    name,
    type,
    fullTypeName: `System.Windows.Forms.${type}`,
    properties: { ...properties },
    events: {},
    children,
    ...extra,
  };
}

function item(type: StripItemNode['type'], name: string, text?: string, dropDownItems?: StripItemNode[]): StripItemNode {
  return { id: `demo_${name}`, name, type, text, properties: {}, events: {}, dropDownItems };
}

function col(name: string, headerText: string, columnType: DataGridViewColumnNode['columnType'] = 'DataGridViewTextBoxColumn'): DataGridViewColumnNode {
  return { id: `demo_${name}`, name, headerText, columnType, visible: true };
}

export function createDemoDocument(): DesignDocument {
  const menuStrip1 = ctl(
    'MenuStrip',
    'menuStrip1',
    { Location: pt(0, 0), Size: sz(860, 24), TabIndex: 0, Text: 'menuStrip1', Dock: en('DockStyle', 'Top') },
    [],
    {
      stripItems: [
        item('ToolStripMenuItem', 'fileToolStripMenuItem', '&File', [
          item('ToolStripMenuItem', 'newOrderToolStripMenuItem', '&New Order'),
          item('ToolStripMenuItem', 'exportCsvToolStripMenuItem', '&Export CSV...'),
          item('ToolStripMenuItem', 'exitToolStripMenuItem', 'E&xit'),
        ]),
        item('ToolStripMenuItem', 'editToolStripMenuItem', '&Edit', []),
        item('ToolStripMenuItem', 'viewToolStripMenuItem', '&View', []),
        item('ToolStripMenuItem', 'helpToolStripMenuItem', '&Help', []),
      ],
    }
  );
  const toolStrip1 = ctl(
    'ToolStrip',
    'toolStrip1',
    { Location: pt(0, 24), Size: sz(860, 25), TabIndex: 1, Text: 'toolStrip1', Dock: en('DockStyle', 'Top') },
    [],
    {
      stripItems: [
        item('ToolStripButton', 'tsbNewOrder', 'New Order'),
        item('ToolStripButton', 'tsbRefresh', 'Refresh'),
        item('ToolStripSeparator', 'toolStripSeparator1'),
        item('ToolStripButton', 'tsbExport', 'Export CSV'),
      ],
    }
  );
  const statusStrip1 = ctl(
    'StatusStrip',
    'statusStrip1',
    { Location: pt(0, 508), Size: sz(860, 22), TabIndex: 2, Text: 'statusStrip1', Dock: en('DockStyle', 'Bottom') },
    [],
    {
      stripItems: [
        item('ToolStripStatusLabel', 'statusLabel', 'Loaded 24 active orders'),
        item('ToolStripStatusLabel', 'statusConnection', 'Production DB • Online'),
      ],
    }
  );

  const grpFilters = ctl(
    'GroupBox',
    'grpFilters',
    { Dock: en('DockStyle', 'Fill'), Location: pt(10, 10), Size: sz(224, 439), TabIndex: 0, TabStop: false, Text: 'Order Filters' },
    [
      ctl(
        'Button',
        'btnApplyFilter',
        {
          Anchor: anchor('Bottom', 'Left', 'Right'),
          BackColor: { kind: 'color', value: '#0078D4', r: 0, g: 120, b: 212, a: 255 },
          FlatStyle: en('FlatStyle', 'Flat'),
          ForeColor: { kind: 'color', value: 'White', isNamed: true },
          Location: pt(14, 392),
          Size: sz(196, 32),
          TabIndex: 8,
          Text: 'Apply Filter',
          UseVisualStyleBackColor: false,
        },
        [],
        { events: { Click: 'btnApplyFilter_Click' } }
      ),
      ctl('RadioButton', 'radNorthAmerica', { AutoSize: true, Location: pt(14, 238), Size: sz(102, 19), TabIndex: 7, Text: 'North America', UseVisualStyleBackColor: true }),
      ctl('RadioButton', 'radAllRegions', { AutoSize: true, Checked: true, Location: pt(14, 212), Size: sz(84, 19), TabIndex: 6, TabStop: true, Text: 'All Regions', UseVisualStyleBackColor: true }),
      ctl('CheckBox', 'chkArchived', { AutoSize: true, Location: pt(14, 174), Size: sz(116, 19), TabIndex: 5, Text: 'Include archived', UseVisualStyleBackColor: true }),
      ctl('CheckBox', 'chkPriority', { AutoSize: true, Checked: true, Location: pt(14, 148), Size: sz(124, 19), TabIndex: 4, Text: 'Priority orders only', UseVisualStyleBackColor: true }),
      ctl(
        'ComboBox',
        'cmbStatus',
        {
          Anchor: anchor('Top', 'Left', 'Right'),
          DropDownStyle: en('ComboBoxStyle', 'DropDownList'),
          FormattingEnabled: true,
          Location: pt(14, 106),
          Size: sz(196, 23),
          TabIndex: 3,
        },
        [],
        { items: ['All Statuses', 'Pending Review', 'Approved', 'Shipped'] }
      ),
      ctl('Label', 'lblStatus', { AutoSize: true, Location: pt(14, 86), Size: sz(72, 15), TabIndex: 2, Text: 'Order Status' }),
      ctl('TextBox', 'txtSearch', { Anchor: anchor('Top', 'Left', 'Right'), Location: pt(14, 48), PlaceholderText: 'Order # or customer...', Size: sz(196, 23), TabIndex: 1 }),
      ctl('Label', 'lblSearch', { AutoSize: true, Location: pt(14, 28), Size: sz(96, 15), TabIndex: 0, Text: 'Search Customer' }),
    ],
    { panelSlot: 'Panel1' }
  );

  const pnlOrderActions = ctl(
    'Panel',
    'pnlOrderActions',
    { Dock: en('DockStyle', 'Bottom'), Location: pt(8, 357), Size: sz(572, 50), TabIndex: 1 },
    [
      ctl('Button', 'btnExport', { Anchor: anchor('Top', 'Right'), Location: pt(468, 10), Size: sz(100, 30), TabIndex: 2, Text: 'Export CSV', UseVisualStyleBackColor: true }),
      ctl(
        'Button',
        'btnApprove',
        { Anchor: anchor('Top', 'Right'), Location: pt(344, 10), Size: sz(116, 30), TabIndex: 1, Text: 'Approve Selected', UseVisualStyleBackColor: true },
        [],
        { events: { Click: 'btnApprove_Click' } }
      ),
      ctl('ProgressBar', 'progressSync', { Location: pt(4, 15), Size: sz(220, 20), TabIndex: 0, Value: 68 }),
    ]
  );

  const dgvOrders = ctl(
    'DataGridView',
    'dgvOrders',
    {
      AllowUserToAddRows: false,
      AutoSizeColumnsMode: en('DataGridViewAutoSizeColumnsMode', 'Fill'),
      ColumnHeadersHeightSizeMode: en('DataGridViewColumnHeadersHeightSizeMode', 'AutoSize'),
      Dock: en('DockStyle', 'Fill'),
      Location: pt(8, 8),
      SelectionMode: en('DataGridViewSelectionMode', 'FullRowSelect'),
      Size: sz(572, 349),
      TabIndex: 0,
    },
    [],
    {
      columns: [
        col('colOrderId', 'Order ID'),
        col('colCustomer', 'Customer'),
        col('colStatus', 'Status'),
        col('colTotal', 'Total'),
        col('colShipped', 'Shipped', 'DataGridViewCheckBoxColumn'),
      ],
    }
  );

  const tabOrders = ctl(
    'TabPage',
    'tabOrders',
    { Location: pt(4, 24), Padding: pad(8), Size: sz(588, 415), TabIndex: 0, Text: 'Active Orders', UseVisualStyleBackColor: true },
    [dgvOrders, pnlOrderActions]
  );

  const tabSummary = ctl(
    'TabPage',
    'tabSummary',
    { Location: pt(4, 24), Padding: pad(12), Size: sz(588, 415), TabIndex: 1, Text: 'Batch Summary', UseVisualStyleBackColor: true },
    [
      ctl('RichTextBox', 'rtbNotes', {
        Anchor: anchor('Top', 'Bottom', 'Left', 'Right'),
        Location: pt(16, 84),
        Size: sz(556, 310),
        TabIndex: 4,
        Text: 'Fulfillment notes and carrier instructions...',
      }),
      ctl('NumericUpDown', 'numBatchLimit', { Location: pt(256, 40), Maximum: 500, Minimum: 10, Size: sz(120, 23), TabIndex: 3, Value: 100 }),
      ctl('Label', 'lblBatchLimit', { AutoSize: true, Location: pt(256, 20), Size: sz(92, 15), TabIndex: 2, Text: 'Max Batch Size' }),
      ctl('DateTimePicker', 'dtpOrderDate', { Location: pt(16, 40), Size: sz(210, 23), TabIndex: 1 }),
      ctl('Label', 'lblOrderDate', { AutoSize: true, Location: pt(16, 20), Size: sz(80, 15), TabIndex: 0, Text: 'Cutoff Date' }),
    ]
  );

  const tabWorkspace = ctl(
    'TabControl',
    'tabWorkspace',
    { Dock: en('DockStyle', 'Fill'), Location: pt(8, 8), SelectedIndex: 0, Size: sz(596, 443), TabIndex: 0 },
    [tabOrders, tabSummary],
    { panelSlot: 'Panel2' }
  );

  const splitMain = ctl(
    'SplitContainer',
    'splitMain',
    {
      Dock: en('DockStyle', 'Fill'),
      Location: pt(0, 49),
      'Panel1.Padding': pad(10),
      'Panel2.Padding': pad(8),
      Size: sz(860, 459),
      SplitterDistance: 244,
      TabIndex: 3,
    },
    [grpFilters, tabWorkspace]
  );

  const form: DesignNode = {
    id: 'demo_MainForm',
    name: 'MainForm',
    type: 'Form',
    fullTypeName: 'System.Windows.Forms.Form',
    properties: {
      AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
      AutoScaleMode: en('AutoScaleMode', 'Font'),
      ClientSize: sz(860, 530),
      MinimumSize: sz(640, 400),
      StartPosition: en('FormStartPosition', 'CenterScreen'),
      Text: 'Order Manager — Desktop Console',
    },
    events: { Load: 'MainForm_Load' },
    children: [splitMain, statusStrip1, toolStrip1, menuStrip1],
  };

  const components: DesignNode[] = [
    {
      ...ctl('Timer', 'refreshTimer', { Enabled: true, Interval: 30000 }, [], { events: { Tick: 'refreshTimer_Tick' } }),
      isComponent: true,
      constructorArgs: 'this.components',
    },
    {
      ...ctl('SaveFileDialog', 'exportDialog', { DefaultExt: 'csv', Filter: 'CSV files (*.csv)|*.csv|All files (*.*)|*.*', Title: 'Export Orders' }),
      isComponent: true,
    },
    {
      ...ctl('ImageList', 'toolbarIcons', { ImageSize: sz(16, 16), TransparentColor: { kind: 'color', value: 'Transparent', isNamed: true } }),
      isComponent: true,
      constructorArgs: 'this.components',
    },
  ];

  return {
    namespaceName: 'OrderManagerDemo',
    fileScopedNamespace: true,
    className: 'MainForm',
    baseType: 'Form',
    form,
    components,
    resources: {},
    parseDiagnostics: [],
    metadata: {
      eol: '\r\n',
      indent: '    ',
      useThisQualifier: true,
      useShorthandEvents: true,
      usesComponentResourceManager: false,
      usesContainerComponents: true,
      hasSuspendResumeLayout: true,
      originalSource: '',
      existingFieldDeclarations: {},
      unhandledTopLevelStatements: [],
      usingDirectives: [],
    },
  };
}

export const DEMO_HANDLERS: CodeBehindMethod[] = [
  { name: 'MainForm_Load', line: 12, column: 9, parameters: 'object? sender, EventArgs e', isEventHandlerLike: true },
  { name: 'btnApplyFilter_Click', line: 17, column: 9, parameters: 'object? sender, EventArgs e', isEventHandlerLike: true },
  { name: 'btnApprove_Click', line: 22, column: 9, parameters: 'object? sender, EventArgs e', isEventHandlerLike: true },
  { name: 'refreshTimer_Tick', line: 27, column: 9, parameters: 'object? sender, EventArgs e', isEventHandlerLike: true },
];

export function createDemoInitMessage(theme: 'dark' | 'light' | 'high-contrast' = 'dark'): HostToWebviewMessage {
  return {
    type: 'init',
    document: createDemoDocument(),
    settings: {
      gridSize: 8,
      layoutMode: 'snaplines',
      showGrid: true,
      renderStyle: 'fluent',
      useThisQualifier: 'auto',
      eventHandlerStyle: 'auto',
    },
    fileName: 'MainForm.Designer.cs',
    codeBehindFileName: 'MainForm.cs',
    hasCodeBehind: true,
    codeBehindHandlers: DEMO_HANDLERS,
    themeKind: theme,
    resourceDataUris: {},
  };
}
