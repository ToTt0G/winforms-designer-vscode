import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditDesignDocument, parseDesignerCs } from '../../src/core';

describe('auditor (auditDesignDocument)', () => {
  it('detects overlapping non-docked sibling controls without false positives on touching edges or separate SplitContainer panels', () => {
    const src = `namespace AuditApp;

partial class OverlapForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.btnA = new System.Windows.Forms.Button();
        this.btnB = new System.Windows.Forms.Button();
        this.btnTouching = new System.Windows.Forms.Button();
        this.split1 = new System.Windows.Forms.SplitContainer();
        this.leftBtn = new System.Windows.Forms.Button();
        this.rightBtn = new System.Windows.Forms.Button();
        ((System.ComponentModel.ISupportInitialize)(this.split1)).BeginInit();
        this.split1.Panel1.SuspendLayout();
        this.split1.Panel2.SuspendLayout();
        this.split1.SuspendLayout();
        this.SuspendLayout();
        this.btnA.Location = new System.Drawing.Point(20, 20);
        this.btnA.Name = "btnA";
        this.btnA.Size = new System.Drawing.Size(100, 30);
        this.btnA.TabIndex = 0;
        this.btnA.Text = "A";
        this.btnB.Location = new System.Drawing.Point(80, 35);
        this.btnB.Name = "btnB";
        this.btnB.Size = new System.Drawing.Size(100, 30);
        this.btnB.TabIndex = 1;
        this.btnB.Text = "B";
        this.btnTouching.Location = new System.Drawing.Point(180, 35);
        this.btnTouching.Name = "btnTouching";
        this.btnTouching.Size = new System.Drawing.Size(100, 30);
        this.btnTouching.TabIndex = 2;
        this.btnTouching.Text = "Touching";
        this.split1.Location = new System.Drawing.Point(20, 100);
        this.split1.Name = "split1";
        this.split1.Size = new System.Drawing.Size(400, 200);
        this.split1.SplitterDistance = 200;
        this.split1.TabIndex = 3;
        this.split1.Panel1.Controls.Add(this.leftBtn);
        this.split1.Panel2.Controls.Add(this.rightBtn);
        this.leftBtn.Location = new System.Drawing.Point(10, 10);
        this.leftBtn.Name = "leftBtn";
        this.leftBtn.Size = new System.Drawing.Size(80, 28);
        this.leftBtn.TabIndex = 0;
        this.leftBtn.Text = "Left";
        this.rightBtn.Location = new System.Drawing.Point(10, 10);
        this.rightBtn.Name = "rightBtn";
        this.rightBtn.Size = new System.Drawing.Size(80, 28);
        this.rightBtn.TabIndex = 0;
        this.rightBtn.Text = "Right";
        this.ClientSize = new System.Drawing.Size(500, 350);
        this.Controls.Add(this.btnA);
        this.Controls.Add(this.btnB);
        this.Controls.Add(this.btnTouching);
        this.Controls.Add(this.split1);
        this.split1.Panel1.ResumeLayout(false);
        this.split1.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.split1)).EndInit();
        this.split1.ResumeLayout(false);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btnA;
    private System.Windows.Forms.Button btnB;
    private System.Windows.Forms.Button btnTouching;
    private System.Windows.Forms.SplitContainer split1;
    private System.Windows.Forms.Button leftBtn;
    private System.Windows.Forms.Button rightBtn;
}
`;
    const issues = auditDesignDocument(parseDesignerCs(src));
    const overlaps = issues.filter((i) => i.code === 'overlapping-controls');
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0].controlName, 'btnB');
    assert.equal(overlaps[0].relatedControlName, 'btnA');
  });

  it('detects out-of-bounds controls, duplicate TabIndex, missing FixedDialog buttons, and missing accessible text', () => {
    const src = `namespace AuditApp;

partial class DialogIssuesForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.btnIconOnly = new System.Windows.Forms.Button();
        this.btnAccessibleIcon = new System.Windows.Forms.Button();
        this.chkEmpty = new System.Windows.Forms.CheckBox();
        this.txtOutside = new System.Windows.Forms.TextBox();
        this.SuspendLayout();
        this.btnIconOnly.Location = new System.Drawing.Point(10, 10);
        this.btnIconOnly.Name = "btnIconOnly";
        this.btnIconOnly.Size = new System.Drawing.Size(32, 32);
        this.btnIconOnly.TabIndex = 1;
        this.btnIconOnly.Text = "";
        this.btnAccessibleIcon.AccessibleName = "Refresh";
        this.btnAccessibleIcon.Location = new System.Drawing.Point(50, 10);
        this.btnAccessibleIcon.Name = "btnAccessibleIcon";
        this.btnAccessibleIcon.Size = new System.Drawing.Size(32, 32);
        this.btnAccessibleIcon.TabIndex = 1;
        this.btnAccessibleIcon.Text = "";
        this.chkEmpty.Location = new System.Drawing.Point(10, 60);
        this.chkEmpty.Name = "chkEmpty";
        this.chkEmpty.Size = new System.Drawing.Size(20, 20);
        this.chkEmpty.TabIndex = 2;
        this.txtOutside.Location = new System.Drawing.Point(250, 10);
        this.txtOutside.Name = "txtOutside";
        this.txtOutside.Size = new System.Drawing.Size(120, 23);
        this.txtOutside.TabIndex = 3;
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Controls.Add(this.btnIconOnly);
        this.Controls.Add(this.btnAccessibleIcon);
        this.Controls.Add(this.chkEmpty);
        this.Controls.Add(this.txtOutside);
        this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
        this.Name = "DialogIssuesForm";
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.Button btnIconOnly;
    private System.Windows.Forms.Button btnAccessibleIcon;
    private System.Windows.Forms.CheckBox chkEmpty;
    private System.Windows.Forms.TextBox txtOutside;
}
`;
    const issues = auditDesignDocument(parseDesignerCs(src));

    assert.ok(issues.some((i) => i.code === 'dialog-missing-accept-button'));
    assert.ok(issues.some((i) => i.code === 'dialog-missing-cancel-button'));
    assert.ok(issues.some((i) => i.code === 'out-of-bounds' && i.controlName === 'txtOutside'));
    assert.ok(
      issues.some(
        (i) =>
          i.code === 'duplicate-tab-index' &&
          i.controlName === 'btnAccessibleIcon' &&
          i.relatedControlName === 'btnIconOnly'
      )
    );
    const missingText = issues.filter((i) => i.code === 'missing-accessible-text');
    assert.deepEqual(
      missingText.map((i) => i.controlName).sort(),
      ['btnIconOnly', 'chkEmpty']
    );
  });

  it('detects invalid NumericUpDown ranges, ProgressBar ranges, and SplitContainer SplitterDistance', () => {
    const src = `namespace AuditApp;

partial class RangeIssuesForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.numBadMinMax = new System.Windows.Forms.NumericUpDown();
        this.numBadVal = new System.Windows.Forms.NumericUpDown();
        this.pbBadMinMax = new System.Windows.Forms.ProgressBar();
        this.pbBadVal = new System.Windows.Forms.ProgressBar();
        this.splitBad = new System.Windows.Forms.SplitContainer();
        ((System.ComponentModel.ISupportInitialize)(this.numBadMinMax)).BeginInit();
        ((System.ComponentModel.ISupportInitialize)(this.numBadVal)).BeginInit();
        ((System.ComponentModel.ISupportInitialize)(this.splitBad)).BeginInit();
        this.splitBad.SuspendLayout();
        this.SuspendLayout();
        this.numBadMinMax.Location = new System.Drawing.Point(10, 10);
        this.numBadMinMax.Maximum = 10;
        this.numBadMinMax.Minimum = 50;
        this.numBadMinMax.Name = "numBadMinMax";
        this.numBadMinMax.Size = new System.Drawing.Size(100, 23);
        this.numBadMinMax.TabIndex = 0;
        this.numBadVal.Location = new System.Drawing.Point(10, 45);
        this.numBadVal.Maximum = 100;
        this.numBadVal.Minimum = 10;
        this.numBadVal.Name = "numBadVal";
        this.numBadVal.Size = new System.Drawing.Size(100, 23);
        this.numBadVal.TabIndex = 1;
        this.numBadVal.Value = 150;
        this.pbBadMinMax.Location = new System.Drawing.Point(10, 80);
        this.pbBadMinMax.Maximum = 50;
        this.pbBadMinMax.Minimum = 50;
        this.pbBadMinMax.Name = "pbBadMinMax";
        this.pbBadMinMax.Size = new System.Drawing.Size(150, 20);
        this.pbBadVal.Location = new System.Drawing.Point(10, 110);
        this.pbBadVal.Maximum = 100;
        this.pbBadVal.Minimum = 0;
        this.pbBadVal.Name = "pbBadVal";
        this.pbBadVal.Size = new System.Drawing.Size(150, 20);
        this.pbBadVal.Value = 120;
        this.splitBad.Location = new System.Drawing.Point(200, 10);
        this.splitBad.Name = "splitBad";
        this.splitBad.Size = new System.Drawing.Size(200, 150);
        this.splitBad.SplitterDistance = 250;
        this.ClientSize = new System.Drawing.Size(500, 300);
        this.Controls.Add(this.numBadMinMax);
        this.Controls.Add(this.numBadVal);
        this.Controls.Add(this.pbBadMinMax);
        this.Controls.Add(this.pbBadVal);
        this.Controls.Add(this.splitBad);
        ((System.ComponentModel.ISupportInitialize)(this.numBadMinMax)).EndInit();
        ((System.ComponentModel.ISupportInitialize)(this.numBadVal)).EndInit();
        ((System.ComponentModel.ISupportInitialize)(this.splitBad)).EndInit();
        this.splitBad.ResumeLayout(false);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.NumericUpDown numBadMinMax;
    private System.Windows.Forms.NumericUpDown numBadVal;
    private System.Windows.Forms.ProgressBar pbBadMinMax;
    private System.Windows.Forms.ProgressBar pbBadVal;
    private System.Windows.Forms.SplitContainer splitBad;
}
`;
    const issues = auditDesignDocument(parseDesignerCs(src));

    assert.ok(
      issues.some((i) => i.code === 'numeric-updown-range' && i.controlName === 'numBadMinMax' && i.severity === 'error')
    );
    assert.ok(
      issues.some((i) => i.code === 'numeric-updown-range' && i.controlName === 'numBadVal' && i.severity === 'error')
    );
    assert.ok(
      issues.some((i) => i.code === 'progress-bar-range' && i.controlName === 'pbBadMinMax' && i.severity === 'error')
    );
    assert.ok(
      issues.some((i) => i.code === 'progress-bar-range' && i.controlName === 'pbBadVal' && i.severity === 'error')
    );
    assert.ok(
      issues.some((i) => i.code === 'split-container-distance' && i.controlName === 'splitBad' && i.severity === 'error')
    );
  });
});
