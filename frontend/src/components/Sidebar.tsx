import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDashboard } from '../context/DashboardContext';

const SOP_PROJECTS = [
  { id: 'p1', name: 'SPL & SBMB Plan', active: true },
  { id: 'p2', name: 'China Region Plan', active: false },
  { id: 'p3', name: 'Regional Consolidated', active: false },
];

type SidebarSession = {
  session_id: string;
  name: string;
  status: string;
  created_at: number;
};

function relTime(epochSec: number): string {
  const secs = Math.max(0, Date.now() / 1000 - epochSec);
  if (secs < 60) return 'Now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Sidebar() {
  const ctx = useDashboard();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [sessions, setSessions] = useState<SidebarSession[]>([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sop-sidebar-collapsed') === '1');

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sop-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

  // Live mode: reflect real backend sessions. Re-fetch when the active session
  // changes, and poll so status dots stay fresh as runs progress.
  useEffect(() => {
    if (ctx.demoMode) return;
    let alive = true;
    const refresh = () => {
      fetch('/api/sessions')
        .then(r => (r.ok ? r.json() : { sessions: [] }))
        .then(d => { if (alive) setSessions(d.sessions ?? []); })
        .catch(() => { /* keep last known list */ });
    };
    refresh();
    const id = setInterval(refresh, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [ctx.demoMode, ctx.activeSessionId]);

  // Refetch promptly when the active session's live status changes
  // (e.g. running -> paused -> done), so the list doesn't lag behind.
  useEffect(() => {
    if (ctx.demoMode) return;
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => { /* ignore */ });
  }, [ctx.demoMode, ctx.sessionStatus]);

  // Demo mode is single-instance: show just the current cycle. In live mode,
  // override the active row with the live status from context so it updates
  // on the fly without waiting for the next poll.
  const cycleList: SidebarSession[] = ctx.demoMode
    ? [{ session_id: ctx.activeSessionId, name: 'Q3-2026 S&OP Cycle', status: ctx.sessionStatus, created_at: Date.now() / 1000 }]
    : sessions.map(s => s.session_id === ctx.activeSessionId ? { ...s, status: ctx.sessionStatus } : s);

  const activeStatus = ctx.sessionStatus;
  const railDotClass = `sess-${activeStatus === 'running' ? 'running' : activeStatus === 'paused' ? 'paused' : 'done'}`;

  // Collapsed: a slim rail with an expand button, brand mark, and the active
  // run's status dot for at-a-glance awareness.
  if (collapsed) {
    return (
      <aside className="sidebar" style={{ width: 48, alignItems: 'center' }}>
        <div className="sidebar-brand" style={{ justifyContent: 'center', padding: '14px 0', width: '100%' }}>
          <svg className="brand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <button
          onClick={toggleCollapsed}
          title="Expand sidebar"
          style={{
            marginTop: 8, width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
            background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}
        >»</button>
        <span className={`sess-dot ${railDotClass}`} style={{ marginTop: 16 }} title={`Active cycle: ${activeStatus}`} />
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <svg className="brand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="brand-name">Autopilot S&amp;OP</span>
        <span className="brand-tag">beta</span>
        <button
          onClick={toggleCollapsed}
          title="Collapse sidebar"
          style={{
            marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
          }}
        >«</button>
      </div>

      <section className="sb-section">
        <div className="sb-label">PLANNING ENTITY</div>
        <div className="project-list">
          {SOP_PROJECTS.map(p => (
            <div key={p.id} className={`project-item${p.active ? ' is-active' : ''}`}>
              <span className="project-bullet" style={{ background: p.active ? 'var(--accent)' : 'var(--border)' }} />
              <span className="project-name">{p.name}</span>
              {p.active && <span className="project-active-pill">active</span>}
            </div>
          ))}
        </div>
        <button className="sb-ghost-btn">+ New entity</button>
      </section>

      <section className="sb-section">
        <div className="sb-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>DATA SOURCES</span>
          <Link to="/datasources" style={{ fontSize: 9.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
        </div>
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); }}
        >
          <div className="dz-icon">⬡</div>
          <div className="dz-hint">Drop ERP export or connect</div>
          <div className="dz-current">
            <span className="dz-file-dot" />
            SAP S/4HANA · Live
          </div>
          <div className="dz-stats">847 SKUs · 12 plants · W22–W34</div>
        </div>
      </section>

      <section className="sb-section sb-sessions">
        <div className="sb-label">PLANNING CYCLES</div>
        <div className="session-list">
          {cycleList.length === 0 && (
            <div className="sess-time" style={{ padding: '6px 4px' }}>No cycles yet</div>
          )}
          {cycleList.map(s => (
            <div
              key={s.session_id}
              className={`session-item${s.session_id === ctx.activeSessionId ? ' is-active' : ''}`}
              onClick={() => {
                if (ctx.demoMode || s.session_id === ctx.activeSessionId) return;
                navigate(`/pipeline/${s.session_id}`);
              }}
              style={{ cursor: ctx.demoMode ? 'default' : 'pointer' }}
            >
              <span className={`sess-dot sess-${s.status === 'running' ? 'running' : s.status === 'paused' ? 'paused' : 'done'}`} />
              <div className="sess-body">
                <div className="sess-name">{s.name || s.session_id.slice(0, 8)}</div>
                <div className="sess-time">{relTime(s.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="sb-ghost-btn" onClick={ctx.onNewCycle}>+ New cycle</button>
      </section>

      <div className="sidebar-footer">
        <span className="footer-hint">
          <kbd>T</kbd> toggle view &nbsp;·&nbsp; <kbd>Esc</kbd> close drawer
        </span>
        <button
          onClick={() => ctx.setShowTour(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', marginTop: 5, display: 'block', padding: 0, width: '100%', textAlign: 'left', transition: 'color .15s' }}
          onMouseOver={e => (e.currentTarget.style.color = 'var(--text-2)')}
          onMouseOut={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          ↺ Replay guided tour
        </button>
      </div>
    </aside>
  );
}
