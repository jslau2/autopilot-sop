import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useDemoMode } from '../hooks/useDemoMode';

interface Totals {
  prompt_tokens: number; completion_tokens: number; total_tokens: number;
  cached_tokens: number; calls: number; errors: number; cost_usd: number;
  price_input_per_m: number; price_cached_input_per_m: number; price_output_per_m: number;
  retention_days?: number; window_calls?: number;
}
interface AgentRow { agent: string; calls: number; total_tokens: number; cost_usd: number; }
interface SessionRow { session_id: string; name: string; calls: number; total_tokens: number; cost_usd: number; }
interface CallRow { ts: number; session_id: string; session_name: string; agent: string; model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; cached_tokens: number; cost_usd: number; ok: boolean; error: string; }
interface Usage { totals: Totals; by_agent: AgentRow[]; by_session: SessionRow[]; recent: CallRow[]; }

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function fmtCost(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}
function ago(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function Admin() {
  const [demoMode] = useDemoMode();
  const [u, setU] = useState<Usage | null>(null);

  const load = useCallback(() => {
    if (demoMode) return;
    fetch('/api/admin/llm-usage').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setU(d); }).catch(() => {});
  }, [demoMode]);

  useEffect(() => { load(); const iv = setInterval(load, 6000); return () => clearInterval(iv); }, [load]);

  const t = u?.totals;

  return (
    <AppShell active="admin">
      <div style={{ minHeight: 'calc(100vh - 53px)', background: 'var(--bg-base)', padding: '22px 26px 60px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Admin Hub</h1>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>LLM usage & cost — fleet-wide</span>
            <span style={{ flex: 1 }} />
            <Link to="/" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>← Home</Link>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 18px' }}>
            Lifetime token usage and estimated cost across every run (counters never reset), with a full audit trail of LLM API calls.
            {t?.retention_days ? ` Breakdowns & trail cover the last ${t.retention_days} days (${t.window_calls?.toLocaleString()} calls retained).` : ''}
          </p>

          {demoMode ? (
            <div style={{ padding: '24px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
              The admin LLM audit reflects real Azure OpenAI calls — switch to <strong>LIVE</strong> mode (top bar) to see fleet usage.
            </div>
          ) : !u || !t ? (
            <div style={{ padding: '24px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-3)', fontSize: 13 }}>
              No LLM calls recorded yet. Usage appears here as runs execute.
            </div>
          ) : (
            <>
              {/* Headline totals */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
                <Card label="Total tokens" value={fmtTok(t.total_tokens)} sub={`${fmtTok(t.prompt_tokens)} in (${fmtTok(t.cached_tokens)} cached) · ${fmtTok(t.completion_tokens)} out`} accent="oklch(0.68 0.17 255)" />
                <Card label="Estimated cost" value={fmtCost(t.cost_usd)} sub={`$${t.price_input_per_m} in · $${t.price_cached_input_per_m} cached · $${t.price_output_per_m} out / 1M`} accent="oklch(0.76 0.15 150)" />
                <Card label="API calls" value={String(t.calls)} sub={`${t.errors} error${t.errors === 1 ? '' : 's'}`} accent="oklch(0.80 0.16 78)" />
                <Card label="Avg tokens / call" value={t.calls ? fmtTok(Math.round(t.total_tokens / t.calls)) : '—'} sub="across all agents" accent="oklch(0.74 0.15 320)" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <Panel title="By agent">
                  <Table head={['Agent', 'Calls', 'Tokens', 'Cost']}
                    rows={u.by_agent.map(a => [a.agent, String(a.calls), fmtTok(a.total_tokens), fmtCost(a.cost_usd)])} />
                </Panel>
                <Panel title="By run">
                  <Table head={['Run', 'Calls', 'Tokens', 'Cost']}
                    rows={u.by_session.map(s => [s.name || s.session_id.slice(0, 8), String(s.calls), fmtTok(s.total_tokens), fmtCost(s.cost_usd)])} />
                </Panel>
              </div>

              <Panel title={`Audit trail — recent LLM calls (${u.recent.length})`}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>{['When', 'Run', 'Agent', 'In', 'Cached', 'Out', 'Total', 'Cost', ''].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {u.recent.map((c, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td style={tdStyle}>{ago(c.ts)}</td>
                          <td style={tdStyle}>{c.session_name || (c.session_id ? c.session_id.slice(0, 8) : '—')}</td>
                          <td style={{ ...tdStyle, color: 'var(--text-1)', fontWeight: 600 }}>{c.agent}</td>
                          <td style={tdStyle}>{c.prompt_tokens.toLocaleString()}</td>
                          <td style={{ ...tdStyle, color: c.cached_tokens > 0 ? 'oklch(0.74 0.15 150)' : 'var(--text-3)' }}>{c.cached_tokens > 0 ? c.cached_tokens.toLocaleString() : '—'}</td>
                          <td style={tdStyle}>{c.completion_tokens.toLocaleString()}</td>
                          <td style={{ ...tdStyle, color: 'var(--text-1)' }}>{c.total_tokens.toLocaleString()}</td>
                          <td style={tdStyle}>{fmtCost(c.cost_usd)}</td>
                          <td style={tdStyle}>{c.ok ? <span style={{ color: 'oklch(0.74 0.15 150)' }}>✓</span> : <span style={{ color: 'oklch(0.72 0.18 25)' }} title={c.error}>✕</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 11, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 2px' }}>No data yet.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead><tr>{head.map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {r.map((c, j) => <td key={j} style={{ ...tdStyle, textAlign: j === 0 ? 'left' : 'right', color: j === 0 ? 'var(--text-1)' : 'var(--text-2)', fontWeight: j === 0 ? 600 : 400 }}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' };
