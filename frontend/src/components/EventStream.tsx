import { useEffect, useRef } from 'react';
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

export default function EventStream() {
  const { events } = useDashboard();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="event-bar">
      <div className="evb-hd">
        <span className="evb-title">Event Stream</span>
        <span className="evb-count mono">{events.length} events</span>
        <div className="evb-live">
          <span className="msg-live-dot" />
          LIVE
        </div>
      </div>
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
    </div>
  );
}
