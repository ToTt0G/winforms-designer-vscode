import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  decodeCSharpString,
  decodeDotNetDecimalBits,
  encodeCSharpString,
  extractExtenderValues,
  generateDesignerCs,
  parseDesignerCs,
  setExtenderValue,
  splitStatements,
  tokenizeCSharp,
} from '../../src/core';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const FORM1_PATH = path.join(REPO_ROOT, 'TestDesignFile/Form1.Designer.cs');
const ORDER_MANAGER_PATH = path.join(REPO_ROOT, 'samples/OrderManagerDemo/MainForm.Designer.cs');

describe('stringLiteral (encodeCSharpString / decodeCSharpString)', () => {
  it('decodes standard escape sequences including unicode and surrogates', () => {
    assert.equal(decodeCSharpString('"Hello\\nWorld\\r\\n\\t\\"quoted\\"\\\\slash\\\'apos\\0"'), 'Hello\nWorld\r\n\t"quoted"\\slash\'apos\0');
    assert.equal(decodeCSharpString('"\\a\\b\\f\\v"'), '\x07\b\f\v');
    assert.equal(decodeCSharpString('"\\x41\\x0042\\u00E9\\U0001F680"'), 'ABé🚀');
    assert.equal(decodeCSharpString('"\\x9Z"'), '\tZ');
  });

  it('decodes verbatim @"..." strings with doubled quotes and literal backslashes', () => {
    assert.equal(decodeCSharpString('@"C:\\Users\\Alice\\""Docs""\\file.txt"'), 'C:\\Users\\Alice\\"Docs"\\file.txt');
    assert.equal(decodeCSharpString('@"Line1\nLine2"'), 'Line1\nLine2');
  });

  it('decodes C# 11 single-line and multi-line raw string literals', () => {
    assert.equal(decodeCSharpString('"""Hello "World" \\n"""'), 'Hello "World" \\n');
    const multi = [
      '"""',
      '        First line',
      '            Indented line',
      '',
      '        Last line',
      '        """',
    ].join('\n');
    assert.equal(decodeCSharpString(multi), 'First line\n    Indented line\n\nLast line');
  });

  it('encodes strings preserving Unicode/emoji and escaping control characters', () => {
    assert.equal(encodeCSharpString('Order — Status • 🚀'), '"Order — Status • 🚀"');
    assert.equal(encodeCSharpString('A"B\\C\nD\r\t\0\x1F'), '"A\\"B\\\\C\\nD\\r\\t\\0\\u001F"');
    // Round-trip
    const tricky = 'Line 1\r\n"Quote" \\ path\t🎉\x01\u2028End';
    assert.equal(decodeCSharpString(encodeCSharpString(tricky)), tricky);
  });
});

describe('lexer (tokenizeCSharp & splitStatements)', () => {
  it('ignores fake comments inside strings and handles real comments', () => {
    const src = `
      // real comment with "fake string
      /* block comment
         still comment "not a string" */
      this.label1.Text = "http://example.com /* not comment */ // also not";
      this.label2.Text = @"C:\\path\\//still string";
    `;
    const tokens = tokenizeCSharp(src);
    const stmts = splitStatements(tokens, src);
    assert.equal(stmts.length, 2);
    assert.ok(stmts[0].text.includes('http://example.com /* not comment */ // also not'));
    assert.ok(stmts[1].text.includes('@"C:\\path\\//still string"'));
  });

  it('handles CRLF, LF, and bare CR line endings accurately', () => {
    const lf = 'a = 1;\nb = 2;\n';
    const crlf = 'a = 1;\r\nb = 2;\r\n';
    const cr = 'a = 1;\rb = 2;\r';
    for (const s of [lf, crlf, cr]) {
      const toks = tokenizeCSharp(s);
      const bTok = toks.find((t) => t.text === 'b');
      assert.ok(bTok);
      assert.equal(bTok.line, 2);
      assert.equal(bTok.column, 1);
    }
  });
});

