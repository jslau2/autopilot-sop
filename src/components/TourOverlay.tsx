import { useState, useEffect, useRef } from 'react';

const TOUR_STEPS = [
  {
    title: 'Welcome to Autopilot S&OP',
    desc: 'Your AI-powered Sales & Operations Planning co-pilot. Nine specialised agents work in parallel to generate your Q3 plan — forecasting demand, reconciling supply, allocating capacity, managing risk, and producing a financial sign-off. This tour takes about 90 seconds.',
    sel: null,
    pos: 'center',
  },
  {
    title: 'Projects & Sessions',
    desc: 'The left sidebar lets you switch planning entities (SPL & SBMB, China Region…), upload or connect your ERP data source, and browse past planning cycle sessions. Click any session to restore it.',
    sel: '.sidebar',
    pos: 'right',
  },
  {
    title: 'Session Goal & View Toggle',
    desc: 'The toolbar shows the active planning objective in full. Toggle between Swimlane (agents × time grid) and Timeline (chronological list) views here — or press T on your keyboard.',
    sel: '.main-toolbar',
    pos: 'bottom',
  },
  {
    title: 'Live KPI Bar',
    desc: 'Five headline KPIs populate automatically as agents complete their work. Watch OTIF, Forecast Accuracy, Capacity Utilisation, Weeks of Supply, and Plan ΔEBIT appear and update in real time during the pipeline run.',
    sel: '.kpi-bar',
    pos: 'bottom',
  },
  {
    title: 'Agent Swimlane',
    desc: 'The main view maps all agents on the Y axis and virtual time on the X axis. Each coloured card is a task. Cards glow while running, pulse amber when paused, and dim when complete. The vertical line is the current time cursor.',
    sel: '.main-graph',
    pos: 'top',
  },
  {
    title: 'Live Agent Icons',
    desc: "Each agent label shows a bobble-head status indicator — bouncing with orbiting dots when actively working, sleepy half-eyes when idle, and a tilted '!' face when waiting for your decision. Colours match each agent's role.",
    sel: '.swim-labels',
    pos: 'right',
  },
  {
    title: 'Event Stream',
    desc: "The feed at the bottom logs every agent action, inter-agent message, decision, and user input in real time — colour-coded by agent. It's the live narration of the pipeline as it executes.",
    sel: '.event-bar',
    pos: 'top',
  },
  {
    title: 'Capacity Config & Console',
    desc: '⚙ Capacity Config lets you pre-load known constraints before each run — maintenance windows, die-set availability, shift patterns, and a constraint register. ⊞ Agent Console opens a deep-dive view with per-agent task IDs, progress bars, and the inter-agent message bus.',
    sel: '.toolbar-right',
    pos: 'bottom',
  },
];

interface TourRect {
  top: number;
  left: number;
  w: number;
  h: number;
}

interface TourOverlayProps {
  onClose: () => void;
}

export default function TourOverlay({ onClose }: TourOverlayProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TourRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = TOUR_STEPS[step];
    if (!s.sel) { setRect(null); return; }
    const el = document.querySelector(s.sel);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, w: r.width, h: r.height });
  }, [step]);

  const cur = TOUR_STEPS[step];
  const total = TOUR_STEPS.length;
  const next = () => step < total - 1 ? setStep(s => s + 1) : onClose();
  const back = () => step > 0 && setStep(s => s - 1);

  const tipStyle = (() => {
    const TW = 310, PAD = 14;
    if (!rect || cur.pos === 'center') {
      return { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
    }
    const WW = window.innerWidth, WH = window.innerHeight;
    const safeLeft = (x: number) => Math.max(PAD, Math.min(WW - TW - PAD, x));
    if (cur.pos === 'bottom') return { position: 'fixed' as const, top: rect.top + rect.h + 16, left: safeLeft(rect.left + rect.w / 2 - TW / 2) };
    if (cur.pos === 'top') return { position: 'fixed' as const, bottom: WH - rect.top + 16, left: safeLeft(rect.left + rect.w / 2 - TW / 2) };
    if (cur.pos === 'right') return { position: 'fixed' as const, top: Math.max(PAD, rect.top + rect.h / 2 - 100), left: rect.left + rect.w + 16 };
    if (cur.pos === 'left') return { position: 'fixed' as const, top: Math.max(PAD, rect.top + rect.h / 2 - 100), right: WW - rect.left + 16 };
    return { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  })();

  return (
    <>
      <div className="tour-backdrop" onClick={onClose} />
      {rect && (
        <div
          className="tour-spot"
          style={{ top: rect.top - 5, left: rect.left - 5, width: rect.w + 10, height: rect.h + 10 }}
        />
      )}
      <div className="tour-tip" style={tipStyle} ref={tipRef}>
        <div className="tour-progress">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={`tour-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>
        <div className="tour-tip-badge">Step {step + 1} of {total}</div>
        <div className="tour-tip-title">{cur.title}</div>
        <p className="tour-tip-desc">{cur.desc}</p>
        <div className="tour-controls">
          <button className="tour-skip" onClick={onClose}>Skip tour</button>
          <span className="tour-spacer" />
          {step > 0 && <button className="tour-back" onClick={back}>← Back</button>}
          <button className="tour-next" onClick={next}>{step === total - 1 ? '✓ Done' : 'Next →'}</button>
        </div>
      </div>
    </>
  );
}
