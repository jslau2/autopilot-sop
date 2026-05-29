import { useState, useRef, useEffect } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };
type Pos = { left: number; top: number };

const GREETING =
  "Hi — I'm the Planner agent. Ask me about S&OP planning in general, or about a specific run " +
  "(its status, KPIs, or decisions) and I'll pull it up.";

const ACCENT = 'oklch(0.80 0.16 78)'; // planner agent color
const BTN = 52;
const GAP = 14;
const PANEL_W = 372;
const PANEL_H = 520;
const POS_KEY = 'sop-chat-pos';

function defaultPos(): Pos {
  return { left: window.innerWidth - BTN - 20, top: window.innerHeight - BTN - 20 };
}
function clampPos(p: Pos): Pos {
  return {
    left: Math.max(8, Math.min(p.left, window.innerWidth - BTN - 8)),
    top: Math.max(8, Math.min(p.top, window.innerHeight - BTN - 8)),
  };
}
function loadPos(): Pos {
  try {
    const s = localStorage.getItem(POS_KEY);
    if (s) return clampPos(JSON.parse(s));
  } catch { /* ignore */ }
  return defaultPos();
}

export default function PlannerChat() {
  const [open, setOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<Pos>(loadPos);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag bookkeeping
  const posRef = useRef(pos);
  const dragRef = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const setPosBoth = (p: Pos) => { posRef.current = p; setPos(p); };

  // Refresh demo/live each time the panel opens (it can be toggled on Home).
  const toggleOpen = () => {
    if (!open) setDemoMode(localStorage.getItem('sop-demo-mode') !== 'false');
    setOpen(o => !o);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  // Keep the button on-screen when the viewport changes.
  useEffect(() => {
    const onResize = () => setPosBoth(clampPos(posRef.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseLeft: pos.left, baseTop: pos.top, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setPosBoth(clampPos({ left: d.baseLeft + dx, top: d.baseTop + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d?.moved) {
      suppressClickRef.current = true; // don't let the trailing click toggle
      localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
    }
  };
  const onClick = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    toggleOpen();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.reply || '(no response)' }]);
    } catch {
      setMessages(m => [...m, {
        role: 'assistant',
        content: '⚠ Could not reach the planner — make sure the backend is running in live mode.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Anchor the panel to whichever side/corner the button sits in.
  const onRight = pos.left + BTN / 2 > window.innerWidth / 2;
  const onBottom = pos.top + BTN / 2 > window.innerHeight / 2;
  const panelLeft = Math.max(8, Math.min(
    onRight ? pos.left + BTN - PANEL_W : pos.left,
    window.innerWidth - PANEL_W - 8,
  ));
  const panelTop = Math.max(8, Math.min(
    onBottom ? pos.top - GAP - PANEL_H : pos.top + BTN + GAP,
    window.innerHeight - 60,
  ));

  return (
    <>
      {/* Floating, draggable button */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        title="Chat with the Planner agent — drag to move"
        style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 150,
          width: BTN, height: BTN, borderRadius: '50%', border: 'none', cursor: 'grab',
          touchAction: 'none', userSelect: 'none',
          background: ACCENT, color: 'oklch(0.18 0.03 80)',
          fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px oklch(0.04 0.01 250 / 0.5)',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: panelLeft, top: panelTop, zIndex: 150,
          width: PANEL_W, maxWidth: 'calc(100vw - 16px)', height: PANEL_H, maxHeight: 'calc(100vh - 16px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, boxShadow: '0 18px 50px oklch(0.04 0.01 250 / 0.6)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', background: ACCENT,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'oklch(0.18 0.03 80)', flexShrink: 0,
            }}>◆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Planner Agent</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>S&amp;OP planning assistant</div>
            </div>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 4,
              color: demoMode ? 'oklch(0.75 0.18 145)' : 'oklch(0.75 0.18 260)',
              border: `1px solid ${demoMode ? 'oklch(0.45 0.12 145 / 0.4)' : 'oklch(0.55 0.18 260 / 0.4)'}`,
            }}>{demoMode ? 'DEMO' : 'LIVE'}</span>
          </div>

          {/* Body */}
          {demoMode ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 32, gap: 10,
            }}>
              <div style={{ fontSize: 30 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Chat needs Live mode</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                The Planner agent runs on Azure OpenAI, which is only available in Live mode.
                Switch to Live mode on the Home page to chat.
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Bubble role="assistant" content={GREETING} />
                {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
                {loading && <Bubble role="assistant" content="…" muted />}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 10, display: 'flex', gap: 8 }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask the planner…"
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', boxSizing: 'border-box',
                    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '9px 11px', fontSize: 13, color: 'var(--text-1)', outline: 'none',
                    fontFamily: 'inherit', maxHeight: 96,
                  }}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  style={{
                    flexShrink: 0, padding: '0 16px', borderRadius: 8, border: 'none',
                    background: ACCENT, color: 'oklch(0.18 0.03 80)', fontWeight: 700, fontSize: 13,
                    cursor: input.trim() && !loading ? 'pointer' : 'default',
                    opacity: input.trim() && !loading ? 1 : 0.5,
                  }}
                >Send</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({ role, content, muted }: { role: 'user' | 'assistant'; content: string; muted?: boolean }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%', padding: '9px 12px', borderRadius: 11, fontSize: 13, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: isUser ? 'oklch(0.55 0.18 260)' : 'var(--bg-base)',
        color: isUser ? '#fff' : 'var(--text-1)',
        border: isUser ? 'none' : '1px solid var(--border-subtle)',
        opacity: muted ? 0.6 : 1,
        borderBottomRightRadius: isUser ? 3 : 11,
        borderBottomLeftRadius: isUser ? 11 : 3,
      }}>{content}</div>
    </div>
  );
}
