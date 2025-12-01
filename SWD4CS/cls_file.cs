namespace SWD4CS
{
    internal class cls_file
    {
        // *****************************************************************************
        // private Function
        // *****************************************************************************
        private static FILE_INFO ReadCode(string filePath)
        {
            return CodeParser.Parse(filePath);
        }

        // *****************************************************************************
        // internal Function
        // *****************************************************************************
        internal static FILE_INFO CommandLine(string fName)
        {
            if (fName.IndexOf(".Designer.cs") == -1) { return new FILE_INFO(); }
            return ReadCode(fName);
        }
        internal static List<string> NewFile()
        {
            return new List<string>
            {
                "namespace WinFormsApp",
                "{",
                "    partial class Form1",
                "    {",
                "        /// <summary>",
                "        ///  Required designer variable.",
                "        /// </summary>",
                "        private System.ComponentModel.IContainer components = null;",
                "",
                "        /// <summary>",
                "        ///  Clean up any resources being used.",
                "        /// </summary>",
                "        /// <param name=\"disposing\">true if managed resources should be disposed; otherwise, false.</param>",
                "        protected override void Dispose(bool disposing)",
                "        {",
                "            if (disposing && (components != null))",
                "            {",
                "                components.Dispose();",
                "            }",
                "            base.Dispose(disposing);",
                "        }",
                "",
                "        #region Windows Form Designer generated code",
                "",
                "        /// <summary>",
                "        ///  Required method for Designer support - do not modify",
                "        ///  the contents of this method with the code editor.",
                "        /// </summary>",
                "        private void InitializeComponent()"
            };
        }

        internal static void SaveAs(string FileName, string SourceCode)
        {
            File.WriteAllText(FileName, SourceCode);
        }

        internal static void Save(string SourceCode)
        {
            SaveFileDialog dlg = new()
            {
                FileName = "Form1.Designer.cs",
                InitialDirectory = @"C:\",
                Filter = "Designer.csファイル(*.Designer.cs;*.Designer.cs)|*.Designer.cs;*.Designer.cs",
                FilterIndex = 1,
                Title = "保存先のファイルを選択してください",
                RestoreDirectory = true
            };
            if (dlg.ShowDialog() == DialogResult.OK) { File.WriteAllText(dlg.FileName, SourceCode); }
        }

        internal static FILE_INFO OpenFile()
        {
            OpenFileDialog dlg = new()
            {
                InitialDirectory = @"C:\",
                Filter = "Designer.csファイル(*.Designer.cs;*.Designer.cs)|*.Designer.cs;*.Designer.cs",
                FilterIndex = 1,
                Title = "開くファイルを選択してください",
                RestoreDirectory = true
            };
            if (dlg.ShowDialog() != DialogResult.OK) { return new FILE_INFO(); }
            return ReadCode(dlg.FileName);
        }
    }
}
