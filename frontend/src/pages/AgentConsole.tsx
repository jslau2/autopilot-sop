import { useState, useEffect, useRef } from 'react';
import AppShell from '../components/AppShell';
import AgentIcon from '../components/AgentIcon';
import { AGENTS, AGENT_ORDER } from '../data/agents';

function ConStat({ label, value, color, pulse }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: pulse ? `0 0 8px ${color}` : 'none',
        animation: pulse && value > 0 ? 'sess-pulse 2s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</span>
    </div>
  );
}

const SIM_DATA: Record<string, {
  tasks: { id: string; label: string; start: number; end: number | null; out: string }[];
  logs: { at: number; msg: string }[];
  model: string;
}> = {
  planner: {
    tasks: [
      { id: 'PLN-001', label: 'Parse Goal & Build Task Graph', start: 0, end: 3.0, out: '13 wk horizon · 847 SKUs · 9 agents' },
      { id: 'PLN-002', label: 'Orchestrate & Monitor Agents', start: 3.0, end: null, out: '4 of 9 agents active' },
    ],
    logs: [
      { at: 0.3, msg: 'Parsing Q3-2026 S&OP goal: 847 SKUs, 12 plants, OTIF ≥ 98%' },
      { at: 1.2, msg: 'Building multi-agent dependency graph…' },
      { at: 2.0, msg: 'Constraint flags: Line 4 bottleneck, Supplier X +4wk LT' },
      { at: 3.0, msg: 'Graph ready — dispatching 4 parallel agents' },
      { at: 5.0, msg: 'SPI: inventory loaded, WOS 4.2' },
      { at: 8.0, msg: 'Signal from Demand: SKU-88X +34% spike confirmed' },
      { at: 8.9, msg: 'Signal from Tooling: D-88X die-set bottleneck ⚠' },
      { at: 11.0, msg: 'Conflict: assembly + tooling capacity insufficient for spike' },
      { at: 11.3, msg: 'Escalating to decision layer — pausing pipeline' },
    ],
    model: 'claude-opus-4-5',
  },
  demand: {
    tasks: [
      { id: 'AML-001', label: 'Ingest & Auto Feature Engineering', start: 3.2, end: 5.5, out: '109,512 rows · 84 auto-features · 3 signals merged' },
      { id: 'AML-002', label: 'AutoML Model Tournament (5 trials)', start: 5.6, end: 9.0, out: 'TFT Ensemble wins · MAPE 5.6% · bias −1.8%' },
    ],
    logs: [
      { at: 3.5, msg: 'Auto-ingesting 36-month shipment history + 14 promo events' },
      { at: 4.5, msg: 'AutoML: 84 lag/Fourier/promo features generated' },
      { at: 5.6, msg: 'Tournament START — ETS · Prophet · LightGBM · N-BEATS · TFT' },
      { at: 7.0, msg: 'Trial 3/5: LightGBM CV MAPE 5.8%' },
      { at: 8.0, msg: 'Trial 5/5: TFT Ensemble CV MAPE 5.6% ← WINNER' },
      { at: 8.2, msg: 'SPIKE: SKU-88X July 4–11 +34% ⚠' },
    ],
    model: 'AutoML · TFT Ensemble',
  },
  spi: {
    tasks: [
      { id: 'SPI-001', label: 'Load Inventory Snapshot (SAP)', start: 3.2, end: 5.0, out: '$12.4M · WOS 4.2 · 44 below SS' },
      { id: 'SPI-002', label: 'Production Status Review', start: 5.2, end: 7.8, out: '234 orders · Line 4 98.3% ⚠' },
      { id: 'SPI-003', label: 'S&P&I Three-Way Reconciliation', start: 9.5, end: 11.2, out: '44 SKUs short · 1,240 units · $442k' },
    ],
    logs: [
      { at: 3.4, msg: 'SAP S/4HANA connected (client 100)' },
      { at: 5.2, msg: 'Reading 234 open production orders' },
      { at: 6.8, msg: 'Line 4 at 98.3% — confirmed bottleneck' },
      { at: 9.7, msg: 'Reconciling 2.34M demand vs 2.19M supply' },
    ],
    model: 'claude-opus-4-5',
  },
  inventory: {
    tasks: [
      { id: 'INV-001', label: 'ABC Velocity Classification', start: 5.2, end: 8.2, out: '169 A-class · 12 dead-stock · $340k' },
      { id: 'INV-002', label: 'Replenishment Policy Update', start: null as unknown as number, end: null, out: 'Awaiting decision' },
    ],
    logs: [
      { at: 5.5, msg: 'Loading 12-month cumulative revenue by SKU' },
      { at: 8.1, msg: 'ABC complete — awaiting Planner decision for policies' },
    ],
    model: 'claude-opus-4-5',
  },
  masterdata: {
    tasks: [
      { id: 'MDM-001', label: 'BOM / Routing / UoM Validation', start: 3.2, end: 6.8, out: '847 SKUs · 34 BOM gaps · 3 vendors deduped' },
      { id: 'MDM-002', label: 'Cleanse & Quality Score', start: 6.9, end: 8.3, out: '31/34 gaps resolved · quality 98.7%' },
    ],
    logs: [
      { at: 3.5, msg: 'Validating 847 SKU masters · 3,240 BOM records' },
      { at: 5.4, msg: '⚠ 34 BOM records missing components' },
      { at: 8.0, msg: '31/34 resolved · 3 require manual review' },
    ],
    model: 'claude-haiku-4-5',
  },
  procurement: {
    tasks: [
      { id: 'PRO-001', label: 'ATP / CTP — Critical Components', start: 3.2, end: 7.5, out: '892 components · 12 ATP gaps · 3 CTP risks' },
      { id: 'PRO-002', label: 'Supplier Commit Plan', start: 7.6, end: 10.5, out: '127 POs · $3.8M · 8 expedited · 98.2%' },
    ],
    logs: [
      { at: 3.5, msg: 'Querying ATP for 892 components across 24 suppliers' },
      { at: 6.2, msg: '⚠ 12 ATP gaps — Supplier X allocation limit reached' },
      { at: 10.4, msg: 'Commit plan locked — $3.8M · 98.2% coverage' },
    ],
    model: 'claude-opus-4-5',
  },
  tooling: {
    tasks: [
      { id: 'TLG-001', label: 'Die Set & Mold Audit', start: 5.3, end: 8.8, out: '284 audited · 12 at-risk · D-88X critical' },
      { id: 'TLG-002', label: 'Tooling Allocation Plan', start: null as unknown as number, end: null, out: 'Awaiting decision' },
    ],
    logs: [
      { at: 5.6, msg: 'Auditing 284 active die sets across 6 plants' },
      { at: 7.4, msg: 'D-88X: 94% util · 92% shot-count life ⚠' },
    ],
    model: 'claude-opus-4-5',
  },
  capacity: { tasks: [{ id: 'CAP-001', label: 'Assembly Loading Plan', start: null as unknown as number, end: null, out: 'Queued' }], logs: [{ at: 3.2, msg: 'Ready — awaiting S&P&I reconciliation' }], model: 'claude-opus-4-5' },
  wip: { tasks: [{ id: 'WIP-001', label: 'Purchase Order Plan', start: null as unknown as number, end: null, out: 'Queued' }], logs: [{ at: 3.2, msg: 'MRP ready — awaiting reconciliation inputs' }], model: 'claude-opus-4-5' },
  finance: { tasks: [{ id: 'FIN-001', label: 'P&L Reconciliation', start: null as unknown as number, end: null, out: 'Queued' }], logs: [{ at: 3.2, msg: 'P&L model loaded — awaiting operational plan' }], model: 'claude-opus-4-5' },
  optimizer: { tasks: [{ id: 'OPT-001', label: 'MILP + Pareto Optimisation', start: null as unknown as number, end: null, out: 'Queued' }], logs: [{ at: 3.2, msg: 'Optimization model ready — awaiting capacity plan' }], model: 'CP-SAT + MILP' },
  risk: { tasks: [{ id: 'RSK-001', label: 'Risk & Constraint Check', start: null as unknown as number, end: null, out: 'Queued' }], logs: [{ at: 3.2, msg: 'Risk register pre-loaded — 5 known constraints flagged' }], model: 'claude-opus-4-5' },
};

