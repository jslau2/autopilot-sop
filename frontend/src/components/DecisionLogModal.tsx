import { useState, useEffect, useMemo } from 'react';
import type { SimState } from '../types';

interface Decision {
  ts?: string;
  elapsed?: number;
  question: string;
  options?: string[];
  answer: string;
  rationale?: string;
  kpis_at_decision?: Record<string, string | number | null>;
}

/**
 * Decision Log / audit trail — every human decision with its rationale,
 * timestamp, and the KPI snapshot at the moment it was made. Live mode pulls
 * /api/sessions/{id}/decisions; demo builds the log from the question steps.
 */
export default function DecisionLogModal({
  S, sessionId, demoMode, onClose,
}: {
  S: SimState; sessionId?: string; demoMode?: boolean; onClose: () => void;
}) {
  const [live, setLive] = useState<Decision[] | null>(null);

  useEffect(() => {
    if (demoMode || !sessionId) return;
    fetch(`/api/sessions/${sessionId}/decisions`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setLive(d?.decisions ?? []))
      .catch(() => setLive([]));
  }, [demoMode, sessionId]);

  // Demo / fallback: derive decisions from answered question steps.
  const fromState = useMemo<Decision[]>(() => {
    return Object.values(S.steps)
      .filter(s => s.type === 'question')
      .map(s => {
        const out = (s.output as { answer?: string; rationale?: string } | null) ?? {};
        return {
          elapsed: s.endT ?? s.startT,
          question: s.question?.text ?? s.label,
          answer: out.answer ?? '',
          rationale: out.rationale ?? '',
          kpis_at_decision: S.kpis as unknown as Record<string, string | number | null>,
        };
      })
      .filter(d => d.answer);
  }, [S.steps, S.kpis]);

  const decisions = (live ?? fromState);

  const kpiLabels: Record<string, string> = {
    otif: 'OTIF', forecastAcc: 'Fcst Acc', capacityUtil: 'Cap Util', wos: 'WoS', planDelta: 'Δ EBIT',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: 'oklch(0.08 0.01 250 / 0.72)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 64px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>🗒 Decision Log</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Audit trail — {decisions.length} human decision{decisions.length === 1 ? '' : 's'} with rationale & KPI snapshot
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }} aria-label="Close">×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {decisions.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
              No human decisions recorded yet. Decisions appear here when the planner pauses for a human call.
            </div>
          )}
          {decisions.map((d, i) => (
            <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-base)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 5, padding: '1px 7px' }}>#{i + 1}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {d.ts ? `${d.ts}` : ''}{d.elapsed != null ? ` · +${Number(d.elapsed).toFixed(1)}s` : ''}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 8, lineHeight: 1.4 }}>{d.question}</div>
              {d.options && d.options.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {d.options.map(o => {
                    const chosen = d.answer && (o === d.answer || d.answer.includes(o) || o.includes(d.answer));
                    return (
                      <span key={o} style={{
                        fontSize: 10.5, padding: '2px 8px', borderRadius: 12,
                        background: chosen ? 'oklch(0.55 0.15 150 / 0.2)' : 'var(--bg-card)',
                        border: `1px solid ${chosen ? 'oklch(0.6 0.15 150)' : 'var(--border)'}`,
                        color: chosen ? 'oklch(0.78 0.15 150)' : 'var(--text-3)',
                      }}>{chosen ? '✓ ' : ''}{o}</span>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: 'var(--text-1)' }}>
                <span style={{ color: 'var(--text-3)' }}>Decision: </span>
                <strong>{d.answer}</strong>
              </div>
              {d.rationale && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>
                  “{d.rationale}”
                </div>
              )}
              {d.kpis_at_decision && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                  {Object.entries(kpiLabels).map(([k, label]) => {
                    const v = d.kpis_at_decision?.[k];
                    if (v == null || v === '') return null;
                    return (
                      <span key={k} style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                        {label}: <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{k === 'planDelta' ? `+$${v}k` : String(v)}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
