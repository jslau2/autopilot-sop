// sop/drawer.jsx — S&OP detail drawer with domain reasoning
const { useState: useDrawerSopState } = React;

const REASONING = {
  'pln-plan':    `Parsed Q3-2026 S&OP parameters. Planning horizon: 13 weeks (W22–W34), weekly granularity. Scope: 847 active SKUs across 12 manufacturing plants — 7 APAC, 5 EMEA. Two pre-known constraints from Q2 retrospective flagged: (1) Line 4 assembly at Plant 2 approaching rated capacity, and (2) Supplier X extended lead time from 8 → 12 weeks effective June 1. Generated 6-agent task graph: Demand Forecast → SPI Reconciliation → Capacity & WIP Planning (parallel) → Finance → Risk → Plan Approval.`,
  'dem-hist':    `AutoML data ingestion and feature engineering pipeline activated. Source: SAP ZSD_DELIVERY_HISTORY — 36 months, 847 SKUs × 12 plants × weekly granularity. Raw rows: 109,512. Three external signals merged: weather index (r=0.12 with outdoor SKUs), macro PMI index (leading indicator, 4-week lag), channel mix shift ratio. Auto-feature engineering produced 84 candidate features: 12-lag demand vectors, Fourier seasonality terms (weekly, monthly, quarterly), promotional binary flags from 14-event calendar, price elasticity proxies, holiday indicators. Outlier detection: 312 rows flagged via IQR + STL residual method; replaced with interpolated values. Recursive feature elimination retained 61 of 84 features (R² threshold 0.02 cutoff).`,
  'dem-fcst':    `AutoML model tournament: 5 model families × 5-fold time-series CV (gap=4 weeks, no leakage).

  Trial 1 — ETS (additive):       CV MAPE 8.4%
  Trial 2 — Prophet + regressor:  CV MAPE 6.2%
  Trial 3 — LightGBM (lag feats): CV MAPE 5.8%
  Trial 4 — N-BEATS:              CV MAPE 6.9%
  Trial 5 — TFT Ensemble:         CV MAPE 5.6% — WINNER

Winner: Temporal Fusion Transformer ensemble with LightGBM residual correction. Total Q3 forecast: 2.34M units (+6.2% vs Q2). 80% and 95% prediction intervals computed per SKU. SKU-88X July 4–11 spike: +34% flagged — confirmed trade show promotion. 703 SKUs HIGH confidence, 134 NEW/ramping MEDIUM confidence.`,
  'spi-inv':     `SAP S/4HANA connection established (client 100, plant group APAC). Inventory snapshot 2026-05-23 07:30 UTC. Total on-hand: $12.4M across 847 SKUs and 12 plants. Weeks of Supply: 4.2 (target band 4.0–5.0 — within range). 44 SKUs below safety stock, predominantly in EMEA due to Supplier X delay. Excess inventory identified: $2.1M across 12 slow-moving SKUs — flagged for markdown review. WIP valuation: $8.4M. No cycle count discrepancies vs last physical audit.`,
  'dem-fcst':    `AutoML model tournament: 5 model families × 5-fold time-series CV (gap=4 weeks, no leakage).\n\n  Trial 1 — ETS (additive):       CV MAPE 8.4%\n  Trial 2 — Prophet + regressor:  CV MAPE 6.2%\n  Trial 3 — LightGBM (lag feats): CV MAPE 5.8%\n  Trial 4 — N-BEATS:              CV MAPE 6.9%\n  Trial 5 — TFT Ensemble:         CV MAPE 5.6% — WINNER ✓\n\nWinner: Temporal Fusion Transformer ensemble with LightGBM residual correction. Total Q3 forecast: 2.34M units (+6.2% vs Q2). 80% and 95% prediction intervals computed per SKU. SKU-88X July 4–11 spike: +34% flagged — confirmed trade show promotion. 703 SKUs HIGH confidence, 134 NEW/ramping MEDIUM confidence.`,
  'spi-prod':    `Reviewed 234 open production orders from ERP (tables AUFK + AFPO). 11 of 12 plants on schedule. Plant 7 (Singapore) OEE: 94.1% — above 90% target. Line 4 (Plant 2, premium assembly): 98.3% utilization — confirmed capacity wall for July peak. WIP status: 187/234 orders on track; 47 at risk due to Supplier X component shortage (12 critical components with <2 weeks buffer). Material availability check complete. Flagging capacity constraint and 47 at-risk orders to Planner.`,
  'spi-rec':     `Three-way reconciliation: Demand Forecast (2.34M units) vs Production Plan (2.19M units available from current orders + open capacity) vs Inventory Buffer ($12.4M). Net gap: 1,240 units in July peak window across 44 SKUs ($442k revenue exposure). Root causes: (1) Line 4 bottleneck — July demand exceeds rated capacity by 18pp; (2) Supplier X delay — 47 orders at risk. Three resolution scenarios modeled: A) Overtime approval, B) Partial shortfall acceptance, C) SKU deferral to Q4. Escalating to Planner for decision.`,
  'cap-load':    `Generated machine loading plan for 6 assembly lines across 3 plants. Line assignments: Lines 1–3 standard SKUs (70% utilization), Line 4 premium assembly (98.3% constrained → with approved OT: 100% + 840h OT), Lines 5–6 accessories (65%). 13-week Gantt locked. Changeover time: 4.2h average, optimised via MILP solver minimising sequence-dependent changeovers. Critical path: Line 4 W27–W29. OT schedule: 30h/week × 4 workers × 7 weeks. Bottleneck advisory issued to Plant 2 floor manager.`,
  'wip-purch':   `MRP run: 847 SKUs × 12 plants × 13 weeks. Net requirements calculated after on-hand and WIP netting. Generated 127 purchase order recommendations totalling $3.8M. Critical items: 8 components on Supplier X allocation — escalated to procurement for alternate sourcing. 12 components expedited (lead time <7 days buffer). Safety stock replenishment: 44 items below SS released. Auto-approved 124 POs (<$50k threshold); flagged 3 POs ($2.1M total) for VP Supply Chain manual approval.`,
  'wip-prod':    `Production scheduling: sequenced 1,847 work orders across 12 plants for W22–W34. Algorithm: priority-rule FJSP with capacity constraints. Scheduling efficiency: 91% — limited by Line 4 constraint and Supplier X buffer. Sequence-dependent changeover matrix applied (214 changeover types). WIP buffer: 2.1 days between stations. Critical path: Line 4 W27–W29 at 100% with OT. Plant 7 schedule compressed 1.3 days vs target — component delay mitigation applied. Final schedule published to SAP PP module.`,
  'fin-rec':     `Operational plan translated to financial P&L. Q3-2026 revenue forecast: $18.4M (+4.7% vs Q2 actuals). Gross margin: 23.1% (target 22.0% — exceeds by +1.1pp). OT decision financial impact: +$142k cost vs +$340k revenue protected → net EBIT improvement +$198k. Cumulative plan EBIT delta vs unconstrained baseline: +$140k. OTIF forecast: 97.8% (target ≥98% — 0.2pp short; within risk tolerance). Cash flow: PO release of $3.8M within approved quarterly cash envelope. Three KPIs flagged for S&OP review board: OTIF, Line 4 OEE, Supplier X allocation status.`,
  'risk-check':  `Risk register scan complete. Risks identified: (1) Supplier X allocation uncertainty — Probability 0.40, Impact HIGH — mitigation: 8-week alternate sourcing activated, status IN PROGRESS; (2) Line 4 machine reliability during overtime — Probability 0.20, Impact MEDIUM — mitigation: preventive maintenance scheduled W25, status MITIGATED; (3) SKU-88X demand over-forecast risk — Probability 0.30, Impact LOW — mitigation: weekly demand-sensing reviews, status OPEN. Composite risk score: 2.4/10 — GREEN. Plan cleared for approval.`,
  'pln-approve': `Final S&OP plan generated and published. Coverage: Q3-2026 W22–W34, 847 SKUs, 12 plants, $18.4M revenue. Decisions embedded: OT approval (840h, Line 4), 127 POs released ($3.8M), 2 lower-priority SKUs deprioritised to protect Line 4. Plan written to SAP Production Planning module (transaction MD61). Stakeholder summary dispatched: VP Supply Chain, VP Sales, CFO, 12 Plant Managers. Open action: Supplier X alternate qualification — owner: Procurement, due W24. Next S&OP cycle: 2026-06-22.`,
  'inv-abc':     `ABC velocity analysis run on 847 SKUs using 12-month cumulative revenue. Classification results: A-class (169 SKUs, 20% of portfolio) = $14.7M revenue (80% of total) — zero stockout tolerance, protect at all costs; B-class (254 SKUs, 30%) = $2.8M revenue (15%) — standard safety stock policy, weekly review cycle; C-class (424 SKUs, 50%) = $0.9M revenue (5%) — candidate for SKU rationalisation or make-to-order transition. Dead stock identified: 12 SKUs with zero movement >6 months, $340k book value — flagged for write-off or markdown review. ABC output fed to SPI Analyst, Capacity Plan (A-class line prioritisation) and Replenishment Policy agent.`,
  'inv-replen':  `Replenishment policies calculated by ABC class, incorporating the OT decision received from Planner. A-class (169 SKUs): safety stock = 3× average weekly demand, reorder point = lead-time demand + SS, review cycle = daily automated. B-class (254 SKUs): safety stock = 2× AWD, reorder point = LT demand + SS, review cycle = weekly. C-class (424 SKUs): safety stock = 1× AWD or make-to-order where feasible, review cycle = monthly. Replenishment value triggered: $1.8M across 312 SKUs below reorder point. 44 below-SS SKUs (87% A-class) prioritised in production schedule. Dead stock: 12 SKUs submitted to Finance for markdown/write-off approval. All policies written to SAP MRP profiles (transaction OMI4).`,
};

