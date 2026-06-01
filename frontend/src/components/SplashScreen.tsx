import { useState, useEffect, useRef } from 'react';
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
    @keyframes spl-prompt-blink {
      0%, 100% { opacity: 0.9; }
      50%       { opacity: 0.15; }
    }
    .spl-prompt-blink { animation: spl-prompt-blink 1.8s ease-in-out infinite; }
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

// ─── Ribbon definitions ───────────────────────────────────────────────────────
// yF  = center Y as fraction of screen height
// amp = vertical oscillation amplitude (px)
// sp  = oscillation speed multiplier
// ph  = phase offset (radians)
// thick = core stroke width (px)
// a   = max opacity of core line
const RIBBONS = [
  { yF: 0.42, amp: 95,  sp: 0.17, ph: 0.0,  thick: 2.0, a: 0.90 }, // primary
  { yF: 0.46, amp: 82,  sp: 0.21, ph: 1.2,  thick: 1.5, a: 0.65 }, // companion
  { yF: 0.36, amp: 58,  sp: 0.26, ph: 2.6,  thick: 1.0, a: 0.48 }, // upper thin
  { yF: 0.60, amp: 72,  sp: 0.16, ph: 0.7,  thick: 1.5, a: 0.42 }, // lower
  { yF: 0.68, amp: 50,  sp: 0.23, ph: 3.1,  thick: 1.0, a: 0.24 }, // lower subtle
  { yF: 0.26, amp: 44,  sp: 0.20, ph: 1.9,  thick: 1.0, a: 0.20 }, // upper subtle
  { yF: 0.52, amp: 38,  sp: 0.29, ph: 4.2,  thick: 0.8, a: 0.18 }, // mid accent
];

// ─── Canvas-based PS5 atmospheric background ──────────────────────────────────
function PS5Background({ visible }: { visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    // Seed particles once — position, size, twinkle params
    const particles = Array.from({ length: 80 }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     0.4 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.20 + Math.random() * 1.0,
    }));

    let raf: number;

    const tick = (now: number) => {
      const t = now / 1000;
      const W = window.innerWidth;
      const H = window.innerHeight;

      ctx.clearRect(0, 0, W, H);

      // ── Ribbons ────────────────────────────────────────────────────────────
      RIBBONS.forEach(r => {
        const T = t * r.sp + r.ph;
        // Gentle breathing on top of oscillation
        const breathe = 0.88 + 0.12 * Math.sin(t * 0.7 + r.ph);

        // Four bezier control points that slowly undulate
        const p0 = { x: -W * 0.06, y: H * r.yF + Math.sin(T * 0.78)          * r.amp };
        const p1 = { x:  W * 0.28, y: H * r.yF + Math.sin(T * 0.91 + 1.05)   * r.amp * 1.75 };
        const p2 = { x:  W * 0.72, y: H * r.yF + Math.sin(T * 0.86 + 2.30)   * r.amp * 1.55 };
        const p3 = { x:  W * 1.06, y: H * r.yF + Math.sin(T * 0.74 + 3.50)   * r.amp * 1.20 };

        // Render: wide atmosphere → soft glow → sharp glow → bright core
        const passes = [
          { lw: 80,       alpha: r.a * 0.018 * breathe },
          { lw: 28,       alpha: r.a * 0.065 * breathe },
          { lw: 7,        alpha: r.a * 0.230 * breathe },
          { lw: r.thick,  alpha: r.a         * breathe },
        ];

        passes.forEach(pass => {
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          ctx.strokeStyle = `rgba(215, 238, 255, ${pass.alpha})`;
          ctx.lineWidth   = pass.lw;
          ctx.lineCap     = 'round';
          ctx.stroke();
        });
      });

      // ── Twinkling star particles ───────────────────────────────────────────
      particles.forEach(p => {
        const pulse  = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase);
        const alpha  = 0.12 + 0.82 * pulse;
        const radius = p.r * (0.55 + 0.9 * pulse);

        // Radial glow halo
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 8);
        grad.addColorStop(0,   `rgba(220, 244, 255, ${alpha * 0.75})`);
        grad.addColorStop(0.35,`rgba(190, 228, 255, ${alpha * 0.30})`);
        grad.addColorStop(1,   'rgba(150, 200, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 8, 0, Math.PI * 2);
        ctx.fill();

        // Crisp bright core dot
        ctx.fillStyle = `rgba(245, 252, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Edge vignette ──────────────────────────────────────────────────────
      // Two passes: wide soft + tight hard — matches PS5 dark-frame look
      const cx = W / 2, cy = H / 2;
      const diag = Math.sqrt(cx * cx + cy * cy);

      const vgSoft = ctx.createRadialGradient(cx, cy, diag * 0.30, cx, cy, diag * 1.10);
      vgSoft.addColorStop(0, 'rgba(8, 10, 14, 0)');
      vgSoft.addColorStop(1, 'rgba(8, 10, 14, 0.72)');
      ctx.fillStyle = vgSoft;
      ctx.fillRect(0, 0, W, H);

      const vgHard = ctx.createRadialGradient(cx, cy, diag * 0.55, cx, cy, diag * 1.05);
      vgHard.addColorStop(0, 'rgba(8, 10, 14, 0)');
      vgHard.addColorStop(1, 'rgba(8, 10, 14, 0.60)');
      ctx.fillStyle = vgHard;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: visible ? 1 : 0,
        transition: 'opacity 2s ease',
        pointerEvents: 'none',
      }}
    />
  );
}

// ─── Chat bubble with orbit ring — splash finale ──────────────────────────────
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
      setTimeout(() => setPhase('orbit'),    400),
      setTimeout(() => setPhase('converge'), 3100),
      setTimeout(() => setPhase('prompt'),   4300),
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
        background: 'oklch(0.07 0.010 245)',
        opacity: phase === 'exit' ? 0 : 1,
        transition: phase === 'exit' ? 'opacity 0.45s ease' : undefined,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <style>{SPLASH_CSS}</style>

      {/* PS5-style atmospheric canvas background */}
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
            border: '1px solid rgba(180, 220, 255, 0.18)',
            opacity: isOrbiting ? 0.9 : 0,
            transition: isOrbiting ? 'opacity 1.1s ease' : 'opacity 0.4s ease',
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
                background: `${ag.rawColor}18`,
                border: `2px solid ${ag.rawColor}`,
                boxShadow: isOrbiting
                  ? `0 0 8px 2px ${ag.rawColor}55`
                  : isConverging
                    ? `0 0 18px 6px ${ag.rawColor}90`
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
        fontSize: 10, color: 'rgba(180, 210, 255, 0.45)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
        opacity: isOrbiting ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
      }}>
        CLICK TO SKIP
      </div>
    </div>
  );
}
