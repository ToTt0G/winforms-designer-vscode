
namespace SWD4CS
{
    internal class cls_treenode : TreeNode
    {
        // The control whose children belong under this node. A SplitContainer contributes one
        // node per panel, so there the container is the SplitterPanel, not the SplitContainer.
        // Nodes are matched on this reference rather than on Text, so two controls sharing a
        // name in different containers cannot be attached to the wrong parent.
        internal Control Container { get; }

        public cls_treenode(string nodeName, Control container)
        {
            this.Text = nodeName;
            this.Container = container;
        }

        internal void AddChild(cls_treenode child)
        {
            this.Nodes.Add(child);
            this.Expand();
        }
    }
}
