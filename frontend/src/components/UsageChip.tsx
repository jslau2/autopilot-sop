import type { Usage } from '../types';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  return '$' + usd.toFixed(usd < 1 ? 3 : 2);
}

/**
 * Compact token-usage / estimated-cost indicator for a run.
 * `simulated` marks demo-mode estimates so the label reads honestly.
 */
export default function UsageChip({ usage, simulated }: { usage: Usage; simulated?: boolean }) {
  if (!usage || usage.totalTokens === 0) return null;
  const title =
    `${usage.promptTokens.toLocaleString()} input + ${usage.completionTokens.toLocaleString()} output ` +
    `= ${usage.totalTokens.toLocaleString()} tokens over ${usage.calls} call${usage.calls === 1 ? '' : 's'}\n` +
    `Est. cost ${fmtCost(usage.costUsd)}${simulated ? ' (simulated — demo mode)' : ''}`;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        fontSize: 11, padding: '3px 9px', borderRadius: 12,
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-2)',
      }}
    >
      <span style={{ opacity: 0.7 }}>⛁</span>
      <span className="mono">{fmtTokens(usage.totalTokens)}</span>
      <span style={{ color: 'var(--border)' }}>·</span>
      <span className="mono">{simulated ? '~' : ''}{fmtCost(usage.costUsd)}</span>
    </span>
  );
}