describe('parser (parseDesignerCs)', () => {
  it('parses real TestDesignFile/Form1.Designer.cs', () => {
    const src = fs.readFileSync(FORM1_PATH, 'utf8');
    const doc = parseDesignerCs(src);

    assert.equal(doc.namespaceName, 'TestDesignFile');
    assert.equal(doc.fileScopedNamespace, false);
    assert.equal(doc.className, 'Form1');
    assert.equal(doc.baseType, 'Form');
    assert.equal(doc.form.id, '__form__');
    assert.equal(doc.form.properties.Text, 'Form1');
    assert.deepEqual(doc.form.properties.Size, { kind: 'size', width: 480, height: 400 });
    assert.equal(doc.form.children.length, 1);

    const lbl = doc.form.children[0];
    assert.equal(lbl.name, 'Label0');
    assert.equal(lbl.type, 'Label');
    assert.equal(lbl.properties.Text, 'Label01');
    assert.deepEqual(lbl.properties.Location, { kind: 'point', x: 132, y: 60 });
    assert.deepEqual(lbl.properties.Size, { kind: 'size', width: 108, height: 20 });
    assert.equal(lbl.properties.TabIndex, 0);
    assert.equal(doc.parseDiagnostics.length, 0);
    assert.ok(doc.metadata.initializeComponentRange);
    assert.ok(doc.metadata.fieldsRegionRange);
  });

  it('parses real samples/OrderManagerDemo/MainForm.Designer.cs completely', () => {
    const src = fs.readFileSync(ORDER_MANAGER_PATH, 'utf8');
    const doc = parseDesignerCs(src);

    assert.equal(doc.namespaceName, 'OrderManagerDemo');
    assert.equal(doc.fileScopedNamespace, true);
    assert.equal(doc.className, 'MainForm');
    assert.equal(doc.baseType, 'Form');
    assert.equal(doc.metadata.useThisQualifier, true);
    assert.equal(doc.metadata.useShorthandEvents, true);
    assert.equal(doc.metadata.usesContainerComponents, true);
    assert.equal(doc.metadata.hasSuspendResumeLayout, true);
    assert.equal(doc.parseDiagnostics.length, 0);

    // Top-level controls on form
    assert.deepEqual(
      doc.form.children.map((c) => c.name),
      ['splitMain', 'statusStrip1', 'toolStrip1', 'menuStrip1']
    );
    assert.equal(doc.form.events.Load, 'MainForm_Load');
    assert.equal(doc.form.properties.Text, 'Order Manager — Desktop Console');
    assert.deepEqual(doc.form.properties.ClientSize, { kind: 'size', width: 860, height: 530 });
    assert.deepEqual(doc.form.properties.AutoScaleDimensions, { kind: 'sizeF', width: 7, height: 15 });

    // MenuStrip with recursive DropDownItems
    const menuStrip = doc.form.children.find((c) => c.name === 'menuStrip1')!;
    assert.equal(menuStrip.stripItems?.length, 4);
    assert.equal(menuStrip.stripItems![0].name, 'fileToolStripMenuItem');
    assert.equal(menuStrip.stripItems![0].text, '&File');
    assert.equal(menuStrip.stripItems![0].dropDownItems?.length, 3);
    assert.equal(menuStrip.stripItems![0].dropDownItems![0].text, '&New Order');

    // ToolStrip & StatusStrip
    const toolStrip = doc.form.children.find((c) => c.name === 'toolStrip1')!;
    assert.equal(toolStrip.stripItems?.length, 4);
    assert.equal(toolStrip.stripItems![2].type, 'ToolStripSeparator');

    const statusStrip = doc.form.children.find((c) => c.name === 'statusStrip1')!;
    assert.equal(statusStrip.stripItems?.length, 2);
    assert.equal(statusStrip.stripItems![1].text, 'Production DB • Online');

    // SplitContainer Panel1 & Panel2 hierarchy
    const split = doc.form.children.find((c) => c.name === 'splitMain')!;
    assert.equal(split.children.length, 2);
    const grpFilters = split.children.find((c) => c.name === 'grpFilters')!;
    const tabWorkspace = split.children.find((c) => c.name === 'tabWorkspace')!;
    assert.equal(grpFilters.panelSlot, 'Panel1');
    assert.equal(tabWorkspace.panelSlot, 'Panel2');
    assert.deepEqual(split.properties['Panel1.Padding'], {
      kind: 'padding',
      all: 10,
      left: 10,
      top: 10,
      right: 10,
      bottom: 10,
    });

    // ComboBox Items + AnchorStyles + Color.FromArgb
    const cmbStatus = grpFilters.children.find((c) => c.name === 'cmbStatus')!;
    assert.deepEqual(cmbStatus.items, ['All Statuses', 'Pending Review', 'Approved', 'Shipped']);

    const btnApply = grpFilters.children.find((c) => c.name === 'btnApplyFilter')!;
    assert.deepEqual(btnApply.properties.Anchor, {
      kind: 'flags',
      typeName: 'AnchorStyles',
      values: ['Bottom', 'Left', 'Right'],
    });
    assert.deepEqual(btnApply.properties.BackColor, {
      kind: 'color',
      value: '#0078D4',
      a: 255,
      r: 0,
      g: 120,
      b: 212,
    });
    assert.equal(btnApply.events.Click, 'btnApplyFilter_Click');

    // TabControl -> TabPages -> DataGridView columns
    assert.deepEqual(
      tabWorkspace.children.map((t) => t.name),
      ['tabOrders', 'tabSummary']
    );
    const tabOrders = tabWorkspace.children[0];
    const dgv = tabOrders.children.find((c) => c.name === 'dgvOrders')!;
    assert.equal(dgv.columns?.length, 5);
    assert.equal(dgv.columns![0].name, 'colOrderId');
    assert.equal(dgv.columns![0].headerText, 'Order ID');
    assert.equal(dgv.columns![4].columnType, 'DataGridViewCheckBoxColumn');

    // Components (Timer, SaveFileDialog, ImageList)
    assert.deepEqual(
      doc.components.map((c) => c.name),
      ['refreshTimer', 'exportDialog', 'toolbarIcons']
    );
    assert.equal(doc.components[0].events.Tick, 'refreshTimer_Tick');
    assert.equal(doc.components[0].isComponent, true);
  });

  it('parses VS 2022/2026 style without this., target-typed new(), and explicit delegates', () => {
    const src = `using System;
using System.Drawing;
using System.Windows.Forms;

namespace ModernApp;

partial class ModernForm
{
    private System.ComponentModel.IContainer? components = null;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        btnSave = new();
        numPrice = new();
        SuspendLayout();
        // btnSave
        btnSave.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold | FontStyle.Italic, GraphicsUnit.Point, ((byte)(0)));
        btnSave.Location = new Point(12, 16);
        btnSave.Padding = new Padding(4, 2, 4, 2);
        btnSave.Size = new Size(100, 32);
        btnSave.Text = @"Save ""All""";
        btnSave.Click += new System.EventHandler(btnSave_Click);
        // numPrice
        numPrice.DecimalPlaces = 2;
        numPrice.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
        numPrice.Maximum = new decimal(new int[] { 10000, 0, 0, 0 });
        numPrice.Minimum = new decimal(new int[] { 250, 0, 0, -2147418112 });
        numPrice.Value = 42.75M;
        // ModernForm
        ClientSize = new Size(400, 300);
        Controls.AddRange(new Control[] { btnSave, numPrice });
        Text = "Modern";
        ResumeLayout(false);
    }
    #endregion

    internal Button btnSave;
    private NumericUpDown numPrice;
}
`;
    const doc = parseDesignerCs(src);
    assert.equal(doc.metadata.useThisQualifier, false);
    assert.equal(doc.metadata.useShorthandEvents, false);
    assert.deepEqual(doc.metadata.usingDirectives, [
      'using System;',
      'using System.Drawing;',
      'using System.Windows.Forms;',
    ]);

    const btn = doc.form.children[0];
    assert.equal(btn.name, 'btnSave');
    assert.equal(btn.type, 'Button');
    assert.equal(btn.fieldModifier, 'internal');
    assert.equal(btn.properties.Text, 'Save "All"');
    assert.deepEqual(btn.properties.Font, {
      kind: 'font',
      family: 'Segoe UI',
      size: 10.5,
      bold: true,
      italic: true,
      unit: 'Point',
      gdiCharSet: 0,
    });
    assert.deepEqual(btn.properties.Padding, {
      kind: 'padding',
      left: 4,
      top: 2,
      right: 4,
      bottom: 2,
    });
    assert.equal(btn.events.Click, 'btnSave_Click');

    const num = doc.form.children[1];
    assert.equal(num.type, 'NumericUpDown');
    assert.equal(num.properties.Increment, 0.5);
    assert.equal(num.properties.Maximum, 10000);
    assert.equal(num.properties.Minimum, -25);
    assert.equal(num.properties.Value, 42.75);
  });

  it('decodes .NET decimal int[4] bit patterns accurately', () => {
    assert.equal(decodeDotNetDecimalBits(100, 0, 0, 0), 100);
    assert.equal(decodeDotNetDecimalBits(5, 0, 0, 65536), 0.5);
    assert.equal(decodeDotNetDecimalBits(100, 0, 0, -2147483648), -100);
    assert.equal(decodeDotNetDecimalBits(12345, 0, 0, -2147352576), -123.45);
  });

  it('parses TableLayoutPanel styles, cells, column/row spans, resources, unknown controls & raw statements', () => {
    const resxXml = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="picLogo.Image" type="System.Resources.ResXFileRef, System.Windows.Forms">
    <value>assets\\logo.png;System.Drawing.Bitmap, System.Drawing</value>
  </data>
</root>`;

    const src = `namespace CustomApp
{
    partial class DashboardControl
    {
        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DashboardControl));
            this.tlpGrid = new System.Windows.Forms.TableLayoutPanel();
            this.chart1 = new ThirdParty.Charts.SparklineChart();
            this.picLogo = new System.Windows.Forms.PictureBox();
            this.tlpGrid.SuspendLayout();
            this.SuspendLayout();
            // tlpGrid
            this.tlpGrid.ColumnCount = 2;
            this.tlpGrid.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 40F));
            this.tlpGrid.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Absolute, 200F));
            this.tlpGrid.Controls.Add(this.chart1, 0, 0);
            this.tlpGrid.Controls.Add(this.picLogo, 1, 0);
            this.tlpGrid.SetColumnSpan(this.chart1, 2);
            this.tlpGrid.SetRowSpan(this.picLogo, 2);
            this.tlpGrid.RowCount = 2;
            this.tlpGrid.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.AutoSize));
            this.tlpGrid.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
            // chart1
            this.chart1.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(255)))), ((int)(((byte)(128)))), ((int)(((byte)(64)))));
            this.chart1.ForeColor = System.Drawing.SystemColors.Highlight;
            this.chart1.CustomProp = SomeHelper.Compute(1, 2);
            this.chart1.EnableAnimations(true);
            // picLogo
            this.picLogo.Image = ((System.Drawing.Image)(resources.GetObject("picLogo.Image")));
            // DashboardControl
            this.Controls.Add(this.tlpGrid);
            this.Name = "DashboardControl";
            this.Size = new System.Drawing.Size(600, 400);
            this.tlpGrid.ResumeLayout(false);
            this.ResumeLayout(false);
        }
        #endregion

        private System.Windows.Forms.TableLayoutPanel tlpGrid;
        public ThirdParty.Charts.SparklineChart chart1;
        private System.Windows.Forms.PictureBox picLogo;
    }
}
`;
    const doc = parseDesignerCs(src, { baseType: 'UserControl', resxXml });
    assert.equal(doc.baseType, 'UserControl');
    assert.equal(doc.metadata.usesComponentResourceManager, true);
    assert.ok(doc.resources['picLogo.Image']);

    const tlp = doc.form.children[0];
    assert.equal(tlp.type, 'TableLayoutPanel');
    assert.deepEqual(tlp.tableLayout, {
      columnStyles: [
        { sizeType: 'Percent', value: 40 },
        { sizeType: 'Absolute', value: 200 },
      ],
      rowStyles: [
        { sizeType: 'AutoSize', value: 0 },
        { sizeType: 'Percent', value: 100 },
      ],
    });

    const chart = tlp.children[0];
    assert.equal(chart.name, 'chart1');
    assert.equal(chart.type, 'SparklineChart');
    assert.equal(chart.fullTypeName, 'ThirdParty.Charts.SparklineChart');
    assert.equal(chart.isUnknownType, true);
    assert.equal(chart.fieldModifier, 'public');
    assert.deepEqual(chart.tableCell, { explicit: true, column: 0, row: 0, columnSpan: 2 });
    assert.deepEqual(chart.properties.BackColor, {
      kind: 'color',
      value: '#FF8040',
      a: 255,
      r: 255,
      g: 128,
      b: 64,
    });
    assert.deepEqual(chart.properties.ForeColor, {
      kind: 'color',
      value: 'Highlight',
      isSystem: true,
    });
    assert.deepEqual(chart.properties.CustomProp, {
      kind: 'raw',
      expression: 'SomeHelper.Compute(1, 2)',
    });
    assert.deepEqual(chart.rawStatements, ['this.chart1.EnableAnimations(true);']);

    const pic = tlp.children[1];
    assert.deepEqual(pic.tableCell, { explicit: true, column: 1, row: 0, rowSpan: 2 });
    assert.deepEqual(pic.properties.Image, {
      kind: 'resource',
      resourceName: 'picLogo.Image',
      resourceType: 'Image',
      relativePath: 'assets\\logo.png',
      castType: 'System.Drawing.Image',
      rawExpression: '((System.Drawing.Image)(resources.GetObject("picLogo.Image")))',
    });
  });

  it('produces diagnostics instead of throwing on malformed syntax', () => {
    const broken = `namespace Broken { partial class Form1 { private void InitializeComponent() { this.btn = new Button() } } }`;
    const doc = parseDesignerCs(broken);
    assert.equal(doc.className, 'Form1');
    assert.ok(doc.parseDiagnostics.length > 0);
  });

  it('parses ContextMenuStrip with nested DropDownItems & events, TabPages.Add, Font overloads, and 4-arg Color.FromArgb', () => {
    const src = `namespace RichApp;

