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

    @keyframes spl-prompt-pulse {
      0%, 100% { opacity: 0.85; }
      50%       { opacity: 0.20; }
    }
    .spl-prompt-pulse { animation: spl-prompt-pulse 1.8s ease-in-out infinite; }

    @keyframes spl-bg-breathe {
      0%, 100% { opacity: 0.55; }
      50%       { opacity: 1; }
    }
    .spl-bg-glow { animation: spl-bg-breathe 3s ease-in-out infinite; }
  `];

  SPECIALISTS.forEach((id, i) => {
    const { code } = AGENTS[id];
    const ring  = RINGS[i % 3];
    const start = (i / SPECIALISTS.length) * 360;
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

function ChatBubbleLogo({ large = false }: { large?: boolean }) {
  const size = large ? 110 : 80;
  const r    = large ? 48  : 34;
  const cy   = large ? 8   : 6;
  const dotR = large ? 5.5 : 4;
  const iconSize = large ? 42 : 30;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none"
           style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r}
                stroke="var(--accent)" strokeWidth="1.5" strokeOpacity={large ? 0.5 : 0.4} />
        <g style={{ transformOrigin: `${size / 2}px ${size / 2}px`, animation: 'spl-logo-spin 2.4s linear infinite' }}>
          <circle cx={size / 2} cy={cy} r={dotR} fill="var(--accent)" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
             style={{ color: 'var(--accent)', filter: large ? 'drop-shadow(0 0 8px oklch(0.72 0.17 162 / 0.5))' : 'none' }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// Phase flow:
//   enter → orbit → converge → prompt  ← waits here for user click
//   (click during enter/orbit/converge) → jumps to prompt
//   (click during prompt)               → exit → onComplete
type Phase = 'enter' | 'orbit' | 'converge' | 'prompt' | 'exit';

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('enter');

  // Auto-advance through animation; park at 'prompt' and wait for user
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('orbit'),    350),
      setTimeout(() => setPhase('converge'), 3000),
      setTimeout(() => setPhase('prompt'),   4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  function handleClick() {
    if (phase === 'prompt') {
      // User pressed the button — enter the app
      setPhase('exit');
      setTimeout(onComplete, 450);
    } else {
      // Skip the animation, jump straight to the prompt screen
      setPhase('prompt');
    }
  }

  const isOrbiting   = phase === 'orbit';
  const isConverging = phase === 'converge';
  const isShrinking  = isConverging || phase === 'prompt' || phase === 'exit';
  const isPrompt     = phase === 'prompt';
  const showLogo     = phase === 'prompt' || phase === 'exit';

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
        opacity: phase === 'exit' ? 0 : 1,
        transition: phase === 'exit' ? 'opacity 0.45s ease' : undefined,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <style>{SPLASH_CSS}</style>

      {/* Soft ambient background glow — visible only during orbit */}
      <div className="spl-bg-glow" style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 55% at 50% 50%, oklch(0.72 0.17 162 / 0.04) 0%, transparent 70%)',
        opacity: isOrbiting ? 0.55 : 0,
        transition: 'opacity 1.2s ease',
        pointerEvents: 'none',
      }} />

      {/* ── Orbit stage (hidden on prompt screen, replaced by large logo below) ── */}
      <div style={{
        position: 'relative', width: 320, height: 320, flexShrink: 0,
        opacity: isPrompt ? 0 : 1,
        transform: isPrompt ? 'scale(0.85)' : 'scale(1)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        pointerEvents: 'none',
      }}>

        {/* Orbit ring guides */}
        {RINGS.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: ring.radius * 2, height: ring.radius * 2,
            marginLeft: -ring.radius, marginTop: -ring.radius,
            borderRadius: '50%',
            border: '1px solid oklch(0.26 0.01 245)',
            opacity: isOrbiting ? 0.55 : 0,
            transition: isOrbiting ? 'opacity 1s ease' : 'opacity 0.5s ease',
          }} />
        ))}

        {/* Agent dots — outer keeps orbiting, inner scales to 0 during convergence */}
        {SPECIALISTS.map((id, i) => {
          const ag      = AGENTS[id];
          const stagger = `${i * 0.05}s`;
          return (
            <div
              key={id}
              className={`spl-dot-${ag.code}`}
              style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}
            >
              <div style={{
                width: 34, height: 34,
                marginLeft: -17, marginTop: -17,
                borderRadius: '50%',
                background: `${ag.rawColor}1a`,
                border: `2px solid ${ag.rawColor}`,
                // Glow trail — more visible during converge for cinematic effect
                boxShadow: isOrbiting
                  ? `0 0 8px 2px ${ag.rawColor}55`
                  : isConverging
                    ? `0 0 14px 4px ${ag.rawColor}80`
                    : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700,
                color: ag.rawColor,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                transform: isShrinking ? 'scale(0)' : (isOrbiting ? 'scale(1)' : 'scale(0)'),
                opacity: isOrbiting ? 1 : 0,
                transition: isShrinking
                  ? `transform 0.55s cubic-bezier(0.55,0.06,0.68,0.19) ${stagger}, opacity 0.25s ease ${stagger}, box-shadow 0.3s ease`
                  : isOrbiting
                    ? 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease, box-shadow 0.5s ease'
                    : 'none',
                willChange: 'transform, opacity',
              }}>
                {ag.code}
              </div>
            </div>
          );
        })}

        {/* Central PLN node */}
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
            zIndex: 2,
            transform: isOrbiting ? 'scale(1)' : 'scale(0.5)',
            opacity: isOrbiting ? 1 : 0,
            transition: 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: AGENTS.planner.rawColor, fontFamily: 'var(--font-mono)' }}>PLN</span>
          <span style={{ fontSize: 7, color: `${AGENTS.planner.rawColor}88`, fontFamily: 'var(--font-mono)' }}>Planner</span>
        </div>
      </div>

      {/* ── Prompt screen — replaces the orbit stage ── */}
      <div style={{
        position: 'absolute',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 28,
        opacity: showLogo ? 1 : 0,
        transform: showLogo ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        <ChatBubbleLogo large />

        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            Autopilot S&amp;OP
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            SHIMANO APAC · 12-AGENT PLANNING SYSTEM
          </div>
        </div>

        {/* Blinking "press to start" prompt */}
        <div className="spl-prompt-pulse" style={{
          marginTop: 16,
          fontSize: 11, fontWeight: 600,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.18em',
        }}>
          CLICK TO ENTER
        </div>
      </div>

      {/* Skip hint — only during orbit */}
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
