// components/drawer.jsx
const { useState: useDrawerState } = React;

function DetailDrawer({ stepId, onClose }) {
  const ctx  = React.useContext(window.DashboardContext);
  const step = ctx.steps[stepId];
  const [tab, setTab] = useDrawerState('output');

  if (!step) return null;

  const ag  = window.AGENTS[step.agent] || { name: step.agent, color: 'var(--text-secondary)' };
  const dur = step.endT != null && step.startT != null
    ? (step.endT - step.startT).toFixed(2) + 's'
    : step.status === 'running' ? 'in progress' : '—';

  const REASONING_SAMPLES = {
    'sci-plan':    'Parsed the session goal: telecom churn prediction with recall optimization. Identified four parallel work-streams: literature review (Researcher), exploratory data analysis (EDA), feature planning (Feature Eng.), and the modeling pipeline. Prioritizing recall ≥ 0.85 as primary constraint per user instruction.',
    'res-lit':     'Queried arXiv and Semantic Scholar for "telecom churn prediction" publications 2021–2024. Cross-referenced 18 papers. LightGBM with SHAP feature selection appears in 11/18 high-recall studies. XGBoost competitive but 8% slower. Neural approaches underperform on tabular churn data (Gama et al. 2023).',
    'eda-load':    'Loaded CSV with pandas. Schema: 7,043 rows × 21 columns. Target column "Churn" is binary (Yes/No → 1/0). Class imbalance: 14.5% positive. 3.2% missing values concentrated in TotalCharges (11 nulls where tenure=0 — new customers with no charge yet). No duplicates detected in initial pass.',
    'eda-explore': 'Computed Pearson and Spearman correlations. Top predictors: tenure (r=−0.35), Contract_two-year (r=−0.30), InternetService_Fiber (r=+0.31). Distribution analysis: tenure is right-skewed bimodal. Monthly charges cluster around $20 (basic) and $80 (fiber). Interaction tenure×contract likely powerful.',
    'feat-plan':   'Planned 34 features including: polynomial interactions (tenure², tenure×MonthlyCharges), contract dummies, service bundle flags, customer lifetime value proxy (tenure × MonthlyCharges), and missing-value indicators for TotalCharges. Will apply StandardScaler for logistic regression branch only.',
    'mod-train':   'Trained LightGBM (n_estimators=500, lr=0.05), XGBoost (max_depth=6), and LogisticRegression (C=1.0) with StratifiedKFold(5). LightGBM wins on recall (0.892) and AUC (0.934). XGBoost close (recall=0.881) but marginally worse. LogReg recall only 0.814 — insufficient.',
    'rev-eval':    'Evaluated LightGBM against recall threshold ≥ 0.85. Result: 0.892 — threshold met with 4.9pp margin. Precision 0.819 acceptable (business approved FP rate). No data leakage detected. Calibration curve smooth. SHAP global explanation coherent with domain knowledge. PASS.',
    'sci-select':  'Decision: LightGBM selected for fine-tuning. Rationale: highest recall (0.892), best AUC (0.934), fast inference (2.1ms/sample), interpretable via SHAP. Sending to Fine Tuning agent for Optuna hyperparameter search targeting recall ≥ 0.90.',
    'ft-tune':     'Ran Optuna with TPE sampler, 50 trials, 5-fold CV. Objective: maximize recall subject to F1 ≥ 0.84. Best trial: num_leaves=63, min_child_samples=18, subsample=0.82, colsample_bytree=0.75, reg_lambda=0.4. Improved recall from 0.892 → 0.908, F1 from 0.847 → 0.861.',
    'ft-final':    'Final evaluation on held-out test set (20%, stratified). F1=0.861, Recall=0.908, Precision=0.819, AUC-ROC=0.941, AUC-PR=0.716. Calibration error (ECE)=0.034. Model ready for deployment. SHAP summary attached.',
    'sci-done':    'Session complete. Deliverables: trained LightGBM model (pkl), feature pipeline, SHAP explainer, evaluation report. Recall 0.908 exceeds target 0.85 by +5.8pp. Recommend A/B test against current rule-based system before full rollout.',
  };

  return (
    <div className="drawer-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="drawer">
        {/* Header */}
        <div className="drawer-header" style={{ borderColor: ag.color + '44' }}>
          <div className="drawer-agent-pill" style={{ color: ag.color, background: ag.color + '18', borderColor: ag.color + '44' }}>
            {ag.name}
          </div>
          <h2 className="drawer-title">{step.label}</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Meta row */}
        <div className="drawer-meta">
          {[
            ['Status',   <span className={`meta-badge badge-${step.status}`}>{step.status}</span>],
            ['Duration', <span className="mono">{dur}</span>],
            step.model   ? ['Model',  <span className="mono" style={{ fontSize: 11 }}>{step.model}</span>] : null,
            step.tokens  ? ['Tokens', <span className="mono">{step.tokens.toLocaleString()}</span>] : null,
            step.startT  != null ? ['Start T', <span className="mono">+{step.startT.toFixed(1)}s</span>] : null,
          ].filter(Boolean).map(([label, val], i) => (
            <div key={i} className="meta-cell">
              <span className="meta-cell-label">{label}</span>
              <span className="meta-cell-val">{val}</span>
            </div>
          ))}
        </div>

        {/* Question block */}
        {step.type === 'question' && step.question && (
          <div className="drawer-question-block">
            <div className="dqb-label">⏸ Agent Question</div>
            <p className="dqb-text">{step.question.text}</p>
            {step.output?.answer && (
              <div className="dqb-answer">
                <span className="dqb-answer-label">Your answer</span>
                <span className="dqb-answer-text">{step.output.answer}</span>
              </div>
            )}
          </div>
        )}

        {/* Metrics */}
        {step.metrics && (
          <div className="drawer-metrics">
            <div className="dm-header">Metrics</div>
            <div className="dm-grid">
              {Object.entries(step.metrics).map(([k, v]) => (
                <div key={k} className="dm-row">
                  <span className="dm-key">{k.replace(/_/g, ' ')}</span>
                  <span className="dm-val mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="drawer-tabs">
          {['output', 'reasoning', 'raw'].map(t => (
            <button key={t} className={`dtab${tab === t ? ' dtab-active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="drawer-body">
          {tab === 'output' && (
            <div className="tab-body">
              {step.output
                ? <pre className="code-pre">{JSON.stringify(step.output, null, 2)}</pre>
                : <div className="tab-empty">{step.status === 'running' ? 'Step in progress…' : 'No output recorded.'}</div>
              }
            </div>
          )}
          {tab === 'reasoning' && (
            <div className="tab-body">
              <p className="reasoning-text">
                {REASONING_SAMPLES[step.id] || (step.status === 'running' ? 'Reasoning in progress…' : 'Reasoning trace not available for this step.')}
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