partial class RichForm
{
    private System.ComponentModel.IContainer? components = null;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        this.ctxMenu = new System.Windows.Forms.ContextMenuStrip(this.components);
        this.mnuOpen = new System.Windows.Forms.ToolStripMenuItem();
        this.mnuRecent = new System.Windows.Forms.ToolStripMenuItem();
        this.mnuRecent1 = new System.Windows.Forms.ToolStripMenuItem();
        this.tabs = new System.Windows.Forms.TabControl();
        this.page1 = new System.Windows.Forms.TabPage();
        this.lbl1 = new System.Windows.Forms.Label();
        this.lbl2 = new System.Windows.Forms.Label();
        this.lbl3 = new System.Windows.Forms.Label();
        this.SuspendLayout();
        this.ctxMenu.Items.Add(this.mnuOpen);
        this.ctxMenu.Items.Add(this.mnuRecent);
        this.mnuOpen.Name = "mnuOpen";
        this.mnuOpen.Text = "Open";
        this.mnuOpen.Click += this.mnuOpen_Click;
        this.mnuRecent.DropDownItems.Add(this.mnuRecent1);
        this.mnuRecent.Name = "mnuRecent";
        this.mnuRecent.Text = "Recent";
        this.mnuRecent1.Name = "mnuRecent1";
        this.mnuRecent1.Text = "Doc1.txt";
        this.mnuRecent1.Click += new System.EventHandler(this.mnuRecent1_Click);
        this.tabs.TabPages.Add(this.page1);
        this.page1.Controls.Add(this.lbl1);
        this.page1.Controls.Add(this.lbl2);
        this.page1.Controls.Add(this.lbl3);
        this.lbl1.Font = new System.Drawing.Font("Consolas", 11F);
        this.lbl1.ForeColor = System.Drawing.Color.FromArgb(128, 10, 20, 30);
        this.lbl2.Font = new System.Drawing.Font("Arial", 10F, System.Drawing.FontStyle.Bold);
        this.lbl3.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Underline | System.Drawing.FontStyle.Strikeout, System.Drawing.GraphicsUnit.Pixel, ((byte)(0)), false);
        this.ClientSize = new System.Drawing.Size(500, 400);
        this.Controls.Add(this.tabs);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.ContextMenuStrip ctxMenu;
    private System.Windows.Forms.ToolStripMenuItem mnuOpen;
    private System.Windows.Forms.ToolStripMenuItem mnuRecent;
    private System.Windows.Forms.ToolStripMenuItem mnuRecent1;
    private System.Windows.Forms.TabControl tabs;
    private System.Windows.Forms.TabPage page1;
    private System.Windows.Forms.Label lbl1;
    private System.Windows.Forms.Label lbl2;
    private System.Windows.Forms.Label lbl3;
}
`;
    const doc = parseDesignerCs(src);
    assert.equal(doc.components.length, 1);
    const ctx = doc.components[0];
    assert.equal(ctx.name, 'ctxMenu');
    assert.equal(ctx.stripItems?.length, 2);
    assert.equal(ctx.stripItems![0].events.Click, 'mnuOpen_Click');
    assert.equal(ctx.stripItems![1].dropDownItems?.length, 1);
    assert.equal(ctx.stripItems![1].dropDownItems![0].events.Click, 'mnuRecent1_Click');

    const tabs = doc.form.children[0];
    assert.equal(tabs.children.length, 1);
    const [lbl1, lbl2, lbl3] = tabs.children[0].children;
    assert.deepEqual(lbl1.properties.Font, { kind: 'font', family: 'Consolas', size: 11, unit: 'Point' });
    assert.deepEqual(lbl1.properties.ForeColor, { kind: 'color', value: '#0A141E', a: 128, r: 10, g: 20, b: 30 });
    assert.deepEqual(lbl2.properties.Font, { kind: 'font', family: 'Arial', size: 10, bold: true, unit: 'Point' });
    assert.deepEqual(lbl3.properties.Font, {
      kind: 'font',
      family: 'Segoe UI',
      size: 9,
      underline: true,
      strikeout: true,
      unit: 'Pixel',
      gdiCharSet: 0,
    });
  });

  it('handles missing #endregion with no fields yet, multi-declarator fields, and global:: prefixes', () => {
    const noEndRegion = `namespace BareApp;

