// Events view (lightning bolt) for the Property Grid.

import { useMemo, useState } from 'react';
import { getEventsForControl, type EventDefinition } from '../../shared/catalog';
import type { DesignNode } from '../../shared/model';
import { handlerNameFor, isValidIdentifier, type DesignerState, type DesignerStore } from '../state/designerStore';
import { Popover } from './ContextMenu';
import { Icon } from './ControlIcons';
import { CommitInput } from './PropertyEditors';

export function EventsInspector({
  state,
  store,
  nodes,
  mode,
  filter,
  onFocus,
}: {
  state: DesignerState;
  store: DesignerStore;
  nodes: DesignNode[];
  mode: 'categorized' | 'alphabetical';
  filter: string;
  onFocus: (name: string, description: string) => void;
}) {
  const doc = state.doc!;
  const ro = state.readOnly;
  const ids = nodes.map((n) => n.id);
  const primary = nodes[0];
  const [picker, setPicker] = useState<{ ev: string; anchor: { x: number; y: number; width: number; height: number } } | null>(null);
  const [focusedEv, setFocusedEv] = useState<string | null>(null);

  const events = useMemo(() => {
    const per = nodes.map((n) => getEventsForControl(n.type));
    let list = per[0];
    for (const o of per.slice(1)) list = list.filter((e) => o.some((x) => x.name === e.name));
    return list.filter((e) => !filter || e.name.toLowerCase().includes(filter)).sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes, filter]);

  const handlers = state.codeBehindHandlers.filter((h) => h.isEventHandlerLike).map((h) => h.name);
  const boundNames = new Set<string>();
  for (const n of [doc.form, ...doc.components]) Object.values(n.events).forEach((h) => boundNames.add(h));
  const allHandlerNames = [...new Set([...handlers, ...boundNames])].sort();

  const valueOf = (ev: string) => {
    const vals = nodes.map((n) => n.events[ev] ?? '');
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
  };

  const create = (ev: EventDefinition) => {
    const existing = valueOf(ev.name);
    if (existing) {
      store.navigateToEvent(primary.id, ev.name, true);
      return;
    }
    if (ro) return;
    const name = handlerNameFor(doc, primary, ev.name);
    if (nodes.length > 1) store.setEventHandler(ids, ev.name, name);
    store.navigateToEvent(primary.id, ev.name, true);
  };

  const bind = (ev: string, name: string) => {
    const t = name.trim();
    if (!t) return store.setEventHandler(ids, ev, undefined);
    if (!isValidIdentifier(t)) {
      store.post({ type: 'showMessage', level: 'warning', message: `"${t}" is not a valid method name.` });
      return;
    }
    store.setEventHandler(ids, ev, t);
  };

  const renderRow = (ev: EventDefinition) => {
    const v = valueOf(ev.name);
    return (
      <div
        key={ev.name}
        className={`wd-pg-row event ${v ? 'modified' : ''} ${focusedEv === ev.name ? 'focused' : ''}`}
        data-event={ev.name}
        onClick={() => {
          setFocusedEv(ev.name);
          onFocus(ev.name, ev.description);
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          create(ev);
        }}
      >
        <span className="wd-pg-name" title={ev.description}>
          <span className="wd-twisty" />
          <span className="wd-pg-label">{ev.name}</span>
        </span>
        <span className="wd-pg-value wd-ev-value">
          <CommitInput value={v ?? ''} monospace disabled={ro} ariaLabel={`${ev.name} handler`} placeholder={v === null ? '' : undefined} onCommit={(s) => bind(ev.name, s)} />
          <button
            type="button"
            className="wd-pg-dd"
            disabled={ro}
            aria-label={`Choose existing handler for ${ev.name}`}
            onClick={(e) => {
              const r = e.currentTarget.parentElement!.getBoundingClientRect();
              setPicker(picker?.ev === ev.name ? null : { ev: ev.name, anchor: { x: r.left, y: r.top, width: r.width, height: r.height } });
            }}
          >
            <Icon name="chevronDown" size={12} />
          </button>
        </span>
        <span className="wd-ev-actions">
          {v ? (
            <>
              <button type="button" className="wd-icon-btn" title="Go to handler" aria-label={`Go to ${v}`} onClick={() => store.navigateToEvent(primary.id, ev.name, true)}>
                <Icon name="jump" size={12} />
              </button>
              <button type="button" className="wd-icon-btn" title="Remove handler binding" aria-label={`Unbind ${ev.name}`} disabled={ro} onClick={() => store.setEventHandler(ids, ev.name, undefined)}>
                <Icon name="close" size={12} />
              </button>
            </>
          ) : (
            <button type="button" className="wd-icon-btn" title={`Create ${handlerNameFor(doc, primary, ev.name)}`} aria-label={`Create handler for ${ev.name}`} disabled={ro} onClick={() => create(ev)}>
              <Icon name="plus" size={12} />
            </button>
          )}
        </span>
      </div>
    );
  };

  const cats = [...new Set(events.map((e) => e.category))].sort();

  return (
    <div className="wd-pane-scroll wd-pg-rows" role="grid" aria-label="Events">
      {!state.hasCodeBehind ? <p className="wd-note">No code-behind file was found. Handlers are still recorded in the designer file.</p> : null}
      {mode === 'categorized'
        ? cats.map((c) => (
            <div key={c} className="wd-pg-cat">
              <div className="wd-pg-cat-header static">
                <span>{c}</span>
              </div>
              {events.filter((e) => e.category === c).map(renderRow)}
            </div>
          ))
        : events.map(renderRow)}
      {events.length === 0 ? <p className="wd-empty">No events match “{filter}”.</p> : null}
      {picker ? (
        <Popover anchor={picker.anchor} onClose={() => setPicker(null)} className="wd-os-popover">
          <ul role="listbox" aria-label="Existing handlers">
            <li
              role="option"
              aria-selected={false}
              onClick={() => {
                store.setEventHandler(ids, picker.ev, undefined);
                setPicker(null);
              }}
            >
              <span className="wd-muted">(none)</span>
            </li>
            {allHandlerNames.map((h) => (
              <li
                key={h}
                role="option"
                aria-selected={valueOf(picker.ev) === h}
                className={valueOf(picker.ev) === h ? 'on' : ''}
                onClick={() => {
                  bind(picker.ev, h);
                  setPicker(null);
                }}
              >
                <span className="wd-os-name mono">{h}</span>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}
