import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface Shared {
  name: string;
  goal: string;
  status: string;
  kpis: Record<string, string | number | null>;
  exec_summary: string;
  decisions: { question: string; answer: string; rationale?: string }[];
  approvals: { role: string; decision: string; approver: string; comment: string }[];
  activity: { agent: string; label: string; result: string; data_source: string }[];
  elapsed: number;
}

const KPI_ROWS: [string, string][] = [
  ['otif', 'OTIF Forecast'], ['forecastAcc', 'Forecast Accuracy'],
  ['capacityUtil', 'Capacity Utilisation'], ['wos', 'Weeks of Supply'], ['planDelta', 'Plan Δ EBIT'],
];

/**
 * Public, read-only view of a shared run / report. No app chrome, no controls —
 * just the executive snapshot, so it can be handed to anyone via a link.
 */
export default function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState<Shared | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setErr('This shared link is invalid or has expired.'));
  }, [token]);

  const fmtKpi = (k: string, v: unknown) => v == null ? '—' : k === 'planDelta' ? `+$${v}k` : k === 'wos' ? `${v} wk` : String(v);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, color: 'var(--text-2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Autopilot S&amp;OP</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>read-only share</span>
        </div>

        {err && <div style={{ padding: 24, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-2)' }}>{err}</div>}

        {data && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>{data.name}</h1>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Executive S&amp;OP snapshot · status: {data.status} · {data.elapsed.toFixed(1)}s</div>

            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'oklch(0.55 0.18 260 / 0.1)', border: '1px solid oklch(0.55 0.18 260 / 0.35)', marginBottom: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: 'oklch(0.78 0.16 260)', marginBottom: 4 }}>EXECUTIVE SUMMARY</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-1)' }}>{data.exec_summary}</div>
            </div>

            <SectionLabel>Executive KPIs</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 22 }}>
              {KPI_ROWS.map(([k, label]) => (
                <div key={k} style={{ padding: '12px 8px', borderRadius: 9, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{fmtKpi(k, data.kpis[k])}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {data.decisions.length > 0 && (
              <>
                <SectionLabel>Key Decisions</SectionLabel>
                <div style={{ marginBottom: 22 }}>
                  {data.decisions.map((d, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{d.question}</div>
                      <div style={{ fontSize: 12.5, color: 'oklch(0.75 0.15 150)', fontWeight: 600, marginTop: 3 }}>↳ {d.answer}</div>
                      {d.rationale && <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 2 }}>“{d.rationale}”</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {data.approvals.length > 0 && (
              <>
                <SectionLabel>Approvals</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                  {data.approvals.map((a, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 14, background: 'var(--bg-base)', border: '1px solid var(--border)', color: a.decision === 'approve' ? 'oklch(0.76 0.15 150)' : 'oklch(0.72 0.18 25)' }}>
                      {a.decision === 'approve' ? '✓' : '✕'} {a.role}{a.approver ? ` · ${a.approver}` : ''}
                    </span>
                  ))}
                </div>
              </>
            )}

            <SectionLabel>Agent Activity</SectionLabel>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {data.activity.map((a, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.label}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text-3)' }}>{a.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6, marginBottom: 12 }}>{children}</div>;
}
