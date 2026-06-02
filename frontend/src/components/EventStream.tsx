import { useEffect, useRef, useState, useCallback } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { AGENTS } from '../data/agents';

const ICON_MAP: Record<string, { cls: string; char: string }> = {
  start:    { cls: 'evb-icon-start',    char: '▶' },
  done:     { cls: 'evb-icon-done',     char: '✓' },
  question: { cls: 'evb-icon-question', char: '⏸' },
  answer:   { cls: 'evb-icon-answer',   char: '↳' },
  log:      { cls: 'evb-icon-log',      char: '·' },
  terminate:{ cls: 'evb-icon-log',      char: '⛔' },
};

const HEADER_H = 30;          // collapsed height — just the title bar
const MIN_H = 120;            // smallest expanded height
const DEFAULT_H = 200;
const STORE_KEY = 'sop-eventstream';

function loadPref(): { collapsed: boolean; height: number } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { collapsed: !!p.collapsed, height: typeof p.height === 'number' ? p.height : DEFAULT_H };
    }
  } catch { /* ignore */ }
  return { collapsed: false, height: DEFAULT_H };
}

export default function EventStream() {
  const { events } = useDashboard();
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pref, setPref] = useState(loadPref);
  const { collapsed, height } = pref;
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const panelH = collapsed ? HEADER_H : height;

  // Persist collapse/height across runs.
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(pref)); } catch { /* ignore */ }
  }, [pref]);

  // Publish the panel's live height to .main-area so the swimlane can reserve
  // exactly that much room — keeping its horizontal scrollbar above the overlay
  // whether collapsed, expanded, or mid-drag.
  useEffect(() => {
    const area = panelRef.current?.closest('.main-area') as HTMLElement | null;
    area?.style.setProperty('--eventbar-cur-h', `${panelH}px`);
    return () => { area?.style.removeProperty('--eventbar-cur-h'); };
  }, [panelH]);

  // Auto-scroll to newest while expanded.
  useEffect(() => {
    if (!collapsed && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length, collapsed]);

  const onDragMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // Drag up (clientY decreases) → taller. Cap at 80% of viewport.
    const maxH = Math.max(MIN_H, window.innerHeight * 0.8);
    const next = Math.min(maxH, Math.max(MIN_H, d.startH + (d.startY - e.clientY)));
    setPref(p => ({ ...p, collapsed: false, height: next }));
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    document.body.style.userSelect = '';
  }, [onDragMove]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: collapsed ? MIN_H : height };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }, [collapsed, height, onDragMove, onDragEnd]);

  const toggle = () => setPref(p => ({ ...p, collapsed: !p.collapsed }));

  return (
    <div
      ref={panelRef}
      className="event-bar event-bar--overlay"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: panelH,
        zIndex: 40,
        boxShadow: '0 -8px 24px oklch(0.04 0.01 250 / 0.45)',
      }}
    >
      {/* Drag handle (top edge) — hidden when collapsed */}
      {!collapsed && (
        <div
          onPointerDown={onDragStart}
          title="Drag to resize"
          style={{
            position: 'absolute', top: -3, left: 0, right: 0, height: 7,
            cursor: 'ns-resize', zIndex: 2,
          }}
        />
      )}

      <div className="evb-hd" onDoubleClick={toggle} style={{ cursor: 'pointer' }}>
        <span className="evb-title">Event Stream</span>
        <span className="evb-count mono">{events.length} events</span>
        {!collapsed && (
          <div className="evb-live">
            <span className="msg-live-dot" />
            LIVE
          </div>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand event stream' : 'Collapse event stream'}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            marginLeft: collapsed ? 'auto' : 10, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, lineHeight: 1, padding: '2px 4px',
          }}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div className="evb-list" ref={listRef}>
          {events.map((ev, i) => {
            const agent = AGENTS[ev.agent];
            const color = agent?.color ?? 'var(--text-3)';
            const icon = ICON_MAP[ev.type] ?? ICON_MAP.log;
            return (
              <div key={i} className="evb-row">
                <span className="evb-ts mono">{ev.ts}</span>
                <span className={`evb-icon ${icon.cls}`}>{icon.char}</span>
                <span className="evb-agent" style={{ color }}>{agent?.name ?? ev.agent}</span>
                <span className="evb-msg">{ev.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
