namespace TestDesignFile
{

    partial class Form1
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
            this.Label0 = new System.Windows.Forms.Label();
            this.SuspendLayout();
            //
            // Label0
            //
            this.Label0.Text =  "Label01";
            this.Label0.Location = new System.Drawing.Point(132,60);
            this.Label0.Size = new System.Drawing.Size(108,20);
            this.Label0.TabIndex = 0;
         //
         // form
         //
            this.Size = new System.Drawing.Size(480,400);
            this.Text =  "Form1";
            this.Controls.Add(this.Label0);
            this.ResumeLayout(false);
        } 

        #endregion 

        private System.Windows.Forms.Label Label0;
    }
}

