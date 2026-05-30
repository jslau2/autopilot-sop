import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useDemoMode } from '../hooks/useDemoMode';
import { useEntity, ALL_ENTITIES } from '../hooks/useEntity';
import {
  METRICS, normalizeKpis, scoreCycles, fmt, fmtDelta,
  type CompareCycle,
} from '../lib/compare';

const MAX_PICK = 3;

// Demo scenarios with full numeric KPIs so the comparison is meaningful with
// no backend. (Live mode pulls real sessions.)
const DEMO_CYCLES: CompareCycle[] = [
  {
    id: 'baseline', name: 'Q3-2026 Baseline Plan', status: 'done',
    meta: 'W22–W34 · 847 SKUs · 12 plants',
    kpis: { otif: 97.8, forecastAcc: 94.4, capacityUtil: 87, wos: 4.3, planDelta: 140 },
    decision: 'Approve limited overtime on SPL-L3 to protect OTIF.',
  },
  {
    id: 'surge', name: 'July Demand Surge (+34%)', status: 'done',
    meta: 'SKU-88X spike · accept higher utilisation',
    kpis: { otif: 98.1, forecastAcc: 93.2, capacityUtil: 94, wos: 3.6, planDelta: 95 },
    decision: 'Pull forward supply, accept WoS dip to 3.6 wk.',
  },
  {
    id: 'supplier', name: 'Supplier X Disruption', status: 'done',
    meta: 'Lead-time +8 wks · contingency sourcing',
    kpis: { otif: 94.2, forecastAcc: 92.1, capacityUtil: 98, wos: 5.4, planDelta: -60 },
    decision: 'Dual-source 12 SKUs; absorb margin hit to hold service.',
  },
  {
    id: 'costdown', name: 'Cost-down Quarter', status: 'done',
    meta: 'Margin-first · trim safety stock',
    kpis: { otif: 96.4, forecastAcc: 93.8, capacityUtil: 82, wos: 4.8, planDelta: 210 },
    decision: 'Accept slightly lower OTIF for +$210k EBIT.',
  },
];

type LiveSession = {
  session_id: string;
  name: string;
  status: string;
  entity?: string;
  created_at: number;
  kpis: Record<string, unknown>;
  step_count: number;
};