partial class BareForm
{
    private void InitializeComponent()
    {
        this.SuspendLayout();
        this.ClientSize = new global::System.Drawing.Size(400, 300);
        this.Name = "BareForm";
        this.Text = "Bare";
        this.ResumeLayout(false);
    }
}
`;
    const doc = parseDesignerCs(noEndRegion);
    assert.ok(doc.metadata.fieldsRegionRange, 'fieldsRegionRange must fall back before class close brace');
    assert.equal(doc.metadata.fieldsRegionRange!.start, doc.metadata.fieldsRegionRange!.end);
    assert.deepEqual(doc.form.properties.ClientSize, { kind: 'size', width: 400, height: 300 });

    // Adding a brand-new button inserts its field declaration cleanly before `}`
    doc.form.children.push({
      id: 'btnNew',
      name: 'btnNew',
      type: 'Button',
      fullTypeName: 'System.Windows.Forms.Button',
      properties: {
        Location: { kind: 'point', x: 16, y: 16 },
        Name: 'btnNew',
        Size: { kind: 'size', width: 90, height: 28 },
        Text: 'Go',
      },
      events: {},
      children: [],
    });
    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('private System.Windows.Forms.Button btnNew;'));
    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);

    // Multi-declarator fields + global:: everywhere
    const multiDecl = `namespace GlobalApp;

