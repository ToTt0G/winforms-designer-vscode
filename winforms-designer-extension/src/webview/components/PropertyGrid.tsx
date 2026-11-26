// Visual Studio-style F4 Property Grid with object selector, categorized/alphabetical
// views, multi-select editing, reset-to-default and a description footer.

import { useEffect, useMemo, useState } from 'react';
import { getControlDefinition, getPropertiesForControl, type PropertyDefinition } from '../../shared/catalog';
import type { DesignNode, PropertyValue, ResourceMap } from '../../shared/model';
import { isPaddingValue, isPointValue, isResourceValue, isSizeFValue, isSizeValue } from '../../shared/model';
import { allNodes, DEFAULT_CULTURE, getNode, validateRename, type CollectionEditorKind, type DesignerState, type DesignerStore } from '../state/designerStore';
import { getTableTracks } from '../state/layoutEngine';
import { formatValue, makePadding, resolveImage, valuesEqual } from '../state/nodeProps';
import { ContextMenu, Popover } from './ContextMenu';
import { ControlIcon, Icon } from './ControlIcons';
import { EventsInspector } from './EventsInspector';
import {
  AlignmentEditor,
  AnchorEditor,
  BoolEditor,
  CollectionButton,
  ColorEditor,
  CommitInput,
  ControlRefEditor,
  DockEditor,
  EnumEditor,
  FlagsEditor,
  FontEditor,
  ImageEditor,
  NumberEditor,
  StringEditor,
  type EditorProps,
} from './PropertyEditors';

const COLLECTION_KIND: Partial<Record<PropertyDefinition['editor'], CollectionEditorKind>> = {
  stringCollection: 'items',
  columnsCollection: 'columns',
  stripItemsCollection: 'stripItems',
  tabPagesCollection: 'tabPages',
  tableLayoutCollection: 'tableLayout',
  treeNodesCollection: 'treeNodes',
  listViewColumnsCollection: 'listViewColumns',
  dataBindingsCollection: 'dataBindings',
};

function countTreeNodes(items: DesignNode['treeNodes']): number {
  return (items ?? []).reduce((a, it) => a + 1 + countTreeNodes(it.children), 0);
}

function collectionModified(n: DesignNode, coll: CollectionEditorKind): boolean {
  switch (coll) {
    case 'items':
      return !!n.items?.length;
    case 'columns':
      return !!n.columns?.length;
    case 'stripItems':
      return !!n.stripItems?.length;
    case 'tabPages':
      return n.children.length > 0;
    case 'tableLayout':
      return !!n.tableLayout;
    case 'treeNodes':
      return !!n.treeNodes?.length;
    case 'listViewColumns':
      return !!n.listViewColumns?.length;
    case 'dataBindings':
      return !!n.dataBindings?.length;
  }
}

interface Row {
  def: PropertyDefinition;
  value: PropertyValue | undefined;
  mixed: boolean;
  modified: boolean;
  extra?: boolean;
}

function readValue(
  node: DesignNode,
  def: PropertyDefinition,
  cultureStrings?: Record<string, string>,
  resources?: ResourceMap
): PropertyValue | undefined {
  if (def.name === 'Name') return node.name;
  if (def.name === 'Text') {
    if (cultureStrings) {
      const localized = cultureStrings[node.type === 'Form' || node.type === 'UserControl' ? '$this.Text' : `${node.name}.Text`];
      if (localized !== undefined) return localized;
    }
    const raw = node.properties.Text;
    if (isResourceValue(raw) && resources) {
      const entry = resources[raw.resourceName];
      if (entry && entry.kind === 'string') return entry.value;
    }
  }
  return node.properties[def.name];
}

function effectiveDefault(node: DesignNode, def: PropertyDefinition): PropertyValue | undefined {
  if (def.name === 'Dock') {
    const dd = getControlDefinition(node.type)?.defaultDock;
    if (dd) return { kind: 'enum', typeName: 'DockStyle', value: dd };
  }
  return def.defaultValue;
}

