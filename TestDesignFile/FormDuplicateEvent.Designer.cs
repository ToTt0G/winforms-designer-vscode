namespace TestDesignFile
{
    // Regression fixture for P0-3b (duplicate subscriptions to one event).
    // button1.Click is wired twice. Selecting button1 must raise a warning naming the event
    // and both handlers, because the grid can only show one of them and unwiring removes
    // only that one.
    partial class FormDuplicateEvent
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
            this.SuspendLayout();
            //
            // button1
            //
            this.button1.Text =  "button1";
            this.button1.Location = new System.Drawing.Point(24,24);
            this.button1.Size = new System.Drawing.Size(120,32);
            this.button1.TabIndex = 0;
            this.button1.Click += new System.EventHandler(this.button1_Click);
            this.button1.Click += new System.EventHandler(this.button1_Click_1);
         //
         // form
         //
            this.Size = new System.Drawing.Size(480,400);
            this.Text =  "FormDuplicateEvent";
            this.Controls.Add(this.button1);
            this.ResumeLayout(false);
        }

        #endregion

        private System.Windows.Forms.Button button1;
    }
}
