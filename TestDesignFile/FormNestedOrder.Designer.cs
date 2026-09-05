namespace TestDesignFile
{
    // Regression fixture for the P2 tree-view data gap.
    // Every child here is declared BEFORE the container it belongs to, which is the order the
    // real Visual Studio designer produces often enough to matter. Open this file and switch
    // to the control-tree tab: every control must appear exactly once, and nothing may be
    // missing. Controls whose parent cannot be resolved show up under "(unparented)" rather
    // than disappearing.
    //
    // Note: duplicate control names in different containers (the other half of that item) can
    // only be produced by renaming inside the designer - a .Designer.cs cannot express two
    // fields with the same name, and cls_userform resolves parents by name while loading.
    // The tree keys nodes on the container instance, so a rename cannot mis-parent a node.
    partial class FormNestedOrder
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.innerButton1 = new System.Windows.Forms.Button();
            this.innerButton2 = new System.Windows.Forms.Button();
            this.splitChild = new System.Windows.Forms.Button();
            this.panel1 = new System.Windows.Forms.Panel();
            this.panel2 = new System.Windows.Forms.Panel();
            this.splitContainer1 = new System.Windows.Forms.SplitContainer();
            this.SuspendLayout();
            //
            // innerButton1
            //
            this.innerButton1.Text =  "innerButton1";
            this.innerButton1.Location = new System.Drawing.Point(8,8);
            this.innerButton1.Size = new System.Drawing.Size(100,32);
            this.innerButton1.TabIndex = 0;
         //
         // innerButton2
         //
            this.innerButton2.Text =  "innerButton2";
            this.innerButton2.Location = new System.Drawing.Point(8,8);
            this.innerButton2.Size = new System.Drawing.Size(100,32);
            this.innerButton2.TabIndex = 1;
         //
         // splitChild
         //
            this.splitChild.Text =  "splitChild";
            this.splitChild.Location = new System.Drawing.Point(8,8);
            this.splitChild.Size = new System.Drawing.Size(100,32);
            this.splitChild.TabIndex = 2;
         //
         // panel1
         //
            this.panel1.Location = new System.Drawing.Point(16,16);
            this.panel1.Size = new System.Drawing.Size(200,80);
            this.panel1.TabIndex = 3;
            this.panel1.Controls.Add(this.innerButton1);
         //
         // panel2
         //
            this.panel2.Location = new System.Drawing.Point(16,112);
            this.panel2.Size = new System.Drawing.Size(200,80);
            this.panel2.TabIndex = 4;
            this.panel2.Controls.Add(this.innerButton2);
         //
         // splitContainer1
         //
            this.splitContainer1.Location = new System.Drawing.Point(16,208);
            this.splitContainer1.Size = new System.Drawing.Size(400,120);
            this.splitContainer1.TabIndex = 5;
            this.splitContainer1.Panel2.Controls.Add(this.splitChild);
         //
         // form
         //
            this.Size = new System.Drawing.Size(480,400);
            this.Text =  "FormNestedOrder";
            this.Controls.Add(this.panel1);
            this.Controls.Add(this.panel2);
            this.Controls.Add(this.splitContainer1);
            this.ResumeLayout(false);
        }

        #endregion

        private System.Windows.Forms.Button innerButton1;
        private System.Windows.Forms.Button innerButton2;
        private System.Windows.Forms.Button splitChild;
        private System.Windows.Forms.Panel panel1;
        private System.Windows.Forms.Panel panel2;
        private System.Windows.Forms.SplitContainer splitContainer1;
    }
}
