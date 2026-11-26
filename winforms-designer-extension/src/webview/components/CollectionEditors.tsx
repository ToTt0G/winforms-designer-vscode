// Modal collection editors: Items, DataGridView Columns, TabPages, Strip Items,
// TableLayoutPanel Rows & Columns, TreeView Nodes, ListView Columns and DataBindings.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataBindingEntry, DataGridViewColumnNode, DesignDocument, DesignNode, ListViewColumnNode, StripItemNode, TableTrackStyle, TreeNodeItem } from '../../shared/model';
import {
  collectNames,
  createTabPage,
  getNode,
  isValidIdentifier,
  newGridColumn,
  newStripItem,
  setGridColumns,
  setProps,
  setItems,
  setListViewColumns,
  setStripItems,
  setTableLayout,
  setTabPages,
  setTreeNodes,
  uid,
  type CollectionEditorKind,
  type DesignerStore,
} from '../state/designerStore';
import { getTableTracks } from '../state/layoutEngine';
import { displayText, getText } from '../state/nodeProps';
import { ControlIcon, Icon } from './ControlIcons';

function Modal({ title, subtitle, children, onCancel, onOk, okDisabled, wide }: { title: string; subtitle?: string; children: ReactNode; onCancel: () => void; onOk: () => void; okDisabled?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button:not(.wd-modal-close)');
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="wd-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        className={`wd-modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !okDisabled) onOk();
          if (e.key === 'Tab') {
            const f = [...(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]') ?? [])].filter((el) => !el.hasAttribute('disabled'));
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) {
              e.preventDefault();
              f[f.length - 1].focus();
            } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
              e.preventDefault();
              f[0].focus();
            }
          }
        }}
      >
        <header className="wd-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="wd-icon-btn wd-modal-close" aria-label="Close" onClick={onCancel}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="wd-modal-body">{children}</div>
        <footer className="wd-modal-foot">
          <button type="button" className="wd-btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="wd-btn" disabled={okDisabled} onClick={onOk}>
            OK
          </button>
        </footer>
      </div>
    </div>
  );
}

function ListToolbar({ onAdd, onRemove, onUp, onDown, canRemove, canUp, canDown, extra }: { onAdd?: () => void; onRemove: () => void; onUp: () => void; onDown: () => void; canRemove: boolean; canUp: boolean; canDown: boolean; extra?: ReactNode }) {
  return (
    <div className="wd-list-toolbar">
      {extra}
      {onAdd ? (
        <button type="button" className="wd-btn small" onClick={onAdd}>
          <Icon name="plus" size={12} /> Add
        </button>
      ) : null}
      <button type="button" className="wd-icon-btn" aria-label="Remove" title="Remove" disabled={!canRemove} onClick={onRemove}>
        <Icon name="trash" size={14} />
      </button>
      <button type="button" className="wd-icon-btn" aria-label="Move up" title="Move up" disabled={!canUp} onClick={onUp}>
        <Icon name="arrowUp" size={14} />
      </button>
      <button type="button" className="wd-icon-btn" aria-label="Move down" title="Move down" disabled={!canDown} onClick={onDown}>
        <Icon name="arrowDown" size={14} />
      </button>
    </div>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="wd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------

function ItemsEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const [text, setText] = useState((node.items ?? []).join('\n'));
  const lines = text.split(/\r?\n/);
  const items = text === '' ? [] : lines;
  return (
    <Modal
      title="String Collection Editor"
      subtitle={`${node.name}.Items — enter one item per line`}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setItems(d, node.id, items), `Edit ${node.name}.Items`);
        onClose();
      }}
    >
      <textarea className="wd-items-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Items, one per line" />
      <p className="wd-modal-meta">{items.length} item{items.length === 1 ? '' : 's'}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const COLUMN_TYPES: DataGridViewColumnNode['columnType'][] = [
  'DataGridViewTextBoxColumn',
  'DataGridViewButtonColumn',
  'DataGridViewCheckBoxColumn',
  'DataGridViewComboBoxColumn',
  'DataGridViewImageColumn',
  'DataGridViewLinkColumn',
];

function validateNames(doc: DesignDocument, originalIds: Set<string>, names: { id: string; name: string }[]): string | null {
  const taken = collectNames(doc);
  for (const id of originalIds) {
    const orig = findAnyName(doc, id);
    if (orig) taken.delete(orig);
  }
  const seen = new Set<string>();
  for (const n of names) {
    if (!isValidIdentifier(n.name)) return `"${n.name}" is not a valid C# identifier.`;
    if (taken.has(n.name) || seen.has(n.name)) return `The name "${n.name}" is already in use.`;
    seen.add(n.name);
  }
  return null;
}

