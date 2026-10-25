using System.Reflection;
using SWD4CS;

internal static class Program
{
    private static readonly Type FileReader = typeof(cls_create_code).Assembly.GetType("SWD4CS.cls_file")!;

    [STAThread]
    private static int Main()
    {
        int failures = 0;
        var tests = new List<(string Name, Action Run)>
        {
            ("read CRLF designer file", () => ReadDesigner("\r\n")),
            ("read LF designer file", () => ReadDesigner("\n")),
            ("read CR designer file", () => ReadDesigner("\r")),
            ("preserve non-string property expressions", () => Equal("new System.Drawing.Size(12, 34)", ReadValue("this.Size = new System.Drawing.Size(12, 34);"))),
            ("decode verbatim string", () => Equal("C:\\Forms\\\"Title\";a=b", ReadValue("this.Text = @\"C:\\Forms\\\"\"Title\"\";a=b\";"))),
            ("decode C# hexadecimal escapes", () => Equal("A\n😀", ReadValue("this.Text = \"\\x41\\u000A\\U0001F600\";"))),
            ("read shorthand event handler", () => Equal("button1_Click", ReadHandler("this.button1.Click += button1_Click;"))),
            ("read this-qualified shorthand event handler", () => Equal("button1_Click", ReadHandler("this.button1.Click += this.button1_Click;"))),
            ("read explicit event delegate", () => Equal("button1_Click", ReadHandler("this.button1.Click += new System.EventHandler(this.button1_Click);"))),
            ("generate escaped C# literal", () => Equal(" = \"Say \\\"Hello\\\" at C:\\\\Forms\\n\";", GenerateString("Say \"Hello\" at C:\\Forms\n")))
        };

        foreach (string value in new[] { "", "Hello", "a=b; c=d;", "Say \"Hello\"", @"C:\Users\Forms", "line one\r\nline two\tend", "\0\a\b\f\v", "Svenska åäö — 😀", "// += Controls.Add(this.fake);" })
        {
            string sample = value;
            tests.Add(($"round-trip string {tests.Count}", () => RoundTrip(sample)));
        }

        foreach (var test in tests)
        {
            try { test.Run(); Console.WriteLine($"PASS {test.Name}"); }
            catch (Exception error) { failures++; Console.WriteLine($"FAIL {test.Name}: {error.GetBaseException().Message}"); }
        }
        Console.WriteLine($"{tests.Count - failures}/{tests.Count} regression checks passed.");
        return failures == 0 ? 0 : 1;
    }

    private static void RoundTrip(string value)
    {
        string assignment = GenerateString(value);
        // Exercise the actual generator and actual file parser, including punctuation
        // resembling code inside the string. Opening must not change the label's text.
        ReadDesigner("\r\n", value, assignment);
    }

    private static void ReadDesigner(string newline, string value = "Hello", string assignment = " = \"Hello\";")
    {
        string folder = Path.Combine(Path.GetTempPath(), "winforms-designer-regression-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        string file = Path.Combine(folder, "Fixture.Designer.cs");
        try
        {
            File.WriteAllText(file, string.Join(newline, new[] {
                "namespace Fixture", "{", "    partial class FixtureForm", "    {",
                "        private void InitializeComponent()", "        {",
                "            this.label1 = new System.Windows.Forms.Label();",
                "            this.SuspendLayout();", "            // label1",
                "            this.label1.Text" + assignment,
                "            this.Controls.Add(this.label1);",
                "            this.ResumeLayout(false);", "        }", "    }", "}"
            }));
            var parsed = (FILE_INFO)FileReader.GetMethod("CommandLine", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, new object[] { file })!;
            Equal("FixtureForm", parsed.formName);
            var label = parsed.ctrlInfo.Single(c => c.ctrlName == "label1");
            Equal(value, label.strProperty[label.propertyName.IndexOf("Text")]);
        }
        finally { File.Delete(file); Directory.Delete(folder); }
    }

    private static string ReadValue(string assignment) => (string)FileReader.GetMethod("GetProperty", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, new object[] { assignment })!;

    private static string ReadHandler(string statement) => (string)FileReader.GetMethod("GetFunc", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, new object[] { statement })!;

    private static string GenerateString(string value)
    {
        using var label = new Label { Text = value };
        return (string)typeof(cls_create_code).GetMethod("Property2String", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, new object[] { label, typeof(Label).GetProperty(nameof(Label.Text))! })!;
    }

    private static void Equal(string expected, string actual)
    {
        if (expected != actual) throw new InvalidOperationException($"Expected [{expected}], got [{actual}].");
    }
}