function collectionLabel(node: DesignNode, kind: CollectionEditorKind): string {
  switch (kind) {
    case 'items':
      return `(Collection) ${node.items?.length ?? 0}`;
    case 'columns':
      return `(Collection) ${node.columns?.length ?? 0}`;
    case 'stripItems':
      return `(Collection) ${node.stripItems?.length ?? 0}`;
    case 'tabPages':
      return `(Collection) ${node.children.length}`;
    case 'tableLayout': {
      const t = getTableTracks(node);
      return `(Columns ${t.columns.length}, Rows ${t.rows.length})`;
    }
    case 'treeNodes':
      return `(Collection) ${countTreeNodes(node.treeNodes)}`;
    case 'listViewColumns':
      return `(Collection) ${node.listViewColumns?.length ?? 0}`;
    case 'dataBindings':
      return `(Bindings) ${node.dataBindings?.length ?? 0}`;
  }
}

export function PropertyGrid({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const doc = state.doc!;
  const [mode, setMode] = useState<'categorized' | 'alphabetical'>('categorized');
  const [tab, setTab] = useState<'properties' | 'events'>('properties');
  const [filter, setFilter] = useState('');
  const [focused, setFocused] = useState<PropertyDefinition | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Location', 'Size']));
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const [selector, setSelector] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const nodes = useMemo(() => {
    const sel = state.selection.map((id) => getNode(doc, id)).filter((n): n is DesignNode => !!n);
    return sel.length ? sel : [doc.form];
  }, [state.selection, doc]);
  const first = nodes[0];
  const multi = nodes.length > 1;
  const ids = nodes.map((n) => n.id);
  const idsKey = ids.join(',');
  useEffect(() => {
    setFocused(null);
    setNameError(null);
  }, [idsKey]);

  const localized = state.activeCulture !== DEFAULT_CULTURE;
  const cultureStrings = localized ? state.cultureStrings : undefined;
  const inheritedNode = nodes.find((n) => n.inherited);

  const rows: Row[] = useMemo(() => {
    const defsPerNode = nodes.map((n) => getPropertiesForControl(n.type));
    let defs = defsPerNode[0];
    for (const other of defsPerNode.slice(1)) defs = defs.filter((d) => other.some((o) => o.name === d.name));
    if (multi) defs = defs.filter((d) => d.editor !== 'name');
    const out: Row[] = defs.map((def) => {
      const values = nodes.map((n) => readValue(n, def, cultureStrings, doc.resources));
      const mixed = values.some(
        (v, i) => !valuesEqual(v ?? effectiveDefault(nodes[i], def), values[0] ?? effectiveDefault(nodes[0], def))
      );
      const coll = COLLECTION_KIND[def.editor];
      const modified =
        def.name === 'Name' ||
        (coll ? nodes.some((n) => collectionModified(n, coll)) : nodes.some((n) => n.properties[def.name] !== undefined));
      return { def, value: values[0], mixed, modified: !!modified };
    });
    if (!multi) {
      const known = new Set(defs.map((d) => d.name));
      for (const [k, v] of Object.entries(first.properties)) {
        if (known.has(k)) continue;
        out.push({
          def: { name: k, category: 'Misc', editor: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'float' : 'string', description: 'Property preserved from the designer file.' },
          value: v,
          mixed: false,
          modified: true,
          extra: true,
        });
      }
    }
    return out;
  }, [nodes, multi, first, cultureStrings, doc.resources]);

  const q = filter.trim().toLowerCase();
  const visible = rows.filter((r) => !q || r.def.name.toLowerCase().includes(q));
  const sorted = [...visible].sort((a, b) => (a.def.name === 'Name' ? -1 : b.def.name === 'Name' ? 1 : a.def.name.localeCompare(b.def.name)));
  const categories = mode === 'categorized' ? [...new Set(sorted.map((r) => r.def.category))].sort() : [];

  const apply = (row: Row, v: PropertyValue | undefined) => {
    if (row.def.name === 'Name') {
      if (typeof v !== 'string') return;
      const err = validateRename(doc, first.id, v);
      setNameError(err);
      if (!err) store.rename(first.id, v);
      return;
    }
    store.setProperty(ids, row.def.name, v);
  };

  const reset = (row: Row) => store.setProperty(ids, row.def.name, undefined, `Reset ${row.def.name}`);
  const ro = state.readOnly || !!inheritedNode;

  const renderEditor = (row: Row) => {
    const props: EditorProps = {
      def: row.def,
      value: row.value ?? effectiveDefault(first, row.def),
      mixed: row.mixed,
      onChange: (v) => apply(row, v),
      disabled: ro || (state.locked && row.def.category === 'Layout'),
    };
    const coll = COLLECTION_KIND[row.def.editor];
    if (coll) {
      return (
        <CollectionButton
          label={multi ? '' : collectionLabel(first, coll)}
          disabled={multi || ro}
          onOpen={() => store.setState({ collectionEditor: { kind: coll, nodeId: first.id } })}
        />
      );
    }
    switch (row.def.editor) {
      case 'name':
        return (
          <CommitInput
            value={first.name}
            monospace
            ariaLabel="Name"
            className={nameError ? 'invalid' : ''}
            disabled={ro}
            onCommit={(v) => apply(row, v)}
          />
        );
      case 'controlRef':
        return <ControlRefEditor {...props} doc={doc} excludeId={multi ? undefined : first.id} />;
      case 'boolean':
        return <BoolEditor {...props} />;
      case 'number':
      case 'float':
        return <NumberEditor {...props} />;
      case 'enum':
        return <EnumEditor {...props} />;
      case 'flags':
        return <FlagsEditor {...props} />;
      case 'anchor':
        return <AnchorEditor {...props} />;
      case 'dock':
        return <DockEditor {...props} />;
      case 'alignment':
        return <AlignmentEditor {...props} />;
      case 'color':
        return <ColorEditor {...props} />;
      case 'font':
        return <FontEditor {...props} />;
      case 'image':
      case 'icon':
        return (
          <ImageEditor
            value={row.mixed ? undefined : row.value}
            dataUri={multi ? undefined : resolveImage(first, row.def.name, state.resourceDataUris)}
            disabled={multi || ro}
            onPick={() => store.pickImage(first.id, row.def.name, row.def.editor === 'icon')}
            onClear={() => store.clearImage(first.id, row.def.name)}
          />
        );
      case 'point':
      case 'size':
      case 'sizeF':
      case 'padding':
        return <CompositeText row={row} disabled={props.disabled} onChange={(v) => apply(row, v)} />;
      default:
        if (row.extra && row.value !== undefined && typeof row.value === 'object') {
          return <span className="wd-pg-readonly" title={formatValue(row.value)}>{formatValue(row.value)}</span>;
        }
        return <StringEditor {...props} />;
    }
  };

  const subRows = (row: Row) => {
    const v = row.mixed ? undefined : row.value ?? row.def.defaultValue;
    const entries: { key: string; val: number; set: (n: number) => PropertyValue }[] = [];
    if (isPointValue(v)) {
      entries.push({ key: 'X', val: v.x, set: (n) => ({ ...v, x: n }) }, { key: 'Y', val: v.y, set: (n) => ({ ...v, y: n }) });
    } else if (isSizeValue(v) || isSizeFValue(v)) {
      entries.push({ key: 'Width', val: v.width, set: (n) => ({ ...v, width: n }) }, { key: 'Height', val: v.height, set: (n) => ({ ...v, height: n }) });
    } else if (isPaddingValue(v)) {
      const p = v;
      entries.push(
        { key: 'All', val: p.all ?? -1, set: (n) => (n >= 0 ? makePadding(n, n, n, n) : p) },
        { key: 'Left', val: p.left, set: (n) => makePadding(n, p.top, p.right, p.bottom) },
        { key: 'Top', val: p.top, set: (n) => makePadding(p.left, n, p.right, p.bottom) },
        { key: 'Right', val: p.right, set: (n) => makePadding(p.left, p.top, n, p.bottom) },
        { key: 'Bottom', val: p.bottom, set: (n) => makePadding(p.left, p.top, p.right, n) }
      );
    }
    return entries.map((e) => (
      <div key={e.key} className="wd-pg-row sub" onClick={() => setFocused(row.def)}>
        <span className="wd-pg-name">{e.key}</span>
        <span className="wd-pg-value">
          <CommitInput
            value={row.mixed ? '' : String(e.val)}
            ariaLabel={`${row.def.name} ${e.key}`}
            disabled={ro || (state.locked && row.def.category === 'Layout')}
            onCommit={(s) => {
              const n = Number(s);
              if (Number.isFinite(n)) apply(row, e.set(row.def.editor === 'sizeF' ? n : Math.round(n)));
            }}
          />
        </span>
      </div>
    ));
  };

  const renderRow = (row: Row) => {
    const composite = ['point', 'size', 'sizeF', 'padding'].includes(row.def.editor);
    const open = expanded.has(row.def.name);
    const label = row.def.name === 'Name' ? '(Name)' : row.def.name;
    return (
      <div key={row.def.name} className="wd-pg-group">
        <div
          className={`wd-pg-row ${row.modified ? 'modified' : ''} ${focused?.name === row.def.name ? 'focused' : ''}`}
          onClick={() => setFocused(row.def)}
          onFocusCapture={() => setFocused(row.def)}
          onContextMenu={(e) => {
            e.preventDefault();
            setRowMenu({ x: e.clientX, y: e.clientY, row });
          }}
          data-property={row.def.name}
        >
          <span className="wd-pg-name" title={row.def.description}>
            {composite ? (
              <button
                type="button"
                className="wd-twisty"
                aria-label={open ? `Collapse ${row.def.name}` : `Expand ${row.def.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = new Set(expanded);
                  if (open) next.delete(row.def.name);
                  else next.add(row.def.name);
                  setExpanded(next);
                }}
              >
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />
              </button>
            ) : (
              <span className="wd-twisty" />
            )}
            <span className="wd-pg-label">{label}</span>
          </span>
          <span className="wd-pg-value">{renderEditor(row)}</span>
          {row.modified && !ro && row.def.name !== 'Name' && !COLLECTION_KIND[row.def.editor] ? (
            <button type="button" className="wd-pg-reset" title={`Reset ${row.def.name}`} aria-label={`Reset ${row.def.name}`} onClick={() => reset(row)}>
              <Icon name="reset" size={11} />
            </button>
          ) : null}
        </div>
        {composite && open ? subRows(row) : null}
      </div>
    );
  };

  const objects = useMemo(
    () => allNodes(doc).sort((a, b) => (a.id === doc.form.id ? -1 : b.id === doc.form.id ? 1 : a.name.localeCompare(b.name))),
    [doc]
  );

  const fullType = (n: DesignNode) => n.fullTypeName ?? getControlDefinition(n.type)?.fullTypeName ?? n.type;

  return (
    <section className="wd-pane wd-props" aria-label="Properties">
      <div className="wd-pane-title">
        <span>Properties</span>
      </div>
      <button
        type="button"
        className="wd-object-selector"
        aria-haspopup="listbox"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setSelector(selector ? null : { x: r.left, y: r.top, width: r.width, height: r.height });
        }}
        data-testid="object-selector"
      >
        {multi ? (
          <span className="wd-os-name">{nodes.length} objects selected</span>
        ) : (
          <>
            <ControlIcon type={first.type} isComponent={first.isComponent} size={14} />
            <span className="wd-os-name">{first.name}</span>
            <span className="wd-os-type">{fullType(first)}</span>
          </>
        )}
        <Icon name="chevronDown" size={12} />
      </button>
      {selector ? (
        <Popover anchor={selector} onClose={() => setSelector(null)} className="wd-os-popover">
          <ul role="listbox" aria-label="Objects">
            {objects.map((n) => (
              <li
                key={n.id}
                role="option"
                aria-selected={ids.includes(n.id)}
                className={ids.includes(n.id) ? 'on' : ''}
                onClick={() => {
                  store.select([n.id]);
                  setSelector(null);
                }}
              >
                <ControlIcon type={n.type} isComponent={n.isComponent} size={14} />
                <span className="wd-os-name">{n.name}</span>
                <span className="wd-os-type">{fullType(n)}</span>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}

      {inheritedNode ? (
        <div className="wd-pg-banner inherited" role="note" data-testid="prop-inherited-banner">
          <Icon name="lock" size={12} />
          <span>
            Inherited from <b>{inheritedNode.inheritedFrom ?? doc.customBaseClass ?? 'base class'}</b> (read-only)
          </span>
        </div>
      ) : null}
      {localized ? (
        <div className="wd-pg-banner culture" role="note" data-testid="prop-culture-banner">
          <Icon name="info" size={12} />
          <span>
            Editing <b>Text</b> for culture <code>{state.activeCulture}</code>; other properties use the default resources.
          </span>
        </div>
      ) : null}
      <div className="wd-pg-toolbar">
        <button type="button" className={`wd-tb-btn ${mode === 'categorized' ? 'active' : ''}`} title="Categorized" aria-pressed={mode === 'categorized'} onClick={() => setMode('categorized')}>
          <Icon name="categorized" />
        </button>
        <button type="button" className={`wd-tb-btn ${mode === 'alphabetical' ? 'active' : ''}`} title="Alphabetical" aria-pressed={mode === 'alphabetical'} onClick={() => setMode('alphabetical')}>
          <Icon name="alphabetical" />
        </button>
        <span className="wd-tb-sep" />
        <button type="button" className={`wd-tb-btn ${tab === 'properties' ? 'active' : ''}`} title="Properties" aria-pressed={tab === 'properties'} onClick={() => setTab('properties')} data-testid="prop-tab-properties">
          <Icon name="properties" />
        </button>
        <button type="button" className={`wd-tb-btn ${tab === 'events' ? 'active' : ''}`} title="Events" aria-pressed={tab === 'events'} onClick={() => setTab('events')} data-testid="prop-tab-events">
          <Icon name="events" />
        </button>
        <div className="wd-search small">
          <Icon name="search" size={12} />
          <input type="search" placeholder={tab === 'events' ? 'Filter events' : 'Filter properties'} aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>

      {tab === 'events' ? (
        <EventsInspector state={state} store={store} nodes={nodes} mode={mode} filter={q} onFocus={(name, description) => setFocused({ name, description, category: 'Misc', editor: 'string' })} />
      ) : (
        <div className="wd-pane-scroll wd-pg-rows" role="grid" aria-label="Property values">
          {mode === 'categorized'
            ? categories.map((cat) => {
                const catRows = sorted.filter((r) => r.def.category === cat);
                const closed = collapsedCats.has(cat);
                return (
                  <div key={cat} className="wd-pg-cat">
                    <button
                      type="button"
                      className="wd-pg-cat-header"
                      aria-expanded={!closed}
                      onClick={() => {
                        const next = new Set(collapsedCats);
                        if (closed) next.delete(cat);
                        else next.add(cat);
                        setCollapsedCats(next);
                      }}
                    >
                      <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={10} />
                      <span>{cat}</span>
                    </button>
                    {closed ? null : catRows.map(renderRow)}
                  </div>
                );
              })
            : sorted.map(renderRow)}
          {visible.length === 0 ? <p className="wd-empty">No properties match “{filter}”.</p> : null}
        </div>
      )}

      <footer className="wd-pg-footer" aria-live="polite">
        {nameError ? (
          <>
            <b className="error">Invalid name</b>
            <p>{nameError}</p>
          </>
        ) : focused ? (
          <>
            <b>{focused.name}</b>
            <p>{focused.description}</p>
          </>
        ) : (
          <>
            <b>{multi ? `${nodes.length} objects` : first.name}</b>
            <p>{multi ? 'Edits apply to every selected control.' : getControlDefinition(first.type)?.description ?? fullType(first)}</p>
          </>
        )}
      </footer>

      {rowMenu ? (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          items={[
            { id: 'reset', label: 'Reset', icon: 'reset', disabled: ro || !rowMenu.row.modified || rowMenu.row.def.name === 'Name', onSelect: () => reset(rowMenu.row) },
            { id: 'desc', label: 'Description', icon: 'info', checked: true, onSelect: () => setFocused(rowMenu.row.def) },
          ]}
        />
      ) : null}
    </section>
  );
}

/** Text editing for Point/Size/Padding values typed as "x, y" etc. */
function CompositeText({ row, onChange, disabled }: { row: Row; onChange: (v: PropertyValue) => void; disabled?: boolean }) {
  const v = row.value ?? row.def.defaultValue;
  return (
    <CommitInput
      disabled={disabled}
      value={row.mixed ? '' : formatValue(v)}
      ariaLabel={row.def.name}
      onCommit={(s) => {
        const nums = s.split(/[,;\s]+/).filter(Boolean).map(Number);
        if (nums.some((n) => !Number.isFinite(n))) return;
        const int = row.def.editor !== 'sizeF';
        const r = (n: number) => (int ? Math.round(n) : n);
        switch (row.def.editor) {
          case 'point':
            if (nums.length === 2) onChange({ kind: 'point', x: r(nums[0]), y: r(nums[1]) });
            break;
          case 'size':
            if (nums.length === 2) onChange({ kind: 'size', width: r(nums[0]), height: r(nums[1]) });
            break;
          case 'sizeF':
            if (nums.length === 2) onChange({ kind: 'sizeF', width: nums[0], height: nums[1] });
            break;
          case 'padding':
            if (nums.length === 1) onChange(makePadding(r(nums[0]), r(nums[0]), r(nums[0]), r(nums[0])));
            else if (nums.length === 4) onChange(makePadding(r(nums[0]), r(nums[1]), r(nums[2]), r(nums[3])));
            break;
        }
      }}
    />
  );
}
