namespace OrderManagerDemo;

partial class MainForm
{
    /// <summary>
    ///  Required designer variable.
    /// </summary>
    private System.ComponentModel.IContainer? components = null;

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
        this.components = new System.ComponentModel.Container();
        this.menuStrip1 = new System.Windows.Forms.MenuStrip();
        this.fileToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.newOrderToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.exportCsvToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.exitToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.editToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.viewToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.helpToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.toolStrip1 = new System.Windows.Forms.ToolStrip();
        this.tsbNewOrder = new System.Windows.Forms.ToolStripButton();
        this.tsbRefresh = new System.Windows.Forms.ToolStripButton();
        this.toolStripSeparator1 = new System.Windows.Forms.ToolStripSeparator();
        this.tsbExport = new System.Windows.Forms.ToolStripButton();
        this.statusStrip1 = new System.Windows.Forms.StatusStrip();
        this.statusLabel = new System.Windows.Forms.ToolStripStatusLabel();
        this.statusConnection = new System.Windows.Forms.ToolStripStatusLabel();
        this.splitMain = new System.Windows.Forms.SplitContainer();
        this.grpFilters = new System.Windows.Forms.GroupBox();
        this.lblSearch = new System.Windows.Forms.Label();
        this.txtSearch = new System.Windows.Forms.TextBox();
        this.lblStatus = new System.Windows.Forms.Label();
        this.cmbStatus = new System.Windows.Forms.ComboBox();
        this.chkPriority = new System.Windows.Forms.CheckBox();
        this.chkArchived = new System.Windows.Forms.CheckBox();
        this.radAllRegions = new System.Windows.Forms.RadioButton();
        this.radNorthAmerica = new System.Windows.Forms.RadioButton();
        this.btnApplyFilter = new System.Windows.Forms.Button();
        this.tabWorkspace = new System.Windows.Forms.TabControl();
        this.tabOrders = new System.Windows.Forms.TabPage();
        this.dgvOrders = new System.Windows.Forms.DataGridView();
        this.colOrderId = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.colCustomer = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.colStatus = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.colTotal = new System.Windows.Forms.DataGridViewTextBoxColumn();
        this.colShipped = new System.Windows.Forms.DataGridViewCheckBoxColumn();
        this.pnlOrderActions = new System.Windows.Forms.Panel();
        this.progressSync = new System.Windows.Forms.ProgressBar();
        this.btnApprove = new System.Windows.Forms.Button();
        this.btnExport = new System.Windows.Forms.Button();
        this.tabSummary = new System.Windows.Forms.TabPage();
        this.lblOrderDate = new System.Windows.Forms.Label();
        this.dtpOrderDate = new System.Windows.Forms.DateTimePicker();
        this.lblBatchLimit = new System.Windows.Forms.Label();
        this.numBatchLimit = new System.Windows.Forms.NumericUpDown();
        this.rtbNotes = new System.Windows.Forms.RichTextBox();
        this.refreshTimer = new System.Windows.Forms.Timer(this.components);
        this.exportDialog = new System.Windows.Forms.SaveFileDialog();
        this.toolbarIcons = new System.Windows.Forms.ImageList(this.components);
        this.menuStrip1.SuspendLayout();
        this.toolStrip1.SuspendLayout();
        this.statusStrip1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.splitMain)).BeginInit();
        this.splitMain.Panel1.SuspendLayout();
        this.splitMain.Panel2.SuspendLayout();
        this.splitMain.SuspendLayout();
        this.grpFilters.SuspendLayout();
        this.tabWorkspace.SuspendLayout();
        this.tabOrders.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.dgvOrders)).BeginInit();
        this.pnlOrderActions.SuspendLayout();
        this.tabSummary.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.numBatchLimit)).BeginInit();
        this.SuspendLayout();
        //
        // menuStrip1
        //
        this.menuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.fileToolStripMenuItem,
            this.editToolStripMenuItem,
            this.viewToolStripMenuItem,
            this.helpToolStripMenuItem});
        this.menuStrip1.Location = new System.Drawing.Point(0, 0);
        this.menuStrip1.Name = "menuStrip1";
        this.menuStrip1.Size = new System.Drawing.Size(860, 24);
        this.menuStrip1.TabIndex = 0;
        this.menuStrip1.Text = "menuStrip1";
        //
        // fileToolStripMenuItem
        //
        this.fileToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.newOrderToolStripMenuItem,
            this.exportCsvToolStripMenuItem,
            this.exitToolStripMenuItem});
        this.fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        this.fileToolStripMenuItem.Size = new System.Drawing.Size(37, 20);
        this.fileToolStripMenuItem.Text = "&File";
        //
        // newOrderToolStripMenuItem
        //
        this.newOrderToolStripMenuItem.Name = "newOrderToolStripMenuItem";
        this.newOrderToolStripMenuItem.Size = new System.Drawing.Size(152, 22);
        this.newOrderToolStripMenuItem.Text = "&New Order";
        //
        // exportCsvToolStripMenuItem
        //
        this.exportCsvToolStripMenuItem.Name = "exportCsvToolStripMenuItem";
        this.exportCsvToolStripMenuItem.Size = new System.Drawing.Size(152, 22);
        this.exportCsvToolStripMenuItem.Text = "&Export CSV...";
        //
        // exitToolStripMenuItem
        //
        this.exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        this.exitToolStripMenuItem.Size = new System.Drawing.Size(152, 22);
        this.exitToolStripMenuItem.Text = "E&xit";
        //
        // editToolStripMenuItem
        //
        this.editToolStripMenuItem.Name = "editToolStripMenuItem";
        this.editToolStripMenuItem.Size = new System.Drawing.Size(39, 20);
        this.editToolStripMenuItem.Text = "&Edit";
        //
        // viewToolStripMenuItem
        //
        this.viewToolStripMenuItem.Name = "viewToolStripMenuItem";
        this.viewToolStripMenuItem.Size = new System.Drawing.Size(44, 20);
        this.viewToolStripMenuItem.Text = "&View";
        //
        // helpToolStripMenuItem
        //
        this.helpToolStripMenuItem.Name = "helpToolStripMenuItem";
        this.helpToolStripMenuItem.Size = new System.Drawing.Size(44, 20);
        this.helpToolStripMenuItem.Text = "&Help";
        //
        // toolStrip1
        //
        this.toolStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tsbNewOrder,
            this.tsbRefresh,
            this.toolStripSeparator1,
            this.tsbExport});
        this.toolStrip1.Location = new System.Drawing.Point(0, 24);
        this.toolStrip1.Name = "toolStrip1";
        this.toolStrip1.Size = new System.Drawing.Size(860, 25);
        this.toolStrip1.TabIndex = 1;
        this.toolStrip1.Text = "toolStrip1";
        //
        // tsbNewOrder
        //
        this.tsbNewOrder.Name = "tsbNewOrder";
        this.tsbNewOrder.Size = new System.Drawing.Size(74, 22);
        this.tsbNewOrder.Text = "New Order";
        //
        // tsbRefresh
        //
        this.tsbRefresh.Name = "tsbRefresh";
        this.tsbRefresh.Size = new System.Drawing.Size(56, 22);
        this.tsbRefresh.Text = "Refresh";
        //
        // toolStripSeparator1
        //
        this.toolStripSeparator1.Name = "toolStripSeparator1";
        this.toolStripSeparator1.Size = new System.Drawing.Size(6, 25);
        //
        // tsbExport
        //
        this.tsbExport.Name = "tsbExport";
        this.tsbExport.Size = new System.Drawing.Size(74, 22);
        this.tsbExport.Text = "Export CSV";
        //
        // statusStrip1
        //
        this.statusStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.statusLabel,
            this.statusConnection});
        this.statusStrip1.Location = new System.Drawing.Point(0, 508);
        this.statusStrip1.Name = "statusStrip1";
        this.statusStrip1.Size = new System.Drawing.Size(860, 22);
        this.statusStrip1.TabIndex = 2;
        this.statusStrip1.Text = "statusStrip1";
        //
        // statusLabel
        //
        this.statusLabel.Name = "statusLabel";
        this.statusLabel.Size = new System.Drawing.Size(134, 17);
        this.statusLabel.Text = "Loaded 24 active orders";
        //
        // statusConnection
        //
        this.statusConnection.Name = "statusConnection";
        this.statusConnection.Size = new System.Drawing.Size(136, 17);
        this.statusConnection.Text = "Production DB • Online";
        //
        // splitMain
        //
        this.splitMain.Dock = System.Windows.Forms.DockStyle.Fill;
        this.splitMain.Location = new System.Drawing.Point(0, 49);
        this.splitMain.Name = "splitMain";
        this.splitMain.Panel1.Controls.Add(this.grpFilters);
        this.splitMain.Panel1.Padding = new System.Windows.Forms.Padding(10);
        this.splitMain.Panel2.Controls.Add(this.tabWorkspace);
        this.splitMain.Panel2.Padding = new System.Windows.Forms.Padding(8);
        this.splitMain.Size = new System.Drawing.Size(860, 459);
        this.splitMain.SplitterDistance = 244;
        this.splitMain.TabIndex = 3;
        //
        // grpFilters
        //
        this.grpFilters.Controls.Add(this.btnApplyFilter);
        this.grpFilters.Controls.Add(this.radNorthAmerica);
        this.grpFilters.Controls.Add(this.radAllRegions);
        this.grpFilters.Controls.Add(this.chkArchived);
        this.grpFilters.Controls.Add(this.chkPriority);
        this.grpFilters.Controls.Add(this.cmbStatus);
        this.grpFilters.Controls.Add(this.lblStatus);
        this.grpFilters.Controls.Add(this.txtSearch);
        this.grpFilters.Controls.Add(this.lblSearch);
        this.grpFilters.Dock = System.Windows.Forms.DockStyle.Fill;
        this.grpFilters.Location = new System.Drawing.Point(10, 10);
        this.grpFilters.Name = "grpFilters";
        this.grpFilters.Size = new System.Drawing.Size(224, 439);
        this.grpFilters.TabIndex = 0;
        this.grpFilters.TabStop = false;
        this.grpFilters.Text = "Order Filters";
        //
        // lblSearch
        //
        this.lblSearch.AutoSize = true;
        this.lblSearch.Location = new System.Drawing.Point(14, 28);
        this.lblSearch.Name = "lblSearch";
        this.lblSearch.Size = new System.Drawing.Size(96, 15);
        this.lblSearch.TabIndex = 0;
        this.lblSearch.Text = "Search Customer";
        //
        // txtSearch
        //
        this.txtSearch.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) | System.Windows.Forms.AnchorStyles.Right)));
        this.txtSearch.Location = new System.Drawing.Point(14, 48);
        this.txtSearch.Name = "txtSearch";
        this.txtSearch.PlaceholderText = "Order # or customer...";
        this.txtSearch.Size = new System.Drawing.Size(196, 23);
        this.txtSearch.TabIndex = 1;
        //
        // lblStatus
        //
        this.lblStatus.AutoSize = true;
        this.lblStatus.Location = new System.Drawing.Point(14, 86);
        this.lblStatus.Name = "lblStatus";
        this.lblStatus.Size = new System.Drawing.Size(72, 15);
        this.lblStatus.TabIndex = 2;
        this.lblStatus.Text = "Order Status";
        //
        // cmbStatus
        //
        this.cmbStatus.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) | System.Windows.Forms.AnchorStyles.Right)));
        this.cmbStatus.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
        this.cmbStatus.FormattingEnabled = true;
        this.cmbStatus.Items.AddRange(new object[] {
            "All Statuses",
            "Pending Review",
            "Approved",
            "Shipped"});
        this.cmbStatus.Location = new System.Drawing.Point(14, 106);
        this.cmbStatus.Name = "cmbStatus";
        this.cmbStatus.Size = new System.Drawing.Size(196, 23);
        this.cmbStatus.TabIndex = 3;
        //
        // chkPriority
        //
        this.chkPriority.AutoSize = true;
        this.chkPriority.Checked = true;
        this.chkPriority.Location = new System.Drawing.Point(14, 148);
        this.chkPriority.Name = "chkPriority";
        this.chkPriority.Size = new System.Drawing.Size(124, 19);
        this.chkPriority.TabIndex = 4;
        this.chkPriority.Text = "Priority orders only";
        this.chkPriority.UseVisualStyleBackColor = true;
        //
        // chkArchived
        //
        this.chkArchived.AutoSize = true;
        this.chkArchived.Location = new System.Drawing.Point(14, 174);
        this.chkArchived.Name = "chkArchived";
        this.chkArchived.Size = new System.Drawing.Size(116, 19);
        this.chkArchived.TabIndex = 5;
        this.chkArchived.Text = "Include archived";
        this.chkArchived.UseVisualStyleBackColor = true;
        //
        // radAllRegions
        //
        this.radAllRegions.AutoSize = true;
        this.radAllRegions.Checked = true;
        this.radAllRegions.Location = new System.Drawing.Point(14, 212);
        this.radAllRegions.Name = "radAllRegions";
        this.radAllRegions.Size = new System.Drawing.Size(84, 19);
        this.radAllRegions.TabIndex = 6;
        this.radAllRegions.TabStop = true;
        this.radAllRegions.Text = "All Regions";
        this.radAllRegions.UseVisualStyleBackColor = true;
        //
        // radNorthAmerica
        //
        this.radNorthAmerica.AutoSize = true;
        this.radNorthAmerica.Location = new System.Drawing.Point(14, 238);
        this.radNorthAmerica.Name = "radNorthAmerica";
        this.radNorthAmerica.Size = new System.Drawing.Size(102, 19);
        this.radNorthAmerica.TabIndex = 7;
        this.radNorthAmerica.Text = "North America";
        this.radNorthAmerica.UseVisualStyleBackColor = true;
        //
        // btnApplyFilter
        //
        this.btnApplyFilter.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) | System.Windows.Forms.AnchorStyles.Right)));
        this.btnApplyFilter.BackColor = System.Drawing.Color.FromArgb(0, 120, 212);
        this.btnApplyFilter.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
        this.btnApplyFilter.ForeColor = System.Drawing.Color.White;
        this.btnApplyFilter.Location = new System.Drawing.Point(14, 392);
        this.btnApplyFilter.Name = "btnApplyFilter";
        this.btnApplyFilter.Size = new System.Drawing.Size(196, 32);
        this.btnApplyFilter.TabIndex = 8;
        this.btnApplyFilter.Text = "Apply Filter";
        this.btnApplyFilter.UseVisualStyleBackColor = false;
        this.btnApplyFilter.Click += this.btnApplyFilter_Click;
        //
        // tabWorkspace
        //
        this.tabWorkspace.Controls.Add(this.tabOrders);
        this.tabWorkspace.Controls.Add(this.tabSummary);
        this.tabWorkspace.Dock = System.Windows.Forms.DockStyle.Fill;
        this.tabWorkspace.Location = new System.Drawing.Point(8, 8);
        this.tabWorkspace.Name = "tabWorkspace";
        this.tabWorkspace.SelectedIndex = 0;
        this.tabWorkspace.Size = new System.Drawing.Size(596, 443);
        this.tabWorkspace.TabIndex = 0;
        //
        // tabOrders
        //
        this.tabOrders.Controls.Add(this.dgvOrders);
        this.tabOrders.Controls.Add(this.pnlOrderActions);
        this.tabOrders.Location = new System.Drawing.Point(4, 24);
        this.tabOrders.Name = "tabOrders";
        this.tabOrders.Padding = new System.Windows.Forms.Padding(8);
        this.tabOrders.Size = new System.Drawing.Size(588, 415);
        this.tabOrders.TabIndex = 0;
        this.tabOrders.Text = "Active Orders";
        this.tabOrders.UseVisualStyleBackColor = true;
        //
        // dgvOrders
        //
        this.dgvOrders.AllowUserToAddRows = false;
        this.dgvOrders.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
        this.dgvOrders.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
        this.dgvOrders.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colOrderId,
            this.colCustomer,
            this.colStatus,
            this.colTotal,
            this.colShipped});
        this.dgvOrders.Dock = System.Windows.Forms.DockStyle.Fill;
        this.dgvOrders.Location = new System.Drawing.Point(8, 8);
        this.dgvOrders.Name = "dgvOrders";
        this.dgvOrders.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
        this.dgvOrders.Size = new System.Drawing.Size(572, 349);
        this.dgvOrders.TabIndex = 0;
        //
        // colOrderId
        //
        this.colOrderId.HeaderText = "Order ID";
        this.colOrderId.Name = "colOrderId";
        //
        // colCustomer
        //
        this.colCustomer.HeaderText = "Customer";
        this.colCustomer.Name = "colCustomer";
        //
        // colStatus
        //
        this.colStatus.HeaderText = "Status";
        this.colStatus.Name = "colStatus";
        //
        // colTotal
        //
        this.colTotal.HeaderText = "Total";
        this.colTotal.Name = "colTotal";
        //
        // colShipped
        //
        this.colShipped.HeaderText = "Shipped";
        this.colShipped.Name = "colShipped";
        //
        // pnlOrderActions
        //
        this.pnlOrderActions.Controls.Add(this.btnExport);
        this.pnlOrderActions.Controls.Add(this.btnApprove);
        this.pnlOrderActions.Controls.Add(this.progressSync);
        this.pnlOrderActions.Dock = System.Windows.Forms.DockStyle.Bottom;
        this.pnlOrderActions.Location = new System.Drawing.Point(8, 357);
        this.pnlOrderActions.Name = "pnlOrderActions";
        this.pnlOrderActions.Size = new System.Drawing.Size(572, 50);
        this.pnlOrderActions.TabIndex = 1;
        //
        // progressSync
        //
        this.progressSync.Location = new System.Drawing.Point(4, 15);
        this.progressSync.Name = "progressSync";
        this.progressSync.Size = new System.Drawing.Size(220, 20);
        this.progressSync.TabIndex = 0;
        this.progressSync.Value = 68;
        //
        // btnApprove
        //
        this.btnApprove.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
        this.btnApprove.Location = new System.Drawing.Point(344, 10);
        this.btnApprove.Name = "btnApprove";
        this.btnApprove.Size = new System.Drawing.Size(116, 30);
        this.btnApprove.TabIndex = 1;
        this.btnApprove.Text = "Approve Selected";
        this.btnApprove.UseVisualStyleBackColor = true;
        this.btnApprove.Click += this.btnApprove_Click;
        //
        // btnExport
        //
        this.btnExport.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
        this.btnExport.Location = new System.Drawing.Point(468, 10);
        this.btnExport.Name = "btnExport";
        this.btnExport.Size = new System.Drawing.Size(100, 30);
        this.btnExport.TabIndex = 2;
        this.btnExport.Text = "Export CSV";
        this.btnExport.UseVisualStyleBackColor = true;
        //
        // tabSummary
        //
        this.tabSummary.Controls.Add(this.rtbNotes);
        this.tabSummary.Controls.Add(this.numBatchLimit);
        this.tabSummary.Controls.Add(this.lblBatchLimit);
        this.tabSummary.Controls.Add(this.dtpOrderDate);
        this.tabSummary.Controls.Add(this.lblOrderDate);
        this.tabSummary.Location = new System.Drawing.Point(4, 24);
        this.tabSummary.Name = "tabSummary";
        this.tabSummary.Padding = new System.Windows.Forms.Padding(12);
        this.tabSummary.Size = new System.Drawing.Size(588, 415);
        this.tabSummary.TabIndex = 1;
        this.tabSummary.Text = "Batch Summary";
        this.tabSummary.UseVisualStyleBackColor = true;
        //
        // lblOrderDate
        //
        this.lblOrderDate.AutoSize = true;
        this.lblOrderDate.Location = new System.Drawing.Point(16, 20);
        this.lblOrderDate.Name = "lblOrderDate";
        this.lblOrderDate.Size = new System.Drawing.Size(80, 15);
        this.lblOrderDate.TabIndex = 0;
        this.lblOrderDate.Text = "Cutoff Date";
        //
        // dtpOrderDate
        //
        this.dtpOrderDate.Location = new System.Drawing.Point(16, 40);
        this.dtpOrderDate.Name = "dtpOrderDate";
        this.dtpOrderDate.Size = new System.Drawing.Size(210, 23);
        this.dtpOrderDate.TabIndex = 1;
        //
        // lblBatchLimit
        //
        this.lblBatchLimit.AutoSize = true;
        this.lblBatchLimit.Location = new System.Drawing.Point(256, 20);
        this.lblBatchLimit.Name = "lblBatchLimit";
        this.lblBatchLimit.Size = new System.Drawing.Size(92, 15);
        this.lblBatchLimit.TabIndex = 2;
        this.lblBatchLimit.Text = "Max Batch Size";
        //
        // numBatchLimit
        //
        this.numBatchLimit.Location = new System.Drawing.Point(256, 40);
        this.numBatchLimit.Maximum = 500;
        this.numBatchLimit.Minimum = 10;
        this.numBatchLimit.Name = "numBatchLimit";
        this.numBatchLimit.Size = new System.Drawing.Size(120, 23);
        this.numBatchLimit.TabIndex = 3;
        this.numBatchLimit.Value = 100;
        //
        // rtbNotes
        //
        this.rtbNotes.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) | System.Windows.Forms.AnchorStyles.Left) | System.Windows.Forms.AnchorStyles.Right)));
        this.rtbNotes.Location = new System.Drawing.Point(16, 84);
        this.rtbNotes.Name = "rtbNotes";
        this.rtbNotes.Size = new System.Drawing.Size(556, 310);
        this.rtbNotes.TabIndex = 4;
        this.rtbNotes.Text = "Fulfillment notes and carrier instructions...";
        //
        // refreshTimer
        //
        this.refreshTimer.Enabled = true;
        this.refreshTimer.Interval = 30000;
        this.refreshTimer.Tick += this.refreshTimer_Tick;
        //
        // exportDialog
        //
        this.exportDialog.DefaultExt = "csv";
        this.exportDialog.Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*";
        this.exportDialog.Title = "Export Orders";
        //
        // toolbarIcons
        //
        this.toolbarIcons.ImageSize = new System.Drawing.Size(16, 16);
        this.toolbarIcons.TransparentColor = System.Drawing.Color.Transparent;
        //
        // MainForm
        //
        this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.ClientSize = new System.Drawing.Size(860, 530);
        this.Controls.Add(this.splitMain);
        this.Controls.Add(this.statusStrip1);
        this.Controls.Add(this.toolStrip1);
        this.Controls.Add(this.menuStrip1);
        this.MainMenuStrip = this.menuStrip1;
        this.MinimumSize = new System.Drawing.Size(640, 400);
        this.Name = "MainForm";
        this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
        this.Text = "Order Manager — Desktop Console";
        this.Load += this.MainForm_Load;
        this.menuStrip1.ResumeLayout(false);
        this.menuStrip1.PerformLayout();
        this.toolStrip1.ResumeLayout(false);
        this.toolStrip1.PerformLayout();
        this.statusStrip1.ResumeLayout(false);
        this.statusStrip1.PerformLayout();
        this.splitMain.Panel1.ResumeLayout(false);
        this.splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.splitMain)).EndInit();
        this.splitMain.ResumeLayout(false);
        this.grpFilters.ResumeLayout(false);
        this.grpFilters.PerformLayout();
        this.tabWorkspace.ResumeLayout(false);
        this.tabOrders.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.dgvOrders)).EndInit();
        this.pnlOrderActions.ResumeLayout(false);
        this.tabSummary.ResumeLayout(false);
        this.tabSummary.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)(this.numBatchLimit)).EndInit();
        this.ResumeLayout(false);
        this.PerformLayout();
    }

    #endregion

    private System.Windows.Forms.MenuStrip menuStrip1;
    private System.Windows.Forms.ToolStripMenuItem fileToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem newOrderToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem exportCsvToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem editToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem viewToolStripMenuItem;
    private System.Windows.Forms.ToolStripMenuItem helpToolStripMenuItem;
    private System.Windows.Forms.ToolStrip toolStrip1;
    private System.Windows.Forms.ToolStripButton tsbNewOrder;
    private System.Windows.Forms.ToolStripButton tsbRefresh;
    private System.Windows.Forms.ToolStripSeparator toolStripSeparator1;
    private System.Windows.Forms.ToolStripButton tsbExport;
    private System.Windows.Forms.StatusStrip statusStrip1;
    private System.Windows.Forms.ToolStripStatusLabel statusLabel;
    private System.Windows.Forms.ToolStripStatusLabel statusConnection;
    private System.Windows.Forms.SplitContainer splitMain;
    private System.Windows.Forms.GroupBox grpFilters;
    private System.Windows.Forms.Label lblSearch;
    private System.Windows.Forms.TextBox txtSearch;
    private System.Windows.Forms.Label lblStatus;
    private System.Windows.Forms.ComboBox cmbStatus;
    private System.Windows.Forms.CheckBox chkPriority;
    private System.Windows.Forms.CheckBox chkArchived;
    private System.Windows.Forms.RadioButton radAllRegions;
    private System.Windows.Forms.RadioButton radNorthAmerica;
    private System.Windows.Forms.Button btnApplyFilter;
    private System.Windows.Forms.TabControl tabWorkspace;
    private System.Windows.Forms.TabPage tabOrders;
    private System.Windows.Forms.DataGridView dgvOrders;
    private System.Windows.Forms.DataGridViewTextBoxColumn colOrderId;
    private System.Windows.Forms.DataGridViewTextBoxColumn colCustomer;
    private System.Windows.Forms.DataGridViewTextBoxColumn colStatus;
    private System.Windows.Forms.DataGridViewTextBoxColumn colTotal;
    private System.Windows.Forms.DataGridViewCheckBoxColumn colShipped;
    private System.Windows.Forms.Panel pnlOrderActions;
    private System.Windows.Forms.ProgressBar progressSync;
    private System.Windows.Forms.Button btnApprove;
    private System.Windows.Forms.Button btnExport;
    private System.Windows.Forms.TabPage tabSummary;
    private System.Windows.Forms.Label lblOrderDate;
    private System.Windows.Forms.DateTimePicker dtpOrderDate;
    private System.Windows.Forms.Label lblBatchLimit;
    private System.Windows.Forms.NumericUpDown numBatchLimit;
    private System.Windows.Forms.RichTextBox rtbNotes;
    private System.Windows.Forms.Timer refreshTimer;
    private System.Windows.Forms.SaveFileDialog exportDialog;
    private System.Windows.Forms.ImageList toolbarIcons;
}
