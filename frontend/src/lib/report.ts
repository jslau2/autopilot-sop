import type { SimState, Step } from '../types';
import { AGENTS } from '../data/agents';

export interface ReportData {
  name: string;
  goal: string;
  generatedAt: string;
  status: string;
  elapsedSec: number;
  stepCount: number;
  execSummary?: string;
  kpis: { label: string; value: string }[];
  decisions: { question: string; answer: string; rationale?: string }[];
  finance: { agent: string; task: string; result: string; metrics: [string, string][] }[];
  risk: { agent: string; task: string; result: string; metrics: [string, string][] }[];
  riskLogs: string[];
  activity: { agent: string; task: string; result: string; records: number; metrics: [string, string][] }[];
}

/**
 * Heuristic 3-sentence "what happened + what I recommend" — used as the demo /
 * offline fallback when the LLM exec-summary endpoint isn't available.
 */
export function heuristicExecSummary(r: ReportData): string {
  const kv = Object.fromEntries(r.kpis.map(k => [k.label, k.value]));
  const otif = kv['OTIF Forecast'];
  const fa = kv['Forecast Accuracy'];
  const cap = kv['Capacity Utilisation'];
  const wos = kv['Weeks of Supply'];
  const ebit = kv['Plan Δ EBIT'];

  const kpiBits = [
    otif && otif !== '—' ? `OTIF ${otif}` : null,
    fa && fa !== '—' ? `forecast accuracy ${fa}` : null,
    cap && cap !== '—' ? `capacity utilisation ${cap}` : null,
  ].filter(Boolean).join(', ');

  const s1 = `The cycle ran ${r.stepCount} agent task${r.stepCount === 1 ? '' : 's'} across demand, supply, optimisation and risk${kpiBits ? `, landing at ${kpiBits}` : ''}.`;

  const d = r.decisions[0];
  const s2 = d
    ? `The key human decision — ${d.question.replace(/\s+/g, ' ').slice(0, 120)} — was resolved as "${(d.answer || 'pending').slice(0, 80)}".`
    : 'No human decision checkpoint was required during this cycle.';

  const capNum = cap ? parseFloat(cap) : NaN;
  let rec: string;
  if (ebit && /^[+]/.test(ebit)) rec = `The optimised plan protects ${ebit} EBIT vs. the unconstrained baseline — recommend approving and locking the plan.`;
  else if (!Number.isNaN(capNum) && capNum >= 92) rec = `Capacity is running hot (${cap}); recommend pre-clearing overtime or alternate routing before committing.`;
  else if (wos && wos !== '—') rec = `Weeks of supply at ${wos} is within the target band — recommend approving with standard monitoring.`;
  else rec = 'Recommend reviewing the financial and risk sign-off below before approving the plan.';

  return `${s1} ${s2} ${rec}`;
}

function agentName(id: string): string {
  return AGENTS[id]?.name ?? id;
}

function kpiRows(k: SimState['kpis']): { label: string; value: string }[] {
  return [
    { label: 'OTIF Forecast', value: k.otif ?? '—' },
    { label: 'Forecast Accuracy', value: k.forecastAcc ?? '—' },
    { label: 'Capacity Utilisation', value: k.capacityUtil ?? '—' },
    { label: 'Weeks of Supply', value: k.wos ? `${k.wos} wk` : '—' },
    { label: 'Plan Δ EBIT', value: k.planDelta != null ? `+$${k.planDelta}k` : '—' },
  ];
}

