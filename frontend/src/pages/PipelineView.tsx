import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { DashboardContext } from '../context/DashboardContext';
import { useSimulation } from '../hooks/useSimulation';
import { useLiveSession } from '../hooks/useLiveSession';
import { useLaunchCycle } from '../hooks/useLaunchCycle';
import Sidebar from '../components/Sidebar';
import Swimlane from '../components/Swimlane';
import Timeline from '../components/Timeline';
import Drawer from '../components/Drawer';
import EventStream from '../components/EventStream';
import TourOverlay from '../components/TourOverlay';
import QuestionModal from '../components/QuestionModal';
import CapacityConfigModal from '../components/CapacityConfigModal';
import ReportModal from '../components/ReportModal';
import ExecSummaryBanner from '../components/ExecSummaryBanner';
import DecisionLogModal from '../components/DecisionLogModal';
import ValueDashboardModal from '../components/ValueDashboardModal';
import WhatIfModal from '../components/WhatIfModal';
import ExplainModal from '../components/ExplainModal';
import ApprovalsModal from '../components/ApprovalsModal';
import UsageChip from '../components/UsageChip';
import LaunchConfig, { DEFAULT_GOAL } from '../components/LaunchConfig';
import DeleteCycleControl from '../components/DeleteCycleControl';
import KickoffBar from '../components/KickoffBar';
import AppShell from '../components/AppShell';
import type { KPIs } from '../types';

type SessionMeta = {
  session_id: string;
  name: string;
  goal: string;
  status: string;
  created_at: number;
  elapsed: number;
  kpis: Record<string, string | number | null>;
  step_count: number;
};

