// sop/sidebar.jsx — S&OP specific sidebar
const { useState: useSopSidebarState } = React;

const SOP_PROJECTS = [
  { id: 'p1', name: 'SPL & SBMB Plan',       active: true  },
  { id: 'p2', name: 'China Region Plan',      active: false },
  { id: 'p3', name: 'Regional Consolidated',  active: false },
];

const SOP_SESSIONS = [
  { id: 'sess-001', name: 'Q3-2026 S&OP Cycle',      time: 'Now',    status: 'running' },
  { id: 'sess-002', name: 'July Spike Scenario',       time: '3h ago', status: 'done'    },
  { id: 'sess-003', name: 'Q2-2026 Final Plan',        time: '1mo ago',status: 'done'    },
  { id: 'sess-004', name: 'Baseline Demand Review',    time: '2mo ago',status: 'done'    },
];

function Sidebar() {
  const ctx = React.useContext(window.DashboardContext);
  const [dragOver, setDragOver] = useSopSidebarState(false);

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <svg className="brand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="10" y="9"  width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="brand-name">Autopilot S&OP</span>
        <span className="brand-tag">beta</span>
      </div>

      {/* Project selector */}
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

      {/* ERP data source */}
      <section className="sb-section">
        <div className="sb-label">DATA SOURCE</div>
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

      {/* Session history */}
      <section className="sb-section sb-sessions">
        <div className="sb-label">PLANNING CYCLES</div>
        <div className="session-list">
          {SOP_SESSIONS.map(s => (
            <div
              key={s.id}
              className={`session-item${s.id === ctx.activeSessionId ? ' is-active' : ''}`}
              onClick={() => ctx.setActiveSessionId(s.id)}
            >
              <span className={`sess-dot sess-${s.status}`} />
              <div className="sess-body">
                <div className="sess-name">{s.name}</div>
                <div className="sess-time">{s.time}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="sb-ghost-btn">+ New cycle</button>
      </section>

      <div className="sidebar-footer">
        <span className="footer-hint">
          <kbd>T</kbd> toggle view &nbsp;·&nbsp; <kbd>Esc</kbd> close drawer
        </span>
        <button
          onClick={() => ctx.setShowTour && ctx.setShowTour(true)}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text-3)',marginTop:5,display:'block',padding:0,width:'100%',textAlign:'left',transition:'color .15s'}}
          onMouseOver={e=>e.currentTarget.style.color='var(--text-2)'}
          onMouseOut={e=>e.currentTarget.style.color='var(--text-3)'}>
          ↺ Replay guided tour
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
