import { deleteCycle } from '../hooks/useLaunchCycle';

/**
 * Small "✕" control for deleting a cycle. Rendered as a span (not a button)
 * so it nests validly inside the clickable Link/button session rows.
 */
export default function DeleteCycleControl({
  sessionId,
  name,
  onDeleted,
}: {
  sessionId: string;
  name?: string;
  onDeleted: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      title="Delete cycle"
      aria-label="Delete cycle"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await deleteCycle(sessionId, name)) onDeleted();
      }}
      style={{
        flexShrink: 0, width: 22, height: 22, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', borderRadius: 5,
        color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', lineHeight: 1,
        transition: 'color .15s, background .15s',
      }}
      onMouseOver={e => { e.currentTarget.style.color = 'oklch(0.7 0.2 25)'; e.currentTarget.style.background = 'oklch(0.7 0.2 25 / 0.12)'; }}
      onMouseOut={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
    >✕</span>
  );
}
