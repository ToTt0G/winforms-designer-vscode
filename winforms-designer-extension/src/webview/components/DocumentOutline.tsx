// Document Outline: recursive control tree with selection sync, hover, drag-reparenting,
// inline rename and a context menu.

import { useEffect, useRef, useState } from 'react';
import type { DesignNode } from '../../shared/model';
import { ancestorsOf, getNode, isDescendantOf, reparentNodes, type DesignerState, type DesignerStore, type InsertTarget } from '../state/designerStore';
import { isContainerNode } from '../state/layoutEngine';
import { isRootNode } from '../state/nodeProps';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ControlIcon, Icon } from './ControlIcons';

const OUTLINE_MIME = 'application/x-winforms-outline';

export function DocumentOutline({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const doc = state.doc!;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const primary = state.selection[0];

  useEffect(() => {
    if (!primary) return;
    const anc = ancestorsOf(doc, primary);
    if (anc.some((a) => collapsed.has(a.id) || collapsed.has(`${a.id}:Panel1`) || collapsed.has(`${a.id}:Panel2`))) {
      const next = new Set(collapsed);
      anc.forEach((a) => {
        next.delete(a.id);
        next.delete(`${a.id}:Panel1`);
        next.delete(`${a.id}:Panel2`);
      });
      setCollapsed(next);
    }
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-outline-id="${CSS.escape(primary)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const onRowClick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) store.select([id], 'toggle');
    else if (e.shiftKey) store.select([id], 'add');
    else store.select([id]);
  };

  const onDrop = (e: React.DragEvent, target: InsertTarget) => {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData(OUTLINE_MIME);
    if (!id || id === target.parentId || isDescendantOf(doc, target.parentId, id)) return;
    const sel = state.selection.includes(id) ? state.selection : [id];
    const ids = sel.filter((s) => s !== target.parentId && !isDescendantOf(doc, target.parentId, s) && !isRootNode(getNode(doc, s) ?? doc.form));
    const tn = getNode(doc, target.parentId);
    store.update((d) => reparentNodes(d, ids, target, {}), `Move to ${tn?.name ?? ''}`);
  };

  const dropProps = (key: string, target: InsertTarget) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(OUTLINE_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropKey !== key) setDropKey(key);
    },
    onDragLeave: () => dropKey === key && setDropKey(null),
    onDrop: (e: React.DragEvent) => onDrop(e, target),
  });

  const renderNode = (node: DesignNode, depth: number): React.ReactNode => {
    const isContainer = isContainerNode(node);
    const hasKids = node.children.length > 0 || node.type === 'SplitContainer';
    const open = !collapsed.has(node.id);
    const selected = state.selection.includes(node.id);
    const isPrimary = primary === node.id;
    const acceptsDrop = isContainer && node.type !== 'TabControl' && node.type !== 'SplitContainer';
    const key = node.id;
    return (
      <li key={node.id} role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={selected}>
        <div
          className={`wd-tree-row ${selected ? 'selected' : ''} ${isPrimary ? 'primary' : ''} ${state.hoverId === node.id ? 'hover' : ''} ${dropKey === key ? 'drop' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-outline-id={node.id}
          draggable={!isRootNode(node) && !(state.locked || state.readOnly)}
          onDragStart={(e) => {
            e.dataTransfer.setData(OUTLINE_MIME, node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={(e) => onRowClick(e, node.id)}
          onDoubleClick={() => !isRootNode(node) && setRenaming(node.id)}
          onPointerEnter={() => store.setState({ hoverId: node.id })}
          onPointerLeave={() => store.getState().hoverId === node.id && store.setState({ hoverId: null })}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!selected) store.select([node.id]);
            setMenu({ x: e.clientX, y: e.clientY, id: node.id });
          }}
          {...(acceptsDrop ? dropProps(key, { parentId: node.id }) : {})}
        >
          <span
            className="wd-twisty"
            onClick={(e) => {
              e.stopPropagation();
              if (hasKids) toggle(node.id);
            }}
          >
            {hasKids ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} /> : null}
          </span>
          <ControlIcon type={node.type} isComponent={node.isComponent} size={14} />
          {renaming === node.id ? (
            <RenameInput
              initial={node.name}
              onDone={(v) => {
                setRenaming(null);
                if (v !== null) store.rename(node.id, v);
              }}
            />
          ) : (
            <span className="wd-tree-name">{node.name}</span>
          )}
          <span className="wd-tree-type">{node.type}</span>
        </div>
        {hasKids && open ? (
          <ul role="group">
            {node.type === 'SplitContainer'
              ? (['Panel1', 'Panel2'] as const).map((slot) => {
                  const k = `${node.id}:${slot}`;
                  const kids = node.children.filter((c) => (c.panelSlot ?? 'Panel1') === slot);
                  const so = !collapsed.has(k);
                  return (
                    <li key={slot} role="treeitem" aria-expanded={so}>
                      <div
                        className={`wd-tree-row slot ${dropKey === k ? 'drop' : ''}`}
                        style={{ paddingLeft: 6 + (depth + 1) * 14 }}
                        onClick={() => store.select([node.id])}
                        {...dropProps(k, { parentId: node.id, slot })}
                      >
                        <span
                          className="wd-twisty"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(k);
                          }}
                        >
                          {kids.length ? <Icon name={so ? 'chevronDown' : 'chevronRight'} size={12} /> : null}
                        </span>
                        <Icon name="Panel" size={14} />
                        <span className="wd-tree-name muted">
                          {node.name}.{slot}
                        </span>
                        <span className="wd-tree-type">SplitterPanel</span>
                      </div>
                      {so && kids.length ? <ul role="group">{kids.map((c) => renderNode(c, depth + 2))}</ul> : null}
                    </li>
                  );
                })
              : node.children.map((c) => renderNode(c, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const menuItems = (id: string): MenuItem[] => {
    const node = getNode(doc, id);
    const root = node ? isRootNode(node) : true;
    return [
      { id: 'rename', label: 'Rename', icon: 'edit', shortcut: 'F2', disabled: root, onSelect: () => setRenaming(id) },
      { id: 'dup', label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: root || (state.locked || state.readOnly), onSelect: () => store.duplicateSelection() },
      { id: 'del', label: 'Delete', icon: 'trash', shortcut: 'Del', disabled: root || (state.locked || state.readOnly), onSelect: () => store.deleteSelection() },
      { id: 's', separator: true },
      { id: 'front', label: 'Bring to Front', icon: 'bringToFront', disabled: root || node?.isComponent || (state.locked || state.readOnly), onSelect: () => store.zOrder('front') },
      { id: 'back', label: 'Send to Back', icon: 'sendToBack', disabled: root || node?.isComponent || (state.locked || state.readOnly), onSelect: () => store.zOrder('back') },
    ];
  };

  return (
    <section className="wd-pane wd-outline" aria-label="Document Outline">
      <div className="wd-pane-title">
        <span>Document Outline</span>
        <span className="wd-count">{state.layout.size - 1 + doc.components.length}</span>
      </div>
      <div className="wd-pane-scroll" ref={scrollRef}>
        <ul className="wd-tree" role="tree" aria-multiselectable>
          {renderNode(doc.form, 0)}
        </ul>
        {doc.components.length ? (
          <>
            <div className="wd-tree-section">Components</div>
            <ul className="wd-tree" role="tree">
              {doc.components.map((c) => renderNode(c, 0))}
            </ul>
          </>
        ) : null}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} /> : null}
    </section>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  return (
    <input
      className="wd-rename"
      autoFocus
      value={v}
      aria-label="Rename control"
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          done.current = true;
          onDone(v);
        } else if (e.key === 'Escape') {
          done.current = true;
          onDone(null);
        }
      }}
      onBlur={() => !done.current && onDone(v)}
    />
  );
}
