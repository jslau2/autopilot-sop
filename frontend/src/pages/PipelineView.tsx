import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardContext } from '../context/DashboardContext';
import { useSimulation } from '../hooks/useSimulation';
import { useLiveSession } from '../hooks/useLiveSession';
import Sidebar from '../components/Sidebar';
import Swimlane from '../components/Swimlane';
import Timeline from '../components/Timeline';
import Drawer from '../components/Drawer';
import EventStream from '../components/EventStream';
import TourOverlay from '../components/TourOverlay';
import QuestionModal from '../components/QuestionModal';
import CapacityConfigModal from '../components/CapacityConfigModal';
import type { KPIs } from '../types';

function KPIBar({ kpis }: { kpis: KPIs }) {
  const cells = [
    { lbl: 'OTIF Forecast', val: kpis.otif, good: kpis.otif === '97.8%', sub: 'target ≥ 98%' },
    { lbl: 'Forecast Accuracy', val: kpis.forecastAcc, good: true, sub: 'MAPE at SKU×wk' },
    { lbl: 'Capacity Util.', val: kpis.capacityUtil, warn: kpis.capacityUtil === '87%', sub: 'avg all lines' },
    { lbl: 'Weeks of Supply', val: kpis.wos ? kpis.wos + ' wk' : null, good: true, sub: 'target 4–5 wk' },
    { lbl: 'Plan Δ EBIT', val: kpis.planDelta != null ? `+$${kpis.planDelta}k` : null, good: (kpis.planDelta ?? 0) > 0, sub: 'vs unconstrained' },
  ];
  return (
    <div className="kpi-bar">
      {cells.map((c, i) => (
        <div key={i} className="kpi-cell">
          <span className="kpi-lbl">{c.lbl}</span>
          <span className={`kpi-val${!c.val ? ' kpi-computing' : c.good ? ' kpi-good' : c.warn ? ' kpi-warn' : ''}`}>
            {c.val ?? '—'}
          </span>
          <span className="kpi-sub">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

export default function PipelineView() {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'swimlane' | 'timeline'>('swimlane');
  const [activeSessionId, setActiveSessionId] = useState('sess-001');
  const [showConfig, setShowConfig] = useState(false);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('sop-tour-done'));
  const closeTour = () => { localStorage.setItem('sop-tour-done', '1'); setShowTour(false); };

  const demoMode = localStorage.getItem('sop-demo-mode') !== 'false';

  // Both hooks always called (Rules of Hooks). Live session gates on !demoMode.
  const simResult  = useSimulation(demoMode ? 0.5 : 0);
  const liveResult = useLiveSession(!demoMode);
  const { S, answerQuestion, terminateSession, setManualPause } = demoMode ? simResult : liveResult;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 't' || e.key === 'T') setViewMode(v => v === 'swimlane' ? 'timeline' : 'swimlane');
      if (e.key === 'Escape') setSelectedStepId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const statusLabel = S.sessionStatus === 'done' ? 'Complete'
    : S.paused ? '⏸ Decision Required'
    : S.manualPause ? '⏸ Paused'
    : '● Running';
  const statusClass = S.sessionStatus === 'done' ? 'sp-done'
    : (S.paused || S.manualPause) ? 'sp-paused'
    : 'sp-running';

  const stepsArr = Object.values(S.steps);

  const ctxValue = {
    steps: S.steps,
    stepsArr,
    events: S.events,
    elapsedT: S.elapsedT,
    pendingQuestion: S.pendingQuestion,
    sessionStatus: S.sessionStatus,
    selectedStepId,
    setSelectedStepId,
    viewMode,
    setViewMode,
    activeSessionId,
    setActiveSessionId,
    kpis: S.kpis,
    paused: S.paused,
    manualPause: S.manualPause,
    setManualPause,
    answerQuestion,
    terminateSession,
    showTour,
    setShowTour,
  };

  return (
    <DashboardContext.Provider value={ctxValue}>
      <div className="app">
        <Sidebar />
        <div className="main-area">
          <div className="main-toolbar">
            <div className="toolbar-goal">
              <em className="goal-text">Q3-2026 S&amp;OP · APAC Manufacturing · OTIF ≥ 98% · Margin ≥ 22% · 847 SKUs</em>
            </div>
            <div className="toolbar-right">
              <Link
                to="/"
                title="Toggle demo/live mode on the Home page"
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                  background: demoMode ? 'oklch(0.45 0.12 145 / 0.2)' : 'oklch(0.55 0.18 260 / 0.2)',
                  color: demoMode ? 'oklch(0.75 0.18 145)' : 'oklch(0.75 0.18 260)',
                  border: `1px solid ${demoMode ? 'oklch(0.45 0.12 145 / 0.4)' : 'oklch(0.55 0.18 260 / 0.4)'}`,
                  textDecoration: 'none', letterSpacing: '0.04em',
                }}
              >
                {demoMode ? 'DEMO' : 'LIVE'}
              </Link>
              <button
                className={`view-btn${viewMode === 'swimlane' ? ' is-active' : ''}`}
                onClick={() => setViewMode('swimlane')}
              >Swimlane</button>
              <button
                className={`view-btn${viewMode === 'timeline' ? ' is-active' : ''}`}
                onClick={() => setViewMode('timeline')}
              >Timeline <span className="key-hint">T</span></button>
              {!S.done && !S.paused && (
                <button
                  className="view-btn"
                  onClick={() => setManualPause(!S.manualPause)}
                  style={{ color: S.manualPause ? 'var(--success)' : 'var(--text-2)' }}
                >
                  {S.manualPause ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}
              <Link to="/console" className="cfg-toolbar-btn">⊞ Agent Console</Link>
              <Link to="/settings" className="cfg-toolbar-btn">⚙ Agent Settings</Link>
              <Link to="/manager" className="cfg-toolbar-btn">📊 Agent Manager</Link>
              <Link to="/" className="cfg-toolbar-btn">⌂ Home</Link>
              <button className="cfg-toolbar-btn" onClick={() => setShowConfig(true)}>⚙ Capacity Config</button>
              <button
                className="tour-help-btn"
                onClick={() => setShowTour(true)}
                style={{ width: 'auto', padding: '4px 10px', borderRadius: 5, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >↺ Tour</button>
              <div className={`status-pill ${statusClass}`}>{statusLabel}</div>
              <span className="elapsed-time mono">{S.elapsedT.toFixed(1)}s</span>
            </div>
          </div>

          <KPIBar kpis={S.kpis} />

          <div className="main-graph">
            {viewMode === 'swimlane' ? <Swimlane /> : <Timeline />}
          </div>

          <EventStream />
        </div>

        {selectedStepId && (
          <Drawer stepId={selectedStepId} onClose={() => setSelectedStepId(null)} />
        )}
        {S.pendingQuestion && (
          <QuestionModal
            question={S.pendingQuestion}
            onAnswer={answerQuestion}
            onTerminate={terminateSession}
          />
        )}
        {showConfig && <CapacityConfigModal onClose={() => setShowConfig(false)} />}
        {showTour && <TourOverlay onClose={closeTour} />}
      </div>
    </DashboardContext.Provider>
  );
}
