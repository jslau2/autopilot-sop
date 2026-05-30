import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDemoMode } from '../hooks/useDemoMode';
import { useEntity, ALL_ENTITIES } from '../hooks/useEntity';

type NavKey = 'home' | 'cycle' | 'console' | 'agents' | 'data' | 'compare' | 'schedules';

const NAV: { key: NavKey; label: string; to: string }[] = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'cycle', label: 'Cycle', to: '/pipeline' },
  { key: 'console', label: 'Agent Console', to: '/console' },
  { key: 'agents', label: 'Agents Hub', to: '/agents' },
  { key: 'data', label: 'Data Sources', to: '/datasources' },
];

/**
 * Persistent top navigation used across the browse / config pages
 * (Home, Agents, Data Sources). Gives the app one consistent header and
 * reduces everything to three nouns: Cycles · Agents · Data.
 */
export default function AppShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const [demoMode, setDemoMode] = useDemoMode();
  const { active: entity, entities, setActive: setEntity } = useEntity();

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

        {/* Planning entity scope */}
        <select
          value={entity}
          onChange={e => setEntity(e.target.value)}
          title="Scope to a planning entity"
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
            background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-2)',
            maxWidth: 180,
          }}
        >
          <option value={ALL_ENTITIES}>All entities</option>
          {entities.map(en => <option key={en} value={en}>{en}</option>)}
        </select>

        {/* Demo / Live toggle — single source of truth, works from any page */}
        <div
          role="switch"
          aria-checked={!demoMode}
          onClick={() => setDemoMode(!demoMode)}
          title="Toggle demo / live mode"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer',
            padding: 2, borderRadius: 7, background: 'var(--bg-base)', border: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
          }}
        >
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: demoMode ? 'oklch(0.45 0.12 145 / 0.25)' : 'transparent',
            color: demoMode ? 'oklch(0.78 0.18 145)' : 'var(--text-3)',
          }}>DEMO</span>
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: !demoMode ? 'oklch(0.55 0.18 260 / 0.25)' : 'transparent',
            color: !demoMode ? 'oklch(0.78 0.18 260)' : 'var(--text-3)',
          }}>LIVE</span>
        </div>
      </header>

      {children}
    </div>
  );
}