function findAnyName(doc: DesignDocument, id: string): string | undefined {
  const n = getNode(doc, id);
  if (n) return n.name;
  let found: string | undefined;
  const walk = (node: DesignNode) => {
    node.columns?.forEach((c) => c.id === id && (found = c.name));
    node.listViewColumns?.forEach((c) => c.id === id && (found = c.name));
    const rec = (items?: StripItemNode[]) => items?.forEach((i) => (i.id === id ? (found = i.name) : rec(i.dropDownItems)));
    rec(node.stripItems);
    node.children.forEach(walk);
  };
  walk(doc.form);
  doc.components.forEach(walk);
  return found;
}

/**
 * Changing a parsed column's type must be flagged so the generator rewrites its constructor
 * (`new DataGridViewButtonColumn()`) instead of preserving the original declaration.
 */
function columnTypePatch(node: DesignNode, col: DataGridViewColumnNode, columnType: DataGridViewColumnNode['columnType']): Partial<DataGridViewColumnNode> {
  if (columnType === col.columnType) return {};
  const original = node.columns?.find((c) => c.id === col.id);
  if (!original) return { columnType }; // brand-new column: its type is emitted as authored
  return { columnType, explicitTypeChanged: columnType !== original.columnType || !!original.explicitTypeChanged };
}

function ColumnsEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const doc = store.getState().doc!;
  const [cols, setCols] = useState<DataGridViewColumnNode[]>(node.columns ?? []);
  const [sel, setSel] = useState(0);
  const [addType, setAddType] = useState<DataGridViewColumnNode['columnType']>('DataGridViewTextBoxColumn');
  const cur = cols[sel];
  const orig = useMemo(() => new Set((node.columns ?? []).map((c) => c.id)), [node.columns]);
  const error = validateNames(doc, orig, cols);
  const patch = (p: Partial<DataGridViewColumnNode>) => setCols(cols.map((c, i) => (i === sel ? { ...c, ...p } : c)));
  return (
    <Modal
      wide
      title="Edit Columns"
      subtitle={`${node.name}.Columns`}
      okDisabled={!!error}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setGridColumns(d, node.id, cols), `Edit ${node.name}.Columns`);
        onClose();
      }}
    >
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            extra={
              <select className="wd-pg-select" value={addType} aria-label="Column type to add" onChange={(e) => setAddType(e.target.value as DataGridViewColumnNode['columnType'])}>
                {COLUMN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('DataGridView', '').replace('Column', '')}
                  </option>
                ))}
              </select>
            }
            onAdd={() => {
              const taken = new Set([...collectNames(doc), ...cols.map((c) => c.name)]);
              const c = newGridColumn(doc, addType, taken);
              setCols([...cols, c]);
              setSel(cols.length);
            }}
            onRemove={() => {
              setCols(cols.filter((_, i) => i !== sel));
              setSel(Math.max(0, sel - 1));
            }}
            onUp={() => {
              setCols(move(cols, sel, -1));
              setSel(Math.max(0, sel - 1));
            }}
            onDown={() => {
              setCols(move(cols, sel, 1));
              setSel(Math.min(cols.length - 1, sel + 1));
            }}
            canRemove={!!cur}
            canUp={sel > 0}
            canDown={sel < cols.length - 1}
          />
          <ul className="wd-se-items" role="listbox" aria-label="Columns">
            {cols.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
                <ControlIcon type={c.columnType} size={14} />
                <span>{c.headerText || c.name}</span>
                <em>{c.name}</em>
              </li>
            ))}
            {cols.length === 0 ? <li className="wd-empty">No columns. Add one to start.</li> : null}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Name">
                <input className="wd-pg-input mono" value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="HeaderText">
                <input className="wd-pg-input" value={cur.headerText} onChange={(e) => patch({ headerText: e.target.value })} />
              </Field>
              <Field label="ColumnType">
                <select className="wd-pg-select" value={cur.columnType} onChange={(e) => patch(columnTypePatch(node, cur, e.target.value as DataGridViewColumnNode['columnType']))}>
                  {COLUMN_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Width">
                <input className="wd-pg-input" type="number" min={2} value={cur.width ?? 100} onChange={(e) => patch({ width: Math.max(2, Number(e.target.value) || 100) })} />
              </Field>
              <Field label="ReadOnly">
                <input type="checkbox" checked={!!cur.readOnly} onChange={(e) => patch({ readOnly: e.target.checked })} />
              </Field>
              <Field label="Visible">
                <input type="checkbox" checked={cur.visible !== false} onChange={(e) => patch({ visible: e.target.checked })} />
              </Field>
            </>
          ) : (
            <p className="wd-empty">Select a column to edit its properties.</p>
          )}
          {error ? <p className="wd-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function TabPagesEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const doc = store.getState().doc!;
  const [pages, setPages] = useState<DesignNode[]>(node.children);
  const [sel, setSel] = useState(0);
  const cur = pages[sel];
  const orig = useMemo(() => new Set(node.children.map((c) => c.id)), [node.children]);
  const error = validateNames(doc, orig, pages);
  const patch = (fn: (p: DesignNode) => DesignNode) => setPages(pages.map((p, i) => (i === sel ? fn(p) : p)));
  return (
    <Modal
      wide
      title="TabPage Collection Editor"
      subtitle={`${node.name}.TabPages`}
      okDisabled={!!error}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setTabPages(d, node.id, pages), `Edit ${node.name}.TabPages`);
        onClose();
      }}
    >
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            onAdd={() => {
              const taken = new Set([...collectNames(doc), ...pages.map((p) => p.name)]);
              const p = createTabPage(doc, taken, pages.length);
              const tmpl = pages[0];
              if (tmpl?.properties.Location) p.properties.Location = tmpl.properties.Location;
              if (tmpl?.properties.Size) p.properties.Size = tmpl.properties.Size;
              setPages([...pages, p]);
              setSel(pages.length);
            }}
            onRemove={() => {
              setPages(pages.filter((_, i) => i !== sel));
              setSel(Math.max(0, sel - 1));
            }}
            onUp={() => {
              setPages(move(pages, sel, -1));
              setSel(Math.max(0, sel - 1));
            }}
            onDown={() => {
              setPages(move(pages, sel, 1));
              setSel(Math.min(pages.length - 1, sel + 1));
            }}
            canRemove={!!cur}
            canUp={sel > 0}
            canDown={sel < pages.length - 1}
          />
          <ul className="wd-se-items" role="listbox" aria-label="Tab pages">
            {pages.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
                <Icon name="TabPage" size={14} />
                <span>{displayText(getText(p)) || p.name}</span>
                <em>{p.name}</em>
              </li>
            ))}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Name">
                <input className="wd-pg-input mono" value={cur.name} onChange={(e) => patch((p) => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Text">
                <input className="wd-pg-input" value={getText(cur)} onChange={(e) => patch((p) => setProps(p, { Text: e.target.value }))} />
              </Field>
              <p className="wd-modal-meta">{cur.children.length} control{cur.children.length === 1 ? '' : 's'} on this page</p>
            </>
          ) : (
            <p className="wd-empty">No tab pages.</p>
          )}
          {error ? <p className="wd-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const STRIP_TYPES: Record<string, StripItemNode['type'][]> = {
  MenuStrip: ['ToolStripMenuItem', 'ToolStripComboBox', 'ToolStripTextBox', 'ToolStripSeparator'],
  ContextMenuStrip: ['ToolStripMenuItem', 'ToolStripComboBox', 'ToolStripTextBox', 'ToolStripSeparator'],
  ToolStrip: ['ToolStripButton', 'ToolStripLabel', 'ToolStripSplitButton', 'ToolStripDropDownButton', 'ToolStripSeparator', 'ToolStripComboBox', 'ToolStripTextBox', 'ToolStripProgressBar'],
  StatusStrip: ['ToolStripStatusLabel', 'ToolStripProgressBar', 'ToolStripDropDownButton', 'ToolStripSplitButton'],
};

