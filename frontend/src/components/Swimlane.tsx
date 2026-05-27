import { useDashboard } from '../context/DashboardContext';
import { AGENTS, AGENT_ORDER } from '../data/agents';
import AgentIcon from './AgentIcon';
import type { Step } from '../types';

const LANE_H = 60;
const PX_PER_SEC = 80;
const LABEL_W = 140;

function getAgentStatus(steps: Record<string, Step>, agentId: string): 'running' | 'paused' | 'done' | 'idle' {
  const agentSteps = Object.values(steps).filter(s => s.agent === agentId);
  if (agentSteps.some(s => s.status === 'paused')) return 'paused';
  if (agentSteps.some(s => s.status === 'running')) return 'running';
  if (agentSteps.length > 0 && agentSteps.every(s => s.status === 'done')) return 'done';
  return 'idle';
}

interface StepCardProps {
  step: Step;
  laneIndex: number;
  pxPerSec: number;
  elapsedT: number;
  onClick: () => void;
}

function StepCard({ step, laneIndex, pxPerSec, elapsedT, onClick }: StepCardProps) {
  const agent = AGENTS[step.agent];
  const color = agent?.color ?? 'var(--text-2)';
  const left = step.startT * pxPerSec;
  const width = step.endT != null
    ? Math.max((step.endT - step.startT) * pxPerSec, 40)
    : Math.max(80, (elapsedT - step.startT) * pxPerSec);
  const top = laneIndex * LANE_H + 8;

  let statusClass = '';
  if (step.status === 'running') statusClass = ' sc-running';
  else if (step.status === 'paused') statusClass = ' sc-paused';
  else if (step.status === 'done') statusClass = ' sc-done';

  return (
    <div
      className={`step-card${statusClass}`}
      style={{
        position: 'absolute',
        left,
        top,
        width: step.endT != null ? width : undefined,
        minWidth: step.endT == null ? 80 : undefined,
        '--ac': color,
      } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="sc-body">
        <div className="sc-label">{step.label}</div>
        {step.metrics && step.status === 'done' && (
          <div className="sc-metrics">
            <span className="sc-chip">{Object.values(step.metrics)[0]}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Swimlane() {
  const { steps, stepsArr, elapsedT, setSelectedStepId } = useDashboard();

  const cursorX = elapsedT * PX_PER_SEC;
  const totalWidth = Math.max(cursorX + 200, 800);

  return (
    <div className="swim-outer" style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      {/* Agent labels */}
      <div className="swim-labels" style={{ width: LABEL_W, flexShrink: 0, overflowY: 'auto' }}>
        {AGENT_ORDER.map((agentId) => {
          const agent = AGENTS[agentId];
          const status = getAgentStatus(steps, agentId);
          return (
            <div key={agentId} className="agent-label-row" style={{ height: LANE_H, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' }}>
              <AgentIcon color={agent.color} status={status} size={28} />
              <div className="agent-label-text">
                <span className="agent-label-name" style={{ color: status === 'idle' ? 'var(--text-3)' : 'var(--text-1)' }}>
                  {agent.name}
                </span>
                <span className="agent-label-sub">{agent.code}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable graph area */}
      <div className="swim-scroll" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}>
        <div style={{ position: 'relative', width: totalWidth, height: AGENT_ORDER.length * LANE_H }}>
          {/* Lane backgrounds + time ruler lines */}
          {AGENT_ORDER.map((agentId, i) => (
            <div
              key={agentId}
              style={{
                position: 'absolute',
                left: 0, right: 0,
                top: i * LANE_H,
                height: LANE_H,
                background: i % 2 === 0 ? 'transparent' : 'oklch(0 0 0 / 0.03)',
                borderBottom: '1px solid var(--border-s)',
              }}
            />
          ))}

          {/* Time cursor */}
          <div
            style={{
              position: 'absolute',
              left: cursorX,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: 'var(--accent)',
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          />

          {/* Step cards */}
          {stepsArr.map(step => {
            const laneIdx = AGENT_ORDER.indexOf(step.agent);
            if (laneIdx < 0) return null;
            return (
              <StepCard
                key={step.id}
                step={step}
                laneIndex={laneIdx}
                pxPerSec={PX_PER_SEC}
                elapsedT={elapsedT}
                onClick={() => setSelectedStepId(step.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
