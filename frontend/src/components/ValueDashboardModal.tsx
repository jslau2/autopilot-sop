import { useMemo } from 'react';
import type { SimState } from '../types';
import { computeValue } from '../lib/value';

/**
 * ROI / value dashboard — translates a run's KPIs into business value a budget
 * holder cares about (EBIT, revenue protected, savings, OTIF uplift, annualised
 * value), with the calculation basis spelled out. Works in demo and live.
 */
export default function ValueDashboardModal({
  S, name, onClose,
}: {
  S: SimState; name: string; onClose: () => void;
}) {
  const v = useMemo(() => computeValue(S), [S]);

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
          width: '100%', maxWidth: 680,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>💰 Value of this cycle</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{name} · what this plan is worth</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }} aria-label="Close">×</button>
        </div>

        <div style={{ padding: '18px' }}>
          {/* Headline annualised value */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, padding: '14px 18px',
            borderRadius: 12, background: 'oklch(0.55 0.18 150 / 0.12)', border: '1px solid oklch(0.55 0.18 150 / 0.4)',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em' }}>ANNUALISED VALUE</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'oklch(0.82 0.16 150)', lineHeight: 1.1 }}>
                {v.annualisedValue >= 1000 ? `$${(v.annualisedValue / 1000).toFixed(1)}M` : `$${Math.round(v.annualisedValue)}k`}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>this quarter</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                {v.quarterlyValue >= 1000 ? `$${(v.quarterlyValue / 1000).toFixed(2)}M` : `$${Math.round(v.quarterlyValue)}k`}
              </div>
            </div>
          </div>

          {/* Value breakdown cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {v.items.map(it => (
              <div key={it.key} style={{
                padding: '12px 14px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: it.positive ? 'oklch(0.80 0.15 150)' : 'var(--text-2)', lineHeight: 1.2 }}>
                  {it.value}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{it.sub}</div>
              </div>
            ))}
          </div>

          {/* Basis / assumptions */}
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-base)', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>HOW THIS IS CALCULATED</div>
            {v.basis.map((b, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>• {b}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