/** Build structured executive-report data from the current session state. */
export function buildReport(S: SimState, meta: { name: string; goal: string }): ReportData {
  const steps = Object.values(S.steps);
  // stepId -> completion message (strip leading status glyphs)
  const doneMsg: Record<string, string> = {};
  for (const e of S.events) {
    if (e.type === 'done' && e.stepId) doneMsg[e.stepId] = e.message.replace(/^[\s✓▶✗⚠↳•]+/, '');
  }
  const result = (s: Step) => (s.id in doneMsg ? doneMsg[s.id] : '');
  const metricsOf = (s: Step): [string, string][] => Object.entries(s.metrics ?? {});

  const task = steps.filter(s => s.type === 'task');
  const byAgent = (id: string) => task.filter(s => s.agent === id);

  const mapRows = (list: Step[]) => list.map(s => ({
    agent: agentName(s.agent),
    task: s.label,
    result: result(s),
    records: s.records,
    metrics: metricsOf(s),
  }));

  const decisions = steps
    .filter(s => s.type === 'question')
    .map(s => ({
      question: s.question?.text ?? '',
      answer: (s.output as { answer?: string } | null)?.answer ?? '',
      rationale: (s.output as { rationale?: string } | null)?.rationale ?? '',
    }))
    .filter(d => d.question);

  const riskLogs = S.events
    .filter(e => e.agent === 'risk' && e.type === 'log')
    .map(e => e.message);

  return {
    name: meta.name || 'Planning Cycle',
    goal: meta.goal || '',
    generatedAt: new Date().toLocaleString(),
    status: S.sessionStatus,
    elapsedSec: S.elapsedT,
    stepCount: task.length,
    kpis: kpiRows(S.kpis),
    decisions,
    finance: mapRows(byAgent('finance')).map(({ records: _r, ...rest }) => rest),
    risk: mapRows(byAgent('risk')).map(({ records: _r, ...rest }) => rest),
    riskLogs,
    activity: mapRows(task),
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
export function reportToMarkdown(r: ReportData): string {
  const L: string[] = [];
  L.push(`# Executive S&OP Report — ${r.name}`);
  L.push('');
  L.push(`*Generated ${r.generatedAt} · status: ${r.status} · ${r.elapsedSec.toFixed(1)}s · ${r.stepCount} agent tasks*`);
  if (r.execSummary) {
    L.push('');
    L.push('## Executive Summary');
    L.push(`> ${r.execSummary}`);
  }
  if (r.goal) {
    L.push('');
    L.push('## Goal');
    L.push('```');
    L.push(r.goal.trim());
    L.push('```');
  }

  L.push('');
  L.push('## Executive KPIs');
  L.push('| Metric | Value |');
  L.push('| --- | --- |');
  for (const k of r.kpis) L.push(`| ${k.label} | **${k.value}** |`);

  if (r.decisions.length) {
    L.push('');
    L.push('## Key Decisions');
    for (const d of r.decisions) {
      L.push(`- **Decision:** ${d.question}`);
      if (d.answer) L.push(`  - **Chosen:** ${d.answer}`);
      if (d.rationale) L.push(`  - **Rationale:** ${d.rationale}`);
    }
  }

  const section = (title: string, rows: { task: string; result: string; metrics: [string, string][] }[]) => {
    if (!rows.length) return;
    L.push('');
    L.push(`## ${title}`);
    for (const row of rows) {
      L.push(`**${row.task}**${row.result ? ` — ${row.result}` : ''}`);
      if (row.metrics.length) {
        for (const [k, v] of row.metrics) L.push(`- ${k}: ${v}`);
      }
      L.push('');
    }
  };
  section('Financial Sign-off', r.finance);
  section('Risk Register', r.risk);
  if (r.riskLogs.length) {
    for (const line of r.riskLogs) L.push(`- ${line}`);
  }

  L.push('');
  L.push('## Agent Activity Summary');
  L.push('| Agent | Task | Result |');
  L.push('| --- | --- | --- |');
  for (const a of r.activity) {
    L.push(`| ${a.agent} | ${a.task} | ${a.result.replace(/\|/g, '\\|')} |`);
  }

  L.push('');
  L.push('---');
  L.push('*Autopilot S&OP — generated report.*');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Printable HTML (light theme, used for preview + Save-as-PDF)
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function reportToHtml(r: ReportData): string {
  const kpiCards = r.kpis.map(k =>
    `<div class="kpi"><div class="kpi-v">${esc(k.value)}</div><div class="kpi-l">${esc(k.label)}</div></div>`
  ).join('');

  const decisions = r.decisions.length ? `
    <h2>Key Decisions</h2>
    ${r.decisions.map(d => `<div class="dec"><div class="q">${esc(d.question)}</div>${d.answer ? `<div class="a">↳ ${esc(d.answer)}</div>` : ''}${d.rationale ? `<div class="r" style="font-size:12px;color:#6b7280;font-style:italic;margin-top:3px;">“${esc(d.rationale)}”</div>` : ''}</div>`).join('')}` : '';

  const block = (title: string, rows: { task: string; result: string; metrics: [string, string][] }[], extra = '') => {
    if (!rows.length && !extra) return '';
    return `<h2>${title}</h2>${rows.map(row => `
      <div class="row">
        <div class="row-t">${esc(row.task)}</div>
        ${row.result ? `<div class="row-r">${esc(row.result)}</div>` : ''}
        ${row.metrics.length ? `<div class="mx">${row.metrics.map(([k, v]) => `<span class="m"><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</div>` : ''}
      </div>`).join('')}${extra}`;
  };

  const riskExtra = r.riskLogs.length
    ? `<ul class="logs">${r.riskLogs.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '';

  const activity = `
    <h2>Agent Activity Summary</h2>
    <table>
      <thead><tr><th>Agent</th><th>Task</th><th>Result</th></tr></thead>
      <tbody>${r.activity.map(a => `<tr><td>${esc(a.agent)}</td><td>${esc(a.task)}</td><td>${esc(a.result)}</td></tr>`).join('')}</tbody>
    </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Executive S&OP Report — ${esc(r.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1d24; margin: 0; padding: 40px 48px; max-width: 900px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .05em; color: #5b6472; border-bottom: 1px solid #e3e6ea; padding-bottom: 6px; margin: 28px 0 12px; }
  .sub { color: #6b7280; font-size: 12.5px; margin-bottom: 18px; }
  .goal { background: #f6f7f9; border: 1px solid #e3e6ea; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; white-space: pre-wrap; color: #374151; }
  .exec { background: #eef4ff; border: 1px solid #cdddff; border-left: 4px solid #2f6bff; border-radius: 8px; padding: 12px 16px; font-size: 13.5px; line-height: 1.55; color: #1f2937; margin: 4px 0 8px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .kpi { border: 1px solid #e3e6ea; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi-v { font-size: 20px; font-weight: 700; }
  .kpi-l { font-size: 10.5px; color: #6b7280; margin-top: 3px; }
  .dec { background: #fff8ec; border: 1px solid #f1dca7; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
  .dec .q { font-size: 13px; white-space: pre-wrap; }
  .dec .a { margin-top: 6px; font-weight: 600; color: #1d4ed8; }
  .row { padding: 8px 0; border-bottom: 1px solid #eef0f3; }
  .row-t { font-weight: 600; font-size: 13px; }
  .row-r { font-size: 12.5px; color: #4b5563; margin-top: 2px; }
  .mx { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .m { font-size: 11px; background: #f1f3f5; border-radius: 4px; padding: 2px 7px; color: #374151; }
  .m b { color: #111827; font-weight: 600; }
  ul.logs { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
  .foot { margin-top: 28px; color: #9ca3af; font-size: 11px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Executive S&amp;OP Report — ${esc(r.name)}</h1>
  <div class="sub">Generated ${esc(r.generatedAt)} · status: ${esc(r.status)} · ${r.elapsedSec.toFixed(1)}s · ${r.stepCount} agent tasks</div>
  ${r.execSummary ? `<div class="exec">${esc(r.execSummary)}</div>` : ''}
  ${r.goal ? `<h2>Goal</h2><div class="goal">${esc(r.goal.trim())}</div>` : ''}
  <h2>Executive KPIs</h2>
  <div class="kpis">${kpiCards}</div>
  ${decisions}
  ${block('Financial Sign-off', r.finance)}
  ${block('Risk Register', r.risk, riskExtra)}
  ${activity}
  <div class="foot">Autopilot S&amp;OP — generated report.</div>
</body></html>`;
}