type Path = number[];

function getAt(items: StripItemNode[], path: Path): StripItemNode | undefined {
  let list = items;
  let it: StripItemNode | undefined;
  for (const i of path) {
    it = list[i];
    if (!it) return undefined;
    list = it.dropDownItems ?? [];
  }
  return it;
}

function updateList(items: StripItemNode[], parentPath: Path, fn: (list: StripItemNode[]) => StripItemNode[]): StripItemNode[] {
  if (parentPath.length === 0) return fn(items);
  const [h, ...rest] = parentPath;
  return items.map((it, i) => (i === h ? { ...it, dropDownItems: updateList(it.dropDownItems ?? [], rest, fn) } : it));
}

function flattenItems(items: StripItemNode[], out: { id: string; name: string }[] = []) {
  for (const it of items) {
    out.push({ id: it.id, name: it.name });
    flattenItems(it.dropDownItems ?? [], out);
  }
  return out;
}

function StripItemsEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const doc = store.getState().doc!;
  const [items, setItemsState] = useState<StripItemNode[]>(node.stripItems ?? []);
  const [sel, setSel] = useState<Path>(items.length ? [0] : []);
  const types = STRIP_TYPES[node.type] ?? STRIP_TYPES.ToolStrip;
  const [addType, setAddType] = useState<StripItemNode['type']>(types[0]);
  const cur = sel.length ? getAt(items, sel) : undefined;
  const orig = useMemo(() => new Set(flattenItems(node.stripItems ?? []).map((i) => i.id)), [node.stripItems]);
  const flat = flattenItems(items);
  const error = validateNames(doc, orig, flat);
  const parentPath = sel.slice(0, -1);
  const idx = sel[sel.length - 1] ?? -1;
  const siblings = parentPath.length ? getAt(items, parentPath)?.dropDownItems ?? [] : items;
  const taken = () => new Set([...collectNames(doc), ...flat.map((f) => f.name)]);

  const add = (asChild: boolean) => {
    const it = newStripItem(doc, asChild ? 'ToolStripMenuItem' : addType, undefined, taken());
    if (asChild && cur) {
      setItemsState(updateList(items, sel, (l) => [...l, it]));
      setSel([...sel, (cur.dropDownItems ?? []).length]);
    } else {
      const pp = cur ? parentPath : [];
      const list = pp.length ? getAt(items, pp)?.dropDownItems ?? [] : items;
      setItemsState(updateList(items, pp, (l) => [...l, it]));
      setSel([...pp, list.length]);
    }
  };

  const renderTree = (list: StripItemNode[], base: Path, depth: number): ReactNode =>
    list.map((it, i) => {
      const path = [...base, i];
      const on = path.join('.') === sel.join('.');
      return (
        <div key={it.id}>
          <li role="treeitem" aria-selected={on} className={on ? 'on' : ''} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setSel(path)}>
            <ControlIcon type={it.type} size={14} />
            <span>{it.type === 'ToolStripSeparator' ? '———' : displayText(it.text ?? '') || it.name}</span>
            <em>{it.name}</em>
          </li>
          {it.dropDownItems?.length ? renderTree(it.dropDownItems, path, depth + 1) : null}
        </div>
      );
    });

  const patch = (p: Partial<StripItemNode>) => setItemsState(updateList(items, parentPath, (l) => l.map((x, i) => (i === idx ? { ...x, ...p } : x))));

  return (
    <Modal
      wide
      title="Items Collection Editor"
      subtitle={`${node.name}.Items`}
      okDisabled={!!error}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setStripItems(d, node.id, items), `Edit ${node.name}.Items`);
        onClose();
      }}
    >
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            extra={
              <select className="wd-pg-select" value={addType} aria-label="Item type to add" onChange={(e) => setAddType(e.target.value as StripItemNode['type'])}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('ToolStrip', '')}
                  </option>
                ))}
              </select>
            }
            onAdd={() => add(false)}
            onRemove={() => {
              setItemsState(updateList(items, parentPath, (l) => l.filter((_, i) => i !== idx)));
              setSel(idx > 0 ? [...parentPath, idx - 1] : parentPath);
            }}
            onUp={() => {
              setItemsState(updateList(items, parentPath, (l) => move(l, idx, -1)));
              setSel([...parentPath, Math.max(0, idx - 1)]);
            }}
            onDown={() => {
              setItemsState(updateList(items, parentPath, (l) => move(l, idx, 1)));
              setSel([...parentPath, Math.min(siblings.length - 1, idx + 1)]);
            }}
            canRemove={!!cur}
            canUp={idx > 0}
            canDown={idx >= 0 && idx < siblings.length - 1}
          />
          <ul className="wd-se-items" role="tree" aria-label="Items">
            {renderTree(items, [], 0)}
            {items.length === 0 ? <li className="wd-empty">No items yet.</li> : null}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Type">
                <span className="wd-readonly mono">{cur.type}</span>
              </Field>
              <Field label="Name">
                <input className="wd-pg-input mono" value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              {cur.type !== 'ToolStripSeparator' ? (
                <Field label="Text">
                  <input className="wd-pg-input" value={cur.text ?? ''} onChange={(e) => patch({ text: e.target.value })} />
                </Field>
              ) : null}
              {cur.type === 'ToolStripMenuItem' || cur.type === 'ToolStripDropDownButton' || cur.type === 'ToolStripSplitButton' ? (
                <button type="button" className="wd-btn small secondary" onClick={() => add(true)}>
                  <Icon name="plus" size={12} /> Add drop-down item
                </button>
              ) : null}
            </>
          ) : (
            <p className="wd-empty">Select an item to edit it.</p>
          )}
          {error ? <p className="wd-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function TableLayoutEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const t = getTableTracks(node);
  const [cols, setCols] = useState<TableTrackStyle[]>(t.columns);
  const [rows, setRows] = useState<TableTrackStyle[]>(t.rows);
  const [which, setWhich] = useState<'columns' | 'rows'>('columns');
  const [sel, setSel] = useState(0);
  const list = which === 'columns' ? cols : rows;
  const setList = which === 'columns' ? setCols : setRows;
  const cur = list[sel];
  const patch = (p: Partial<TableTrackStyle>) => setList(list.map((x, i) => (i === sel ? { ...x, ...p } : x)));
  const pctTotal = list.reduce((a, x) => a + (x.sizeType === 'Percent' ? x.value : 0), 0);
  return (
    <Modal
      wide
      title="Column and Row Styles"
      subtitle={`${node.name}`}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setTableLayout(d, node.id, cols, rows), `Edit ${node.name} rows and columns`);
        onClose();
      }}
    >
      <div className="wd-tabs" role="tablist">
        {(['columns', 'rows'] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={which === w}
            className={which === w ? 'on' : ''}
            onClick={() => {
              setWhich(w);
              setSel(0);
            }}
          >
            {w === 'columns' ? `Columns (${cols.length})` : `Rows (${rows.length})`}
          </button>
        ))}
      </div>
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            onAdd={() => {
              setList([...list, { sizeType: 'Percent', value: 50 }]);
              setSel(list.length);
            }}
            onRemove={() => {
              if (list.length <= 1) return;
              setList(list.filter((_, i) => i !== sel));
              setSel(Math.max(0, sel - 1));
            }}
            onUp={() => {
              setList(move(list, sel, -1));
              setSel(Math.max(0, sel - 1));
            }}
            onDown={() => {
              setList(move(list, sel, 1));
              setSel(Math.min(list.length - 1, sel + 1));
            }}
            canRemove={list.length > 1}
            canUp={sel > 0}
            canDown={sel < list.length - 1}
          />
          <ul className="wd-se-items" role="listbox" aria-label={which}>
            {list.map((x, i) => (
              <li key={i} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
                <span>
                  {which === 'columns' ? 'Column' : 'Row'}
                  {i + 1}
                </span>
                <em>{x.sizeType === 'AutoSize' ? 'AutoSize' : x.sizeType === 'Percent' ? `${+x.value.toFixed(2)}%` : `${x.value}px`}</em>
              </li>
            ))}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <div className="wd-size-type" role="radiogroup" aria-label="Size type">
                {(['Absolute', 'Percent', 'AutoSize'] as const).map((st) => (
                  <label key={st}>
                    <input type="radio" name="sizeType" checked={cur.sizeType === st} onChange={() => patch({ sizeType: st, value: st === 'Absolute' ? 100 : st === 'Percent' ? 50 : 0 })} />
                    <span>{st}</span>
                  </label>
                ))}
              </div>
              {cur.sizeType !== 'AutoSize' ? (
                <Field label={cur.sizeType === 'Percent' ? 'Percent' : 'Pixels'}>
                  <input className="wd-pg-input" type="number" min={0} value={cur.value} onChange={(e) => patch({ value: Math.max(0, Number(e.target.value) || 0) })} />
                </Field>
              ) : null}
              {pctTotal > 0 ? <p className="wd-modal-meta">Percent tracks share the remaining space by ratio ({+pctTotal.toFixed(2)}% total).</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// TreeView.Nodes
// ---------------------------------------------------------------------------

function getTreeAt(items: TreeNodeItem[], path: Path): TreeNodeItem | undefined {
  let list = items;
  let it: TreeNodeItem | undefined;
  for (const i of path) {
    it = list[i];
    if (!it) return undefined;
    list = it.children ?? [];
  }
  return it;
}

function updateTreeList(items: TreeNodeItem[], parentPath: Path, fn: (list: TreeNodeItem[]) => TreeNodeItem[]): TreeNodeItem[] {
  if (parentPath.length === 0) return fn(items);
  const [h, ...rest] = parentPath;
  return items.map((it, i) => (i === h ? { ...it, children: updateTreeList(it.children ?? [], rest, fn) } : it));
}

function countTree(items: TreeNodeItem[]): number {
  return items.reduce((a, it) => a + 1 + countTree(it.children ?? []), 0);
}

function nextTreeNodeName(items: TreeNodeItem[]): string {
  const taken = new Set<string>();
  const walk = (l: TreeNodeItem[]) =>
    l.forEach((it) => {
      if (it.name) taken.add(it.name);
      walk(it.children ?? []);
    });
  walk(items);
  let i = 0;
  while (taken.has(`Node${i}`)) i++;
  return `Node${i}`;
}

function TreeNodesEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const [items, setItemsState] = useState<TreeNodeItem[]>(node.treeNodes ?? []);
  const [sel, setSel] = useState<Path>(items.length ? [0] : []);
  const cur = sel.length ? getTreeAt(items, sel) : undefined;
  const parentPath = sel.slice(0, -1);
  const idx = sel[sel.length - 1] ?? -1;
  const siblings = parentPath.length ? getTreeAt(items, parentPath)?.children ?? [] : items;

  const make = (): TreeNodeItem => {
    const name = nextTreeNodeName(items);
    return { id: uid('tn'), name, text: name };
  };
  const addRoot = () => {
    setItemsState([...items, make()]);
    setSel([items.length]);
  };
  const addChild = () => {
    if (!cur) return;
    setItemsState(updateTreeList(items, sel, (l) => [...l, make()]));
    setSel([...sel, (cur.children ?? []).length]);
  };
  const patch = (p: Partial<TreeNodeItem>) => setItemsState(updateTreeList(items, parentPath, (l) => l.map((x, i) => (i === idx ? { ...x, ...p } : x))));

  const renderTree = (list: TreeNodeItem[], base: Path, depth: number): ReactNode =>
    list.map((it, i) => {
      const path = [...base, i];
      const on = path.join('.') === sel.join('.');
      return (
        <div key={it.id} role="none">
          <li role="treeitem" aria-level={depth + 1} aria-selected={on} className={on ? 'on' : ''} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setSel(path)}>
            <Icon name={it.children?.length ? 'chevronDown' : 'TreeView'} size={12} />
            <span>{it.text || '(empty)'}</span>
            <em>{it.name}</em>
          </li>
          {it.children?.length ? renderTree(it.children, path, depth + 1) : null}
        </div>
      );
    });

  const renderPreview = (list: TreeNodeItem[], depth: number): ReactNode =>
    list.map((it) => (
      <div key={it.id}>
        <div className="wd-tn-preview-row" style={{ paddingLeft: 4 + depth * 16 }}>
          <span className="wd-tn-preview-toggle">{it.children?.length ? '▾' : ''}</span>
          <span className={cur?.id === it.id ? 'on' : ''}>{it.text}</span>
        </div>
        {it.children?.length ? renderPreview(it.children, depth + 1) : null}
      </div>
    ));

  return (
    <Modal
      wide
      title="TreeNode Editor"
      subtitle={`${node.name}.Nodes — ${countTree(items)} node${countTree(items) === 1 ? '' : 's'}`}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setTreeNodes(d, node.id, items), `Edit ${node.name}.Nodes`);
        onClose();
      }}
    >
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            extra={
              <>
                <button type="button" className="wd-btn small" onClick={addRoot} data-testid="tn-add-root">
                  <Icon name="plus" size={12} /> Add Root
                </button>
                <button type="button" className="wd-btn small secondary" disabled={!cur} onClick={addChild} data-testid="tn-add-child">
                  <Icon name="plus" size={12} /> Add Child
                </button>
              </>
            }
            onRemove={() => {
              setItemsState(updateTreeList(items, parentPath, (l) => l.filter((_, i) => i !== idx)));
              setSel(idx > 0 ? [...parentPath, idx - 1] : parentPath);
            }}
            onUp={() => {
              setItemsState(updateTreeList(items, parentPath, (l) => move(l, idx, -1)));
              setSel([...parentPath, Math.max(0, idx - 1)]);
            }}
            onDown={() => {
              setItemsState(updateTreeList(items, parentPath, (l) => move(l, idx, 1)));
              setSel([...parentPath, Math.min(siblings.length - 1, idx + 1)]);
            }}
            canRemove={!!cur}
            canUp={idx > 0}
            canDown={idx >= 0 && idx < siblings.length - 1}
          />
          <ul className="wd-se-items" role="tree" aria-label="Nodes">
            {renderTree(items, [], 0)}
            {items.length === 0 ? <li className="wd-empty">No nodes. Add a root node to start.</li> : null}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Text">
                <input className="wd-pg-input" value={cur.text} onChange={(e) => patch({ text: e.target.value })} aria-label="Node text" />
              </Field>
              <Field label="Name">
                <input className="wd-pg-input mono" value={cur.name ?? ''} onChange={(e) => patch({ name: e.target.value || undefined })} aria-label="Node name" />
              </Field>
            </>
          ) : (
            <p className="wd-empty">Select a node to edit it.</p>
          )}
          <div className="wd-tn-preview" aria-label="Tree preview">
            <span className="wd-tn-preview-label">Preview</span>
            {items.length ? renderPreview(items, 0) : <span className="wd-muted">Empty tree</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ListView.Columns
// ---------------------------------------------------------------------------

function ListViewColumnsEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const doc = store.getState().doc!;
  const [cols, setCols] = useState<ListViewColumnNode[]>(node.listViewColumns ?? []);
  const [sel, setSel] = useState(0);
  const cur = cols[sel];
  const orig = useMemo(() => new Set((node.listViewColumns ?? []).map((c) => c.id)), [node.listViewColumns]);
  const error = validateNames(doc, orig, cols);
  // Spread the existing column so parsed `properties` / `rawStatements` survive a name/text/width edit.
  const patch = (p: Partial<Pick<ListViewColumnNode, 'name' | 'text' | 'width'>>) => setCols(cols.map((c, i) => (i === sel ? { ...c, ...p } : c)));
  const total = cols.reduce((a, c) => a + c.width, 0);
  return (
    <Modal
      wide
      title="ColumnHeader Collection Editor"
      subtitle={`${node.name}.Columns`}
      okDisabled={!!error}
      onCancel={onClose}
      onOk={() => {
        store.update((d) => setListViewColumns(d, node.id, cols), `Edit ${node.name}.Columns`);
        onClose();
      }}
    >
      <div className="wd-split-editor">
        <div className="wd-se-list">
          <ListToolbar
            onAdd={() => {
              const taken = new Set([...collectNames(doc), ...cols.map((c) => c.name)]);
              let i = 1;
              while (taken.has(`columnHeader${i}`)) i++;
              setCols([...cols, { id: uid('lvc'), name: `columnHeader${i}`, text: `Column ${cols.length + 1}`, width: 100 }]);
              setSel(cols.length);
            }}
            onRemove={() => {
              setCols(cols.filter((_, i) => i !== sel));
              setSel(Math.max(0, sel - 1));
            }}
            onUp={() => {
              setCols(move(cols, sel, -1));
              setSel(Math.max(0, sel - 1));
            }}
            onDown={() => {
              setCols(move(cols, sel, 1));
              setSel(Math.min(cols.length - 1, sel + 1));
            }}
            canRemove={!!cur}
            canUp={sel > 0}
            canDown={sel < cols.length - 1}
          />
          <ul className="wd-se-items" role="listbox" aria-label="Columns">
            {cols.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
                <Icon name="ListView" size={14} />
                <span>{c.text || c.name}</span>
                <em>{c.width}px</em>
              </li>
            ))}
            {cols.length === 0 ? <li className="wd-empty">No columns. Add one to start.</li> : null}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Name">
                <input className="wd-pg-input mono" value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="Text">
                <input className="wd-pg-input" value={cur.text} onChange={(e) => patch({ text: e.target.value })} />
              </Field>
              <Field label="Width">
                <input className="wd-pg-input" type="number" min={0} value={cur.width} onChange={(e) => patch({ width: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </Field>
            </>
          ) : (
            <p className="wd-empty">Select a column to edit its properties.</p>
          )}
          {cols.length ? (
            <div className="wd-lvc-preview" aria-label="Header preview">
              {cols.map((c, i) => (
                <span key={c.id} className={i === sel ? 'on' : ''} style={{ flexBasis: `${total ? (c.width / total) * 100 : 0}%` }}>
                  {c.text}
                </span>
              ))}
            </div>
          ) : null}
          {error ? <p className="wd-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const BINDABLE_PROPERTIES = ['Text', 'Checked', 'Value', 'Visible', 'Enabled', 'BackColor', 'ForeColor', 'Image', 'SelectedValue', 'DataSource'];
const DATA_SOURCE_TYPES = new Set(['BindingSource', 'DataSet', 'DataTable', 'DataView']);

function DataBindingsEditor({ node, store, onClose }: { node: DesignNode; store: DesignerStore; onClose: () => void }) {
  const doc = store.getState().doc!;
  const [list, setList] = useState<DataBindingEntry[]>(() => (node.dataBindings ?? []).map((b) => ({ ...b })));
  const [sel, setSel] = useState(0);
  const cur = list[sel];
  const sources = useMemo(() => {
    const comps = [...doc.components].sort((a, b) => Number(DATA_SOURCE_TYPES.has(b.type)) - Number(DATA_SOURCE_TYPES.has(a.type)) || a.name.localeCompare(b.name));
    return comps.map((c) => ({ value: (doc.metadata?.useThisQualifier ? 'this.' : '') + c.name, label: `${c.name} (${c.type})` }));
  }, [doc]);
  const dupes = new Set(list.map((b) => b.propertyName).filter((p, i, a) => p && a.indexOf(p) !== i));
  const error = list.some((b) => !b.propertyName.trim())
    ? 'Every binding needs a property name.'
    : list.some((b) => !b.dataSource.trim())
      ? 'Every binding needs a data source.'
      : dupes.size
        ? `Property "${[...dupes][0]}" is bound more than once.`
        : null;
  const patch = (p: Partial<DataBindingEntry>) =>
    setList(
      list.map((b, i) => {
        if (i !== sel) return b;
        const next = { ...b, ...p };
        if ('dataSource' in p && typeof p.dataSource === 'string') {
          const ds = p.dataSource.trim();
          if (/^this\.[A-Za-z_][A-Za-z0-9_]*$/.test(ds)) {
            next.sourceQualifier = 'this';
          } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(ds)) {
            const isKnownComp = doc.components.some((c) => c.name === ds);
            if (!isKnownComp && b.sourceQualifier === 'none') {
              next.sourceQualifier = 'none';
            } else {
              delete next.sourceQualifier;
            }
          } else {
            delete next.sourceQualifier;
          }
        }
        // A hand-edited binding no longer matches its preserved C# statement.
        delete next.rawExpression;
        return next;
      })
    );
  const listId = `wd-db-props-${node.id}`;
  const srcId = `wd-db-src-${node.id}`;
  return (
    <Modal
      wide
      title="Control DataBindings"
      subtitle={`${node.name}.DataBindings`}
      okDisabled={!!error}
      onCancel={onClose}
      onOk={() => {
        const cleaned = list.map((b) => ({ ...b, propertyName: b.propertyName.trim(), dataSource: b.dataSource.trim(), dataMember: b.dataMember.trim() }));
        store.updateNode(
          node.id,
          (n) => {
            const out = { ...n };
            if (cleaned.length) out.dataBindings = cleaned;
            else delete out.dataBindings;
            return out;
          },
          `Edit ${node.name}.DataBindings`
        );
        onClose();
      }}
    >
      <div className="wd-split-editor" data-testid="databindings-editor">
        <div className="wd-se-list">
          <ListToolbar
            onAdd={() => {
              const used = new Set(list.map((b) => b.propertyName));
              const propertyName = BINDABLE_PROPERTIES.find((p) => !used.has(p)) ?? '';
              const dataSource = sources.find((s) => s.label.includes('(BindingSource)'))?.value ?? sources[0]?.value ?? '';
              setList([...list, { propertyName, dataSource, dataMember: '', formattingEnabled: true }]);
              setSel(list.length);
            }}
            onRemove={() => {
              setList(list.filter((_, i) => i !== sel));
              setSel(Math.max(0, sel - 1));
            }}
            onUp={() => {
              setList(move(list, sel, -1));
              setSel(Math.max(0, sel - 1));
            }}
            onDown={() => {
              setList(move(list, sel, 1));
              setSel(Math.min(list.length - 1, sel + 1));
            }}
            canRemove={!!cur}
            canUp={sel > 0}
            canDown={sel < list.length - 1}
          />
          <ul className="wd-se-items" role="listbox" aria-label="Bindings">
            {list.map((b, i) => (
              <li key={i} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)} data-testid="databinding-row">
                <Icon name="link" size={14} />
                <span>{b.propertyName || '(property)'}</span>
                <em>
                  {(b.dataSource || '?').replace(/^this\./, '')}
                  {b.dataMember ? `.${b.dataMember}` : ''}
                </em>
              </li>
            ))}
            {list.length === 0 ? <li className="wd-empty">No bindings. Add one to connect a property to a data source.</li> : null}
          </ul>
        </div>
        <div className="wd-se-detail">
          {cur ? (
            <>
              <Field label="Property">
                <input className="wd-pg-input" list={listId} value={cur.propertyName} onChange={(e) => patch({ propertyName: e.target.value })} data-testid="databinding-property" />
                <datalist id={listId}>
                  {BINDABLE_PROPERTIES.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="Data source">
                <input className="wd-pg-input mono" list={srcId} value={cur.dataSource} placeholder="bindingSource1" onChange={(e) => patch({ dataSource: e.target.value })} data-testid="databinding-source" />
                <datalist id={srcId}>
                  {sources.map((s) => (
                    <option key={s.value} value={s.value} label={s.label} />
                  ))}
                </datalist>
              </Field>
              <Field label="Data member">
                <input className="wd-pg-input mono" value={cur.dataMember} placeholder="CustomerName" onChange={(e) => patch({ dataMember: e.target.value })} data-testid="databinding-member" />
              </Field>
              <Field label="Formatting enabled">
                <input type="checkbox" checked={cur.formattingEnabled !== false} onChange={(e) => patch({ formattingEnabled: e.target.checked })} />
              </Field>
              <p className="wd-modal-meta">
                <code>
                  this.{node.name}.DataBindings.Add(new System.Windows.Forms.Binding("{cur.propertyName}", {cur.dataSource || '…'}, "{cur.dataMember}", {cur.formattingEnabled !== false ? 'true' : 'false'}));
                </code>
              </p>
              {!sources.length ? <p className="wd-modal-meta">Tip: add a BindingSource from the Toolbox to pick it here, or type any data source expression.</p> : null}
            </>
          ) : (
            <p className="wd-empty">Select a binding to edit it.</p>
          )}
          {error && list.length ? <p className="wd-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

export function CollectionEditorHost({ editor, store }: { editor: { kind: CollectionEditorKind; nodeId: string } | null; store: DesignerStore }) {
  if (!editor) return null;
  const node = getNode(store.getState().doc!, editor.nodeId);
  const close = () => store.setState({ collectionEditor: null });
  if (!node) return null;
  switch (editor.kind) {
    case 'items':
      return <ItemsEditor node={node} store={store} onClose={close} />;
    case 'columns':
      return <ColumnsEditor node={node} store={store} onClose={close} />;
    case 'tabPages':
      return <TabPagesEditor node={node} store={store} onClose={close} />;
    case 'stripItems':
      return <StripItemsEditor node={node} store={store} onClose={close} />;
    case 'tableLayout':
      return <TableLayoutEditor node={node} store={store} onClose={close} />;
    case 'treeNodes':
      return <TreeNodesEditor node={node} store={store} onClose={close} />;
    case 'listViewColumns':
      return <ListViewColumnsEditor node={node} store={store} onClose={close} />;
    case 'dataBindings':
      return <DataBindingsEditor node={node} store={store} onClose={close} />;
  }
}
