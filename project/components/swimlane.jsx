// components/swimlane.jsx
const { useRef, useEffect, useMemo } = React;

const LABEL_W  = 178;
const RULER_H  = 30;
const CARD_PAD = 10;

/* ── Inject icon styles once ──────────────────────────────── */
const AGI_CSS = `
  .agi{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:44px;padding:2px 0}
  .agi svg{overflow:visible}
  .agi-running svg{filter:drop-shadow(0 0 7px var(--agi-clr))}
  .agi-paused  svg{filter:drop-shadow(0 0 5px #f5c842)}
  .agi-arc-spin{animation:agi-spin 1.8s linear infinite}
  @keyframes agi-spin{from{transform:rotate(-90deg)}to{transform:rotate(270deg)}}
  .agi-bob{animation:agi-bob 1.3s ease-in-out infinite}
  @keyframes agi-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  .agi-tilt{transform:rotate(-12deg);transform-origin:20px 20px}
  .agi-blink{animation:agi-blink 3.8s ease-in-out infinite}
  @keyframes agi-blink{0%,44%,58%,100%{transform:scaleY(1)}51%{transform:scaleY(0.07)}}
  .agi-orbit{animation:agi-orbit 2.2s linear infinite;transform-origin:20px 20px}
  @keyframes agi-orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  .agi-orbit2{animation:agi-orbit 3.4s linear infinite reverse;transform-origin:20px 20px}
  .agi-lbl{font-size:7px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--agi-clr);opacity:.5}
  .agi-running .agi-lbl{opacity:1}
  .agi-paused  .agi-lbl{color:#f5c842!important;opacity:1}
  .agi-done    .agi-lbl{opacity:.4}
`;

/* ── Agent bobble-head status icon ────────────────────────── */
function AgentStatusIcon({ color, status }) {
  const isLive   = status === 'running';
  const isPaused = status === 'paused';
  const isDone   = status === 'done';
  const isIdle   = !isLive && !isPaused && !isDone;

  const arcDash    = isLive ? '22 92' : isPaused ? '32 82' : '7 107';
  const arcOpacity = isLive ? 0.9 : isPaused ? 0.55 : 0.18;
  const headStroke = isLive ? 1.8 : isPaused ? 1.4 : 0.9;
  const headOpacity = isLive ? 1 : isPaused ? 0.9 : 0.45;
  const eyeRy      = isIdle ? 0.7 : 2;
  const lbl = isLive ? 'Live' : isPaused ? 'Paused' : isDone ? 'Done' : 'Idle';

  return (
    <div className={`agi agi-${status || 'idle'}`} style={{ '--agi-clr': color }}>
      <svg viewBox="0 0 40 40" width="36" height="36">

        {/* Outer track ring */}
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--agi-clr)" strokeWidth="1" opacity="0.12"/>

        {/* Spinning arc */}
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--agi-clr)" strokeWidth="2"
          strokeDasharray={arcDash} strokeLinecap="round" opacity={arcOpacity}
          className={isLive ? 'agi-arc-spin' : ''}
          style={{ transformOrigin:'20px 20px', transform:'rotate(-90deg)' }}/>

        {/* Orbiting thought dots (Live) */}
        {isLive && (<>
          <g className="agi-orbit">
            <circle cx="20" cy="3.5" r="1.8" fill="var(--agi-clr)" opacity="0.85"/>
          </g>
          <g className="agi-orbit2">
            <circle cx="20" cy="3.5" r="1.1" fill="var(--agi-clr)" opacity="0.5"/>
          </g>
        </>)}

        {/* Bobble head */}
        <g className={isLive ? 'agi-bob' : isPaused ? 'agi-tilt' : ''}
           style={{ transformOrigin:'20px 20px' }}>

          {/* Head circle */}
          <circle cx="20" cy="20" r="12"
            fill="var(--bg-base,#0c0e1a)" stroke="var(--agi-clr)"
            strokeWidth={headStroke} opacity={headOpacity}/>

          {/* Eye ambient glow (Live) */}
          {isLive && (<>
            <circle cx="16" cy="18.5" r="3.5" fill="var(--agi-clr)" opacity="0.12"/>
            <circle cx="24" cy="18.5" r="3.5" fill="var(--agi-clr)" opacity="0.12"/>
          </>)}

          {/* Left eye */}
          <g className={isLive ? 'agi-blink' : ''} style={{ transformOrigin:'16px 18.5px' }}>
            <ellipse cx="16" cy="18.5" rx="2" ry={eyeRy}
              fill="var(--agi-clr)" opacity={isLive ? 1 : isPaused ? 0.95 : 0.35}/>
          </g>

          {/* Right eye */}
          <g className={isLive ? 'agi-blink' : ''} style={{ transformOrigin:'24px 18.5px' }}>
            <ellipse cx="24" cy="18.5" rx="2" ry={eyeRy}
              fill="var(--agi-clr)" opacity={isLive ? 1 : isPaused ? 0.95 : 0.35}/>
          </g>

          {/* Expression */}
          {isLive && (
            <path d="M15.5 24 Q20 27.5 24.5 24" fill="none"
              stroke="var(--agi-clr)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85"/>
          )}
          {isPaused && (<>
            <line x1="20" y1="24" x2="20" y2="27.5" stroke="#f5c842" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="20" cy="29.5" r="1" fill="#f5c842"/>
          </>)}
          {isDone && (
            <path d="M15.5 24 Q20 27.5 24.5 24" fill="none"
              stroke="var(--agi-clr)" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
          )}
          {isIdle && (
            <line x1="16" y1="25" x2="24" y2="25"
              stroke="var(--agi-clr)" strokeWidth="1.2" strokeLinecap="round" opacity="0.3"/>
          )}
        </g>
      </svg>
      <span className="agi-lbl">{lbl}</span>
    </div>
  );
}

