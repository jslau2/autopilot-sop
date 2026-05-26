// components/timeline.jsx

function LinearTimeline() {
  const ctx = React.useContext(window.DashboardContext);
  const { stepsArr, selectedStepId, setSelectedStepId, tweaks } = ctx;
  const agents = window.AGENTS;

  const sorted = [...stepsArr].sort((a, b) => (a.startT || 0) - (b.startT || 0));

  return (
    <div className="tl-root">
      <div className="tl-track" />
      <div className="tl-items">
        {sorted.map((step, idx) => {
          const ag       = agents[step.agent];
          const isRunning = step.status === 'running';
          const isPaused  = step.status === 'paused';
          const isSel     = step.id === selectedStepId;
          const dur       = step.endT != null && step.startT != null
            ? (step.endT - step.startT).toFixed(1) + 's'
            : isRunning ? 'running…' : '—';

          return (
            <div
              key={step.id}
              className={`tl-item${isRunning ? ' tl-running' : ''}${isPaused ? ' tl-paused' : ''}${isSel ? ' tl-selected' : ''}`}
              onClick={() => setSelectedStepId(isSel ? null : step.id)}
            >
              {/* Timeline node */}
              <div className="tl-node-wrap">
                <div className="tl-node" style={{ background: ag.color, borderColor: ag.color }}>
                  {isRunning && <div className="tl-node-pulse" style={{ background: ag.color }} />}
                  {isPaused  && <span className="tl-node-q">?</span>}
                  {step.status === 'done' && <span className="tl-node-check">✓</span>}
                </div>
                {idx < sorted.length - 1 && <div className="tl-connector-line" />}
              </div>

              {/* Content */}
              <div className="tl-content">
                <div className="tl-row1">
                  <span className="tl-agent-pill" style={{ color: ag.color, borderColor: ag.color + '44', background: ag.color + '12' }}>
                    {ag.name}
                  </span>
                  <span className="tl-label">{step.label}</span>
                  <span className={`tl-status-badge tl-badge-${step.status}`}>{step.status}</span>
                </div>
                <div className="tl-row2">
                  <span className="tl-time-val mono">+{(step.startT || 0).toFixed(1)}s</span>
                  <span className="tl-dur mono">{dur}</span>
                  {step.tokens > 0 && (
                    <span className="tl-tok mono">{step.tokens.toLocaleString()} tok</span>
                  )}
                </div>
                {tweaks.showMetrics !== false && step.metrics && (
                  <div className="tl-metrics">
                    {Object.entries(step.metrics).map(([k, v]) => (
                      <span key={k} className="tl-metric-chip">
                        <span className="tl-metric-k">{k}</span>
                        <span className="tl-metric-v mono">{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                {isPaused && step.question && (
                  <div className="tl-question-preview">
                    <span className="tl-q-icon">⏸</span>
                    <em className="tl-q-text">{step.question.text.slice(0, 90)}…</em>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="tl-empty">Pipeline starting…</div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LinearTimeline });
