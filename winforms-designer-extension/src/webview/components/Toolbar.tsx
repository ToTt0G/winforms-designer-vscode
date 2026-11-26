// Compact 36px designer command bar.

import { useEffect, useRef, useState } from 'react';
import type { DesignAuditIssue, AuditRuleCode } from '../../shared/auditor';
import type { AlignOp, DesignerState, DesignerStore } from '../state/designerStore';
import { canFixAuditIssue, DEFAULT_CULTURE, labelForAlign } from '../state/designerStore';
import { getSize } from '../state/nodeProps';
import { Popover } from './ContextMenu';
import { Icon } from './ControlIcons';

function Btn({
  icon,
  label,
  onClick,
  disabled,
  active,
  shortcut,
  text,
  testId,
}: {
  icon?: string;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
  text?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`wd-tb-btn ${active ? 'active' : ''} ${text && !icon ? 'text-only' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : null}
      {text ? <span className="wd-tb-text">{text}</span> : null}
    </button>
  );
}

const Sep = () => <span className="wd-tb-sep" aria-hidden />;

type Anchor = { x: number; y: number; width: number; height: number };

const AUDIT_RULE_LABELS: Record<AuditRuleCode, string> = {
  'overlapping-controls': 'Overlapping controls',
  'out-of-bounds': 'Outside container',
  'duplicate-tab-index': 'Duplicate TabIndex',
  'dialog-missing-accept-button': 'No AcceptButton',
  'dialog-missing-cancel-button': 'No CancelButton',
  'missing-accessible-text': 'Missing accessible text',
  'numeric-updown-range': 'NumericUpDown range',
  'progress-bar-range': 'ProgressBar range',
  'split-container-distance': 'SplitterDistance',
  'high-dpi-autoscale-none': 'High-DPI scaling disabled',
};

const COMMON_CULTURES = ['de', 'fr', 'es', 'it', 'ja', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant', 'ru', 'nl', 'pl'];
const ADD_CULTURE = '__add__';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Scrolls a canvas control into view after selection (tab pages are activated by select()). */
export function revealOnCanvas(nodeId: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`.wd-canvas [data-node-id="${CSS.escape(nodeId)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
}

function AuditPopover({
  issues,
  anchor,
  onClose,
  onPick,
  canFix,
  onFix,
  onFixAll,
}: {
  issues: DesignAuditIssue[];
  anchor: Anchor;
  onClose: () => void;
  onPick: (issue: DesignAuditIssue) => void;
  canFix: (issue: DesignAuditIssue) => boolean;
  onFix: (issue: DesignAuditIssue) => void;
  onFixAll: () => void;
}) {
  const sorted = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.controlName.localeCompare(b.controlName));
  const counts = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => counts[i.severity]++);
  const fixable = sorted.map(canFix);
  const fixableCount = fixable.filter(Boolean).length;
  return (
    <Popover anchor={anchor} onClose={onClose} className="wd-audit-popover">
      <div className="wd-audit-head">
        <Icon name={issues.length ? 'shieldAlert' : 'shieldCheck'} size={14} />
        <span className="wd-pop-title">Layout &amp; Accessibility Audit</span>
        {fixableCount >= 2 ? (
          <button type="button" className="wd-audit-fixall" onClick={onFixAll} title={`Apply ${fixableCount} automatic fixes as one undo step`} data-testid="audit-fix-all-btn">
            <Icon name="wand" size={12} />
            Fix All <span className="wd-audit-fixcount">{fixableCount}</span>
          </button>
        ) : null}
      </div>
      {issues.length ? (
        <>
          <div className="wd-audit-summary" aria-label="Issue counts">
            {(['error', 'warning', 'info'] as const).map((sev) =>
              counts[sev] ? (
                <span key={sev} className={`wd-audit-chip ${sev}`}>
                  <i className={`wd-audit-dot ${sev}`} />
                  {counts[sev]} {sev === 'error' ? (counts[sev] === 1 ? 'error' : 'errors') : sev === 'warning' ? (counts[sev] === 1 ? 'warning' : 'warnings') : 'info'}
                </span>
              ) : null
            )}
          </div>
          <ul className="wd-audit-list" role="list" data-testid="audit-list">
            {sorted.map((issue, i) => (
              <li key={`${issue.code}-${issue.nodeId}-${i}`} className="wd-audit-row">
                <button type="button" className={`wd-audit-item ${issue.severity}`} onClick={() => onPick(issue)} title={`Select ${issue.controlName}`} data-testid="audit-item">
                  <i className={`wd-audit-dot ${issue.severity}`} aria-label={issue.severity} />
                  <span className="wd-audit-main">
                    <span className="wd-audit-line">
                      <b>{AUDIT_RULE_LABELS[issue.code] ?? issue.code}</b>
                      <code>{issue.controlName}</code>
                    </span>
                    <span className="wd-audit-msg">{issue.message}</span>
                  </span>
                </button>
                {fixable[i] ? (
                  <button
                    type="button"
                    className="wd-audit-fix"
                    onClick={() => onFix(issue)}
                    title={`Fix: ${AUDIT_RULE_LABELS[issue.code] ?? issue.code} (${issue.controlName})`}
                    aria-label={`Fix ${AUDIT_RULE_LABELS[issue.code] ?? issue.code} on ${issue.controlName}`}
                    data-testid="audit-fix-btn"
                  >
                    Fix
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="wd-pop-hint">Click an issue to select the control on the form{fixableCount ? '; Fix applies a one-click, undoable correction' : ''}.</p>
        </>
      ) : (
        <p className="wd-audit-clean">No layout or accessibility issues found. Controls fit their containers, tab order is unique and dialogs are wired up.</p>
      )}
    </Popover>
  );
}

function CultureSwitcher({ state, store }: { state: DesignerState; store: DesignerStore }) {
  const [adding, setAdding] = useState<Anchor | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const active = state.activeCulture;
  const cultures = state.availableCultures.filter((c) => c !== DEFAULT_CULTURE);
  const submit = () => {
    const err = store.addCulture(value);
    setError(err);
    if (!err) {
      setAdding(null);
      setValue('');
    }
  };
  return (
    <div className={`wd-culture ${active !== DEFAULT_CULTURE ? 'localized' : ''}`} role="group" aria-label="Culture">
      <Icon name="globe" size={14} />
      <select
        ref={selectRef}
        className="wd-tb-select wd-culture-select"
        aria-label="Form culture"
        title="Localized form culture (.resx)"
        value={active}
        data-testid="toolbar-culture-select"
        onChange={(e) => {
          if (e.target.value === ADD_CULTURE) {
            const r = (selectRef.current ?? e.currentTarget).getBoundingClientRect();
            setError(null);
            setAdding({ x: r.left, y: r.top, width: r.width, height: r.height });
            return;
          }
          store.switchCulture(e.target.value);
        }}
      >
        <option value={DEFAULT_CULTURE}>Default</option>
        {cultures.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={ADD_CULTURE}>+ Add culture…</option>
      </select>
      {adding ? (
        <Popover anchor={adding} onClose={() => setAdding(null)} className="wd-culture-popover">
          <div className="wd-pop-title">Add culture</div>
          <form
            className="wd-culture-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              autoFocus
              className={`wd-pg-input mono ${error ? 'invalid' : ''}`}
              placeholder="de, fr-CA, zh-Hans…"
              aria-label="Culture tag"
              value={value}
              list="wd-culture-suggestions"
              spellCheck={false}
              data-testid="toolbar-culture-add-input"
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setAdding(null);
              }}
            />
            <datalist id="wd-culture-suggestions">
              {COMMON_CULTURES.filter((c) => !cultures.includes(c)).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button type="submit" className="wd-btn small" disabled={!value.trim()} data-testid="toolbar-culture-add-btn">
              Add
            </button>
          </form>
          {error ? <p className="wd-error">{error}</p> : <p className="wd-pop-hint">Creates {state.fileName.replace(/\.Designer\.cs$|\.cs$/i, '') || 'Form'}.&lt;culture&gt;.resx for localized Text.</p>}
        </Popover>
      ) : null}
    </div>
  );
}

const ALIGN_GROUPS: AlignOp[][] = [
  ['alignLeft', 'alignCenter', 'alignRight'],
  ['alignTop', 'alignMiddle', 'alignBottom'],
  ['sameWidth', 'sameHeight', 'sameSize'],
  ['spaceHorizontally', 'spaceVertically'],
  ['centerHorizontally', 'centerVertically'],
];

export function Toolbar({
  state,
  store,
  auditIssues,
  onShowShortcuts,
}: {
  state: DesignerState;
  store: DesignerStore;
  auditIssues: DesignAuditIssue[];
  onShowShortcuts: () => void;
}) {
  const doc = state.doc!;
  const [diagOpen, setDiagOpen] = useState<Anchor | null>(null);
  const [auditOpen, setAuditOpen] = useState<Anchor | null>(null);
  const auditBtn = useRef<HTMLButtonElement>(null);
  const auditErrors = auditIssues.filter((i) => i.severity === 'error').length;
  const auditWarnings = auditIssues.filter((i) => i.severity === 'warning').length;
  const auditTone = auditErrors ? 'error' : auditWarnings ? 'warning' : auditIssues.length ? 'info' : 'clean';

  const openAudit = () => {
    const el = auditBtn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAuditOpen({ x: r.left, y: r.top, width: r.width, height: r.height });
  };
  // Lets tests / host commands open the audit without a pointer: window.dispatchEvent(new Event('wd-open-audit')).
  useEffect(() => {
    const open = () => openAudit();
    window.addEventListener('wd-open-audit', open);
    return () => window.removeEventListener('wd-open-audit', open);
  }, []);
  const size = getSize(doc.form);
  const controlSel = state.selection.filter((id) => id !== doc.form.id);
  const n = controlSel.length;
  const diags = doc.parseDiagnostics ?? [];
  const locked = state.locked;
  // Read-only documents can still be inspected, zoomed and previewed, but never edited.
  const frozen = locked || state.readOnly;
  const minFor = (op: AlignOp) => (op.startsWith('space') ? 3 : op.startsWith('center') ? 1 : 2);
  const zoomPct = Math.round(state.zoom * 100);
  const showCultures = !!doc.localizable || doc.form.properties.Localizable === true || state.availableCultures.length > 1;

  return (
    <header className="wd-toolbar" role="toolbar" aria-label="Designer toolbar">
      <div className="wd-doc-pill" title={state.fileName}>
        <Icon name={doc.baseType === 'UserControl' ? 'UserControl' : 'Form'} />
        <span className="wd-doc-name">{doc.className || doc.form.name}</span>
        <span className="wd-doc-type">{doc.baseType}</span>
        <span className="wd-doc-size" data-testid="form-size">
          {size.width} × {size.height}
        </span>
      </div>
      {diags.length ? (
        <button
          type="button"
          className={`wd-diag-badge ${diags.some((d) => d.severity === 'error') ? 'error' : ''}`}
          title="Designer load diagnostics"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setDiagOpen(diagOpen ? null : { x: r.left, y: r.top, width: r.width, height: r.height });
          }}
        >
          <Icon name="warning" size={14} />
          <span>{diags.length}</span>
        </button>
      ) : null}
      <button
        ref={auditBtn}
        type="button"
        className={`wd-audit-badge wd-popover-keep ${auditTone}`}
        aria-haspopup="dialog"
        aria-expanded={!!auditOpen}
        aria-label={auditIssues.length ? `Layout and accessibility audit: ${auditIssues.length} issue${auditIssues.length === 1 ? '' : 's'}` : 'Layout and accessibility audit: no issues'}
        title="Layout & Accessibility Audit"
        data-testid="toolbar-audit-btn"
        onClick={() => (auditOpen ? setAuditOpen(null) : openAudit())}
      >
        <Icon name={auditIssues.length ? 'shieldAlert' : 'shieldCheck'} size={14} />
        <span>{auditIssues.length}</span>
      </button>

      <Sep />
      <Btn icon="undo" label="Undo" shortcut="Ctrl+Z" disabled={!state.canUndo || state.readOnly} onClick={() => store.undo()} testId="undo" />
      <Btn icon="redo" label="Redo" shortcut="Ctrl+Y" disabled={!state.canRedo || state.readOnly} onClick={() => store.redo()} testId="redo" />
      <Sep />

      <div className="wd-tb-group wd-tb-align" role="group" aria-label="Layout">
        {ALIGN_GROUPS.map((g, gi) => (
          <span key={gi} className="wd-tb-subgroup">
            {g.map((op) => (
              <Btn key={op} icon={op} label={labelForAlign(op)} disabled={frozen || n < minFor(op)} onClick={() => store.align(op)} testId={op} />
            ))}
          </span>
        ))}
        <span className="wd-tb-subgroup">
          <Btn icon="bringToFront" label="Bring to Front" disabled={frozen || n < 1} onClick={() => store.zOrder('front')} />
          <Btn icon="sendToBack" label="Send to Back" disabled={frozen || n < 1} onClick={() => store.zOrder('back')} />
        </span>
      </div>
      <Sep />

      <div className="wd-tb-group" role="group" aria-label="Layout mode">
        <Btn
          icon={state.settings.layoutMode === 'snaplines' ? 'snaplines' : 'snapGrid'}
          label={state.settings.layoutMode === 'snaplines' ? 'Snaplines (click for snap to grid)' : 'Snap to grid (click for snaplines)'}
          active={state.settings.layoutMode === 'grid'}
          onClick={() => store.updateSetting('layoutMode', state.settings.layoutMode === 'snaplines' ? 'grid' : 'snaplines')}
          testId="layout-mode"
        />
        <select
          className="wd-tb-select"
          aria-label="Grid size"
          title="Grid size"
          value={state.settings.gridSize}
          onChange={(e) => store.updateSetting('gridSize', Number(e.target.value))}
        >
          {[4, 8, 12, 16].map((g) => (
            <option key={g} value={g}>
              {g}px
            </option>
          ))}
        </select>
        <Btn icon="grid" label="Show grid" active={state.settings.showGrid} onClick={() => store.updateSetting('showGrid', !state.settings.showGrid)} testId="show-grid" />
      </div>
      <Sep />
      <Btn
        text="01"
        icon="tabOrder"
        label="Tab Order"
        active={state.tabOrderMode}
        disabled={state.readOnly}
        onClick={() => store.toggleTabOrder()}
        testId="toolbar-tab-order-btn"
      />
      <Btn icon={locked ? 'lock' : 'unlock'} label="Lock Controls" active={locked} onClick={() => store.setState({ locked: !locked })} testId="lock" />
      <div className="wd-segment" role="radiogroup" aria-label="Render style">
        {(['fluent', 'classic'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={state.settings.renderStyle === s}
            className={state.settings.renderStyle === s ? 'on' : ''}
            data-testid={`toolbar-style-${s}`}
            onClick={() => store.updateSetting('renderStyle', s)}
          >
            {s === 'fluent' ? 'Fluent' : 'Classic'}
          </button>
        ))}
      </div>

      {showCultures ? (
        <>
          <Sep />
          <CultureSwitcher state={state} store={store} />
        </>
      ) : null}

      <span className="wd-tb-spacer" />

      <div className="wd-tb-group wd-zoom" role="group" aria-label="Zoom">
        <Btn icon="zoomOut" label="Zoom out" shortcut="Ctrl+-" onClick={() => store.zoomStep(-1)} />
        <button type="button" className="wd-zoom-value" title="Reset zoom to 100%" onClick={() => store.setZoom(1)} data-testid="zoom">
          {zoomPct}%
        </button>
        <Btn icon="zoomIn" label="Zoom in" shortcut="Ctrl+=" onClick={() => store.zoomStep(1)} />
        <Btn icon="fit" label="Zoom to fit" onClick={() => window.dispatchEvent(new CustomEvent('wd-fit'))} />
      </div>
      <Sep />
      <Btn icon="preview" text="Preview" label="Preview form" onClick={() => store.setState({ previewOpen: true })} testId="toolbar-preview-btn" />
      {state.hasProject ? <Btn icon="play" text="Run" label="Run WinForms Project (dotnet run)" onClick={() => store.runProject()} testId="toolbar-run-btn" /> : null}
      <Btn icon="code" label="View Code" shortcut="F7" onClick={() => store.post({ type: 'viewCode' })} testId="view-code" />
      <Btn icon="splitCode" label="Split: designer code side by side" onClick={() => store.post({ type: 'viewDesignerCode', beside: true })} testId="split-code" />
      <Sep />
      <Btn icon="help" label="Keyboard shortcuts" shortcut="?" onClick={onShowShortcuts} testId="toolbar-shortcuts-btn" />

      {auditOpen ? (
        <AuditPopover
          issues={auditIssues}
          anchor={auditOpen}
          onClose={() => setAuditOpen(null)}
          onPick={(issue) => {
            store.select([issue.nodeId]);
            revealOnCanvas(issue.nodeId);
            setAuditOpen(null);
          }}
          canFix={(issue) => !state.readOnly && canFixAuditIssue(doc, issue, state.layout)}
          onFix={(issue) => store.fixAuditIssue(issue)}
          onFixAll={() => store.fixAllAuditIssues()}
        />
      ) : null}
      {diagOpen ? (
        <Popover anchor={diagOpen} onClose={() => setDiagOpen(null)} className="wd-diag-popover">
          <div className="wd-pop-title">Designer diagnostics</div>
          <ul className="wd-diag-list">
            {diags.map((d, i) => (
              <li key={i} className={d.severity}>
                <Icon name={d.severity === 'info' ? 'info' : 'warning'} size={14} />
                <span>
                  {d.message}
                  {d.line !== undefined ? <em> line {d.line}</em> : null}
                </span>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </header>
  );
}
