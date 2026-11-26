// Comprehensive WinForms Control, Property, Event, Enum, and Color Catalog

import type { PropertyValue } from './model';

export type ToolboxCategory =
  | 'Common Controls'
  | 'Containers'
  | 'Menus & Toolbars'
  | 'Data'
  | 'Components'
  | 'Dialogs'
  | 'Printing'
  | 'Additional';

export const TOOLBOX_CATEGORIES: ToolboxCategory[] = [
  'Common Controls',
  'Containers',
  'Menus & Toolbars',
  'Data',
  'Components',
  'Dialogs',
  'Printing',
  'Additional',
];

export type PropertyEditorKind =
  | 'string'
  | 'multilineString'
  | 'number'
  | 'float'
  | 'boolean'
  | 'point'
  | 'size'
  | 'sizeF'
  | 'padding'
  | 'color'
  | 'font'
  | 'enum'
  | 'flags'
  | 'anchor'
  | 'dock'
  | 'alignment'
  | 'image'
  | 'icon'
  | 'stringCollection'
  | 'columnsCollection'
  | 'listViewColumnsCollection'
  | 'treeNodesCollection'
  | 'stripItemsCollection'
  | 'tabPagesCollection'
  | 'tableLayoutCollection'
  | 'controlRef'
  | 'name';

export interface PropertyDefinition {
  name: string;
  category:
    | 'Design'
    | 'Appearance'
    | 'Behavior'
    | 'Layout'
    | 'Data'
    | 'Window Style'
    | 'Misc'
    | 'Focus'
    | 'Accessibility';
  editor: PropertyEditorKind;
  enumType?: string;
  /** Allowed WinForms control/component type names when editor === 'controlRef' */
  controlRefTypes?: string[];
  defaultValue?: PropertyValue;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  /** C# property type name for serialization hints */
  csharpType?: string;
}

export interface EventDefinition {
  name: string;
  category:
    | 'Action'
    | 'Appearance'
    | 'Behavior'
    | 'Data'
    | 'Drag Drop'
    | 'Focus'
    | 'Key'
    | 'Layout'
    | 'Mouse'
    | 'Property Changed'
    | 'Window'
    | 'Misc';
  delegateType: string;
  eventArgsType: string;
  description: string;
}

export interface ControlDefinition {
  type: string;
  displayName: string;
  fullTypeName: string;
  category: ToolboxCategory | 'Root';
  description: string;
  /** Default field name prefix (e.g., "button" -> "button1") */
  namePrefix: string;
  defaultSize: { width: number; height: number };
  isContainer: boolean;
  isComponent: boolean;
  /** Whether control uses ISupportInitialize (BeginInit / EndInit) */
  supportsInitialize?: boolean;
  /** Whether control uses SuspendLayout / ResumeLayout */
  supportsLayoutSuspension?: boolean;
  /** Whether constructor takes this.components in WinForms */
  takesComponentsArg?: boolean;
  /** Whether control defaults to DockStyle.Top/Bottom (e.g. MenuStrip, ToolStrip, StatusStrip) */
  defaultDock?: 'None' | 'Top' | 'Bottom' | 'Left' | 'Right' | 'Fill';
  /** Default event generated on double-click */
  defaultEvent: string;
  /** Default properties when freshly dropped from Toolbox */
  defaultProperties: Record<string, PropertyValue>;
  /** Extra properties specific to this control (merged with common properties) */
  specificProperties: PropertyDefinition[];
  /** Extra events specific to this control (merged with common events) */
  specificEvents?: EventDefinition[];
  /** True if control should not appear in Toolbox (e.g., Form, UserControl, TabPage) */
  hiddenFromToolbox?: boolean;
}

// ---------------------------------------------------------------------------
// WinForms Enum Definitions
// ---------------------------------------------------------------------------

export const WINFORMS_ENUMS: Record<string, { fullTypeName: string; values: string[] }> = {
  DockStyle: {
    fullTypeName: 'System.Windows.Forms.DockStyle',
    values: ['None', 'Top', 'Bottom', 'Left', 'Right', 'Fill'],
  },
  AnchorStyles: {
    fullTypeName: 'System.Windows.Forms.AnchorStyles',
    values: ['None', 'Top', 'Bottom', 'Left', 'Right'],
  },
  ContentAlignment: {
    fullTypeName: 'System.Drawing.ContentAlignment',
    values: [
      'TopLeft',
      'TopCenter',
      'TopRight',
      'MiddleLeft',
      'MiddleCenter',
      'MiddleRight',
      'BottomLeft',
      'BottomCenter',
      'BottomRight',
    ],
  },
  HorizontalAlignment: {
    fullTypeName: 'System.Windows.Forms.HorizontalAlignment',
    values: ['Left', 'Right', 'Center'],
  },
  FlatStyle: {
    fullTypeName: 'System.Windows.Forms.FlatStyle',
    values: ['Flat', 'Popup', 'Standard', 'System'],
  },
  BorderStyle: {
    fullTypeName: 'System.Windows.Forms.BorderStyle',
    values: ['None', 'FixedSingle', 'Fixed3D'],
  },
  FormBorderStyle: {
    fullTypeName: 'System.Windows.Forms.FormBorderStyle',
    values: [
      'None',
      'FixedSingle',
      'Fixed3D',
      'FixedDialog',
      'Sizable',
      'FixedToolWindow',
      'SizableToolWindow',
    ],
  },
  FormStartPosition: {
    fullTypeName: 'System.Windows.Forms.FormStartPosition',
    values: [
      'Manual',
      'CenterScreen',
      'WindowsDefaultLocation',
      'WindowsDefaultBounds',
      'CenterParent',
    ],
  },
  FormWindowState: {
    fullTypeName: 'System.Windows.Forms.FormWindowState',
    values: ['Normal', 'Minimized', 'Maximized'],
  },
  AutoScaleMode: {
    fullTypeName: 'System.Windows.Forms.AutoScaleMode',
    values: ['None', 'Font', 'Dpi', 'Inherit'],
  },
  ScrollBars: {
    fullTypeName: 'System.Windows.Forms.ScrollBars',
    values: ['None', 'Horizontal', 'Vertical', 'Both'],
  },
  RichTextBoxScrollBars: {
    fullTypeName: 'System.Windows.Forms.RichTextBoxScrollBars',
    values: [
      'None',
      'Horizontal',
      'Vertical',
      'Both',
      'ForcedHorizontal',
      'ForcedVertical',
      'ForcedBoth',
    ],
  },
  ComboBoxStyle: {
    fullTypeName: 'System.Windows.Forms.ComboBoxStyle',
    values: ['Simple', 'DropDown', 'DropDownList'],
  },
  PictureBoxSizeMode: {
    fullTypeName: 'System.Windows.Forms.PictureBoxSizeMode',
    values: ['Normal', 'StretchImage', 'AutoSize', 'CenterImage', 'Zoom'],
  },
  ImageLayout: {
    fullTypeName: 'System.Windows.Forms.ImageLayout',
    values: ['None', 'Tile', 'Center', 'Stretch', 'Zoom'],
  },
  View: {
    fullTypeName: 'System.Windows.Forms.View',
    values: ['LargeIcon', 'Details', 'SmallIcon', 'List', 'Tile'],
  },
  Orientation: {
    fullTypeName: 'System.Windows.Forms.Orientation',
    values: ['Horizontal', 'Vertical'],
  },
  FixedPanel: {
    fullTypeName: 'System.Windows.Forms.FixedPanel',
    values: ['None', 'Panel1', 'Panel2'],
  },
  FlowDirection: {
    fullTypeName: 'System.Windows.Forms.FlowDirection',
    values: ['LeftToRight', 'TopDown', 'RightToLeft', 'BottomUp'],
  },
  TableLayoutPanelCellBorderStyle: {
    fullTypeName: 'System.Windows.Forms.TableLayoutPanelCellBorderStyle',
    values: ['None', 'Single', 'Inset', 'InsetDouble', 'Outset', 'OutsetDouble', 'OutsetPartial'],
  },
  ProgressBarStyle: {
    fullTypeName: 'System.Windows.Forms.ProgressBarStyle',
    values: ['Blocks', 'Continuous', 'Marquee'],
  },
  TickStyle: {
    fullTypeName: 'System.Windows.Forms.TickStyle',
    values: ['None', 'TopLeft', 'BottomRight', 'Both'],
  },
  DateTimePickerFormat: {
    fullTypeName: 'System.Windows.Forms.DateTimePickerFormat',
    values: ['Long', 'Short', 'Time', 'Custom'],
  },
  TabAlignment: {
    fullTypeName: 'System.Windows.Forms.TabAlignment',
    values: ['Top', 'Bottom', 'Left', 'Right'],
  },
  TabAppearance: {
    fullTypeName: 'System.Windows.Forms.TabAppearance',
    values: ['Normal', 'Buttons', 'FlatButtons'],
  },
  Appearance: {
    fullTypeName: 'System.Windows.Forms.Appearance',
    values: ['Normal', 'Button'],
  },
  CheckState: {
    fullTypeName: 'System.Windows.Forms.CheckState',
    values: ['Unchecked', 'Checked', 'Indeterminate'],
  },
  SelectionMode: {
    fullTypeName: 'System.Windows.Forms.SelectionMode',
    values: ['None', 'One', 'MultiSimple', 'MultiExtended'],
  },
  DataGridViewAutoSizeColumnsMode: {
    fullTypeName: 'System.Windows.Forms.DataGridViewAutoSizeColumnsMode',
    values: [
      'None',
      'ColumnHeader',
      'AllCellsExceptHeader',
      'AllCells',
      'DisplayedCellsExceptHeader',
      'DisplayedCells',
      'Fill',
    ],
  },
  DataGridViewSelectionMode: {
    fullTypeName: 'System.Windows.Forms.DataGridViewSelectionMode',
    values: ['CellSelect', 'FullRowSelect', 'FullColumnSelect', 'RowHeaderSelect', 'ColumnHeaderSelect'],
  },
  DataGridViewColumnHeadersHeightSizeMode: {
    fullTypeName: 'System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode',
    values: ['EnableResizing', 'DisableResizing', 'AutoSize'],
  },
  DialogResult: {
    fullTypeName: 'System.Windows.Forms.DialogResult',
    values: ['None', 'OK', 'Cancel', 'Abort', 'Retry', 'Ignore', 'Yes', 'No'],
  },
  RightToLeft: {
    fullTypeName: 'System.Windows.Forms.RightToLeft',
    values: ['No', 'Yes', 'Inherit'],
  },
  CharacterCasing: {
    fullTypeName: 'System.Windows.Forms.CharacterCasing',
    values: ['Normal', 'Upper', 'Lower'],
  },
  SizeGripStyle: {
    fullTypeName: 'System.Windows.Forms.SizeGripStyle',
    values: ['Auto', 'Show', 'Hide'],
  },
  ToolStripGripStyle: {
    fullTypeName: 'System.Windows.Forms.ToolStripGripStyle',
    values: ['Hidden', 'Visible'],
  },
  ToolStripRenderMode: {
    fullTypeName: 'System.Windows.Forms.ToolStripRenderMode',
    values: ['ManagerRenderMode', 'System', 'Professional', 'Custom'],
  },
  TextImageRelation: {
    fullTypeName: 'System.Windows.Forms.TextImageRelation',
    values: ['Overlay', 'ImageAboveText', 'TextAboveImage', 'ImageBeforeText', 'TextBeforeImage'],
  },
  SortOrder: {
    fullTypeName: 'System.Windows.Forms.SortOrder',
    values: ['None', 'Ascending', 'Descending'],
  },
  LeftRightAlignment: {
    fullTypeName: 'System.Windows.Forms.LeftRightAlignment',
    values: ['Left', 'Right'],
  },
  Cursors: {
    fullTypeName: 'System.Windows.Forms.Cursors',
    values: [
      'Default',
      'Arrow',
      'Hand',
      'IBeam',
      'WaitCursor',
      'AppStarting',
      'Cross',
      'Help',
      'No',
      'SizeAll',
      'SizeNESW',
      'SizeNS',
      'SizeNWSE',
      'SizeWE',
      'UpArrow',
      'VSplit',
      'HSplit',
    ],
  },
};

// ---------------------------------------------------------------------------
// System & Web Colors (Accurate Windows 11 Light Preview Values)
// ---------------------------------------------------------------------------

export const SYSTEM_COLORS: Record<string, string> = {
  ActiveBorder: '#B4B4B4',
  ActiveCaption: '#99B4D1',
  ActiveCaptionText: '#000000',
  AppWorkspace: '#ABABAB',
  ButtonFace: '#F0F0F0',
  ButtonHighlight: '#FFFFFF',
  ButtonShadow: '#A0A0A0',
  Control: '#F0F0F0',
  ControlDark: '#A0A0A0',
  ControlDarkDark: '#696969',
  ControlLight: '#E3E3E3',
  ControlLightLight: '#FFFFFF',
  ControlText: '#000000',
  Desktop: '#000000',
  GradientActiveCaption: '#B9D1EA',
  GradientInactiveCaption: '#D7E4F2',
  GrayText: '#6D6D6D',
  Highlight: '#0078D7',
  HighlightText: '#FFFFFF',
  HotTrack: '#0066CC',
  InactiveBorder: '#F4F7FC',
  InactiveCaption: '#BFCDDB',
  InactiveCaptionText: '#000000',
  Info: '#FFFFE1',
  InfoText: '#000000',
  Menu: '#F0F0F0',
  MenuBar: '#F0F0F0',
  MenuHighlight: '#3399FF',
  MenuText: '#000000',
  ScrollBar: '#C8C8C8',
  Window: '#FFFFFF',
  WindowFrame: '#646464',
  WindowText: '#000000',
};