const MESSAGES = [
  { at: 0.4, from: 'planner', to: 'demand', tag: 'BEGIN', text: 'Forecast horizon W22–W34, 847 SKUs, attach promotional calendar' },
  { at: 0.4, from: 'planner', to: 'spi', tag: 'BEGIN', text: 'Load inventory from SAP S/4HANA client 100, sync WIP' },
  { at: 2.5, from: 'planner', to: 'inventory', tag: 'BEGIN', text: 'Run ABC velocity analysis once inventory snapshot is ready' },
  { at: 2.5, from: 'planner', to: 'tooling', tag: 'BEGIN', text: 'Audit 284 die sets — flag util >85% and shot-count thresholds' },
  { at: 5.0, from: 'spi', to: 'planner', tag: 'ACK', text: 'Inventory loaded: $12.4M · WOS 4.2 · 44 SKUs below safety stock' },
  { at: 7.8, from: 'spi', to: 'planner', tag: 'ACK', text: 'Production reviewed: Line 4 at 98.3%, 47 orders at risk' },
  { at: 8.0, from: 'demand', to: 'planner', tag: 'ALERT', text: 'SKU-88X July 4–11 +34% — trade show confirmed, demand spike flagged' },
  { at: 8.2, from: 'inventory', to: 'planner', tag: 'ACK', text: 'ABC done: 169 A-class SKUs · 12 dead-stock items ($340k)' },
  { at: 8.8, from: 'tooling', to: 'planner', tag: 'ALERT', text: 'D-88X at 94% util + 92% shot-count life — bottleneck confirmed ⚠' },
  { at: 9.5, from: 'planner', to: 'spi', tag: 'BEGIN', text: 'Run three-way reconciliation using finalized demand forecast' },
  { at: 11.2, from: 'spi', to: 'planner', tag: 'ESCALATE', text: 'Gap 1,240 units · $442k · assembly + tooling both constrained' },
  { at: 11.4, from: 'planner', to: 'all', tag: 'PAUSE', text: 'Decision required — pausing pipeline, awaiting human input' },
];