partial class GlobalForm : global::System.Windows.Forms.Form
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.button1 = new global::System.Windows.Forms.Button();
        this.button2 = new global::System.Windows.Forms.Button();
        this.SuspendLayout();
        this.button1.Anchor = ((global::System.Windows.Forms.AnchorStyles)((global::System.Windows.Forms.AnchorStyles.Top | global::System.Windows.Forms.AnchorStyles.Right)));
        this.button1.BackColor = global::System.Drawing.Color.FromArgb(10, 20, 30);
        this.button1.Cursor = global::System.Windows.Forms.Cursors.Hand;
        this.button1.Location = new global::System.Drawing.Point(12, 14);
        this.button1.Name = "button1";
        this.button1.Text = global::System.String.Empty;
        this.button2.Location = new global::System.Drawing.Point(12, 50);
        this.button2.Name = "button2";
        this.button2.Text = "Second";
        this.ClientSize = new global::System.Drawing.Size(300, 200);
        this.Controls.Add(this.button1);
        this.Controls.Add(this.button2);
        this.ResumeLayout(false);
    }
    #endregion

    private global::System.Windows.Forms.Button button1, button2;
}
`;
    const gDoc = parseDesignerCs(multiDecl);
    assert.equal(gDoc.baseType, 'Form');
    assert.ok(gDoc.metadata.existingFieldDeclarations.button1);
    assert.ok(gDoc.metadata.existingFieldDeclarations.button2);
    assert.equal(gDoc.form.children.length, 2);
    const b1 = gDoc.form.children[0];
    assert.deepEqual(b1.properties.Anchor, { kind: 'flags', typeName: 'AnchorStyles', values: ['Top', 'Right'] });
    assert.deepEqual(b1.properties.BackColor, { kind: 'color', value: '#0A141E', a: 255, r: 10, g: 20, b: 30 });
    assert.deepEqual(b1.properties.Cursor, { kind: 'enum', typeName: 'Cursors', value: 'Hand' });
    assert.deepEqual(b1.properties.Location, { kind: 'point', x: 12, y: 14 });
    assert.equal(b1.properties.Text, '');
  });

  it('parses TreeView.Nodes hierarchy, ShortcutKeys bitwise Keys, Cursors, TextBox.Lines, FlatAppearance, Panel1/Panel2, SetChildIndex, and extender helpers', () => {
    const src = `namespace VsEdgeApp;

