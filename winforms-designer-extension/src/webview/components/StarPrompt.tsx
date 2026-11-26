// Small, non-modal toast inviting users to star the project on GitHub.
// Never takes keyboard focus: it only reacts to explicit clicks / Tab navigation.

import type { DesignerStore } from '../state/designerStore';

const STAR_PATH = 'M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z';

function StarGlyph({ size, className }: { size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={STAR_PATH} fill="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

export function StarPrompt({ store }: { store: DesignerStore }) {
  return (
    <div
      className="wd-star-prompt"
      data-testid="star-prompt"
      role="region"
      aria-label="Star Modern WinForms Designer on GitHub"
      // Mouse clicks must not pull focus off the design surface.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="wd-star-prompt-icon">
        <StarGlyph size={16} />
      </div>
      <div className="wd-star-prompt-body">
        <p className="wd-star-prompt-title">Enjoying Modern WinForms Designer?</p>
        <p className="wd-star-prompt-text">A star on GitHub helps other .NET devs find it.</p>
        <div className="wd-star-prompt-actions">
          <button type="button" className="wd-btn small wd-star-prompt-primary" data-testid="star-prompt-star" onClick={() => store.respondToStarPrompt('star')}>
            <StarGlyph size={12} />
            Star on GitHub
          </button>
          <button type="button" className="wd-star-prompt-quiet" data-testid="star-prompt-later" onClick={() => store.respondToStarPrompt('later')}>
            Later
          </button>
        </div>
      </div>
      <button
        type="button"
        className="wd-star-prompt-close"
        data-testid="star-prompt-dismiss"
        aria-label="Don't ask again"
        title="Don't ask again"
        onClick={() => store.respondToStarPrompt('dismiss')}
      >
        <svg width={12} height={12} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  );
}
