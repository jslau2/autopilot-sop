import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AgentIcon from '../components/AgentIcon';
import { useDemoMode } from '../hooks/useDemoMode';
import { AGENTS, AGENT_ORDER } from '../data/agents';

interface AgentData {
  id: string;
  status: 'active' | 'idle';
  profile: string;
  bullets: string[];
  performance: Record<string, number>;
  promptEval: { verdict: string; revision: string };
  model: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  prompt: string;
}

const AGENT_DATA: Record<string, AgentData> = {
  planner: {
    id: 'planner', status: 'active',
    profile: 'Orchestrates the full S&OP pipeline. Parses planning goals, builds multi-agent task graphs, dispatches subtasks, reconciles conflicts, and escalates decisions requiring human judgment.',
    bullets: ['Build and monitor multi-agent task graphs', 'Reconcile conflicts between supply and demand agents', 'Escalate human-in-the-loop decision points'],
    performance: { Relevance: 0.92, Specificity: 0.88, Accuracy: 0.90, Clarity: 0.95, Usefulness: 0.96 },
    promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' },
    model: 'claude-opus-4-5', temperature: 0.4, maxTokens: 4096,
    tools: ['task_graph', 'agent_dispatch', 'decision_escalation', 'session_summary'],
    prompt: `You are the S&OP Orchestrator Agent for an AI-driven Sales & Operations Planning system.\n\nYour role is to:\n1. Parse the planning goal and extract: horizon, SKU scope, plant scope, and primary KPI constraints\n2. Build a multi-agent dependency task graph based on the planning objective\n3. Dispatch subtasks to specialist agents with precise instructions and data contracts\n4. Monitor agent outputs in real time and detect conflicts or gaps\n5. Escalate decisions that cannot be resolved autonomously to the human planner\n6. Produce a final consolidated S&OP plan summary upon cycle completion`,
  },
  demand: {
    id: 'demand', status: 'active',
    profile: 'Automatically engineers demand features, runs model tournaments across ETS, Prophet, LightGBM, N-BEATS, and TFT, and selects the best ensemble with cross-validated confidence.',
    bullets: ['Auto-engineer 84+ lag, Fourier, and promo features', 'Run 5-model tournament with time-series CV', 'Produce calibrated forecasts with 80%/95% intervals'],
    performance: { Relevance: 0.95, Specificity: 0.90, Accuracy: 0.93, Clarity: 0.82, Usefulness: 0.92 },
    promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' },
    model: 'claude-opus-4-5', temperature: 0.2, maxTokens: 8192,
    tools: ['feature_engineering', 'model_tournament', 'forecast_output', 'anomaly_detection'],
    prompt: `You are the AutoML Demand Forecasting Agent for an S&OP pipeline.\n\nYour role is to:\n1. Ingest historical sales data and merge external signals\n2. Auto-engineer features: demand lags, Fourier terms, promo flags, price proxies\n3. Run model tournament: ETS, Prophet+regressor, LightGBM, N-BEATS, TFT\n4. Select winner via 5-fold time-series CV (gap=4 weeks, no leakage)\n5. Generate forecasts with 80%/95% prediction intervals at SKU×week×plant\n6. Flag anomalies, spikes, and new-product ramp uncertainty`,
  },
  spi: {
    id: 'spi', status: 'active',
    profile: 'Performs three-way Sales-Production-Inventory reconciliation using SAP S/4HANA data, surfaces supply gaps with financial impact, and flags at-risk production orders.',
    bullets: ['Load real-time inventory from SAP S/4HANA', 'Review 234+ open production orders', 'Three-way reconciliation with revenue impact'],
    performance: { Relevance: 0.88, Specificity: 0.93, Accuracy: 0.91, Clarity: 0.87, Usefulness: 0.89 },
    promptEval: { verdict: 'Successfully Meets', revision: 'Revision Needed' },
    model: 'claude-opus-4-5', temperature: 0.3, maxTokens: 4096,
    tools: ['sap_inventory', 'sap_production_orders', 'reconciliation', 'gap_analysis'],
    prompt: `You are the SPI (Sales-Production-Inventory) Analyst Agent.\n\nYour role is to:\n1. Load inventory snapshot from SAP S/4HANA\n2. Review open production orders and schedule adherence\n3. Identify at-risk orders: component shortages, constraints\n4. Perform three-way reconciliation\n5. Compute net supply gap in units and $revenue exposure\n6. Flag Weeks of Supply deviations outside 4.0–5.0 week band`,
  },
  inventory: {
    id: 'inventory', status: 'active',
    profile: 'Performs ABC velocity classification on all SKUs, sets optimal safety stock and reorder points by tier, identifies dead stock, and generates replenishment policies.',
    bullets: ['ABC classification: A (80% rev), B (15%), C (5%)', 'Compute tier-specific safety stock and ROP', 'Flag dead stock and excess for write-off review'],
    performance: { Relevance: 0.86, Specificity: 0.89, Accuracy: 0.88, Clarity: 0.91, Usefulness: 0.87 },
    promptEval: { verdict: 'Successfully Meets', revision: 'Revision Needed' },
    model: 'claude-haiku-4-5', temperature: 0.2, maxTokens: 2048,
    tools: ['abc_classification', 'safety_stock_calc', 'replenishment_policy', 'dead_stock_flag'],
    prompt: `You are the Inventory Management Agent.\n\nYour role is to:\n1. Perform ABC velocity analysis using 12-month cumulative revenue\n2. Compute safety stock: A=3× AWD, B=2× AWD, C=1× AWD\n3. Set reorder points = LT demand + safety stock\n4. Flag dead stock (zero movement > 6 months)\n5. Generate replenishment policies for all SKUs\n6. Link ABC class to production schedule priority`,
  },
};

