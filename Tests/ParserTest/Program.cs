using System;
using System.IO;
using ParserTest;

class Program
{
    static void Main(string[] args)
    {
        string samplePath = "sample.txt";
        // Create a dummy sample file if not exists
        if (!File.Exists(samplePath))
        {
            File.WriteAllText(samplePath, @"namespace TestApp
{
    partial class Form1
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.button1 = new System.Windows.Forms.Button();
            this.label1 = new System.Windows.Forms.Label();
            this.SuspendLayout();
            //
            // button1
            //
            this.button1.Location = new System.Drawing.Point(100, 100);
            this.button1.Name = ""button1"";
            this.button1.Size = new System.Drawing.Size(75, 23);
            this.button1.TabIndex = 0;
            this.button1.Text = ""button1"";
            this.button1.UseVisualStyleBackColor = true;
            this.button1.Click += new System.EventHandler(this.button1_Click);
            //
            // label1
            //
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(200, 100);
            this.label1.Name = ""label1"";
            this.label1.Size = new System.Drawing.Size(35, 13);
            this.label1.TabIndex = 1;
            this.label1.Text = ""label1"";
            //
            // Form1
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(800, 450);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.button1);
            this.Name = ""Form1"";
            this.Text = ""Form1"";
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.Button button1;
        private System.Windows.Forms.Label label1;
    }
}");
        }

        Console.WriteLine("Parsing " + samplePath + "...");
        FILE_INFO info = CodeParser.Parse(samplePath);

        Console.WriteLine($"Form Name: {info.formName}");
        Console.WriteLine($"Controls Found: {info.ctrlInfo.Count}");

        foreach(var ctrl in info.ctrlInfo)
        {
            Console.WriteLine($"--------------------------------");
            Console.WriteLine($"Control: {ctrl.ctrlName} ({ctrl.ctrlClassName})");
            Console.WriteLine($"Parent: {ctrl.parent}");

            Console.WriteLine("Properties:");
            for(int i=0; i<ctrl.propertyName.Count; i++)
            {
                Console.WriteLine($"  {ctrl.propertyName[i]} = {ctrl.strProperty[i]}");
            }

            Console.WriteLine("Events:");
            for(int i=0; i<ctrl.eventName.Count; i++)
            {
                Console.WriteLine($"  {ctrl.eventName[i]} -> {ctrl.eventFunc[i]}");
            }
        }

        Console.WriteLine("--------------------------------");
        Console.WriteLine("Source Base (First 5 lines):");
        for(int i=0; i<Math.Min(5, info.source_base.Count); i++)
        {
            Console.WriteLine(info.source_base[i]);
        }
    }
}
