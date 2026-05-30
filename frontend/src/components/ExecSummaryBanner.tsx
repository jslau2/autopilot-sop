import { useMemo, useState } from 'react';
import type { SimState } from '../types';
import { buildReport } from '../lib/report';
import { useExecSummary } from '../hooks/useExecSummary';

/**
 * Auto-generated 3-sentence "what happened + what I recommend" banner shown at
 * the top of a finished run. Live mode upgrades to the LLM summary; demo uses
 * the heuristic. Dismissible.
 */
export default function ExecSummaryBanner({
  S, name, goal, sessionId, demoMode,
}: {
  S: SimState; name: string; goal: string; sessionId?: string; demoMode?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const report = useMemo(() => buildReport(S, { name, goal }), [S, name, goal]);
  const { summary, source, loading } = useExecSummary(report, { sessionId, demoMode, enabled: !dismissed });

  if (dismissed || !summary) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px',
      margin: '0 0 1px', background: 'oklch(0.55 0.18 260 / 0.10)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.3 }}>✦</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: 'oklch(0.80 0.15 260)' }}>
            AUTO EXECUTIVE SUMMARY
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>
            {loading ? 'generating…' : source === 'llm' ? 'AI-generated' : 'auto'}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-1)' }}>{summary}</p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 15, lineHeight: 1, padding: 2 }}
      >×</button>
    </div>
  );
}
