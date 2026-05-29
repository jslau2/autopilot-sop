import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AGENTS, AGENT_ORDER } from '../data/agents';
import LaunchConfig from '../components/LaunchConfig';
import { useLaunchCycle } from '../hooks/useLaunchCycle';
import DeleteCycleControl from '../components/DeleteCycleControl';

type LiveSession = {
  session_id: string;
  name: string;
  status: string;
  created_at: number;
  kpis: Record<string, string | number | null>;
  step_count: number;
};

function relTime(epochSec: number): string {
  const secs = Math.max(0, Date.now() / 1000 - epochSec);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const SESSIONS = [
  {
    id: 1, name: 'Q3-2026 S&OP Cycle · SPL & SBMB Plan',
    meta: 'W22–W34 · 847 SKUs · 12 plants · SAP S/4HANA · Now',
    status: 'running', kpis: [['97.8%','OTIF'],['94.4%','Fcst Acc'],['87%','Cap Util']],
    link: '/pipeline',
  },
  {
    id: 2, name: 'July Demand Surge Scenario · SPL & SBMB Plan',
    meta: 'W22–W30 · 847 SKUs · SKU-88X +34% spike analysis · 3h ago',
    status: 'done', kpis: [['98.1%','OTIF'],['93.2%','Fcst Acc'],['91%','Cap Util']],
    link: '/pipeline',
  },
  {
    id: 3, name: 'Q2-2026 Final Plan · China Region',
    meta: 'W09–W21 · 612 SKUs · 4 plants · 1 month ago',
    status: 'done', kpis: [['96.4%','OTIF'],['91.8%','Fcst Acc'],['83%','Cap Util']],
    link: '/pipeline',
  },
  {
    id: 4, name: 'Supplier X Disruption Contingency · SPL & SBMB Plan',
    meta: 'W18–W26 · 847 SKUs · Emergency scenario run · 2 months ago',
    status: 'done', kpis: [['94.2%','OTIF'],['92.1%','Fcst Acc'],['98%','Cap Util']],
    link: '/pipeline',
  },
  {
    id: 5, name: 'Q1-2026 Baseline S&OP · Regional Consolidated',
    meta: 'W01–W13 · 847 SKUs · 12 plants · 3 months ago',
    status: 'done', kpis: [['97.0%','OTIF'],['90.5%','Fcst Acc'],['79%','Cap Util']],
    link: '/pipeline',
  },
];

export default function Home() {
  const [demoMode, setDemoMode] = useState(
    () => localStorage.getItem('sop-demo-mode') !== 'false'
  );
  const [showLaunch, setShowLaunch] = useState(false);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const launch = useLaunchCycle();

  const toggleMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    localStorage.setItem('sop-demo-mode', String(next));
  };

  // In live mode, the cycle list reflects real backend sessions.
  useEffect(() => {
    if (demoMode) { setLiveSessions([]); return; }
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setLiveSessions(d.sessions ?? []))
      .catch(() => setLiveSessions([]));
  }, [demoMode]);

  return (
    <div className="home-page">
      <div className="home-content">

        <div className="home-header">
          <div className="home-brand-row">
            <div className="home-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="home-brand-name">Autopilot S&amp;OP</span>
            <span className="home-brand-badge">beta</span>
          </div>
          <p className="home-tagline">AI-driven Sales &amp; Operations Planning — from demand signal to approved plan</p>
          <p className="home-sub-tagline">12 specialised agents · parallel orchestration · human-in-the-loop decisions</p>

          {/* Demo / Live mode toggle */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 12,
            padding: '8px 14px', borderRadius: 8,
            background: demoMode
              ? 'oklch(0.45 0.12 145 / 0.08)'
              : 'oklch(0.55 0.18 260 / 0.10)',
            border: `1px solid ${demoMode
              ? 'oklch(0.45 0.12 145 / 0.3)'
              : 'oklch(0.55 0.18 260 / 0.35)'}`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                {demoMode ? '🎭 Demo Mode' : '⚡ Live Mode'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {demoMode
                  ? 'Scripted simulation — no backend required'
                  : 'Real Azure OpenAI agents — backend must be running'}
              </span>
            </div>
            <button
              onClick={toggleMode}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 5,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                background: demoMode
                  ? 'oklch(0.55 0.18 260)'
                  : 'oklch(0.45 0.12 145)',
                color: '#fff',
              }}
            >
              Switch to {demoMode ? 'Live' : 'Demo'}
            </button>
          </div>
        </div>

        <div className="agent-strip">
          {AGENT_ORDER.map(id => {
            const ag = AGENTS[id];
            return (
              <span
                key={id}
                className="agent-chip"
                style={{ color: ag.color, borderColor: ag.color }}
              >
                {ag.name}
              </span>
            );
          })}
        </div>

        <div className="nav-grid">
          <Link to="/pipeline" className="nav-card" style={{ '--card-accent': 'var(--ag-planner)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--ag-planner)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="3" y="9" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" opacity=".6" />
                <rect x="3" y="15" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" opacity=".35" />
                <circle cx="20" cy="4.5" r="2" fill="currentColor" opacity=".8" />
              </svg>
            </div>
            <div className="nc-title">Pipeline View</div>
            <div className="nc-desc">The main orchestration dashboard — agents on a swimlane timeline, live KPIs, step-by-step task cards, and the decision modal.</div>
            <div className="nc-features">
              <div className="nc-feat">Swimlane &amp; timeline views</div>
              <div className="nc-feat">Live KPI bar (OTIF · Forecast Acc · WOS)</div>
              <div className="nc-feat">Click any step for full agent reasoning</div>
              <div className="nc-feat">Capacity Config &amp; constraint register</div>
            </div>
            <div className="nc-cta">Open Pipeline View →</div>
          </Link>

          <Link to="/console" className="nav-card" style={{ '--card-accent': 'var(--accent)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 8l2 2-2 2M11 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="nc-title">Agent Console</div>
            <div className="nc-desc">Deep orchestration detail — per-agent task IDs, live progress bars, reasoning logs, and the inter-agent message bus.</div>
            <div className="nc-features">
              <div className="nc-feat">Task IDs &amp; live progress per agent</div>
              <div className="nc-feat">Inter-agent message bus (BEGIN · ACK · ALERT)</div>
              <div className="nc-feat">Bobble-head live status icons</div>
              <div className="nc-feat">Session overview &amp; global event feed</div>
            </div>
            <div className="nc-cta">Open Agent Console →</div>
          </Link>

          <Link to="/settings" className="nav-card" style={{ '--card-accent': 'var(--ag-spi)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--ag-spi)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.636 5.636l2.121 2.121M16.243 16.243l2.121 2.121M5.636 18.364l2.121-2.121M16.243 7.757l2.121-2.121" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="nc-title">Agent Settings</div>
            <div className="nc-desc">Configure system prompts, model selection, temperature, and tool access per agent. View governance evaluation status.</div>
            <div className="nc-features">
              <div className="nc-feat">System prompt editor per agent</div>
              <div className="nc-feat">Model config (temperature, tokens)</div>
              <div className="nc-feat">Tool access toggles</div>
              <div className="nc-feat">Governance evaluation badges</div>
            </div>
            <div className="nc-cta">Open Agent Settings →</div>
          </Link>

          <Link to="/manager" className="nav-card" style={{ '--card-accent': 'var(--ag-finance)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--ag-finance)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="nc-title">Agent Manager</div>
            <div className="nc-desc">Per-agent analytics: growth time-trend charts, performance balance radar, feedback rating distribution, and Governance Agent assessment.</div>
            <div className="nc-features">
              <div className="nc-feat">Multi-metric growth trend line chart</div>
              <div className="nc-feat">Governance Agent written assessment</div>
              <div className="nc-feat">User feedback log per agent</div>
              <div className="nc-feat">Automated prompt engineering tab</div>
            </div>
            <div className="nc-cta">Open Agent Manager →</div>
          </Link>
        </div>

        <div className="sessions-panel">
          <div className="sp-header">
            <span className="sp-title">Planning Cycles</span>
            <span className="sp-count">
              {demoMode ? `${SESSIONS.length} sessions` : `${liveSessions.length} session${liveSessions.length === 1 ? '' : 's'}`}
            </span>
            <button className="sp-new-btn" onClick={() => setShowLaunch(true)}>+ New cycle</button>
          </div>

          {demoMode && SESSIONS.map(s => (
            <Link key={s.id} to="/pipeline/demo" className={`home-session-item${s.status === 'running' ? ' is-active' : ''}`}>
              {s.status === 'running' ? (
                <div className="si-orb" style={{ color: 'var(--ag-planner)' }}>
                  <div className="si-orb-ring" />
                  <div className="si-orb-arc" />
                  <div className="si-orb-dot" />
                </div>
              ) : (
                <div className="si-dot si-dot-done" style={{ flexShrink: 0, marginLeft: 12, marginRight: 2 }} />
              )}
              <div className="si-body">
                <div className="si-name">{s.name}</div>
                <div className="si-meta">{s.meta}</div>
              </div>
              <div className="si-kpis">
                {s.kpis.map(([val, lbl]) => (
                  <div key={lbl} className="si-kpi">
                    <div className="si-kpi-val">{val}</div>
                    <div className="si-kpi-lbl">{lbl}</div>
                  </div>
                ))}
              </div>
              <span className={`si-status si-status-${s.status}`}>
                {s.status === 'running' ? '● Running' : '✓ Done'}
              </span>
              <span className="si-open-btn">→</span>
            </Link>
          ))}

          {!demoMode && liveSessions.length === 0 && (
            <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-3)' }}>
              No cycles yet — click <strong>+ New cycle</strong> to launch your first live run.
            </div>
          )}

          {!demoMode && liveSessions.map(s => {
            const running = s.status === 'running';
            const kpiCells: [string, string][] = [];
            if (s.kpis.otif != null) kpiCells.push([String(s.kpis.otif), 'OTIF']);
            if (s.kpis.forecastAcc != null) kpiCells.push([String(s.kpis.forecastAcc), 'Fcst Acc']);
            if (s.kpis.capacityUtil != null) kpiCells.push([String(s.kpis.capacityUtil), 'Cap Util']);
            return (
              <Link key={s.session_id} to={`/pipeline/${s.session_id}`} className={`home-session-item${running ? ' is-active' : ''}`}>
                {running ? (
                  <div className="si-orb" style={{ color: 'var(--ag-planner)' }}>
                    <div className="si-orb-ring" />
                    <div className="si-orb-arc" />
                    <div className="si-orb-dot" />
                  </div>
                ) : (
                  <div className="si-dot si-dot-done" style={{ flexShrink: 0, marginLeft: 12, marginRight: 2 }} />
                )}
                <div className="si-body">
                  <div className="si-name">{s.name || s.session_id.slice(0, 8)}</div>
                  <div className="si-meta">{s.step_count} steps · {relTime(s.created_at)}</div>
                </div>
                <div className="si-kpis">
                  {kpiCells.map(([val, lbl]) => (
                    <div key={lbl} className="si-kpi">
                      <div className="si-kpi-val">{val}</div>
                      <div className="si-kpi-lbl">{lbl}</div>
                    </div>
                  ))}
                </div>
                <span className={`si-status si-status-${running ? 'running' : 'done'}`}>
                  {running ? '● Running' : s.status === 'paused' ? '⏸ Paused' : '✓ Done'}
                </span>
                <DeleteCycleControl
                  sessionId={s.session_id}
                  name={s.name}
                  onDeleted={() => setLiveSessions(prev => prev.filter(x => x.session_id !== s.session_id))}
                />
                <span className="si-open-btn">→</span>
              </Link>
            );
          })}
        </div>

        <div className="home-footer">
          <Link to="/pipeline">Pipeline View</Link>
          &nbsp;·&nbsp;
          <Link to="/console">Agent Console</Link>
          &nbsp;·&nbsp;
          <Link to="/settings">Agent Settings</Link>
          &nbsp;·&nbsp;
          <Link to="/manager">Agent Manager</Link>
          &nbsp;·&nbsp;
          <span>Autopilot S&amp;OP · beta · APAC Manufacturing</span>
        </div>

      </div>

      {showLaunch && (
        <LaunchConfig
          demoMode={demoMode}
          onClose={() => setShowLaunch(false)}
          onLaunch={(goal, name) => { setShowLaunch(false); launch(demoMode, goal, name); }}
        />
      )}
    </div>
  );
}
