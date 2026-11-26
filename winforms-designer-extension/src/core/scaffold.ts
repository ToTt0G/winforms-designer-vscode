// WinForms Form & UserControl File Scaffolder (with Starter Templates)

import type { DesignDocument, DesignNode, ScaffoldOptions } from '../shared/model';
import { generateDesignerCs } from './generator';
import { encodeCSharpString } from './stringLiteral';

export type FormTemplateId =
  | 'blank'
  | 'dialog'
  | 'master-detail'
  | 'settings'
  | 'login'
  | 'dashboard';

export interface ScaffoldFormOptions extends ScaffoldOptions {
  template?: FormTemplateId;
}

export type WinFormsTargetFramework =
  | 'net10.0-windows'
  | 'net9.0-windows'
  | 'net8.0-windows'
  | 'net48';

export interface ScaffoldProjectOptions {
  projectName: string;
  targetFramework?: WinFormsTargetFramework;
  template?: FormTemplateId;
  eol?: '\r\n' | '\n';
}

export interface ScaffoldedProjectFiles {
  csprojContent: string;
  programCsContent: string;
  formCsContent: string;
  designerCsContent: string;
}

export interface FormTemplateMetadata {
  id: FormTemplateId;
  label: string;
  description: string;
}

export const FORM_TEMPLATES: readonly FormTemplateMetadata[] = [
  {
    id: 'blank',
    label: 'Blank Form',
    description: 'Clean empty Windows Form ready for custom layout',
  },
  {
    id: 'dialog',
    label: 'Dialog',
    description: 'Modal dialog with content panel and OK / Cancel button bar',
  },
  {
    id: 'master-detail',
    label: 'Master-Detail',
    description: 'MenuStrip, ToolStrip, SplitContainer (TreeView + DataGridView), and StatusStrip',
  },
  {
    id: 'settings',
    label: 'Settings Dialog',
    description: 'Category ListBox, General / Appearance TabControl, and OK / Cancel / Apply bar',
  },
  {
    id: 'login',
    label: 'Sign-In Dialog',
    description: 'Centered login dialog with Username, Password, Remember Me, and Sign In / Cancel',
  },
  {
    id: 'dashboard',
    label: 'Console Dashboard',
    description: 'MenuStrip, ToolStrip, Filter GroupBox, DataGridView, ProgressBar, and StatusStrip',
  },
];

/**
 * Generates clean, idiomatic `<ClassName>.cs` and `<ClassName>.Designer.cs` files
 * for a new Windows Form or UserControl.
 */
export function scaffoldFormFiles(options: ScaffoldFormOptions): { codeBehind: string; designer: string } {
  const {
    className,
    namespaceName,
    baseType,
    fileScopedNamespace = true,
    nullable = true,
    eol = '\r\n',
    template = 'blank',
  } = options;

  const indent = '    ';
  const trimmedNs = namespaceName.trim();
  const hasNamespace = trimmedNs.length > 0;
  const qualifiedBaseType =
    baseType === 'UserControl'
      ? 'System.Windows.Forms.UserControl'
      : 'System.Windows.Forms.Form';
  const iContainerType = nullable
    ? 'System.ComponentModel.IContainer?'
    : 'System.ComponentModel.IContainer';

  const codeBehindLines: string[] = [];

  if (!hasNamespace) {
    codeBehindLines.push(
      `public partial class ${className} : ${qualifiedBaseType}`,
      '{',
      `${indent}public ${className}()`,
      `${indent}{`,
      `${indent}${indent}InitializeComponent();`,
      `${indent}}`,
      '}'
    );
  } else if (fileScopedNamespace) {
    codeBehindLines.push(`namespace ${trimmedNs};`, '');
    codeBehindLines.push(
      `public partial class ${className} : ${qualifiedBaseType}`,
      '{',
      `${indent}public ${className}()`,
      `${indent}{`,
      `${indent}${indent}InitializeComponent();`,
      `${indent}}`,
      '}'
    );
  } else {
    codeBehindLines.push(
      `namespace ${trimmedNs}`,
      '{',
      `${indent}public partial class ${className} : ${qualifiedBaseType}`,
      `${indent}{`,
      `${indent}${indent}public ${className}()`,
      `${indent}${indent}{`,
      `${indent}${indent}${indent}InitializeComponent();`,
      `${indent}${indent}}`,
      `${indent}}`,
      '}'
    );
  }

  const codeBehind = codeBehindLines.join(eol) + eol;

  // Non-blank templates apply to Form scaffolding
  if (baseType === 'Form' && template !== 'blank') {
    const doc = buildTemplateDesignDocument(template, {
      className,
      namespaceName: trimmedNs,
      fileScopedNamespace: hasNamespace ? fileScopedNamespace : false,
      eol,
      indent,
    });
    let designer = generateDesignerCs(doc, { allowFullFileGeneration: true });
    if (!nullable) {
      designer = designer.replace(
        'private System.ComponentModel.IContainer? components = null;',
        'private System.ComponentModel.IContainer components = null;'
      );
    }
    return { codeBehind, designer };
  }

  // Default blank Form / UserControl
  const designerLines: string[] = [];
  if (!hasNamespace) {
    designerLines.push(
      ...buildDesignerClassBody(className, baseType, iContainerType, '', indent)
    );
  } else if (fileScopedNamespace) {
    designerLines.push(`namespace ${trimmedNs};`, '');
    designerLines.push(
      ...buildDesignerClassBody(className, baseType, iContainerType, '', indent)
    );
  } else {
    designerLines.push(
      `namespace ${trimmedNs}`,
      '{',
      ...buildDesignerClassBody(className, baseType, iContainerType, indent, indent),
      '}'
    );
  }

  return {
    codeBehind,
    designer: designerLines.join(eol) + eol,
  };
}

