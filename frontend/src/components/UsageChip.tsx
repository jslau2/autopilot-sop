import { useState, useEffect } from 'react';

interface Usage {
  prompt_tokens: number; completion_tokens: number; total_tokens: number; calls: number;
  est_cost_usd: number;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Live token-usage + estimated-cost chip for a run (live mode only). Polls
 * /api/sessions/{id}/usage. Hover for the prompt/completion breakdown.
 */
export default function UsageChip({ sessionId, active }: { sessionId: string; active: boolean }) {
  const [u, setU] = useState<Usage | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => fetch(`/api/sessions/${sessionId}/usage`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setU(d); })
      .catch(() => {});
    poll();
    const iv = setInterval(poll, active ? 4000 : 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [sessionId, active]);

  if (!u || u.total_tokens === 0) return null;

  return (
    <span
      title={`${u.prompt_tokens.toLocaleString()} in · ${u.completion_tokens.toLocaleString()} out · ${u.calls} LLM calls · est. $${u.est_cost_usd.toFixed(4)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
        padding: '3px 9px', borderRadius: 6, background: 'var(--bg-base)',
        border: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap',
      }}
    >
      ⊟ {fmtTokens(u.total_tokens)} tok
      <span style={{ color: 'var(--text-3)' }}>·</span>
      <span style={{ color: 'oklch(0.76 0.15 150)' }}>${u.est_cost_usd.toFixed(4)}</span>
    </span>
  );
}
