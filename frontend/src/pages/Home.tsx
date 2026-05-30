import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AGENTS, AGENT_ORDER } from '../data/agents';
import { useDemoMode } from '../hooks/useDemoMode';
import { useEntity, ALL_ENTITIES } from '../hooks/useEntity';
import AppShell from '../components/AppShell';
import LaunchConfig from '../components/LaunchConfig';
import { useLaunchCycle } from '../hooks/useLaunchCycle';
import DeleteCycleControl from '../components/DeleteCycleControl';

type LiveSession = {
  session_id: string;
  name: string;
  goal: string;
  status: string;
  entity?: string;
  created_at: number;
  kpis: Record<string, string | number | null>;
  step_count: number;
};

type LaunchSeed = { goal?: string; name?: string; parentId?: string; scenarioOf?: string };

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
  const [demoMode] = useDemoMode();
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchSeed, setLaunchSeed] = useState<LaunchSeed | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const { active: activeEntity } = useEntity();
  const newCycle = () => { setLaunchSeed(null); setShowLaunch(true); };
  const branchCycle = (s: LiveSession) => {
    setLaunchSeed({ goal: s.goal, name: `${s.name} (what-if)`, parentId: s.session_id, scenarioOf: s.name });
    setShowLaunch(true);
  };
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(0);
  const launch = useLaunchCycle();

  const filteredLive = activeEntity === ALL_ENTITIES ? liveSessions : liveSessions.filter(s => (s.entity || '') === activeEntity);

  // Pagination over the active cycle list (demo SESSIONS vs live sessions).
  const cycleCount = demoMode ? SESSIONS.length : filteredLive.length;
  const pageCount = Math.max(1, Math.ceil(cycleCount / pageSize));
  const start = page * pageSize;
  const pagedDemo = SESSIONS.slice(start, start + pageSize);
  const pagedLive = filteredLive.slice(start, start + pageSize);

  // Keep the page in range as the list / page size changes.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [pageCount, page]);

  // In live mode, the cycle list reflects real backend sessions.
  useEffect(() => {
    if (demoMode) { setLiveSessions([]); return; }
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setLiveSessions(d.sessions ?? []))
      .catch(() => setLiveSessions([]));
  }, [demoMode]);

  return (
    <AppShell active="home">
    <div className="home-page">
      <div className="home-content">

        <div className="home-header">
          <p className="home-tagline">AI-driven Sales &amp; Operations Planning — from demand signal to approved plan</p>
          <p className="home-sub-tagline">
            {demoMode
              ? '🎭 Demo mode — scripted simulation, no backend'
              : '⚡ Live mode — real Azure OpenAI agents'} · switch in the top bar
          </p>
        </div>

        <div className="sessions-panel">
          <div className="sp-header">
            <span className="sp-title">Planning Cycles</span>
            <span className="sp-count">
              {demoMode ? `${SESSIONS.length} sessions` : `${filteredLive.length} session${filteredLive.length === 1 ? '' : 's'}${activeEntity !== ALL_ENTITIES ? ' · ' + activeEntity : ''}`}
            </span>
            <button className="sp-new-btn" onClick={newCycle}>+ New cycle</button>
          </div>

          {demoMode && pagedDemo.map(s => (
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

          {!demoMode && filteredLive.length === 0 && (
            <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-3)' }}>
              No cycles yet — click <strong>+ New cycle</strong> to launch your first live run.
            </div>
          )}

          {!demoMode && pagedLive.map(s => {
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
                <span
                  role="button"
                  tabIndex={0}
                  title="What-if — branch this cycle with tweaked constraints"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); branchCycle(s); }}
                  style={{
                    flexShrink: 0, width: 22, height: 22, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', borderRadius: 5,
                    color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', lineHeight: 1,
                  }}
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-base)'; }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                >⎇</span>
                <DeleteCycleControl
                  sessionId={s.session_id}
                  name={s.name}
                  onDeleted={() => setLiveSessions(prev => prev.filter(x => x.session_id !== s.session_id))}
                />
                <span className="si-open-btn">→</span>
              </Link>
            );
          })}

          {cycleCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderTop: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Rows</span>
              {[5, 10, 20].map(n => (
                <button
                  key={n}
                  onClick={() => { setPageSize(n); setPage(0); }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
                    background: pageSize === n ? 'var(--accent)' : 'transparent',
                    color: pageSize === n ? '#fff' : 'var(--text-2)',
                    border: `1px solid ${pageSize === n ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >{n}</button>
              ))}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {start + 1}–{Math.min(start + pageSize, cycleCount)} of {cycleCount}
              </span>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  width: 26, height: 26, borderRadius: 6, cursor: page === 0 ? 'default' : 'pointer',
                  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)',
                  opacity: page === 0 ? 0.4 : 1,
                }}
              >‹</button>
              <span style={{ fontSize: 11, color: 'var(--text-2)', minWidth: 34, textAlign: 'center' }}>
                {page + 1}/{pageCount}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                style={{
                  width: 26, height: 26, borderRadius: 6, cursor: page >= pageCount - 1 ? 'default' : 'pointer',
                  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)',
                  opacity: page >= pageCount - 1 ? 0.4 : 1,
                }}
              >›</button>
            </div>
          )}
        </div>

        <div className="nav-grid nav-grid-3">
          <Link to="/console" className="nav-card" style={{ '--card-accent': 'var(--accent)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 8l2 2-2 2M11 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="nc-title">Agent Console</div>
            <div className="nc-desc">Live activity across all agents — per-agent progress, reasoning logs, and the inter-agent message bus. The real-time ops view.</div>
            <div className="nc-cta">Open Agent Console →</div>
          </Link>

          <Link to="/agents" className="nav-card" style={{ '--card-accent': 'var(--ag-spi)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--ag-spi)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.636 5.636l2.121 2.121M16.243 16.243l2.121 2.121M5.636 18.364l2.121-2.121M16.243 7.757l2.121-2.121" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="nc-title">Agents Hub</div>
            <div className="nc-desc">Configure prompts, models &amp; tools per agent, and review performance &amp; governance. The 12-agent roster lives here.</div>
            <div className="nc-cta">Open Agents Hub →</div>
          </Link>

          <Link to="/datasources" className="nav-card" style={{ '--card-accent': 'var(--ag-finance)' } as React.CSSProperties}>
            <div className="nc-icon" style={{ color: 'var(--ag-finance)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="nc-title">Data Sources</div>
            <div className="nc-desc">The ERP &amp; external feeds powering the plan — SAP S/4HANA, Supplier Portal, Tooling Register — with live data preview.</div>
            <div className="nc-cta">Open Data Sources →</div>
          </Link>
        </div>

        <div className="agent-strip" style={{ marginBottom: 28 }}>
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

        <div className="home-footer">
          <Link to="/console">Agent Console</Link>
          &nbsp;·&nbsp;
          <Link to="/agents">Agents Hub</Link>
          &nbsp;·&nbsp;
          <Link to="/datasources">Data Sources</Link>
          &nbsp;·&nbsp;
          <span>Autopilot S&amp;OP · beta · APAC Manufacturing</span>
        </div>

      </div>

      {showLaunch && (
        <LaunchConfig
          demoMode={demoMode}
          initialGoal={launchSeed?.goal}
          initialName={launchSeed?.name}
          scenarioOf={launchSeed?.scenarioOf}
          onClose={() => setShowLaunch(false)}
          onLaunch={(goal, name, entity) => { setShowLaunch(false); launch(demoMode, goal, name, { parentId: launchSeed?.parentId, entity }); }}
        />
      )}
    </div>
    </AppShell>
  );
}