function getAgentState(agentId: string, t: number) {
  const sim = SIM_DATA[agentId];
  if (!sim) return { status: 'idle' as const, task: null, progress: 0, logs: [] as { at: number; msg: string }[], out: '' };

  const currentTask = sim.tasks.find(tk => tk.start != null && tk.start <= t && (tk.end == null || tk.end > t));
  const lastDone = [...sim.tasks].reverse().find(tk => tk.end != null && tk.end <= t);
  const activeTask = currentTask || lastDone;

  let progress = 0;
  let status: 'running' | 'done' | 'idle' = 'idle';
  if (currentTask) {
    status = 'running';
    if (currentTask.end == null) {
      progress = Math.min(95, ((t - currentTask.start) % 8) / 8 * 100);
    } else {
      progress = Math.min(99, (t - currentTask.start) / (currentTask.end - currentTask.start) * 100);
    }
  } else if (lastDone) {
    status = 'done'; progress = 100;
  }

  const logs = sim.logs.filter(l => l.at <= t).slice(-4);
  return { status, task: activeTask, progress, logs, out: activeTask?.out ?? '' };
}

function AgentCard({ agentId, t, isPlanner }: { agentId: string; t: number; isPlanner: boolean }) {
  const ag = AGENTS[agentId];
  const { status, task, progress, logs, out } = getAgentState(agentId, t);
  const color = ag.color;

  const badgeClass = { running: 'ac-badge-running', done: 'ac-badge-done', paused: 'ac-badge-paused', idle: 'ac-badge-idle' }[status] ?? 'ac-badge-idle';
  const badgeLabel = { running: '● Live', done: '✓ Done', paused: '⏸ Paused', idle: 'Idle' }[status] ?? 'Idle';
  const pct = Math.round(progress);
  const eta = status === 'running' && task?.end != null
    ? `~${Math.max(0, task.end - t).toFixed(0)}s left`
    : status === 'running' ? 'ongoing' : '';

  return (
    <div className={`agent-card${isPlanner ? ' is-planner' : ''}`} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <div className="ac-header">
        <div className="ac-icon-wrap">
          <AgentIcon color={color} status={status} size={isPlanner ? 40 : 34} />
        </div>
        <div>
          <div className="ac-name" style={{ color }}>{ag.name}</div>
          <div className="ac-sub">{ag.sub}</div>
        </div>
        <div className={`ac-badge ${badgeClass}`}>{badgeLabel}</div>
      </div>

      <div className="ac-body">
        {task ? (
          <div className="ac-task">
            <span className="ac-task-id mono" style={{ background: color + '18', color, borderRadius: 4, padding: '2px 7px' }}>
              S&OP-Q3-{task.id}
            </span>
            <span className="ac-task-label">{task.label}</span>
          </div>
        ) : (
          <div className="ac-task-idle">No active task — standing by</div>
        )}

        {status !== 'idle' && (
          <div className="ac-progress-wrap">
            <div className="ac-progress-row">
              <span className="ac-progress-pct">{pct}%</span>
              {eta && <span className="ac-progress-eta">{eta}</span>}
            </div>
            <div className="ac-progress-track">
              <div
                className={`ac-progress-fill${status === 'running' ? ' is-running' : ''}`}
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }}
              />
            </div>
          </div>
        )}

        {out && status !== 'idle' && (
          <div className="ac-output">
            <div className="ac-output-lbl">Output</div>
            {out}
          </div>
        )}

        {logs.length > 0 && (
          <div className="ac-log">
            {logs.map((l, i) => (
              <div key={i} className="ac-log-entry">
                <span className="ac-log-ts mono">{String(Math.floor(l.at)).padStart(2, '0')}:{String(Math.round((l.at % 1) * 60)).padStart(2, '0')}</span>
                <span className="ac-log-msg">{l.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {status !== 'idle' && task && (
        <div className="ac-footer">
          <span className="ac-foot-item">Model: <span>{SIM_DATA[agentId]?.model}</span></span>
          {task.id && <span className="ac-foot-item">Task: <span className="mono">{task.id}</span></span>}
        </div>
      )}
    </div>
  );
}

export default function AgentConsole() {
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.1) * 0.5;
      lastRef.current = now;
      if (tRef.current < 30) {
        tRef.current += dt;
        frame++;
        if (frame % 3 === 0) setT(tRef.current);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const visibleMessages = MESSAGES.filter(m => m.at <= t);
  const tagClass: Record<string, string> = {
    BEGIN: 'msg-tag-begin', ACK: 'msg-tag-ack', ALERT: 'msg-tag-alert',
    ESCALATE: 'msg-tag-escalate', PAUSE: 'msg-tag-pause',
  };

  const statusLabel = t >= 11.4 ? '⏸ Decision Required' : '● Running';
  const statusCls = t >= 11.4 ? 'sp-paused' : 'sp-running';

  // Aggregate live activity across all agents.
  const states = AGENT_ORDER.map(id => getAgentState(id, t).status);
  const nActive = states.filter(s => s === 'running').length;
  const nDone = states.filter(s => s === 'done').length;
  const nIdle = states.length - nActive - nDone;

  return (
    <AppShell active="console">
    <div className="console" style={{ height: 'calc(100vh - 53px)' }}>
      {/* Live-activity header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Live Agent Activity</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Real-time view of every agent across active runs</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 6, flexWrap: 'wrap' }}>
          <ConStat label="Active" value={nActive} color="oklch(0.72 0.17 145)" pulse />
          <ConStat label="Idle / Queued" value={nIdle} color="oklch(0.78 0.15 75)" />
          <ConStat label="Done" value={nDone} color="var(--text-3)" />
          <ConStat label="Agents" value={AGENT_ORDER.length} color="var(--accent)" />
        </div>
        <span style={{ flex: 1 }} />
        <div className={`con-status-pill ${statusCls}`}>{statusLabel}</div>
        <span className="con-elapsed mono">{t.toFixed(1)}s</span>
      </div>

      <div className="con-body">
        <div className="con-left">
          <div className="session-card">
            <div className="sc-label">Active Session</div>
            <div className="sc-goal">Q3-2026 S&amp;OP · APAC Manufacturing · OTIF ≥ 98% · Margin ≥ 22%</div>
            <div className="sc-stats">
              <div className="sc-stat"><div className="sc-stat-val">{AGENT_ORDER.length}</div><div className="sc-stat-lbl">Agents</div></div>
              <div className="sc-stat"><div className="sc-stat-val">847</div><div className="sc-stat-lbl">SKUs</div></div>
              <div className="sc-stat"><div className="sc-stat-val">12</div><div className="sc-stat-lbl">Plants</div></div>
              <div className="sc-stat"><div className="sc-stat-val">W22–34</div><div className="sc-stat-lbl">Horizon</div></div>
            </div>
          </div>

          <div className="msg-bus">
            <div className="msg-bus-hd">
              <span className="msg-bus-title">Inter-Agent Message Bus</span>
              <div className="msg-live">
                <span className="msg-live-dot" />
                LIVE
              </div>
            </div>
            <div className="msg-list">
              {visibleMessages.map((m, i) => {
                const fromAg = AGENTS[m.from];
                const toAg = m.to === 'all' ? null : AGENTS[m.to];
                return (
                  <div key={i} className="msg-row">
                    <div className="msg-agents">
                      <span className="msg-agent-from" style={{ color: fromAg?.color }}>{fromAg?.code ?? m.from}</span>
                      <span className="msg-arrow">→</span>
                      {toAg
                        ? <span className="msg-agent-to" style={{ color: toAg.color }}>{toAg.code}</span>
                        : <span className="msg-agent-all">ALL</span>
                      }
                    </div>
                    <div className="msg-content">
                      <span className={`msg-tag ${tagClass[m.tag] ?? ''}`}>{m.tag}</span>
                      <div className="msg-text">{m.text}</div>
                      <div className="msg-ts mono">{m.at.toFixed(1)}s</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="con-right">
          <div className="agent-grid">
            {AGENT_ORDER.map(agentId => (
              <AgentCard key={agentId} agentId={agentId} t={t} isPlanner={agentId === 'planner'} />
            ))}
          </div>
        </div>
      </div>

      <div className="con-eventbar">
        <div className="evb-hd">
          <span className="evb-title">Global Event Feed</span>
          <span className="evb-count mono">{visibleMessages.length} messages</span>
          <div className="evb-live">
            <span className="msg-live-dot" />
            LIVE
          </div>
        </div>
        <div className="evb-list">
          {visibleMessages.slice(-20).map((m, i) => {
            const fromAg = AGENTS[m.from];
            return (
              <div key={i} className="evb-row">
                <span className="evb-ts mono">{m.at.toFixed(1)}s</span>
                <span className="evb-agent" style={{ color: fromAg?.color }}>{fromAg?.name ?? m.from}</span>
                <span className="evb-msg">{m.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