function relativeTime(epochSec: number): string {
  const secs = Math.max(0, Date.now() / 1000 - epochSec);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const isDemoMode = () => localStorage.getItem('sop-demo-mode') !== 'false';

// ---------------------------------------------------------------------------
// Router shell — decides between landing (no session) and a run view.
// ---------------------------------------------------------------------------
export default function PipelineView() {
  const { sessionId } = useParams();
  const demoMode = isDemoMode();

  if (!sessionId) {
    return <PipelineLanding demoMode={demoMode} />;
  }
  // key forces a clean remount (fresh hook state + reconnect) when switching.
  return <PipelineRun key={sessionId} sessionId={sessionId} demoMode={demoMode} />;
}

// ---------------------------------------------------------------------------
// Landing / empty state — the consistent entry point: nothing runs until the
// user clicks "+ New Cycle".
// ---------------------------------------------------------------------------
function PipelineLanding({ demoMode }: { demoMode: boolean }) {
  const navigate = useNavigate();
  const launch = useLaunchCycle();
  const [showLaunch, setShowLaunch] = useState(false);
  const [kickoffBrief, setKickoffBrief] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    if (demoMode) return;
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]));
  }, [demoMode]);

  const accent = demoMode ? 'oklch(0.55 0.18 145)' : 'oklch(0.55 0.18 260)';

  return (
    <AppShell active="cycle">
    <div style={{ minHeight: 'calc(100vh - 53px)', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 28 }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            No active planning cycle
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 8 }}>
            Start a new S&amp;OP cycle to dispatch the agent pipeline
            {demoMode ? ' as a scripted simulation.' : ', or resume one of your running sessions below.'}
          </p>
        </div>

        <button
          onClick={() => setShowLaunch(true)}
          style={{
            padding: '13px 28px', borderRadius: 9, fontSize: 15, fontWeight: 700,
            background: accent, color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: `0 4px 18px ${accent.replace(')', ' / 0.4)')}`,
          }}
        >+ New Cycle</button>

        <div style={{ width: '100%', maxWidth: 620 }}>
          <KickoffBar
            demoMode={demoMode}
            onDemoSeed={(brief) => { setKickoffBrief(brief); setShowLaunch(true); }}
          />
        </div>

        {!demoMode && sessions.length > 0 && (
          <div style={{ width: '100%', maxWidth: 620, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 10 }}>
              RECENT CYCLES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map(s => (
                <button
                  key={s.session_id}
                  onClick={() => navigate(`/pipeline/${s.session_id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    padding: '12px 16px', borderRadius: 9, cursor: 'pointer',
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: s.status === 'running' ? 'oklch(0.7 0.17 145)'
                      : s.status === 'paused' ? 'oklch(0.78 0.15 75)'
                      : 'var(--text-3)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name || s.session_id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {s.step_count} steps · {relativeTime(s.created_at)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    color: s.status === 'running' ? 'oklch(0.75 0.17 145)' : 'var(--text-3)',
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                  }}>{s.status}</span>
                  <DeleteCycleControl
                    sessionId={s.session_id}
                    name={s.name}
                    onDeleted={() => setSessions(prev => prev.filter(x => x.session_id !== s.session_id))}
                  />
                  <span style={{ color: 'var(--text-3)' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showLaunch && (
        <LaunchConfig
          demoMode={demoMode}
          initialGoal={kickoffBrief}
          onClose={() => { setShowLaunch(false); setKickoffBrief(undefined); }}
          onLaunch={(goal, name, entity) => { setShowLaunch(false); setKickoffBrief(undefined); launch(demoMode, goal, name, { entity }); }}
        />
      )}
    </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Session switcher dropdown (live mode) — lists sessions, navigates on select.
// ---------------------------------------------------------------------------
function SessionSwitcher({ current }: { current: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]));
  }, [open]);

  const currentMeta = sessions.find(s => s.session_id === current);
  const label = currentMeta?.name || `Cycle ${current.slice(0, 8)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="cfg-toolbar-btn"
        onClick={() => setOpen(o => !o)}
        style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title="Switch session"
      >
        ⇄ {label} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 100, width: 280,
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 9,
            boxShadow: '0 12px 32px oklch(0.04 0.01 250 / 0.55)', padding: 6,
            maxHeight: 360, overflowY: 'auto',
          }}>
            {sessions.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>No sessions</div>
            )}
            {sessions.map(s => (
              <button
                key={s.session_id}
                onClick={() => { setOpen(false); if (s.session_id !== current) navigate(`/pipeline/${s.session_id}`); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer', border: 'none',
                  background: s.session_id === current ? 'var(--bg-base)' : 'transparent',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: s.status === 'running' ? 'oklch(0.7 0.17 145)'
                    : s.status === 'paused' ? 'oklch(0.78 0.15 75)' : 'var(--text-3)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.name || s.session_id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{relativeTime(s.created_at)}</div>
                </div>
                {s.session_id === current && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>current</span>}
                <DeleteCycleControl
                  sessionId={s.session_id}
                  name={s.name}
                  onDeleted={() => {
                    setSessions(prev => prev.filter(x => x.session_id !== s.session_id));
                    if (s.session_id === current) { setOpen(false); navigate('/pipeline'); }
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KPIBar({ kpis, onExplain }: { kpis: KPIs; onExplain: (key: string) => void }) {
  const cells = [
    { key: 'otif', lbl: 'OTIF Forecast', val: kpis.otif, good: kpis.otif === '97.8%', sub: 'target ≥ 98%' },
    { key: 'forecastAcc', lbl: 'Forecast Accuracy', val: kpis.forecastAcc, good: true, sub: 'MAPE at SKU×wk' },
    { key: 'capacityUtil', lbl: 'Capacity Util.', val: kpis.capacityUtil, warn: kpis.capacityUtil === '87%', sub: 'avg all lines' },
    { key: 'wos', lbl: 'Weeks of Supply', val: kpis.wos ? kpis.wos + ' wk' : null, good: true, sub: 'target 4–5 wk' },
    { key: 'planDelta', lbl: 'Plan Δ EBIT', val: kpis.planDelta != null ? `+$${kpis.planDelta}k` : null, good: (kpis.planDelta ?? 0) > 0, sub: 'vs unconstrained' },
  ];
  return (
    <div className="kpi-bar">
      {cells.map((c, i) => (
        <div
          key={i}
          className="kpi-cell"
          onClick={() => onExplain(c.key)}
          title="Why? — trace this KPI to its agents & data"
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          <span className="kpi-lbl">{c.lbl} <span style={{ opacity: 0.5, fontWeight: 400 }}>ⓘ</span></span>
          <span className={`kpi-val${!c.val ? ' kpi-computing' : c.good ? ' kpi-good' : c.warn ? ' kpi-warn' : ''}`}>
            {c.val ?? '—'}
          </span>
          <span className="kpi-sub">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The actual run view — bound to a single session id.
// ---------------------------------------------------------------------------
function PipelineRun({ sessionId, demoMode }: { sessionId: string; demoMode: boolean }) {
  const location = useLocation();
  const launch = useLaunchCycle();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'swimlane' | 'timeline'>('swimlane');
  const [showConfig, setShowConfig] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [explainKey, setExplainKey] = useState<string | null>(null);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchSeed, setLaunchSeed] = useState<{ goal?: string; name?: string; parentId?: string; scenarioOf?: string; uploadId?: string } | null>(null);
  const [parentName, setParentName] = useState('');
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('sop-tour-done'));
  const closeTour = () => { localStorage.setItem('sop-tour-done', '1'); setShowTour(false); };
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('sop-focus-mode') === '1');
  const toggleFocus = () => setFocusMode(f => { localStorage.setItem('sop-focus-mode', f ? '0' : '1'); return !f; });

  // Resolve the cycle name + goal for the breadcrumb/report (nav state, then backend).
  const [cycleName, setCycleName] = useState<string>(
    () => (location.state as { name?: string } | null)?.name
      ?? (demoMode ? 'Demo Cycle' : `Cycle ${sessionId.slice(0, 8)}`)
  );
  const [cycleGoal, setCycleGoal] = useState<string>(
    () => (location.state as { goal?: string } | null)?.goal ?? (demoMode ? DEFAULT_GOAL : '')
  );
  useEffect(() => {
    if (demoMode) return;
    fetch(`/api/sessions/${sessionId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        if (d.name && !(location.state as { name?: string } | null)?.name) setCycleName(d.name);
        if (d.goal) setCycleGoal(d.goal);
        if (typeof d.parent_name === 'string') setParentName(d.parent_name);
      })
      .catch(() => { /* keep fallback */ });
  }, [demoMode, sessionId, location.state]);

  // Both hooks always called (Rules of Hooks). Live connects only when not demo.
  const simResult  = useSimulation(demoMode ? 0.5 : 0);
  const liveResult = useLiveSession(demoMode ? undefined : sessionId);
  const { S, answerQuestion, terminateSession, setManualPause, startSession } = demoMode ? simResult : liveResult;

  // Demo: kick off the scripted simulation once on mount.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (demoMode && !launchedRef.current) {
      launchedRef.current = true;
      const goal = (location.state as { goal?: string } | null)?.goal ?? DEFAULT_GOAL;
      startSession(goal);
    }
  }, [demoMode, startSession, location.state]);

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
    activeSessionId: sessionId,
    setActiveSessionId: () => {},
    demoMode,
    onNewCycle: (seed?: { goal?: string; name?: string; uploadId?: string }) => { setLaunchSeed(seed ?? null); setShowLaunch(true); },
    kpis: S.kpis,
    paused: S.paused,
    manualPause: S.manualPause,
    setManualPause,
    answerQuestion,
    terminateSession,
    showTour,
    setShowTour,
  };

  const inner = (
    <DashboardContext.Provider value={ctxValue}>
      <div className="app" style={{ height: focusMode ? '100vh' : 'calc(100vh - 53px)' }}>
        <Sidebar />
        <div className="main-area">
          <div className="main-toolbar">
            <div className="toolbar-goal" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
              <Link to="/" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Home</Link>
              <span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ color: 'var(--text-3)' }}>Cycle</span>
              <span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ color: 'var(--text-1)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{cycleName}</span>
              {parentName && (
                <span title={`What-if branch of ${parentName}`} style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>⎇ of {parentName}</span>
              )}
              <span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ color: 'var(--text-3)', textTransform: 'capitalize' }}>{viewMode}</span>
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
              {!demoMode && <SessionSwitcher current={sessionId} />}
              <button
                className={`view-btn${viewMode === 'swimlane' ? ' is-active' : ''}`}
                onClick={() => setViewMode('swimlane')}
              >Swimlane</button>
              <button
                className={`view-btn${viewMode === 'timeline' ? ' is-active' : ''}`}
                onClick={() => setViewMode('timeline')}
              >Timeline <span className="key-hint">T</span></button>
              {demoMode && !S.done && !S.paused && (
                <button
                  className="view-btn"
                  onClick={() => setManualPause(!S.manualPause)}
                  style={{ color: S.manualPause ? 'var(--success)' : 'var(--text-2)' }}
                >
                  {S.manualPause ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}
              <button className="cfg-toolbar-btn" onClick={() => setShowConfig(true)}>⚙ Capacity Config</button>
              <button className="cfg-toolbar-btn" onClick={() => setShowReport(true)} title="Export an executive report (Markdown / PDF)">⤓ Report</button>
              <button className="cfg-toolbar-btn" onClick={() => setShowDecisions(true)} title="Decision log / audit trail">🗒 Decisions</button>
              <button className="cfg-toolbar-btn" onClick={() => setShowValue(true)} title="ROI / value of this cycle">💰 Value</button>
              <button className="cfg-toolbar-btn" onClick={() => setShowApprovals(true)} title="Plan approvals / sign-off">✓ Approvals</button>
              <button
                className="cfg-toolbar-btn"
                title="What-if — branch this cycle with tweaked constraints"
                onClick={() => {
                  setLaunchSeed({ goal: cycleGoal, name: `${cycleName} (what-if)`, parentId: demoMode ? undefined : sessionId, scenarioOf: cycleName });
                  setShowLaunch(true);
                }}
              >⎇ What-if</button>
              <button className="cfg-toolbar-btn" onClick={() => setShowWhatIf(true)} title="Interactive what-if sliders — estimate KPIs live">🎚 Simulate</button>
              <Link
                className="cfg-toolbar-btn"
                to={demoMode ? '/compare' : `/compare?ids=${sessionId}`}
                title="Compare this cycle with others side-by-side"
                style={{ textDecoration: 'none' }}
              >⇄ Compare</Link>
              <button className="cfg-toolbar-btn" onClick={toggleFocus} title="Toggle distraction-free focus mode">
                {focusMode ? '⤡ Exit Focus' : '⤢ Focus'}
              </button>
              <button
                className="tour-help-btn"
                onClick={() => setShowTour(true)}
                style={{ width: 'auto', padding: '4px 10px', borderRadius: 5, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >↺ Tour</button>
              {!demoMode && <UsageChip sessionId={sessionId} active={S.sessionStatus !== 'done'} />}
              <div className={`status-pill ${statusClass}`}>{statusLabel}</div>
              <span className="elapsed-time mono">{S.elapsedT.toFixed(1)}s</span>
            </div>
          </div>

          <KPIBar kpis={S.kpis} onExplain={setExplainKey} />

          {S.sessionStatus === 'done' && (
            <ExecSummaryBanner
              S={S} name={cycleName} goal={cycleGoal}
              sessionId={demoMode ? undefined : sessionId} demoMode={demoMode}
            />
          )}

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
        {showReport && <ReportModal S={S} name={cycleName} goal={cycleGoal} sessionId={demoMode ? undefined : sessionId} demoMode={demoMode} onClose={() => setShowReport(false)} />}
        {showDecisions && <DecisionLogModal S={S} sessionId={demoMode ? undefined : sessionId} demoMode={demoMode} onClose={() => setShowDecisions(false)} />}
        {showValue && <ValueDashboardModal S={S} name={cycleName} onClose={() => setShowValue(false)} />}
        {explainKey && <ExplainModal S={S} kpiKey={explainKey} onClose={() => setExplainKey(null)} />}
        {showApprovals && <ApprovalsModal sessionId={demoMode ? undefined : sessionId} demoMode={demoMode} onClose={() => setShowApprovals(false)} />}
        {showWhatIf && (
          <WhatIfModal
            kpis={S.kpis}
            onClose={() => setShowWhatIf(false)}
            onBranch={(note) => {
              setShowWhatIf(false);
              setLaunchSeed({
                goal: `${cycleGoal}\n\n${note}`,
                name: `${cycleName} (what-if)`,
                parentId: demoMode ? undefined : sessionId,
                scenarioOf: cycleName,
              });
              setShowLaunch(true);
            }}
          />
        )}
        {showLaunch && (
          <LaunchConfig
            demoMode={demoMode}
            initialGoal={launchSeed?.goal}
            initialName={launchSeed?.name}
            scenarioOf={launchSeed?.scenarioOf}
            onClose={() => setShowLaunch(false)}
            onLaunch={(goal, name, entity) => { setShowLaunch(false); launch(demoMode, goal, name, { parentId: launchSeed?.parentId, entity, uploadId: launchSeed?.uploadId }); }}
          />
        )}
        {showTour && <TourOverlay onClose={closeTour} />}
      </div>
    </DashboardContext.Provider>
  );

  return focusMode ? inner : <AppShell active="cycle">{inner}</AppShell>;
}
