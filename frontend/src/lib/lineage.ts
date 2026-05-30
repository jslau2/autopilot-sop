import type { SimState, Step } from '../types';
import { AGENTS } from '../data/agents';
import { REASONING } from '../data/reasoning';

/**
 * Explainability + data lineage. Maps each headline KPI to the agents that drive
 * it, then traces back through the run's steps to the agent reasoning and the
 * underlying data source (SAP table / supplier feed) — so any number can answer
 * "Why?".
 */

export interface KpiDriver {
  agentName: string;
  agentColor: string;
  stepLabel: string;
  dataSource: string;
  result: string;
  reasoning: string;
}

export interface Lineage {
  kpiLabel: string;
  value: string;
  drivers: KpiDriver[];
  sources: string[];
}

const KPI_META: Record<string, { label: string; agents: string[]; format: (v: unknown) => string }> = {
  otif:         { label: 'OTIF Forecast',        agents: ['finance', 'optimizer', 'capacity'], format: v => (v == null ? '—' : String(v)) },
  forecastAcc:  { label: 'Forecast Accuracy',    agents: ['demand', 'spi'],                    format: v => (v == null ? '—' : String(v)) },
  capacityUtil: { label: 'Capacity Utilisation', agents: ['capacity', 'wip', 'tooling'],       format: v => (v == null ? '—' : String(v)) },
  wos:          { label: 'Weeks of Supply',      agents: ['inventory', 'procurement'],         format: v => (v == null ? '—' : `${v} wk`) },
  planDelta:    { label: 'Plan Δ EBIT',          agents: ['finance', 'optimizer'],             format: v => (v == null ? '—' : `+$${v}k`) },
};

export function buildLineage(S: SimState, kpiKey: string): Lineage {
  const meta = KPI_META[kpiKey] ?? { label: kpiKey, agents: [], format: (v: unknown) => String(v ?? '—') };
  const value = meta.format((S.kpis as unknown as Record<string, unknown>)[kpiKey]);

  // step completion messages by id (strip glyphs)
  const doneMsg: Record<string, string> = {};
  for (const e of S.events) {
    if (e.type === 'done' && e.stepId) doneMsg[e.stepId] = e.message.replace(/^[\s✓▶✗⚠↳•]+/, '');
  }
  const liveReasoning = (s: Step): string => {
    const trace = (s.output as Record<string, unknown> | null)?._trace as { role: string; content: string; tool_calls?: unknown[] }[] | undefined;
    if (!trace) return '';
    return trace.filter(m => m.role === 'assistant' && (!m.tool_calls || (m.tool_calls as unknown[]).length === 0))
      .map(m => m.content).filter(Boolean).join(' ');
  };

  const steps = Object.values(S.steps);
  const drivers: KpiDriver[] = [];
  const sources = new Set<string>();

  for (const agentId of meta.agents) {
    const agentSteps = steps.filter(s => s.agent === agentId && s.type === 'task');
    // prefer the most-complete / last step for this agent
    const s = agentSteps[agentSteps.length - 1];
    if (!s) continue;
    const ag = AGENTS[agentId];
    if (s.dataSource) sources.add(s.dataSource);
    drivers.push({
      agentName: ag?.name ?? agentId,
      agentColor: ag?.color ?? 'var(--text-2)',
      stepLabel: s.label,
      dataSource: s.dataSource ?? '',
      result: doneMsg[s.id] ?? '',
      reasoning: liveReasoning(s) || REASONING[s.id] || '',
    });
  }

  return { kpiLabel: meta.label, value, drivers, sources: [...sources] };
}
