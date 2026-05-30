import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveEntity, ALL_ENTITIES } from '../hooks/useEntity';

const EXAMPLES = [
  'Plan Q4 with +10% growth and Supplier X delayed 4 weeks',
  'Re-plan after a 30% spike on SKU-88X',
  'Cost-down quarter — trim safety stock, hold OTIF ≥ 97%',
];

/**
 * Conversational kickoff — describe a planning scenario in plain English and
 * launch a cycle. Live mode expands the brief into a structured goal via
 * /api/sessions/kickoff; demo mode seeds the launch config with the brief.
 */
export default function KickoffBar({
  demoMode, onDemoSeed, compact,
}: {
  demoMode: boolean;
  onDemoSeed: (brief: string) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    const text = brief.trim();
    if (!text) return;
    if (demoMode) { onDemoSeed(text); return; }
    setBusy(true); setErr('');
    try {
      const entity = getActiveEntity();
      const res = await fetch('/api/sessions/kickoff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: text, entity: entity === ALL_ENTITIES ? '' : entity }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      navigate(`/pipeline/${d.session_id}`, { state: { goal: d.goal, name: d.name } });
    } catch {
      setErr('Could not start — is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
      padding: compact ? 14 : 18, width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Conversational kickoff</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>describe a scenario in plain English</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={brief}
          onChange={e => setBrief(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go(); }}
          placeholder="e.g. Plan Q4 with +10% growth and Supplier X delayed 4 weeks"
          style={{
            flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 8,
            background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none',
          }}
        />
        <button
          onClick={go}
          disabled={busy || !brief.trim()}
          style={{
            padding: '0 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy || !brief.trim() ? 'default' : 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none', opacity: busy || !brief.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
          }}
        >{busy ? '…' : '✦ Plan it'}</button>
      </div>
      {err && <div style={{ fontSize: 11, color: 'oklch(0.72 0.18 25)', marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            onClick={() => setBrief(ex)}
            style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 14, cursor: 'pointer',
              background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-3)',
            }}
          >{ex}</button>
        ))}
      </div>
    </div>
  );
}
