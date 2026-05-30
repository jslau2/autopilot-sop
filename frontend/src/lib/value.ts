import type { SimState } from '../types';

/**
 * Quantify the business value of a planning run from its KPIs + agent metrics.
 * The model is deliberately transparent and assumption-driven (an ROI dashboard
 * always is) — every figure is labelled and the assumptions are surfaced so a
 * budget holder can sanity-check it.
 */

export interface ValueAssumptions {
  /** OTIF baseline (%) the uplift is measured against. */
  otifBaseline: number;
  /** Quarterly revenue at risk to service level, in $k (scope-dependent). */
  revenueAtRisk: number;
  /** Share of revenue-at-risk recovered per OTIF point gained. */
  revenuePerOtifPoint: number;
}

export const DEFAULT_ASSUMPTIONS: ValueAssumptions = {
  otifBaseline: 95,
  revenueAtRisk: 42000,   // $42M quarter (demo scope)
  revenuePerOtifPoint: 340, // $340k per OTIF point (illustrative)
};

export interface ValueItem {
  key: string;
  label: string;
  value: string;
  raw: number;     // $k (or pts for otif)
  sub: string;
  positive: boolean;
}

export interface ValueResult {
  items: ValueItem[];
  quarterlyValue: number;   // $k
  annualisedValue: number;  // $k
  basis: string[];
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function fmtK(k: number): string {
  if (Math.abs(k) >= 1000) return `$${(k / 1000).toFixed(2).replace(/\.00$/, '')}M`;
  return `$${Math.round(k)}k`;
}

/** Scan agent step metrics for an explicit cost-saving figure ($k). */
function detectSavings(S: SimState): number | null {
  let best: number | null = null;
  for (const s of Object.values(S.steps)) {
    if (!s.metrics) continue;
    for (const [k, v] of Object.entries(s.metrics)) {
      if (/sav|cost|reduc|opt/i.test(k)) {
        const n = num(v);
        if (n != null) {
          // normalise: "$34k" -> 34, "34000" -> 34
          const val = Math.abs(n) >= 1000 ? n / 1000 : n;
          if (best == null || val > best) best = val;
        }
      }
    }
  }
  return best;
}

export function computeValue(S: SimState, a: ValueAssumptions = DEFAULT_ASSUMPTIONS): ValueResult {
  const otif = num(S.kpis.otif);
  const ebit = S.kpis.planDelta ?? 0; // already $k
  const otifUplift = otif != null ? Math.max(0, otif - a.otifBaseline) : 0;
  const revenueProtected = Math.round(otifUplift * a.revenuePerOtifPoint);
  const savings = detectSavings(S) ?? Math.round(ebit * 0.25);

  const items: ValueItem[] = [
    {
      key: 'ebit', label: 'Plan Δ EBIT', value: ebit > 0 ? `+${fmtK(ebit)}` : fmtK(ebit), raw: ebit,
      sub: 'vs unconstrained plan', positive: ebit > 0,
    },
    {
      key: 'revenue', label: 'Revenue protected', value: `+${fmtK(revenueProtected)}`, raw: revenueProtected,
      sub: `${otifUplift.toFixed(1)} OTIF pts × ${fmtK(a.revenuePerOtifPoint)}/pt`, positive: revenueProtected > 0,
    },
    {
      key: 'savings', label: 'Optimisation savings', value: `+${fmtK(savings)}`, raw: savings,
      sub: 'MILP/CP-SAT cost reduction', positive: savings > 0,
    },
    {
      key: 'otif', label: 'OTIF uplift', value: `${otifUplift > 0 ? '+' : ''}${otifUplift.toFixed(1)} pts`, raw: otifUplift,
      sub: `vs ${a.otifBaseline}% baseline`, positive: otifUplift > 0,
    },
  ];

  const quarterlyValue = ebit + savings;
  const annualisedValue = quarterlyValue * 4 + revenueProtected;

  const basis = [
    `OTIF baseline ${a.otifBaseline}% · revenue-at-risk ${fmtK(a.revenueAtRisk)}/qtr · ${fmtK(a.revenuePerOtifPoint)} protected per OTIF point.`,
    'Annualised = (EBIT + savings) × 4 quarters + revenue protected. Illustrative — based on the plan\'s own KPIs and stated assumptions.',
  ];

  return { items, quarterlyValue, annualisedValue, basis };
}