export const WEB_NAMED_COLORS: Record<string, string> = {
  Transparent: 'transparent',
  Black: '#000000',
  DimGray: '#696969',
  Gray: '#808080',
  DarkGray: '#A9A9A9',
  Silver: '#C0C0C0',
  LightGray: '#D3D3D3',
  Gainsboro: '#DCDCDC',
  WhiteSmoke: '#F5F5F5',
  White: '#FFFFFF',
  RosyBrown: '#BC8F8F',
  IndianRed: '#CD5C5C',
  Brown: '#A52A2A',
  Firebrick: '#B22222',
  LightCoral: '#F08080',
  Maroon: '#800000',
  DarkRed: '#8B0000',
  Red: '#FF0000',
  Snow: '#FFFAFA',
  MistyRose: '#FFE4E1',
  Salmon: '#FA8072',
  Tomato: '#FF6347',
  DarkSalmon: '#E9967A',
  Coral: '#FF7F50',
  OrangeRed: '#FF4500',
  LightSalmon: '#FFA07A',
  Sienna: '#A0522D',
  SeaShell: '#FFF5EE',
  Chocolate: '#D2691E',
  SaddleBrown: '#8B4513',
  SandyBrown: '#F4A460',
  PeachPuff: '#FFDAB9',
  Peru: '#CD853F',
  Linen: '#FAF0E6',
  Bisque: '#FFE4C4',
  DarkOrange: '#FF8C00',
  BurlyWood: '#DEB887',
  Tan: '#D2B48C',
  AntiqueWhite: '#FAEBD7',
  NavajoWhite: '#FFDEAD',
  BlanchedAlmond: '#FFEBCD',
  PapayaWhip: '#FFEFD5',
  Moccasin: '#FFE4B5',
  Orange: '#FFA500',
  Wheat: '#F5DEB3',
  OldLace: '#FDF5E6',
  FloralWhite: '#FFFAF0',
  DarkGoldenrod: '#B8860B',
  Goldenrod: '#DAA520',
  Cornsilk: '#FFF8DC',
  Gold: '#FFD700',
  Khaki: '#F0E68C',
  LemonChiffon: '#FFFACD',
  PaleGoldenrod: '#EEE8AA',
  DarkKhaki: '#BDB76B',
  Beige: '#F5F5DC',
  LightGoldenrodYellow: '#FAFAD2',
  Olive: '#808000',
  Yellow: '#FFFF00',
  LightYellow: '#FFFFE0',
  Ivory: '#FFFFF0',
  OliveDrab: '#6B8E23',
  YellowGreen: '#9ACD32',
  DarkOliveGreen: '#556B2F',
  GreenYellow: '#ADFF2F',
  Chartreuse: '#7FFF00',
  LawnGreen: '#7CFC00',
  DarkSeaGreen: '#8FBC8F',
  ForestGreen: '#228B22',
  LimeGreen: '#32CD32',
  LightGreen: '#90EE90',
  PaleGreen: '#98FB98',
  DarkGreen: '#006400',
  Green: '#008000',
  Lime: '#00FF00',
  Honeydew: '#F0FFF0',
  SeaGreen: '#2E8B57',
  MediumSeaGreen: '#3CB371',
  SpringGreen: '#00FF7F',
  MintCream: '#F5FFFA',
  MediumSpringGreen: '#00FA9A',
  MediumAquamarine: '#66CDAA',
  Aquamarine: '#7FFFD4',
  Turquoise: '#40E0D0',
  LightSeaGreen: '#20B2AA',
  MediumTurquoise: '#48D1CC',
  DarkSlateGray: '#2F4F4F',
  PaleTurquoise: '#AFEEEE',
  Teal: '#008080',
  DarkCyan: '#008B8B',
  Cyan: '#00FFFF',
  Aqua: '#00FFFF',
  LightCyan: '#E0FFFF',
  Azure: '#F0FFFF',
  DarkTurquoise: '#00CED1',
  CadetBlue: '#5F9EA0',
  PowderBlue: '#B0E0E6',
  LightBlue: '#ADD8E6',
  DeepSkyBlue: '#00BFFF',
  SkyBlue: '#87CEEB',
  LightSkyBlue: '#87CEFA',
  SteelBlue: '#4682B4',
  AliceBlue: '#F0F8FF',
  DodgerBlue: '#1E90FF',
  SlateGray: '#708090',
  LightSlateGray: '#778899',
  LightSteelBlue: '#B0C4DE',
  CornflowerBlue: '#6495ED',
  RoyalBlue: '#4169E1',
  MidnightBlue: '#191970',
  Lavender: '#E6E6FA',
  Navy: '#000080',
  DarkBlue: '#00008B',
  MediumBlue: '#0000CD',
  Blue: '#0000FF',
  GhostWhite: '#F8F8FF',
  SlateBlue: '#6A5ACD',
  DarkSlateBlue: '#483D8B',
  MediumSlateBlue: '#7B68EE',
  MediumPurple: '#9370DB',
  BlueViolet: '#8A2BE2',
  Indigo: '#4B0082',
  DarkOrchid: '#9932CC',
  DarkViolet: '#9400D3',
  MediumOrchid: '#BA55D3',
  Thistle: '#D8BFD8',
  Plum: '#DDA0DD',
  Violet: '#EE82EE',
  Purple: '#800080',
  DarkMagenta: '#8B008B',
  Fuchsia: '#FF00FF',
  Magenta: '#FF00FF',
  Orchid: '#DA70D6',
  MediumVioletRed: '#C71585',
  DeepPink: '#FF1493',
  HotPink: '#FF69B4',
  LavenderBlush: '#FFF0F5',
  PaleVioletRed: '#DB7093',
  Crimson: '#DC143C',
};

// ---------------------------------------------------------------------------
// Shared Property & Event Definitions
// ---------------------------------------------------------------------------

