import { useState } from 'react';

/**
 * Reusable 👍 / 👎 + optional comment control. Posts to /api/feedback in live
 * mode; in demo mode it records locally (localStorage) so the affordance still
 * works in sales demos. Used per agent-step (Drawer) and per run (toolbar).
 */
export interface FeedbackTarget {
  sessionId?: string;
  target: string;        // "run" or a step_id
  targetLabel?: string;
  agentId?: string;
  demoMode?: boolean;
}

function recordDemo(entry: Record<string, unknown>) {
  try {
    const key = 'sop-feedback-demo';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push({ ...entry, ts: Date.now() / 1000 });
    localStorage.setItem(key, JSON.stringify(arr.slice(-200)));
  } catch { /* ignore */ }
}

export default function FeedbackControl({
  sessionId, target, targetLabel, agentId, demoMode, compact,
}: FeedbackTarget & { compact?: boolean }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const send = async (r: 'up' | 'down', withComment: string) => {
    const payload = {
      session_id: sessionId || '',
      target,
      target_label: targetLabel || '',
      agent_id: agentId || '',
      rating: r,
      comment: withComment,
    };
    if (demoMode) { recordDemo(payload); return; }
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch { /* swallow — feedback is best-effort */ }
  };

  const pick = (r: 'up' | 'down') => {
    setRating(r);
    setShowComment(true);
    void send(r, ''); // record the rating immediately; comment is optional follow-up
  };

  const submitComment = () => {
    if (rating) void send(rating, comment.trim());
    setShowComment(false);
    setSent(true);
  };

  if (sent && !showComment) {
    return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>✓ Thanks for the feedback</span>;
  }

  const btn = (r: 'up' | 'down', glyph: string) => (
    <button
      onClick={() => pick(r)}
      title={r === 'up' ? 'Good output' : 'Needs work'}
      style={{
        width: compact ? 24 : 28, height: compact ? 24 : 28, borderRadius: 6, cursor: 'pointer',
        fontSize: compact ? 12 : 13, lineHeight: 1,
        background: rating === r
          ? (r === 'up' ? 'oklch(0.55 0.15 150 / 0.2)' : 'oklch(0.6 0.18 25 / 0.2)')
          : 'var(--bg-base)',
        border: `1px solid ${rating === r ? (r === 'up' ? 'oklch(0.6 0.15 150)' : 'oklch(0.62 0.18 25)') : 'var(--border)'}`,
        color: rating === r ? (r === 'up' ? 'oklch(0.75 0.16 150)' : 'oklch(0.72 0.18 25)') : 'var(--text-3)',
      }}
    >{glyph}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {!compact && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Helpful?</span>}
      {btn('up', '👍')}
      {btn('down', '👎')}
      {showComment && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
            placeholder="Add a comment (optional)…"
            autoFocus
            style={{
              flex: 1, fontSize: 12, padding: '5px 9px', borderRadius: 6,
              background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none',
            }}
          />
          <button
            onClick={submitComment}
            style={{
              fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', border: 'none',
            }}
          >Send</button>
        </div>
      )}
    </div>
  );
}