function sanitizeProjectNamespace(projectName: string): string {
  const parts = projectName
    .trim()
    .split('.')
    .map((seg) => {
      let clean = seg.trim().replace(/[^A-Za-z0-9_]/g, '_');
      if (!clean) return '';
      if (/^[0-9]/.test(clean)) clean = `_${clean}`;
      return clean;
    })
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts.join('.') : 'WinFormsApp';
}

/**
 * Scaffolds a complete runnable Windows Forms project (`.csproj`, `Program.cs`,
 * `MainForm.cs`, and `MainForm.Designer.cs`) for modern .NET or .NET Framework 4.8.
 */
export function scaffoldWinFormsProject(options: ScaffoldProjectOptions): ScaffoldedProjectFiles {
  const {
    projectName,
    targetFramework = 'net10.0-windows',
    template = 'blank',
    eol = '\r\n',
  } = options;

  const isLegacyNet48 = targetFramework === 'net48';
  const namespaceName = sanitizeProjectNamespace(projectName);

  const csprojLines = isLegacyNet48
    ? [
        '<Project Sdk="Microsoft.NET.Sdk">',
        '',
        '  <PropertyGroup>',
        '    <OutputType>WinExe</OutputType>',
        `    <TargetFramework>${targetFramework}</TargetFramework>`,
        '    <UseWindowsForms>true</UseWindowsForms>',
        '  </PropertyGroup>',
        '',
        '</Project>',
      ]
    : [
        '<Project Sdk="Microsoft.NET.Sdk">',
        '',
        '  <PropertyGroup>',
        '    <OutputType>WinExe</OutputType>',
        `    <TargetFramework>${targetFramework}</TargetFramework>`,
        '    <Nullable>enable</Nullable>',
        '    <UseWindowsForms>true</UseWindowsForms>',
        '    <ImplicitUsings>enable</ImplicitUsings>',
        '  </PropertyGroup>',
        '',
        '</Project>',
      ];

  const programLines = isLegacyNet48
    ? [
        'using System;',
        'using System.Windows.Forms;',
        '',
        `namespace ${namespaceName}`,
        '{',
        '    internal static class Program',
        '    {',
        '        [STAThread]',
        '        private static void Main()',
        '        {',
        '            Application.EnableVisualStyles();',
        '            Application.SetCompatibleTextRenderingDefault(false);',
        '            Application.Run(new MainForm());',
        '        }',
        '    }',
        '}',
      ]
    : [
        `namespace ${namespaceName};`,
        '',
        'static class Program',
        '{',
        '    /// <summary>',
        '    ///  The main entry point for the application.',
        '    /// </summary>',
        '    [STAThread]',
        '    static void Main()',
        '    {',
        '        ApplicationConfiguration.Initialize();',
        '        Application.Run(new MainForm());',
        '    }',
        '}',
      ];

  const { codeBehind: formCsContent, designer: designerCsContent } = scaffoldFormFiles({
    className: 'MainForm',
    namespaceName,
    baseType: 'Form',
    fileScopedNamespace: !isLegacyNet48,
    nullable: !isLegacyNet48,
    eol,
    template,
  });

  return {
    csprojContent: csprojLines.join(eol) + eol,
    programCsContent: programLines.join(eol) + eol,
    formCsContent,
    designerCsContent,
  };
}

