import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

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
const HIST_KEY = 'sop-chat-history';

function loadMessages(): Msg[] {
  try {
    const s = localStorage.getItem(HIST_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return [];
}

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
  const [messages, setMessages] = useState<Msg[]>(loadMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<Pos>(loadPos);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The chat is ONE continuous thread (global localStorage history) — it never
  // switches context based on navigation. When viewing a specific run, that run's
  // id is passed as a lightweight hint so "this run" resolves, without ever
  // swapping the conversation out from under the user.
  const { pathname } = useLocation();
  const runMatch = pathname.match(/^\/pipeline\/([^/]+)/);
  const runHint = runMatch && runMatch[1] !== 'demo' ? runMatch[1] : null;

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

  // Persist the chat history locally.
  useEffect(() => {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    try { localStorage.removeItem(HIST_KEY); } catch { /* ignore */ }
  };

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
      // Pass the viewed run id as a hint so "this run" resolves to real data —
      // the conversation history is never swapped.
      const body = { messages: next, ...(runHint ? { session_id: runHint } : {}) };
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // Stream tokens into a growing assistant bubble for a live-typing feel.
      setMessages(m => [...m, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(m => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
      if (!acc) {
        setMessages(m => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: 'assistant', content: '(no response)' };
          return copy;
        });
      }
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
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          // Orbiting agent core — an autonomous orchestrator coordinating agents
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
            <g>
              <circle cx="19.5" cy="12" r="1.9" fill="currentColor" />
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="6s" repeatCount="indefinite" />
            </g>
            <g>
              <circle cx="6" cy="12" r="1.3" fill="currentColor" opacity="0.7" />
              <animateTransform attributeName="transform" type="rotate" from="120 12 12" to="480 12 12" dur="9s" repeatCount="indefinite" />
            </g>
            <circle cx="12" cy="12" r="3.4" fill="currentColor">
              <animate attributeName="r" values="3;3.7;3" dur="2.6s" repeatCount="indefinite" />
            </circle>
          </svg>
        )}
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
              color: 'oklch(0.18 0.03 80)', flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
                <circle cx="19.5" cy="12" r="1.9" fill="currentColor" />
                <circle cx="6" cy="12" r="1.3" fill="currentColor" opacity="0.7" />
                <circle cx="12" cy="12" r="3.4" fill="currentColor" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Planner Agent</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>S&OP planning assistant</div>
            </div>
            {!demoMode && messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat history"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 5,
                  color: 'var(--text-3)', fontSize: 10.5, fontWeight: 600, padding: '2px 7px',
                  cursor: 'pointer',
                }}
              >Clear</button>
            )}
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
        wordBreak: 'break-word',
        background: isUser ? 'oklch(0.55 0.18 260)' : 'var(--bg-base)',
        color: isUser ? '#fff' : 'var(--text-1)',
        border: isUser ? 'none' : '1px solid var(--border-subtle)',
        opacity: muted ? 0.6 : 1,
        borderBottomRightRadius: isUser ? 3 : 11,
        borderBottomLeftRadius: isUser ? 11 : 3,
      }}><Markdown text={content} /></div>
    </div>
  );
}

// --- Lightweight, dependency-free markdown for chat bubbles -----------------
// Handles the subset the planner emits: **bold**, *italic*/_italic_, `code`,
// and bullet/numbered lists. Builds React nodes (never HTML) so it's XSS-safe.
const INLINE_RE = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) nodes.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(
      <code key={key} style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em',
        background: 'oklch(0.55 0.02 250 / 0.28)', padding: '1px 4px', borderRadius: 4, wordBreak: 'break-all',
      }}>{m[3]}</code>,
    );
    else nodes.push(<em key={key}>{m[4] ?? m[5]}</em>);
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items;
    const k = `b${blocks.length}`;
    const liStyle = { margin: '1px 0' } as const;
    const ulStyle = { margin: '4px 0', paddingLeft: 18 } as const;
    blocks.push(
      list.ordered
        ? <ol key={k} style={ulStyle}>{items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, `${k}-${j}`)}</li>)}</ol>
        : <ul key={k} style={ulStyle}>{items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, `${k}-${j}`)}</li>)}</ul>,
    );
    list = null;
  };

  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[1]);
    } else if (line.trim() === '') {
      flush();
      blocks.push(<div key={`s${blocks.length}`} style={{ height: 6 }} />);
    } else {
      flush();
      blocks.push(<div key={`p${blocks.length}`}>{renderInline(line, `p${blocks.length}`)}</div>);
    }
  }
  flush();
  return <>{blocks}</>;
}
