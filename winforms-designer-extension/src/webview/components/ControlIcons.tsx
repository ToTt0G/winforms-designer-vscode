// Uniform 16x16 stroke icons for every WinForms control/component and designer commands.
// Strokes sit on half-pixel coordinates so they stay crisp at 1x and 2x.

import type { ReactNode } from 'react';

const A = 'var(--wd-icon-accent)';

const ICONS: Record<string, ReactNode> = {
  // ---- controls ----
  Pointer: <path d="M4.5 2.5v10l2.6-2.4 1.7 3.9 1.6-.7-1.7-3.8 3.5-.2z" strokeLinejoin="round" />,
  Button: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1.5" />
      <path d="M5 8h6" stroke={A} />
    </>
  ),
  Label: <path d="M3 12.5 6.5 3.5h1l3.5 9M4.3 9.5h5.4" />,
  LinkLabel: (
    <>
      <path d="M2.5 12.5 5.2 4.5h.6l2.7 8M3.4 10h4.2" />
      <path d="M9.5 13.5h4" stroke={A} />
      <path d="M10.5 6.5h3v3" stroke={A} />
    </>
  ),
  TextBox: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M4.5 6.5v3" stroke={A} />
    </>
  ),
  RichTextBox: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M4 5.5h8M4 8h6M4 10.5h7" />
    </>
  ),
  MaskedTextBox: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M4 8h.01M6.5 8h.01M9 8h.01M11.5 8h.01" strokeWidth="1.6" strokeLinecap="round" stroke={A} />
    </>
  ),
  CheckBox: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="m5 8 2 2 4-4.5" stroke={A} />
    </>
  ),
  RadioButton: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" fill={A} stroke="none" />
    </>
  ),
  ComboBox: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M10.5 4.5v7" />
      <path d="m11.6 7.3 1 1 1-1" stroke={A} />
    </>
  ),
  ListBox: (
    <>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" />
      <path d="M4.5 4.5h7M4.5 7.5h7M4.5 10.5h5" />
      <rect x="3.5" y="6" width="9" height="3" fill={A} stroke="none" opacity=".35" />
    </>
  ),
  CheckedListBox: (
    <>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" />
      <rect x="4.5" y="4" width="2" height="2" stroke={A} />
      <rect x="4.5" y="9" width="2" height="2" />
      <path d="M8 5h3.5M8 10h3.5" />
    </>
  ),
  NumericUpDown: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M10.5 4.5v7M10.5 8h4" />
      <path d="m11.6 6.6 1-1 1 1M11.6 9.4l1 1 1-1" stroke={A} />
    </>
  ),
  DomainUpDown: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M10.5 4.5v7M3.5 8h4.5" />
      <path d="m11.6 6.6 1-1 1 1M11.6 9.4l1 1 1-1" stroke={A} />
    </>
  ),
  DateTimePicker: (
    <>
      <rect x="1.5" y="3.5" width="13" height="10" rx="1" />
      <path d="M1.5 6.5h13M4.5 2v3M11.5 2v3" />
      <rect x="9" y="8.5" width="3" height="3" fill={A} stroke="none" />
    </>
  ),
  MonthCalendar: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 5.5h13M4 8h.01M6.7 8h.01M9.3 8h.01M12 8h.01M4 10.7h.01M6.7 10.7h.01M9.3 10.7h.01" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="10.7" r="1.1" fill={A} stroke="none" />
    </>
  ),
  PictureBox: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="m1.5 11 4-4 3.5 3.5 2-2 3.5 3.5" />
      <circle cx="11" cy="5.5" r="1.2" fill={A} stroke="none" />
    </>
  ),
  ProgressBar: (
    <>
      <rect x="1.5" y="5.5" width="13" height="5" rx="1" />
      <rect x="3" y="7" width="6" height="2" fill={A} stroke="none" />
    </>
  ),
  ListView: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 5.5h13M6.5 2.5v11M3.5 8h1.5M3.5 10.5h1.5M8.5 8h4M8.5 10.5h3" />
    </>
  ),
  TreeView: (
    <>
      <path d="M3.5 3v9.5h3M3.5 7.5h3" />
      <rect x="1.5" y="1.5" width="4" height="3" rx=".5" stroke={A} />
      <rect x="7.5" y="6" width="6" height="3" rx=".5" />
      <rect x="7.5" y="11" width="6" height="3" rx=".5" />
    </>
  ),
  TrackBar: (
    <>
      <path d="M1.5 8h13" />
      <path d="M3 11.5v1.5M6 11.5v1.5M9 11.5v1.5M12 11.5v1.5" />
      <path d="M7.5 4.5h3v4l-1.5 1.5-1.5-1.5z" fill={A} stroke={A} strokeLinejoin="round" />
    </>
  ),
  WebBrowser: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c-2.2 2.2-2.2 9.8 0 12M8 2c2.2 2.2 2.2 9.8 0 12" />
    </>
  ),
  Panel: <rect x="1.5" y="2.5" width="13" height="11" rx="1" strokeDasharray="2 1.5" />,
  GroupBox: (
    <>
      <path d="M4 4.5H1.5v9h13v-9H10" />
      <path d="M5.5 4.5h3" stroke={A} />
    </>
  ),
  TabControl: (
    <>
      <path d="M1.5 13.5v-9h13v9z" />
      <path d="M1.5 4.5v-2h5v2M6.5 4.5v-2h4v2" />
      <path d="M2.5 3.5h3" stroke={A} />
    </>
  ),
  TabPage: (
    <>
      <path d="M1.5 13.5v-10h5l1 1.5h7v8.5z" />
    </>
  ),
  SplitContainer: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M6.5 2.5v11M7.5 2.5v11" stroke={A} />
    </>
  ),
  FlowLayoutPanel: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" strokeDasharray="2 1.5" />
      <path d="M4 6h3M9 6h3M4 10h3" />
      <path d="m11 9 1.5 1-1.5 1" stroke={A} />
    </>
  ),
  TableLayoutPanel: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 8h13M8 2.5v11" strokeDasharray="1.5 1.2" stroke={A} />
    </>
  ),
  MenuStrip: (
    <>
      <rect x="1.5" y="2.5" width="13" height="4" rx=".5" />
      <path d="M3.5 4.5h2M7 4.5h2" />
      <rect x="2.5" y="6.5" width="6" height="7" rx=".5" />
      <path d="M4 9h3M4 11.5h3" stroke={A} />
    </>
  ),
  ToolStrip: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <rect x="3.5" y="6.5" width="3" height="3" fill={A} stroke="none" />
      <rect x="8" y="6.5" width="3" height="3" />
      <path d="M12.5 6v4" />
    </>
  ),
  StatusStrip: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 10.5h13" />
      <path d="M3.5 12h4" stroke={A} />
      <path d="m12.8 11.6-.8.8M12.8 12.8l-.01.01" />
    </>
  ),
  ContextMenuStrip: (
    <>
      <path d="M2.5 2.5 5 9l1-2.4 2.4-1z" strokeLinejoin="round" />
      <rect x="7.5" y="6.5" width="7" height="8" rx=".5" />
      <path d="M9 9h4M9 11.5h3" stroke={A} />
    </>
  ),
  DataGridView: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 5.5h13M1.5 8.5h13M1.5 11h13M5.5 2.5v11M10 2.5v11" />
      <rect x="2" y="3" width="12" height="2.5" fill={A} stroke="none" opacity=".35" />
    </>
  ),
  BindingSource: (
    <>
      <ellipse cx="6.5" cy="4" rx="4.5" ry="1.8" />
      <path d="M2 4v7c0 1 2 1.8 4.5 1.8M11 4v3" />
      <path d="M9 12.5h5M11.5 10v5" stroke={A} />
    </>
  ),
  BindingNavigator: (
    <>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
      <path d="M4.5 6.5 3 8l1.5 1.5M11.5 6.5 13 8l-1.5 1.5" />
      <path d="M6.5 8h3" stroke={A} />
    </>
  ),
  Timer: (
    <>
      <circle cx="8" cy="9" r="5.5" />
      <path d="M6.5 1.5h3M8 5.5V9l2 1.5" stroke={A} />
    </>
  ),
  ImageList: (
    <>
      <rect x="4.5" y="1.5" width="10" height="8" rx=".8" />
      <path d="M1.5 4.5v10h10" />
      <path d="m5 9 2.5-2.5 2 2 1.5-1.5 3 3" stroke={A} />
    </>
  ),
  BackgroundWorker: (
    <>
      <circle cx="8" cy="8" r="2" stroke={A} />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  ErrorProvider: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5v4.2M8 11h.01" stroke={A} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  FileSystemWatcher: (
    <>
      <path d="M1.5 12.5v-9h4l1.5 1.5h7.5v7.5z" />
      <circle cx="8" cy="9" r="1.6" stroke={A} />
      <path d="M4.8 9c1.8-2.4 4.6-2.4 6.4 0-1.8 2.4-4.6 2.4-6.4 0z" stroke={A} />
    </>
  ),
  HelpProvider: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.6-.8 1.3M8 11.2h.01" stroke={A} strokeLinecap="round" />
    </>
  ),
  NotifyIcon: (
    <>
      <path d="M1.5 12.5h13" />
      <rect x="9.5" y="9.5" width="3" height="3" fill={A} stroke="none" />
      <path d="M8 2.5a3 3 0 0 0-3 3v2.5L3.5 10h9L11 8V5.5a3 3 0 0 0-3-3z" />
    </>
  ),
  ToolTip: (
    <>
      <path d="M1.5 2.5h13v8h-7l-3 3v-3h-3z" strokeLinejoin="round" />
      <path d="M4.5 5.5h7M4.5 7.8h4" stroke={A} />
    </>
  ),
  OpenFileDialog: (
    <>
      <path d="M1.5 12.5v-9h4l1.5 1.5h6.5v2" />
      <path d="m1.5 12.5 2.5-5.5h11l-2.5 5.5z" strokeLinejoin="round" stroke={A} />
    </>
  ),
  SaveFileDialog: (
    <>
      <path d="M2.5 2.5h9l2 2v9h-11z" strokeLinejoin="round" />
      <path d="M5 2.5v3.5h5V2.5" />
      <rect x="5" y="9" width="6" height="4.5" stroke={A} />
    </>
  ),
  FolderBrowserDialog: (
    <>
      <path d="M1.5 13.5v-10h4l1.5 1.5h7.5v8.5z" />
      <path d="M4.5 8h7M4.5 10.5h4" stroke={A} />
    </>
  ),
  ColorDialog: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="5.8" cy="6" r="1" fill={A} stroke="none" />
      <circle cx="9.6" cy="5.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="9" r="1" fill={A} stroke="none" />
      <path d="M6 11.5c.8.5 2 .5 2-.8" />
    </>
  ),
  FontDialog: (
    <>
      <path d="M2 13 5.5 3.5h1L10 13M3.2 10h5.6" />
      <path d="M11 9.5h3.5M12.75 7.5v6" stroke={A} />
    </>
  ),
  PrintDocument: (
    <>
      <path d="M3.5 1.5h6l3 3v10h-9z" strokeLinejoin="round" />
      <path d="M9.5 1.5v3h3" />
      <path d="M5.5 8h5M5.5 10.5h5" stroke={A} />
    </>
  ),
  PrintDialog: (
    <>
      <rect x="1.5" y="6.5" width="13" height="5" rx="1" />
      <path d="M4.5 6.5v-4h7v4M4.5 9.5h7v4h-7z" />
      <path d="M12 8.5h.01" stroke={A} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  PrintPreviewDialog: (
    <>
      <path d="M3.5 1.5h7l2 2v4" />
      <path d="M3.5 1.5v13h4" />
      <circle cx="10.5" cy="10.5" r="2.5" stroke={A} />
      <path d="m12.3 12.3 2.2 2.2" stroke={A} />
    </>
  ),
  PrintPreviewControl: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1" />
      <rect x="4.5" y="3.5" width="7" height="9" />
      <path d="M6 6h4M6 8h4M6 10h2.5" stroke={A} />
    </>
  ),
  PageSetupDialog: (
    <>
      <path d="M3.5 1.5h9v13h-9z" />
      <path d="M5.5 4.5h5v7h-5z" strokeDasharray="1.5 1" stroke={A} />
    </>
  ),
  PropertyGrid: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1" />
      <path d="M1.5 5h13M1.5 8.2h13M1.5 11.4h13M6.5 5v9.5" />
      <path d="M3 3.3h4" stroke={A} />
    </>
  ),
  HScrollBar: (
    <>
      <rect x="1.5" y="5.5" width="13" height="5" rx="1" />
      <rect x="5" y="6.8" width="4" height="2.4" rx=".6" fill={A} stroke="none" />
    </>
  ),
  VScrollBar: (
    <>
      <rect x="5.5" y="1.5" width="5" height="13" rx="1" />
      <rect x="6.8" y="5" width="2.4" height="4" rx=".6" fill={A} stroke="none" />
    </>
  ),
  Splitter: (
    <>
      <path d="M2.5 2.5v11M13.5 2.5v11" />
      <path d="M8 3v10M5.5 6 3.8 8l1.7 2M10.5 6l1.7 2-1.7 2" stroke={A} />
    </>
  ),
  Form: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 5.5h13" />
      <path d="M10.5 4h.01M12.5 4h.01" strokeWidth="1.4" strokeLinecap="round" stroke={A} />
    </>
  ),
  UserControl: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" strokeDasharray="2.2 1.4" />
      <circle cx="8" cy="7" r="1.8" stroke={A} />
      <path d="M5 12c.5-1.7 1.6-2.5 3-2.5s2.5.8 3 2.5" stroke={A} />
    </>
  ),
  Unknown: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" strokeDasharray="2 1.5" />
      <path d="M5.5 5.5h5v5h-5z" stroke={A} />
    </>
  ),
  Component: (
    <>
      <path d="m8 1.5 5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7z" strokeLinejoin="round" />
      <path d="M2.5 4.7 8 8l5.5-3.3M8 8v6.5" stroke={A} />
    </>
  ),

  // ---- commands ----
  alignLeft: (
    <>
      <path d="M2.5 1.5v13" stroke={A} />
      <rect x="4.5" y="3.5" width="9" height="3" />
      <rect x="4.5" y="9.5" width="5" height="3" />
    </>
  ),
  alignCenter: (
    <>
      <path d="M8 1.5v13" stroke={A} />
      <rect x="2.5" y="3.5" width="11" height="3" />
      <rect x="4.5" y="9.5" width="7" height="3" />
    </>
  ),
  alignRight: (
    <>
      <path d="M13.5 1.5v13" stroke={A} />
      <rect x="2.5" y="3.5" width="9" height="3" />
      <rect x="6.5" y="9.5" width="5" height="3" />
    </>
  ),
  alignTop: (
    <>
      <path d="M1.5 2.5h13" stroke={A} />
      <rect x="3.5" y="4.5" width="3" height="9" />
      <rect x="9.5" y="4.5" width="3" height="5" />
    </>
  ),
  alignMiddle: (
    <>
      <path d="M1.5 8h13" stroke={A} />
      <rect x="3.5" y="2.5" width="3" height="11" />
      <rect x="9.5" y="4.5" width="3" height="7" />
    </>
  ),
  alignBottom: (
    <>
      <path d="M1.5 13.5h13" stroke={A} />
      <rect x="3.5" y="2.5" width="3" height="9" />
      <rect x="9.5" y="6.5" width="3" height="5" />
    </>
  ),
  sameWidth: (
    <>
      <rect x="2.5" y="2.5" width="11" height="4" />
      <rect x="2.5" y="9.5" width="11" height="4" strokeDasharray="1.6 1.2" />
      <path d="M4.5 8h7" stroke={A} />
    </>
  ),
  sameHeight: (
    <>
      <rect x="2.5" y="2.5" width="4" height="11" />
      <rect x="9.5" y="2.5" width="4" height="11" strokeDasharray="1.6 1.2" />
      <path d="M8 4.5v7" stroke={A} />
    </>
  ),
  sameSize: (
    <>
      <rect x="1.5" y="1.5" width="6" height="6" />
      <rect x="8.5" y="8.5" width="6" height="6" strokeDasharray="1.6 1.2" />
      <path d="m8.5 4.5 3 0 0 3" stroke={A} />
    </>
  ),
  spaceHorizontally: (
    <>
      <rect x="1.5" y="4.5" width="3" height="7" />
      <rect x="6.5" y="4.5" width="3" height="7" />
      <rect x="11.5" y="4.5" width="3" height="7" />
      <path d="M4.5 14h2M9.5 14h2" stroke={A} />
    </>
  ),
  spaceVertically: (
    <>
      <rect x="4.5" y="1.5" width="7" height="3" />
      <rect x="4.5" y="6.5" width="7" height="3" />
      <rect x="4.5" y="11.5" width="7" height="3" />
      <path d="M14 4.5v2M14 9.5v2" stroke={A} />
    </>
  ),
  centerHorizontally: (
    <>
      <path d="M1.5 1.5v13M14.5 1.5v13" />
      <rect x="5.5" y="5.5" width="5" height="5" stroke={A} />
    </>
  ),
  centerVertically: (
    <>
      <path d="M1.5 1.5h13M1.5 14.5h13" />
      <rect x="5.5" y="5.5" width="5" height="5" stroke={A} />
    </>
  ),
  bringToFront: (
    <>
      <rect x="1.5" y="1.5" width="8" height="8" strokeDasharray="1.6 1.2" />
      <rect x="6.5" y="6.5" width="8" height="8" fill="var(--wd-bg)" />
      <rect x="6.5" y="6.5" width="8" height="8" fill={A} fillOpacity=".25" stroke={A} />
    </>
  ),
  sendToBack: (
    <>
      <rect x="6.5" y="6.5" width="8" height="8" fill={A} fillOpacity=".25" stroke={A} />
      <rect x="1.5" y="1.5" width="8" height="8" fill="var(--wd-bg)" />
      <rect x="1.5" y="1.5" width="8" height="8" />
    </>
  ),
  snaplines: (
    <>
      <rect x="4.5" y="4.5" width="7" height="5" />
      <path d="M4.5 1v14M1 12.5h14" stroke={A} strokeDasharray="1.6 1.2" />
    </>
  ),
  grid: (
    <path d="M4 4h.01M8 4h.01M12 4h.01M4 8h.01M8 8h.01M12 8h.01M4 12h.01M8 12h.01M12 12h.01" strokeWidth="1.8" strokeLinecap="round" />
  ),
  snapGrid: (
    <>
      <path d="M3 3h.01M8 3h.01M13 3h.01M3 8h.01M3 13h.01M13 13h.01" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.5" y="6.5" width="6" height="6" stroke={A} />
    </>
  ),
  tabOrder: (
    <>
      <rect x="1.5" y="3.5" width="5" height="4" rx="1" />
      <rect x="9.5" y="8.5" width="5" height="4" rx="1" stroke={A} />
      <path d="M6.5 5.5h2.5v3" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7.5" width="9" height="7" rx="1" />
      <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
      <path d="M8 10.2v1.6" stroke={A} />
    </>
  ),
  unlock: (
    <>
      <rect x="3.5" y="7.5" width="9" height="7" rx="1" />
      <path d="M5.5 7.5V5a2.5 2.5 0 0 1 4.8-1" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 4 4M5 7h4M7 5v4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 4 4M5 7h4" />
    </>
  ),
  fit: <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11M5.5 5.5h5v5h-5z" />,
  preview: <path d="M4 2.5v11l9-5.5z" strokeLinejoin="round" />,
  code: <path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4M9 2.5l-2 11" />,
  splitCode: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M8 2.5v11" />
      <path d="M10.5 6 9.6 8l.9 2M12.5 6l.9 2-.9 2" stroke={A} />
    </>
  ),
  undo: <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H6.5" />,
  redo: <path d="m10.5 3.5 3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3.5" />,
  categorized: <path d="M1.5 3.5h5M4 6h10.5M4 8.5h10.5M1.5 11h5M4 13.5h10.5" />,
  alphabetical: (
    <>
      <path d="M1.5 8 4 1.5 6.5 8M2.3 6h3.4M1.8 9.5h4.5l-4.5 5h4.5" />
      <path d="M11.5 2v12M9 11.5l2.5 2.5 2.5-2.5" stroke={A} />
    </>
  ),
  properties: (
    <>
      <path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" />
      <circle cx="5" cy="3.5" r="1.5" fill="var(--wd-bg)" stroke={A} />
      <circle cx="11" cy="8" r="1.5" fill="var(--wd-bg)" stroke={A} />
      <circle cx="7" cy="12.5" r="1.5" fill="var(--wd-bg)" stroke={A} />
    </>
  ),
  events: <path d="M9.5 1.5 3.5 9h4l-1 5.5 6-7.5h-4z" strokeLinejoin="round" fill={A} fillOpacity=".22" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 4 4" />
    </>
  ),
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3 8.5 3 3 7-7" />,
  chevronRight: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  chevronDown: <path d="M3.5 6 8 10.5 12.5 6" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  trash: <path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9.5h6.6l.7-9.5M6.5 7v4.5M9.5 7v4.5" />,
  arrowUp: <path d="M8 13V3M4 7l4-4 4 4" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  jump: <path d="M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v4h-9v-9h4" />,
  warning: (
    <>
      <path d="M8 1.8 14.8 13.8H1.2z" strokeLinejoin="round" />
      <path d="M8 6v3.6M8 11.6h.01" strokeLinecap="round" strokeWidth="1.5" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M8 1.6 13.2 3.5v4.1c0 3.2-2.2 5.6-5.2 6.8-3-1.2-5.2-3.6-5.2-6.8V3.5z" strokeLinejoin="round" />
      <path d="m5.7 8.1 1.6 1.6 3-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shieldAlert: (
    <>
      <path d="M8 1.6 13.2 3.5v4.1c0 3.2-2.2 5.6-5.2 6.8-3-1.2-5.2-3.6-5.2-6.8V3.5z" strokeLinejoin="round" />
      <path d="M8 5.2v3.3M8 10.6h.01" strokeLinecap="round" strokeWidth="1.5" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8M8 11.6h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </>
  ),
  keyboard: (
    <>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
      <path d="M4 6.6h.01M6.3 6.6h.01M8.6 6.6h.01M10.9 6.6h.01M4.6 9.9h6.8" strokeLinecap="round" strokeWidth="1.3" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v4M8 4.8h.01" strokeLinecap="round" strokeWidth="1.5" />
    </>
  ),
  smartTag: <path d="m5.5 3.5 4.5 4.5-4.5 4.5" />,
  reset: <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3" />,
  duplicate: (
    <>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
      <path d="M10.5 5.5v-3a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3" />
    </>
  ),
  cut: (
    <>
      <circle cx="4" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M5.5 10.6 11.5 2M10.5 10.6 4.5 2" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
      <path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" />
    </>
  ),
  paste: (
    <>
      <path d="M5.5 2.5h-2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1h-2" />
      <rect x="5.5" y="1.5" width="5" height="2.5" rx=".5" />
    </>
  ),
  selectParent: <path d="M3.5 13.5V6.5h9M9 3l3.5 3.5L9 10" />,
  edit: <path d="M10.5 2.5 13.5 5.5 5.5 13.5h-3v-3z" strokeLinejoin="round" />,
  image: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="m1.5 11 4-4 3.5 3.5 2-2 3.5 3.5" />
      <circle cx="11" cy="5.5" r="1.2" />
    </>
  ),
  dock: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1" />
      <path d="M1.5 5h13" stroke={A} />
    </>
  ),
  menu: <path d="M8 3.5h.01M8 8h.01M8 12.5h.01" strokeLinecap="round" strokeWidth="2" />,
  link: (
    <>
      <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.7.7" />
      <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.7-.7" />
    </>
  ),
  play: <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" strokeLinejoin="round" />,
  globe: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8h11M8 2.5c1.6 1.6 2.3 3.4 2.3 5.5S9.6 11.9 8 13.5M8 2.5C6.4 4.1 5.7 5.9 5.7 8s.7 3.9 2.3 5.5" />
    </>
  ),
  wand: (
    <>
      <path d="m3 13 7.5-7.5M9.5 4.5l2 2" />
      <path d="M12 1.8v1.6M12.8 2.6h-1.6M14 5.6v1.2M14.6 6.2h-1.2M7 1.8v1.2M7.6 2.4H6.4" />
    </>
  ),
  inherited: <path d="M4 3.5v5a2 2 0 0 0 2 2h6M9.5 8l2.5 2.5L9.5 13" strokeLinejoin="round" />,
};

