// Visual Studio "Tasks" smart-tag popover for the single selected control.

import type { DesignNode } from '../../shared/model';
import type { DesignerStore } from '../state/designerStore';
import { getNode, setStripItems, setTableLayout, standardMenuItems, standardToolItems, updateNode, setProps } from '../state/designerStore';
import { getTableTracks } from '../state/layoutEngine';
import { getBool, getDock, getEnum } from '../state/nodeProps';
import { Popover } from './ContextMenu';

const en = (typeName: string, value: string) => ({ kind: 'enum' as const, typeName, value });

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="wd-task-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="wd-task-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Link({ children, onClick, closes, onClose }: { children: React.ReactNode; onClick: () => void; closes?: boolean; onClose?: () => void }) {
  return (
    <button
      type="button"
      className="wd-task-link"
      onClick={() => {
        onClick();
        if (closes) onClose?.();
      }}
    >
      {children}
    </button>
  );
}

export function SmartTagPanel({
  node,
  store,
  anchor,
  onClose,
}: {
  node: DesignNode;
  store: DesignerStore;
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
}) {
  const set = (name: string, value: Parameters<DesignerStore['setProperty']>[2]) => store.setProperty([node.id], name, value);
  const dock = getDock(node);
  const readOnly = store.getState().readOnly;
  const sections: React.ReactNode[] = [];

  const docking = (
    <Link key="dock" onClick={() => set('Dock', en('DockStyle', dock === 'Fill' ? 'None' : 'Fill'))}>
      {dock === 'Fill' ? 'Undock in parent container' : 'Dock in parent container'}
    </Link>
  );

  switch (node.type) {
    case 'TextBox':
      sections.push(<Check key="ml" label="MultiLine" checked={getBool(node, 'Multiline', false)} onChange={(v) => set('Multiline', v)} />);
      break;
    case 'TabControl':
      sections.push(
        <Link key="add" onClick={() => store.addTabPage(node.id)}>
          Add Tab
        </Link>,
        <Link key="rm" onClick={() => store.removeTabPage(node.id)}>
          Remove Tab
        </Link>,
        <Link key="edit" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'tabPages', nodeId: node.id } })}>
          Edit TabPages…
        </Link>,
        docking
      );
      break;
    case 'SplitContainer': {
      const vertical = getEnum(node, 'Orientation', 'Vertical') === 'Vertical';
      sections.push(
        <Link key="or" onClick={() => set('Orientation', en('Orientation', vertical ? 'Horizontal' : 'Vertical'))}>
          {vertical ? 'Horizontal splitter orientation' : 'Vertical splitter orientation'}
        </Link>,
        docking
      );
      break;
    }
    case 'TableLayoutPanel': {
      const { columns, rows } = getTableTracks(node);
      const apply = (c: typeof columns, r: typeof rows, label: string) => store.update((d) => setTableLayout(d, node.id, c, r), label);
      const pct = { sizeType: 'Percent' as const, value: 50 };
      sections.push(
        <Link key="ac" onClick={() => apply([...columns, pct], rows, 'Add Column')}>
          Add Column
        </Link>,
        <Link key="ar" onClick={() => apply(columns, [...rows, pct], 'Add Row')}>
          Add Row
        </Link>,
        <Link key="rc" onClick={() => columns.length > 1 && apply(columns.slice(0, -1), rows, 'Remove Last Column')}>
          Remove Last Column
        </Link>,
        <Link key="rr" onClick={() => rows.length > 1 && apply(columns, rows.slice(0, -1), 'Remove Last Row')}>
          Remove Last Row
        </Link>,
        <Link key="ed" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'tableLayout', nodeId: node.id } })}>
          Edit Rows and Columns…
        </Link>,
        docking
      );
      break;
    }
    case 'DataGridView':
      sections.push(
        <Link key="ec" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'columns', nodeId: node.id } })}>
          Edit Columns…
        </Link>,
        <Check key="add" label="Enable Adding" checked={getBool(node, 'AllowUserToAddRows', true)} onChange={(v) => set('AllowUserToAddRows', v)} />,
        <Check key="edit" label="Enable Editing" checked={!getBool(node, 'ReadOnly', false)} onChange={(v) => set('ReadOnly', !v)} />,
        <Check key="del" label="Enable Deleting" checked={getBool(node, 'AllowUserToDeleteRows', true)} onChange={(v) => set('AllowUserToDeleteRows', v)} />,
        docking
      );
      break;
    case 'PictureBox':
      sections.push(
        <Link key="img" closes onClose={onClose} onClick={() => store.pickImage(node.id, 'Image')}>
          Choose Image…
        </Link>,
        <Select
          key="sm"
          label="Size Mode"
          value={getEnum(node, 'SizeMode', 'Normal')}
          options={['Normal', 'StretchImage', 'AutoSize', 'CenterImage', 'Zoom']}
          onChange={(v) => set('SizeMode', en('PictureBoxSizeMode', v))}
        />,
        docking
      );
      break;
    case 'ListBox':
    case 'ComboBox':
    case 'CheckedListBox':
    case 'DomainUpDown':
      sections.push(
        <Link key="items" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'items', nodeId: node.id } })}>
          Edit Items…
        </Link>
      );
      if (node.type === 'ComboBox')
        sections.push(
          <Select
            key="ds"
            label="Drop down style"
            value={getEnum(node, 'DropDownStyle', 'DropDown')}
            options={['Simple', 'DropDown', 'DropDownList']}
            onChange={(v) => set('DropDownStyle', en('ComboBoxStyle', v))}
          />
        );
      break;
    case 'ListView':
      sections.push(
        <Link key="cols" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'listViewColumns', nodeId: node.id } })}>
          Edit Columns…
        </Link>,
        <Select key="view" label="View" value={getEnum(node, 'View', 'LargeIcon')} options={['LargeIcon', 'Details', 'SmallIcon', 'List', 'Tile']} onChange={(v) => set('View', en('View', v))} />,
        docking
      );
      break;
    case 'TreeView':
      sections.push(
        <Link key="nodes" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'treeNodes', nodeId: node.id } })}>
          Edit Nodes…
        </Link>,
        docking
      );
      break;
    case 'MenuStrip':
    case 'ToolStrip':
    case 'StatusStrip':
    case 'ContextMenuStrip':
      if (node.type === 'MenuStrip' || node.type === 'ToolStrip') {
        sections.push(
          <Link
            key="std"
            onClick={() => {
              // Always name against the live document so repeated inserts get fresh, unique field names.
              store.update((d) => {
                const fresh = getNode(d, node.id);
                const items = node.type === 'MenuStrip' ? standardMenuItems(d) : standardToolItems(d);
                return setStripItems(d, node.id, [...(fresh?.stripItems ?? []), ...items]);
              }, 'Insert Standard Items');
            }}
          >
            Insert Standard Items
          </Link>
        );
      }
      sections.push(
        <Link key="items" closes onClose={onClose} onClick={() => store.setState({ collectionEditor: { kind: 'stripItems', nodeId: node.id } })}>
          Edit Items…
        </Link>
      );
      if (!node.isComponent)
        sections.push(
          <Select
            key="dock"
            label="Dock"
            value={dock}
            options={['None', 'Top', 'Bottom', 'Left', 'Right', 'Fill']}
            onChange={(v) => set('Dock', en('DockStyle', v))}
          />
        );
      if (node.type === 'ToolStrip')
        sections.push(
          <Select
            key="grip"
            label="GripStyle"
            value={getEnum(node, 'GripStyle', 'Visible')}
            options={['Visible', 'Hidden']}
            onChange={(v) => store.update((d) => updateNode(d, node.id, (n) => setProps(n, { GripStyle: en('ToolStripGripStyle', v) })), 'Set GripStyle')}
          />
        );
      break;
    default:
      if (!node.isComponent) sections.push(docking);
  }

  return (
    <Popover anchor={anchor} onClose={onClose} placement="right" className="wd-smarttag-panel">
      <div className="wd-task-title">{node.type} Tasks</div>
      {readOnly ? <div className="wd-task-readonly">Read-only — tasks are unavailable.</div> : null}
      <fieldset className="wd-task-body" disabled={readOnly}>
        {sections.length ? sections : <span className="wd-muted">No tasks for this control.</span>}
      </fieldset>
    </Popover>
  );
}
