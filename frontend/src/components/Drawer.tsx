import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../context/DashboardContext';
import { AGENTS } from '../data/agents';
import { REASONING } from '../data/reasoning';
import FeedbackControl from './FeedbackControl';

interface TraceMessage {
  role: string;
  content: string;
  tool_calls?: { name: string; arguments: string; id: string }[];
}

interface DrawerProps {
  stepId: string;
  onClose: () => void;
}

function TraceView({ trace }: { trace: TraceMessage[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {trace.map((msg, i) => {
        if (msg.role === 'system') return (
          <div key={i} style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-s)' }}>
            <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              background: 'oklch(0.25 0.02 260)', color: 'var(--text-3)' }}>SYSTEM PROMPT</div>
            <pre className="code-pre" style={{ margin: 0, borderRadius: 0, fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
              {msg.content}
            </pre>
          </div>
        );

        if (msg.role === 'user') return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', minWidth: 36, paddingTop: 2 }}>USER</span>
            <pre className="code-pre" style={{ margin: 0, flex: 1, fontSize: 11 }}>{msg.content}</pre>
          </div>
        );

        if (msg.role === 'assistant') {
          const hasCalls = msg.tool_calls && msg.tool_calls.length > 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {msg.content && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.75 0.18 260)', minWidth: 36, paddingTop: 2 }}>LLM</span>
                  <pre className="code-pre" style={{ margin: 0, flex: 1, fontSize: 11 }}>{msg.content}</pre>
                </div>
              )}
              {hasCalls && msg.tool_calls!.map((tc, j) => {
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(tc.arguments || '{}'); } catch { /* ignore */ }
                return (
                  <div key={j} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.75 0.15 145)', minWidth: 36, paddingTop: 2 }}>CALL</span>
                    <div style={{ flex: 1, borderRadius: 5, border: '1px solid oklch(0.45 0.12 145 / 0.35)',
                      background: 'oklch(0.45 0.12 145 / 0.06)', padding: '6px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(0.75 0.15 145)', fontFamily: 'monospace' }}>
                        {tc.name}
                      </div>
                      {Object.keys(args).length > 0 && (
                        <pre style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(args, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        if (msg.role === 'tool') return (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.65 0.12 55)', minWidth: 36, paddingTop: 2 }}>DATA</span>
            <pre className="code-pre" style={{ margin: 0, flex: 1, fontSize: 10, maxHeight: 120, overflow: 'auto',
              borderColor: 'oklch(0.45 0.12 55 / 0.3)', background: 'oklch(0.45 0.12 55 / 0.06)' }}>
              {(() => { try { return JSON.stringify(JSON.parse(msg.content), null, 2); } catch { return msg.content; } })()}
            </pre>
          </div>
        );

        return null;
      })}
    </div>
  );
}

export default function Drawer({ stepId, onClose }: DrawerProps) {
  const { steps, demoMode, activeSessionId } = useDashboard();
  const step = steps[stepId];
  const [tab, setTab] = useState<'output' | 'reasoning' | 'raw'>('output');

  if (!step) return null;

  const agent = AGENTS[step.agent] ?? { name: step.agent, color: 'var(--text-2)', code: '?', sub: '' };
  const dur = step.endT != null && step.startT != null
    ? `${(step.endT - step.startT).toFixed(2)}s`
    : step.status === 'running' ? 'in progress' : '—';

  // Live mode trace from backend
  const trace = (step.output as Record<string, unknown> | null)?._trace as TraceMessage[] | undefined;
  // Live mode final answer (last assistant message with no tool_calls)
  const liveReasoning = trace
    ? trace.filter(m => m.role === 'assistant' && (!m.tool_calls || m.tool_calls.length === 0)).map(m => m.content).filter(Boolean).join('\n\n')
    : null;

  // Output without internal _trace field
  const cleanOutput = step.output
    ? Object.fromEntries(Object.entries(step.output as Record<string, unknown>).filter(([k]) => k !== '_trace'))
    : null;

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
            trace ? ['Turns', <span key="tr" className="mono">{trace.filter(m => m.role === 'assistant').length}</span>] : null,
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

        {step.agent === 'masterdata' && (
          <Link
            to="/bom-explorer"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6,
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
              color: agent.color, background: agent.color + '14', border: `1px solid ${agent.color}44`,
            }}
          >
            ◆ Visualize BOM graph →
          </Link>
        )}

        <div className="drawer-tabs">
          {(['output', 'reasoning', 'raw'] as const).map(t => (
            <button key={t} className={`dtab${tab === t ? ' dtab-active' : ''}`} onClick={() => setTab(t)}>
              {t}{t === 'raw' && trace ? ` (${trace.length})` : ''}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'output' && (
            <div className="tab-body">
              {cleanOutput && Object.keys(cleanOutput).length > 0
                ? <pre className="code-pre">{JSON.stringify(cleanOutput, null, 2)}</pre>
                : <div className="tab-empty">{step.status === 'running' ? 'Computing…' : 'No output recorded.'}</div>
              }
            </div>
          )}
          {tab === 'reasoning' && (
            <div className="tab-body">
              <p className="reasoning-text">
                {liveReasoning || REASONING[step.id] || (step.status === 'running' ? 'Analysis in progress…' : 'Reasoning not available for this step.')}
              </p>
            </div>
          )}
          {tab === 'raw' && (
            <div className="tab-body">
              {trace
                ? <TraceView trace={trace} />
                : <pre className="code-pre">{JSON.stringify(step, null, 2)}</pre>
              }
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Rate this agent output</span>
          <FeedbackControl
            sessionId={activeSessionId}
            target={step.id}
            targetLabel={`${agent.name} · ${step.label}`}
            agentId={step.agent}
            demoMode={demoMode}
            compact
          />
        </div>
      </div>
    </div>
  );
}
