import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { ensureEventHandlerInCodeBehind, parseCodeBehind } from '../../src/core';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MAIN_FORM_CS_PATH = path.join(REPO_ROOT, 'samples/OrderManagerDemo/MainForm.cs');

describe('codeBehind (parseCodeBehind & ensureEventHandlerInCodeBehind)', () => {
  it('parses real samples/OrderManagerDemo/MainForm.cs', () => {
    const src = fs.readFileSync(MAIN_FORM_CS_PATH, 'utf8');
    const info = parseCodeBehind(src);

    assert.equal(info.namespaceName, 'OrderManagerDemo');
    assert.equal(info.fileScopedNamespace, true);
    assert.equal(info.className, 'MainForm');
    assert.equal(info.baseType, 'Form');

    const names = info.methods.map((m) => m.name);
    assert.deepEqual(names, [
      'MainForm_Load',
      'btnApplyFilter_Click',
      'btnApprove_Click',
      'refreshTimer_Tick',
    ]);
    assert.ok(info.methods.every((m) => m.isEventHandlerLike));
    assert.equal(info.methods[0].line, 10);
  });

  it('locates existing event handler without modifying source', () => {
    const src = fs.readFileSync(MAIN_FORM_CS_PATH, 'utf8');
    const res = ensureEventHandlerInCodeBehind(src, {
      controlType: 'Button',
      eventName: 'Click',
      methodName: 'btnApprove_Click',
    });

    assert.equal(res.created, false);
    assert.equal(res.updatedSource, src);
    // Line 22 is `progressSync.Value = 100;` inside btnApprove_Click
    assert.equal(res.line, 22);
    assert.equal(res.column, 9);
  });

  it('inserts new event handler in file-scoped namespace with nullable enabled', () => {
    const src = fs.readFileSync(MAIN_FORM_CS_PATH, 'utf8');
    const res = ensureEventHandlerInCodeBehind(src, {
      controlType: 'DataGridView',
      eventName: 'CellContentClick',
      methodName: 'dgvOrders_CellContentClick',
      nullable: true,
    });

    assert.equal(res.created, true);
    assert.ok(
      res.updatedSource.includes(
        '    private void dgvOrders_CellContentClick(object? sender, DataGridViewCellEventArgs e)'
      )
    );
    // Verify cursor line/column points inside method body
    const lines = res.updatedSource.split('\n');
    assert.equal(lines[res.line - 2].trim(), '{');
    assert.equal(lines[res.line - 1], '        ');
    assert.equal(res.column, 9);

    // Re-parsing detects the newly inserted handler
    const info2 = parseCodeBehind(res.updatedSource);
    const added = info2.methods.find((m) => m.name === 'dgvOrders_CellContentClick');
    assert.ok(added);
    assert.equal(added.isEventHandlerLike, true);
  });

  it('inserts new event handler in block-scoped namespace with nullable disabled and CRLF', () => {
    const src = [
      'using System;',
      'using System.Windows.Forms;',
      '',
      'namespace LegacyApp',
      '{',
      '    public partial class LegacyControl : UserControl',
      '    {',
      '        public LegacyControl()',
      '        {',
      '            InitializeComponent();',
      '        }',
      '',
      '        private int HelperCompute(int x)',
      '        {',
      '            return x * 2;',
      '        }',
      '    }',
      '}',
      '',
    ].join('\r\n');

    const info = parseCodeBehind(src);
    assert.equal(info.namespaceName, 'LegacyApp');
    assert.equal(info.fileScopedNamespace, false);
    assert.equal(info.className, 'LegacyControl');
    assert.equal(info.baseType, 'UserControl');
    assert.equal(info.methods.length, 1);
    assert.equal(info.methods[0].name, 'HelperCompute');
    assert.equal(info.methods[0].isEventHandlerLike, false);

    const res = ensureEventHandlerInCodeBehind(src, {
      controlType: 'Button',
      eventName: 'MouseDown',
      methodName: 'btnTest_MouseDown',
      nullable: false,
    });

    assert.equal(res.created, true);
    assert.ok(res.updatedSource.includes('\r\n'));
    assert.ok(
      res.updatedSource.includes(
        '        private void btnTest_MouseDown(object sender, MouseEventArgs e)\r\n'
      )
    );
    assert.equal(res.column, 13);

    // Calling again finds it and does not duplicate
    const res2 = ensureEventHandlerInCodeBehind(res.updatedSource, {
      controlType: 'Button',
      eventName: 'MouseDown',
      methodName: 'btnTest_MouseDown',
      nullable: false,
    });
    assert.equal(res2.created, false);
    assert.equal(res2.updatedSource, res.updatedSource);
  });

  it('inserts event handler strictly INSIDE braces of a one-line class and qualifies EventArgs when usings are absent', () => {
    const oneLine = 'public partial class Form1 : System.Windows.Forms.Form { }';
    const res = ensureEventHandlerInCodeBehind(oneLine, {
      controlType: 'Button',
      eventName: 'MouseDown',
      methodName: 'button1_MouseDown',
      className: 'Form1',
      nullable: false,
    });

    assert.equal(res.created, true);
    const openIdx = res.updatedSource.indexOf('{');
    const methodIdx = res.updatedSource.indexOf('private void button1_MouseDown');
    const lastCloseIdx = res.updatedSource.lastIndexOf('}');
    assert.ok(methodIdx > openIdx && methodIdx < lastCloseIdx, 'Method must be inserted inside class braces');
    assert.ok(
      res.updatedSource.includes('(object sender, System.Windows.Forms.MouseEventArgs e)'),
      'EventArgs type must be fully qualified when using System.Windows.Forms is absent'
    );

    const parsed = parseCodeBehind(res.updatedSource);
    assert.ok(parsed.methods.some((m) => m.name === 'button1_MouseDown'));
  });

  it('selects matching partial class when multiple classes exist in code-behind', () => {
    const multiClass = [
      'using System;',
      '',
      'namespace MultiApp',
      '{',
      '    public class HelperModel',
      '    {',
      '        public string Name { get; set; } = "";',
      '    }',
      '',
      '    public partial class TargetForm : System.Windows.Forms.Form',
      '    {',
      '        public TargetForm()',
      '        {',
      '            InitializeComponent();',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    const res = ensureEventHandlerInCodeBehind(multiClass, {
      controlType: 'Button',
      eventName: 'Click',
      methodName: 'btnGo_Click',
      className: 'TargetForm',
      nullable: true,
    });
    assert.equal(res.created, true);
    const targetClassIdx = res.updatedSource.indexOf('partial class TargetForm');
    const handlerIdx = res.updatedSource.indexOf('private void btnGo_Click(object? sender, EventArgs e)');
    assert.ok(handlerIdx > targetClassIdx, 'Handler must be inserted inside TargetForm, not HelperModel');
  });
});
