import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AgentIcon from '../components/AgentIcon';
import { AGENTS, AGENT_ORDER } from '../data/agents';
import { useDemoMode } from '../hooks/useDemoMode';

type FbSummary = {
  total: number; up: number; down: number; satisfaction: number | null;
  by_agent: { agent_id: string; up: number; down: number }[];
  recent_comments: { agent_id: string; rating: string; comment: string; target_label: string }[];
};

/**
 * Real in-app feedback rolled up for governance. Pulls /api/feedback/summary
 * (live mode) and renders only when there's data — sits above the (illustrative)
 * historical analytics so genuine 👍/👎 signal is visible to governance.
 */
function LiveFeedbackSummary({ agentId }: { agentId: string }) {
  const [demoMode] = useDemoMode();
  const [sum, setSum] = useState<FbSummary | null>(null);

  useEffect(() => {
    if (demoMode) { setSum(null); return; }
    let alive = true;
    fetch('/api/feedback/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setSum(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [demoMode, agentId]);

  if (!sum || !sum.total) return null;
  const mine = sum.by_agent.find(a => a.agent_id === agentId);
  const comments = sum.recent_comments.filter(c => c.agent_id === agentId).slice(0, 4);

  return (
    <div className="fb-block" style={{ borderLeft: '3px solid var(--accent)' }}>
      <div className="fb-block-hd">
        <span className="fb-block-icon">🗳️</span>
        <span className="fb-block-title">Live User Feedback (real signal)</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline', margin: '6px 0 4px' }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          All agents: <strong style={{ color: 'var(--text-1)' }}>{sum.satisfaction ?? '—'}%</strong> positive
          <span style={{ color: 'var(--text-3)' }}> ({sum.up}👍 / {sum.down}👎, n={sum.total})</span>
        </span>
        {mine && (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {AGENTS[agentId]?.name ?? agentId}: <strong style={{ color: 'var(--text-1)' }}>{mine.up}👍 / {mine.down}👎</strong>
          </span>
        )}
      </div>
      {comments.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-2)' }}>
          {comments.map((c, i) => (
            <li key={i} style={{ marginBottom: 3 }}>
              {c.rating === 'up' ? '👍' : '👎'} {c.comment}
              {c.target_label ? <span style={{ color: 'var(--text-3)' }}> — {c.target_label}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MONTHS = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
const METRIC_COLORS: Record<string, string> = {
  Accuracy: '#4a90d9',
  Relevance: '#e09040',
  Clarity: '#5ab85a',
  Specificity: '#d060c0',
  Usefulness: '#40b0c0',
};

function growthArr(start: number, end: number, seed: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const noise = Math.sin(seed + i * 1.7) * 0.018;
    return Math.max(0.1, Math.min(0.99, start + (end - start) * ease + noise));
  });
}

function fbDataFn(seed: number) {
  return ['★', '★★', '★★★', '★★★★', '★★★★★'].map((label, i) => ({
    label, count: Math.max(0, Math.round(Math.abs(Math.sin(seed + i * 2.3) * 5))),
  }));
}

interface AgentMgr {
  id: string;
  verdict: string;
  judgment: string;
  agentType: string;
  createdAt: string;
  createdBy: string;
  model: string;
  scores: Record<string, number>;
  rates: Record<string, number>;
  latestFb: string;
  feedback: string;
  growth: Record<string, number[]>;
  fbDataMap: Record<string, { label: string; count: number }[]>;
  prompt: string;
}

const AGENT_MGRS: AgentMgr[] = [
  { id: 'planner', verdict: 'Exceeds', judgment: 'No Revision Needed', agentType: 'Orchestrator Agent', createdAt: '2026-01-15', createdBy: 'S&OP Architect', model: 'claude-opus-4-5', scores: { Accuracy: 4.40, Clarity: 4.50, Relevance: 4.44, Specificity: 4.20, Usefulness: 4.72 }, rates: { Accuracy: 90, Clarity: 95, Relevance: 92, Specificity: 88, Usefulness: 96 }, latestFb: 'The orchestration logic is clear and well-reasoned. Task graph construction could benefit from exposing dependency weights.', feedback: 'The Planner agent has demonstrated exceptional orchestration capability throughout the Q3-2026 planning cycle. Clarity and Usefulness have consistently exceeded the 80% target since September 2025. The agent\'s ability to escalate decisions with quantified trade-offs is a strong indicator of mature orchestration reasoning.', growth: { Accuracy: growthArr(0.55, 0.90, 1), Relevance: growthArr(0.58, 0.92, 2), Clarity: growthArr(0.60, 0.95, 3), Specificity: growthArr(0.50, 0.88, 4), Usefulness: growthArr(0.62, 0.96, 5) }, fbDataMap: { Accuracy: fbDataFn(10), Relevance: fbDataFn(11), Clarity: fbDataFn(12), Specificity: fbDataFn(13), Usefulness: fbDataFn(14) }, prompt: 'You are the S&OP Orchestrator Agent...' },
  { id: 'demand', verdict: 'Exceeds', judgment: 'No Revision Needed', agentType: 'Forecasting Agent', createdAt: '2026-01-20', createdBy: 'Data Science Lead', model: 'claude-opus-4-5', scores: { Accuracy: 4.60, Clarity: 3.90, Relevance: 4.72, Specificity: 4.30, Usefulness: 4.40 }, rates: { Accuracy: 93, Clarity: 82, Relevance: 95, Specificity: 90, Usefulness: 92 }, latestFb: 'Model tournament output is excellent. Suggest adding confidence interval visualisation for downstream agents.', feedback: 'The AutoML Forecast agent has shown the most dramatic improvement trajectory. Accuracy rose from 55% to 93%, driven by the TFT winning the model tournament. Relevance is the standout at 95%. Clarity has lagged at 82% — model selection rationale is presented in technical terms non-specialists find opaque.', growth: { Accuracy: growthArr(0.55, 0.93, 6), Relevance: growthArr(0.62, 0.95, 7), Clarity: growthArr(0.45, 0.82, 8), Specificity: growthArr(0.52, 0.90, 9), Usefulness: growthArr(0.60, 0.92, 10) }, fbDataMap: { Accuracy: fbDataFn(20), Relevance: fbDataFn(21), Clarity: fbDataFn(22), Specificity: fbDataFn(23), Usefulness: fbDataFn(24) }, prompt: 'You are the AutoML Demand Forecasting Agent...' },
  { id: 'spi', verdict: 'Successfully Meets', judgment: 'Revision Needed', agentType: 'Reconciliation Agent', createdAt: '2026-01-18', createdBy: 'Supply Chain Lead', model: 'claude-opus-4-5', scores: { Accuracy: 4.10, Clarity: 3.95, Relevance: 4.00, Specificity: 4.30, Usefulness: 4.10 }, rates: { Accuracy: 91, Clarity: 87, Relevance: 88, Specificity: 93, Usefulness: 89 }, latestFb: 'Three-way reconciliation is accurate but gap analysis could be more actionable — rank by business impact.', feedback: 'The SPI Analyst demonstrates solid reconciliation capability with consistent accuracy above 88%. Specificity is the strongest dimension (93%). However, Clarity has plateaued at 87% — gap analysis prioritises completeness over actionability.', growth: { Accuracy: growthArr(0.52, 0.91, 11), Relevance: growthArr(0.54, 0.88, 12), Clarity: growthArr(0.48, 0.87, 13), Specificity: growthArr(0.56, 0.93, 14), Usefulness: growthArr(0.55, 0.89, 15) }, fbDataMap: { Accuracy: fbDataFn(30), Relevance: fbDataFn(31), Clarity: fbDataFn(32), Specificity: fbDataFn(33), Usefulness: fbDataFn(34) }, prompt: 'You are the SPI Analyst Agent...' },
  { id: 'finance', verdict: 'Exceeds', judgment: 'No Revision Needed', agentType: 'Financial Planning Agent', createdAt: '2026-01-28', createdBy: 'Finance Controller', model: 'claude-opus-4-5', scores: { Accuracy: 4.75, Clarity: 4.40, Relevance: 4.50, Specificity: 4.35, Usefulness: 4.40 }, rates: { Accuracy: 96, Clarity: 93, Relevance: 92, Specificity: 91, Usefulness: 91 }, latestFb: 'P&L translation is excellent — OT cost vs. revenue framing was exactly what the CFO needed.', feedback: 'The Finance agent is the highest-performing agent in the cohort across all five dimensions, with Accuracy at 96%. The OT decision framing as "+$142k cost vs. +$340k revenue protected → net EBIT +$198k" was cited by VP Supply Chain as the most decision-useful output of the Q3 cycle.', growth: { Accuracy: growthArr(0.60, 0.96, 36), Relevance: growthArr(0.58, 0.92, 37), Clarity: growthArr(0.56, 0.93, 38), Specificity: growthArr(0.54, 0.91, 39), Usefulness: growthArr(0.58, 0.91, 40) }, fbDataMap: { Accuracy: fbDataFn(80), Relevance: fbDataFn(81), Clarity: fbDataFn(82), Specificity: fbDataFn(83), Usefulness: fbDataFn(84) }, prompt: 'You are the Financial Reconciliation Agent...' },
  { id: 'optimizer', verdict: 'Exceeds', judgment: 'No Revision Needed', agentType: 'Optimization Agent', createdAt: '2026-03-01', createdBy: 'Operations Research', model: 'CP-SAT + MILP', scores: { Accuracy: 4.45, Clarity: 4.05, Relevance: 4.50, Specificity: 4.60, Usefulness: 4.75 }, rates: { Accuracy: 92, Clarity: 87, Relevance: 93, Specificity: 96, Usefulness: 97 }, latestFb: 'Pareto frontier made the trade-off conversation extremely efficient. Solver log is too verbose for non-technical reviewers.', feedback: 'The Plan Optimizer is the newest and highest-impact agent, with Usefulness at 97% — the highest single metric recorded. The MILP+CP-SAT combination achieved a $34k cost reduction while maintaining OTIF 97.8%.', growth: { Accuracy: growthArr(0.60, 0.92, 60), Relevance: growthArr(0.62, 0.93, 61), Clarity: growthArr(0.55, 0.87, 62), Specificity: growthArr(0.65, 0.96, 63), Usefulness: growthArr(0.68, 0.97, 64) }, fbDataMap: { Accuracy: fbDataFn(60), Relevance: fbDataFn(61), Clarity: fbDataFn(62), Specificity: fbDataFn(63), Usefulness: fbDataFn(64) }, prompt: 'You are the Plan Optimizer Agent...' },
];

// Fill remaining agents
const REMAINING = ['inventory', 'tooling', 'capacity', 'wip', 'risk', 'masterdata', 'procurement'];
REMAINING.forEach((id, idx) => {
  AGENT_MGRS.push({
    id, verdict: idx % 2 === 0 ? 'Successfully Meets' : 'Exceeds',
    judgment: idx % 3 === 0 ? 'Revision Needed' : 'No Revision Needed',
    agentType: 'Specialist Agent', createdAt: '2026-02-01', createdBy: 'S&OP Team',
    model: 'claude-opus-4-5',
    scores: { Accuracy: 4.0, Clarity: 3.9, Relevance: 4.1, Specificity: 4.2, Usefulness: 4.0 },
    rates: { Accuracy: 88, Clarity: 86, Relevance: 89, Specificity: 91, Usefulness: 88 },
    latestFb: 'Good performance overall. Continue improving output structure for downstream consumption.',
    feedback: `The ${AGENTS[id]?.name} agent demonstrates consistent performance across all evaluation dimensions. Key strengths: Specificity and Usefulness. Growth area: Clarity in output formatting.`,
    growth: { Accuracy: growthArr(0.50, 0.88, 10 + idx * 5), Relevance: growthArr(0.52, 0.89, 11 + idx * 5), Clarity: growthArr(0.46, 0.86, 12 + idx * 5), Specificity: growthArr(0.55, 0.91, 13 + idx * 5), Usefulness: growthArr(0.52, 0.88, 14 + idx * 5) },
    fbDataMap: { Accuracy: fbDataFn(10 + idx * 5), Relevance: fbDataFn(11 + idx * 5), Clarity: fbDataFn(12 + idx * 5), Specificity: fbDataFn(13 + idx * 5), Usefulness: fbDataFn(14 + idx * 5) },
    prompt: `You are the ${AGENTS[id]?.name} Agent...`,
  });
});

function LineChart({ growth, agentColor }: { growth: Record<string, number[]>; agentColor: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const SVG_W = 720, SVG_H = 290;
  const PAD = { t: 20, r: 130, b: 50, l: 48 };
  const CW = SVG_W - PAD.l - PAD.r, CH = SVG_H - PAD.t - PAD.b;
  const n = MONTHS.length;
  const xScale = (i: number) => PAD.l + (i / (n - 1)) * CW;
  const yScale = (v: number) => PAD.t + (1 - v) * CH;

  function smoothPath(vals: number[]) {
    const pts = vals.map((v, i): [number, number] => [xScale(i), yScale(v)]);
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const cx1: [number, number] = [(pts[i - 1][0] + pts[i][0]) / 2, pts[i - 1][1]];
      const cx2: [number, number] = [(pts[i - 1][0] + pts[i][0]) / 2, pts[i][1]];
      d += ` C${cx1[0]},${cx1[1]} ${cx2[0]},${cx2[1]} ${pts[i][0]},${pts[i][1]}`;
    }
    return d;
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (SVG_W / rect.width);
    const idx = Math.round((mx - PAD.l) / CW * (n - 1));
    if (idx >= 0 && idx < n) setHover(idx);
  }, [CW, n, PAD.l]);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
      onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={yScale(v)} x2={PAD.l + CW} y2={yScale(v)} stroke="var(--border-s)" strokeWidth="0.7" opacity="0.6" />
          <text x={PAD.l - 6} y={yScale(v)} textAnchor="end" dominantBaseline="middle" fontSize="8.5" fill="var(--text-3)" fontFamily="DM Sans">{Math.round(v * 100)}%</text>
        </g>
      ))}
      {MONTHS.map((m, i) => (
        <text key={i} x={xScale(i)} y={SVG_H - PAD.b + 14} textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="DM Sans">{m}</text>
      ))}
      <line x1={PAD.l} y1={yScale(0.80)} x2={PAD.l + CW} y2={yScale(0.80)} stroke="white" strokeWidth="1" strokeDasharray="6 4" opacity="0.25" />
      {Object.entries(METRIC_COLORS).map(([metric, color]) => {
        const vals = growth[metric];
        if (!vals) return null;
        return <path key={metric} d={smoothPath(vals)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.9" />;
      })}
      {hover != null && (
        <line x1={xScale(hover)} y1={PAD.t} x2={xScale(hover)} y2={PAD.t + CH} stroke="white" strokeWidth="1" opacity="0.2" />
      )}
      {hover != null && Object.entries(METRIC_COLORS).map(([metric, color]) => {
        const vals = growth[metric];
        if (!vals) return null;
        return <circle key={metric} cx={xScale(hover!)} cy={yScale(vals[hover!])} r="4" fill={color} stroke="var(--bg)" strokeWidth="1.5" />;
      })}
      {hover != null && (() => {
        const tx = Math.min(xScale(hover) + 10, PAD.l + CW - 110);
        const ty = PAD.t + 10;
        const boxH = 12 + Object.keys(METRIC_COLORS).length * 16;
        return (
          <g>
            <rect x={tx} y={ty} width={110} height={boxH} rx="5" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" opacity="0.97" />
            <text x={tx + 8} y={ty + 11} fontSize="9" fontWeight="700" fill="var(--text-3)" fontFamily="DM Sans">{MONTHS[hover!]}</text>
            {Object.entries(METRIC_COLORS).map(([metric, color], i) => {
              const v = growth[metric]?.[hover!];
              return v != null && (
                <g key={metric}>
                  <rect x={tx + 8} y={ty + 18 + i * 16} width="7" height="7" rx="2" fill={color} />
                  <text x={tx + 20} y={ty + 25 + i * 16} fontSize="9" fill="var(--text-2)" fontFamily="DM Sans">{metric}</text>
                  <text x={tx + 102} y={ty + 25 + i * 16} fontSize="9" fontWeight="600" fill="white" fontFamily="DM Sans" textAnchor="end">{Math.round(v * 100)}%</text>
                </g>
              );
            })}
          </g>
        );
      })()}
      {[...Object.entries(METRIC_COLORS), ['Target', 'white'], ['Model Created', agentColor]].map(([label, color], i) => (
        <g key={label} transform={`translate(${PAD.l + CW + 16},${PAD.t + i * 18})`}>
          {label === 'Target'
            ? <line x1={0} y1={5} x2={14} y2={5} stroke={color} strokeWidth="1" strokeDasharray="4 2" opacity="0.5" />
            : <rect x={0} y={1} width={14} height={8} rx={2} fill={color} opacity="0.85" />
          }
          <text x={18} y={9} fontSize="9" fill="var(--text-3)" fontFamily="DM Sans">{label}</text>
        </g>
      ))}
    </svg>
  );
}

type RpTab = 'performance' | 'feedback' | 'prompt';

export default function AgentManager({ embedded = false }: { embedded?: boolean } = {}) {
  const [selectedId, setSelectedId] = useState(AGENT_MGRS[0].id);
  const [rpTab, setRpTab] = useState<RpTab>('performance');

  const selected = AGENT_MGRS.find(a => a.id === selectedId) ?? AGENT_MGRS[0];
  const agent = AGENTS[selected.id];

  const verdictCls = selected.verdict === 'Exceeds' ? 'v-exceeds'
    : selected.verdict === 'Successfully Meets' ? 'v-meets' : 'v-revision';

  const badgeCls = selected.verdict === 'Exceeds' ? 'badge-exceeds' : 'badge-meets';

  // Approximate color for canvas
  const colorMap: Record<string, string> = {
    'var(--ag-planner)': '#c8933f', 'var(--ag-demand)': '#4a6fd4', 'var(--ag-spi)': '#38a89d',
    'var(--ag-inventory)': '#c060a8', 'var(--ag-tooling)': '#b07030', 'var(--ag-capacity)': '#3a9060',
    'var(--ag-wip)': '#9050c0', 'var(--ag-finance)': '#c07030', 'var(--ag-risk)': '#c04030',
    'var(--ag-masterdata)': '#5080c0', 'var(--ag-procurement)': '#6060d0', 'var(--ag-optimizer)': '#90a030',
  };
  const cssColor = colorMap[agent?.color ?? ''] ?? '#888';

  return (
    <div className="manager-page" style={embedded ? { height: '100%' } : undefined}>
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
        <span className="hdr-page">Agent Manager</span>
        <Link to="/pipeline" className="hdr-nav">← Pipeline</Link>
        <Link to="/console" className="hdr-nav">⊞ Console</Link>
        <Link to="/settings" className="hdr-nav">⚙ Settings</Link>
        <Link to="/" className="hdr-nav">⌂ Home</Link>
        <span className="hdr-spacer" />
        <div className="gov-badge">
          <div className="gov-label" style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Governance Agent</span>
            <span className="gov-name">claude-opus-4-5</span>
          </div>
        </div>
      </div>
      )}

      <div className="manager-body">
        <div className="left-panel">
          <div className="lp-top-bar">
            <span className="lp-title">Agents ({AGENT_MGRS.length})</span>
          </div>
          <div className="lp-scroll">
            <div className="agent-selector">
              {AGENT_MGRS.map(a => {
                const ag = AGENTS[a.id];
                const vc = a.verdict === 'Exceeds' ? 'v-exceeds' : a.verdict === 'Successfully Meets' ? 'v-meets' : 'v-revision';
                return (
                  <div
                    key={a.id}
                    className={`agent-sel-item${a.id === selectedId ? ' active' : ''}`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <div className="asi-color-bar" style={{ background: ag?.color }} />
                    <AgentIcon color={ag?.color ?? '#888'} status="running" size={24} />
                    <span className="asi-name">{ag?.name}</span>
                    <span className={`asi-verdict ${vc}`}>{a.verdict === 'Exceeds' ? 'Exceeds' : a.verdict === 'Successfully Meets' ? 'Meets' : 'Revision'}</span>
                  </div>
                );
              })}
            </div>

            <div className="agent-overview">
              <div className="ao-section-lbl">Overview</div>
              <div className="ao-icon-radar">
                <AgentIcon color={agent?.color ?? '#888'} status="running" size={80} />
              </div>

              <table className="profile-table">
                <tbody>
                  <tr><td>Agent Type</td><td className="pt-highlight">{selected.agentType}</td></tr>
                  <tr><td>Created</td><td>{selected.createdAt}</td></tr>
                  <tr><td>Created By</td><td>{selected.createdBy}</td></tr>
                  <tr><td>Model</td><td>{selected.model}</td></tr>
                  {Object.entries(selected.rates).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{v}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="user-fb-section">
              <div className="user-fb-lbl">
                <span>Latest Feedback</span>
              </div>
              <div className="user-fb-text">{selected.latestFb}</div>
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="rp-tabs">
            <button className={`rp-tab${rpTab === 'performance' ? ' active' : ''}`} onClick={() => setRpTab('performance')}>
              <span className="rp-tab-dot rp-tab-dot-blue" /> Performance Trends
            </button>
            <button className={`rp-tab${rpTab === 'feedback' ? ' active' : ''}`} onClick={() => setRpTab('feedback')}>
              <span className="rp-tab-dot rp-tab-dot-orange" /> User Feedback
            </button>
            <button className={`rp-tab${rpTab === 'prompt' ? ' active' : ''}`} onClick={() => setRpTab('prompt')}>
              <span className="rp-tab-dot rp-tab-dot-green" /> Prompt Engineering
            </button>
            <span className={`rp-badge ${badgeCls}`}>{selected.verdict}</span>
          </div>

          <div className="rp-body">
            {rpTab === 'performance' && (
              <>
                <LiveFeedbackSummary agentId={selected.id} />
                <div className="fb-block">
                  <div className="fb-block-hd">
                    <span className="fb-block-icon">📋</span>
                    <span className="fb-block-title">Governance Assessment — {agent?.name}</span>
                  </div>
                  <div className="fb-block-text">{selected.feedback}</div>
                </div>

                <div className="chart-container">
                  <div className="chart-hd">
                    <span className="chart-icon">📈</span>
                    <span className="chart-title">12-Month Performance Growth — May 2025 – Apr 2026</span>
                  </div>
                  <LineChart growth={selected.growth} agentColor={cssColor} />
                </div>

                <div className="chart-container">
                  <div className="chart-hd">
                    <span className="chart-icon">📊</span>
                    <span className="chart-title">Feedback Distribution by Metric</span>
                  </div>
                  <div className="bar-charts-row">
                    {Object.entries(selected.fbDataMap).map(([metric, data]) => (
                      <div key={metric} className="bar-chart-wrap">
                        <div className="bc-title">{metric}</div>
                        <svg viewBox="0 0 110 90" style={{ width: '100%', height: 'auto' }}>
                          {data.map((d, i) => {
                            const maxV = Math.max(...data.map(x => x.count), 1);
                            const bw = 80 / data.length - 3;
                            const bh = (d.count / maxV) * 60;
                            const x = 22 + i * (80 / data.length) + 1.5;
                            const y = 68 - bh;
                            return (
                              <g key={i}>
                                <rect x={x} y={y} width={bw} height={bh} rx="1.5" fill={METRIC_COLORS[metric]} opacity="0.75" />
                                {d.count > 0 && <text x={x + bw / 2} y={y - 2} textAnchor="middle" fontSize="6" fill="var(--text-2)">{d.count}</text>}
                                <text x={x + bw / 2} y={78} textAnchor="middle" fontSize="5.5" fill="var(--text-3)">{d.label}</text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {rpTab === 'feedback' && (
              <div className="fb-list">
                {[
                  { user: 'VP Supply Chain', date: '2026-05-22', metric: 'Usefulness', text: selected.latestFb, stars: '★★★★★' },
                  { user: 'Plant Manager P2', date: '2026-05-20', metric: 'Clarity', text: 'Output is well-structured. Would benefit from a one-page summary at the top.', stars: '★★★★' },
                  { user: 'Procurement Lead', date: '2026-05-18', metric: 'Accuracy', text: 'Data accuracy is excellent. Recommend adding confidence intervals to key outputs.', stars: '★★★★★' },
                  { user: 'CFO Office', date: '2026-05-15', metric: 'Relevance', text: 'Financial outputs are highly relevant and immediately usable in board presentations.', stars: '★★★★★' },
                ].map((fb, i) => (
                  <div key={i} className="fb-item">
                    <div className="fb-item-hd">
                      <span className="fb-item-user">{fb.user}</span>
                      <span className="fb-item-metric">{fb.metric}</span>
                      <span className="fb-item-date">{fb.date}</span>
                    </div>
                    <div className="fb-stars">{fb.stars}</div>
                    <div className="fb-item-text">{fb.text}</div>
                  </div>
                ))}
              </div>
            )}

            {rpTab === 'prompt' && (
              <div className="prompt-block">
                <div className="fb-block">
                  <div className="fb-block-hd">
                    <span className="fb-block-icon">🤖</span>
                    <span className="fb-block-title">Automated Prompt Engineering</span>
                  </div>
                  <div className="fb-block-text">
                    The Governance Agent has analysed {MONTHS.length} months of evaluation data and {selected.judgment === 'Revision Needed' ? 'recommends prompt revision to improve Clarity and downstream consumability.' : 'confirms current prompt is performing optimally — no revision recommended at this time.'}
                  </div>
                </div>

                <div className="prompt-field">
                  <div className="prompt-lbl">Current System Prompt</div>
                  <textarea className="prompt-textarea" defaultValue={selected.prompt} />
                </div>

                <div className="prompt-btn-row">
                  <button className="prompt-btn prompt-btn-save">Save Prompt</button>
                  <button className="prompt-btn prompt-btn-test">Test in Sandbox</button>
                  <span className="prompt-version-note">v3 · Last updated 2026-05-20</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
