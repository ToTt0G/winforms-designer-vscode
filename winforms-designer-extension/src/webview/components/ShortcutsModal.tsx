// Keyboard shortcuts reference dialog (toolbar "?" button or the ? key on the canvas).

import { useEffect, useRef } from 'react';
import { Icon } from './ControlIcons';

interface Shortcut {
  keys: string[][];
  label: string;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Canvas & Navigation',
    items: [
      { keys: [['Ctrl', '+'], ['Ctrl', '=']], label: 'Zoom in' },
      { keys: [['Ctrl', '−']], label: 'Zoom out' },
      { keys: [['Ctrl', '0']], label: 'Reset zoom to 100%' },
      { keys: [['Tab'], ['Shift', 'Tab']], label: 'Select next / previous control (while the design surface has focus)' },
      { keys: [['Esc']], label: 'Select parent, cancel placement or exit a mode' },
      { keys: [['F4']], label: 'Leave the canvas: focus the Properties object selector' },
      { keys: [['Ctrl', 'F6'], ['Ctrl', 'Shift', 'T']], label: 'Leave the canvas: focus the Toolbox search' },
      { keys: [['?']], label: 'Show this shortcuts reference' },
    ],
  },
  {
    title: 'Selection & Editing',
    items: [
      { keys: [['Ctrl', 'A']], label: 'Select all controls' },
      { keys: [['Ctrl', 'Z']], label: 'Undo' },
      { keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], label: 'Redo' },
      { keys: [['Ctrl', 'C'], ['Ctrl', 'X'], ['Ctrl', 'V']], label: 'Copy, cut and paste' },
      { keys: [['Ctrl', 'D']], label: 'Duplicate selection' },
      { keys: [['Del']], label: 'Delete selection' },
      { keys: [['F2']], label: 'Edit text in place' },
    ],
  },
  {
    title: 'Nudge & Resize',
    items: [
      { keys: [['←', '↑', '→', '↓']], label: 'Move by grid size' },
      { keys: [['Ctrl', 'Arrow']], label: 'Move by 1 pixel' },
      { keys: [['Shift', 'Arrow']], label: 'Resize by grid size' },
      { keys: [['Ctrl', 'Shift', 'Arrow']], label: 'Resize by 1 pixel' },
    ],
  },
  {
    title: 'Layout & Tab Order',
    items: [
      { keys: [['Tab Order']], label: 'Toolbar: click controls in focus order, Esc to finish' },
      { keys: [['Alt', 'Drag']], label: 'Ignore snaplines and grid while dragging' },
      { keys: [['Ctrl', 'Click'], ['Shift', 'Click']], label: 'Add or remove a control from the selection' },
    ],
  },
  {
    title: 'Code Integration',
    items: [
      { keys: [['F7']], label: 'View code-behind' },
      { keys: [['Shift', 'F7']], label: 'Open the designer from a .cs editor' },
      { keys: [['Enter'], ['Double-click']], label: 'Go to the default event handler' },
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.wd-modal-close')?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="wd-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="wd-modal wide wd-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-testid="shortcuts-modal"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || e.key === '?') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header className="wd-modal-head">
          <div>
            <h2>Keyboard Shortcuts</h2>
            <p>Designer keys apply while the form canvas has focus.</p>
          </div>
          <button type="button" className="wd-icon-btn wd-modal-close" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="wd-modal-body wd-shortcuts-body">
          {GROUPS.map((g) => (
            <section key={g.title} className="wd-shortcut-group" aria-label={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.items.map((it) => (
                  <div key={it.label} className="wd-shortcut-row">
                    <dt>{it.label}</dt>
                    <dd>
                      {it.keys.map((combo, ci) => (
                        <span key={ci} className="wd-kbd-combo">
                          {ci > 0 ? <span className="wd-kbd-or">or</span> : null}
                          {combo.map((k, ki) => (
                            <kbd key={ki}>{k}</kbd>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
