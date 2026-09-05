namespace TestDesignFile;

public partial class FormRenamedHandler : Form
{
    public FormRenamedHandler()
    {
        InitializeComponent();
    }

    // Hand-written name: the designer must delete this subscription by the name shown in the
    // event grid, not by the computed "button1_Click".
    private void MyCustomClick(object? sender, EventArgs e)
    {
    }
}
