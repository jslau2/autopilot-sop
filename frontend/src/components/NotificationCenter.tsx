import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '../hooks/useDemoMode';

interface Alert {
  id: string;
  session_id: string;
  session_name: string;
  type: 'decision' | 'kpi' | string;
  severity: 'action' | 'warning' | string;
  message: string;
}

interface ChannelState {
  configured: boolean;          // generic webhook (Slack/Teams)
  enabled: boolean;
  telegram_configured: boolean;
  telegram_enabled: boolean;
  email_configured: boolean;
  email_enabled: boolean;
  smtp_ready: boolean;          // SMTP_HOST set in backend/.env
}

const POLL_MS = 6000;
const TOAST_MS = 9000;

const inputStyle: React.CSSProperties = {
  fontSize: 11, padding: '6px 8px', borderRadius: 6,
  background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 6,
  border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  fontSize: 11, padding: '5px 9px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer',
};

function sevColor(sev: string): string {
  return sev === 'action' ? 'oklch(0.72 0.16 75)' : 'oklch(0.7 0.18 25)';
}
function sevIcon(type: string): string {
  return type === 'decision' ? '⏸' : '⚠';
}

/**
 * Global alerts & notifications. Polls /api/notifications (live mode) for runs
 * paused on a decision or KPI breaches; raises a toast the first time each alert
 * appears and keeps a bell dropdown. Mounted app-wide so the human-in-the-loop
 * checkpoint reaches you on any page or in any run.
 */
