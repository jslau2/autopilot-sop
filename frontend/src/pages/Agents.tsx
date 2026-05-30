import { useParams, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import AgentSettings from './AgentSettings';
import AgentManager from './AgentManager';

type Tab = 'configure' | 'performance';

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: 'configure', label: 'Configure', sub: 'Prompts · models · tools' },
  { key: 'performance', label: 'Performance & Governance', sub: 'Analytics · evaluation' },
];

/**
 * The "Agents" hub — one home for everything about the agents, with two
 * facets: Configure (the old Agent Settings) and Performance & Governance
 * (the old Agent Manager).
 */
export default function Agents() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const active: Tab = tab === 'performance' ? 'performance' : 'configure';

  return (
    <AppShell active="agents">
      <div style={{ height: 'calc(100vh - 53px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 22px 4px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Agents Hub</h1>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Configure & govern the 12-agent roster</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '4px 22px 0', background: 'var(--bg-base)',
      }}>
        {TABS.map(t => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => navigate(`/agents/${t.key}`)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left',
                padding: '8px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                background: on ? 'var(--bg-surface)' : 'transparent',
                border: '1px solid', borderColor: on ? 'var(--border-subtle)' : 'transparent',
                borderBottom: 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 600, color: on ? 'var(--text-1)' : 'var(--text-3)' }}>{t.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t.sub}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
        {active === 'configure' ? <AgentSettings embedded /> : <AgentManager embedded />}
      </div>
      </div>
    </AppShell>
  );
}
