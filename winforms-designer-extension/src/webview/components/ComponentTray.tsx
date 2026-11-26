// Component tray: non-visual components (Timer, dialogs, ImageList...) below the canvas.

import { useState } from 'react';
import { getControlDefinition } from '../../shared/catalog';
import type { DesignerState, DesignerStore } from '../state/designerStore';
import { ControlIcon, Icon } from './ControlIcons';
import { TOOLBOX_MIME } from './DesignCanvas';

export function ComponentTray({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const doc = state.doc!;
  const [collapsed, setCollapsed] = useState(false);
  const [over, setOver] = useState(false);
  const draggingComponent = !!state.draggingToolboxType && !!getControlDefinition(state.draggingToolboxType)?.isComponent;
  if (doc.components.length === 0 && !draggingComponent) return null;
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
                className={`wd-chip ${sel ? 'selected' : ''} ${state.selection[0] === c.id ? 'primary' : ''}`}
                title={`${c.name} (${c.fullTypeName ?? c.type})`}
                onClick={(e) => store.select([c.id], e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}
                onDoubleClick={() => store.navigateToDefaultEvent(c.id)}
              >
                <ControlIcon type={c.type} isComponent size={14} />
                <span>{c.name}</span>
              </button>
            );
          })}
          {draggingComponent ? <span className="wd-chip ghost">Drop component here</span> : null}
        </div>
      )}
    </section>
  );
}
