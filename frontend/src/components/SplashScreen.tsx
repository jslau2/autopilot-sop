import { useState, useEffect } from 'react';
import { AGENTS, AGENT_ORDER } from '../data/agents';

interface Props {
  onComplete: () => void;
}

const SPECIALISTS = AGENT_ORDER.filter(id => id !== 'planner');

const RINGS = [
  { radius: 72,  period: 4500 },
  { radius: 104, period: 3500 },
  { radius: 136, period: 2800 },
];

// Per-agent orbit keyframes + shared animations — computed once at module load
const SPLASH_CSS = (() => {
  const pieces: string[] = [`
    @keyframes spl-logo-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes spl-planner-pulse {
      0%, 100% { box-shadow: 0 0 14px 4px oklch(0.80 0.16 78 / 0.20); }
      50%       { box-shadow: 0 0 28px 10px oklch(0.80 0.16 78 / 0.45); }
    }
    .spl-planner-pulse { animation: spl-planner-pulse 2.2s ease-in-out infinite; }
  `];

  SPECIALISTS.forEach((id, i) => {
    const { code } = AGENTS[id];
    const ring  = RINGS[i % 3];
    const start = (i / SPECIALISTS.length) * 360;
    // Negative delay fast-forwards to the correct starting angle
    const delay = -(start / 360) * ring.period;
    pieces.push(`
      @keyframes spl-orbit-${code} {
        from { transform: rotate(0deg)   translateX(${ring.radius}px) rotate(0deg); }
        to   { transform: rotate(360deg) translateX(${ring.radius}px) rotate(-360deg); }
      }
      .spl-dot-${code} {
        animation: spl-orbit-${code} ${ring.period}ms linear infinite;
        animation-delay: ${delay}ms;
      }
    `);
  });

  return pieces.join('\n');
})();

// Chat bubble with an orbit ring — the splash finale
function ChatBubbleLogo() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80 }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none"
           style={{ position: 'absolute', inset: 0 }}>
        {/* Static orbit ring */}
        <circle cx="40" cy="40" r="34"
                stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.4" />
        {/* Spinning dot — rotates around the ring center */}
        <g style={{ transformOrigin: '40px 40px', animation: 'spl-logo-spin 2.4s linear infinite' }}>
          <circle cx="40" cy="6" r="4" fill="var(--accent)" />
        </g>
      </svg>
      {/* Chat bubble icon, centered over the ring */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
             style={{ color: 'var(--accent)' }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

type Phase = 'enter' | 'orbit' | 'fade' | 'logo' | 'exit';

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('enter');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('orbit'),  350),   // agents + PLN spring in
      setTimeout(() => setPhase('fade'),   2900),   // dots start spiralling inward
      setTimeout(() => setPhase('logo'),   4100),   // chat bubble emerges
      setTimeout(() => setPhase('exit'),   4900),   // overlay fades out
      setTimeout(onComplete,               5400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  function skip() {
    setPhase('exit');
    setTimeout(onComplete, 400);
  }

  const isOrbiting  = phase === 'orbit';
  const isShrinking = phase === 'fade' || phase === 'logo' || phase === 'exit';
  const showLogo    = phase === 'logo' || phase === 'exit';
  const textVisible = isOrbiting || phase === 'fade';

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
        opacity: phase === 'exit' ? 0 : 1,
        transition: phase === 'exit' ? 'opacity 0.5s ease' : undefined,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <style>{SPLASH_CSS}</style>

      {/* 320×320 stage */}
      <div style={{ position: 'relative', width: 320, height: 320, flexShrink: 0 }}>

        {/* Decorative orbit ring guides — fade out when dots start converging */}
        {RINGS.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: ring.radius * 2, height: ring.radius * 2,
            marginLeft: -ring.radius, marginTop: -ring.radius,
            borderRadius: '50%',
            border: '1px solid oklch(0.26 0.01 245)',
            opacity: isOrbiting ? 0.55 : 0,
            transition: isOrbiting ? 'opacity 1s ease' : 'opacity 0.5s ease',
            pointerEvents: 'none',
          }} />
        ))}

        {/*
          Two-layer agent dots:
          · Outer div  — zero-size orbit anchor; CSS animation runs continuously
          · Inner div  — visible dot; scale(0) during convergence
          Because the outer keeps orbiting while the inner shrinks, the dot
          physically travels toward center as it disappears — seamless spiral-in.
        */}
        {SPECIALISTS.map((id, i) => {
          const ag = AGENTS[id];
          const stagger = `${i * 0.05}s`;
          return (
            <div
              key={id}
              className={`spl-dot-${ag.code}`}
              style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}
            >
              <div style={{
                width: 34, height: 34,
                marginLeft: -17, marginTop: -17,
                borderRadius: '50%',
                background: `${ag.rawColor}1a`,
                border: `2px solid ${ag.rawColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700,
                color: ag.rawColor,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                // Dots spring in when orbiting, spiral-shrink when converging
                transform: isShrinking ? 'scale(0)' : (isOrbiting ? 'scale(1)' : 'scale(0)'),
                opacity: isOrbiting ? 1 : 0,
                transition: isShrinking
                  ? `transform 0.55s cubic-bezier(0.55,0.06,0.68,0.19) ${stagger}, opacity 0.25s ease ${stagger}`
                  : isOrbiting
                    ? 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease'
                    : 'none',
                willChange: 'transform, opacity',
              }}>
                {ag.code}
              </div>
            </div>
          );
        })}

        {/* Central Planner node — pulses while agents orbit, fades when they converge */}
        <div
          className={isOrbiting ? 'spl-planner-pulse' : ''}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 68, height: 68, marginLeft: -34, marginTop: -34,
            borderRadius: '50%',
            background: `${AGENTS.planner.rawColor}14`,
            border: `2.5px solid ${AGENTS.planner.rawColor}`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            zIndex: 2, pointerEvents: 'none',
            transform: isOrbiting ? 'scale(1)' : 'scale(0.5)',
            opacity: isOrbiting ? 1 : 0,
            transition: 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: AGENTS.planner.rawColor, fontFamily: 'var(--font-mono)' }}>PLN</span>
          <span style={{ fontSize: 7, color: `${AGENTS.planner.rawColor}88`, fontFamily: 'var(--font-mono)' }}>Planner</span>
        </div>

        {/* Chat bubble finale — springs in after dots converge */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          marginLeft: -40, marginTop: -40,
          zIndex: 3, pointerEvents: 'none',
          transform: showLogo ? 'scale(1)' : 'scale(0.2)',
          opacity: showLogo ? 1 : 0,
          transition: 'transform 0.65s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
        }}>
          <ChatBubbleLogo />
        </div>
      </div>

      {/* Wordmark — visible while agents orbit and converge */}
      <div style={{
        marginTop: 32,
        opacity: textVisible ? 1 : 0,
        transform: textVisible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.55s ease, transform 0.55s ease',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Autopilot S&amp;OP
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          SHIMANO APAC · 12-AGENT PLANNING SYSTEM
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 28,
        fontSize: 10, color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
        opacity: isOrbiting ? 0.4 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
      }}>
        CLICK TO SKIP
      </div>
    </div>
  );
}