partial class VsEdgeForm
{
    private System.ComponentModel.IContainer? components = null;

    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        System.Windows.Forms.TreeNode treeNode1 = new System.Windows.Forms.TreeNode("Leaf A");
        System.Windows.Forms.TreeNode treeNode2 = new System.Windows.Forms.TreeNode("Leaf B");
        System.Windows.Forms.TreeNode treeNode3 = new System.Windows.Forms.TreeNode("Root", new System.Windows.Forms.TreeNode[] {
            treeNode1,
            treeNode2});
        this.treeView1 = new System.Windows.Forms.TreeView();
        this.menuStrip1 = new System.Windows.Forms.MenuStrip();
        this.saveToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.textBox1 = new System.Windows.Forms.TextBox();
        this.button1 = new System.Windows.Forms.Button();
        this.split1 = new System.Windows.Forms.SplitContainer();
        this.toolTip1 = new System.Windows.Forms.ToolTip(this.components);
        this.errorProvider1 = new System.Windows.Forms.ErrorProvider(this.components);
        ((System.ComponentModel.ISupportInitialize)(this.split1)).BeginInit();
        ((System.ComponentModel.ISupportInitialize)(this.errorProvider1)).BeginInit();
        this.menuStrip1.SuspendLayout();
        this.split1.Panel1.SuspendLayout();
        this.split1.Panel2.SuspendLayout();
        this.split1.SuspendLayout();
        this.SuspendLayout();
        // treeView1
        treeNode1.Name = "NodeLeafA";
        treeNode1.Text = "Leaf A";
        treeNode2.Name = "NodeLeafB";
        treeNode2.Text = "Leaf B";
        treeNode3.Name = "NodeRoot";
        treeNode3.Text = "Root";
        this.treeView1.Nodes.AddRange(new System.Windows.Forms.TreeNode[] {
            treeNode3});
        this.treeView1.Nodes.Add("Quick Node");
        this.treeView1.Name = "treeView1";
        // menuStrip1
        this.menuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.saveToolStripMenuItem});
        this.menuStrip1.Name = "menuStrip1";
        // saveToolStripMenuItem
        this.saveToolStripMenuItem.Name = "saveToolStripMenuItem";
        this.saveToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)(((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.Shift) | System.Windows.Forms.Keys.S)));
        this.saveToolStripMenuItem.Text = "&Save";
        // textBox1
        this.textBox1.Lines = new string[] {
            "Line 1",
            "Line 2"};
        this.textBox1.Multiline = true;
        this.textBox1.Name = "textBox1";
        // button1
        this.button1.Cursor = System.Windows.Forms.Cursors.Hand;
        this.button1.FlatAppearance.BorderColor = System.Drawing.Color.SteelBlue;
        this.button1.FlatAppearance.BorderSize = 2;
        this.button1.FlatAppearance.MouseDownBackColor = System.Drawing.Color.DodgerBlue;
        this.button1.FlatAppearance.MouseOverBackColor = System.Drawing.Color.LightBlue;
        this.button1.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
        this.button1.Name = "button1";
        this.button1.Text = "Click Me";
        // split1
        this.split1.Name = "split1";
        this.split1.Panel1.AutoScroll = true;
        this.split1.Panel1.BackColor = System.Drawing.Color.White;
        this.split1.Panel1.Padding = new System.Windows.Forms.Padding(8);
        this.split1.Panel2.BackColor = System.Drawing.SystemColors.ControlLight;
        this.split1.Panel1.Controls.Add(this.treeView1);
        this.split1.Panel2.Controls.Add(this.textBox1);
        this.split1.Panel2.Controls.Add(this.button1);
        // toolTip1
        this.toolTip1.SetToolTip(this.button1, "Runs action");
        // errorProvider1
        this.errorProvider1.SetError(this.textBox1, "Required field");
        // VsEdgeForm
        this.ClientSize = new System.Drawing.Size(700, 450);
        this.Controls.Add(this.menuStrip1);
        this.Controls.Add(this.split1);
        this.Controls.SetChildIndex(this.split1, 0);
        this.Name = "VsEdgeForm";
        this.menuStrip1.ResumeLayout(false);
        this.menuStrip1.PerformLayout();
        this.split1.Panel1.ResumeLayout(false);
        this.split1.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.split1)).EndInit();
        this.split1.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.errorProvider1)).EndInit();
        this.ResumeLayout(false);
        this.PerformLayout();
    }
    #endregion

    private System.Windows.Forms.TreeView treeView1;
    private System.Windows.Forms.MenuStrip menuStrip1;
    private System.Windows.Forms.ToolStripMenuItem saveToolStripMenuItem;
    private System.Windows.Forms.TextBox textBox1;
    private System.Windows.Forms.Button button1;
    private System.Windows.Forms.SplitContainer split1;
    private System.Windows.Forms.ToolTip toolTip1;
    private System.Windows.Forms.ErrorProvider errorProvider1;
}
`;
    const doc = parseDesignerCs(src);
    assert.equal(doc.parseDiagnostics.length, 0);
    assert.equal(doc.metadata.unhandledTopLevelStatements.length, 0, 'TreeNode local vars must not duplicate in unhandledTopLevelStatements');

    // SetChildIndex moved split1 to index 0 ahead of menuStrip1
    assert.deepEqual(
      doc.form.children.map((c) => c.name),
      ['split1', 'menuStrip1']
    );

    const split = doc.form.children[0];
    assert.equal(split.properties['Panel1.AutoScroll'], true);
    assert.deepEqual(split.properties['Panel1.BackColor'], { kind: 'color', value: 'White', isNamed: true });
    assert.deepEqual(split.properties['Panel1.Padding'], { kind: 'padding', all: 8, left: 8, top: 8, right: 8, bottom: 8 });
    assert.deepEqual(split.properties['Panel2.BackColor'], { kind: 'color', value: 'ControlLight', isSystem: true });

    const tv = split.children.find((c) => c.name === 'treeView1')!;
    assert.equal(tv.treeNodes?.length, 2);
    assert.equal(tv.treeNodes![0].name, 'NodeRoot');
    assert.equal(tv.treeNodes![0].text, 'Root');
    assert.equal(tv.treeNodes![0].children?.length, 2);
    assert.equal(tv.treeNodes![0].children![0].text, 'Leaf A');
    assert.equal(tv.treeNodes![0].children![1].name, 'NodeLeafB');
    assert.equal(tv.treeNodes![1].text, 'Quick Node');

    const menuStrip = doc.form.children[1];
    assert.deepEqual(menuStrip.stripItems![0].properties.ShortcutKeys, {
      kind: 'flags',
      typeName: 'Keys',
      values: ['Control', 'Shift', 'S'],
    });

    const tb = split.children.find((c) => c.name === 'textBox1')!;
    assert.deepEqual(tb.properties.Lines, {
      kind: 'raw',
      expression: 'new string[] { "Line 1", "Line 2" }',
    });

    const btn = split.children.find((c) => c.name === 'button1')!;
    assert.deepEqual(btn.properties.Cursor, { kind: 'enum', typeName: 'Cursors', value: 'Hand' });
    assert.equal(btn.properties['FlatAppearance.BorderSize'], 2);
    assert.deepEqual(btn.properties['FlatAppearance.BorderColor'], { kind: 'color', value: 'SteelBlue', isNamed: true });
    assert.deepEqual(btn.properties['FlatAppearance.MouseOverBackColor'], { kind: 'color', value: 'LightBlue', isNamed: true });
    assert.deepEqual(btn.properties['FlatAppearance.MouseDownBackColor'], { kind: 'color', value: 'DodgerBlue', isNamed: true });

    // Extender extraction & update helpers
    const extenders = extractExtenderValues(doc);
    assert.equal(extenders.length, 2);
    assert.deepEqual(extenders[0], {
      providerName: 'toolTip1',
      providerType: 'ToolTip',
      methodName: 'SetToolTip',
      targetControlName: 'button1',
      value: 'Runs action',
    });
    assert.deepEqual(extenders[1], {
      providerName: 'errorProvider1',
      providerType: 'ErrorProvider',
      methodName: 'SetError',
      targetControlName: 'textBox1',
      value: 'Required field',
    });

    assert.equal(setExtenderValue(doc, 'toolTip1', 'SetToolTip', 'button1', 'Updated tip'), true);
    assert.equal(extractExtenderValues(doc)[0].value, 'Updated tip');
  });

  it('marks expression-bodied InitializeComponent() and #if directives as read-only', () => {
    const exprBodied = `namespace ExprApp;
