import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditDesignDocument,
  FORM_TEMPLATES,
  generateDesignerCs,
  parseCodeBehind,
  parseDesignerCs,
  scaffoldFormFiles,
  type FormTemplateId,
} from '../../src/core';

describe('scaffold (scaffoldFormFiles)', () => {
  it('scaffolds a file-scoped nullable Form that parses and round-trips cleanly', () => {
    const { codeBehind, designer } = scaffoldFormFiles({
      className: 'InvoiceForm',
      namespaceName: 'Contoso.Billing',
      baseType: 'Form',
      fileScopedNamespace: true,
      nullable: true,
      eol: '\r\n',
    });

    assert.ok(codeBehind.includes('namespace Contoso.Billing;\r\n'));
    assert.ok(codeBehind.includes('public partial class InvoiceForm : System.Windows.Forms.Form'));
    assert.ok(designer.includes('private System.ComponentModel.IContainer? components = null;'));

    const cbInfo = parseCodeBehind(codeBehind);
    assert.equal(cbInfo.className, 'InvoiceForm');
    assert.equal(cbInfo.baseType, 'Form');
    assert.equal(cbInfo.namespaceName, 'Contoso.Billing');
    assert.equal(cbInfo.fileScopedNamespace, true);

    const doc = parseDesignerCs(designer);
    assert.equal(doc.className, 'InvoiceForm');
    assert.equal(doc.baseType, 'Form');
    assert.equal(doc.parseDiagnostics.length, 0);
    assert.deepEqual(doc.form.properties.ClientSize, { kind: 'size', width: 800, height: 450 });

    // Adding a control to a freshly scaffolded form inserts the field cleanly
    doc.form.children.push({
      id: 'button1',
      name: 'button1',
      type: 'Button',
      fullTypeName: 'System.Windows.Forms.Button',
      properties: {
        Location: { kind: 'point', x: 24, y: 24 },
        Name: 'button1',
        Size: { kind: 'size', width: 96, height: 29 },
        Text: 'Create',
      },
      events: {},
      children: [],
    });
    const gen1 = generateDesignerCs(doc);
    assert.ok(gen1.includes('private System.Windows.Forms.Button button1;'));
    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });

  it('scaffolds a block-scoped non-nullable UserControl with LF endings', () => {
    const { codeBehind, designer } = scaffoldFormFiles({
      className: 'AddressEditor',
      namespaceName: 'Contoso.Controls',
      baseType: 'UserControl',
      fileScopedNamespace: false,
      nullable: false,
      eol: '\n',
    });

    assert.ok(!codeBehind.includes('\r\n'));
    assert.ok(!designer.includes('\r\n'));
    assert.ok(codeBehind.includes('namespace Contoso.Controls\n{'));
    assert.ok(codeBehind.includes('public partial class AddressEditor : System.Windows.Forms.UserControl'));
    assert.ok(designer.includes('private System.ComponentModel.IContainer components = null;'));

    const cbInfo = parseCodeBehind(codeBehind);
    assert.equal(cbInfo.baseType, 'UserControl');
    assert.equal(cbInfo.fileScopedNamespace, false);

    const doc = parseDesignerCs(designer, { baseType: 'UserControl' });
    assert.equal(doc.className, 'AddressEditor');
    assert.equal(doc.baseType, 'UserControl');
    assert.deepEqual(doc.form.properties.Size, { kind: 'size', width: 400, height: 300 });
    assert.equal(doc.parseDiagnostics.length, 0);
  });

  it('scaffolds all 6 starter templates cleanly with zero diagnostics, zero audit issues, and double round-trip idempotency', () => {
    const expectedTemplates: FormTemplateId[] = [
      'blank',
      'dialog',
      'master-detail',
      'settings',
      'login',
      'dashboard',
    ];
    assert.deepEqual(
      FORM_TEMPLATES.map((t) => t.id),
      expectedTemplates
    );

    for (const template of expectedTemplates) {
      const className = `Sample_${template.replace('-', '_')}_Form`;
      const { codeBehind, designer } = scaffoldFormFiles({
        className,
        namespaceName: 'Contoso.Templates',
        baseType: 'Form',
        fileScopedNamespace: true,
        nullable: true,
        eol: '\n',
        template,
      });

      const cb = parseCodeBehind(codeBehind);
      assert.equal(cb.className, className);
      assert.equal(cb.baseType, 'Form');

      const doc1 = parseDesignerCs(designer);
      assert.equal(doc1.parseDiagnostics.length, 0, `Template ${template} had parse diagnostics`);
      assert.equal(doc1.className, className);

      // Every starter template must pass layout & accessibility audit cleanly!
      const auditIssues = auditDesignDocument(doc1);
      assert.deepEqual(
        auditIssues,
        [],
        `Template ${template} had audit issues: ${JSON.stringify(auditIssues)}`
      );

      // Double round-trip idempotency
      const gen1 = generateDesignerCs(doc1);
      const doc2 = parseDesignerCs(gen1);
      const gen2 = generateDesignerCs(doc2);
      assert.equal(gen2, gen1, `Template ${template} failed double round-trip idempotency`);
    }

    // Spot-check key template structures & non-nullable block-scoped option
    const loginBlock = scaffoldFormFiles({
      className: 'SignInForm',
      namespaceName: 'LegacyApp',
      baseType: 'Form',
      fileScopedNamespace: false,
      nullable: false,
      template: 'login',
    });
    assert.ok(loginBlock.designer.includes('private System.ComponentModel.IContainer components = null;'));
    assert.ok(loginBlock.designer.includes('UseSystemPasswordChar = true;'));
    assert.ok(loginBlock.designer.includes('this.AcceptButton = this.buttonSignIn;'));
    assert.ok(loginBlock.designer.includes('this.CancelButton = this.buttonCancel;'));

    const mdDoc = parseDesignerCs(
      scaffoldFormFiles({
        className: 'BrowserForm',
        namespaceName: 'App',
        baseType: 'Form',
        template: 'master-detail',
      }).designer
    );
    const split = mdDoc.form.children.find((c) => c.type === 'SplitContainer')!;
    assert.ok(split);
    const tv = split.children.find((c) => c.type === 'TreeView')!;
    assert.ok(tv.treeNodes && tv.treeNodes.length > 0);
  });

  it('preserves global namespace (empty namespaceName) and qualifies System.Windows.Forms.Form', () => {
    const { codeBehind, designer } = scaffoldFormFiles({
      className: 'GlobalForm',
      namespaceName: '',
      baseType: 'Form',
      fileScopedNamespace: true,
      nullable: false,
      eol: '\n',
    });

    assert.ok(!codeBehind.includes('namespace '), 'Global namespace must not emit namespace statement');
    assert.ok(!designer.includes('namespace '), 'Global namespace designer must not emit namespace statement');
    assert.ok(codeBehind.includes('public partial class GlobalForm : System.Windows.Forms.Form'));

    const doc = parseDesignerCs(designer);
    assert.equal(doc.namespaceName, '');
    assert.equal(doc.className, 'GlobalForm');
    assert.equal(doc.parseDiagnostics.length, 0);

    const gen1 = generateDesignerCs(doc);
    const gen2 = generateDesignerCs(parseDesignerCs(gen1));
    assert.equal(gen2, gen1);
  });
});