function relTime(epochSec: number): string {
  const secs = Math.max(0, Date.now() / 1000 - epochSec);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Compare() {
  const [demoMode] = useDemoMode();
  const { active: activeEntity } = useEntity();
  const [params, setParams] = useSearchParams();
  const [live, setLive] = useState<CompareCycle[]>([]);

  // Available cycles to compare.
  useEffect(() => {
    if (demoMode) { setLive([]); return; }
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => {
        const list: CompareCycle[] = (d.sessions as LiveSession[] ?? [])
          .filter(s => activeEntity === ALL_ENTITIES || (s.entity || '') === activeEntity)
          .map(s => ({
            id: s.session_id,
            name: s.name || s.session_id.slice(0, 8),
            status: s.status,
            meta: `${s.step_count} steps · ${relTime(s.created_at)}${s.entity ? ' · ' + s.entity : ''}`,
            kpis: normalizeKpis(s.kpis),
          }));
        setLive(list);
      })
      .catch(() => setLive([]));
  }, [demoMode, activeEntity]);

  const available = demoMode ? DEMO_CYCLES : live;

  // Selected ids — from URL (?ids=a,b), else sensible defaults.
  const idsParam = params.get('ids');
  const selectedIds = useMemo(() => {
    const fromUrl = (idsParam || '').split(',').map(s => s.trim()).filter(Boolean);
    const valid = fromUrl.filter(id => available.some(c => c.id === id));
    if (valid.length) return valid.slice(0, MAX_PICK);
    // default: first two cycles that have any KPI
    return available.filter(c => Object.values(c.kpis).some(v => v != null)).slice(0, 2).map(c => c.id);
  }, [idsParam, available]);

  const setSelected = (ids: string[]) => {
    if (ids.length) setParams({ ids: ids.join(',') }, { replace: true });
    else setParams({}, { replace: true });
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) setSelected(selectedIds.filter(x => x !== id));
    else if (selectedIds.length < MAX_PICK) setSelected([...selectedIds, id]);
  };

  const cycles = selectedIds
    .map(id => available.find(c => c.id === id))
    .filter((c): c is CompareCycle => !!c);

  const { perMetric, recommendedIdx } = useMemo(() => scoreCycles(cycles), [cycles]);
  const recommended = recommendedIdx >= 0 ? cycles[recommendedIdx] : null;

  const accent = demoMode ? 'oklch(0.55 0.18 145)' : 'oklch(0.55 0.18 260)';

  return (
    <AppShell active="compare">
      <div style={{ minHeight: 'calc(100vh - 53px)', background: 'var(--bg-base)', padding: '22px 26px 60px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Scenario Comparison</h1>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {demoMode ? 'Demo scenarios' : 'Live cycles'} · pick up to {MAX_PICK}
            </span>
            <span style={{ flex: 1 }} />
            <Link to="/" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>← Home</Link>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 18px' }}>
            Compare baseline vs what-if cycles side-by-side: KPI deltas, trade-offs, and a recommended plan.
          </p>

          {/* Cycle picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {available.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                No cycles available to compare{!demoMode ? ' — run a couple of live cycles first.' : '.'}
              </div>
            )}
            {available.map(c => {
              const on = selectedIds.includes(c.id);
              const full = !on && selectedIds.length >= MAX_PICK;
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  disabled={full}
                  title={full ? `Deselect one first (max ${MAX_PICK})` : c.meta}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '8px 12px', borderRadius: 9, cursor: full ? 'not-allowed' : 'pointer',
                    textAlign: 'left', maxWidth: 240,
                    background: on ? accent.replace(')', ' / 0.14)') : 'var(--bg-card)',
                    border: `1px solid ${on ? accent : 'var(--border-subtle)'}`,
                    opacity: full ? 0.45 : 1,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 216 }}>
                    {on ? '✓ ' : ''}{c.name}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{c.meta}</span>
                </button>
              );
            })}
          </div>

          {cycles.length < 2 ? (
            <div style={{
              padding: '28px 20px', borderRadius: 12, textAlign: 'center',
              background: 'var(--bg-card)', border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13,
            }}>
              Select at least two cycles to compare.
            </div>
          ) : (
            <>
              {/* Recommended banner */}
              {recommended && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16,
                  borderRadius: 11, background: accent.replace(')', ' / 0.12)'),
                  border: `1px solid ${accent.replace(')', ' / 0.5)')}`,
                }}>
                  <span style={{ fontSize: 20 }}>★</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      Recommended: {recommended.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      Best balanced KPI profile across the selected scenarios.
                      {recommended.decision ? ` Key call: ${recommended.decision}` : ''}
                    </div>
                  </div>
                </div>
              )}

              {/* Comparison table */}
              <div style={{
                overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Metric</th>
                      {cycles.map((c, i) => (
                        <th key={c.id} style={{ ...thStyle, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{c.name}</span>
                            {i === recommendedIdx && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: accent, border: `1px solid ${accent}`, borderRadius: 4, padding: '1px 5px' }}>★ REC</span>
                            )}
                            {i === 0 && <span style={{ fontSize: 9, color: 'var(--text-3)' }}>baseline</span>}
                          </div>
                          <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-3)' }}>{c.status}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(def => {
                      const m = perMetric[def.key];
                      const base = cycles[0].kpis[def.key] ?? null;
                      return (
                        <tr key={def.key} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{def.label}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{def.hint}</div>
                          </td>
                          {cycles.map((c, i) => {
                            const v = c.kpis[def.key] ?? null;
                            const isBest = i === m.bestIdx && m.bestIdx >= 0 && cycles.length > 1;
                            const deltaStr = i === 0 ? '' : fmtDelta(def, v, base);
                            const up = v != null && base != null ? v - base : 0;
                            const goodDelta = def.dir === 'up' ? up > 0 : Math.abs((v ?? 0) - (def.target ?? 0)) < Math.abs((base ?? 0) - (def.target ?? 0));
                            return (
                              <td key={c.id} style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                                <span style={{
                                  fontWeight: 700, fontSize: 14,
                                  color: isBest ? 'oklch(0.78 0.16 150)' : 'var(--text-1)',
                                }}>
                                  {fmt(def, v)}
                                  {isBest && <span title="Best in this comparison" style={{ marginLeft: 5, fontSize: 11 }}>●</span>}
                                </span>
                                {deltaStr && deltaStr !== '—' && (
                                  <span style={{
                                    marginLeft: 7, fontSize: 11, fontWeight: 600,
                                    color: goodDelta ? 'oklch(0.74 0.16 150)' : 'oklch(0.7 0.19 25)',
                                  }}>{deltaStr}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Key decision row */}
                    {cycles.some(c => c.decision) && (
                      <tr style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '11px 14px', verticalAlign: 'top', fontWeight: 600, color: 'var(--text-1)' }}>
                          Key decision
                        </td>
                        {cycles.map(c => (
                          <td key={c.id} style={{ padding: '11px 14px', verticalAlign: 'top', fontSize: 12, color: 'var(--text-2)' }}>
                            {c.decision || '—'}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
                ● marks the best cycle per metric. Deltas are vs the baseline (left-most) column.
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em',
  background: 'var(--bg-base)',
};
