// components/sidebar.jsx
const { useState } = React;

const PROJECTS = [
  { id: 'p1', name: 'Telco Churn v3', active: true },
  { id: 'p2', name: 'Fraud Detection', active: false },
  { id: 'p3', name: 'LTV Prediction', active: false },
];

const SESSIONS = [
  { id: 'sess-001', name: 'Recall Optimization', time: 'Now',   status: 'running' },
  { id: 'sess-002', name: 'Feature Ablation',    time: '2h ago', status: 'done'    },
  { id: 'sess-003', name: 'Baseline Models',     time: '1d ago', status: 'done'    },
  { id: 'sess-004', name: 'Initial EDA',         time: '3d ago', status: 'done'    },
];

function Sidebar() {
  const ctx = React.useContext(window.DashboardContext);
  const [dragOver, setDragOver] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    setUploaded(true);
    setTimeout(() => setUploaded(false), 1800);
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <svg className="brand-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
          <polygon points="10,2 18,16 2,16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1="10" y1="8" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="15.2" r="0.9" fill="currentColor" />
        </svg>
        <span className="brand-name">Autopilot ML</span>
        <span className="brand-tag">beta</span>
      </div>

      {/* Project selector */}
      <section className="sb-section">
        <div className="sb-label">PROJECT</div>
        <div className="project-list">
          {PROJECTS.map(p => (
            <div key={p.id} className={`project-item ${p.active ? 'is-active' : ''}`}>
              <span className="project-bullet" style={{ background: p.active ? 'var(--accent)' : 'var(--border)' }} />
              <span className="project-name">{p.name}</span>
              {p.active && <span className="project-active-pill">active</span>}
            </div>
          ))}
        </div>
        <button className="sb-ghost-btn">+ New project</button>
      </section>

      {/* Dataset upload */}
      <section className="sb-section">
        <div className="sb-label">DATASET</div>
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''} ${uploaded ? 'uploaded' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploaded ? (
            <div className="dz-uploading">Uploading…</div>
          ) : (
            <>
              <div className="dz-icon">↑</div>
              <div className="dz-hint">Drop CSV or Parquet</div>
              <div className="dz-current">
                <span className="dz-file-dot" />
                telco-churn.csv
              </div>
              <div className="dz-stats">7,043 rows · 21 cols</div>
            </>
          )}
        </div>
      </section>

      {/* Session history */}
      <section className="sb-section sb-sessions">
        <div className="sb-label">SESSIONS</div>
        <div className="session-list">
          {SESSIONS.map(s => (
            <div
              key={s.id}
              className={`session-item ${s.id === ctx.activeSessionId ? 'is-active' : ''}`}
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
        <button className="sb-ghost-btn">+ New session</button>
      </section>

      {/* Footer */}
      <div className="sidebar-footer">
        <span className="footer-hint">
          <kbd>T</kbd> toggle view &nbsp;·&nbsp; <kbd>Esc</kbd> close drawer
        </span>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