const CONTROL_ALIASES: Record<string, string> = {
  ToolStripMenuItem: 'MenuStrip',
  ToolStripButton: 'ToolStrip',
  ToolStripLabel: 'Label',
  ToolStripSeparator: 'Splitter',
  ToolStripTextBox: 'TextBox',
  ToolStripComboBox: 'ComboBox',
  ToolStripDropDownButton: 'ComboBox',
  ToolStripSplitButton: 'Button',
  ToolStripProgressBar: 'ProgressBar',
  ToolStripStatusLabel: 'StatusStrip',
  DataGridViewTextBoxColumn: 'TextBox',
  DataGridViewButtonColumn: 'Button',
  DataGridViewCheckBoxColumn: 'CheckBox',
  DataGridViewComboBoxColumn: 'ComboBox',
  DataGridViewImageColumn: 'PictureBox',
  DataGridViewLinkColumn: 'LinkLabel',
};

export function hasIcon(name: string): boolean {
  return name in ICONS || name in CONTROL_ALIASES;
}

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, className, title }: IconProps) {
  const key = name in ICONS ? name : CONTROL_ALIASES[name] ?? 'Unknown';
  return (
    <svg
      className={className ? `wd-icon ${className}` : 'wd-icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {ICONS[key]}
    </svg>
  );
}

/** Icon for a design node type (falls back to component / unknown glyphs). */
export function ControlIcon({ type, isComponent, size }: { type: string; isComponent?: boolean; size?: number }) {
  const name = type in ICONS || type in CONTROL_ALIASES ? type : isComponent ? 'Component' : 'Unknown';
  return <Icon name={name} size={size} />;
}
