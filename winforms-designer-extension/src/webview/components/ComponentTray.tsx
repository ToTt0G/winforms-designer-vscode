// Component tray: non-visual components (Timer, dialogs, ImageList...) below the canvas.

import { useState } from 'react';
import { getControlDefinition } from '../../shared/catalog';
import { getNode, type DesignerState, type DesignerStore } from '../state/designerStore';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ControlIcon, Icon } from './ControlIcons';
import { TOOLBOX_MIME } from './DesignCanvas';

export function ComponentTray({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const doc = state.doc!;
  const [collapsed, setCollapsed] = useState(false);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const draggingComponent = !!state.draggingToolboxType && !!getControlDefinition(state.draggingToolboxType)?.isComponent;
  if (doc.components.length === 0 && !draggingComponent) return null;

  const menuItems = (id: string): MenuItem[] => {
    const node = getNode(doc, id);
    const selNodes = state.selection.map((sid) => getNode(doc, sid)).filter(Boolean);
    const hasInherited = !!node?.inherited || selNodes.some((n) => n?.inherited);
    const frozen = state.locked || state.readOnly || hasInherited;
    return [
      { id: 'event', label: 'View Default Event', icon: 'code', onSelect: () => store.navigateToDefaultEvent(id) },
      { id: 's0', separator: true },
      { id: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', disabled: frozen, onSelect: () => store.copySelection(true) },
      { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onSelect: () => store.copySelection() },
      { id: 'dup', label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: frozen, onSelect: () => store.duplicateSelection() },
      { id: 'del', label: 'Delete', icon: 'trash', shortcut: 'Del', disabled: frozen, onSelect: () => store.deleteSelection() },
    ];
  };

  return (
    <section
      className={`wd-tray ${over ? 'drop' : ''} ${draggingComponent ? 'awaiting' : ''}`}
      aria-label="Component tray"
      onDragOver={(e) => {
        if (!draggingComponent) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const type = e.dataTransfer.getData(TOOLBOX_MIME) || state.draggingToolboxType;
        store.setState({ draggingToolboxType: null });
        if (type && getControlDefinition(type)?.isComponent) {
          e.preventDefault();
          store.addControl(type);
        }
      }}
    >
      <button type="button" className="wd-tray-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
        <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
        <span>Components</span>
        <span className="wd-count">{doc.components.length}</span>
      </button>
      {collapsed ? null : (
        <div className="wd-tray-items" role="listbox" aria-label="Components" aria-multiselectable>
          {doc.components.map((c) => {
            const sel = state.selection.includes(c.id);
            return (
              <button
                type="button"
                role="option"
                aria-selected={sel}
                key={c.id}
                className={`wd-chip ${sel ? 'selected' : ''} ${state.selection[0] === c.id ? 'primary' : ''} ${c.inherited ? 'inherited' : ''}`}
                title={`${c.name} (${c.fullTypeName ?? c.type})${c.inherited ? ` — inherited from ${c.inheritedFrom ?? 'base class'}` : ''}`}
                onClick={(e) => store.select([c.id], e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}
                onDoubleClick={() => store.navigateToDefaultEvent(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!sel) store.select([c.id]);
                  setMenu({ x: e.clientX, y: e.clientY, id: c.id });
                }}
              >
                <ControlIcon type={c.type} isComponent size={14} />
                <span>{c.name}</span>
              </button>
            );
          })}
          {draggingComponent ? <span className="wd-chip ghost">Drop component here</span> : null}
        </div>
      )}
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} /> : null}
    </section>
  );
}
