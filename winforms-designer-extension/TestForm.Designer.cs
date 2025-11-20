namespace WinFormsApp
{
    partial class TestForm
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
            this.button1 = new System.Windows.Forms.Button();
            this.textBox1 = new System.Windows.Forms.TextBox();
            this.Label2 = new System.Windows.Forms.Label();
            this.SuspendLayout();
            //
            // button1
            //
            this.button1.Text =  "Click Me";
            this.button1.Capture =  false;
            this.button1.IsAccessible =  false;
            this.button1.Location = new System.Drawing.Point(12,12);
            this.button1.TabIndex = 0;
            //
            // textBox1
            //
            this.textBox1.Text =  "textBox1";
            this.textBox1.Modified =  false;
            this.textBox1.SelectedText =  "";
            this.textBox1.SelectionLength = 0;
            this.textBox1.SelectionStart = 0;
            this.textBox1.Capture =  false;
            this.textBox1.IsAccessible =  false;
            this.textBox1.Location = new System.Drawing.Point(12,50);
            this.textBox1.TabIndex = 1;
            //
            // Label2
            //
            this.Label2.Text =  "Label2";
            this.Label2.Capture =  false;
            this.Label2.IsAccessible =  false;
            this.Label2.Location = new System.Drawing.Point(152,92);
            this.Label2.Size = new System.Drawing.Size(124,40);
            this.Label2.TabIndex = 2;
         //
         // form
         //
            this.Size = new System.Drawing.Size(320,252);
            this.Text =  "Test Form";
            this.Controls.Add(this.button1);
            this.Controls.Add(this.textBox1);
            this.Controls.Add(this.Label2);
            this.ResumeLayout(false);
        } 

        #endregion 

        private System.Windows.Forms.Button button1;
        private System.Windows.Forms.TextBox textBox1;
        private System.Windows.Forms.Label Label2;
    }
}

