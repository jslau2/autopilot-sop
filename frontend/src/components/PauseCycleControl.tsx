/**
 * Pause/Resume control for a running live cycle. Parks the orchestrator at its
 * next safe checkpoint (resumable) — it does NOT terminate the run. Rendered as
 * a span so it nests validly inside the clickable Link/button session rows.
 */
export default function PauseCycleControl({
  sessionId,
  paused,
  onToggled,
}: {
  sessionId: string;
  paused: boolean;
  onToggled: (paused: boolean) => void;
}) {
  const accent = paused ? 'oklch(0.72 0.17 148)' : 'oklch(0.75 0.16 75)';  // green resume / amber pause
  return (
    <span
      role="button"
      tabIndex={0}
      title={paused ? 'Resume cycle' : 'Pause cycle (resume anytime)'}
      aria-label={paused ? 'Resume cycle' : 'Pause cycle'}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = paused ? 'resume' : 'pause';
        try {
          const res = await fetch(`/api/sessions/${sessionId}/${action}`, { method: 'POST' });
          if (res.ok) onToggled(!paused);
        } catch { /* leave state as-is on failure */ }
      }}
      style={{
        flexShrink: 0, width: 22, height: 22, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', borderRadius: 5,
        color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', lineHeight: 1,
        transition: 'color .15s, background .15s',
      }}
      onMouseOver={e => { e.currentTarget.style.color = accent; e.currentTarget.style.background = accent.replace(')', ' / 0.12)'); }}
      onMouseOut={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
    >{paused ? '▶' : '⏸'}</span>
  );
}