function buildDesignerClassBody(
  className: string,
  baseType: 'Form' | 'UserControl',
  iContainerType: string,
  classIndent: string,
  indent: string
): string[] {
  const m = classIndent + indent;
  const b = m + indent;
  const b2 = b + indent;

  const initBody: string[] =
    baseType === 'UserControl'
      ? [
          `${b}this.SuspendLayout();`,
          `${b}//`,
          `${b}// ${className}`,
          `${b}//`,
          `${b}this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);`,
          `${b}this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;`,
          `${b}this.Name = ${encodeCSharpString(className)};`,
          `${b}this.Size = new System.Drawing.Size(400, 300);`,
          `${b}this.ResumeLayout(false);`,
        ]
      : [
          `${b}this.SuspendLayout();`,
          `${b}//`,
          `${b}// ${className}`,
          `${b}//`,
          `${b}this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);`,
          `${b}this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;`,
          `${b}this.ClientSize = new System.Drawing.Size(800, 450);`,
          `${b}this.Name = ${encodeCSharpString(className)};`,
          `${b}this.Text = ${encodeCSharpString(className)};`,
          `${b}this.ResumeLayout(false);`,
        ];

  return [
    `${classIndent}partial class ${className}`,
    `${classIndent}{`,
    `${m}/// <summary>`,
    `${m}///  Required designer variable.`,
    `${m}/// </summary>`,
    `${m}private ${iContainerType} components = null;`,
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
    `${m}private void InitializeComponent()`,
    `${m}{`,
    ...initBody,
    `${m}}`,
    '',
    `${m}#endregion`,
    `${classIndent}}`,
  ];
}

// ---------------------------------------------------------------------------
// Starter Form Templates (built via DesignDocument for guaranteed round-trip fidelity)
// ---------------------------------------------------------------------------

interface TemplateBaseParams {
  className: string;
  namespaceName: string;
  fileScopedNamespace: boolean;
  eol: '\r\n' | '\n';
  indent: string;
}

function makeControl(
  name: string,
  type: string,
  properties: DesignNode['properties'],
  extras?: Partial<Omit<DesignNode, 'id' | 'name' | 'type' | 'fullTypeName' | 'properties' | 'events'>>
): DesignNode {
  return {
    id: name,
    name,
    type,
    fullTypeName: `System.Windows.Forms.${type}`,
    properties: { Name: name, ...properties },
    events: {},
    children: extras?.children ?? [],
    ...(extras?.panelSlot ? { panelSlot: extras.panelSlot } : {}),
    ...(extras?.stripItems ? { stripItems: extras.stripItems } : {}),
    ...(extras?.columns ? { columns: extras.columns } : {}),
    ...(extras?.items ? { items: extras.items } : {}),
    ...(extras?.treeNodes ? { treeNodes: extras.treeNodes } : {}),
  };
}

