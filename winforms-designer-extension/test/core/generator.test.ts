import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { generateDesignerCs, parseDesignerCs } from '../../src/core';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const FORM1_PATH = path.join(REPO_ROOT, 'TestDesignFile/Form1.Designer.cs');
const ORDER_MANAGER_PATH = path.join(REPO_ROOT, 'samples/OrderManagerDemo/MainForm.Designer.cs');

describe('generator (generateDesignerCs)', () => {
  it('performs double round-trip idempotency on TestDesignFile/Form1.Designer.cs', () => {
    const src = fs.readFileSync(FORM1_PATH, 'utf8');
    const doc1 = parseDesignerCs(src);
    const gen1 = generateDesignerCs(doc1);
    const doc2 = parseDesignerCs(gen1);
    const gen2 = generateDesignerCs(doc2);

    assert.equal(gen2, gen1);
    assert.equal(doc2.parseDiagnostics.length, 0);
    // Preserves Dispose and surrounding comments outside InitializeComponent
    assert.ok(gen1.includes('protected override void Dispose(bool disposing)'));
    assert.ok(gen1.includes('Required designer variable.'));
    assert.equal(doc2.form.children.length, 1);
    assert.equal(doc2.form.children[0].properties.Text, 'Label01');
  });

  it('performs double round-trip idempotency on samples/OrderManagerDemo/MainForm.Designer.cs', () => {
    const src = fs.readFileSync(ORDER_MANAGER_PATH, 'utf8');
    const doc1 = parseDesignerCs(src);
    const gen1 = generateDesignerCs(doc1);
    const doc2 = parseDesignerCs(gen1);
    const gen2 = generateDesignerCs(doc2);

    assert.equal(gen2, gen1);
    assert.equal(doc2.parseDiagnostics.length, 0);

    // Verify all major structures survived intact
    assert.equal(doc2.form.children.length, 4);
    assert.equal(doc2.components.length, 3);
    const split = doc2.form.children.find((c) => c.name === 'splitMain')!;
    assert.equal(split.children.length, 2);
    const tabWorkspace = split.children.find((c) => c.name === 'tabWorkspace')!;
    const dgv = tabWorkspace.children[0].children.find((c) => c.name === 'dgvOrders')!;
    assert.equal(dgv.columns?.length, 5);
    const menuStrip = doc2.form.children.find((c) => c.name === 'menuStrip1')!;
    assert.equal(menuStrip.stripItems![0].dropDownItems?.length, 3);
  });

  it('surgically preserves custom code and comments outside the designer region', () => {
    const src = `using System;\r\n\r\nnamespace PreserveTest\r\n{\r\n    // Custom class header comment\r\n    partial class MyForm\r\n    {\r\n        private System.ComponentModel.IContainer components = null;\r\n        private readonly int _customKeep = 42;\r\n\r\n        private void CustomHelper() => Console.WriteLine(_customKeep);\r\n\r\n        #region Windows Form Designer generated code\r\n\r\n        private void InitializeComponent()\r\n        {\r\n            this.btnOk = new System.Windows.Forms.Button();\r\n            this.SuspendLayout();\r\n            this.btnOk.Location = new System.Drawing.Point(10, 10);\r\n            this.btnOk.Name = "btnOk";\r\n            this.btnOk.Size = new System.Drawing.Size(80, 25);\r\n            this.btnOk.Text = "OK";\r\n            this.ClientSize = new System.Drawing.Size(300, 200);\r\n            this.Controls.Add(this.btnOk);\r\n            this.Text = "MyForm";\r\n            this.ResumeLayout(false);\r\n        }\r\n\r\n        #endregion\r\n\r\n        private System.Windows.Forms.Button btnOk;\r\n    }\r\n}\r\n`;

    const doc = parseDesignerCs(src);
    doc.form.children[0].properties.Text = 'Save Changes';
    const updated = generateDesignerCs(doc);

    assert.ok(updated.includes('\r\n'));
    assert.ok(updated.includes('// Custom class header comment'));
    assert.ok(updated.includes('private readonly int _customKeep = 42;'));
    assert.ok(updated.includes('private void CustomHelper() => Console.WriteLine(_customKeep);'));
    assert.ok(updated.includes('this.btnOk.Text = "Save Changes";'));

    // Double round-trip
    const gen2 = generateDesignerCs(parseDesignerCs(updated));
    assert.equal(gen2, updated);
  });

  it('honors useThisQualifier and eventHandlerStyle overrides', () => {
    const src = `namespace StyleApp;

partial class StyleForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.btn1 = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.btn1.Name = "btn1";
        this.btn1.Click += this.btn1_Click;
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Controls.Add(this.btn1);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btn1;
}
`;
    const doc = parseDesignerCs(src);

    const noThisExplicit = generateDesignerCs(doc, {
      useThisQualifier: 'never',
      eventHandlerStyle: 'explicitDelegate',
    });
    assert.ok(noThisExplicit.includes('btn1 = new System.Windows.Forms.Button();'));
    assert.ok(!noThisExplicit.includes('this.btn1'));
    assert.ok(noThisExplicit.includes('btn1.Click += new System.EventHandler(btn1_Click);'));

    const alwaysThisShorthand = generateDesignerCs(doc, {
      useThisQualifier: 'always',
      eventHandlerStyle: 'shorthand',
    });
    assert.ok(alwaysThisShorthand.includes('this.btn1.Click += this.btn1_Click;'));
  });

  it('generates complete valid .Designer.cs from scratch when originalSource is empty', () => {
    const doc = parseDesignerCs('');
    doc.namespaceName = 'FreshApp';
    doc.fileScopedNamespace = true;
    doc.className = 'FreshForm';
    doc.baseType = 'Form';
    doc.form.name = 'FreshForm';
    doc.form.properties = {
      AutoScaleDimensions: { kind: 'sizeF', width: 7, height: 15 },
      AutoScaleMode: { kind: 'enum', typeName: 'AutoScaleMode', value: 'Font' },
      ClientSize: { kind: 'size', width: 640, height: 480 },
      Icon: { kind: 'resource', resourceName: '$this.Icon', resourceType: 'Icon' },
      Name: 'FreshForm',
      Text: 'Fresh Form',
    };
    doc.form.children = [
      {
        id: 'tlp1',
        name: 'tlp1',
        type: 'TableLayoutPanel',
        fullTypeName: 'System.Windows.Forms.TableLayoutPanel',
        properties: {
          ColumnCount: 2,
          Dock: { kind: 'enum', typeName: 'DockStyle', value: 'Fill' },
          Name: 'tlp1',
          RowCount: 1,
        },
        events: {},
        tableLayout: {
          columnStyles: [
            { sizeType: 'Percent', value: 50 },
            { sizeType: 'Percent', value: 50 },
          ],
          rowStyles: [{ sizeType: 'Percent', value: 100 }],
        },
        children: [
          {
            id: 'lblTitle',
            name: 'lblTitle',
            type: 'Label',
            fullTypeName: 'System.Windows.Forms.Label',
            properties: {
              AutoSize: true,
              Name: 'lblTitle',
              Text: 'Welcome',
            },
            events: {},
            children: [],
            tableCell: { column: 0, row: 0, columnSpan: 2 },
          },
        ],
      },
    ];
    doc.components = [
      {
        id: 'timer1',
        name: 'timer1',
        type: 'Timer',
        fullTypeName: 'System.Windows.Forms.Timer',
        isComponent: true,
        properties: { Interval: 500 },
        events: { Tick: 'timer1_Tick' },
        children: [],
      },
    ];

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('namespace FreshApp;'));
    assert.ok(gen1.includes('this.components = new System.ComponentModel.Container();'));
    assert.ok(gen1.includes('ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(FreshForm));'));
    assert.ok(gen1.includes('this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));'));
    assert.ok(gen1.includes('this.tlp1.Controls.Add(this.lblTitle, 0, 0);'));
    assert.ok(gen1.includes('this.tlp1.SetColumnSpan(this.lblTitle, 2);'));
    assert.ok(gen1.includes('this.timer1 = new System.Windows.Forms.Timer(this.components);'));

    // Double round-trip idempotency
    const doc2 = parseDesignerCs(gen1);
    const gen2 = generateDesignerCs(doc2);
    assert.equal(gen2, gen1);
    assert.equal(doc2.parseDiagnostics.length, 0);
  });

  it('preserves custom modifiers, nullable field types, unknown controls, and raw statements across round-trip', () => {
    const src = `namespace EdgeApp;

partial class EdgeForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.widget1 = new Acme.Ui.FancyWidget();
        this.SuspendLayout();
        //
        // widget1
        //
        this.widget1.CustomExpr = Acme.Config.Default;
        this.widget1.Location = new System.Drawing.Point(20, 30);
        this.widget1.Name = "widget1";
        this.widget1.RegisterPreset("dark");
        //
        // EdgeForm
        //
        this.ClientSize = new System.Drawing.Size(500, 350);
        this.Controls.Add(this.widget1);
        this.Name = "EdgeForm";
        this.ResumeLayout(false);
    }
    #endregion

    internal Acme.Ui.FancyWidget? widget1;
}
`;
    const doc1 = parseDesignerCs(src);
    const gen1 = generateDesignerCs(doc1);

    // Must not emit `new Acme.Ui.FancyWidget?()`
    assert.ok(gen1.includes('this.widget1 = new Acme.Ui.FancyWidget();'));
    // Must preserve field declaration modifier and nullable `?`
    assert.ok(gen1.includes('internal Acme.Ui.FancyWidget? widget1;'));
    assert.ok(gen1.includes('this.widget1.CustomExpr = Acme.Config.Default;'));
    assert.ok(gen1.includes('this.widget1.RegisterPreset("dark");'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('preserves local DataGridViewCellStyle declarations before control configuration blocks', () => {
    const src = `namespace GridApp;

partial class GridForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        System.Windows.Forms.DataGridViewCellStyle style1 = new System.Windows.Forms.DataGridViewCellStyle();
        this.dgv1 = new System.Windows.Forms.DataGridView();
        ((System.ComponentModel.ISupportInitialize)(this.dgv1)).BeginInit();
        this.SuspendLayout();
        style1.BackColor = System.Drawing.SystemColors.Control;
        this.dgv1.ColumnHeadersDefaultCellStyle = style1;
        this.dgv1.Name = "dgv1";
        this.ClientSize = new System.Drawing.Size(500, 300);
        this.Controls.Add(this.dgv1);
        ((System.ComponentModel.ISupportInitialize)(this.dgv1)).EndInit();
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.DataGridView dgv1;
}
`;
    const doc1 = parseDesignerCs(src);
    const gen1 = generateDesignerCs(doc1);

    const declIdx = gen1.indexOf('DataGridViewCellStyle style1 =');
    const useIdx = gen1.indexOf('this.dgv1.ColumnHeadersDefaultCellStyle = style1;');
    assert.ok(declIdx > 0, 'local style1 declaration should be preserved');
    assert.ok(useIdx > declIdx, 'local style1 must be declared before dgv1 references it');

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('preserves interleaved custom user fields after #endregion across edits and deletions', () => {
    const src = `namespace InterleavedApp;

partial class OrderForm
{
    private System.ComponentModel.IContainer? components = null;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.button1 = new System.Windows.Forms.Button();
        this.label1 = new System.Windows.Forms.Label();
        this.SuspendLayout();
        this.button1.Name = "button1";
        this.button1.Text = "Submit";
        this.label1.Name = "label1";
        this.label1.Text = "Status";
        this.ClientSize = new System.Drawing.Size(400, 300);
        this.Controls.Add(this.button1);
        this.Controls.Add(this.label1);
        this.Name = "OrderForm";
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button button1;
    private int _retryCount = 3;
    private readonly IOrderService _svc;
    private System.Windows.Forms.Label label1;
}
`;
    const doc = parseDesignerCs(src);
    // Delete button1; user fields must survive verbatim!
    doc.form.children = doc.form.children.filter((c) => c.name !== 'button1');
    const gen1 = generateDesignerCs(doc);

    assert.ok(!gen1.includes('private System.Windows.Forms.Button button1;'));
    assert.ok(gen1.includes('private System.Windows.Forms.Label label1;'));
    assert.ok(gen1.includes('private int _retryCount = 3;'));
    assert.ok(gen1.includes('private readonly IOrderService _svc;'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('auto-declares missing components field when first IContainer component is dropped', () => {
    const src = `namespace TimerApp;

partial class ClockForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.SuspendLayout();
        this.ClientSize = new System.Drawing.Size(320, 200);
        this.Name = "ClockForm";
        this.ResumeLayout(false);
    }
    #endregion
}
`;
    const doc = parseDesignerCs(src);
    doc.components.push({
      id: 'timer1',
      name: 'timer1',
      type: 'Timer',
      fullTypeName: 'System.Windows.Forms.Timer',
      isComponent: true,
      properties: { Interval: 1000 },
      events: {},
      children: [],
    });

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('this.components = new System.ComponentModel.Container();'));
    assert.ok(gen1.includes('private System.ComponentModel.IContainer? components = null;'));
    assert.ok(gen1.includes('private System.Windows.Forms.Timer timer1;'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
    // Ensure components was NOT duplicated on second round-trip
    assert.equal(gen2.split('IContainer? components = null;').length - 1, 1);
  });

  it('strips dangling control references (AcceptButton, CancelButton, SetToolTip) on control delete and prefers ClientSize over Size on Form', () => {
    const src = `namespace CleanupApp;

partial class DialogForm
{
    private System.ComponentModel.IContainer? components = null;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        this.btnOk = new System.Windows.Forms.Button();
        this.btnCancel = new System.Windows.Forms.Button();
        this.toolTip1 = new System.Windows.Forms.ToolTip(this.components);
        this.SuspendLayout();
        this.btnOk.Name = "btnOk";
        this.btnOk.Text = "OK";
        this.btnCancel.Name = "btnCancel";
        this.btnCancel.Text = "Cancel";
        this.toolTip1.SetToolTip(this.btnOk, "Confirm changes");
        this.toolTip1.SetToolTip(this.btnCancel, "Discard changes");
        this.AcceptButton = this.btnOk;
        this.CancelButton = this.btnCancel;
        this.ClientSize = new System.Drawing.Size(400, 250);
        this.Controls.Add(this.btnOk);
        this.Controls.Add(this.btnCancel);
        this.Name = "DialogForm";
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btnOk;
    private System.Windows.Forms.Button btnCancel;
    private System.Windows.Forms.ToolTip toolTip1;
}
`;
    const doc = parseDesignerCs(src);
    // Delete btnOk, keep btnCancel, and also set conflicting Form.Size
    doc.form.children = doc.form.children.filter((c) => c.name !== 'btnOk');
    doc.form.properties.Size = { kind: 'size', width: 999, height: 999 };

    const gen1 = generateDesignerCs(doc);
    assert.ok(!gen1.includes('AcceptButton'), 'Dangling AcceptButton must be omitted');
    assert.ok(gen1.includes('this.CancelButton = this.btnCancel;'), 'Valid CancelButton must remain');
    assert.ok(!gen1.includes('SetToolTip(this.btnOk'), 'Dangling SetToolTip must be stripped');
    assert.ok(gen1.includes('SetToolTip(this.btnCancel, "Discard changes")'), 'Valid SetToolTip must remain');
    assert.ok(gen1.includes('this.ClientSize = new System.Drawing.Size(400, 250);'));
    assert.ok(!gen1.includes('this.Size = new System.Drawing.Size(999, 999);'), 'ClientSize takes precedence over Size on Form');

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('double round-trips TreeView.Nodes hierarchy, ShortcutKeys, Cursors, FlatAppearance, and TextBox.Lines idempotently', () => {
    const doc = parseDesignerCs('');
    doc.namespaceName = 'TreeApp';
    doc.fileScopedNamespace = true;
    doc.className = 'TreeForm';
    doc.baseType = 'Form';
    doc.form.name = 'TreeForm';
    doc.form.properties = {
      ClientSize: { kind: 'size', width: 640, height: 420 },
      Name: 'TreeForm',
      Text: 'Tree & Extras',
    };
    doc.form.children = [
      {
        id: 'treeView1',
        name: 'treeView1',
        type: 'TreeView',
        fullTypeName: 'System.Windows.Forms.TreeView',
        properties: {
          Location: { kind: 'point', x: 12, y: 36 },
          Name: 'treeView1',
          Size: { kind: 'size', width: 220, height: 360 },
        },
        events: {},
        children: [],
        treeNodes: [
          {
            id: 'root1',
            name: 'NodeRoot',
            text: 'Workspace',
            children: [
              { id: 'c1', name: 'NodeSrc', text: 'src' },
              { id: 'c2', name: 'NodeTest', text: 'test' },
            ],
          },
        ],
      },
      {
        id: 'btnFlat',
        name: 'btnFlat',
        type: 'Button',
        fullTypeName: 'System.Windows.Forms.Button',
        properties: {
          Cursor: { kind: 'enum', typeName: 'Cursors', value: 'Hand' },
          'FlatAppearance.BorderColor': { kind: 'color', value: 'SteelBlue', isNamed: true },
          'FlatAppearance.BorderSize': 1,
          FlatStyle: { kind: 'enum', typeName: 'FlatStyle', value: 'Flat' },
          Location: { kind: 'point', x: 250, y: 36 },
          Name: 'btnFlat',
          Size: { kind: 'size', width: 110, height: 32 },
          Text: 'Apply',
        },
        events: {},
        children: [],
      },
      {
        id: 'txtNotes',
        name: 'txtNotes',
        type: 'TextBox',
        fullTypeName: 'System.Windows.Forms.TextBox',
        properties: {
          Lines: { kind: 'raw', expression: 'new string[] { "First", "Second" }' },
          Location: { kind: 'point', x: 250, y: 80 },
          Multiline: true,
          Name: 'txtNotes',
          Size: { kind: 'size', width: 360, height: 120 },
        },
        events: {},
        children: [],
      },
      {
        id: 'menuStrip1',
        name: 'menuStrip1',
        type: 'MenuStrip',
        fullTypeName: 'System.Windows.Forms.MenuStrip',
        properties: { Name: 'menuStrip1' },
        events: {},
        children: [],
        stripItems: [
          {
            id: 'saveItem',
            name: 'saveItem',
            type: 'ToolStripMenuItem',
            text: '&Save',
            properties: {
              Name: 'saveItem',
              ShortcutKeys: { kind: 'flags', typeName: 'Keys', values: ['Control', 'S'] },
            },
            events: {},
          },
        ],
      },
    ];

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('System.Windows.Forms.TreeNode treeNode1 = new System.Windows.Forms.TreeNode("src");'));
    assert.ok(gen1.includes('System.Windows.Forms.TreeNode treeNode3 = new System.Windows.Forms.TreeNode("Workspace", new System.Windows.Forms.TreeNode[] {'));
    assert.ok(gen1.includes('this.treeView1.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {'));
    assert.ok(gen1.includes('this.btnFlat.Cursor = System.Windows.Forms.Cursors.Hand;'));
    assert.ok(gen1.includes('this.btnFlat.FlatAppearance.BorderColor = System.Drawing.Color.SteelBlue;'));
    assert.ok(gen1.includes('this.saveItem.ShortcutKeys = ((System.Windows.Forms.Keys)(System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.S));'));

    const doc2 = parseDesignerCs(gen1);
    assert.equal(doc2.parseDiagnostics.length, 0);
    assert.equal(doc2.metadata.unhandledTopLevelStatements.length, 0);
    const gen2 = generateDesignerCs(doc2);
    assert.equal(gen2, gen1);
  });

  it('refuses to overwrite non-empty file when InitializeComponent range is missing unless allowFullFileGeneration is true', () => {
    const doc = parseDesignerCs('namespace PartialApp;\npartial class MissingInitForm { private int x = 1; }\n');
    assert.ok(doc.metadata.readOnlyReason);
    assert.throws(() => generateDesignerCs(doc), /Cannot generate designer code/);

    // Even if readOnlyReason is manually cleared, missing initializeComponentRange with non-empty originalSource must throw
    doc.metadata.readOnlyReason = undefined;
    assert.throws(() => generateDesignerCs(doc), /allowFullFileGeneration/);

    // Explicit opt-in succeeds
    const full = generateDesignerCs(doc, { allowFullFileGeneration: true });
    assert.ok(full.includes('private void InitializeComponent()'));
  });

  it('surgically patches fields without deleting helper methods, multi-declarator siblings, or duplicating before-init fields', () => {
    const src = `namespace SurgicalApp;

partial class SurgicalForm
{
    private System.Windows.Forms.Label labelTop;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.labelTop = new System.Windows.Forms.Label();
        this.button1 = new System.Windows.Forms.Button();
        this.button2 = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.labelTop.Name = "labelTop";
        this.labelTop.Text = "Header";
        this.button1.Name = "button1";
        this.button1.Text = "One";
        this.button2.Name = "button2";
        this.button2.Text = "Two";
        this.ClientSize = new System.Drawing.Size(400, 300);
        this.Controls.Add(this.labelTop);
        this.Controls.Add(this.button1);
        this.Controls.Add(this.button2);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button button1, helper;
    private string ComputeSummary() => "keep-me";
    private System.Windows.Forms.Button button2;
}
`;
    const doc = parseDesignerCs(src);
    // 1. Untouched round-trip preserves helper method, multi-declarator sibling, and before-init labelTop without duplication
    const genUnchanged = generateDesignerCs(doc);
    assert.ok(genUnchanged.includes('private string ComputeSummary() => "keep-me";'));
    assert.ok(genUnchanged.includes('private System.Windows.Forms.Button button1, helper;'));
    assert.equal(genUnchanged.split('labelTop;').length - 1, 1, 'beforeInit field must not be duplicated');

    // 2. Delete button1 -> helper survives, ComputeSummary survives, button2 survives, labelTop stays in place
    doc.form.children = doc.form.children.filter((c) => c.name !== 'button1');
    const genDeleted = generateDesignerCs(doc);
    assert.ok(genDeleted.includes('private System.Windows.Forms.Button helper;'), 'Multi-declarator sibling helper must survive');
    assert.ok(!genDeleted.includes('button1, helper'), 'Deleted declarator button1 must be removed');
    assert.ok(genDeleted.includes('private string ComputeSummary() => "keep-me";'), 'Interleaved helper method must survive');
    assert.ok(genDeleted.includes('private System.Windows.Forms.Button button2;'));
    assert.equal(genDeleted.split('labelTop;').length - 1, 1);

    const gen2 = generateDesignerCs(parseDesignerCs(genDeleted));
    assert.equal(gen2, genDeleted);
  });

  it('preserves ComponentResourceManager variable name, custom castType, and ApplyResources calls', () => {
    const src = `namespace ResVarApp;

partial class LocalizedForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager rm = new System.ComponentModel.ComponentResourceManager(typeof(LocalizedForm));
        this.button1 = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.button1.Name = "button1";
        this.ClientSize = new System.Drawing.Size(400, 300);
        this.Controls.Add(this.button1);
        this.Size = (System.Drawing.Size)rm.GetObject("$this.Size");
        rm.ApplyResources(this.button1, "button1");
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button button1;
}
`;
    const doc = parseDesignerCs(src);
    assert.equal(doc.metadata.resourceVarName, 'rm');
    assert.ok(doc.metadata.resourceManagerStatement?.includes('ComponentResourceManager rm ='));
    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('ComponentResourceManager rm = new System.ComponentModel.ComponentResourceManager(typeof(LocalizedForm));'));
    assert.ok(gen1.includes('rm.ApplyResources(this.button1, "button1");'));
    assert.ok(gen1.includes('(System.Drawing.Size)rm.GetObject("$this.Size")'));
    // Ensure trailing rm.ApplyResources appears AFTER button1 config block
    assert.ok(gen1.indexOf('rm.ApplyResources') > gen1.indexOf('this.button1.Name = "button1";'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);

    // Clearing rawExpression still preserves custom resourceVarName (`rm`) and `castType`
    const resVal = doc.form.properties.Size;
    assert.ok(typeof resVal === 'object' && resVal !== null && resVal.kind === 'resource');
    assert.equal(resVal.castType, 'System.Drawing.Size');
    delete resVal.rawExpression;
    delete doc.form.rawPropertyExpressions?.Size;
    const genFromCast = generateDesignerCs(doc);
    assert.ok(genFromCast.includes('((System.Drawing.Size)(rm.GetObject("$this.Size")))'));
  });

  it('preserves multiple event handlers per event and original explicit delegate types', () => {
    const src = `namespace MultiEventApp;

partial class EventsForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.btn1 = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.btn1.Name = "btn1";
        this.btn1.Click += new System.EventHandler(this.btn1_ClickFirst);
        this.btn1.Click += new MyApp.CustomEventHandler(this.btn1_ClickSecond);
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Controls.Add(this.btn1);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btn1;
}
`;
    const doc = parseDesignerCs(src);
    const btn = doc.form.children[0];
    assert.equal(btn.eventSubscriptions?.length, 2);
    assert.equal(btn.eventSubscriptions![0].handlerName, 'btn1_ClickFirst');
    assert.equal(btn.eventSubscriptions![1].handlerName, 'btn1_ClickSecond');
    assert.equal(btn.eventSubscriptions![1].delegateType, 'MyApp.CustomEventHandler');

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('this.btn1.Click += new System.EventHandler(this.btn1_ClickFirst);'));
    assert.ok(gen1.includes('this.btn1.Click += new MyApp.CustomEventHandler(this.btn1_ClickSecond);'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('updates DataGridViewColumn type on explicitTypeChanged and preserves ListView ColumnHeader extra properties', () => {
    const src = `namespace ColumnsApp;

partial class ColumnsForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.dgv1 = new System.Windows.Forms.DataGridView();
        this.colName = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.lv1 = new System.Windows.Forms.ListView();
        this.lvCol1 = new System.Windows.Forms.ColumnHeader();
        ((System.ComponentModel.ISupportInitialize)(this.dgv1)).BeginInit();
        this.SuspendLayout();
        this.dgv1.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colName});
        this.dgv1.Name = "dgv1";
        this.colName.HeaderText = "Active";
        this.colName.Name = "colName";
        this.lv1.Columns.AddRange(new System.Windows.Forms.ColumnHeader[] {
            this.lvCol1});
        this.lv1.Name = "lv1";
        this.lvCol1.Text = "Amount";
        this.lvCol1.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;
        this.lvCol1.Width = 120;
        this.ClientSize = new System.Drawing.Size(500, 300);
        this.Controls.Add(this.dgv1);
        this.Controls.Add(this.lv1);
        ((System.ComponentModel.ISupportInitialize)(this.dgv1)).EndInit();
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.DataGridView dgv1;
    private System.Windows.Forms.DataGridViewTextBoxColumn colName;
    private System.Windows.Forms.ListView lv1;
    private System.Windows.Forms.ColumnHeader lvCol1;
}
`;
    const doc = parseDesignerCs(src);
    const dgv = doc.form.children.find((c) => c.name === 'dgv1')!;
    dgv.columns![0].columnType = 'DataGridViewCheckBoxColumn';
    dgv.columns![0].explicitTypeChanged = true;

    const lv = doc.form.children.find((c) => c.name === 'lv1')!;
    assert.deepEqual(lv.listViewColumns![0].properties?.TextAlign, {
      kind: 'enum',
      typeName: 'HorizontalAlignment',
      value: 'Right',
    });

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('this.colName = new System.Windows.Forms.DataGridViewCheckBoxColumn();'));
    assert.ok(gen1.includes('private System.Windows.Forms.DataGridViewCheckBoxColumn colName;'));
    assert.ok(gen1.includes('this.lvCol1.TextAlign = System.Windows.Forms.HorizontalAlignment.Right;'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('rejects duplicate control/field names cleanly instead of emitting broken C#', () => {
    const doc = parseDesignerCs('');
    doc.className = 'DupForm';
    doc.form.children = [
      { id: '1', name: 'btnDup', type: 'Button', properties: { Name: 'btnDup' }, events: {}, children: [] },
      { id: '2', name: 'btnDup', type: 'Label', properties: { Name: 'btnDup' }, events: {}, children: [] },
    ];
    assert.throws(() => generateDesignerCs(doc), /Duplicate control\/field name detected: "btnDup"/);
  });

  it('emits unhandled trailing statements after control and form configuration blocks', () => {
    const src = `namespace TrailingApp;

partial class TrailingForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.button1 = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.button1.Name = "button1";
        this.button1.Text = "Submit";
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Controls.Add(this.button1);
        var captionSnapshot = this.button1.Text;
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button button1;
}
`;
    const doc = parseDesignerCs(src);
    assert.deepEqual(doc.metadata.unhandledTrailingStatements, [
      'var captionSnapshot = this.button1.Text;',
    ]);
    const gen1 = generateDesignerCs(doc);
    const textAssignIdx = gen1.indexOf('this.button1.Text = "Submit";');
    const snapshotIdx = gen1.indexOf('var captionSnapshot = this.button1.Text;');
    const resumeIdx = gen1.indexOf('this.ResumeLayout(false);');
    assert.ok(snapshotIdx > textAssignIdx, 'Trailing statement must stay after button1.Text assignment');
    assert.ok(snapshotIdx < resumeIdx, 'Trailing statement must appear before ResumeLayout');
  });

  it('never emits Localizable into C# and never emits inherited controls while still detecting derived collisions', () => {
    const src = `namespace InheritApp;

partial class ChildForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.btnChild = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.btnChild.Location = new System.Drawing.Point(20, 100);
        this.btnChild.Name = "btnChild";
        this.btnChild.Size = new System.Drawing.Size(90, 28);
        this.btnChild.Text = "Child";
        this.ClientSize = new System.Drawing.Size(500, 350);
        this.Controls.Add(this.btnChild);
        this.Name = "ChildForm";
        this.Text = "Child";
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btnChild;
}
`;
    const doc = parseDesignerCs(src);
    doc.form.properties.Localizable = true;
    doc.form.children.unshift({
      id: 'panelBaseHeader',
      name: 'panelBaseHeader',
      type: 'Panel',
      fullTypeName: 'System.Windows.Forms.Panel',
      inherited: true,
      inheritedFrom: 'BaseDialogForm',
      properties: {
        Location: { kind: 'point', x: 0, y: 0 },
        Name: 'panelBaseHeader',
        Size: { kind: 'size', width: 500, height: 60 },
      },
      events: {},
      children: [
        {
          id: 'lblBaseTitle',
          name: 'lblBaseTitle',
          type: 'Label',
          fullTypeName: 'System.Windows.Forms.Label',
          inherited: true,
          inheritedFrom: 'BaseDialogForm',
          properties: { Name: 'lblBaseTitle', Text: 'Base Header' },
          events: {},
          children: [],
        },
      ],
    });
    doc.components.unshift({
      id: 'baseToolTip',
      name: 'baseToolTip',
      type: 'ToolTip',
      fullTypeName: 'System.Windows.Forms.ToolTip',
      isComponent: true,
      inherited: true,
      inheritedFrom: 'BaseDialogForm',
      properties: {},
      events: {},
      children: [],
    });

    const generated = generateDesignerCs(doc);
    assert.ok(!generated.includes('Localizable'), 'Localizable must never be emitted to C#');
    assert.ok(!generated.includes('panelBaseHeader'), 'Inherited panel must not be emitted');
    assert.ok(!generated.includes('lblBaseTitle'), 'Inherited child label must not be emitted');
    assert.ok(!generated.includes('baseToolTip'), 'Inherited component must not be emitted');
    assert.ok(generated.includes('this.btnChild = new System.Windows.Forms.Button();'));
    assert.ok(generated.includes('this.Controls.Add(this.btnChild);'));

    // Derived control colliding with an inherited field name MUST still throw
    const colliding = structuredClone(doc);
    colliding.form.children.push({
      id: 'dupBase',
      name: 'lblBaseTitle',
      type: 'Label',
      fullTypeName: 'System.Windows.Forms.Label',
      properties: { Name: 'lblBaseTitle', Text: 'Collision' },
      events: {},
      children: [],
    });
    assert.throws(
      () => generateDesignerCs(colliding),
      /Duplicate control\/field name detected: "lblBaseTitle"/
    );
  });
});