partial class ExprForm
{
    private void InitializeComponent() => this.Text = "Inline";
}
`;
    const doc1 = parseDesignerCs(exprBodied);
    assert.ok(doc1.metadata.readOnlyReason, 'Expression-bodied InitializeComponent must set readOnlyReason');
    assert.equal(doc1.metadata.initializeComponentRange, undefined);
    assert.throws(() => generateDesignerCs(doc1), /Cannot generate designer code/);

    const withIfDef = `namespace CondApp;
partial class CondForm
{
    private void InitializeComponent()
    {
        this.SuspendLayout();
#if DEBUG
        this.Text = "Debug";
#else
        this.Text = "Release";
#endif
        this.ResumeLayout(false);
    }
}
`;
    const doc2 = parseDesignerCs(withIfDef);
    assert.ok(doc2.metadata.readOnlyReason, '#if inside InitializeComponent must set readOnlyReason');
    assert.match(doc2.metadata.readOnlyReason!, /conditional compilation/i);
    assert.ok(doc2.parseDiagnostics.some((d) => d.severity === 'warning'));
    assert.throws(() => generateDesignerCs(doc2), /conditional compilation/i);
  });

  it('parses 0xF1FF hex, preserves narrowing (int)0.75, 0.25F float, custom char, and high-precision decimal accurately', () => {
    const src = `namespace LiteralApp;

