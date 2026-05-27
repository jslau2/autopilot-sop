import React from 'react';

interface AgentIconProps {
  color: string;
  status?: 'running' | 'paused' | 'done' | 'idle';
  size?: number;
}

export default function AgentIcon({ color, status = 'idle', size = 36 }: AgentIconProps) {
  const L = status === 'running';
  const P = status === 'paused';
  const D = status === 'done';
  const c = size / 2;
  const r = size * 0.47;
  const hr = size * 0.35;
  const eyeRy = (D || L) ? size * 0.07 : size * 0.04;
  const ex1 = c - size * 0.13;
  const ex2 = c + size * 0.13;
  const ey = c - size * 0.04;

  return (
    <div className={`agi agi-${status}`} style={{ '--agi-clr': color } as React.CSSProperties}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--agi-clr)" strokeWidth=".8" opacity=".12" />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke="var(--agi-clr)" strokeWidth="1.6"
          strokeDasharray={L ? '20 76' : P ? '28 68' : '6 90'} strokeLinecap="round"
          opacity={L ? 0.9 : P ? 0.6 : 0.18}
          className={L ? 'agi-arc-spin' : ''}
          style={{ transformOrigin: `${c}px ${c}px`, transform: 'rotate(-90deg)' }}
        />
        {L && (
          <g className="agi-orbit">
            <circle cx={c} cy={size * 0.08} r="1.4" fill="var(--agi-clr)" opacity=".85" />
          </g>
        )}
        <g
          className={L ? 'agi-bob' : P ? 'agi-tilt' : ''}
          style={{ transformOrigin: `${c}px ${c}px` }}
        >
          <circle
            cx={c} cy={c} r={hr}
            fill="var(--bg-base,#0c0e1a)" stroke="var(--agi-clr)"
            strokeWidth={L ? 1.5 : 0.9} opacity={L ? 1 : P ? 0.9 : 0.45}
          />
          {L && (
            <>
              <circle cx={ex1} cy={ey} r={size * 0.1} fill="var(--agi-clr)" opacity=".1" />
              <circle cx={ex2} cy={ey} r={size * 0.1} fill="var(--agi-clr)" opacity=".1" />
            </>
          )}
          <g className={L ? 'agi-blink' : ''} style={{ transformOrigin: `${ex1}px ${ey}px` }}>
            <ellipse cx={ex1} cy={ey} rx={size * 0.065} ry={eyeRy} fill="var(--agi-clr)" opacity={L ? 1 : P ? 0.9 : 0.35} />
          </g>
          <g className={L ? 'agi-blink' : ''} style={{ transformOrigin: `${ex2}px ${ey}px` }}>
            <ellipse cx={ex2} cy={ey} rx={size * 0.065} ry={eyeRy} fill="var(--agi-clr)" opacity={L ? 1 : P ? 0.9 : 0.35} />
          </g>
          {L && (
            <path
              d={`M${ex1} ${c + hr * 0.35} Q${c} ${c + hr * 0.7} ${ex2} ${c + hr * 0.35}`}
              fill="none" stroke="var(--agi-clr)" strokeWidth="1.3" strokeLinecap="round" opacity=".85"
            />
          )}
          {P && (
            <>
              <line x1={c} y1={c + hr * 0.2} x2={c} y2={c + hr * 0.55} stroke="#f5c842" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx={c} cy={c + hr * 0.7} r=".8" fill="#f5c842" />
            </>
          )}
          {D && (
            <path
              d={`M${ex1} ${c + hr * 0.35} Q${c} ${c + hr * 0.7} ${ex2} ${c + hr * 0.35}`}
              fill="none" stroke="var(--agi-clr)" strokeWidth=".9" strokeLinecap="round" opacity=".4"
            />
          )}
          {!L && !P && !D && (
            <line
              x1={ex1} y1={c + hr * 0.45} x2={ex2} y2={c + hr * 0.45}
              stroke="var(--agi-clr)" strokeWidth=".9" strokeLinecap="round" opacity=".3"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
