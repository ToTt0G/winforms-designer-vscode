namespace OrderManagerDemo;

public partial class MainForm : Form
{
    public MainForm()
    {
        InitializeComponent();
    }

    private void MainForm_Load(object? sender, EventArgs e)
    {
        statusLabel.Text = "Loaded 24 active orders";
    }

    private void btnApplyFilter_Click(object? sender, EventArgs e)
    {
        statusLabel.Text = $"Filtered by: {txtSearch.Text}";
    }

    private void btnApprove_Click(object? sender, EventArgs e)
    {
        progressSync.Value = 100;
        statusLabel.Text = "Selected orders approved";
    }

    private void refreshTimer_Tick(object? sender, EventArgs e)
    {
        // Periodic background refresh
    }
}
