import type { KPIs } from '../types';

/**
 * Lightweight what-if estimator: given the current run's KPIs and three levers
 * (demand %, capacity %, lead-time weeks), estimate the new KPIs WITHOUT a full
 * re-run. Deliberately simple and transparent — it's a directional estimate to
 * support the conversation, not the optimiser.
 */

export interface WhatIfLevers {
  demandPct: number;    // -30 .. +40
  capacityPct: number;  // -15 .. +20
  leadWeeks: number;    // 0 .. +8
}

export const ZERO_LEVERS: WhatIfLevers = { demandPct: 0, capacityPct: 0, leadWeeks: 0 };

export interface EstKpi {
  key: string;
  label: string;
  base: number | null;
  est: number | null;
  unit: '%' | 'wk' | '$k';
  better: 'up' | 'down' | 'band';
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function estimate(kpis: KPIs, lv: WhatIfLevers): EstKpi[] {
  const d = lv.demandPct / 100;
  const c = lv.capacityPct / 100;
  const lead = lv.leadWeeks;

  const baseOtif = num(kpis.otif);
  const baseCap = num(kpis.capacityUtil) ?? 85;
  const baseWos = num(kpis.wos) ?? 4.5;
  const baseEbit = kpis.planDelta ?? 0; // $k

  // Capacity utilisation scales with demand, eased by added capacity.
  const estCap = clamp(baseCap * (1 + d) / (1 + c), 0, 130);

  // OTIF erodes when capacity runs hot and when lead-time stretches.
  const otifPenalty = Math.max(0, estCap - 92) * 0.45 + lead * 0.6 + Math.max(0, d) * 4;
  const otifGain = Math.max(0, c) * 3 + Math.max(0, -d) * 2;
  const estOtif = baseOtif != null ? clamp(baseOtif - otifPenalty + otifGain, 60, 99.9) : null;

  // Weeks of supply: more demand burns it down, more capacity / less demand builds it; lead-time hurts effective cover.
  const estWos = clamp(baseWos * (1 + c) / (1 + d) - lead * 0.12, 0.5, 12);

  // EBIT: extra demand adds contribution, but hot capacity adds overtime cost; lead-time risk costs expedite.
  const estEbit = Math.round(
    baseEbit + d * 600 - Math.max(0, estCap - 95) * 12 - lead * 9,
  );

  return [
    { key: 'otif', label: 'OTIF', base: baseOtif, est: estOtif, unit: '%', better: 'up' },
    { key: 'capacityUtil', label: 'Capacity Util.', base: baseCap, est: estCap, unit: '%', better: 'band' },
    { key: 'wos', label: 'Weeks of Supply', base: baseWos, est: estWos, unit: 'wk', better: 'band' },
    { key: 'planDelta', label: 'Plan Δ EBIT', base: baseEbit, est: estEbit, unit: '$k', better: 'up' },
  ];
}

export function leversToGoalNote(lv: WhatIfLevers): string {
  const bits: string[] = [];
  if (lv.demandPct) bits.push(`demand ${lv.demandPct > 0 ? '+' : ''}${lv.demandPct}%`);
  if (lv.capacityPct) bits.push(`capacity ${lv.capacityPct > 0 ? '+' : ''}${lv.capacityPct}%`);
  if (lv.leadWeeks) bits.push(`lead-time +${lv.leadWeeks} wks`);
  return bits.length ? `What-if adjustments: ${bits.join(', ')}.` : '';
}

export function fmt(unit: EstKpi['unit'], v: number | null): string {
  if (v == null) return '—';
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === 'wk') return `${v.toFixed(1)} wk`;
  return `${v >= 0 ? '+' : ''}$${Math.round(v)}k`;
}