// Fill remaining agents with default data
const DEFAULT_AGENTS: string[] = ['tooling', 'capacity', 'wip', 'finance', 'risk', 'masterdata', 'procurement', 'optimizer'];
const DEFAULT_PROFILES: Record<string, Partial<AgentData>> = {
  tooling: { profile: 'Audits all die sets and molds against shot-count thresholds and utilisation rates, generates tooling allocation plans.', bullets: ['Audit 284 active die sets', 'Flag >85% utilisation assets', 'Plan new mold procurement'], performance: { Relevance: 0.83, Specificity: 0.95, Accuracy: 0.89, Clarity: 0.81, Usefulness: 0.85 }, promptEval: { verdict: 'Successfully Meets', revision: 'No Revision Needed' }, model: 'claude-haiku-4-5', temperature: 0.2, maxTokens: 2048, tools: ['mold_registry', 'utilisation_calc', 'tooling_scheduler'], prompt: 'You are the Tooling & Mold Asset Agent...' },
  capacity: { profile: 'Generates machine loading plans, optimises changeover sequences, applies overtime schedules.', bullets: ['Load 6 assembly lines', 'MILP changeover optimisation', 'OT schedule management'], performance: { Relevance: 0.91, Specificity: 0.88, Accuracy: 0.86, Clarity: 0.89, Usefulness: 0.93 }, promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' }, model: 'claude-opus-4-5', temperature: 0.3, maxTokens: 4096, tools: ['capacity_model', 'changeover_optimizer', 'ot_scheduler'], prompt: 'You are the Assembly Capacity Planning Agent...' },
  wip: { profile: 'Runs MRP calculations, generates purchase order recommendations, sequences work orders using FJSP.', bullets: ['MRP: 847 SKUs × 12 plants', 'Generate and approve POs', 'FJSP work-order sequencing'], performance: { Relevance: 0.88, Specificity: 0.86, Accuracy: 0.91, Clarity: 0.85, Usefulness: 0.88 }, promptEval: { verdict: 'Successfully Meets', revision: 'Revision Needed' }, model: 'claude-opus-4-5', temperature: 0.3, maxTokens: 4096, tools: ['mrp_engine', 'po_generator', 'fjsp_scheduler', 'sap_pp_writer'], prompt: 'You are the WIP & Sourcing Agent...' },
  finance: { profile: 'Translates the operational plan into Q3 P&L projections and produces the financial sign-off.', bullets: ['Build Q3 revenue and margin projection', 'OT cost vs. revenue analysis', 'OTIF forecast and KPI board'], performance: { Relevance: 0.93, Specificity: 0.91, Accuracy: 0.96, Clarity: 0.93, Usefulness: 0.91 }, promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' }, model: 'claude-opus-4-5', temperature: 0.2, maxTokens: 4096, tools: ['pl_model', 'otif_calculator', 'cost_benefit', 'board_report'], prompt: 'You are the Financial Reconciliation Agent...' },
  risk: { profile: 'Scans supply delays, demand surges, and quality issues. Scores risks by probability × impact.', bullets: ['Supply delay: lead time & capacity', 'Order surge: over-forecast exposure', 'Quality: NCR rates, SPC alerts'], performance: { Relevance: 0.89, Specificity: 0.93, Accuracy: 0.86, Clarity: 0.88, Usefulness: 0.91 }, promptEval: { verdict: 'Successfully Meets', revision: 'Revision Needed' }, model: 'claude-opus-4-5', temperature: 0.4, maxTokens: 4096, tools: ['risk_register', 'ncr_log', 'spc_alerts', 'supplier_scorecard'], prompt: 'You are the Risk & Constraint Agent...' },
  masterdata: { profile: 'Validates and cleanses all master data (BOMs, routings, lead times, UoMs) before downstream agents consume it.', bullets: ['Validate 847 SKUs, 3,240 BOM records', 'Auto-resolve BOM gaps', 'Publish quality score ≥98%'], performance: { Relevance: 0.88, Specificity: 0.95, Accuracy: 0.91, Clarity: 0.86, Usefulness: 0.89 }, promptEval: { verdict: 'Successfully Meets', revision: 'Revision Needed' }, model: 'claude-haiku-4-5', temperature: 0.2, maxTokens: 2048, tools: ['bom_validator', 'routing_checker', 'quality_scorer'], prompt: 'You are the Master Data Steward Agent...' },
  procurement: { profile: 'Validates ATP and CTP positions for critical components, confirms supplier capacity, generates a locked supplier commit plan.', bullets: ['ATP/CTP: 892 components across 24 suppliers', 'MOQ constraint enforcement', 'Locked commit plan with expedite recommendations'], performance: { Relevance: 0.92, Specificity: 0.90, Accuracy: 0.91, Clarity: 0.88, Usefulness: 0.93 }, promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' }, model: 'claude-opus-4-5', temperature: 0.3, maxTokens: 4096, tools: ['atp_check', 'ctp_check', 'supplier_commit', 'po_generator'], prompt: 'You are the Procurement Agent...' },
  optimizer: { profile: 'Formulates and solves MILP and CP-SAT models to find a mathematically optimal production schedule.', bullets: ['MILP: 68k variables, 124k constraints', 'CP-SAT changeover sequencing', 'Pareto frontier: 3 operating points'], performance: { Relevance: 0.93, Specificity: 0.96, Accuracy: 0.92, Clarity: 0.87, Usefulness: 0.97 }, promptEval: { verdict: 'Exceeds', revision: 'No Revision Needed' }, model: 'CP-SAT + MILP', temperature: 0.1, maxTokens: 8192, tools: ['milp_solver', 'cpsat_solver', 'pareto_optimizer'], prompt: 'You are the Plan Optimizer Agent...' },
};

DEFAULT_AGENTS.forEach(id => {
  AGENT_DATA[id] = { id, status: 'active', ...DEFAULT_PROFILES[id] } as AgentData;
});

function RadarChart({ data, color }: { data: Record<string, number>; color: string }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const n = labels.length;
  const cx = 80, cy = 80, r = 60;

  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const pt = (i: number, v: number) => {
    const a = angle(i);
    const x = cx + v * r * Math.cos(a);
    const y = cy + v * r * Math.sin(a);
    return `${x},${y}`;
  };

  const polygon = values.map((v, i) => pt(i, v)).join(' ');

  // Approximate colors for canvas (oklch not supported in SVG fill)
  const colorMap: Record<string, string> = {
    'var(--ag-planner)': '#c8933f',
    'var(--ag-demand)': '#4a6fd4',
    'var(--ag-spi)': '#38a89d',
    'var(--ag-inventory)': '#c060a8',
    'var(--ag-tooling)': '#b07030',
    'var(--ag-capacity)': '#3a9060',
    'var(--ag-wip)': '#9050c0',
    'var(--ag-finance)': '#c07030',
    'var(--ag-risk)': '#c04030',
    'var(--ag-masterdata)': '#5080c0',
    'var(--ag-procurement)': '#6060d0',
    'var(--ag-optimizer)': '#90a030',
  };
  const fillColor = colorMap[color] ?? '#888';

  return (
    <svg viewBox="0 0 160 160" width={140} height={140}>
      {[0.25, 0.5, 0.75, 1.0].map(v => (
        <polygon
          key={v}
          points={labels.map((_, i) => pt(i, v)).join(' ')}
          fill="none" stroke="var(--border-s)" strokeWidth="0.7"
        />
      ))}
      {labels.map((_, i) => {
        const [x, y] = pt(i, 1).split(',').map(Number);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-s)" strokeWidth="0.7" />;
      })}
      <polygon
        points={polygon}
        fill={fillColor} fillOpacity="0.2"
        stroke={fillColor} strokeWidth="1.5"
      />
      {labels.map((label, i) => {
        const a = angle(i);
        const tx = cx + (r + 14) * Math.cos(a);
        const ty = cy + (r + 14) * Math.sin(a);
        return (
          <text key={i} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
            fontSize="7.5" fill="var(--text-3)" fontFamily="DM Sans">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

interface DrawerState { agentId: string; tab: 'prompt' | 'model' | 'tools' }

function SettingsDrawer({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'prompt' | 'model' | 'tools'>('prompt');
  const [saved, setSaved] = useState(false);
  const [demoMode] = useDemoMode();
  const agent = AGENTS[agentId];
  const data = AGENT_DATA[agentId];
  const [prompt, setPrompt] = useState(data?.prompt ?? '');
  const [temperature, setTemperature] = useState<number>(data?.temperature ?? 0.2);

  // Live mode: load the real runtime config (and reflect any saved overrides).
  useEffect(() => {
    if (demoMode) return;
    fetch(`/api/agents/${agentId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!cfg) return;
        if (typeof cfg.system_prompt === 'string') setPrompt(cfg.system_prompt);
        if (typeof cfg.temperature === 'number') setTemperature(cfg.temperature);
      })
      .catch(() => { /* keep static defaults */ });
  }, [demoMode, agentId]);

  if (!data) return null;

  const handleSave = () => {
    if (!demoMode) {
      fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: prompt, temperature }),
      }).catch(() => { /* surfaced as a no-op; UI still confirms */ });
    }
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const resetDefaults = () => {
    if (demoMode) return;
    fetch(`/api/agents/${agentId}/reset`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!cfg) return;
        setPrompt(cfg.system_prompt ?? '');
        setTemperature(cfg.temperature ?? 0.2);
      })
      .catch(() => {});
  };

  return (
    <div className="drawer-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="settings-drawer">
        <div className="dr-header">
          <div className="dr-agent-pip" style={{ color: agent.color, borderColor: agent.color + '55', background: agent.color + '12' }}>
            {agent.name}
          </div>
          <div className="dr-title">Agent Configuration</div>
          <button className="dr-close" onClick={onClose}>✕</button>
        </div>

        <div className="dr-tabs">
          {(['prompt', 'model', 'tools'] as const).map(t => (
            <button key={t} className={`dr-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="dr-body">
          {tab === 'prompt' && (
            <div className="dr-field">
              <div className="dr-label-row">
                <span className="dr-label">System Prompt</span>
                <span className="dr-hint">~{prompt.length} chars · {demoMode ? 'demo (not saved)' : 'applies to new runs'}</span>
              </div>
              <textarea className="dr-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} rows={12} />
            </div>
          )}
          {tab === 'model' && (
            <>
              <div className="dr-field">
                <div className="dr-label">Model</div>
                <select className="dr-select" defaultValue={data.model}>
                  <option>claude-opus-4-5</option>
                  <option>claude-sonnet-4-5</option>
                  <option>claude-haiku-4-5</option>
                  <option>CP-SAT + MILP</option>
                </select>
              </div>
              <div className="dr-field">
                <div className="dr-label-row">
                  <span className="dr-label">Temperature</span>
                  <span className="dr-hint">{temperature.toFixed(2)}</span>
                </div>
                <div className="dr-slider-row">
                  <input type="range" className="dr-slider" min="0" max="1" step="0.05" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
                  <span className="dr-slider-val">{temperature.toFixed(2)}</span>
                </div>
              </div>
              <div className="dr-field">
                <div className="dr-label">Max Tokens</div>
                <select className="dr-select" defaultValue={data.maxTokens}>
                  <option value={2048}>2,048</option>
                  <option value={4096}>4,096</option>
                  <option value={8192}>8,192</option>
                </select>
              </div>
            </>
          )}
          {tab === 'tools' && (
            <div className="dr-field">
              <div className="dr-label">Active Tools</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {data.tools.map(tool => (
                  <div key={tool} className="dr-toggle-row">
                    <span className="dr-toggle-label mono" style={{ fontSize: 11 }}>{tool}</span>
                    <button className="dr-toggle on" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dr-footer">
          <button className="dr-btn-cancel" onClick={onClose}>Cancel</button>
          {!demoMode && <button className="dr-btn-test" onClick={resetDefaults}>Reset to default</button>}
          <button className="dr-btn-save" onClick={handleSave}>{saved ? '✓ Saved' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AgentSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'flagged'>('all');

  const agentList = AGENT_ORDER.filter(id => activeTab === 'all' || AGENT_DATA[id]?.promptEval?.revision === 'Revision Needed');

  const totalActive = AGENT_ORDER.length;
  const flagged = AGENT_ORDER.filter(id => AGENT_DATA[id]?.promptEval?.revision === 'Revision Needed').length;

  return (
    <div className="page">
      {!embedded && (
      <div className="hdr">
        <div className="hdr-brand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Autopilot S&amp;OP
        </div>
        <span className="hdr-sep">/</span>
        <span className="hdr-page">Agent Settings</span>
        <Link to="/pipeline" className="hdr-nav">← Pipeline</Link>
        <Link to="/console" className="hdr-nav">⊞ Console</Link>
        <Link to="/manager" className="hdr-nav">📊 Manager</Link>
        <Link to="/" className="hdr-nav">⌂ Home</Link>
        <span className="hdr-spacer" />
        <div className="gov-badge">
          <div className="gov-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="1.5" />
              <path d="M9 12l2 2 4-4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="gov-label">Governance Agent</div>
            <div className="gov-name">claude-opus-4-5</div>
          </div>
        </div>
      </div>
      )}

      <div className="subhdr">
        <button className={`tab-btn${activeTab === 'all' ? ' active' : ''}`} onClick={() => setActiveTab('all')}>
          All Agents ({totalActive})
        </button>
        <button className={`tab-btn${activeTab === 'flagged' ? ' active' : ''}`} onClick={() => setActiveTab('flagged')}>
          Revision Needed ({flagged})
        </button>
        <div className="subhdr-right">
          <div className="summary-stat">
            <span className="ss-val">{totalActive}</span>
            <span className="ss-lbl">Active Agents</span>
          </div>
          <div className="ss-divider" />
          <div className="summary-stat">
            <span className="ss-val" style={{ color: 'var(--warning)' }}>{flagged}</span>
            <span className="ss-lbl">Revision Needed</span>
          </div>
          <div className="ss-divider" />
          <div className="summary-stat">
            <span className="ss-val" style={{ color: 'var(--accent)' }}>{totalActive - flagged}</span>
            <span className="ss-lbl">No Revision</span>
          </div>
        </div>
      </div>

      <div className="body">
        <div className="settings-agent-grid">
          {agentList.map(agentId => {
            const agent = AGENTS[agentId];
            const data = AGENT_DATA[agentId];
            if (!data) return null;
            const verdictCls = data.promptEval.verdict === 'Exceeds' ? 'eval-exceeds'
              : data.promptEval.verdict === 'Successfully Meets' ? 'eval-meets'
              : 'eval-revision';
            const revCls = data.promptEval.revision === 'Revision Needed' ? 'eval-revision' : 'eval-no-rev';

            return (
              <div key={agentId} className="settings-agent-card">
                <div className="ac-top-bar" style={{ background: agent.color }} />
                <div className="ac-header">
                  <div className="ac-icon-wrap">
                    <AgentIcon color={agent.color} status="running" size={34} />
                  </div>
                  <div className="ac-titles">
                    <div className="ac-name">{agent.name}</div>
                    <div className="ac-sub">{agent.sub}</div>
                  </div>
                  <div className={`ac-status-dot ${data.status === 'active' ? 'active' : 'idle'}`} />
                </div>

                <div className="ac-profile">
                  <div className="ac-profile-lbl">Agent Profile</div>
                  <div className="ac-profile-desc">{data.profile}</div>
                  <div className="ac-bullets">
                    {data.bullets.map((b, i) => (
                      <div key={i} className="ac-bullet" style={{ '--dot-color': agent.color } as React.CSSProperties}>
                        {b}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ac-radar-section">
                  <div className="ac-radar-lbl">Performance Dimensions</div>
                  <div className="ac-radar-wrap">
                    <RadarChart data={data.performance} color={agent.color} />
                  </div>
                </div>

                <div className="ac-eval">
                  <div className="eval-group">
                    <span className="eval-meta">Verdict</span>
                    <span className={`eval-badge ${verdictCls}`}>{data.promptEval.verdict}</span>
                  </div>
                  <div className="eval-group">
                    <span className="eval-meta">Prompt</span>
                    <span className={`eval-badge ${revCls}`}>{data.promptEval.revision}</span>
                  </div>
                </div>

                <button
                  className={`ac-setting-btn${data.promptEval.revision === 'Revision Needed' ? ' has-changes' : ''}`}
                  onClick={() => setDrawer({ agentId, tab: 'prompt' })}
                >
                  ⚙ Configure Agent
                  {data.promptEval.revision === 'Revision Needed' && (
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>· revision suggested</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {drawer && (
        <SettingsDrawer agentId={drawer.agentId} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
}
