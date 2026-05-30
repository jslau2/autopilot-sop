import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useDemoMode } from '../hooks/useDemoMode';
import { DEFAULT_GOAL } from '../components/LaunchConfig';

interface Schedule {
  id: string; name: string; goal: string; cadence: string; entity: string;
  enabled: boolean; next_run: number; last_run: number | null; last_session_id: string; run_count: number;
}

const CADENCE_LABEL: Record<string, string> = { hourly: 'Every hour', daily: 'Every day', weekly: 'Every week' };

function whenRel(epoch: number | null): string {
  if (!epoch) return '—';
  const secs = epoch - Date.now() / 1000;
  const abs = Math.abs(secs);
  const unit = abs < 60 ? `${Math.round(abs)}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
  return secs >= 0 ? `in ${unit}` : `${unit} ago`;
}

export default function Schedules() {
  const [demoMode] = useDemoMode();
  const navigate = useNavigate();
  const [list, setList] = useState<Schedule[]>([]);
  const [name, setName] = useState('Weekly S&OP Cycle');
  const [cadence, setCadence] = useState('weekly');
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (demoMode) return;
    fetch('/api/schedules').then(r => r.ok ? r.json() : { schedules: [] }).then(d => setList(d.schedules ?? [])).catch(() => {});
  }, [demoMode]);

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  const create = async () => {
    await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, goal, cadence }) });
    setOpen(false); load();
  };
  const toggle = async (s: Schedule) => { await fetch(`/api/schedules/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }) }); load(); };
  const runNow = async (s: Schedule) => { const r = await fetch(`/api/schedules/${s.id}/run-now`, { method: 'POST' }); const d = await r.json(); if (d.session_id) navigate(`/pipeline/${d.session_id}`); };
  const remove = async (s: Schedule) => { if (!confirm(`Delete schedule "${s.name}"?`)) return; await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' }); load(); };

  return (
    <AppShell active="schedules">
      <div style={{ minHeight: 'calc(100vh - 53px)', background: 'var(--bg-base)', padding: '22px 26px 60px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>⏱ Scheduled Runs</h1>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>autopilot — recurring autonomous cycles</span>
            <span style={{ flex: 1 }} />
            <Link to="/" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>← Home</Link>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 18px' }}>
            Run the S&amp;OP cycle automatically on a cadence — "every week, autonomously". New runs appear in your cycles list.
          </p>

          {demoMode ? (
            <div style={{ padding: '24px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
              Scheduled runs execute real agents — switch to <strong>LIVE</strong> mode (top bar) to create and manage schedules.
            </div>
          ) : (
            <>
              <button
                onClick={() => setOpen(o => !o)}
                style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', marginBottom: 16 }}
              >{open ? '× Cancel' : '+ New schedule'}</button>

              {open && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 18, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Schedule name" style={inputStyle} />
                    <select value={cadence} onChange={e => setCadence(e.target.value)} style={{ ...inputStyle, flex: '0 0 160px' }}>
                      {Object.entries(CADENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }} />
                  <button onClick={create} style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>Create schedule</button>
                </div>
              )}

              {list.length === 0 && (
                <div style={{ padding: '24px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
                  No schedules yet — create one to run the cycle automatically.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 11, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: s.enabled ? 'oklch(0.7 0.17 145)' : 'var(--text-3)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        {CADENCE_LABEL[s.cadence] ?? s.cadence} · next {whenRel(s.next_run)} · {s.run_count} run{s.run_count === 1 ? '' : 's'}
                        {s.last_session_id && <> · <Link to={`/pipeline/${s.last_session_id}`} style={{ color: 'var(--accent)' }}>last run →</Link></>}
                      </div>
                    </div>
                    <button onClick={() => runNow(s)} style={ghostBtn}>▶ Run now</button>
                    <button onClick={() => toggle(s)} style={ghostBtn}>{s.enabled ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => remove(s)} style={{ ...ghostBtn, color: 'oklch(0.72 0.18 25)' }}>Delete</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)',
  borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text-1)', outline: 'none',
};
const ghostBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap',
};
