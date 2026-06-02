import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useDemoMode } from '../hooks/useDemoMode';

type Msg = { role: 'user' | 'assistant'; content: string };
type Pos = { left: number; top: number };
type Conv = { id: string; title: string; updated_at: number; message_count: number; run_hint?: string };

const GREETING =
  "Hi — I'm the Planner agent. Ask me about S&OP planning in general, or about a specific run " +
  "(its status, KPIs, or decisions) and I'll pull it up.";

const ACCENT = 'oklch(0.80 0.16 78)'; // planner agent color
const BTN = 52;
const GAP = 14;
const PANEL_W = 372;
const PANEL_H = 520;
const POS_KEY = 'sop-chat-pos';
const HIST_KEY = 'sop-chat-history';   // legacy single-thread store (migrated once)
const CLIENT_KEY = 'sop-client-id';    // per-browser owner id (no login yet)
const ACTIVE_KEY = 'sop-chat-active';  // last-opened conversation id

// Stable per-browser id so conversation history isn't shared across devices.
function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = (crypto as Crypto).randomUUID?.() || `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch { return 'anonymous'; }
}

// fetch wrapper that always carries the owner id + JSON content type.
function api(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId(), ...(init.headers || {}) },
  });
}

function loadLegacy(): Msg[] {
  try {
    const s = localStorage.getItem(HIST_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return [];
}

function relTime(ts: number): string {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
  // Shared demo/live store — reacts live to the top-bar toggle (even while open).
  const [demoMode] = useDemoMode();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<Pos>(loadPos);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Conversation history (server-side, scoped to this browser). The chat never
  // switches context on navigation — the user explicitly picks a conversation.
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  // When viewing a run, pass its id as a lightweight hint so "this run" resolves
  // — without ever swapping the conversation out from under the user.
  const { pathname } = useLocation();
  const runMatch = pathname.match(/^\/pipeline\/([^/]+)/);
  const runHint = runMatch && runMatch[1] !== 'demo' ? runMatch[1] : null;

  // Drag bookkeeping
  const posRef = useRef(pos);
  const dragRef = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const setPosBoth = (p: Pos) => { posRef.current = p; setPos(p); };

  const toggleOpen = () => setOpen(o => !o);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  // Remember the last-opened conversation across refreshes.
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch { /* ignore */ }
  }, [activeId]);

  // --- Conversation API helpers --------------------------------------------
  const refreshList = async (): Promise<Conv[]> => {
    try {
      const r = await api('/api/conversations');
      if (!r.ok) return [];
      const convs: Conv[] = (await r.json()).conversations ?? [];
      setConversations(convs);
      return convs;
    } catch { return []; }
  };

  const persistMessages = async (id: string, msgs: Msg[]) => {
    try {
      await api(`/api/conversations/${id}/messages`, {
        method: 'PUT',
        body: JSON.stringify({ messages: msgs, run_hint: runHint || '' }),
      });
    } catch { /* best-effort */ }
  };

  const loadConversation = async (id: string) => {
    setHistoryOpen(false);
    try {
      const r = await api(`/api/conversations/${id}`);
      if (!r.ok) return;
      const conv = await r.json();
      setMessages(conv.messages ?? []);
      setActiveId(id);
    } catch { /* ignore */ }
  };

  const newChat = () => {
    setMessages([]);
    setActiveId(null);   // a conversation is created lazily on first send
    setHistoryOpen(false);
  };

  const renameConversation = async (id: string, current: string) => {
    const title = window.prompt('Rename conversation', current || '')?.trim();
    if (!title) return;
    await api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }).catch(() => {});
    refreshList();
  };

  const deleteConversation = async (id: string) => {
    await api(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    if (id === activeId) newChat();
    refreshList();
  };

  // Load conversations (and the active thread) when opening the panel in live mode.
  useEffect(() => {
    if (!open || demoMode) return;
    let cancelled = false;
    (async () => {
      const list = await refreshList();
      // One-time migration: fold the legacy single-thread localStorage history
      // into a server-side conversation so nothing is lost.
      if (list.length === 0) {
        const legacy = loadLegacy();
        if (legacy.length) {
          try {
            const c = await (await api('/api/conversations', { method: 'POST', body: '{}' })).json();
            await persistMessages(c.id, legacy);
            localStorage.removeItem(HIST_KEY);
            if (!cancelled) { setActiveId(c.id); setMessages(legacy); }
            refreshList();
            return;
          } catch { /* fall through to empty */ }
        }
      }
      const resume = activeId && list.some(c => c.id === activeId) ? activeId : null;
      if (resume) {
        const r = await api(`/api/conversations/${resume}`);
        if (r.ok && !cancelled) setMessages((await r.json()).messages ?? []);
      } else if (!cancelled) {
        setMessages([]);
        setActiveId(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, demoMode]);

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

    let convId = activeId;
    try {
      // Lazily create the conversation on the first message of a new chat.
      if (!convId) {
        const c = await (await api('/api/conversations', {
          method: 'POST', body: JSON.stringify({ run_hint: runHint || '' }),
        })).json();
        convId = c.id;
        setActiveId(c.id);
      }

      // Pass the viewed run id as a hint so "this run" resolves to real data.
      const body = { messages: next, ...(runHint ? { session_id: runHint } : {}) };
      const res = await api('/api/chat/stream', { method: 'POST', body: JSON.stringify(body) });
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
      const finalMsgs: Msg[] = [...next, { role: 'assistant', content: acc || '(no response)' }];
      setMessages(finalMsgs);
      if (convId) { await persistMessages(convId, finalMsgs); refreshList(); }
    } catch {
      const errMsgs: Msg[] = [...next, {
        role: 'assistant',
        content: '⚠ Could not reach the planner — make sure the backend is running in live mode.',
      }];
      setMessages(errMsgs);
      if (convId) persistMessages(convId, errMsgs);
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
              <div style={{
                fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{conversations.find(c => c.id === activeId)?.title || 'S&OP planning assistant'}</div>
            </div>
            {!demoMode && (
              <>
                <IconBtn
                  title="New chat"
                  onClick={newChat}
                  path="M12 5v14M5 12h14"
                />
                <IconBtn
                  title="Conversation history"
                  onClick={() => setHistoryOpen(o => !o)}
                  active={historyOpen}
                  path="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8M3 4v4h4M12 7v5l3 2"
                />
              </>
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
          ) : historyOpen ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              <button
                onClick={newChat}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '9px 11px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-2)',
                  fontSize: 12.5, fontWeight: 600,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                New chat
              </button>
              {conversations.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                  No past conversations yet.
                </div>
              ) : conversations.map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '7px 8px', borderRadius: 8,
                    background: c.id === activeId ? 'var(--bg-base)' : 'transparent',
                    border: `1px solid ${c.id === activeId ? 'var(--border)' : 'transparent'}`,
                  }}
                >
                  <button
                    onClick={() => loadConversation(c.id)}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{c.title || 'New chat'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {c.message_count} msg{c.message_count === 1 ? '' : 's'} · {relTime(c.updated_at)}
                    </div>
                  </button>
                  <IconBtn small title="Rename" onClick={() => renameConversation(c.id, c.title)}
                    path="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  <IconBtn small title="Delete" onClick={() => deleteConversation(c.id)}
                    path="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </div>
              ))}
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

function IconBtn({ path, title, onClick, active, small }: {
  path: string; title: string; onClick: () => void; active?: boolean; small?: boolean;
}) {
  const sz = small ? 24 : 26;
  const icon = small ? 13 : 15;
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        flexShrink: 0, width: sz, height: sz, borderRadius: 6, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--bg-base)' : 'none',
        border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        color: 'var(--text-3)',
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
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
