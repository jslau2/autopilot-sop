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

// Build per-agent orbit keyframes + logo spin keyframe
const SPLASH_CSS = (() => {
  const pieces: string[] = [`
    @keyframes spl-logo-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spl-logo-arm {
      transform-origin: 36px 36px;
      animation: spl-logo-spin 2.4s linear infinite;
    }
    @keyframes spl-planner-pulse {
      0%, 100% { box-shadow: 0 0 14px 4px oklch(0.80 0.16 78 / 0.20); }
      50%       { box-shadow: 0 0 28px 10px oklch(0.80 0.16 78 / 0.45); }
    }
    .spl-planner-pulse {
      animation: spl-planner-pulse 2.2s ease-in-out infinite;
    }
  `];

  SPECIALISTS.forEach((id, i) => {
    const { code } = AGENTS[id];
    const ring   = RINGS[i % 3];
    const start  = (i / SPECIALISTS.length) * 360;
    const delay  = -(start / 360) * ring.period;
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

function OrbitLogo() {
  return (
    <div style={{ position: 'relative', width: 72, height: 72 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none"
           style={{ position: 'absolute', inset: 0 }}>
        <circle cx="36" cy="36" r="28"
                stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.45" />
        <g className="spl-logo-arm">
          <circle cx="36" cy="8" r="3.5" fill="var(--accent)" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             style={{ color: 'var(--accent)' }}>
          <rect x="3"  y="14" width="4" height="7"  rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="9"  width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="17" y="4"  width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5"
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
      setTimeout(() => setPhase('orbit'),  350),
      setTimeout(() => setPhase('fade'),   2900),
      setTimeout(() => setPhase('logo'),   3700),
      setTimeout(() => setPhase('exit'),   4500),
      setTimeout(onComplete,               5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  function skip() {
    setPhase('exit');
    setTimeout(onComplete, 400);
  }

  const isOrbiting   = phase === 'orbit';
  const isFading     = phase === 'fade';
  const showLogo     = phase === 'logo' || phase === 'exit';
  const showPlanner  = phase === 'enter' || phase === 'orbit' || phase === 'fade';
  const textVisible  = isOrbiting || isFading;

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
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <style>{SPLASH_CSS}</style>

      {/* Orbital stage ─ 320×320 canvas */}
      <div style={{ position: 'relative', width: 320, height: 320, flexShrink: 0 }}>

        {/* Decorative ring guides */}
        {RINGS.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: ring.radius * 2, height: ring.radius * 2,
            marginLeft: -ring.radius, marginTop: -ring.radius,
            borderRadius: '50%',
            border: '1px solid oklch(0.26 0.01 245)',
            opacity: isOrbiting ? 0.55 : 0,
            transition: isOrbiting ? 'opacity 1s ease' : 'opacity 0.4s ease',
            pointerEvents: 'none',
          }} />
        ))}

        {/* Agent satellite dots */}
        {SPECIALISTS.map((id, i) => {
          const ag = AGENTS[id];
          return (
            <div
              key={id}
              className={`spl-dot-${ag.code}`}
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: 34, height: 34, marginLeft: -17, marginTop: -17,
                borderRadius: '50%',
                background: `${ag.rawColor}1a`,
                border: `2px solid ${ag.rawColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700,
                color: ag.rawColor,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                opacity: isOrbiting ? 1 : 0,
                transition: isOrbiting
                  ? 'opacity 0.6s ease'
                  : isFading
                    ? `opacity ${0.1 + i * 0.055}s ease`
                    : 'opacity 0.1s ease',
                willChange: 'transform',
                pointerEvents: 'none',
              }}
            >
              {ag.code}
            </div>
          );
        })}

        {/* Central Planner node */}
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
            transform: showPlanner ? 'scale(1)' : 'scale(0.5)',
            opacity: showPlanner ? (isFading ? 0.35 : 1) : 0,
            transition: 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: AGENTS.planner.rawColor, fontFamily: 'var(--font-mono)' }}>PLN</span>
          <span style={{ fontSize: 7, color: `${AGENTS.planner.rawColor}88`, fontFamily: 'var(--font-mono)' }}>Planner</span>
        </div>

        {/* Finale: orbit logo */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          marginLeft: -36, marginTop: -36,
          zIndex: 3, pointerEvents: 'none',
          transform: showLogo ? 'scale(1)' : 'scale(0.25)',
          opacity: showLogo ? 1 : 0,
          transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
        }}>
          <OrbitLogo />
        </div>
      </div>

      {/* Wordmark */}
      <div style={{
        marginTop: 32,
        opacity: textVisible ? 1 : 0,
        transform: textVisible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.55s ease, transform 0.55s ease',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Autopilot S&amp;OP
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          SHIMANO APAC · 12-AGENT PLANNING SYSTEM
        </div>
      </div>

      {/* Skip hint */}
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
