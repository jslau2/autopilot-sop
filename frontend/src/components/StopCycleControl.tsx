import { terminateCycle } from '../hooks/useLaunchCycle';

/**
 * Small "⛔" control for stopping a running/paused cycle while KEEPING it
 * (calls /terminate → archived, not deleted). Rendered as a span so it nests
 * validly inside the clickable Link/button session rows.
 */
export default function StopCycleControl({
  sessionId,
  name,
  onStopped,
}: {
  sessionId: string;
  name?: string;
  onStopped: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      title="Stop cycle (keeps the archived record)"
      aria-label="Stop cycle"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await terminateCycle(sessionId, name)) onStopped();
      }}
      style={{
        flexShrink: 0, width: 22, height: 22, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', borderRadius: 5,
        color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', lineHeight: 1,
        transition: 'color .15s, background .15s',
      }}
      onMouseOver={e => { e.currentTarget.style.color = 'oklch(0.75 0.16 75)'; e.currentTarget.style.background = 'oklch(0.75 0.16 75 / 0.12)'; }}
      onMouseOut={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
    >⛔</span>
  );
}
