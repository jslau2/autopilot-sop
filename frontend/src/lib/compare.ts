/**
 * Helpers for the Scenario Comparison dashboard: normalise KPI values coming
 * from either the demo dataset (numbers) or the backend (strings like
 * "97.8%", "+$140,000", "4.3 wks") into comparable numerics, and score a set
 * of cycles to pick a "recommended" one.
 */

export type MetricKey = 'otif' | 'forecastAcc' | 'capacityUtil' | 'wos' | 'planDelta';
export type MetricDir = 'up' | 'target';

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: '%' | 'wk' | '$';
  dir: MetricDir;
  target?: number;
  hint: string;
}

export const METRICS: MetricDef[] = [
  { key: 'otif',         label: 'OTIF Forecast',        unit: '%',  dir: 'up',                 hint: 'higher is better · target ≥ 98%' },
  { key: 'forecastAcc',  label: 'Forecast Accuracy',    unit: '%',  dir: 'up',                 hint: 'higher is better' },
  { key: 'capacityUtil', label: 'Capacity Utilisation', unit: '%',  dir: 'target', target: 88, hint: 'best near ~88% · too high = risk' },
  { key: 'wos',          label: 'Weeks of Supply',      unit: 'wk', dir: 'target', target: 4.5, hint: 'best in the 4–5 wk band' },
  { key: 'planDelta',    label: 'Plan Δ EBIT',          unit: '$',  dir: 'up',                 hint: 'higher is better' },
];

export type CycleKpis = Partial<Record<MetricKey, number | null>>;

export interface CompareCycle {
  id: string;
  name: string;
  meta: string;
  status: string;
  kpis: CycleKpis;
  decision?: string;
}

/** Parse a KPI value (number or messy string) into a plain number, or null. */
export function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // handle k / m / b suffixes (e.g. "+$140k", "1.2m")
  const mult = /([kmb])\b/i.exec(s);
  const factor = mult ? { k: 1e3, m: 1e6, b: 1e9 }[mult[1].toLowerCase() as 'k' | 'm' | 'b'] : 1;
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n * factor : null;
}

/** Normalise a backend/demo kpi bag into numeric MetricKey values. */
export function normalizeKpis(raw: Record<string, unknown> | CycleKpis): CycleKpis {
  return {
    otif: toNum((raw as Record<string, unknown>).otif),
    forecastAcc: toNum((raw as Record<string, unknown>).forecastAcc),
    capacityUtil: toNum((raw as Record<string, unknown>).capacityUtil),
    wos: toNum((raw as Record<string, unknown>).wos),
    planDelta: toNum((raw as Record<string, unknown>).planDelta),
  };
}

/** Format a metric value for display. */
export function fmt(def: MetricDef, v: number | null): string {
  if (v == null) return '—';
  if (def.unit === '%') return `${v.toFixed(1)}%`;
  if (def.unit === 'wk') return `${v.toFixed(1)} wk`;
  // $ — planDelta is expressed in $k in the demo / live KPIs
  if (Math.abs(v) >= 1000) return `${v < 0 ? '-' : '+'}$${Math.round(Math.abs(v) / 1000)}k`;
  return `${v < 0 ? '-' : '+'}$${Math.abs(v)}k`;
}

/** Signed delta of a value vs the baseline, formatted. */
export function fmtDelta(def: MetricDef, v: number | null, base: number | null): string {
  if (v == null || base == null) return '';
  const d = v - base;
  if (Math.abs(d) < 1e-9) return '—';
  const sign = d > 0 ? '+' : '';
  if (def.unit === '%') return `${sign}${d.toFixed(1)} pts`;
  if (def.unit === 'wk') return `${sign}${d.toFixed(1)} wk`;
  return `${sign}${Math.round(d)}k`;
}

/**
 * Per-metric score in [0,1] — higher is better. For 'up' metrics we min-max
 * across the compared set; for 'target' metrics we score by closeness to the
 * target (the spread of the set sets the scale).
 */
function metricScores(def: MetricDef, vals: (number | null)[]): (number | null)[] {
  const present = vals.filter((v): v is number => v != null);
  if (present.length === 0) return vals.map(() => null);

  if (def.dir === 'up') {
    const min = Math.min(...present);
    const max = Math.max(...present);
    const span = max - min || 1;
    return vals.map(v => (v == null ? null : (v - min) / span));
  }
  // target: closeness — distance from target, normalised by worst distance.
  const target = def.target ?? 0;
  const dists = present.map(v => Math.abs(v - target));
  const worst = Math.max(...dists) || 1;
  return vals.map(v => (v == null ? null : 1 - Math.abs(v - target) / worst));
}

export interface ScoredMetric {
  values: (number | null)[];
  /** index of the best cycle for this metric, or -1 */
  bestIdx: number;
}

/** Which cycle is best for each metric + a composite "recommended" index. */
export function scoreCycles(cycles: CompareCycle[]): {
  perMetric: Record<MetricKey, ScoredMetric>;
  recommendedIdx: number;
  composite: number[];
} {
  const perMetric = {} as Record<MetricKey, ScoredMetric>;
  const composite = cycles.map(() => 0);
  const counts = cycles.map(() => 0);

  for (const def of METRICS) {
    const values = cycles.map(c => c.kpis[def.key] ?? null);
    const scores = metricScores(def, values);
    let bestIdx = -1;
    let bestScore = -Infinity;
    scores.forEach((sc, i) => {
      if (sc == null) return;
      composite[i] += sc;
      counts[i] += 1;
      if (sc > bestScore) { bestScore = sc; bestIdx = i; }
    });
    perMetric[def.key] = { values, bestIdx };
  }

  const avg = composite.map((c, i) => (counts[i] ? c / counts[i] : -1));
  let recommendedIdx = -1;
  let best = -Infinity;
  avg.forEach((a, i) => { if (a > best) { best = a; recommendedIdx = i; } });
  return { perMetric, recommendedIdx, composite: avg };
}
