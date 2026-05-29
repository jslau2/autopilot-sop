import { useDashboard } from '../context/DashboardContext';
import { AGENTS, AGENT_ORDER } from '../data/agents';
import AgentIcon from './AgentIcon';
import type { Step } from '../types';
import { useState, useRef, useEffect, useCallback } from 'react';

const DEFAULT_PX_PER_SEC = 80;
const LANE_H = 60;
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
        position: 'absolute', left, top,
        width: step.endT != null ? width : undefined,
        minWidth: step.endT == null ? 80 : undefined,
        '--ac': color,
      } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="sc-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div className="sc-label">{step.label}</div>
          {agent?.llm && step.type !== 'question' && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
              padding: '1px 4px', borderRadius: 3,
              background: `${color}22`, color, border: `1px solid ${color}55`,
              flexShrink: 0, lineHeight: '14px',
            }}>AI</span>
          )}
        </div>
        {step.metrics && step.status === 'done' && (
          <div className="sc-metrics">
            <span className="sc-chip">{Object.values(step.metrics)[0]}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConnectorsProps {
  stepsArr: Step[];
  steps: Record<string, Step>;
  pxPerSec: number;
  elapsedT: number;
}

function Connectors({ stepsArr, steps, pxPerSec, elapsedT }: ConnectorsProps) {
  const paths: React.ReactNode[] = [];

  for (const step of stepsArr) {
    if (!step.deps || step.deps.length === 0) continue;
    const toLaneIdx = AGENT_ORDER.indexOf(step.agent);
    if (toLaneIdx < 0) continue;
    const toX = step.startT * pxPerSec;
    const toY = toLaneIdx * LANE_H + LANE_H / 2;
    const color = AGENTS[step.agent]?.color ?? 'var(--text-3)';

    for (const depId of step.deps) {
      const dep = steps[depId];
      if (!dep) continue;
      const fromLaneIdx = AGENT_ORDER.indexOf(dep.agent);
      if (fromLaneIdx < 0) continue;
      const fromX = (dep.endT ?? elapsedT) * pxPerSec;
      const fromY = fromLaneIdx * LANE_H + LANE_H / 2;

      const cpOffset = Math.max(Math.abs(toX - fromX) * 0.45, 30);
      const d = `M ${fromX} ${fromY} C ${fromX + cpOffset} ${fromY}, ${toX - cpOffset} ${toY}, ${toX} ${toY}`;

      paths.push(
        <path
          key={`${depId}->${step.id}`}
          d={d}
          fill="none"
          style={{ stroke: color, color }}
          strokeWidth={1.5}
          strokeOpacity={0.4}
          markerEnd="url(#sw-arrow)"
        />
      );
    }
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <marker id="sw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" />
        </marker>
      </defs>
      {paths}
    </svg>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  color: 'var(--text-2)', borderRadius: 4, cursor: 'pointer',
  fontSize: 13, padding: '2px 7px', lineHeight: 1.4,
  transition: 'border-color 0.1s, color 0.1s',
};

export default function Swimlane() {
  const { steps, stepsArr, elapsedT, setSelectedStepId } = useDashboard();
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxT = Math.max(...stepsArr.map(s => s.endT ?? elapsedT), elapsedT, 1);
  const cursorX = elapsedT * pxPerSec;
  const totalWidth = Math.max(cursorX + 200, 800);
  const zoomPct = Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100);

  const zoom = useCallback((factor: number) => {
    setPxPerSec(prev => Math.max(8, Math.min(400, prev * factor)));
  }, []);

  const fitToScreen = useCallback(() => {
    const containerW = scrollRef.current?.clientWidth ?? 800;
    setPxPerSec(Math.max(8, (containerW - 40) / maxT));
  }, [maxT]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === '+' || e.key === '=') zoom(1.25);
      if (e.key === '-') zoom(1 / 1.25);
      if (e.key === '0') fitToScreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, fitToScreen]);

  return (
    <div className="swim-outer" style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, flexDirection: 'column' }}>
      {/* Zoom controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 4, padding: '4px 10px 4px 0', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', marginRight: 4 }}>
          <kbd style={{ fontSize: 9, padding: '0 3px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 3 }}>+</kbd>
          <kbd style={{ fontSize: 9, padding: '0 3px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 3, marginLeft: 2 }}>−</kbd>
          <kbd style={{ fontSize: 9, padding: '0 3px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 3, marginLeft: 2 }}>0</kbd>
          <span style={{ marginLeft: 4 }}>zoom</span>
        </span>
        <button onClick={() => zoom(1 / 1.25)} style={zoomBtnStyle}>−</button>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-2)', minWidth: 38, textAlign: 'center' }}>{zoomPct}%</span>
        <button onClick={() => zoom(1.25)} style={zoomBtnStyle}>+</button>
        <button onClick={fitToScreen} style={{ ...zoomBtnStyle, padding: '2px 8px', fontSize: 10 }}>⊡ Fit</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
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
        <div ref={scrollRef} className="swim-scroll" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}>
          <div style={{ position: 'relative', width: totalWidth, height: AGENT_ORDER.length * LANE_H }}>
            {/* Lane backgrounds */}
            {AGENT_ORDER.map((agentId, i) => (
              <div key={agentId} style={{
                position: 'absolute', left: 0, right: 0,
                top: i * LANE_H, height: LANE_H,
                background: i % 2 === 0 ? 'transparent' : 'oklch(0 0 0 / 0.03)',
                borderBottom: '1px solid var(--border-s)',
              }} />
            ))}

            {/* Dependency connectors — rendered below cards */}
            <Connectors stepsArr={stepsArr} steps={steps} pxPerSec={pxPerSec} elapsedT={elapsedT} />

            {/* Time cursor */}
            <div style={{
              position: 'absolute', left: cursorX, top: 0, bottom: 0,
              width: 1.5, background: 'var(--accent)', opacity: 0.6, pointerEvents: 'none',
            }} />

            {/* Step cards */}
            {stepsArr.map(step => {
              const laneIdx = AGENT_ORDER.indexOf(step.agent);
              if (laneIdx < 0) return null;
              return (
                <StepCard
                  key={step.id}
                  step={step}
                  laneIndex={laneIdx}
                  pxPerSec={pxPerSec}
                  elapsedT={elapsedT}
                  onClick={() => setSelectedStepId(step.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