function buildTemplateDesignDocument(
  template: Exclude<FormTemplateId, 'blank'>,
  params: TemplateBaseParams
): DesignDocument {
  const { className, namespaceName, fileScopedNamespace, eol, indent } = params;

  const baseDoc = (
    formProps: DesignNode['properties'],
    children: DesignNode[]
  ): DesignDocument => ({
    namespaceName,
    fileScopedNamespace,
    className,
    baseType: 'Form',
    form: {
      id: '__form__',
      name: className,
      type: 'Form',
      fullTypeName: 'System.Windows.Forms.Form',
      properties: {
        AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
        AutoScaleMode: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' },
        Name: className,
        Text: className,
        ...formProps,
      },
      events: {},
      children,
    },
    components: [],
    resources: {},
    parseDiagnostics: [],
    metadata: {
      eol,
      indent,
      useThisQualifier: true,
      useShorthandEvents: true,
      usesComponentResourceManager: false,
      usesContainerComponents: false,
      hasSuspendResumeLayout: true,
      originalSource: '',
      existingFieldDeclarations: {},
      unhandledTopLevelStatements: [],
      usingDirectives: [],
    },
  });

  switch (template) {
    case 'dialog':
      return baseDoc(
        {
          AcceptButton: { kind: 'raw', expression: 'this.buttonOk' },
          CancelButton: { kind: 'raw', expression: 'this.buttonCancel' },
          ClientSize: { kind: 'size', width: 460, height: 260 },
          FormBorderStyle: { kind: 'enum', typeName: 'FormBorderStyle', value: 'FixedDialog' },
          MaximizeBox: false,
          MinimizeBox: false,
          StartPosition: { kind: 'enum', typeName: 'FormStartPosition', value: 'CenterParent' },
        },
        [
          makeControl(
            'panelContent',
            'Panel',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
              Location: { kind: 'point', x: 0, y: 0 },
              Padding: { kind: 'padding', all: 16, left: 16, top: 16, right: 16, bottom: 16 },
              Size: { kind: 'size', width: 460, height: 208 },
              TabIndex: 0,
            },
            {
              children: [
                makeControl('labelHeading', 'Label', {
                  AutoSize: true,
                  Font: { kind: 'font', family: 'Segoe UI', size: 11, bold: true, unit: 'Point' },
                  Location: { kind: 'point', x: 20, y: 20 },
                  Size: { kind: 'size', width: 120, height: 20 },
                  TabIndex: 0,
                  Text: 'Dialog Title',
                }),
                makeControl('labelMessage', 'Label', {
                  Location: { kind: 'point', x: 20, y: 52 },
                  Size: { kind: 'size', width: 416, height: 60 },
                  TabIndex: 1,
                  Text: 'Enter dialog instructions or controls in this panel.',
                }),
              ],
            }
          ),
          makeControl(
            'panelButtons',
            'Panel',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Bottom' },
              Location: { kind: 'point', x: 0, y: 208 },
              Size: { kind: 'size', width: 460, height: 52 },
              TabIndex: 1,
            },
            {
              children: [
                makeControl('buttonOk', 'Button', {
                  Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                  DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'OK' },
                  Location: { kind: 'point', x: 266, y: 12 },
                  Size: { kind: 'size', width: 84, height: 28 },
                  TabIndex: 0,
                  Text: 'OK',
                  UseVisualStyleBackColor: true,
                }),
                makeControl('buttonCancel', 'Button', {
                  Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                  DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'Cancel' },
                  Location: { kind: 'point', x: 360, y: 12 },
                  Size: { kind: 'size', width: 84, height: 28 },
                  TabIndex: 1,
                  Text: 'Cancel',
                  UseVisualStyleBackColor: true,
                }),
              ],
            }
          ),
        ]
      );

    case 'master-detail':
      return baseDoc(
        {
          ClientSize: { kind: 'size', width: 960, height: 600 },
          MainMenuStrip: { kind: 'raw', expression: 'this.menuStripMain' },
          StartPosition: { kind: 'enum', typeName: 'FormStartPosition', value: 'CenterScreen' },
        },
        [
          makeControl(
            'splitContainerMain',
            'SplitContainer',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
              Location: { kind: 'point', x: 0, y: 49 },
              Size: { kind: 'size', width: 960, height: 529 },
              SplitterDistance: 260,
              TabIndex: 0,
            },
            {
              children: [
                makeControl(
                  'treeViewNavigation',
                  'TreeView',
                  {
                    Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
                    Location: { kind: 'point', x: 0, y: 0 },
                    Size: { kind: 'size', width: 260, height: 529 },
                    TabIndex: 0,
                  },
                  {
                    panelSlot: 'Panel1',
                    treeNodes: [
                      {
                        id: 'nodeRoot',
                        name: 'nodeRoot',
                        text: 'All Items',
                        children: [
                          { id: 'nodeActive', name: 'nodeActive', text: 'Active' },
                          { id: 'nodeArchived', name: 'nodeArchived', text: 'Archived' },
                        ],
                      },
                    ],
                  }
                ),
                makeControl(
                  'dataGridViewDetails',
                  'DataGridView',
                  {
                    AllowUserToAddRows: false,
                    ColumnHeadersHeightSizeMode: {
                      kind: 'enum',
                      typeName: 'DataGridViewColumnHeadersHeightSizeMode',
                      value: 'AutoSize',
                    },
                    Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
                    Location: { kind: 'point', x: 0, y: 44 },
                    ReadOnly: true,
                    Size: { kind: 'size', width: 696, height: 485 },
                    TabIndex: 1,
                  },
                  {
                    panelSlot: 'Panel2',
                    columns: [
                      {
                        id: 'colName',
                        name: 'colName',
                        columnType: 'DataGridViewTextBoxColumn',
                        headerText: 'Name',
                        width: 240,
                      },
                      {
                        id: 'colStatus',
                        name: 'colStatus',
                        columnType: 'DataGridViewTextBoxColumn',
                        headerText: 'Status',
                        width: 140,
                      },
                    ],
                  }
                ),
                makeControl(
                  'panelDetailsHeader',
                  'Panel',
                  {
                    Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Top' },
                    Location: { kind: 'point', x: 0, y: 0 },
                    Size: { kind: 'size', width: 696, height: 44 },
                    TabIndex: 0,
                  },
                  {
                    panelSlot: 'Panel2',
                    children: [
                      makeControl('labelDetailsHeading', 'Label', {
                        AutoSize: true,
                        Font: { kind: 'font', family: 'Segoe UI', size: 11, bold: true, unit: 'Point' },
                        Location: { kind: 'point', x: 12, y: 12 },
                        Size: { kind: 'size', width: 96, height: 20 },
                        TabIndex: 0,
                        Text: 'Item Details',
                      }),
                    ],
                  }
                ),
              ],
            }
          ),
          makeControl(
            'statusStripMain',
            'StatusStrip',
            {
              Location: { kind: 'point', x: 0, y: 578 },
              Size: { kind: 'size', width: 960, height: 22 },
              TabIndex: 1,
              Text: 'statusStripMain',
            },
            {
              stripItems: [
                {
                  id: 'toolStripStatusLabelReady',
                  name: 'toolStripStatusLabelReady',
                  type: 'ToolStripStatusLabel',
                  text: 'Ready',
                  properties: { Name: 'toolStripStatusLabelReady', Text: 'Ready' },
                  events: {},
                },
              ],
            }
          ),
          makeControl(
            'toolStripMain',
            'ToolStrip',
            {
              Location: { kind: 'point', x: 0, y: 24 },
              Size: { kind: 'size', width: 960, height: 25 },
              TabIndex: 2,
              Text: 'toolStripMain',
            },
            {
              stripItems: [
                {
                  id: 'toolStripButtonNew',
                  name: 'toolStripButtonNew',
                  type: 'ToolStripButton',
                  text: 'New',
                  properties: {
                    DisplayStyle: { kind: 'enum', typeName: 'ToolStripItemDisplayStyle', value: 'Text' },
                    Name: 'toolStripButtonNew',
                    Text: 'New',
                  },
                  events: {},
                },
                {
                  id: 'toolStripButtonRefresh',
                  name: 'toolStripButtonRefresh',
                  type: 'ToolStripButton',
                  text: 'Refresh',
                  properties: {
                    DisplayStyle: { kind: 'enum', typeName: 'ToolStripItemDisplayStyle', value: 'Text' },
                    Name: 'toolStripButtonRefresh',
                    Text: 'Refresh',
                  },
                  events: {},
                },
              ],
            }
          ),
          makeControl(
            'menuStripMain',
            'MenuStrip',
            {
              Location: { kind: 'point', x: 0, y: 0 },
              Size: { kind: 'size', width: 960, height: 24 },
              TabIndex: 3,
              Text: 'menuStripMain',
            },
            {
              stripItems: [
                {
                  id: 'fileToolStripMenuItem',
                  name: 'fileToolStripMenuItem',
                  type: 'ToolStripMenuItem',
                  text: '&File',
                  properties: { Name: 'fileToolStripMenuItem', Text: '&File' },
                  events: {},
                  dropDownItems: [
                    {
                      id: 'exitToolStripMenuItem',
                      name: 'exitToolStripMenuItem',
                      type: 'ToolStripMenuItem',
                      text: 'E&xit',
                      properties: { Name: 'exitToolStripMenuItem', Text: 'E&xit' },
                      events: {},
                    },
                  ],
                },
                {
                  id: 'helpToolStripMenuItem',
                  name: 'helpToolStripMenuItem',
                  type: 'ToolStripMenuItem',
                  text: '&Help',
                  properties: { Name: 'helpToolStripMenuItem', Text: '&Help' },
                  events: {},
                },
              ],
            }
          ),
        ]
      );

    case 'settings':
      return baseDoc(
        {
          AcceptButton: { kind: 'raw', expression: 'this.buttonOk' },
          CancelButton: { kind: 'raw', expression: 'this.buttonCancel' },
          ClientSize: { kind: 'size', width: 640, height: 440 },
          FormBorderStyle: { kind: 'enum', typeName: 'FormBorderStyle', value: 'FixedDialog' },
          MaximizeBox: false,
          MinimizeBox: false,
          StartPosition: { kind: 'enum', typeName: 'FormStartPosition', value: 'CenterParent' },
          Text: 'Settings',
        },
        [
          makeControl(
            'tabControlSettings',
            'TabControl',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
              Location: { kind: 'point', x: 168, y: 0 },
              SelectedIndex: 0,
              Size: { kind: 'size', width: 472, height: 388 },
              TabIndex: 1,
            },
            {
              children: [
                makeControl(
                  'tabPageGeneral',
                  'TabPage',
                  {
                    Location: { kind: 'point', x: 4, y: 24 },
                    Padding: { kind: 'padding', all: 12, left: 12, top: 12, right: 12, bottom: 12 },
                    Size: { kind: 'size', width: 464, height: 360 },
                    TabIndex: 0,
                    Text: 'General',
                    UseVisualStyleBackColor: true,
                  },
                  {
                    children: [
                      makeControl('checkBoxAutoSave', 'CheckBox', {
                        AutoSize: true,
                        Checked: true,
                        Location: { kind: 'point', x: 20, y: 20 },
                        Size: { kind: 'size', width: 130, height: 19 },
                        TabIndex: 0,
                        Text: 'Enable auto-save',
                        UseVisualStyleBackColor: true,
                      }),
                      makeControl('checkBoxStartup', 'CheckBox', {
                        AutoSize: true,
                        Location: { kind: 'point', x: 20, y: 52 },
                        Size: { kind: 'size', width: 145, height: 19 },
                        TabIndex: 1,
                        Text: 'Launch on startup',
                        UseVisualStyleBackColor: true,
                      }),
                    ],
                  }
                ),
                makeControl(
                  'tabPageAppearance',
                  'TabPage',
                  {
                    Location: { kind: 'point', x: 4, y: 24 },
                    Padding: { kind: 'padding', all: 12, left: 12, top: 12, right: 12, bottom: 12 },
                    Size: { kind: 'size', width: 464, height: 360 },
                    TabIndex: 1,
                    Text: 'Appearance',
                    UseVisualStyleBackColor: true,
                  },
                  {
                    children: [
                      makeControl('labelTheme', 'Label', {
                        AutoSize: true,
                        Location: { kind: 'point', x: 20, y: 24 },
                        Size: { kind: 'size', width: 48, height: 15 },
                        TabIndex: 0,
                        Text: 'Theme:',
                      }),
                      makeControl(
                        'comboBoxTheme',
                        'ComboBox',
                        {
                          DropDownStyle: { kind: 'enum', typeName: 'ComboBoxStyle', value: 'DropDownList' },
                          FormattingEnabled: true,
                          Location: { kind: 'point', x: 84, y: 20 },
                          Size: { kind: 'size', width: 180, height: 23 },
                          TabIndex: 1,
                        },
                        { items: ['System', 'Light', 'Dark'] }
                      ),
                    ],
                  }
                ),
              ],
            }
          ),
          makeControl(
            'listBoxCategories',
            'ListBox',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Left' },
              FormattingEnabled: true,
              ItemHeight: 15,
              Location: { kind: 'point', x: 0, y: 0 },
              Size: { kind: 'size', width: 168, height: 388 },
              TabIndex: 0,
            },
            { items: ['General', 'Appearance'] }
          ),
          makeControl(
            'panelFooter',
            'Panel',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Bottom' },
              Location: { kind: 'point', x: 0, y: 388 },
              Size: { kind: 'size', width: 640, height: 52 },
              TabIndex: 2,
            },
            {
              children: [
                makeControl('buttonOk', 'Button', {
                  Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                  DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'OK' },
                  Location: { kind: 'point', x: 356, y: 12 },
                  Size: { kind: 'size', width: 84, height: 28 },
                  TabIndex: 0,
                  Text: 'OK',
                  UseVisualStyleBackColor: true,
                }),
                makeControl('buttonCancel', 'Button', {
                  Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                  DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'Cancel' },
                  Location: { kind: 'point', x: 450, y: 12 },
                  Size: { kind: 'size', width: 84, height: 28 },
                  TabIndex: 1,
                  Text: 'Cancel',
                  UseVisualStyleBackColor: true,
                }),
                makeControl('buttonApply', 'Button', {
                  Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                  Location: { kind: 'point', x: 544, y: 12 },
                  Size: { kind: 'size', width: 84, height: 28 },
                  TabIndex: 2,
                  Text: 'Apply',
                  UseVisualStyleBackColor: true,
                }),
              ],
            }
          ),
        ]
      );

    case 'login':
      return baseDoc(
        {
          AcceptButton: { kind: 'raw', expression: 'this.buttonSignIn' },
          CancelButton: { kind: 'raw', expression: 'this.buttonCancel' },
          ClientSize: { kind: 'size', width: 380, height: 290 },
          FormBorderStyle: { kind: 'enum', typeName: 'FormBorderStyle', value: 'FixedDialog' },
          MaximizeBox: false,
          MinimizeBox: false,
          StartPosition: { kind: 'enum', typeName: 'FormStartPosition', value: 'CenterScreen' },
          Text: 'Sign In',
        },
        [
          makeControl('labelTitle', 'Label', {
            AutoSize: true,
            Font: { kind: 'font', family: 'Segoe UI', size: 14, bold: true, unit: 'Point' },
            Location: { kind: 'point', x: 28, y: 24 },
            Size: { kind: 'size', width: 76, height: 25 },
            TabIndex: 0,
            Text: 'Sign In',
          }),
          makeControl('labelUsername', 'Label', {
            AutoSize: true,
            Location: { kind: 'point', x: 28, y: 68 },
            Size: { kind: 'size', width: 64, height: 15 },
            TabIndex: 1,
            Text: 'Username:',
          }),
          makeControl('textBoxUsername', 'TextBox', {
            Location: { kind: 'point', x: 28, y: 90 },
            Size: { kind: 'size', width: 324, height: 23 },
            TabIndex: 2,
          }),
          makeControl('labelPassword', 'Label', {
            AutoSize: true,
            Location: { kind: 'point', x: 28, y: 126 },
            Size: { kind: 'size', width: 60, height: 15 },
            TabIndex: 3,
            Text: 'Password:',
          }),
          makeControl('textBoxPassword', 'TextBox', {
            Location: { kind: 'point', x: 28, y: 148 },
            Size: { kind: 'size', width: 324, height: 23 },
            TabIndex: 4,
            UseSystemPasswordChar: true,
          }),
          makeControl('checkBoxRememberMe', 'CheckBox', {
            AutoSize: true,
            Location: { kind: 'point', x: 28, y: 188 },
            Size: { kind: 'size', width: 112, height: 19 },
            TabIndex: 5,
            Text: 'Remember me',
            UseVisualStyleBackColor: true,
          }),
          makeControl('buttonSignIn', 'Button', {
            DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'OK' },
            Location: { kind: 'point', x: 164, y: 236 },
            Size: { kind: 'size', width: 90, height: 30 },
            TabIndex: 6,
            Text: 'Sign In',
            UseVisualStyleBackColor: true,
          }),
          makeControl('buttonCancel', 'Button', {
            DialogResult: { kind: 'enum', typeName: 'DialogResult', value: 'Cancel' },
            Location: { kind: 'point', x: 262, y: 236 },
            Size: { kind: 'size', width: 90, height: 30 },
            TabIndex: 7,
            Text: 'Cancel',
            UseVisualStyleBackColor: true,
          }),
        ]
      );

    case 'dashboard':
      return baseDoc(
        {
          ClientSize: { kind: 'size', width: 1024, height: 640 },
          MainMenuStrip: { kind: 'raw', expression: 'this.menuStripMain' },
          StartPosition: { kind: 'enum', typeName: 'FormStartPosition', value: 'CenterScreen' },
          Text: 'Dashboard',
        },
        [
          makeControl(
            'panelMain',
            'Panel',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
              Location: { kind: 'point', x: 224, y: 49 },
              Padding: { kind: 'padding', all: 8, left: 8, top: 8, right: 8, bottom: 8 },
              Size: { kind: 'size', width: 800, height: 569 },
              TabIndex: 1,
            },
            {
              children: [
                makeControl(
                  'dataGridViewMetrics',
                  'DataGridView',
                  {
                    AllowUserToAddRows: false,
                    ColumnHeadersHeightSizeMode: {
                      kind: 'enum',
                      typeName: 'DataGridViewColumnHeadersHeightSizeMode',
                      value: 'AutoSize',
                    },
                    Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
                    Location: { kind: 'point', x: 8, y: 8 },
                    ReadOnly: true,
                    Size: { kind: 'size', width: 784, height: 509 },
                    TabIndex: 0,
                  },
                  {
                    columns: [
                      {
                        id: 'colId',
                        name: 'colId',
                        columnType: 'DataGridViewTextBoxColumn',
                        headerText: 'ID',
                        width: 80,
                      },
                      {
                        id: 'colTitle',
                        name: 'colTitle',
                        columnType: 'DataGridViewTextBoxColumn',
                        headerText: 'Title',
                        width: 280,
                      },
                      {
                        id: 'colState',
                        name: 'colState',
                        columnType: 'DataGridViewTextBoxColumn',
                        headerText: 'State',
                        width: 140,
                      },
                    ],
                  }
                ),
                makeControl(
                  'panelActionBar',
                  'Panel',
                  {
                    Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Bottom' },
                    Location: { kind: 'point', x: 8, y: 517 },
                    Size: { kind: 'size', width: 784, height: 44 },
                    TabIndex: 1,
                  },
                  {
                    children: [
                      makeControl('progressBarStatus', 'ProgressBar', {
                        Location: { kind: 'point', x: 4, y: 11 },
                        Maximum: 100,
                        Minimum: 0,
                        Size: { kind: 'size', width: 280, height: 22 },
                        TabIndex: 0,
                        Value: 65,
                      }),
                      makeControl('buttonRunAction', 'Button', {
                        Anchor: { kind: 'flags', typeName: 'AnchorStyles', values: ['Bottom', 'Right'] },
                        Location: { kind: 'point', x: 688, y: 8 },
                        Size: { kind: 'size', width: 92, height: 28 },
                        TabIndex: 1,
                        Text: 'Run',
                        UseVisualStyleBackColor: true,
                      }),
                    ],
                  }
                ),
              ],
            }
          ),
          makeControl(
            'groupBoxFilters',
            'GroupBox',
            {
              Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Left' },
              Location: { kind: 'point', x: 0, y: 49 },
              Padding: { kind: 'padding', all: 8, left: 8, top: 8, right: 8, bottom: 8 },
              Size: { kind: 'size', width: 224, height: 569 },
              TabIndex: 0,
              TabStop: false,
              Text: 'Filters',
            },
            {
              children: [
                makeControl('labelSearch', 'Label', {
                  AutoSize: true,
                  Location: { kind: 'point', x: 14, y: 28 },
                  Size: { kind: 'size', width: 46, height: 15 },
                  TabIndex: 0,
                  Text: 'Search:',
                }),
                makeControl('textBoxSearch', 'TextBox', {
                  Location: { kind: 'point', x: 14, y: 48 },
                  Size: { kind: 'size', width: 194, height: 23 },
                  TabIndex: 1,
                }),
                makeControl('labelStatus', 'Label', {
                  AutoSize: true,
                  Location: { kind: 'point', x: 14, y: 86 },
                  Size: { kind: 'size', width: 42, height: 15 },
                  TabIndex: 2,
                  Text: 'Status:',
                }),
                makeControl(
                  'comboBoxStatus',
                  'ComboBox',
                  {
                    DropDownStyle: { kind: 'enum', typeName: 'ComboBoxStyle', value: 'DropDownList' },
                    FormattingEnabled: true,
                    Location: { kind: 'point', x: 14, y: 106 },
                    Size: { kind: 'size', width: 194, height: 23 },
                    TabIndex: 3,
                  },
                  { items: ['All', 'Active', 'Pending', 'Completed'] }
                ),
                makeControl('buttonApplyFilter', 'Button', {
                  Location: { kind: 'point', x: 14, y: 146 },
                  Size: { kind: 'size', width: 194, height: 30 },
                  TabIndex: 4,
                  Text: 'Apply Filter',
                  UseVisualStyleBackColor: true,
                }),
              ],
            }
          ),
          makeControl(
            'statusStripMain',
            'StatusStrip',
            {
              Location: { kind: 'point', x: 0, y: 618 },
              Size: { kind: 'size', width: 1024, height: 22 },
              TabIndex: 2,
              Text: 'statusStripMain',
            },
            {
              stripItems: [
                {
                  id: 'toolStripStatusLabelInfo',
                  name: 'toolStripStatusLabelInfo',
                  type: 'ToolStripStatusLabel',
                  text: 'Ready',
                  properties: { Name: 'toolStripStatusLabelInfo', Text: 'Ready' },
                  events: {},
                },
              ],
            }
          ),
          makeControl(
            'toolStripMain',
            'ToolStrip',
            {
              Location: { kind: 'point', x: 0, y: 24 },
              Size: { kind: 'size', width: 1024, height: 25 },
              TabIndex: 3,
              Text: 'toolStripMain',
            },
            {
              stripItems: [
                {
                  id: 'toolStripButtonRefresh',
                  name: 'toolStripButtonRefresh',
                  type: 'ToolStripButton',
                  text: 'Refresh',
                  properties: {
                    DisplayStyle: { kind: 'enum', typeName: 'ToolStripItemDisplayStyle', value: 'Text' },
                    Name: 'toolStripButtonRefresh',
                    Text: 'Refresh',
                  },
                  events: {},
                },
                {
                  id: 'toolStripButtonExport',
                  name: 'toolStripButtonExport',
                  type: 'ToolStripButton',
                  text: 'Export',
                  properties: {
                    DisplayStyle: { kind: 'enum', typeName: 'ToolStripItemDisplayStyle', value: 'Text' },
                    Name: 'toolStripButtonExport',
                    Text: 'Export',
                  },
                  events: {},
                },
              ],
            }
          ),
          makeControl(
            'menuStripMain',
            'MenuStrip',
            {
              Location: { kind: 'point', x: 0, y: 0 },
              Size: { kind: 'size', width: 1024, height: 24 },
              TabIndex: 4,
              Text: 'menuStripMain',
            },
            {
              stripItems: [
                {
                  id: 'fileToolStripMenuItem',
                  name: 'fileToolStripMenuItem',
                  type: 'ToolStripMenuItem',
                  text: '&File',
                  properties: { Name: 'fileToolStripMenuItem', Text: '&File' },
                  events: {},
                },
                {
                  id: 'viewToolStripMenuItem',
                  name: 'viewToolStripMenuItem',
                  type: 'ToolStripMenuItem',
                  text: '&View',
                  properties: { Name: 'viewToolStripMenuItem', Text: '&View' },
                  events: {},
                },
              ],
            }
          ),
        ]
      );
  }
}
