import type { SimState } from '../types';

function nowTs(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function startStep(S: SimState, def: {
  id: string; agent: string; label: string; dataSource?: string; deps: string[];
}) {
  S.steps[def.id] = {
    status: 'running', startT: S.elapsedT, endT: null,
    records: 0, metrics: null, output: null, question: null, type: 'task', ...def,
  };
  S.events.push({ ts: nowTs(), type: 'start', agent: def.agent, message: `▶ ${def.label}`, stepId: def.id });
}

function completeStep(S: SimState, id: string, patch: Record<string, unknown>, msg: string) {
  const s = S.steps[id]; if (!s) return;
  Object.assign(s, { status: 'done', endT: S.elapsedT, ...patch });
  S.events.push({ ts: nowTs(), type: 'done', agent: s.agent, message: `✓ ${msg}`, stepId: id });
}

function addLog(S: SimState, agent: string, message: string) {
  S.events.push({ ts: nowTs(), type: 'log', agent, message, stepId: null });
}

function pauseForQuestion(S: SimState, id: string, agent: string, label: string, deps: string[], qtext: string) {
  S.steps[id] = {
    id, agent, label, deps, status: 'paused', type: 'question',
    startT: S.elapsedT, endT: null, records: 0, metrics: null, output: null,
    question: { text: qtext },
  };
  S.pendingQuestion = { stepId: id, text: qtext };
  S.paused = true;
  S.events.push({ ts: nowTs(), type: 'question', agent, message: '⏸ Pipeline paused — decision required', stepId: id });
}

export type SimEvent = { at: number; act: (S: SimState) => void };

export const PRE_Q1: SimEvent[] = [
  { at: 0.0, act: (S) => startStep(S, { id: 'pln-plan', agent: 'planner', label: 'Parse Goal & Horizon', dataSource: 'S&OP Config', deps: [] }) },
  { at: 0.5, act: (S) => addLog(S, 'planner', 'Initialising Q3-2026 planning cycle — 847 SKUs, 12 plants, W22–W34') },
  { at: 1.8, act: (S) => addLog(S, 'planner', 'Checking pre-known constraints: Line 4 bottleneck, Supplier X lead-time extension') },
  { at: 3.0, act: (S) => completeStep(S, 'pln-plan', { records: 847, output: { horizon: '13 weeks', plants: 12, SKUs: 847, agents: 6 }, metrics: { horizon: 'W22–W34', plants: '12', SKUs: '847', constraints: '2 flagged' } }, 'Cycle parameters set — 6 agents engaged') },

  { at: 3.2, act: (S) => startStep(S, { id: 'mda-validate', agent: 'masterdata', label: 'Master Data Validation', dataSource: 'SAP MDM · MM · PP · SD', deps: ['pln-plan'] }) },
  { at: 3.2, act: (S) => startStep(S, { id: 'proc-atp', agent: 'procurement', label: 'ATP / CTP Check', dataSource: 'Supplier Portal · ERP', deps: ['pln-plan'] }) },
  { at: 3.2, act: (S) => startStep(S, { id: 'dem-hist', agent: 'demand', label: 'Ingest & Auto Feature Engineering', dataSource: 'SAP ZSD + Promo Calendar', deps: ['pln-plan'] }) },
  { at: 3.2, act: (S) => startStep(S, { id: 'spi-inv', agent: 'spi', label: 'Load Inventory Snapshot', dataSource: 'SAP S/4HANA', deps: ['pln-plan'] }) },
  { at: 3.5, act: (S) => addLog(S, 'masterdata', 'Validating 847 SKU masters, 3,240 BOM records, 12 plant routings…') },
  { at: 3.6, act: (S) => addLog(S, 'procurement', 'Querying ATP positions for 892 critical components across 24 suppliers') },
  { at: 3.5, act: (S) => addLog(S, 'demand', 'Auto-ingesting 36-month history + 14 promo events + external signals (weather, macro index)') },
  { at: 3.6, act: (S) => addLog(S, 'spi', 'SAP S/4HANA connected (client 100) — reading inventory & WIP snapshot') },

  { at: 5.0, act: (S) => completeStep(S, 'spi-inv', { records: 10164, metrics: { on_hand: '$12.4M', wos: '4.2 wk', below_ss: '44 SKUs', excess: '$2.1M excess' } }, 'Inventory loaded — WOS 4.2, 44 SKUs below safety stock') },
  { at: 5.1, act: (S) => { S.kpis.wos = '4.2'; } },
  { at: 5.2, act: (S) => startStep(S, { id: 'inv-abc', agent: 'inventory', label: 'ABC Classification', dataSource: 'SAP Inventory + Sales History', deps: ['spi-inv'] }) },
  { at: 5.3, act: (S) => startStep(S, { id: 'tool-audit', agent: 'tooling', label: 'Die Set & Mold Audit', dataSource: 'Tooling Asset Register', deps: ['spi-inv'] }) },
  { at: 5.4, act: (S) => addLog(S, 'inventory', 'Classifying 847 SKUs by 12-month revenue velocity — computing A/B/C tiers') },
  { at: 5.6, act: (S) => addLog(S, 'tooling', 'Auditing 284 active die sets — checking shot counts, cycle times, utilisation rates') },
  { at: 5.5, act: (S) => startStep(S, { id: 'spi-prod', agent: 'spi', label: 'Production Status Review', dataSource: 'SAP PP', deps: ['spi-inv'] }) },
  { at: 5.4, act: (S) => addLog(S, 'masterdata', '⚠ 34 BOM records missing components — attempting alternate component mapping') },
  { at: 5.5, act: (S) => addLog(S, 'procurement', '⚠ 12 ATP gaps — Supplier X allocation limit reached') },
  { at: 5.4, act: (S) => addLog(S, 'spi', 'Reviewing 234 open production orders across 12 plants — checking OEE and WIP') },

  { at: 5.5, act: (S) => completeStep(S, 'dem-hist', { records: 109512, metrics: { rows: '109,512', features: '84 auto-engineered', outliers: '312 flagged', signals: '3 merged' } }, 'Feature engineering done — 84 auto-features: lag, Fourier, promo flags, macro') },
  { at: 5.6, act: (S) => startStep(S, { id: 'dem-fcst', agent: 'demand', label: 'AutoML Model Tournament', dataSource: 'ETS · Prophet · LightGBM · N-BEATS · TFT', deps: ['dem-hist'] }) },
  { at: 5.9, act: (S) => addLog(S, 'demand', 'Trial 1/5: ETS — CV MAPE 8.4%') },
  { at: 6.5, act: (S) => addLog(S, 'demand', 'Trial 2/5: Prophet+regressor — CV MAPE 6.2%') },
  { at: 6.8, act: (S) => completeStep(S, 'mda-validate', { records: 5127, metrics: { sku_master: '847 valid', bom_records: '3,206/3,240', routings: '12 plants ✓', issues: '34 flagged' } }, 'Master data validated — 34 BOM gaps flagged, 3 duplicate vendors merged') },
  { at: 7.2, act: (S) => completeStep(S, 'proc-atp', { records: 892, metrics: { components: '892 checked', atp_gaps: '12', ctp_risks: '3', moq_flags: '14 SKUs' } }, 'ATP/CTP done — 12 gaps, 3 CTP risks flagged to SPI and Risk') },
  { at: 6.9, act: (S) => startStep(S, { id: 'mda-cleanse', agent: 'masterdata', label: 'Cleanse & Quality Score', dataSource: 'SAP MDM · Auto-resolution', deps: ['mda-validate'] }) },
  { at: 7.0, act: (S) => addLog(S, 'masterdata', 'Auto-resolving 34 BOM gaps via alternate component mapping…') },
  { at: 7.1, act: (S) => addLog(S, 'demand', 'Trial 3/5: LightGBM (lag features) — CV MAPE 5.8%') },
  { at: 7.7, act: (S) => addLog(S, 'demand', 'Trial 4/5: N-BEATS — CV MAPE 6.9%') },
  { at: 8.0, act: (S) => addLog(S, 'masterdata', '31/34 BOM gaps resolved — 3 records require manual review by master data team') },
  { at: 8.1, act: (S) => addLog(S, 'demand', 'Trial 5/5: TFT Ensemble — CV MAPE 5.6% ← WINNER ✓') },
  { at: 8.2, act: (S) => addLog(S, 'demand', 'SPIKE: SKU-88X July 4–11 +34% — trade show confirmed ⚠') },
  { at: 8.3, act: (S) => completeStep(S, 'mda-cleanse', { records: 34, metrics: { bom_fixed: '31/34', manual_review: '3 records', vendor_dedup: '3 merged', quality_score: '98.7%' } }, 'Data cleansed — quality score 98.7%, 3 BOM records flagged for manual review') },

  { at: 7.8, act: (S) => completeStep(S, 'spi-prod', { records: 234, metrics: { open_orders: '234', plants_ok: '11 / 12', line4_util: '98.3% ⚠', wip_value: '$8.4M' } }, 'Production reviewed — Line 4 at 98.3% utilisation, 47 orders at risk') },
  { at: 8.2, act: (S) => completeStep(S, 'inv-abc', { records: 847, metrics: { 'A-class': '169 SKUs · 80% rev', 'B-class': '254 SKUs · 15% rev', 'C-class': '424 SKUs · 5% rev', dead_stock: '12 SKUs · $340k' } }, 'ABC done — 169 A-class SKUs protected, 12 dead-stock items flagged') },
  { at: 8.8, act: (S) => completeStep(S, 'tool-audit', { records: 284, metrics: { active_molds: '284', at_risk: '12', maint_due: '8 this qtr', critical: 'D-88X 94% util ⚠' } }, 'Die set audit — D-88X at 94% util + 92% shot-count life — bottleneck confirmed') },

  { at: 9.0, act: (S) => completeStep(S, 'dem-fcst', { records: 10964, metrics: { trials: '5 models', winner: 'TFT Ensemble', mape: '5.6% CV', bias: '−1.8%', total_vol: '2.34M units', spike: 'SKU-88X +34% ⚠' } }, 'AutoML done — TFT Ensemble wins (MAPE 5.6%), 2.34M units Q3') },
  { at: 9.1, act: (S) => { S.kpis.forecastAcc = '94.4%'; } },

  { at: 9.5, act: (S) => startStep(S, { id: 'spi-rec', agent: 'spi', label: 'S&P&I Reconciliation', dataSource: 'Demand vs Supply vs Inventory', deps: ['dem-fcst', 'spi-prod'] }) },
  { at: 9.7, act: (S) => addLog(S, 'spi', 'Three-way reconciliation: 2.34M demand vs 2.19M supply vs $12.4M inventory…') },

  { at: 11.2, act: (S) => completeStep(S, 'spi-rec', { records: 2541, metrics: { balanced_skus: '803 / 847', shortfall_skus: '44', gap_units: '1,240 units', gap_value: '$442k at risk' } }, 'Reconciliation complete — 44 SKUs in shortfall, $442k revenue at risk') },
  {
    at: 11.4, act: (S) => pauseForQuestion(S, 'pln-q1', 'planner', 'Decision Required', ['spi-rec', 'inv-abc', 'tool-audit'],
      'AutoML Forecast flags a +34% volume spike on SKU-88X (July 4–11) — TFT Ensemble confidence 94%. Both assembly and tooling present binding constraints:\n\n  · Assembly Line 4: headroom only +18% without overtime\n  · Die-set D-88X: 94% utilisation, 92% of shot-count life — insufficient headroom for +34% surge\n\nWhich approach should I plan around?\n\n  (A) Approve 840 OT hours + expedite D-88X reconditioning to W24 — cost +$178k, OTIF protected\n  (B) Accept partial shortfall — 1,240 units short, 3 key accounts at OTIF risk\n  (C) Defer 2 lower-margin SKUs to Q4 — frees assembly + tooling headroom, margin −$89k'),
  },
];

export const POST_Q1: SimEvent[] = [
  { at: 0.0, act: (S) => { const q = S.steps['pln-q1']; if (q) { q.status = 'done'; q.endT = S.elapsedT; } } },
  { at: 0.3, act: (S) => addLog(S, 'planner', 'Decision received. Propagating to Capacity, WIP & Sourcing agents in parallel…') },

  { at: 0.5, act: (S) => startStep(S, { id: 'cap-load', agent: 'capacity', label: 'Assembly Loading Plan', dataSource: 'Plant Capacity Model', deps: ['pln-q1'] }) },
  { at: 0.5, act: (S) => startStep(S, { id: 'wip-purch', agent: 'wip', label: 'Purchase Order Plan', dataSource: 'MRP / SAP MM', deps: ['pln-q1'] }) },
  { at: 0.5, act: (S) => startStep(S, { id: 'inv-replen', agent: 'inventory', label: 'Replenishment Policy', dataSource: 'MRP Profiles · ABC Rules', deps: ['pln-q1', 'inv-abc'] }) },
  { at: 0.5, act: (S) => startStep(S, { id: 'proc-commit', agent: 'procurement', label: 'Supplier Commit Plan', dataSource: 'Supplier Portal · SAP MM', deps: ['pln-q1', 'proc-atp'] }) },
  { at: 0.6, act: (S) => startStep(S, { id: 'tool-alloc', agent: 'tooling', label: 'Tooling Allocation Plan', dataSource: 'Die Set Schedule · Press Plan', deps: ['pln-q1', 'tool-audit'] }) },
  { at: 0.9, act: (S) => addLog(S, 'inventory', 'Setting SS & reorder points by ABC class — prioritising 169 A-class SKUs in production schedule') },
  { at: 0.7, act: (S) => addLog(S, 'capacity', 'Generating machine loading plan for 6 assembly lines — applying OT schedule to Line 4') },
  { at: 0.8, act: (S) => addLog(S, 'tooling', 'Allocating 284 die sets to Q3 schedule — expediting D-88X reconditioning slot to W24') },
  { at: 0.9, act: (S) => addLog(S, 'wip', 'Running MRP: 847 SKUs × 12 plants × 13 weeks — calculating net requirements') },
  { at: 1.0, act: (S) => addLog(S, 'procurement', 'Generating 127 POs across 24 suppliers — confirming lead times and capacities') },

  { at: 4.5, act: (S) => completeStep(S, 'proc-commit', { records: 127, metrics: { pos: '127 confirmed', value: '$3.8M', expedited: '8 components', coverage: '98.2%' } }, 'Supplier commit locked — $3.8M · 98.2% coverage · 8 expedited') },
  { at: 3.8, act: (S) => completeStep(S, 'inv-replen', { records: 847, metrics: { policies_set: '847 SKUs', a_class_ss: '3× AWD', replen_value: '$1.8M triggered', dead_stock_action: '12 SKUs → Finance' } }, 'Replenishment policies live — $1.8M triggered, dead-stock to Finance') },
  { at: 4.5, act: (S) => completeStep(S, 'tool-alloc', { records: 284, metrics: { allocated: '271/284', bottleneck: 'D-88X (SKU-88X)', recond_slot: 'W24 confirmed', new_molds: '3 × 12-wk LT' } }, 'Tooling allocation done — D-88X W24 recond. confirmed, 3 new molds ordered') },
  { at: 3.5, act: (S) => completeStep(S, 'cap-load', { records: 6, metrics: { lines: '6 lines', util: '87% avg', bottleneck: 'Line 4 W27–W29', ot_hours: '840 h approved' } }, 'Loading plan locked — Line 4 critical path, 840h OT scheduled') },
  { at: 3.6, act: (S) => { S.kpis.capacityUtil = '87%'; } },
  { at: 3.7, act: (S) => startStep(S, { id: 'wip-prod', agent: 'wip', label: 'Production Schedule', dataSource: 'SAP PP / FJSP', deps: ['cap-load'] }) },
  { at: 3.8, act: (S) => addLog(S, 'wip', 'Sequencing 1,847 work orders across 12 plants — priority-rule FJSP solver running') },

  { at: 5.5, act: (S) => completeStep(S, 'wip-purch', { records: 127, metrics: { pos: '127 POs', value: '$3.8M', critical_items: '8 expedited', flagged: '3 POs for approval' } }, 'PO plan generated — $3.8M, 8 critical items expedited to procurement') },

  { at: 8.0, act: (S) => completeStep(S, 'wip-prod', { records: 1847, metrics: { work_orders: '1,847', plants: '12', efficiency: '91%', critical_path: 'Line 4 W27–W29' } }, 'Production schedule published to SAP PP — 91% scheduling efficiency') },

  { at: 8.2, act: (S) => startStep(S, { id: 'opt-model', agent: 'optimizer', label: 'Build Optimization Model', dataSource: 'MILP · CP-SAT Formulation', deps: ['cap-load', 'wip-prod', 'tool-alloc'] }) },
  { at: 8.4, act: (S) => addLog(S, 'optimizer', 'Formulating MILP: 847 SKUs × 6 lines × 13 weeks — ~68k decision variables') },
  { at: 9.0, act: (S) => addLog(S, 'optimizer', 'Encoding constraints: capacity ceilings, MOQ, lot sizes, changeover matrix, OT limits') },
  { at: 9.8, act: (S) => completeStep(S, 'opt-model', { records: 68420, metrics: { variables: '68,420', constraints: '124,350', obj_fn: 'Cost + OTIF + Margin (Pareto)' } }, 'MILP model built — 68k vars, 124k constraints, 3-objective Pareto formulation') },

  { at: 10.0, act: (S) => startStep(S, { id: 'opt-solve', agent: 'optimizer', label: 'Solve — Pareto Optimisation', dataSource: 'MILP + CP-SAT Heuristics', deps: ['opt-model'] }) },
  { at: 10.2, act: (S) => addLog(S, 'optimizer', 'CP-SAT pass 1: changeover sequencing — Line 4 optimised, −28h changeover time') },
  { at: 11.0, act: (S) => addLog(S, 'optimizer', 'MILP pass 2: lot-split decisions for 12 constrained components — coverage improved') },
  { at: 11.8, act: (S) => addLog(S, 'optimizer', 'Pareto frontier: 3 operating points found — balanced plan at OTIF=97.8%, margin=23.1%') },
  { at: 12.5, act: (S) => completeStep(S, 'opt-solve', { records: 3, metrics: { operating_points: '3 Pareto pts', otif: '97.8%', margin: '23.1%', cost_saving: '−$34k vs naive', changeover_saving: '−28h' } }, 'Optimal plan found — OTIF 97.8%, margin 23.1%, −34k cost vs naive schedule') },

  { at: 12.8, act: (S) => startStep(S, { id: 'fin-rec', agent: 'finance', label: 'Financial Reconciliation', dataSource: 'P&L Model', deps: ['opt-solve', 'wip-purch'] }) },
  { at: 8.8, act: (S) => addLog(S, 'finance', 'Translating operational plan to Q3 P&L — computing revenue, margin and OTIF impact') },

  { at: 11.5, act: (S) => completeStep(S, 'fin-rec', { records: 847, metrics: { revenue: '$18.4M', margin: '23.1% ✓', otif_fcst: '97.8%', ebit_delta: '+$140k' } }, 'Financial sign-off — revenue $18.4M, margin 23.1%, EBIT delta +$140k') },
  { at: 11.6, act: (S) => { S.kpis.otif = '97.8%'; S.kpis.planDelta = 140; } },

  { at: 12.0, act: (S) => startStep(S, { id: 'risk-check', agent: 'risk', label: 'Risk & Constraint Check', dataSource: 'Risk Register · NCR Log · CRM', deps: ['fin-rec'] }) },
  { at: 12.3, act: (S) => addLog(S, 'risk', '[Supply Delay] Supplier X lead time +4wk · Line 4 OT reliability · D-88X reconditioning window') },
  { at: 13.0, act: (S) => addLog(S, 'risk', '[Order Surge] SKU-88X over-forecast exposure · Key Account B pull-forward +15% Q3 scenario') },
  { at: 13.7, act: (S) => addLog(S, 'risk', '⚠ [Quality] Supplier X incoming NCR 2.1% vs 0.8% target — triggering 100% incoming inspection') },
  { at: 14.1, act: (S) => addLog(S, 'risk', '[Quality] D-88X mold wear — dimensional tolerance drift on SKU-88X · SPC check frequency doubled') },

  { at: 14.5, act: (S) => completeStep(S, 'risk-check', { records: 7, metrics: { supply_delay: '3 risks', order_surge: '2 risks', quality: '2 risks', critical: '0', open: '3', score: '3.1/10' }, output: { risk_score: '3.1/10', status: 'AMBER' } }, 'Risk: 7 risks · 3.1/10 AMBER — quality NCR + surge exposure flagged, 3 open actions') },

  { at: 15.0, act: (S) => startStep(S, { id: 'pln-approve', agent: 'planner', label: 'Approve & Publish Plan', deps: ['risk-check'] }) },
  { at: 15.3, act: (S) => addLog(S, 'planner', 'Generating final S&OP pack — writing to SAP PP and dispatching stakeholder summary') },
  { at: 17.0, act: (S) => completeStep(S, 'pln-approve', { records: 847, metrics: { plan_status: 'APPROVED ✓', otif: '97.8%', revenue: '$18.4M', next_cycle: '2026-06-22' }, output: { plan: 'Q3-2026 S&OP', SKUs: 847, plants: 12 } }, 'Q3-2026 S&OP plan approved and published · Next cycle 2026-06-22') },
  { at: 17.2, act: (S) => { S.sessionStatus = 'done'; } },
];

export function createInitialState(): SimState {
  return {
    steps: {},
    events: [],
    kpis: { otif: null, forecastAcc: null, capacityUtil: null, wos: null, planDelta: null },
    pendingQuestion: null,
    paused: false,
    manualPause: false,
    sessionStatus: 'running',
    elapsedT: 0,
    phase: 'pre',
    postOffset: 0,
    nextPreIdx: 0,
    nextPostIdx: 0,
    activeAgents: [],
  };
}
