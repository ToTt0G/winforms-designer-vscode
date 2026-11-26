// Window chrome for the designed Form: Windows 11 Fluent or Windows Classic caption,
// respecting FormBorderStyle / ControlBox / Minimize / Maximize / ShowIcon / Icon.

import type { ReactNode } from 'react';
import type { DesignNode } from '../../shared/model';
import { displayText, getBool, getEnum, getNumber, getText, resolveImage } from '../state/nodeProps';

export interface FrameMetrics {
  caption: number;
  border: number;
  none: boolean;
  tool: boolean;
}

export function frameMetrics(root: DesignNode, style: 'fluent' | 'classic'): FrameMetrics {
  if (root.type !== 'Form') return { caption: 0, border: 0, none: true, tool: false };
  const bs = getEnum(root, 'FormBorderStyle', 'Sizable');
  if (bs === 'None') return { caption: 0, border: 0, none: true, tool: false };
  const tool = bs === 'FixedToolWindow' || bs === 'SizableToolWindow';
  if (style === 'fluent') return { caption: tool ? 24 : 31, border: 1, none: false, tool };
  const sizable = bs === 'Sizable' || bs === 'SizableToolWindow';
  return { caption: tool ? 17 : 22, border: sizable ? 4 : 3, none: false, tool };
}

function CaptionButton({ kind, disabled, style }: { kind: 'min' | 'max' | 'close'; disabled?: boolean; style: 'fluent' | 'classic' }) {
  const glyph =
    kind === 'min' ? (
      <path d="M2 6.5h8" />
    ) : kind === 'max' ? (
      style === 'fluent' ? (
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      ) : (
        <path d="M2.5 2.5h7v7h-7zM2.5 3.5h7" />
      )
    ) : (
      <path d="m2.5 2.5 7 7M9.5 2.5l-7 7" />
    );
  return (
    <span className={`wf-cap-btn ${kind} ${disabled ? 'disabled' : ''}`}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={style === 'fluent' ? 1 : 1.6}>
        {glyph}
      </svg>
    </span>
  );
}

function DefaultFormIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#E8F1FB" stroke="#2C6FB7" />
      <path d="M1.5 5.5h13" stroke="#2C6FB7" />
      <rect x="3.5" y="7.5" width="4" height="4" fill="#2C6FB7" />
      <path d="M9 8h3.5M9 10h2.5" stroke="#2C6FB7" />
    </svg>
  );
}

export function FormChrome({
  root,
  style,
  resourceDataUris,
  children,
  onCaptionPointerDown,
}: {
  root: DesignNode;
  style: 'fluent' | 'classic';
  resourceDataUris: Record<string, string>;
  children: ReactNode;
  onCaptionPointerDown?: (e: React.PointerEvent) => void;
}) {
  const m = frameMetrics(root, style);
  if (root.type !== 'Form') {
    return <div className={`wf-frame wf-${style} wf-usercontrol-frame`}>{children}</div>;
  }
  if (m.none) {
    return <div className={`wf-frame wf-${style} wf-frame-none`}>{children}</div>;
  }
  const bs = getEnum(root, 'FormBorderStyle', 'Sizable');
  const controlBox = getBool(root, 'ControlBox', true);
  const minBox = getBool(root, 'MinimizeBox', true);
  const maxBox = getBool(root, 'MaximizeBox', true);
  const showIcon = getBool(root, 'ShowIcon', true) && controlBox && !m.tool && bs !== 'FixedDialog';
  const icon = resolveImage(root, 'Icon', resourceDataUris);
  const title = displayText(getText(root));
  const opacity = Math.max(0.15, Math.min(1, getNumber(root, 'Opacity', 1)));
  const showMinMax = controlBox && !m.tool && (minBox || maxBox);
  return (
    <div className={`wf-frame wf-${style} ${m.tool ? 'wf-tool' : ''}`} style={{ opacity, borderWidth: m.border }}>
      <div className="wf-caption" style={{ height: m.caption }} onPointerDown={onCaptionPointerDown} data-form-caption="true">
        {showIcon ? <span className="wf-cap-icon">{icon ? <img src={icon} alt="" width={16} height={16} draggable={false} /> : <DefaultFormIcon />}</span> : null}
        <span className="wf-cap-title">{title}</span>
        {controlBox ? (
          <span className="wf-cap-buttons">
            {showMinMax ? <CaptionButton kind="min" disabled={!minBox} style={style} /> : null}
            {showMinMax ? <CaptionButton kind="max" disabled={!maxBox} style={style} /> : null}
            <CaptionButton kind="close" style={style} />
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
