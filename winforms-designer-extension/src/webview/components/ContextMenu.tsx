// Keyboard-accessible context menu with submenus, rendered in a fixed layer.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './ControlIcons';

export interface MenuItem {
  id: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
  onSelect?: () => void;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const [openSub, setOpenSub] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    setPos({ x: nx, y: ny });
    el.focus();
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.wd-menu')) onClose();
    };
    const blur = () => onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('blur', blur);
    };
  }, [onClose]);

  const selectable = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = selectable.indexOf(active);
      const next = e.key === 'ArrowDown' ? selectable[(cur + 1) % selectable.length] : selectable[(cur - 1 + selectable.length) % selectable.length];
      setActive(next ?? -1);
    } else if (e.key === 'ArrowRight' && active >= 0 && items[active].submenu) {
      e.preventDefault();
      setOpenSub(items[active].id);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const it = items[active];
      if (it.submenu) setOpenSub(it.id);
      else if (it.onSelect) {
        onClose();
        it.onSelect();
      }
    }
  };

  return (
    <div ref={ref} className="wd-menu" role="menu" tabIndex={-1} style={{ left: pos.x, top: pos.y }} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={it.id} className="wd-menu-sep" role="separator" />
        ) : (
          <div
            key={it.id}
            role="menuitem"
            aria-disabled={it.disabled || undefined}
            aria-haspopup={it.submenu ? 'menu' : undefined}
            className={`wd-menu-item ${i === active ? 'active' : ''} ${it.disabled ? 'disabled' : ''}`}
            onPointerEnter={() => {
              setActive(i);
              setOpenSub(it.submenu ? it.id : null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if (it.submenu) {
                setOpenSub(it.id);
                return;
              }
              onClose();
              it.onSelect?.();
            }}
          >
            <span className="wd-menu-icon">{it.checked ? <Icon name="check" size={14} /> : it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            <span className="wd-menu-label">{it.label}</span>
            {it.shortcut ? <span className="wd-menu-shortcut">{it.shortcut}</span> : null}
            {it.submenu ? <Icon name="chevronRight" size={12} className="wd-menu-arrow" /> : null}
            {it.submenu && openSub === it.id ? <SubMenu items={it.submenu} onClose={onClose} /> : null}
          </div>
        )
      )}
    </div>
  );
}

function SubMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.right > window.innerWidth - 4) setFlip(true);
  }, []);
  return (
    <div ref={ref} className={`wd-menu wd-submenu ${flip ? 'flip' : ''}`} role="menu" onClick={(e) => e.stopPropagation()}>
      {items.map((it) =>
        it.separator ? (
          <div key={it.id} className="wd-menu-sep" />
        ) : (
          <div
            key={it.id}
            role="menuitem"
            className={`wd-menu-item ${it.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onSelect?.();
            }}
          >
            <span className="wd-menu-icon">{it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            <span className="wd-menu-label">{it.label}</span>
            {it.shortcut ? <span className="wd-menu-shortcut">{it.shortcut}</span> : null}
          </div>
        )
      )}
    </div>
  );
}

/** Anchored popover that closes on outside click / Escape. */
export function Popover({
  anchor,
  onClose,
  children,
  className,
  placement = 'below',
}: {
  anchor: { x: number; y: number; width?: number; height?: number };
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  placement?: 'below' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = placement === 'right' ? anchor.x + (anchor.width ?? 0) + 6 : anchor.x;
    let top = placement === 'right' ? anchor.y : anchor.y + (anchor.height ?? 0) + 4;
    if (left + r.width > window.innerWidth - 6) left = Math.max(6, placement === 'right' ? anchor.x - r.width - 6 : window.innerWidth - r.width - 6);
    if (top + r.height > window.innerHeight - 6) top = Math.max(6, placement === 'right' ? window.innerHeight - r.height - 6 : anchor.y - r.height - 4);
    setPos({ left, top });
  }, [anchor.x, anchor.y, anchor.width, anchor.height, placement]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest?.('.wd-popover-keep')) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={`wd-popover ${className ?? ''}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: anchor.x, top: anchor.y, visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
