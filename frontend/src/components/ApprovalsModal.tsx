import { useState, useEffect, useCallback } from 'react';

const REQUIRED_ROLES = ['Finance Lead', 'Operations Lead', 'Demand Planning'];

interface RoleStatus { role: string; state: string; approver: string; comment: string; ts: string; }
interface ApprovalState { roles: RoleStatus[]; overall: string; }

const EMPTY: ApprovalState = { roles: REQUIRED_ROLES.map(role => ({ role, state: 'pending', approver: '', comment: '', ts: '' })), overall: 'pending' };

function overallStyle(overall: string): { bg: string; bd: string; fg: string; label: string } {
  if (overall === 'approved') return { bg: 'oklch(0.55 0.15 150 / 0.14)', bd: 'oklch(0.6 0.15 150)', fg: 'oklch(0.8 0.15 150)', label: '✓ Plan approved' };
  if (overall === 'rejected') return { bg: 'oklch(0.6 0.18 25 / 0.14)', bd: 'oklch(0.62 0.18 25)', fg: 'oklch(0.74 0.18 25)', label: '✕ Plan rejected' };
  return { bg: 'oklch(0.72 0.16 75 / 0.12)', bd: 'oklch(0.72 0.16 75)', fg: 'oklch(0.78 0.16 75)', label: '⏳ Awaiting sign-off' };
}

/**
 * Approvals workflow — plan sign-off from Finance / Operations / Demand leads
 * with comments. Live mode persists via /api/sessions/{id}/approvals; demo keeps
 * local state.
 */
export default function ApprovalsModal({
  sessionId, demoMode, onClose,
}: {
  sessionId?: string; demoMode?: boolean; onClose: () => void;
}) {
  const [state, setState] = useState<ApprovalState>(EMPTY);
  const [role, setRole] = useState(REQUIRED_ROLES[0]);
  const [approver, setApprover] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    if (demoMode || !sessionId) return;
    fetch(`/api/sessions/${sessionId}/approvals`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setState(d); })
      .catch(() => {});
  }, [demoMode, sessionId]);

  useEffect(() => { load(); }, [load]);

  const sign = async (decision: 'approve' | 'reject') => {
    if (demoMode || !sessionId) {
      // local update
      setState(prev => {
        const roles = prev.roles.map(r => r.role === role ? { ...r, state: decision, approver, comment, ts: new Date().toLocaleTimeString() } : r);
        const overall = roles.some(r => r.state === 'reject') ? 'rejected' : roles.every(r => r.state === 'approve') ? 'approved' : 'pending';
        return { roles, overall };
      });
      setComment('');
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/approvals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, decision, approver, comment }),
      });
      if (res.ok) { setState(await res.json()); setComment(''); }
    } catch { /* ignore */ }
  };

  const ov = overallStyle(state.overall);
  const stateChip = (s: string) =>
    s === 'approve' ? { c: 'oklch(0.78 0.15 150)', t: '✓ Approved' }
    : s === 'reject' ? { c: 'oklch(0.74 0.18 25)', t: '✕ Rejected' }
    : { c: 'var(--text-3)', t: 'Pending' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: 'oklch(0.08 0.01 250 / 0.72)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>✓ Plan Approvals</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Sign-off from finance / ops / demand leads</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }} aria-label="Close">×</button>
        </div>

        <div style={{ padding: 18 }}>
          {/* Overall status */}
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: ov.bg, border: `1px solid ${ov.bd}`, color: ov.fg, fontSize: 14, fontWeight: 700 }}>
            {ov.label}
          </div>

          {/* Per-role status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {state.roles.map(r => {
              const c = stateChip(r.state);
              return (
                <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{r.role}</span>
                  {r.approver && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.approver}</span>}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: c.c }}>{c.t}</span>
                </div>
              );
            })}
          </div>
          {state.roles.some(r => r.comment) && (
            <div style={{ marginBottom: 14 }}>
              {state.roles.filter(r => r.comment).map(r => (
                <div key={r.role} style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-3)' }}>{r.role}:</span> “{r.comment}”
                </div>
              ))}
            </div>
          )}

          {/* Sign-off form */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.04em' }}>RECORD A SIGN-OFF</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', borderRadius: 7, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                {REQUIRED_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Your name (optional)" style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', borderRadius: 7, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }} />
            </div>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comment (optional)" style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 7, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => sign('approve')} style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'oklch(0.55 0.15 150)', color: '#fff' }}>✓ Approve as {role}</button>
              <button onClick={() => sign('reject')} style={{ fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid oklch(0.62 0.18 25)', color: 'oklch(0.74 0.18 25)' }}>Reject</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