export const COMMON_CONTROL_PROPERTIES: PropertyDefinition[] = [
  { name: 'Name', category: 'Design', editor: 'name', description: 'Indicates the name used in code to identify the object.' },
  { name: 'Text', category: 'Appearance', editor: 'string', defaultValue: '', description: 'The text associated with the control.' },
  { name: 'Location', category: 'Layout', editor: 'point', defaultValue: { kind: 'point', x: 0, y: 0 }, description: 'The coordinates of the upper-left corner of the control relative to its container.' },
  { name: 'Size', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 100, height: 23 }, description: 'The size of the control in pixels.' },
  { name: 'MinimumSize', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 0, height: 0 }, description: 'Specifies the minimum size of the control.' },
  { name: 'MaximumSize', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 0, height: 0 }, description: 'Specifies the maximum size of the control.' },
  { name: 'Dock', category: 'Layout', editor: 'dock', enumType: 'DockStyle', defaultValue: { kind: 'enum', typeName: 'DockStyle', value: 'None' }, description: 'Defines which borders of the control are bound to the container.' },
  { name: 'Anchor', category: 'Layout', editor: 'anchor', enumType: 'AnchorStyles', defaultValue: { kind: 'flags', typeName: 'AnchorStyles', values: ['Top', 'Left'] }, description: 'Defines the edges of the container to which a control is bound.' },
  { name: 'Margin', category: 'Layout', editor: 'padding', defaultValue: { kind: 'padding', all: 3, left: 3, top: 3, right: 3, bottom: 3 }, description: 'Specifies the space between this control and another control\'s margin.' },
  { name: 'Padding', category: 'Layout', editor: 'padding', defaultValue: { kind: 'padding', all: 0, left: 0, top: 0, right: 0, bottom: 0 }, description: 'Specifies the interior spacing of a control.' },
  { name: 'BackColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'Control', isSystem: true }, description: 'The background color of the component.' },
  { name: 'ForeColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'ControlText', isSystem: true }, description: 'The foreground color of this component, which is used to display text.' },
  { name: 'Font', category: 'Appearance', editor: 'font', defaultValue: { kind: 'font', family: 'Segoe UI', size: 9, unit: 'Point' }, description: 'The font used to display text in the control.' },
  { name: 'BackgroundImage', category: 'Appearance', editor: 'image', description: 'The background image used for the control.' },
  { name: 'BackgroundImageLayout', category: 'Appearance', editor: 'enum', enumType: 'ImageLayout', defaultValue: { kind: 'enum', typeName: 'ImageLayout', value: 'Tile' }, description: 'The background image layout used for the component.' },
  { name: 'Enabled', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether the control is enabled.' },
  { name: 'Visible', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Determines whether the control is visible or hidden.' },
  { name: 'TabIndex', category: 'Behavior', editor: 'number', defaultValue: 0, min: 0, max: 32767, description: 'Determines the index in the TAB order that this control will occupy.' },
  { name: 'TabStop', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether the user can use the TAB key to give focus to the control.' },
  { name: 'RightToLeft', category: 'Appearance', editor: 'enum', enumType: 'RightToLeft', defaultValue: { kind: 'enum', typeName: 'RightToLeft', value: 'No' }, description: 'Indicates whether the component should draw right-to-left for RTL languages.' },
  { name: 'Cursor', category: 'Appearance', editor: 'enum', enumType: 'Cursors', defaultValue: { kind: 'enum', typeName: 'Cursors', value: 'Default' }, description: 'The cursor that appears when the pointer moves over the control.' },
  { name: 'ContextMenuStrip', category: 'Behavior', editor: 'controlRef', controlRefTypes: ['ContextMenuStrip'], description: 'The shortcut menu associated with the control.' },
  { name: 'Tag', category: 'Data', editor: 'string', defaultValue: '', description: 'User-defined data associated with the object.' },
  { name: 'AccessibleName', category: 'Accessibility', editor: 'string', defaultValue: '', description: 'The name of the control used by accessibility client applications.' },
];

export const COMMON_CONTROL_EVENTS: EventDefinition[] = [
  { name: 'Click', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the component is clicked.' },
  { name: 'DoubleClick', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the control is double-clicked.' },
  { name: 'MouseClick', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the control is clicked by the mouse.' },
  { name: 'MouseDoubleClick', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the control is double-clicked by the mouse.' },
  { name: 'MouseDown', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the mouse pointer is over the control and a mouse button is pressed.' },
  { name: 'MouseUp', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the mouse pointer is over the control and a mouse button is released.' },
  { name: 'MouseMove', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the mouse pointer is moved over the control.' },
  { name: 'MouseEnter', category: 'Mouse', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the mouse pointer enters the control.' },
  { name: 'MouseLeave', category: 'Mouse', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the mouse pointer leaves the control.' },
  { name: 'KeyDown', category: 'Key', delegateType: 'System.Windows.Forms.KeyEventHandler', eventArgsType: 'KeyEventArgs', description: 'Occurs when a key is pressed while the control has focus.' },
  { name: 'KeyPress', category: 'Key', delegateType: 'System.Windows.Forms.KeyPressEventHandler', eventArgsType: 'KeyPressEventArgs', description: 'Occurs when a character, space, or backspace key is pressed while the control has focus.' },
  { name: 'KeyUp', category: 'Key', delegateType: 'System.Windows.Forms.KeyEventHandler', eventArgsType: 'KeyEventArgs', description: 'Occurs when a key is released while the control has focus.' },
  { name: 'Enter', category: 'Focus', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the control becomes the active control of the form.' },
  { name: 'Leave', category: 'Focus', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the control is no longer the active control of the form.' },
  { name: 'Validating', category: 'Focus', delegateType: 'System.ComponentModel.CancelEventHandler', eventArgsType: 'CancelEventArgs', description: 'Occurs when the control is validating.' },
  { name: 'Validated', category: 'Focus', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the control is finished validating.' },
  { name: 'TextChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Text property value changes.' },
  { name: 'VisibleChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Visible property value changes.' },
  { name: 'EnabledChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Enabled property value changes.' },
  { name: 'Paint', category: 'Appearance', delegateType: 'System.Windows.Forms.PaintEventHandler', eventArgsType: 'PaintEventArgs', description: 'Occurs when the control is redrawn.' },
  { name: 'Resize', category: 'Layout', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the control is resized.' },
  { name: 'Layout', category: 'Layout', delegateType: 'System.Windows.Forms.LayoutEventHandler', eventArgsType: 'LayoutEventArgs', description: 'Occurs when a control should reposition its child controls.' },
  { name: 'DragDrop', category: 'Drag Drop', delegateType: 'System.Windows.Forms.DragEventHandler', eventArgsType: 'DragEventArgs', description: 'Occurs when a drag-and-drop operation is completed.' },
  { name: 'DragEnter', category: 'Drag Drop', delegateType: 'System.Windows.Forms.DragEventHandler', eventArgsType: 'DragEventArgs', description: 'Occurs when an object is dragged into the control\'s bounds.' },
];

export const FORM_PROPERTIES: PropertyDefinition[] = [
  { name: 'Name', category: 'Design', editor: 'name', description: 'Indicates the name used in code to identify the form.' },
  { name: 'Text', category: 'Appearance', editor: 'string', defaultValue: 'Form1', description: 'The text displayed in the form\'s title bar.' },
  { name: 'ClientSize', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 800, height: 450 }, description: 'The size of the client area of the form.' },
  { name: 'MinimumSize', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 0, height: 0 }, description: 'The minimum size to which the form can be resized.' },
  { name: 'MaximumSize', category: 'Layout', editor: 'size', defaultValue: { kind: 'size', width: 0, height: 0 }, description: 'The maximum size to which the form can be resized.' },
  { name: 'StartPosition', category: 'Layout', editor: 'enum', enumType: 'FormStartPosition', defaultValue: { kind: 'enum', typeName: 'FormStartPosition', value: 'WindowsDefaultLocation' }, description: 'Determines the position of a form when it first appears.' },
  { name: 'WindowState', category: 'Layout', editor: 'enum', enumType: 'FormWindowState', defaultValue: { kind: 'enum', typeName: 'FormWindowState', value: 'Normal' }, description: 'Determines the initial visual state of the form.' },
  { name: 'AutoScaleMode', category: 'Layout', editor: 'enum', enumType: 'AutoScaleMode', defaultValue: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' }, description: 'Determines how the form scales when display DPI or font changes.' },
  { name: 'AutoScaleDimensions', category: 'Layout', editor: 'sizeF', defaultValue: { kind: 'sizeF', width: 7, height: 15 }, description: 'The DPI or font size at which the form was designed.' },
  { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Indicates whether scroll bars automatically appear when content overflows.' },
  { name: 'Padding', category: 'Layout', editor: 'padding', defaultValue: { kind: 'padding', all: 0, left: 0, top: 0, right: 0, bottom: 0 }, description: 'Specifies the interior spacing of the form.' },
  { name: 'FormBorderStyle', category: 'Appearance', editor: 'enum', enumType: 'FormBorderStyle', defaultValue: { kind: 'enum', typeName: 'FormBorderStyle', value: 'Sizable' }, description: 'Indicates the appearance and behavior of the border and title bar of the form.' },
  { name: 'BackColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'Control', isSystem: true }, description: 'The background color of the form.' },
  { name: 'ForeColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'ControlText', isSystem: true }, description: 'The default foreground color of the form.' },
  { name: 'Font', category: 'Appearance', editor: 'font', defaultValue: { kind: 'font', family: 'Segoe UI', size: 9, unit: 'Point' }, description: 'The default font used by the form and inherited by its controls.' },
  { name: 'BackgroundImage', category: 'Appearance', editor: 'image', description: 'The background image displayed in the form.' },
  { name: 'BackgroundImageLayout', category: 'Appearance', editor: 'enum', enumType: 'ImageLayout', defaultValue: { kind: 'enum', typeName: 'ImageLayout', value: 'Tile' }, description: 'The layout style for the background image.' },
  { name: 'Icon', category: 'Window Style', editor: 'icon', description: 'The icon displayed in the form\'s title bar and taskbar.' },
  { name: 'ControlBox', category: 'Window Style', editor: 'boolean', defaultValue: true, description: 'Determines whether a form has a Control/System menu box.' },
  { name: 'MinimizeBox', category: 'Window Style', editor: 'boolean', defaultValue: true, description: 'Determines whether a form has a minimize button.' },
  { name: 'MaximizeBox', category: 'Window Style', editor: 'boolean', defaultValue: true, description: 'Determines whether a form has a maximize button.' },
  { name: 'ShowIcon', category: 'Window Style', editor: 'boolean', defaultValue: true, description: 'Indicates whether an icon is displayed in the caption bar of the form.' },
  { name: 'ShowInTaskbar', category: 'Window Style', editor: 'boolean', defaultValue: true, description: 'Determines whether the form appears in the Windows Taskbar.' },
  { name: 'TopMost', category: 'Window Style', editor: 'boolean', defaultValue: false, description: 'Indicates whether the form always appears above all other non-topmost forms.' },
  { name: 'Opacity', category: 'Window Style', editor: 'float', defaultValue: 1, min: 0, max: 1, step: 0.05, description: 'Determines the opacity percentage of the form (0.0 to 1.0).' },
  { name: 'SizeGripStyle', category: 'Window Style', editor: 'enum', enumType: 'SizeGripStyle', defaultValue: { kind: 'enum', typeName: 'SizeGripStyle', value: 'Auto' }, description: 'Determines whether a sizing grip is displayed in the lower-right corner.' },
  { name: 'KeyPreview', category: 'Misc', editor: 'boolean', defaultValue: false, description: 'Determines whether keyboard events for controls are registered with the form first.' },
  { name: 'AcceptButton', category: 'Misc', editor: 'controlRef', controlRefTypes: ['Button'], description: 'The button clicked automatically when the user presses Enter.' },
  { name: 'CancelButton', category: 'Misc', editor: 'controlRef', controlRefTypes: ['Button'], description: 'The button clicked automatically when the user presses Escape.' },
  { name: 'MainMenuStrip', category: 'Misc', editor: 'controlRef', controlRefTypes: ['MenuStrip'], description: 'The primary MenuStrip container for the form.' },
  { name: 'RightToLeft', category: 'Appearance', editor: 'enum', enumType: 'RightToLeft', defaultValue: { kind: 'enum', typeName: 'RightToLeft', value: 'No' }, description: 'Indicates whether the form draws right-to-left.' },
];

export const FORM_EVENTS: EventDefinition[] = [
  { name: 'Load', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs before a form is displayed for the first time.' },
  { name: 'Shown', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs whenever the form is first displayed.' },
  { name: 'FormClosing', category: 'Behavior', delegateType: 'System.Windows.Forms.FormClosingEventHandler', eventArgsType: 'FormClosingEventArgs', description: 'Occurs before the form is closed.' },
  { name: 'FormClosed', category: 'Behavior', delegateType: 'System.Windows.Forms.FormClosedEventHandler', eventArgsType: 'FormClosedEventArgs', description: 'Occurs after the form is closed.' },
  { name: 'Activated', category: 'Focus', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the form is activated in code or by the user.' },
  { name: 'Deactivate', category: 'Focus', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the form loses focus and is no longer active.' },
  { name: 'ResizeEnd', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when a form exits resizing mode.' },
  ...COMMON_CONTROL_EVENTS,
];

// ---------------------------------------------------------------------------
// Complete Control & Component Catalog (52+ WinForms Controls & Components)
// ---------------------------------------------------------------------------

export const CONTROL_CATALOG: ControlDefinition[] = [
  // ---- ROOT TYPES ----
  {
    type: 'Form',
    displayName: 'Form',
    fullTypeName: 'System.Windows.Forms.Form',
    category: 'Root',
    description: 'Top-level Windows Form window.',
    namePrefix: 'Form',
    defaultSize: { width: 800, height: 450 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Load',
    defaultProperties: {
      Text: 'Form1',
      ClientSize: { kind: 'size', width: 800, height: 450 },
      AutoScaleMode: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' },
      AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
    },
    specificProperties: FORM_PROPERTIES,
    specificEvents: FORM_EVENTS,
    hiddenFromToolbox: true,
  },
  {
    type: 'UserControl',
    displayName: 'UserControl',
    fullTypeName: 'System.Windows.Forms.UserControl',
    category: 'Root',
    description: 'Reusable composite Windows Forms UserControl.',
    namePrefix: 'UserControl',
    defaultSize: { width: 400, height: 300 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Load',
    defaultProperties: {
      Size: { kind: 'size', width: 400, height: 300 },
      AutoScaleMode: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' },
      AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
    },
    specificProperties: [
      { name: 'AutoScaleMode', category: 'Layout', editor: 'enum', enumType: 'AutoScaleMode', defaultValue: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' }, description: 'Determines how the control scales on different DPI settings.' },
      { name: 'AutoScaleDimensions', category: 'Layout', editor: 'sizeF', defaultValue: { kind: 'sizeF', width: 7, height: 15 }, description: 'The DPI or font size at which the UserControl was designed.' },
      { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic scrollbars.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'Load', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs before the UserControl becomes visible for the first time.' },
    ],
    hiddenFromToolbox: true,
  },

  // ---- COMMON CONTROLS ----
  {
    type: 'Button',
    displayName: 'Button',
    fullTypeName: 'System.Windows.Forms.Button',
    category: 'Common Controls',
    description: 'Raises an event when the user clicks it.',
    namePrefix: 'button',
    defaultSize: { width: 96, height: 29 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'Click',
    defaultProperties: {
      UseVisualStyleBackColor: true,
    },
    specificProperties: [
      { name: 'FlatStyle', category: 'Appearance', editor: 'enum', enumType: 'FlatStyle', defaultValue: { kind: 'enum', typeName: 'FlatStyle', value: 'Standard' }, description: 'Determines the appearance of the control when a user moves the mouse over and clicks it.' },
      { name: 'FlatAppearance.BorderSize', category: 'Appearance', editor: 'number', defaultValue: 1, min: 0, max: 20, description: 'Border width (in pixels) around a Flat-style button.' },
      { name: 'FlatAppearance.BorderColor', category: 'Appearance', editor: 'color', description: 'Color of the border around a Flat-style button.' },
      { name: 'FlatAppearance.MouseOverBackColor', category: 'Appearance', editor: 'color', description: 'Background color when the pointer hovers over a Flat-style button.' },
      { name: 'FlatAppearance.MouseDownBackColor', category: 'Appearance', editor: 'color', description: 'Background color when a Flat-style button is pressed.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'MiddleCenter' }, description: 'The alignment of the text that will be displayed on the control.' },
      { name: 'Image', category: 'Appearance', editor: 'image', description: 'The image that will be displayed on the button.' },
      { name: 'ImageList', category: 'Appearance', editor: 'controlRef', controlRefTypes: ['ImageList'], description: 'The ImageList providing the image for this button.' },
      { name: 'ImageAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'MiddleCenter' }, description: 'The alignment of the image displayed on the button.' },
      { name: 'TextImageRelation', category: 'Appearance', editor: 'enum', enumType: 'TextImageRelation', defaultValue: { kind: 'enum', typeName: 'TextImageRelation', value: 'Overlay' }, description: 'Specifies the position of text and image relative to each other.' },
      { name: 'UseVisualStyleBackColor', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Determines whether the background is drawn using visual styles if supported.' },
      { name: 'DialogResult', category: 'Behavior', editor: 'enum', enumType: 'DialogResult', defaultValue: { kind: 'enum', typeName: 'DialogResult', value: 'None' }, description: 'The dialog result produced in a modal form by clicking the button.' },
      { name: 'AutoSize', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic resizing based on button text.' },
    ],
  },
  {
    type: 'Label',
    displayName: 'Label',
    fullTypeName: 'System.Windows.Forms.Label',
    category: 'Common Controls',
    description: 'Provides run-time information or descriptive text for a control.',
    namePrefix: 'label',
    defaultSize: { width: 64, height: 20 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'Click',
    defaultProperties: {
      AutoSize: true,
    },
    specificProperties: [
      { name: 'AutoSize', category: 'Layout', editor: 'boolean', defaultValue: true, description: 'Enables automatic resizing based on font size and text.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'TopLeft' }, description: 'Determines the position of the text within the label.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates whether the label should have a border.' },
      { name: 'FlatStyle', category: 'Appearance', editor: 'enum', enumType: 'FlatStyle', defaultValue: { kind: 'enum', typeName: 'FlatStyle', value: 'Standard' }, description: 'Determines the appearance of the label.' },
    ],
  },
  {
    type: 'LinkLabel',
    displayName: 'LinkLabel',
    fullTypeName: 'System.Windows.Forms.LinkLabel',
    category: 'Common Controls',
    description: 'Displays a label control that supports hyperlinks.',
    namePrefix: 'linkLabel',
    defaultSize: { width: 72, height: 20 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'LinkClicked',
    defaultProperties: {
      AutoSize: true,
      TabStop: true,
    },
    specificProperties: [
      { name: 'AutoSize', category: 'Layout', editor: 'boolean', defaultValue: true, description: 'Automatically resizes the label to fit its text.' },
      { name: 'LinkColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: '#0066CC', r: 0, g: 102, b: 204, a: 255 }, description: 'The color used when displaying a normal link.' },
      { name: 'ActiveLinkColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'Red', isNamed: true }, description: 'The color used when displaying an active link.' },
      { name: 'VisitedLinkColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'Purple', isNamed: true }, description: 'The color used when displaying a visited link.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'TopLeft' }, description: 'Alignment of the link text.' },
    ],
    specificEvents: [
      { name: 'LinkClicked', category: 'Action', delegateType: 'System.Windows.Forms.LinkLabelLinkClickedEventHandler', eventArgsType: 'LinkLabelLinkClickedEventArgs', description: 'Occurs when a link is clicked within the control.' },
    ],
  },
  {
    type: 'TextBox',
    displayName: 'TextBox',
    fullTypeName: 'System.Windows.Forms.TextBox',
    category: 'Common Controls',
    description: 'Enables the user to enter text, and provides multiline editing and password character masking.',
    namePrefix: 'textBox',
    defaultSize: { width: 150, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'TextChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Text', category: 'Appearance', editor: 'multilineString', defaultValue: '', description: 'The text displayed in the text box.' },
      { name: 'PlaceholderText', category: 'Appearance', editor: 'string', defaultValue: '', description: 'The placeholder text displayed when the TextBox is empty.' },
      { name: 'Multiline', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether the text of the edit control can span more than one line.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether the text in the edit control can be changed.' },
      { name: 'ScrollBars', category: 'Appearance', editor: 'enum', enumType: 'ScrollBars', defaultValue: { kind: 'enum', typeName: 'ScrollBars', value: 'None' }, description: 'Indicates which scroll bars should appear in a multiline TextBox.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'enum', enumType: 'HorizontalAlignment', defaultValue: { kind: 'enum', typeName: 'HorizontalAlignment', value: 'Left' }, description: 'Indicates how text should be aligned.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates whether the edit control should have a border.' },
      { name: 'PasswordChar', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Indicates the character to display for password input.' },
      { name: 'UseSystemPasswordChar', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Indicates if the text should appear as the default system password character.' },
      { name: 'MaxLength', category: 'Behavior', editor: 'number', defaultValue: 32767, min: 0, description: 'Specifies the maximum number of characters that can be entered.' },
      { name: 'WordWrap', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates if lines are automatically word-wrapped for multiline edit controls.' },
      { name: 'CharacterCasing', category: 'Behavior', editor: 'enum', enumType: 'CharacterCasing', defaultValue: { kind: 'enum', typeName: 'CharacterCasing', value: 'Normal' }, description: 'Indicates if all characters should be left alone or converted to uppercase or lowercase.' },
    ],
  },
  {
    type: 'RichTextBox',
    displayName: 'RichTextBox',
    fullTypeName: 'System.Windows.Forms.RichTextBox',
    category: 'Common Controls',
    description: 'Provides rich text input and advanced formatting capabilities.',
    namePrefix: 'richTextBox',
    defaultSize: { width: 180, height: 110 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'TextChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Text', category: 'Appearance', editor: 'multilineString', defaultValue: '', description: 'The text content of the RichTextBox.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether text can be edited.' },
      { name: 'WordWrap', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates if lines are automatically word-wrapped.' },
      { name: 'ScrollBars', category: 'Appearance', editor: 'enum', enumType: 'RichTextBoxScrollBars', defaultValue: { kind: 'enum', typeName: 'RichTextBoxScrollBars', value: 'Both' }, description: 'Specifies the type of scroll bars to display.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates the border style.' },
      { name: 'DetectUrls', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Automatically formats URLs typed into the control.' },
    ],
    specificEvents: [
      { name: 'SelectionChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the selection of text has changed.' },
      { name: 'LinkClicked', category: 'Behavior', delegateType: 'System.Windows.Forms.LinkClickedEventHandler', eventArgsType: 'LinkClickedEventArgs', description: 'Occurs when the user clicks on a link within the text.' },
    ],
  },
  {
    type: 'MaskedTextBox',
    displayName: 'MaskedTextBox',
    fullTypeName: 'System.Windows.Forms.MaskedTextBox',
    category: 'Common Controls',
    description: 'Uses a mask to distinguish between proper and improper user input.',
    namePrefix: 'maskedTextBox',
    defaultSize: { width: 130, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'MaskInputRejected',
    defaultProperties: {},
    specificProperties: [
      { name: 'Mask', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Sets the string governing the input allowed for this control (e.g., 00/00/0000).' },
      { name: 'PromptChar', category: 'Appearance', editor: 'string', defaultValue: '_', description: 'The character used to represent the absence of user input.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether the text can be modified.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'enum', enumType: 'HorizontalAlignment', defaultValue: { kind: 'enum', typeName: 'HorizontalAlignment', value: 'Left' }, description: 'Indicates how text should be aligned.' },
    ],
    specificEvents: [
      { name: 'MaskInputRejected', category: 'Behavior', delegateType: 'System.Windows.Forms.MaskInputRejectedEventHandler', eventArgsType: 'MaskInputRejectedEventArgs', description: 'Occurs when the user\'s input does not match the corresponding format element.' },
    ],
  },
  {
    type: 'CheckBox',
    displayName: 'CheckBox',
    fullTypeName: 'System.Windows.Forms.CheckBox',
    category: 'Common Controls',
    description: 'Enables the user to select or clear the associated option.',
    namePrefix: 'checkBox',
    defaultSize: { width: 100, height: 21 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'CheckedChanged',
    defaultProperties: {
      AutoSize: true,
      UseVisualStyleBackColor: true,
    },
    specificProperties: [
      { name: 'Checked', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Indicates whether the component is in the checked state.' },
      { name: 'CheckState', category: 'Appearance', editor: 'enum', enumType: 'CheckState', defaultValue: { kind: 'enum', typeName: 'CheckState', value: 'Unchecked' }, description: 'Indicates the check state of the component.' },
      { name: 'ThreeState', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Allows the check box to accept three check states.' },
      { name: 'Appearance', category: 'Appearance', editor: 'enum', enumType: 'Appearance', defaultValue: { kind: 'enum', typeName: 'Appearance', value: 'Normal' }, description: 'Determines whether the check box appears as a standard box or push button.' },
      { name: 'AutoSize', category: 'Layout', editor: 'boolean', defaultValue: true, description: 'Enables automatic resizing.' },
      { name: 'CheckAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'MiddleLeft' }, description: 'Determines the location of the check box inside the control.' },
      { name: 'UseVisualStyleBackColor', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Draws background using visual styles.' },
    ],
    specificEvents: [
      { name: 'CheckedChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs whenever the Checked property is changed.' },
      { name: 'CheckStateChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs whenever the CheckState property is changed.' },
    ],
  },
  {
    type: 'RadioButton',
    displayName: 'RadioButton',
    fullTypeName: 'System.Windows.Forms.RadioButton',
    category: 'Common Controls',
    description: 'Enables the user to select a single option from a group of choices.',
    namePrefix: 'radioButton',
    defaultSize: { width: 104, height: 21 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'CheckedChanged',
    defaultProperties: {
      AutoSize: true,
      TabStop: true,
      UseVisualStyleBackColor: true,
    },
    specificProperties: [
      { name: 'Checked', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Indicates whether the radio button is checked.' },
      { name: 'Appearance', category: 'Appearance', editor: 'enum', enumType: 'Appearance', defaultValue: { kind: 'enum', typeName: 'Appearance', value: 'Normal' }, description: 'Determines whether the control appears as a standard radio button or push button.' },
      { name: 'AutoSize', category: 'Layout', editor: 'boolean', defaultValue: true, description: 'Enables automatic resizing.' },
      { name: 'CheckAlign', category: 'Appearance', editor: 'alignment', enumType: 'ContentAlignment', defaultValue: { kind: 'enum', typeName: 'ContentAlignment', value: 'MiddleLeft' }, description: 'Determines the location of the check mark.' },
      { name: 'UseVisualStyleBackColor', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Draws background using visual styles.' },
    ],
    specificEvents: [
      { name: 'CheckedChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs whenever the Checked property is changed.' },
    ],
  },
  {
    type: 'ComboBox',
    displayName: 'ComboBox',
    fullTypeName: 'System.Windows.Forms.ComboBox',
    category: 'Common Controls',
    description: 'Displays an editable text box with a drop-down list of permitted values.',
    namePrefix: 'comboBox',
    defaultSize: { width: 150, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'SelectedIndexChanged',
    defaultProperties: {
      FormattingEnabled: true,
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stringCollection', description: 'The items in the combo box.' },
      { name: 'DropDownStyle', category: 'Appearance', editor: 'enum', enumType: 'ComboBoxStyle', defaultValue: { kind: 'enum', typeName: 'ComboBoxStyle', value: 'DropDown' }, description: 'Controls the appearance and functionality of the combo box.' },
      { name: 'FormattingEnabled', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Determines whether formatting is applied to DisplayMember.' },
      { name: 'Sorted', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Specifies whether items are sorted alphabetically.' },
      { name: 'FlatStyle', category: 'Appearance', editor: 'enum', enumType: 'FlatStyle', defaultValue: { kind: 'enum', typeName: 'FlatStyle', value: 'Standard' }, description: 'Determines the visual style.' },
    ],
    specificEvents: [
      { name: 'SelectedIndexChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedIndex property has changed.' },
      { name: 'SelectedValueChanged', category: 'Property Changed', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedValue property changes.' },
      { name: 'DropDown', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the drop-down portion is shown.' },
    ],
  },
  {
    type: 'ListBox',
    displayName: 'ListBox',
    fullTypeName: 'System.Windows.Forms.ListBox',
    category: 'Common Controls',
    description: 'Displays a list from which the user can select one or more items.',
    namePrefix: 'listBox',
    defaultSize: { width: 140, height: 96 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'SelectedIndexChanged',
    defaultProperties: {
      FormattingEnabled: true,
      ItemHeight: 15,
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stringCollection', description: 'The items in the list box.' },
      { name: 'SelectionMode', category: 'Behavior', editor: 'enum', enumType: 'SelectionMode', defaultValue: { kind: 'enum', typeName: 'SelectionMode', value: 'One' }, description: 'Indicates if the list box is to be single-select, multi-select, or not selectable.' },
      { name: 'Sorted', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether the list is sorted.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates the border style.' },
      { name: 'ItemHeight', category: 'Behavior', editor: 'number', defaultValue: 15, min: 8, max: 255, description: 'The height of an item in the list box.' },
      { name: 'MultiColumn', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Indicates if values should be displayed in columns horizontally.' },
    ],
    specificEvents: [
      { name: 'SelectedIndexChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedIndex property has changed.' },
    ],
  },
  {
    type: 'CheckedListBox',
    displayName: 'CheckedListBox',
    fullTypeName: 'System.Windows.Forms.CheckedListBox',
    category: 'Common Controls',
    description: 'Displays a list of items with a check box next to each item.',
    namePrefix: 'checkedListBox',
    defaultSize: { width: 150, height: 96 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'SelectedIndexChanged',
    defaultProperties: {
      FormattingEnabled: true,
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stringCollection', description: 'The items in the checked list box.' },
      { name: 'CheckOnClick', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Indicates whether the check box should be toggled on the first click.' },
      { name: 'Sorted', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Controls whether the list is sorted.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'SelectedIndexChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedIndex property has changed.' },
      { name: 'ItemCheck', category: 'Behavior', delegateType: 'System.Windows.Forms.ItemCheckEventHandler', eventArgsType: 'ItemCheckEventArgs', description: 'Occurs when the checked state of an item changes.' },
    ],
  },
  {
    type: 'NumericUpDown',
    displayName: 'NumericUpDown',
    fullTypeName: 'System.Windows.Forms.NumericUpDown',
    category: 'Common Controls',
    description: 'Displays a single numeric value that the user can increment or decrement.',
    namePrefix: 'numericUpDown',
    defaultSize: { width: 120, height: 23 },
    isContainer: false,
    isComponent: false,
    supportsInitialize: true,
    defaultEvent: 'ValueChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Value', category: 'Data', editor: 'float', defaultValue: 0, description: 'The current value of the spin box.' },
      { name: 'Minimum', category: 'Data', editor: 'float', defaultValue: 0, description: 'The minimum value for the numeric up-down control.' },
      { name: 'Maximum', category: 'Data', editor: 'float', defaultValue: 100, description: 'The maximum value for the numeric up-down control.' },
      { name: 'Increment', category: 'Data', editor: 'float', defaultValue: 1, description: 'The amount to increment or decrement on each click.' },
      { name: 'DecimalPlaces', category: 'Data', editor: 'number', defaultValue: 0, min: 0, max: 10, description: 'The number of decimal places to display.' },
      { name: 'ThousandsSeparator', category: 'Data', editor: 'boolean', defaultValue: false, description: 'Displays a thousands separator when appropriate.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Prevents typing directly into the edit box.' },
      { name: 'TextAlign', category: 'Appearance', editor: 'enum', enumType: 'HorizontalAlignment', defaultValue: { kind: 'enum', typeName: 'HorizontalAlignment', value: 'Left' }, description: 'Text alignment inside the box.' },
    ],
    specificEvents: [
      { name: 'ValueChanged', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Value property has changed.' },
    ],
  },
  {
    type: 'DateTimePicker',
    displayName: 'DateTimePicker',
    fullTypeName: 'System.Windows.Forms.DateTimePicker',
    category: 'Common Controls',
    description: 'Enables the user to select a single item from a list of dates or times.',
    namePrefix: 'dateTimePicker',
    defaultSize: { width: 200, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'ValueChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Format', category: 'Appearance', editor: 'enum', enumType: 'DateTimePickerFormat', defaultValue: { kind: 'enum', typeName: 'DateTimePickerFormat', value: 'Long' }, description: 'Determines whether dates and times are displayed using standard or custom formatting.' },
      { name: 'CustomFormat', category: 'Behavior', editor: 'string', defaultValue: '', description: 'The custom date/time format string (e.g., yyyy-MM-dd).' },
      { name: 'ShowCheckBox', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Determines whether a check box is displayed to the left of the selected date.' },
      { name: 'ShowUpDown', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Uses a spin button instead of a drop-down calendar.' },
      { name: 'Checked', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether the value is valid when ShowCheckBox is true.' },
    ],
    specificEvents: [
      { name: 'ValueChanged', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Value property changes.' },
    ],
  },
  {
    type: 'MonthCalendar',
    displayName: 'MonthCalendar',
    fullTypeName: 'System.Windows.Forms.MonthCalendar',
    category: 'Common Controls',
    description: 'Displays a monthly calendar from which the user can select a date or range.',
    namePrefix: 'monthCalendar',
    defaultSize: { width: 227, height: 162 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'DateChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'ShowToday', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Displays today\'s date at the bottom of the calendar.' },
      { name: 'ShowTodayCircle', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Circles today\'s date.' },
      { name: 'ShowWeekNumbers', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Displays week numbers to the left of each row of days.' },
      { name: 'MaxSelectionCount', category: 'Behavior', editor: 'number', defaultValue: 7, min: 1, description: 'Maximum number of days that can be selected.' },
    ],
    specificEvents: [
      { name: 'DateChanged', category: 'Action', delegateType: 'System.Windows.Forms.DateRangeEventHandler', eventArgsType: 'DateRangeEventArgs', description: 'Occurs when the date selected in the calendar changes.' },
      { name: 'DateSelected', category: 'Action', delegateType: 'System.Windows.Forms.DateRangeEventHandler', eventArgsType: 'DateRangeEventArgs', description: 'Occurs when the user makes an explicit date selection.' },
    ],
  },
  {
    type: 'PictureBox',
    displayName: 'PictureBox',
    fullTypeName: 'System.Windows.Forms.PictureBox',
    category: 'Common Controls',
    description: 'Displays an image.',
    namePrefix: 'pictureBox',
    defaultSize: { width: 140, height: 100 },
    isContainer: false,
    isComponent: false,
    supportsInitialize: true,
    defaultEvent: 'Click',
    defaultProperties: {
      TabStop: false,
    },
    specificProperties: [
      { name: 'Image', category: 'Appearance', editor: 'image', description: 'The image displayed in the PictureBox.' },
      { name: 'SizeMode', category: 'Behavior', editor: 'enum', enumType: 'PictureBoxSizeMode', defaultValue: { kind: 'enum', typeName: 'PictureBoxSizeMode', value: 'Normal' }, description: 'Controls how the PictureBox handles image placement and control sizing.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates the border style.' },
    ],
  },
  {
    type: 'ProgressBar',
    displayName: 'ProgressBar',
    fullTypeName: 'System.Windows.Forms.ProgressBar',
    category: 'Common Controls',
    description: 'Displays a bar that fills in to indicate progress of an operation.',
    namePrefix: 'progressBar',
    defaultSize: { width: 160, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'Click',
    defaultProperties: {
      Value: 45,
    },
    specificProperties: [
      { name: 'Value', category: 'Behavior', editor: 'number', defaultValue: 0, min: 0, description: 'The current value for the ProgressBar, in the range specified by Minimum and Maximum.' },
      { name: 'Minimum', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'The lower bound of the range this ProgressBar works with.' },
      { name: 'Maximum', category: 'Behavior', editor: 'number', defaultValue: 100, description: 'The upper bound of the range this ProgressBar works with.' },
      { name: 'Step', category: 'Behavior', editor: 'number', defaultValue: 10, description: 'The amount to increment the current value when PerformStep is called.' },
      { name: 'Style', category: 'Behavior', editor: 'enum', enumType: 'ProgressBarStyle', defaultValue: { kind: 'enum', typeName: 'ProgressBarStyle', value: 'Blocks' }, description: 'Determines the manner in which progress is indicated.' },
    ],
  },
  {
    type: 'ListView',
    displayName: 'ListView',
    fullTypeName: 'System.Windows.Forms.ListView',
    category: 'Common Controls',
    description: 'Displays a collection of items with icons, details columns, or tiles.',
    namePrefix: 'listView',
    defaultSize: { width: 220, height: 130 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'SelectedIndexChanged',
    defaultProperties: {
      View: { kind: 'enum', typeName: 'View', value: 'Details' },
      UseCompatibleStateImageBehavior: false,
    },
    specificProperties: [
      { name: 'Columns', category: 'Behavior', editor: 'listViewColumnsCollection', description: 'The column headers displayed in Details view.' },
      { name: 'View', category: 'Appearance', editor: 'enum', enumType: 'View', defaultValue: { kind: 'enum', typeName: 'View', value: 'LargeIcon' }, description: 'Selects one of five different views that items can be shown in.' },
      { name: 'FullRowSelect', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Highlights all subitems when an item is clicked in Details view.' },
      { name: 'GridLines', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Shows grid lines between rows and columns in Details view.' },
      { name: 'CheckBoxes', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Displays check boxes next to each item.' },
      { name: 'MultiSelect', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Allows multiple items to be selected.' },
      { name: 'SmallImageList', category: 'Behavior', editor: 'controlRef', controlRefTypes: ['ImageList'], description: 'The ImageList used when displaying small icons.' },
      { name: 'LargeImageList', category: 'Behavior', editor: 'controlRef', controlRefTypes: ['ImageList'], description: 'The ImageList used when displaying large icons.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'SelectedIndexChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedIndices collection changes.' },
      { name: 'ItemActivate', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when an item is activated.' },
    ],
  },
  {
    type: 'TreeView',
    displayName: 'TreeView',
    fullTypeName: 'System.Windows.Forms.TreeView',
    category: 'Common Controls',
    description: 'Displays a hierarchical collection of labeled items.',
    namePrefix: 'treeView',
    defaultSize: { width: 180, height: 150 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'AfterSelect',
    defaultProperties: {},
    specificProperties: [
      { name: 'Nodes', category: 'Behavior', editor: 'treeNodesCollection', description: 'The root tree nodes displayed in the TreeView.' },
      { name: 'CheckBoxes', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Indicates whether check boxes are displayed beside nodes.' },
      { name: 'ShowLines', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether lines are drawn between tree nodes.' },
      { name: 'ShowPlusMinus', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether expand/collapse buttons are shown.' },
      { name: 'ShowRootLines', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether lines are drawn between root nodes.' },
      { name: 'FullRowSelect', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Highlights the entire width of the TreeView row.' },
      { name: 'ImageList', category: 'Behavior', editor: 'controlRef', controlRefTypes: ['ImageList'], description: 'The ImageList providing node icons.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'Fixed3D' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'AfterSelect', category: 'Behavior', delegateType: 'System.Windows.Forms.TreeViewEventHandler', eventArgsType: 'TreeViewEventArgs', description: 'Occurs after a tree node is selected.' },
      { name: 'NodeMouseDoubleClick', category: 'Behavior', delegateType: 'System.Windows.Forms.TreeNodeMouseClickEventHandler', eventArgsType: 'TreeNodeMouseClickEventArgs', description: 'Occurs when the user double-clicks a TreeNode.' },
    ],
  },
  {
    type: 'TrackBar',
    displayName: 'TrackBar',
    fullTypeName: 'System.Windows.Forms.TrackBar',
    category: 'Common Controls',
    description: 'Allows the user to select a value from a range by moving a slider thumb.',
    namePrefix: 'trackBar',
    defaultSize: { width: 150, height: 45 },
    isContainer: false,
    isComponent: false,
    supportsInitialize: true,
    defaultEvent: 'Scroll',
    defaultProperties: {
      Minimum: 0,
      Maximum: 10,
      Value: 5,
    },
    specificProperties: [
      { name: 'Value', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'The position of the slider.' },
      { name: 'Minimum', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'The minimum value for the position of the slider.' },
      { name: 'Maximum', category: 'Behavior', editor: 'number', defaultValue: 10, description: 'The maximum value for the position of the slider.' },
      { name: 'TickFrequency', category: 'Appearance', editor: 'number', defaultValue: 1, min: 1, description: 'The number of positions between tick marks.' },
      { name: 'TickStyle', category: 'Appearance', editor: 'enum', enumType: 'TickStyle', defaultValue: { kind: 'enum', typeName: 'TickStyle', value: 'BottomRight' }, description: 'Indicates where tick marks appear.' },
      { name: 'Orientation', category: 'Appearance', editor: 'enum', enumType: 'Orientation', defaultValue: { kind: 'enum', typeName: 'Orientation', value: 'Horizontal' }, description: 'The orientation of the control.' },
    ],
    specificEvents: [
      { name: 'Scroll', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when either a mouse or keyboard action moves the slider.' },
      { name: 'ValueChanged', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Value property changes.' },
    ],
  },
  {
    type: 'WebBrowser',
    displayName: 'WebBrowser',
    fullTypeName: 'System.Windows.Forms.WebBrowser',
    category: 'Common Controls',
    description: 'Enables the user to navigate Web pages inside the form.',
    namePrefix: 'webBrowser',
    defaultSize: { width: 250, height: 180 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'DocumentCompleted',
    defaultProperties: {
      MinimumSize: { kind: 'size', width: 20, height: 20 },
    },
    specificProperties: [
      { name: 'Url', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Specifies the URL of the document displayed in the WebBrowser.' },
      { name: 'ScriptErrorsSuppressed', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Suppresses script error dialogs.' },
    ],
    specificEvents: [
      { name: 'DocumentCompleted', category: 'Behavior', delegateType: 'System.Windows.Forms.WebBrowserDocumentCompletedEventHandler', eventArgsType: 'WebBrowserDocumentCompletedEventArgs', description: 'Occurs when the WebBrowser finishes loading a document.' },
    ],
  },
  {
    type: 'NotifyIcon',
    displayName: 'NotifyIcon',
    fullTypeName: 'System.Windows.Forms.NotifyIcon',
    category: 'Common Controls',
    description: 'Displays an icon in the Windows notification area (system tray) at run time.',
    namePrefix: 'notifyIcon',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    takesComponentsArg: true,
    defaultEvent: 'MouseDoubleClick',
    defaultProperties: { Visible: true },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Text', category: 'Appearance', editor: 'string', defaultValue: '', description: 'Tooltip text displayed on hover.' },
      { name: 'BalloonTipTitle', category: 'Appearance', editor: 'string', defaultValue: '', description: 'Title of the balloon notification.' },
      { name: 'BalloonTipText', category: 'Appearance', editor: 'string', defaultValue: '', description: 'Text of the balloon notification.' },
      { name: 'Icon', category: 'Appearance', editor: 'icon', description: 'The icon displayed in the system tray.' },
      { name: 'Visible', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Determines whether the icon is visible in the system tray.' },
    ],
    specificEvents: [
      { name: 'MouseDoubleClick', category: 'Mouse', delegateType: 'System.Windows.Forms.MouseEventHandler', eventArgsType: 'MouseEventArgs', description: 'Occurs when the user double-clicks the tray icon.' },
      { name: 'Click', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the user clicks the tray icon.' },
    ],
  },
  {
    type: 'ToolTip',
    displayName: 'ToolTip',
    fullTypeName: 'System.Windows.Forms.ToolTip',
    category: 'Common Controls',
    description: 'Displays information when the user moves the pointer over an associated control.',
    namePrefix: 'toolTip',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    takesComponentsArg: true,
    defaultEvent: 'Popup',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'ToolTipTitle', category: 'Misc', editor: 'string', defaultValue: '', description: 'Title for the ToolTip window.' },
      { name: 'IsBalloon', category: 'Misc', editor: 'boolean', defaultValue: false, description: 'Displays ToolTip in balloon style.' },
      { name: 'AutoPopDelay', category: 'Misc', editor: 'number', defaultValue: 5000, description: 'Period of time (ms) the ToolTip remains visible.' },
      { name: 'InitialDelay', category: 'Misc', editor: 'number', defaultValue: 500, description: 'Time (ms) before the ToolTip appears.' },
    ],
    specificEvents: [
      { name: 'Popup', category: 'Misc', delegateType: 'System.Windows.Forms.PopupEventHandler', eventArgsType: 'PopupEventArgs', description: 'Occurs before a ToolTip is initially displayed.' },
    ],
  },

  // ---- CONTAINERS ----
  {
    type: 'Panel',
    displayName: 'Panel',
    fullTypeName: 'System.Windows.Forms.Panel',
    category: 'Containers',
    description: 'Enables you to group collections of controls.',
    namePrefix: 'panel',
    defaultSize: { width: 220, height: 140 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Paint',
    defaultProperties: {},
    specificProperties: [
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates whether the panel should have a border.' },
      { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic scroll bars when child controls overflow.' },
    ],
  },
  {
    type: 'GroupBox',
    displayName: 'GroupBox',
    fullTypeName: 'System.Windows.Forms.GroupBox',
    category: 'Containers',
    description: 'Displays a frame around a group of controls with an optional caption.',
    namePrefix: 'groupBox',
    defaultSize: { width: 220, height: 140 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Enter',
    defaultProperties: {
      TabStop: false,
    },
    specificProperties: [
      { name: 'FlatStyle', category: 'Appearance', editor: 'enum', enumType: 'FlatStyle', defaultValue: { kind: 'enum', typeName: 'FlatStyle', value: 'Standard' }, description: 'Determines the border appearance of the GroupBox.' },
    ],
  },
  {
    type: 'TabControl',
    displayName: 'TabControl',
    fullTypeName: 'System.Windows.Forms.TabControl',
    category: 'Containers',
    description: 'Manages and displays a related set of tab pages.',
    namePrefix: 'tabControl',
    defaultSize: { width: 280, height: 180 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'SelectedIndexChanged',
    defaultProperties: {
      SelectedIndex: 0,
    },
    specificProperties: [
      { name: 'TabPages', category: 'Behavior', editor: 'tabPagesCollection', description: 'The TabPages in the TabControl.' },
      { name: 'SelectedIndex', category: 'Behavior', editor: 'number', defaultValue: 0, min: 0, description: 'The index of the currently selected tab page.' },
      { name: 'Alignment', category: 'Appearance', editor: 'enum', enumType: 'TabAlignment', defaultValue: { kind: 'enum', typeName: 'TabAlignment', value: 'Top' }, description: 'Determines whether the tabs appear at the top, bottom, left, or right.' },
      { name: 'Appearance', category: 'Appearance', editor: 'enum', enumType: 'TabAppearance', defaultValue: { kind: 'enum', typeName: 'TabAppearance', value: 'Normal' }, description: 'Indicates whether the tabs are painted as buttons or regular tabs.' },
      { name: 'Multiline', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Indicates if more than one row of tabs is allowed.' },
    ],
    specificEvents: [
      { name: 'SelectedIndexChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedIndex property is changed.' },
      { name: 'Selecting', category: 'Action', delegateType: 'System.Windows.Forms.TabControlCancelEventHandler', eventArgsType: 'TabControlCancelEventArgs', description: 'Occurs before a tab is selected.' },
    ],
  },
  {
    type: 'TabPage',
    displayName: 'TabPage',
    fullTypeName: 'System.Windows.Forms.TabPage',
    category: 'Containers',
    description: 'Represents a single tab page inside a TabControl.',
    namePrefix: 'tabPage',
    defaultSize: { width: 272, height: 154 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Click',
    defaultProperties: {
      Padding: { kind: 'padding', all: 3, left: 3, top: 3, right: 3, bottom: 3 },
      UseVisualStyleBackColor: true,
    },
    specificProperties: [
      { name: 'UseVisualStyleBackColor', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Draws background using visual styles.' },
      { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic scroll bars.' },
    ],
    hiddenFromToolbox: true,
  },
  {
    type: 'SplitContainer',
    displayName: 'SplitContainer',
    fullTypeName: 'System.Windows.Forms.SplitContainer',
    category: 'Containers',
    description: 'Divides the container\'s display area into two resizable panels.',
    namePrefix: 'splitContainer',
    defaultSize: { width: 320, height: 180 },
    isContainer: true,
    isComponent: false,
    supportsInitialize: true,
    supportsLayoutSuspension: true,
    defaultEvent: 'SplitterMoved',
    defaultProperties: {
      SplitterDistance: 120,
      SplitterWidth: 4,
      Orientation: { kind: 'enum', typeName: 'Orientation', value: 'Vertical' },
      BorderStyle: { kind: 'enum', typeName: 'BorderStyle', value: 'FixedSingle' },
    },
    specificProperties: [
      { name: 'Orientation', category: 'Behavior', editor: 'enum', enumType: 'Orientation', defaultValue: { kind: 'enum', typeName: 'Orientation', value: 'Vertical' }, description: 'Determines if the splitter is vertical or horizontal.' },
      { name: 'SplitterDistance', category: 'Layout', editor: 'number', defaultValue: 120, min: 25, description: 'Determines pixel distance of the splitter from the left or top edge.' },
      { name: 'SplitterWidth', category: 'Layout', editor: 'number', defaultValue: 4, min: 1, max: 20, description: 'Determines the thickness of the splitter.' },
      { name: 'Panel1MinSize', category: 'Layout', editor: 'number', defaultValue: 25, min: 0, description: 'Minimum pixel size of Panel1.' },
      { name: 'Panel2MinSize', category: 'Layout', editor: 'number', defaultValue: 25, min: 0, description: 'Minimum pixel size of Panel2.' },
      { name: 'Panel1.Padding', category: 'Layout', editor: 'padding', defaultValue: { kind: 'padding', all: 0, left: 0, top: 0, right: 0, bottom: 0 }, description: 'Interior spacing of Panel1.' },
      { name: 'Panel2.Padding', category: 'Layout', editor: 'padding', defaultValue: { kind: 'padding', all: 0, left: 0, top: 0, right: 0, bottom: 0 }, description: 'Interior spacing of Panel2.' },
      { name: 'Panel1.BackColor', category: 'Appearance', editor: 'color', description: 'Background color of Panel1.' },
      { name: 'Panel2.BackColor', category: 'Appearance', editor: 'color', description: 'Background color of Panel2.' },
      { name: 'FixedPanel', category: 'Layout', editor: 'enum', enumType: 'FixedPanel', defaultValue: { kind: 'enum', typeName: 'FixedPanel', value: 'None' }, description: 'Indicates which panel stays the same size when resizing.' },
      { name: 'IsSplitterFixed', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Determines if the splitter is fixed or movable.' },
      { name: 'Panel1Collapsed', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Determines if Panel1 is collapsed.' },
      { name: 'Panel2Collapsed', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Determines if Panel2 is collapsed.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'SplitterMoved', category: 'Behavior', delegateType: 'System.Windows.Forms.SplitterEventHandler', eventArgsType: 'SplitterEventArgs', description: 'Occurs when the splitter control is moved.' },
    ],
  },
  {
    type: 'FlowLayoutPanel',
    displayName: 'FlowLayoutPanel',
    fullTypeName: 'System.Windows.Forms.FlowLayoutPanel',
    category: 'Containers',
    description: 'Dynamically arranges its child controls horizontally or vertically.',
    namePrefix: 'flowLayoutPanel',
    defaultSize: { width: 240, height: 120 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Paint',
    defaultProperties: {
      FlowDirection: { kind: 'enum', typeName: 'FlowDirection', value: 'LeftToRight' },
      WrapContents: true,
    },
    specificProperties: [
      { name: 'FlowDirection', category: 'Layout', editor: 'enum', enumType: 'FlowDirection', defaultValue: { kind: 'enum', typeName: 'FlowDirection', value: 'LeftToRight' }, description: 'Specifies the direction in which controls are laid out.' },
      { name: 'WrapContents', category: 'Layout', editor: 'boolean', defaultValue: true, description: 'Specifies whether controls wrap to the next line or are clipped.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Indicates the border style.' },
      { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic scroll bars.' },
    ],
  },
  {
    type: 'TableLayoutPanel',
    displayName: 'TableLayoutPanel',
    fullTypeName: 'System.Windows.Forms.TableLayoutPanel',
    category: 'Containers',
    description: 'Arranges its contents in a grid of rows and columns.',
    namePrefix: 'tableLayoutPanel',
    defaultSize: { width: 260, height: 150 },
    isContainer: true,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultEvent: 'Paint',
    defaultProperties: {
      ColumnCount: 2,
      RowCount: 2,
    },
    specificProperties: [
      { name: 'ColumnCount', category: 'Layout', editor: 'number', defaultValue: 2, min: 1, max: 24, description: 'The number of columns in the table.' },
      { name: 'RowCount', category: 'Layout', editor: 'number', defaultValue: 2, min: 1, max: 24, description: 'The number of rows in the table.' },
      { name: 'CellBorderStyle', category: 'Appearance', editor: 'enum', enumType: 'TableLayoutPanelCellBorderStyle', defaultValue: { kind: 'enum', typeName: 'TableLayoutPanelCellBorderStyle', value: 'None' }, description: 'Specifies the border style for the cells in the table.' },
      { name: 'ColumnsAndRows', category: 'Layout', editor: 'tableLayoutCollection', description: 'Edit column and row sizing rules (Percent, Absolute, AutoSize).' },
      { name: 'AutoScroll', category: 'Layout', editor: 'boolean', defaultValue: false, description: 'Enables automatic scroll bars.' },
    ],
  },

  // ---- MENUS & TOOLBARS ----
  {
    type: 'MenuStrip',
    displayName: 'MenuStrip',
    fullTypeName: 'System.Windows.Forms.MenuStrip',
    category: 'Menus & Toolbars',
    description: 'Provides a menu system for a form.',
    namePrefix: 'menuStrip',
    defaultSize: { width: 800, height: 24 },
    isContainer: false,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultDock: 'Top',
    defaultEvent: 'ItemClicked',
    defaultProperties: {
      Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Top' },
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stripItemsCollection', description: 'Top-level menu items and dropdowns.' },
      { name: 'RenderMode', category: 'Appearance', editor: 'enum', enumType: 'ToolStripRenderMode', defaultValue: { kind: 'enum', typeName: 'ToolStripRenderMode', value: 'ManagerRenderMode' }, description: 'Determines painting style for the MenuStrip.' },
      { name: 'GripStyle', category: 'Appearance', editor: 'enum', enumType: 'ToolStripGripStyle', defaultValue: { kind: 'enum', typeName: 'ToolStripGripStyle', value: 'Hidden' }, description: 'Specifies whether the move handle is visible.' },
    ],
    specificEvents: [
      { name: 'ItemClicked', category: 'Action', delegateType: 'System.Windows.Forms.ToolStripItemClickedEventHandler', eventArgsType: 'ToolStripItemClickedEventArgs', description: 'Occurs when a menu item is clicked.' },
    ],
  },
  {
    type: 'ToolStrip',
    displayName: 'ToolStrip',
    fullTypeName: 'System.Windows.Forms.ToolStrip',
    category: 'Menus & Toolbars',
    description: 'Provides toolbars and other user interface elements supporting buttons, text boxes, and dropdowns.',
    namePrefix: 'toolStrip',
    defaultSize: { width: 800, height: 25 },
    isContainer: false,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultDock: 'Top',
    defaultEvent: 'ItemClicked',
    defaultProperties: {
      Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Top' },
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stripItemsCollection', description: 'Toolbar buttons, labels, text boxes, and separators.' },
      { name: 'GripStyle', category: 'Appearance', editor: 'enum', enumType: 'ToolStripGripStyle', defaultValue: { kind: 'enum', typeName: 'ToolStripGripStyle', value: 'Visible' }, description: 'Specifies whether the grip handle is visible.' },
      { name: 'RenderMode', category: 'Appearance', editor: 'enum', enumType: 'ToolStripRenderMode', defaultValue: { kind: 'enum', typeName: 'ToolStripRenderMode', value: 'ManagerRenderMode' }, description: 'Determines painting style.' },
    ],
    specificEvents: [
      { name: 'ItemClicked', category: 'Action', delegateType: 'System.Windows.Forms.ToolStripItemClickedEventHandler', eventArgsType: 'ToolStripItemClickedEventArgs', description: 'Occurs when a ToolStripItem is clicked.' },
    ],
  },
  {
    type: 'StatusStrip',
    displayName: 'StatusStrip',
    fullTypeName: 'System.Windows.Forms.StatusStrip',
    category: 'Menus & Toolbars',
    description: 'Represents a Windows status bar control.',
    namePrefix: 'statusStrip',
    defaultSize: { width: 800, height: 22 },
    isContainer: false,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultDock: 'Bottom',
    defaultEvent: 'ItemClicked',
    defaultProperties: {
      Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Bottom' },
    },
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stripItemsCollection', description: 'Status labels, progress bars, and dropdown buttons.' },
      { name: 'SizingGrip', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Displays a sizing grip in the lower-right corner.' },
    ],
    specificEvents: [
      { name: 'ItemClicked', category: 'Action', delegateType: 'System.Windows.Forms.ToolStripItemClickedEventHandler', eventArgsType: 'ToolStripItemClickedEventArgs', description: 'Occurs when a status item is clicked.' },
    ],
  },
  {
    type: 'ContextMenuStrip',
    displayName: 'ContextMenuStrip',
    fullTypeName: 'System.Windows.Forms.ContextMenuStrip',
    category: 'Menus & Toolbars',
    description: 'Represents a shortcut context menu.',
    namePrefix: 'contextMenuStrip',
    defaultSize: { width: 150, height: 48 },
    isContainer: false,
    isComponent: true,
    takesComponentsArg: true,
    defaultEvent: 'Opening',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Items', category: 'Data', editor: 'stripItemsCollection', description: 'Menu items in the context menu.' },
    ],
    specificEvents: [
      { name: 'Opening', category: 'Action', delegateType: 'System.ComponentModel.CancelEventHandler', eventArgsType: 'CancelEventArgs', description: 'Occurs when the ContextMenuStrip is opening.' },
      { name: 'ItemClicked', category: 'Action', delegateType: 'System.Windows.Forms.ToolStripItemClickedEventHandler', eventArgsType: 'ToolStripItemClickedEventArgs', description: 'Occurs when an item is clicked.' },
    ],
  },

  // ---- DATA ----
  {
    type: 'DataGridView',
    displayName: 'DataGridView',
    fullTypeName: 'System.Windows.Forms.DataGridView',
    category: 'Data',
    description: 'Displays rows and columns of data in a customizable grid.',
    namePrefix: 'dataGridView',
    defaultSize: { width: 320, height: 180 },
    isContainer: false,
    isComponent: false,
    supportsInitialize: true,
    defaultEvent: 'CellContentClick',
    defaultProperties: {
      ColumnHeadersHeightSizeMode: { kind: 'enum', typeName: 'DataGridViewColumnHeadersHeightSizeMode', value: 'AutoSize' },
      AllowUserToAddRows: true,
      AllowUserToDeleteRows: true,
      ReadOnly: false,
    },
    specificProperties: [
      { name: 'Columns', category: 'Data', editor: 'columnsCollection', description: 'Columns displayed in the DataGridView.' },
      { name: 'AutoSizeColumnsMode', category: 'Layout', editor: 'enum', enumType: 'DataGridViewAutoSizeColumnsMode', defaultValue: { kind: 'enum', typeName: 'DataGridViewAutoSizeColumnsMode', value: 'None' }, description: 'Determines how column widths are adjusted.' },
      { name: 'SelectionMode', category: 'Behavior', editor: 'enum', enumType: 'DataGridViewSelectionMode', defaultValue: { kind: 'enum', typeName: 'DataGridViewSelectionMode', value: 'RowHeaderSelect' }, description: 'Indicates how cells can be selected.' },
      { name: 'AllowUserToAddRows', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether the option to add rows is displayed.' },
      { name: 'AllowUserToDeleteRows', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether users can delete rows.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Indicates whether cells are read-only.' },
      { name: 'RowHeadersVisible', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Shows or hides the leftmost row header column.' },
      { name: 'ColumnHeadersVisible', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Shows or hides column headers.' },
      { name: 'BackgroundColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'AppWorkspace', isSystem: true }, description: 'Background color of the non-cell grid area.' },
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'FixedSingle' }, description: 'Indicates the border style.' },
    ],
    specificEvents: [
      { name: 'CellContentClick', category: 'Action', delegateType: 'System.Windows.Forms.DataGridViewCellEventHandler', eventArgsType: 'DataGridViewCellEventArgs', description: 'Occurs when the content within a cell is clicked.' },
      { name: 'CellClick', category: 'Action', delegateType: 'System.Windows.Forms.DataGridViewCellEventHandler', eventArgsType: 'DataGridViewCellEventArgs', description: 'Occurs when any part of a cell is clicked.' },
      { name: 'CellValueChanged', category: 'Property Changed', delegateType: 'System.Windows.Forms.DataGridViewCellEventHandler', eventArgsType: 'DataGridViewCellEventArgs', description: 'Occurs when the value of a cell changes.' },
      { name: 'SelectionChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the current selection changes.' },
    ],
  },
  {
    type: 'BindingSource',
    displayName: 'BindingSource',
    fullTypeName: 'System.Windows.Forms.BindingSource',
    category: 'Data',
    description: 'Encapsulates the data source for a form.',
    namePrefix: 'bindingSource',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    supportsInitialize: true,
    takesComponentsArg: true,
    defaultEvent: 'CurrentChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'DataMember', category: 'Data', editor: 'string', defaultValue: '', description: 'Specific list in the data source to bind to.' },
      { name: 'Filter', category: 'Data', editor: 'string', defaultValue: '', description: 'Expression used to filter items.' },
      { name: 'Sort', category: 'Data', editor: 'string', defaultValue: '', description: 'Column names used for sorting.' },
    ],
    specificEvents: [
      { name: 'CurrentChanged', category: 'Data', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the currently bound item changes.' },
    ],
  },
  {
    type: 'BindingNavigator',
    displayName: 'BindingNavigator',
    fullTypeName: 'System.Windows.Forms.BindingNavigator',
    category: 'Data',
    description: 'Provides navigation and manipulation controls for data bound on a form.',
    namePrefix: 'bindingNavigator',
    defaultSize: { width: 800, height: 25 },
    isContainer: false,
    isComponent: false,
    supportsLayoutSuspension: true,
    defaultDock: 'Top',
    defaultEvent: 'RefreshItems',
    defaultProperties: {
      Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Top' },
    },
    specificProperties: [
      { name: 'GripStyle', category: 'Appearance', editor: 'enum', enumType: 'ToolStripGripStyle', defaultValue: { kind: 'enum', typeName: 'ToolStripGripStyle', value: 'Visible' }, description: 'Specifies whether the grip handle is visible.' },
    ],
  },

  // ---- COMPONENTS (TRAY) ----
  {
    type: 'Timer',
    displayName: 'Timer',
    fullTypeName: 'System.Windows.Forms.Timer',
    category: 'Components',
    description: 'Raises an event at user-defined intervals.',
    namePrefix: 'timer',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    takesComponentsArg: true,
    defaultEvent: 'Tick',
    defaultProperties: { Interval: 1000 },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Enabled', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Indicates whether the timer is running.' },
      { name: 'Interval', category: 'Behavior', editor: 'number', defaultValue: 100, min: 1, description: 'Frequency of elapsed events in milliseconds.' },
    ],
    specificEvents: [
      { name: 'Tick', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the specified timer interval has elapsed.' },
    ],
  },
  {
    type: 'ImageList',
    displayName: 'ImageList',
    fullTypeName: 'System.Windows.Forms.ImageList',
    category: 'Components',
    description: 'Manages a collection of images typically used by other controls.',
    namePrefix: 'imageList',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    takesComponentsArg: true,
    defaultEvent: 'RecreateHandle',
    defaultProperties: {
      ImageSize: { kind: 'size', width: 16, height: 16 },
    },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'ImageSize', category: 'Appearance', editor: 'size', defaultValue: { kind: 'size', width: 16, height: 16 }, description: 'Dimensions of the images in the list.' },
      { name: 'TransparentColor', category: 'Appearance', editor: 'color', defaultValue: { kind: 'color', value: 'Transparent', isNamed: true }, description: 'Color treated as transparent.' },
    ],
  },
  {
    type: 'BackgroundWorker',
    displayName: 'BackgroundWorker',
    fullTypeName: 'System.ComponentModel.BackgroundWorker',
    category: 'Components',
    description: 'Executes an operation on a separate thread.',
    namePrefix: 'backgroundWorker',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'DoWork',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'WorkerReportsProgress', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Whether the worker can report progress updates.' },
      { name: 'WorkerSupportsCancellation', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Whether the worker supports asynchronous cancellation.' },
    ],
    specificEvents: [
      { name: 'DoWork', category: 'Behavior', delegateType: 'System.ComponentModel.DoWorkEventHandler', eventArgsType: 'DoWorkEventArgs', description: 'Occurs when RunWorkerAsync is called.' },
      { name: 'ProgressChanged', category: 'Behavior', delegateType: 'System.ComponentModel.ProgressChangedEventHandler', eventArgsType: 'ProgressChangedEventArgs', description: 'Occurs when ReportProgress is called.' },
      { name: 'RunWorkerCompleted', category: 'Behavior', delegateType: 'System.ComponentModel.RunWorkerCompletedEventHandler', eventArgsType: 'RunWorkerCompletedEventArgs', description: 'Occurs when the background operation has completed.' },
    ],
  },
  {
    type: 'ErrorProvider',
    displayName: 'ErrorProvider',
    fullTypeName: 'System.Windows.Forms.ErrorProvider',
    category: 'Components',
    description: 'Provides a user interface for indicating that a control has an error associated with it.',
    namePrefix: 'errorProvider',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    supportsInitialize: true,
    takesComponentsArg: true,
    defaultEvent: 'RightToLeftChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'BlinkRate', category: 'Behavior', editor: 'number', defaultValue: 250, min: 0, description: 'Rate in milliseconds at which the error icon flashes.' },
    ],
  },
  {
    type: 'FileSystemWatcher',
    displayName: 'FileSystemWatcher',
    fullTypeName: 'System.IO.FileSystemWatcher',
    category: 'Components',
    description: 'Listens to file system change notifications and raises events when a directory or file changes.',
    namePrefix: 'fileSystemWatcher',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    supportsInitialize: true,
    defaultEvent: 'Changed',
    defaultProperties: { EnableRaisingEvents: true },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Path', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Path of the directory to watch.' },
      { name: 'Filter', category: 'Behavior', editor: 'string', defaultValue: '*.*', description: 'Filter string used to determine what files are monitored.' },
      { name: 'IncludeSubdirectories', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Monitor subdirectories.' },
      { name: 'EnableRaisingEvents', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Indicates whether the component is enabled.' },
    ],
    specificEvents: [
      { name: 'Changed', category: 'Behavior', delegateType: 'System.IO.FileSystemEventHandler', eventArgsType: 'FileSystemEventArgs', description: 'Occurs when a file or directory is changed.' },
      { name: 'Created', category: 'Behavior', delegateType: 'System.IO.FileSystemEventHandler', eventArgsType: 'FileSystemEventArgs', description: 'Occurs when a file or directory is created.' },
      { name: 'Deleted', category: 'Behavior', delegateType: 'System.IO.FileSystemEventHandler', eventArgsType: 'FileSystemEventArgs', description: 'Occurs when a file or directory is deleted.' },
    ],
  },
  {
    type: 'HelpProvider',
    displayName: 'HelpProvider',
    fullTypeName: 'System.Windows.Forms.HelpProvider',
    category: 'Components',
    description: 'Provides pop-up or online Help for controls.',
    namePrefix: 'helpProvider',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'Click',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'HelpNamespace', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Name of the Help file associated with this HelpProvider.' },
    ],
  },

  // ---- DIALOGS (TRAY) ----
  {
    type: 'OpenFileDialog',
    displayName: 'OpenFileDialog',
    fullTypeName: 'System.Windows.Forms.OpenFileDialog',
    category: 'Dialogs',
    description: 'Displays a dialog box that prompts the user to open a file.',
    namePrefix: 'openFileDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'FileOk',
    defaultProperties: { FileName: 'openFileDialog1' },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Title', category: 'Appearance', editor: 'string', defaultValue: '', description: 'Dialog box title.' },
      { name: 'Filter', category: 'Behavior', editor: 'string', defaultValue: 'All files (*.*)|*.*', description: 'File name filter string.' },
      { name: 'FileName', category: 'Data', editor: 'string', defaultValue: '', description: 'Selected file name.' },
      { name: 'InitialDirectory', category: 'Data', editor: 'string', defaultValue: '', description: 'Initial directory displayed by the file dialog.' },
      { name: 'Multiselect', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Allows selecting multiple files.' },
    ],
    specificEvents: [
      { name: 'FileOk', category: 'Action', delegateType: 'System.ComponentModel.CancelEventHandler', eventArgsType: 'CancelEventArgs', description: 'Occurs when the user clicks Open or Save.' },
    ],
  },
  {
    type: 'SaveFileDialog',
    displayName: 'SaveFileDialog',
    fullTypeName: 'System.Windows.Forms.SaveFileDialog',
    category: 'Dialogs',
    description: 'Displays a dialog box that prompts the user to save a file.',
    namePrefix: 'saveFileDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'FileOk',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Title', category: 'Appearance', editor: 'string', defaultValue: '', description: 'Dialog box title.' },
      { name: 'Filter', category: 'Behavior', editor: 'string', defaultValue: 'All files (*.*)|*.*', description: 'File name filter string.' },
      { name: 'DefaultExt', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Default file extension.' },
      { name: 'FileName', category: 'Data', editor: 'string', defaultValue: '', description: 'Default file name.' },
      { name: 'OverwritePrompt', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Displays a warning if the specified file already exists.' },
    ],
    specificEvents: [
      { name: 'FileOk', category: 'Action', delegateType: 'System.ComponentModel.CancelEventHandler', eventArgsType: 'CancelEventArgs', description: 'Occurs when the user clicks Save.' },
    ],
  },
  {
    type: 'FolderBrowserDialog',
    displayName: 'FolderBrowserDialog',
    fullTypeName: 'System.Windows.Forms.FolderBrowserDialog',
    category: 'Dialogs',
    description: 'Prompts the user to select a folder.',
    namePrefix: 'folderBrowserDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'HelpRequest',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'Description', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Descriptive text displayed above the tree view.' },
      { name: 'SelectedPath', category: 'Behavior', editor: 'string', defaultValue: '', description: 'Path selected by the user.' },
      { name: 'ShowNewFolderButton', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Shows the New Folder button.' },
    ],
  },
  {
    type: 'ColorDialog',
    displayName: 'ColorDialog',
    fullTypeName: 'System.Windows.Forms.ColorDialog',
    category: 'Dialogs',
    description: 'Displays a color selection dialog box.',
    namePrefix: 'colorDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'HelpRequest',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'AllowFullOpen', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Allows the user to define custom colors.' },
      { name: 'FullOpen', category: 'Appearance', editor: 'boolean', defaultValue: false, description: 'Controls whether custom color controls are immediately visible.' },
    ],
  },
  {
    type: 'FontDialog',
    displayName: 'FontDialog',
    fullTypeName: 'System.Windows.Forms.FontDialog',
    category: 'Dialogs',
    description: 'Displays a font selection dialog box.',
    namePrefix: 'fontDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'Apply',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'ShowColor', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Shows color choice controls.' },
      { name: 'ShowEffects', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Shows underline, strikeout, and text color options.' },
    ],
    specificEvents: [
      { name: 'Apply', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Apply button is clicked.' },
    ],
  },

  // ---- PRINTING ----
  {
    type: 'PrintDocument',
    displayName: 'PrintDocument',
    fullTypeName: 'System.Drawing.Printing.PrintDocument',
    category: 'Printing',
    description: 'Defines a reusable object that sends output to a printer.',
    namePrefix: 'printDocument',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'PrintPage',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'DocumentName', category: 'Misc', editor: 'string', defaultValue: 'document', description: 'Document name shown in the print queue.' },
    ],
    specificEvents: [
      { name: 'PrintPage', category: 'Action', delegateType: 'System.Drawing.Printing.PrintPageEventHandler', eventArgsType: 'PrintPageEventArgs', description: 'Occurs when output to print for the current page is needed.' },
    ],
  },
  {
    type: 'PrintDialog',
    displayName: 'PrintDialog',
    fullTypeName: 'System.Windows.Forms.PrintDialog',
    category: 'Printing',
    description: 'Allows the user to select a printer and choose printing options.',
    namePrefix: 'printDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'HelpRequest',
    defaultProperties: { UseEXDialog: true },
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
      { name: 'AllowSomePages', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Enables the Pages option button.' },
      { name: 'UseEXDialog', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Displays the modern Windows Print dialog.' },
    ],
  },
  {
    type: 'PrintPreviewDialog',
    displayName: 'PrintPreviewDialog',
    fullTypeName: 'System.Windows.Forms.PrintPreviewDialog',
    category: 'Printing',
    description: 'Displays how a PrintDocument will appear when printed.',
    namePrefix: 'printPreviewDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'Load',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
    ],
  },
  {
    type: 'PageSetupDialog',
    displayName: 'PageSetupDialog',
    fullTypeName: 'System.Windows.Forms.PageSetupDialog',
    category: 'Printing',
    description: 'Enables users to change page-related print settings including margins and paper orientation.',
    namePrefix: 'pageSetupDialog',
    defaultSize: { width: 0, height: 0 },
    isContainer: false,
    isComponent: true,
    defaultEvent: 'HelpRequest',
    defaultProperties: {},
    specificProperties: [
      { name: 'Name', category: 'Design', editor: 'name', description: 'Name used in code.' },
    ],
  },
  {
    type: 'PrintPreviewControl',
    displayName: 'PrintPreviewControl',
    fullTypeName: 'System.Windows.Forms.PrintPreviewControl',
    category: 'Printing',
    description: 'Displays a print preview embedded directly on a form.',
    namePrefix: 'printPreviewControl',
    defaultSize: { width: 220, height: 160 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'StartPageChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Columns', category: 'Behavior', editor: 'number', defaultValue: 1, min: 1, description: 'Number of pages displayed horizontally.' },
      { name: 'Rows', category: 'Behavior', editor: 'number', defaultValue: 1, min: 1, description: 'Number of pages displayed vertically.' },
      { name: 'AutoZoom', category: 'Behavior', editor: 'boolean', defaultValue: true, description: 'Automatically resizes the preview.' },
    ],
  },

  // ---- ADDITIONAL ----
  {
    type: 'DomainUpDown',
    displayName: 'DomainUpDown',
    fullTypeName: 'System.Windows.Forms.DomainUpDown',
    category: 'Additional',
    description: 'Displays a single string value selected from an ordered list via up/down buttons.',
    namePrefix: 'domainUpDown',
    defaultSize: { width: 120, height: 23 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'SelectedItemChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'Items', category: 'Data', editor: 'stringCollection', description: 'The string items in the DomainUpDown.' },
      { name: 'Sorted', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Sorts items alphabetically.' },
      { name: 'Wrap', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Wraps selection when reaching start or end.' },
      { name: 'ReadOnly', category: 'Behavior', editor: 'boolean', defaultValue: false, description: 'Prevents typing directly.' },
    ],
    specificEvents: [
      { name: 'SelectedItemChanged', category: 'Behavior', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the SelectedItem property changes.' },
    ],
  },
  {
    type: 'PropertyGrid',
    displayName: 'PropertyGrid',
    fullTypeName: 'System.Windows.Forms.PropertyGrid',
    category: 'Additional',
    description: 'Provides a user interface for browsing the properties of an object.',
    namePrefix: 'propertyGrid',
    defaultSize: { width: 220, height: 220 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'PropertyValueChanged',
    defaultProperties: {},
    specificProperties: [
      { name: 'ToolbarVisible', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Shows or hides the toolbar.' },
      { name: 'HelpVisible', category: 'Appearance', editor: 'boolean', defaultValue: true, description: 'Shows or hides the description pane.' },
    ],
    specificEvents: [
      { name: 'PropertyValueChanged', category: 'Behavior', delegateType: 'System.Windows.Forms.PropertyValueChangedEventHandler', eventArgsType: 'PropertyValueChangedEventArgs', description: 'Occurs when a property value changes.' },
    ],
  },
  {
    type: 'HScrollBar',
    displayName: 'HScrollBar',
    fullTypeName: 'System.Windows.Forms.HScrollBar',
    category: 'Additional',
    description: 'Provides a standard Windows horizontal scroll bar.',
    namePrefix: 'hScrollBar',
    defaultSize: { width: 160, height: 17 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'Scroll',
    defaultProperties: { Minimum: 0, Maximum: 100, Value: 0 },
    specificProperties: [
      { name: 'Minimum', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'Lower limit of the scrollable range.' },
      { name: 'Maximum', category: 'Behavior', editor: 'number', defaultValue: 100, description: 'Upper limit of the scrollable range.' },
      { name: 'Value', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'Current scroll box position.' },
      { name: 'LargeChange', category: 'Behavior', editor: 'number', defaultValue: 10, description: 'Amount changed when clicking the bar track.' },
      { name: 'SmallChange', category: 'Behavior', editor: 'number', defaultValue: 1, description: 'Amount changed when clicking an arrow.' },
    ],
    specificEvents: [
      { name: 'Scroll', category: 'Behavior', delegateType: 'System.Windows.Forms.ScrollEventHandler', eventArgsType: 'ScrollEventArgs', description: 'Occurs when the scroll box has been moved.' },
      { name: 'ValueChanged', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Value property changes.' },
    ],
  },
  {
    type: 'VScrollBar',
    displayName: 'VScrollBar',
    fullTypeName: 'System.Windows.Forms.VScrollBar',
    category: 'Additional',
    description: 'Provides a standard Windows vertical scroll bar.',
    namePrefix: 'vScrollBar',
    defaultSize: { width: 17, height: 140 },
    isContainer: false,
    isComponent: false,
    defaultEvent: 'Scroll',
    defaultProperties: { Minimum: 0, Maximum: 100, Value: 0 },
    specificProperties: [
      { name: 'Minimum', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'Lower limit of the scrollable range.' },
      { name: 'Maximum', category: 'Behavior', editor: 'number', defaultValue: 100, description: 'Upper limit of the scrollable range.' },
      { name: 'Value', category: 'Behavior', editor: 'number', defaultValue: 0, description: 'Current scroll box position.' },
      { name: 'LargeChange', category: 'Behavior', editor: 'number', defaultValue: 10, description: 'Amount changed when clicking the bar track.' },
      { name: 'SmallChange', category: 'Behavior', editor: 'number', defaultValue: 1, description: 'Amount changed when clicking an arrow.' },
    ],
    specificEvents: [
      { name: 'Scroll', category: 'Behavior', delegateType: 'System.Windows.Forms.ScrollEventHandler', eventArgsType: 'ScrollEventArgs', description: 'Occurs when the scroll box has been moved.' },
      { name: 'ValueChanged', category: 'Action', delegateType: 'System.EventHandler', eventArgsType: 'EventArgs', description: 'Occurs when the Value property changes.' },
    ],
  },
  {
    type: 'Splitter',
    displayName: 'Splitter',
    fullTypeName: 'System.Windows.Forms.Splitter',
    category: 'Additional',
    description: 'Allows resizing of docked controls at run time.',
    namePrefix: 'splitter',
    defaultSize: { width: 6, height: 140 },
    isContainer: false,
    isComponent: false,
    defaultDock: 'Left',
    defaultEvent: 'SplitterMoved',
    defaultProperties: {
      Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Left' },
    },
    specificProperties: [
      { name: 'BorderStyle', category: 'Appearance', editor: 'enum', enumType: 'BorderStyle', defaultValue: { kind: 'enum', typeName: 'BorderStyle', value: 'None' }, description: 'Border style.' },
      { name: 'MinExtra', category: 'Behavior', editor: 'number', defaultValue: 25, description: 'Minimum distance remaining between the splitter and the opposite edge.' },
      { name: 'MinSize', category: 'Behavior', editor: 'number', defaultValue: 25, description: 'Minimum distance between the splitter and the docked control.' },
    ],
    specificEvents: [
      { name: 'SplitterMoved', category: 'Behavior', delegateType: 'System.Windows.Forms.SplitterEventHandler', eventArgsType: 'SplitterEventArgs', description: 'Occurs when the splitter is moved.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalog Lookup Helpers
// ---------------------------------------------------------------------------

const CATALOG_BY_TYPE = new Map<string, ControlDefinition>();
for (const def of CONTROL_CATALOG) {
  CATALOG_BY_TYPE.set(def.type, def);
  CATALOG_BY_TYPE.set(def.type.toLowerCase(), def);
}

export function getControlDefinition(typeName: string): ControlDefinition | undefined {
  const short = typeName.includes('.') ? typeName.slice(typeName.lastIndexOf('.') + 1) : typeName;
  return CATALOG_BY_TYPE.get(short) ?? CATALOG_BY_TYPE.get(short.toLowerCase());
}

export function getToolboxControls(): ControlDefinition[] {
  return CONTROL_CATALOG.filter((c) => !c.hiddenFromToolbox);
}

export function getPropertiesForControl(typeName: string): PropertyDefinition[] {
  const def = getControlDefinition(typeName);
  if (!def) {
    return [...COMMON_CONTROL_PROPERTIES];
  }
  if (def.type === 'Form') {
    return [...FORM_PROPERTIES];
  }
  if (def.isComponent) {
    return [...def.specificProperties];
  }
  const map = new Map<string, PropertyDefinition>();
  for (const prop of COMMON_CONTROL_PROPERTIES) {
    map.set(prop.name, prop);
  }
  for (const prop of def.specificProperties) {
    map.set(prop.name, prop);
  }
  return Array.from(map.values());
}

export function getEventsForControl(typeName: string): EventDefinition[] {
  const def = getControlDefinition(typeName);
  if (!def) {
    return [...COMMON_CONTROL_EVENTS];
  }
  if (def.type === 'Form') {
    return [...FORM_EVENTS];
  }
  if (def.isComponent) {
    return [...(def.specificEvents ?? [])];
  }
  const map = new Map<string, EventDefinition>();
  for (const ev of def.specificEvents ?? []) {
    map.set(ev.name, ev);
  }
  for (const ev of COMMON_CONTROL_EVENTS) {
    if (!map.has(ev.name)) {
      map.set(ev.name, ev);
    }
  }
  return Array.from(map.values());
}

export function getEventSignature(
  controlType: string,
  eventName: string
): { delegateType: string; eventArgsType: string } {
  const events = getEventsForControl(controlType);
  const found = events.find((e) => e.name === eventName);
  if (found) {
    return { delegateType: found.delegateType, eventArgsType: found.eventArgsType };
  }
  return { delegateType: 'System.EventHandler', eventArgsType: 'EventArgs' };
}

export function resolveColorToCss(
  color: { value: string; isSystem?: boolean; isNamed?: boolean; a?: number; r?: number; g?: number; b?: number } | undefined,
  fallback = 'transparent'
): string {
  if (!color) return fallback;
  if (color.isSystem && SYSTEM_COLORS[color.value]) {
    return SYSTEM_COLORS[color.value];
  }
  if (color.isNamed && WEB_NAMED_COLORS[color.value]) {
    return WEB_NAMED_COLORS[color.value];
  }
  if (color.r !== undefined && color.g !== undefined && color.b !== undefined) {
    const a = color.a === undefined ? 1 : +(color.a / 255).toFixed(3);
    if (a >= 1) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
  }
  if (SYSTEM_COLORS[color.value]) return SYSTEM_COLORS[color.value];
  if (WEB_NAMED_COLORS[color.value]) return WEB_NAMED_COLORS[color.value];
  return color.value || fallback;
}