function SwimlaneGraph({ pxPerSec, density }) {
  const ctx       = React.useContext(window.DashboardContext);
  const { stepsArr, elapsedT, selectedStepId, setSelectedStepId, tweaks } = ctx;
  const scrollRef = useRef(null);
  const agents    = window.AGENTS;
  const agentOrder = window.AGENT_ORDER;

  // Inject icon CSS once
  useEffect(() => {
    if (document.getElementById('__agi-css')) return;
    const s = document.createElement('style');
    s.id = '__agi-css';
    s.textContent = AGI_CSS;
    document.head.appendChild(s);
  }, []);

  // Per-agent live status
  const agentStatus = useMemo(() => {
    const m = {};
    agentOrder.forEach(id => { m[id] = 'idle'; });
    stepsArr.forEach(s => {
      if (s.status === 'running') m[s.agent] = 'running';
      else if (s.status === 'paused' && m[s.agent] !== 'running') m[s.agent] = 'paused';
      else if (s.status === 'done'   && m[s.agent] === 'idle')    m[s.agent] = 'done';
    });
    return m;
  }, [stepsArr]);

  const laneH = density === 'compact' ? 66 : density === 'spacious' ? 108 : 84;

  // Group steps by agent
  const byAgent = useMemo(() => {
    const m = {};
    agentOrder.forEach(id => { m[id] = []; });
    stepsArr.forEach(s => { if (m[s.agent]) m[s.agent].push(s); });
    return m;
  }, [stepsArr]);

  // Compute bounding box
  const maxT     = Math.max(elapsedT + 4, stepsArr.reduce((acc, s) => Math.max(acc, (s.endT || s.startT || 0) + 2), 12));
  const totalW   = maxT * pxPerSec + 120;
  const totalH   = agentOrder.length * laneH;

  // Step screen positions (x = left edge, mid = vertical centre)
  const pos = useMemo(() => {
    const p = {};
    stepsArr.forEach(s => {
      const laneIdx = agentOrder.indexOf(s.agent);
      if (laneIdx < 0) return;
      const x   = (s.startT || 0) * pxPerSec;
      const dur  = s.endT != null && s.startT != null ? s.endT - s.startT : null;
      const w    = Math.max(dur != null ? dur * pxPerSec : 100, 88);
      const midY = laneIdx * laneH + laneH / 2;
      p[s.id] = { x, w, midY, laneIdx };
    });
    return p;
  }, [stepsArr, pxPerSec, laneH]);

  // Connector beziers
  const connectors = useMemo(() => {
    if (tweaks.showConnectors === false) return [];
    const paths = [];
    stepsArr.forEach(s => {
      if (!s.deps || !pos[s.id]) return;
      s.deps.forEach(depId => {
        const src = pos[depId];
        const dst = pos[s.id];
        if (!src || !dst) return;
        const x1 = src.x + src.w;
        const y1 = src.midY;
        const x2 = dst.x;
        const y2 = dst.midY;
        const mx = (x1 + x2) / 2;
        paths.push({ x1, y1, x2, y2, mx, srcAgent: stepsArr.find(ss=>ss.id===depId)?.agent });
      });
    });
    return paths;
  }, [stepsArr, pos, tweaks.showConnectors]);

  // Time ticks
  const tickStep  = pxPerSec >= 60 ? 5 : 10;
  const ticks     = [];
  for (let t = 0; t <= maxT + tickStep; t += tickStep) ticks.push(t);

  // Auto-scroll to follow cursor
  useEffect(() => {
    if (!scrollRef.current) return;
    const cursorX = elapsedT * pxPerSec;
    const cw      = scrollRef.current.clientWidth;
    const target  = Math.max(0, cursorX - cw * 0.55);
    scrollRef.current.scrollLeft += (target - scrollRef.current.scrollLeft) * 0.12;
  });

  return (
    <div className="swimlane-root">
      {/* Fixed agent label column */}
      <div className="swim-labels" style={{ width: LABEL_W }}>
        <div style={{ height: RULER_H }} />
        {agentOrder.map(agentId => {
          const ag = agents[agentId];
          return (
            <div key={agentId} className="agent-label-row" style={{ height: laneH }}>
              <span className="agent-color-bar" style={{ background: ag.color }} />
              <AgentStatusIcon color={ag.color} status={agentStatus[agentId] || 'idle'} />
              <div className="agent-label-text">
                <span className="agent-label-name" style={{ color: ag.color }}>{ag.name}</span>
                <span className="agent-label-sub">{ag.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div className="swim-scroll" ref={scrollRef}>
        <div className="swim-inner" style={{ width: totalW, minHeight: totalH + RULER_H }}>

          {/* Time ruler */}
          <div className="swim-ruler" style={{ height: RULER_H }}>
            {ticks.map(t => (
              <div key={t} className="ruler-tick" style={{ left: t * pxPerSec }}>
                <span className="ruler-label">{t}s</span>
              </div>
            ))}
            {/* Playhead */}
            <div className="playhead" style={{ left: elapsedT * pxPerSec }} />
          </div>

          {/* Agent lanes */}
          {agentOrder.map((agentId, laneIdx) => {
            const ag    = agents[agentId];
            const steps = byAgent[agentId] || [];
            return (
              <div key={agentId} className="swim-lane" style={{ height: laneH }}>
                {/* Grid lines */}
                {ticks.map(t => (
                  <div key={t} className="lane-grid" style={{ left: t * pxPerSec }} />
                ))}
                {/* Step cards */}
                {steps.map(step => {
                  const p = pos[step.id];
                  if (!p) return null;
                  const cardH     = laneH - CARD_PAD * 2;
                  const isRunning = step.status === 'running';
                  const isPaused  = step.status === 'paused';
                  const isDone    = step.status === 'done';
                  const isSel     = step.id === selectedStepId;

                  return (
                    <div
                      key={step.id}
                      className={`step-card sc-${step.status}${isSel ? ' sc-selected' : ''}`}
                      style={{
                        left:   p.x,
                        top:    CARD_PAD,
                        width:  p.w,
                        height: cardH,
                        '--ac': ag.color,
                      }}
                      onClick={() => setSelectedStepId(isSel ? null : step.id)}
                      title={step.label}
                    >
                      <div className="sc-accent" />
                      <div className="sc-body">
                        <div className="sc-label">{step.label}</div>
                        {tweaks.showMetrics !== false && step.metrics && (
                          <div className="sc-metrics">
                            {Object.values(step.metrics).slice(0, 2).map((v, i) => (
                              <span key={i} className="sc-chip">{v}</span>
                            ))}
                          </div>
                        )}
                        {step.tokens > 0 && (
                          <div className="sc-tokens">{step.tokens.toLocaleString()} tok</div>
                        )}
                      </div>
                      {isPaused && <div className="sc-pause-icon">?</div>}
                      {isRunning && <div className="sc-spin" />}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* SVG connector overlay */}
          <svg
            className="connectors-svg"
            style={{ top: RULER_H, height: totalH }}
          >
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--border)" />
              </marker>
            </defs>
            {connectors.map((c, i) => {
              const agColor = c.srcAgent ? agents[c.srcAgent]?.color : 'var(--border)';
              return (
                <path
                  key={i}
                  d={`M${c.x1},${c.y1} C${c.mx},${c.y1} ${c.mx},${c.y2} ${c.x2},${c.y2}`}
                  fill="none"
                  stroke={agColor}
                  strokeWidth="1.2"
                  strokeOpacity="0.35"
                  strokeDasharray="5 3"
                />
              );
            })}
          </svg>

          {/* Current time cursor */}
          <div className="time-cursor" style={{ left: elapsedT * pxPerSec, height: totalH + RULER_H }} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SwimlaneGraph });
