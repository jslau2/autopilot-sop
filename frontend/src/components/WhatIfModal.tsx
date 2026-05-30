import { useState, useMemo } from 'react';
import type { KPIs } from '../types';
import { estimate, leversToGoalNote, fmt, ZERO_LEVERS, type WhatIfLevers, type EstKpi } from '../lib/whatif';

function deltaColor(e: EstKpi): string {
  if (e.base == null || e.est == null) return 'var(--text-3)';
  const d = e.est - e.base;
  if (Math.abs(d) < 1e-6) return 'var(--text-3)';
  let good: boolean;
  if (e.better === 'up') good = d > 0;
  else if (e.better === 'down') good = d < 0;
  else {
    // band: closer to a sensible target is better (cap→88, wos→4.5)
    const target = e.key === 'capacityUtil' ? 88 : 4.5;
    good = Math.abs(e.est - target) < Math.abs(e.base - target);
  }
  return good ? 'oklch(0.76 0.16 150)' : 'oklch(0.7 0.19 25)';
}

/**
 * Interactive what-if sliders — drag demand / capacity / lead-time and watch the
 * KPIs re-estimate live (lightweight model, not a full re-run). "Launch as a
 * what-if run" hands the adjusted constraints to the launch flow.
 */
export default function WhatIfModal({
  kpis, onClose, onBranch,
}: {
  kpis: KPIs;
  onClose: () => void;
  onBranch: (note: string) => void;
}) {
  const [lv, setLv] = useState<WhatIfLevers>(ZERO_LEVERS);
  const est = useMemo(() => estimate(kpis, lv), [kpis, lv]);
  const dirty = lv.demandPct !== 0 || lv.capacityPct !== 0 || lv.leadWeeks !== 0;

  const slider = (label: string, key: keyof WhatIfLevers, min: number, max: number, step: number, suffix: string) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{lv[key] > 0 ? '+' : ''}{lv[key]}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={lv[key]}
        onChange={e => setLv(s => ({ ...s, [key]: Number(e.target.value) }))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  );

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
          width: '100%', maxWidth: 560,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>🎚 What-if simulator</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Drag the levers — KPIs re-estimate live (directional, not a full re-run)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }} aria-label="Close">×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
            {slider('Demand change', 'demandPct', -30, 40, 1, '%')}
            {slider('Capacity change', 'capacityPct', -15, 20, 1, '%')}
            {slider('Supplier lead-time', 'leadWeeks', 0, 8, 1, ' wks')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {est.map(e => (
              <div key={e.key} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-1)' }}>{fmt(e.unit, e.est)}</span>
                  {dirty && e.base != null && e.est != null && Math.abs(e.est - e.base) > 1e-6 && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: deltaColor(e) }}>
                      {e.est - e.base > 0 ? '▲' : '▼'} from {fmt(e.unit, e.base)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => setLv(ZERO_LEVERS)}
              style={{ fontSize: 12, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >Reset</button>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => onBranch(leversToGoalNote(lv))}
              disabled={!dirty}
              title="Open a what-if branch with these adjustments"
              style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: dirty ? 'pointer' : 'default', background: 'var(--accent)', color: '#fff', border: 'none', opacity: dirty ? 1 : 0.5 }}
            >⎇ Launch as what-if run</button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 10 }}>
            Estimates use a transparent directional model; launch a full run for the optimiser's exact plan.
          </div>
        </div>
      </div>
    </div>
  );
}
