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

// ─── Particles scattered across the background ───────────────────────────────
const PARTICLES = [
  { top: '12%', left: '8%',  size: 2, dur: '7s',  delay: '0s'  },
  { top: '22%', left: '78%', size: 2, dur: '11s', delay: '-3s' },
  { top: '38%', left: '92%', size: 3, dur: '9s',  delay: '-1s' },
  { top: '62%', left: '85%', size: 2, dur: '13s', delay: '-5s' },
  { top: '78%', left: '68%', size: 2, dur: '8s',  delay: '-2s' },
  { top: '88%', left: '20%', size: 3, dur: '14s', delay: '-7s' },
  { top: '72%', left: '5%',  size: 2, dur: '10s', delay: '-4s' },
  { top: '18%', left: '42%', size: 2, dur: '12s', delay: '-6s' },
  { top: '48%', left: '18%', size: 2, dur: '9s',  delay: '-8s' },
  { top: '32%', left: '55%', size: 2, dur: '15s', delay: '-9s' },
  { top: '55%', left: '48%', size: 3, dur: '11s', delay: '-2s' },
  { top: '8%',  left: '62%', size: 2, dur: '8s',  delay: '-1s' },
];

const SPLASH_CSS = (() => {
  const pieces: string[] = [`
    /* ── Shared logo spin ── */
    @keyframes spl-logo-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* ── PLN heartbeat ── */
    @keyframes spl-planner-pulse {
      0%, 100% { box-shadow: 0 0 14px 4px oklch(0.80 0.16 78 / 0.20); }
      50%       { box-shadow: 0 0 28px 10px oklch(0.80 0.16 78 / 0.45); }
    }
    .spl-planner-pulse { animation: spl-planner-pulse 2.2s ease-in-out infinite; }

    /* ── Press-to-start blink ── */
    @keyframes spl-prompt-blink {
      0%, 100% { opacity: 0.9; }
      50%       { opacity: 0.15; }
    }
    .spl-prompt-blink { animation: spl-prompt-blink 1.8s ease-in-out infinite; }

    /* ── PS5 background layers ── */

    /* Diagonal light ray A — primary sweep, cyan-green tinted */
    @keyframes spl-ray-a {
      0%, 100% { transform: rotate(-7deg) translateY(0);    opacity: 0.5; }
      50%       { transform: rotate(-3deg) translateY(-18px); opacity: 1.0; }
    }
    .spl-ray-a { animation: spl-ray-a 18s ease-in-out infinite; }

    /* Diagonal light ray B — secondary, blue-shifted */
    @keyframes spl-ray-b {
      0%, 100% { transform: rotate(4deg)  translateY(0);    opacity: 0.35; }
      50%       { transform: rotate(8deg)  translateY(14px); opacity: 0.75; }
    }
    .spl-ray-b { animation: spl-ray-b 24s ease-in-out infinite; animation-delay: -9s; }

    /* Diagonal light ray C — thin bright */
    @keyframes spl-ray-c {
      0%, 100% { transform: rotate(-14deg) translateY(0);   opacity: 0.25; }
      50%       { transform: rotate(-10deg) translateY(-8px); opacity: 0.60; }
    }
    .spl-ray-c { animation: spl-ray-c 20s ease-in-out infinite; animation-delay: -5s; }

    /* Nebula drift A — upper-left cluster */
    @keyframes spl-neb-a {
      0%, 100% { transform: translate(0, 0)       scale(1);    opacity: 0.8; }
      40%       { transform: translate(22px, -14px) scale(1.08); opacity: 1.0; }
      70%       { transform: translate(-12px, 16px) scale(0.96); opacity: 0.7; }
    }
    .spl-neb-a { animation: spl-neb-a 26s ease-in-out infinite; }

    /* Nebula drift B — lower-right cluster */
    @keyframes spl-neb-b {
      0%, 100% { transform: translate(0, 0)        scale(1);    opacity: 0.7; }
      35%       { transform: translate(-20px, 10px)  scale(1.06); opacity: 0.9; }
      75%       { transform: translate(14px, -14px)  scale(0.97); opacity: 0.6; }
    }
    .spl-neb-b { animation: spl-neb-b 22s ease-in-out infinite; animation-delay: -11s; }

    /* Nebula drift C — mid-area accent */
    @keyframes spl-neb-c {
      0%, 100% { transform: translate(0, 0)       scale(1);    opacity: 0.5; }
      50%       { transform: translate(16px, -20px) scale(1.12); opacity: 0.8; }
    }
    .spl-neb-c { animation: spl-neb-c 30s ease-in-out infinite; animation-delay: -15s; }

    /* Star/particle twinkle */
    @keyframes spl-twinkle {
      0%, 100% { transform: scale(1);   opacity: 0.25; }
      50%       { transform: scale(2.2); opacity: 0.85; }
    }
    .spl-star { animation: spl-twinkle var(--dur) ease-in-out infinite; animation-delay: var(--delay); }
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

// ─── PS5-style atmospheric background ────────────────────────────────────────
function PS5Background({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transition: 'opacity 2s ease',
      pointerEvents: 'none',
    }}>
      {/* Central ambient radial glow */}
      <div style={{
        position: 'absolute',
        width: '90%', height: '75%',
        top: '12%', left: '5%',
        background: 'radial-gradient(ellipse at 55% 45%, oklch(0.72 0.17 162 / 0.07) 0%, oklch(0.60 0.14 220 / 0.04) 40%, transparent 70%)',
        filter: 'blur(50px)',
      }} />

      {/* Light ray A — main diagonal sweep (lower-left → upper-right, PS5-style) */}
      <div className="spl-ray-a" style={{
        position: 'absolute',
        width: '220%', height: '3px',
        top: '44%', left: '-60%',
        background: 'linear-gradient(90deg, transparent 5%, oklch(0.72 0.17 162 / 0.10) 30%, oklch(0.88 0.10 175 / 0.35) 50%, oklch(0.72 0.17 162 / 0.10) 70%, transparent 95%)',
        filter: 'blur(8px)',
      }} />
      {/* Ray A softer halo */}
      <div className="spl-ray-a" style={{
        position: 'absolute',
        width: '220%', height: '14px',
        top: 'calc(44% - 5px)', left: '-60%',
        background: 'linear-gradient(90deg, transparent 5%, oklch(0.72 0.17 162 / 0.04) 30%, oklch(0.80 0.12 170 / 0.12) 50%, oklch(0.72 0.17 162 / 0.04) 70%, transparent 95%)',
        filter: 'blur(20px)',
      }} />

      {/* Light ray B — secondary, cooler blue tone */}
      <div className="spl-ray-b" style={{
        position: 'absolute',
        width: '200%', height: '2px',
        top: '60%', left: '-50%',
        background: 'linear-gradient(90deg, transparent 8%, oklch(0.62 0.16 240 / 0.08) 35%, oklch(0.75 0.14 210 / 0.28) 50%, oklch(0.62 0.16 240 / 0.08) 65%, transparent 92%)',
        filter: 'blur(12px)',
      }} />
      <div className="spl-ray-b" style={{
        position: 'absolute',
        width: '200%', height: '18px',
        top: 'calc(60% - 8px)', left: '-50%',
        background: 'linear-gradient(90deg, transparent 8%, oklch(0.62 0.16 240 / 0.03) 35%, oklch(0.70 0.12 220 / 0.09) 50%, oklch(0.62 0.16 240 / 0.03) 65%, transparent 92%)',
        filter: 'blur(28px)',
      }} />

      {/* Light ray C — thin bright accent */}
      <div className="spl-ray-c" style={{
        position: 'absolute',
        width: '160%', height: '1px',
        top: '32%', left: '-30%',
        background: 'linear-gradient(90deg, transparent 15%, oklch(0.90 0.08 168 / 0.08) 40%, oklch(0.95 0.06 165 / 0.22) 50%, oklch(0.90 0.08 168 / 0.08) 60%, transparent 85%)',
        filter: 'blur(5px)',
      }} />

      {/* Nebula A — upper-left, blue-green cloud */}
      <div className="spl-neb-a" style={{
        position: 'absolute',
        width: 380, height: 280,
        top: '-4%', left: '-2%',
        background: 'radial-gradient(ellipse at 50% 50%, oklch(0.60 0.16 240 / 0.10) 0%, oklch(0.68 0.14 210 / 0.06) 40%, transparent 70%)',
        filter: 'blur(40px)',
      }} />

      {/* Nebula B — lower-right, warm cyan */}
      <div className="spl-neb-b" style={{
        position: 'absolute',
        width: 320, height: 240,
        bottom: '0%', right: '0%',
        background: 'radial-gradient(ellipse at 50% 50%, oklch(0.72 0.17 162 / 0.09) 0%, oklch(0.65 0.14 185 / 0.05) 45%, transparent 70%)',
        filter: 'blur(35px)',
      }} />

      {/* Nebula C — mid center-right accent */}
      <div className="spl-neb-c" style={{
        position: 'absolute',
        width: 260, height: 200,
        top: '30%', right: '5%',
        background: 'radial-gradient(ellipse at 50% 50%, oklch(0.65 0.18 195 / 0.07) 0%, transparent 65%)',
        filter: 'blur(30px)',
      }} />

      {/* Star/particle field */}
      {PARTICLES.map((p, i) => (
        <div key={i} className="spl-star" style={{
          position: 'absolute',
          width: p.size, height: p.size,
          top: p.top, left: p.left,
          borderRadius: '50%',
          background: 'oklch(0.90 0.10 170)',
          boxShadow: `0 0 ${p.size * 4}px ${p.size + 1}px oklch(0.85 0.12 175 / 0.6)`,
          '--dur': p.dur,
          '--delay': p.delay,
        } as React.CSSProperties} />
      ))}

      {/* Edge vignette — keeps attention center */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 75% at 50% 50%, transparent 45%, oklch(0.09 0.007 245 / 0.75) 100%)',
      }} />
    </div>
  );
}

// ─── Chat bubble with orbit ring ──────────────────────────────────────────────
function ChatBubbleLogo({ large = false }: { large?: boolean }) {
  const size     = large ? 110 : 80;
  const ringR    = large ? 48  : 34;
  const dotCy    = large ? 9   : 6;
  const dotR     = large ? 5.5 : 4;
  const iconSize = large ? 42  : 30;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none"
           style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={ringR}
                stroke="var(--accent)" strokeWidth="1.5"
                strokeOpacity={large ? 0.55 : 0.4} />
        <g style={{
          transformOrigin: `${size / 2}px ${size / 2}px`,
          animation: 'spl-logo-spin 2.4s linear infinite',
        }}>
          <circle cx={size / 2} cy={dotCy} r={dotR} fill="var(--accent)" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none"
             style={{
               color: 'var(--accent)',
               filter: large ? 'drop-shadow(0 0 10px oklch(0.72 0.17 162 / 0.55))' : 'none',
             }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── Phase machine ────────────────────────────────────────────────────────────
// enter → orbit → converge → prompt  ← waits for click
// click during animation             → skip to prompt
// click on prompt                    → exit → onComplete
type Phase = 'enter' | 'orbit' | 'converge' | 'prompt' | 'exit';

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('enter');

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
      setPhase('exit');
      setTimeout(onComplete, 450);
    } else {
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

      {/* PS5-style atmospheric background — always on */}
      <PS5Background visible={phase !== 'exit'} />

      {/* ── Orbit stage ── */}
      <div style={{
        position: 'relative', width: 320, height: 320, flexShrink: 0,
        opacity: isPrompt ? 0 : 1,
        transform: isPrompt ? 'scale(0.85)' : 'scale(1)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        pointerEvents: 'none',
      }}>

        {/* Ring guides */}
        {RINGS.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: ring.radius * 2, height: ring.radius * 2,
            marginLeft: -ring.radius, marginTop: -ring.radius,
            borderRadius: '50%',
            border: '1px solid oklch(0.30 0.02 200 / 0.55)',
            opacity: isOrbiting ? 0.7 : 0,
            transition: isOrbiting ? 'opacity 1s ease' : 'opacity 0.5s ease',
          }} />
        ))}

        {/* Agent satellite dots */}
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
                boxShadow: isOrbiting
                  ? `0 0 8px 2px ${ag.rawColor}55`
                  : isConverging
                    ? `0 0 16px 5px ${ag.rawColor}88`
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

      {/* ── Prompt screen ── */}
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

        <div className="spl-prompt-blink" style={{
          marginTop: 16,
          fontSize: 11, fontWeight: 600,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.18em',
        }}>
          CLICK TO ENTER
        </div>
      </div>

      {/* Skip hint during orbit */}
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
