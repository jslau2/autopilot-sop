import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

type NavKey = 'cycles' | 'console' | 'agents' | 'data';

const NAV: { key: NavKey; label: string; to: string }[] = [
  { key: 'cycles', label: 'Cycles', to: '/' },
  { key: 'console', label: 'Agent Console', to: '/console' },
  { key: 'agents', label: 'Agents', to: '/agents' },
  { key: 'data', label: 'Data Sources', to: '/datasources' },
];

/**
 * Persistent top navigation used across the browse / config pages
 * (Home, Agents, Data Sources). Gives the app one consistent header and
 * reduces everything to three nouns: Cycles · Agents · Data.
 */
export default function AppShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const navigate = useNavigate();
  const demoMode = localStorage.getItem('sop-demo-mode') !== 'false';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '0 22px', height: 52,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--text-1)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <rect x="3" y="14" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 14 L12 9 L19 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Autopilot S&amp;OP</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV.map(item => {
            const on = item.key === active;
            return (
              <Link
                key={item.key}
                to={item.to}
                style={{
                  fontSize: 13, fontWeight: on ? 700 : 500, textDecoration: 'none',
                  padding: '6px 11px', borderRadius: 7,
                  color: on ? 'var(--text-1)' : 'var(--text-3)',
                  background: on ? 'var(--bg-card)' : 'transparent',
                  border: `1px solid ${on ? 'var(--border-subtle)' : 'transparent'}`,
                }}
              >{item.label}</Link>
            );
          })}
        </nav>

        <span style={{ flex: 1 }} />

        <button
          onClick={() => navigate('/')}
          title="Demo / Live mode is toggled on the Cycles (home) page"
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', padding: '3px 9px', borderRadius: 5,
            cursor: 'pointer', background: 'transparent',
            color: demoMode ? 'oklch(0.75 0.18 145)' : 'oklch(0.75 0.18 260)',
            border: `1px solid ${demoMode ? 'oklch(0.45 0.12 145 / 0.4)' : 'oklch(0.55 0.18 260 / 0.4)'}`,
          }}
        >{demoMode ? 'DEMO' : 'LIVE'}</button>
      </header>

      {children}
    </div>
  );
}