export default function NotificationCenter() {
  const [demoMode] = useDemoMode();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toasts, setToasts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const acknowledged = useRef<Set<string>>(new Set());
  const [showWebhook, setShowWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChat, setTgChat] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [webhookState, setWebhookState] = useState<ChannelState>({
    configured: false, enabled: false,
    telegram_configured: false, telegram_enabled: false,
    email_configured: false, email_enabled: false, smtp_ready: false,
  });
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    if (demoMode) return;
    fetch('/api/notifications/webhook').then(r => r.ok ? r.json() : null).then(d => { if (d) setWebhookState(d); }).catch(() => {});
  }, [demoMode]);

  // Patch any subset of the notification config; secrets only sent when typed.
  const saveConfig = async (patch: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/notifications/webhook', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) setWebhookState(await res.json());
    } catch { /* ignore */ }
  };
  const saveWebhook = (enabled: boolean) => saveConfig({ webhook_url: webhookUrl || undefined, enabled });
  const saveTelegram = (enabled: boolean) => saveConfig({
    telegram_bot_token: tgToken || undefined,
    telegram_chat_id: tgChat || undefined,
    telegram_enabled: enabled,
  });
  const saveEmail = (enabled: boolean) => saveConfig({ email_to: emailTo || undefined, email_enabled: enabled });

  const sendTest = async () => {
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const d = await res.json();
      setTestMsg(d.sent ? '✓ Test sent' : `✗ ${d.reason || 'failed'}`);
    } catch { setTestMsg('✗ failed'); }
    setTimeout(() => setTestMsg(''), 4000);
  };

  const dismissToast = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  useEffect(() => {
    if (demoMode) { setAlerts([]); setToasts([]); return; }
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const data = await res.json();
        const list: Alert[] = data.alerts ?? [];
        if (!alive) return;
        setAlerts(list);
        // Toast newly-seen alerts.
        const fresh = list.filter(a => !seen.current.has(a.id));
        fresh.forEach(a => seen.current.add(a.id));
        // Drop ids that are no longer active from the seen set so they can re-alert later.
        const activeIds = new Set(list.map(a => a.id));
        seen.current.forEach(id => { if (!activeIds.has(id)) { seen.current.delete(id); acknowledged.current.delete(id); } });
        if (fresh.length) {
          setToasts(t => [...fresh, ...t].slice(0, 4));
          fresh.forEach(a => setTimeout(() => dismissToast(a.id), TOAST_MS));
        }
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [demoMode, dismissToast]);

  if (demoMode) return null;

  const unread = alerts.filter(a => !acknowledged.current.has(a.id)).length;

  const goTo = (a: Alert) => {
    acknowledged.current.add(a.id);
    dismissToast(a.id);
    setOpen(false);
    navigate(`/pipeline/${a.session_id}`);
  };

  return (
    <>
      {/* Bell */}
      <button
        onClick={() => { setOpen(o => !o); alerts.forEach(a => acknowledged.current.add(a.id)); }}
        title="Alerts & notifications"
        style={{
          position: 'fixed', top: 62, right: 18, zIndex: 120,
          width: 38, height: 38, borderRadius: '50%', cursor: 'pointer',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 14px oklch(0.04 0.01 250 / 0.4)', fontSize: 16, color: 'var(--text-2)',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, padding: '0 4px',
            borderRadius: 9, background: 'oklch(0.62 0.2 25)', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unread}</span>
        )}
      </button>

      {/* Bell dropdown */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 119 }} />
          <div style={{
            position: 'fixed', top: 106, right: 18, zIndex: 121, width: 320, maxHeight: 420, overflowY: 'auto',
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
            boxShadow: '0 16px 40px oklch(0.04 0.01 250 / 0.55)', padding: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', padding: '6px 8px' }}>
              Alerts {alerts.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({alerts.length})</span>}
            </div>
            {alerts.length === 0 && (
              <div style={{ padding: '14px 10px', fontSize: 12, color: 'var(--text-3)' }}>No active alerts. All runs are healthy.</div>
            )}
            {alerts.map(a => (
              <button
                key={a.id}
                onClick={() => goTo(a)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent',
                }}
              >
                <span style={{ color: sevColor(a.severity), fontSize: 14, lineHeight: 1.3 }}>{sevIcon(a.type)}</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{a.message}</span>
              </button>
            ))}

            {/* Channel config */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 6, paddingTop: 6 }}>
              <button
                onClick={() => setShowWebhook(s => !s)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: '4px 8px' }}
              >
                ⚙ Notification channels {showWebhook ? '▾' : '▸'}
              </button>
              {showWebhook && (
                <div style={{ padding: '2px 8px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Telegram */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                      Telegram {webhookState.telegram_configured ? (webhookState.telegram_enabled ? '· on' : '· off') : '· not set'}
                    </div>
                    <input
                      value={tgToken}
                      onChange={e => setTgToken(e.target.value)}
                      placeholder={webhookState.telegram_configured ? '•••• bot token (set) — paste to replace' : 'Bot token (from @BotFather)'}
                      style={inputStyle}
                    />
                    <input
                      value={tgChat}
                      onChange={e => setTgChat(e.target.value)}
                      placeholder={webhookState.telegram_configured ? '•••• chat id (set) — paste to replace' : 'Chat ID (e.g. 123456789)'}
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => saveTelegram(true)} style={primaryBtn}>Save & enable</button>
                      <button onClick={() => saveTelegram(false)} style={ghostBtn}>Disable</button>
                    </div>
                  </div>

                  {/* Email */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                      Email {webhookState.email_configured ? (webhookState.email_enabled ? '· on' : '· off') : '· not set'}
                    </div>
                    <input
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      placeholder="recipient@company.com, …"
                      style={inputStyle}
                    />
                    {!webhookState.smtp_ready && (
                      <div style={{ fontSize: 10, color: 'oklch(0.72 0.16 75)' }}>Set SMTP_HOST/PORT/USER/PASS/FROM in backend/.env to enable email.</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => saveEmail(true)} style={primaryBtn}>Save & enable</button>
                      <button onClick={() => saveEmail(false)} style={ghostBtn}>Disable</button>
                    </div>
                  </div>

                  {/* Webhook (Slack/Teams) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                      Webhook (Slack/Teams) {webhookState.configured ? (webhookState.enabled ? '· on' : '· off') : '· not set'}
                    </div>
                    <input
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      placeholder={webhookState.configured ? '•••• (set) — paste to replace' : 'https://hooks.slack.com/…'}
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => saveWebhook(true)} style={primaryBtn}>Save & enable</button>
                      <button onClick={() => saveWebhook(false)} style={ghostBtn}>Disable</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                    <button onClick={sendTest} style={ghostBtn}>Send test to all enabled</button>
                    {testMsg && <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{testMsg}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toasts */}
      <div style={{ position: 'fixed', top: 110, right: 64, zIndex: 122, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        {toasts.map(a => (
          <div
            key={a.id}
            onClick={() => goTo(a)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 13px', cursor: 'pointer',
              background: 'var(--bg-card)', border: `1px solid ${sevColor(a.severity)}`, borderLeft: `3px solid ${sevColor(a.severity)}`,
              borderRadius: 10, boxShadow: '0 8px 24px oklch(0.04 0.01 250 / 0.5)',
            }}
          >
            <span style={{ color: sevColor(a.severity), fontSize: 15 }}>{sevIcon(a.type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 }}>{a.message}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>Click to open the run →</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); dismissToast(a.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, padding: 0 }}
            >×</button>
          </div>
        ))}
      </div>
    </>
  );
}
