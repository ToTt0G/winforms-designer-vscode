// Toolbox: searchable, categorized controls with drag-drop, click-to-arm and double-click insert.

import { memo, useMemo, useRef, useState } from 'react';
import { getToolboxControls, TOOLBOX_CATEGORIES, type ControlDefinition } from '../../shared/catalog';
import type { DesignerStore } from '../state/designerStore';
import { Icon } from './ControlIcons';
import { TOOLBOX_MIME } from './DesignCanvas';

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('wd.toolbox.collapsed') ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export const Toolbox = memo(function Toolbox({ store, placementTool }: { store: DesignerStore; placementTool: string | null }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const ghostRef = useRef<HTMLDivElement>(null);
  const controls = useMemo(() => getToolboxControls(), []);
  const q = query.trim().toLowerCase();
  const filtered = q ? controls.filter((c) => c.displayName.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)) : controls;

  const toggle = (cat: string) => {
    const next = { ...collapsed, [cat]: !collapsed[cat] };
    setCollapsed(next);
    try {
      localStorage.setItem('wd.toolbox.collapsed', JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const onDragStart = (e: React.DragEvent, def: ControlDefinition) => {
    e.dataTransfer.setData(TOOLBOX_MIME, def.type);
    e.dataTransfer.setData('text/plain', def.type);
    e.dataTransfer.effectAllowed = 'copy';
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.textContent = def.displayName;
      e.dataTransfer.setDragImage(ghost, -10, -8);
    }
    store.setState({ draggingToolboxType: def.type, placementTool: null });
  };

  const renderItem = (def: ControlDefinition) => (
    <li key={def.type}>
      <button
        type="button"
        className={`wd-tool ${placementTool === def.type ? 'armed' : ''}`}
        draggable
        title={`${def.displayName}\n${def.description}`}
        data-control-type={def.type}
        aria-pressed={placementTool === def.type}
        onDragStart={(e) => onDragStart(e, def)}
        onDragEnd={() => store.setState({ draggingToolboxType: null })}
        onClick={() => store.setState({ placementTool: placementTool === def.type ? null : def.type, tabOrderMode: false })}
        onDoubleClick={() => {
          store.setState({ placementTool: null });
          store.addControl(def.type);
        }}
      >
        <Icon name={def.type} />
        <span>{def.displayName}</span>
        {def.isComponent ? <span className="wd-tool-tag">tray</span> : null}
      </button>
    </li>
  );

  return (
    <section className="wd-pane wd-toolbox" aria-label="Toolbox">
      <div className="wd-pane-title">
        <span>Toolbox</span>
      </div>
      <div className="wd-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          placeholder="Search toolbox"
          aria-label="Search toolbox"
          data-testid="toolbox-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
            if (e.key === 'Enter' && filtered[0]) store.addControl(filtered[0].type);
          }}
        />
        {query ? (
          <button type="button" className="wd-icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="close" size={12} />
          </button>
        ) : null}
      </div>
      <div className="wd-pane-scroll">
        <button type="button" className={`wd-tool pointer ${placementTool ? '' : 'armed'}`} onClick={() => store.setState({ placementTool: null })}>
          <Icon name="Pointer" />
          <span>Pointer</span>
        </button>
        {TOOLBOX_CATEGORIES.map((cat) => {
          const items = filtered.filter((c) => c.category === cat);
          if (!items.length) return null;
          const isCollapsed = !q && collapsed[cat];
          return (
            <div key={cat} className="wd-tool-cat">
              <button type="button" className="wd-cat-header" aria-expanded={!isCollapsed} onClick={() => toggle(cat)}>
                <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} />
                <span>{cat}</span>
                <span className="wd-count">{items.length}</span>
              </button>
              {isCollapsed ? null : <ul>{items.map(renderItem)}</ul>}
            </div>
          );
        })}
        {filtered.length === 0 ? <p className="wd-empty">No controls match “{query}”.</p> : null}
      </div>
      <div ref={ghostRef} className="wd-drag-ghost" aria-hidden />
    </section>
  );
});