partial class LiteralForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.custom1 = new Acme.CustomCtrl();
        this.num1 = new System.Windows.Forms.NumericUpDown();
        this.txtPwd = new System.Windows.Forms.TextBox();
        this.SuspendLayout();
        this.custom1.Mask = 0xF1FF;
        this.custom1.Narrowed = (int)0.75;
        this.custom1.ScaleFactor = 0.25F;
        this.custom1.Delimiter = 'A';
        this.custom1.Name = "custom1";
        this.num1.Maximum = new decimal(new int[] { -1, -1, -1, 0 });
        this.num1.Name = "num1";
        this.txtPwd.Name = "txtPwd";
        this.txtPwd.PasswordChar = '*';
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Controls.Add(this.custom1);
        this.Controls.Add(this.num1);
        this.Controls.Add(this.txtPwd);
        this.Opacity = 0.85;
        this.ResumeLayout(false);
    }
    #endregion

    private Acme.CustomCtrl custom1;
    private System.Windows.Forms.NumericUpDown num1;
    private System.Windows.Forms.TextBox txtPwd;
}
`;
    const doc = parseDesignerCs(src);
    const custom = doc.form.children[0];
    assert.equal(custom.properties.Mask, 0xf1ff);
    assert.equal(custom.properties.Mask, 61951);
    assert.deepEqual(custom.properties.Narrowed, { kind: 'raw', expression: '(int)0.75' });
    assert.equal(custom.properties.ScaleFactor, 0.25);
    assert.equal(custom.rawPropertyExpressions?.ScaleFactor, '0.25F');
    assert.deepEqual(custom.properties.Delimiter, { kind: 'raw', expression: "'A'" });

    const num = doc.form.children[1];
    assert.deepEqual(num.properties.Maximum, {
      kind: 'raw',
      expression: 'new decimal(new int[] { -1, -1, -1, 0 })',
    });

    const pwd = doc.form.children[2];
    assert.equal(pwd.properties.PasswordChar, '*');

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('this.custom1.Mask = 0xF1FF;'));
    assert.ok(gen1.includes('this.custom1.Narrowed = (int)0.75;'));
    assert.ok(gen1.includes('this.custom1.ScaleFactor = 0.25F;'));
    assert.ok(gen1.includes("this.custom1.Delimiter = 'A';"));
    assert.ok(gen1.includes('this.num1.Maximum = new decimal(new int[] { -1, -1, -1, 0 });'));
    assert.ok(gen1.includes("this.txtPwd.PasswordChar = '*';"));
    assert.ok(gen1.includes('this.Opacity = 0.85;'));

    // Double round-trip idempotency
    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('preserves TableLayoutPanel 1-arg Controls.Add implicit placement and SetColumnSpan without fabricating (0, 0)', () => {
    const src = `namespace TlpImplicitApp;

partial class TlpForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.tlp = new System.Windows.Forms.TableLayoutPanel();
        this.btnAuto = new System.Windows.Forms.Button();
        this.btnPinned = new System.Windows.Forms.Button();
        this.tlp.SuspendLayout();
        this.SuspendLayout();
        this.tlp.ColumnCount = 2;
        this.tlp.Controls.Add(this.btnAuto);
        this.tlp.SetColumnSpan(this.btnAuto, 2);
        this.tlp.Controls.Add(this.btnPinned, 1, 1);
        this.tlp.RowCount = 2;
        this.btnAuto.Name = "btnAuto";
        this.btnPinned.Name = "btnPinned";
        this.Controls.Add(this.tlp);
        this.tlp.ResumeLayout(false);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.TableLayoutPanel tlp;
    private System.Windows.Forms.Button btnAuto;
    private System.Windows.Forms.Button btnPinned;
}
`;
    const doc = parseDesignerCs(src);
    const tlp = doc.form.children[0];
    const autoChild = tlp.children.find((c) => c.name === 'btnAuto')!;
    const pinnedChild = tlp.children.find((c) => c.name === 'btnPinned')!;

    assert.deepEqual(autoChild.tableCell, { explicit: false, columnSpan: 2 });
    assert.equal(autoChild.tableCell?.column, undefined);
    assert.equal(autoChild.tableCell?.row, undefined);
    assert.deepEqual(pinnedChild.tableCell, { explicit: true, column: 1, row: 1 });

    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('this.tlp.Controls.Add(this.btnAuto);'));
    assert.ok(!gen1.includes('this.tlp.Controls.Add(this.btnAuto, 0, 0);'));
    assert.ok(gen1.includes('this.tlp.SetColumnSpan(this.btnAuto, 2);'));
    assert.ok(gen1.includes('this.tlp.Controls.Add(this.btnPinned, 1, 1);'));

    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });
});