function DetailDrawer({ stepId, onClose }) {
  const ctx  = React.useContext(window.DashboardContext);
  const step = ctx.steps[stepId];
  const [tab, setTab] = useDrawerSopState('output');

  if (!step) return null;

  const ag  = window.AGENTS[step.agent] || { name: step.agent, color: 'var(--text-2)' };
  const dur = step.endT != null && step.startT != null
    ? (step.endT - step.startT).toFixed(2) + 's'
    : step.status === 'running' ? 'in progress' : '—';

  return (
    <div className="drawer-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="drawer">
        <div className="drawer-header" style={{ borderColor: ag.color + '44' }}>
          <div className="drawer-agent-pill" style={{ color: ag.color, background: ag.color + '18', borderColor: ag.color + '44' }}>
            {ag.name}
          </div>
          <h2 className="drawer-title">{step.label}</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-meta">
          {[
            ['Status',      <span className={`meta-badge badge-${step.status}`}>{step.status}</span>],
            ['Duration',    <span className="mono">{dur}</span>],
            step.dataSource ? ['Source', <span className="mono" style={{fontSize:11}}>{step.dataSource}</span>] : null,
            step.records    ? ['Records', <span className="mono">{step.records.toLocaleString()}</span>] : null,
            step.startT != null ? ['Cycle T', <span className="mono">+{step.startT.toFixed(1)}s</span>] : null,
          ].filter(Boolean).map(([label, val], i) => (
            <div key={i} className="meta-cell">
              <span className="meta-cell-label">{label}</span>
              <span className="meta-cell-val">{val}</span>
            </div>
          ))}
        </div>

        {step.type === 'question' && step.question && (
          <div className="drawer-question-block">
            <div className="dqb-label">⏸ Planner Question</div>
            <p className="dqb-text">{step.question.text}</p>
            {step.output?.answer && (
              <div className="dqb-answer">
                <span className="dqb-answer-label">Decision taken</span>
                <span className="dqb-answer-text">{step.output.answer}</span>
              </div>
            )}
          </div>
        )}

        {step.metrics && (
          <div className="drawer-metrics">
            <div className="dm-header">Metrics</div>
            <div className="dm-grid">
              {Object.entries(step.metrics).map(([k, v]) => (
                <div key={k} className="dm-row">
                  <span className="dm-key">{k.replace(/_/g,' ')}</span>
                  <span className="dm-val mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-tabs">
          {['output','reasoning','raw'].map(t => (
            <button key={t} className={`dtab${tab===t?' dtab-active':''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'output' && (
            <div className="tab-body">
              {step.output
                ? <pre className="code-pre">{JSON.stringify(step.output, null, 2)}</pre>
                : <div className="tab-empty">{step.status === 'running' ? 'Computing…' : 'No output recorded.'}</div>
              }
            </div>
          )}
          {tab === 'reasoning' && (
            <div className="tab-body">
              <p className="reasoning-text">
                {REASONING[step.id] || (step.status === 'running' ? 'Analysis in progress…' : 'Reasoning not available for this step.')}
              </p>
            </div>
          )}
          {tab === 'raw' && (
            <div className="tab-body">
              <pre className="code-pre">{JSON.stringify(step, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DetailDrawer });
