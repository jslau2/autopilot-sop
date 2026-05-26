import { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { AGENTS } from '../data/agents';
import { REASONING } from '../data/reasoning';

interface DrawerProps {
  stepId: string;
  onClose: () => void;
}

export default function Drawer({ stepId, onClose }: DrawerProps) {
  const { steps } = useDashboard();
  const step = steps[stepId];
  const [tab, setTab] = useState<'output' | 'reasoning' | 'raw'>('output');

  if (!step) return null;

  const agent = AGENTS[step.agent] ?? { name: step.agent, color: 'var(--text-2)', code: '?', sub: '' };
  const dur = step.endT != null && step.startT != null
    ? `${(step.endT - step.startT).toFixed(2)}s`
    : step.status === 'running' ? 'in progress' : '—';

  return (
    <div className="drawer-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="drawer">
        <div className="drawer-header" style={{ borderColor: agent.color + '44' }}>
          <div
            className="drawer-agent-pill"
            style={{ color: agent.color, background: agent.color + '18', borderColor: agent.color + '44' }}
          >
            {agent.name}
          </div>
          <h2 className="drawer-title">{step.label}</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-meta">
          {[
            ['Status', <span key="s" className={`meta-badge badge-${step.status}`}>{step.status}</span>],
            ['Duration', <span key="d" className="mono">{dur}</span>],
            step.dataSource ? ['Source', <span key="src" className="mono" style={{ fontSize: 11 }}>{step.dataSource}</span>] : null,
            step.records ? ['Records', <span key="r" className="mono">{step.records.toLocaleString()}</span>] : null,
            step.startT != null ? ['Cycle T', <span key="t" className="mono">+{step.startT.toFixed(1)}s</span>] : null,
          ].filter(Boolean).map((item, i) => {
            const [label, val] = item as [string, React.ReactNode];
            return (
            <div key={i} className="meta-cell">
              <span className="meta-cell-label">{label}</span>
              <span className="meta-cell-val">{val}</span>
            </div>
          );
          })}
        </div>

        {step.type === 'question' && step.question && (
          <div className="drawer-question-block">
            <div className="dqb-label">⏸ Planner Question</div>
            <p className="dqb-text">{step.question.text}</p>
            {step.output && (step.output as { answer?: string }).answer && (
              <div className="dqb-answer">
                <span className="dqb-answer-label">Decision taken</span>
                <span className="dqb-answer-text">{(step.output as { answer: string }).answer}</span>
              </div>
            )}
          </div>
        )}

        {step.metrics && (
          <div className="drawer-metrics">
            <div className="dm-header">Metrics</div>
            <div className="dm-grid">
              {Object.entries(step.metrics).map(([k, v]) => (
                <div key={k} className="dm-row">
                  <span className="dm-key">{k.replace(/_/g, ' ')}</span>
                  <span className="dm-val mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-tabs">
          {(['output', 'reasoning', 'raw'] as const).map(t => (
            <button key={t} className={`dtab${tab === t ? ' dtab-active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'output' && (
            <div className="tab-body">
              {step.output
                ? <pre className="code-pre">{JSON.stringify(step.output, null, 2)}</pre>
                : <div className="tab-empty">{step.status === 'running' ? 'Computing…' : 'No output recorded.'}</div>
              }
            </div>
          )}
          {tab === 'reasoning' && (
            <div className="tab-body">
              <p className="reasoning-text">
                {REASONING[step.id] || (step.status === 'running' ? 'Analysis in progress…' : 'Reasoning not available for this step.')}
              </p>
            </div>
          )}
          {tab === 'raw' && (
            <div className="tab-body">
              <pre className="code-pre">{JSON.stringify(step, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
