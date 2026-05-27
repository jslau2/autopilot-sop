import { useDashboard } from '../context/DashboardContext';
import { AGENTS } from '../data/agents';

export default function Timeline() {
  const { stepsArr, setSelectedStepId } = useDashboard();

  const sorted = [...stepsArr].sort((a, b) => a.startT - b.startT);

  if (sorted.length === 0) {
    return (
      <div className="tl-root">
        <div className="tl-empty">No steps yet — simulation starting…</div>
      </div>
    );
  }

  return (
    <div className="tl-root">
      <div className="tl-track" />
      <div className="tl-items">
        {sorted.map((step) => {
          const agent = AGENTS[step.agent];
          const color = agent?.color ?? 'var(--text-2)';
          const dur = step.endT != null
            ? `${(step.endT - step.startT).toFixed(1)}s`
            : step.status === 'running' ? 'running…' : '—';

          const badgeCls = step.status === 'running' ? 'tl-badge-running'
            : step.status === 'done' ? 'tl-badge-done'
            : 'tl-badge-paused';

          return (
            <div
              key={step.id}
              className={`tl-item`}
              onClick={() => setSelectedStepId(step.id)}
            >
              <div className="tl-node-wrap">
                <div className="tl-node" style={{ borderColor: color, background: step.status === 'done' ? color + '22' : 'var(--bg-base)' }}>
                  {step.status === 'running' && <div className="tl-node-pulse" style={{ background: color }} />}
                  {step.status === 'done' && <span className="tl-node-check">✓</span>}
                  {step.type === 'question' && <span className="tl-node-q">?</span>}
                </div>
                <div className="tl-connector-line" />
              </div>
              <div className="tl-content">
                <div className="tl-row1">
                  <span className="tl-agent-pill" style={{ color, borderColor: color + '55', background: color + '10' }}>
                    {agent?.name ?? step.agent}
                  </span>
                  <span className="tl-label">{step.label}</span>
                  <span className={`tl-status-badge ${badgeCls}`}>{step.status}</span>
                </div>
                <div className="tl-row2">
                  <span className="tl-time-val mono">+{step.startT.toFixed(1)}s</span>
                  <span className="tl-dur mono">{dur}</span>
                  {step.dataSource && (
                    <span className="tl-dur" style={{ color: 'var(--text-3)', fontSize: 10 }}>{step.dataSource}</span>
                  )}
                </div>
                {step.metrics && step.status === 'done' && (
                  <div className="tl-metrics">
                    {Object.entries(step.metrics).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="tl-metric-chip">
                        <span className="tl-metric-k">{k.replace(/_/g, ' ')}</span>
                        <span className="tl-metric-v">{v}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
