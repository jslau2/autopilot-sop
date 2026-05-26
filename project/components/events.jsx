// components/events.jsx
const { useRef: useEvtRef, useEffect: useEvtEffect } = React;

const EVT_ICON = {
  start:    '▶',
  done:     '✓',
  question: '⏸',
  answer:   '↳',
  log:      '·',
};

function EventStreamBar() {
  const ctx     = React.useContext(window.DashboardContext);
  const { events } = ctx;
  const listRef = useEvtRef(null);

  // Auto-scroll to bottom on new events
  useEvtEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  const sessionRunning = ctx.sessionStatus !== 'done';

  return (
    <div className="event-bar">
      <div className="event-bar-hd">
        <span className="evb-title">Event Stream</span>
        <span className="evb-count">{events.length} events</span>
        {sessionRunning && (
          <div className="evb-live">
            <span className="live-dot" />
            LIVE
          </div>
        )}
        {!sessionRunning && (
          <div className="evb-done">COMPLETE</div>
        )}
      </div>

      <div className="event-list" ref={listRef}>
        {events.map((evt, i) => {
          const ag    = evt.agent && evt.agent !== 'user' ? window.AGENTS[evt.agent] : null;
          const icon  = EVT_ICON[evt.type] || '·';
          const isQ   = evt.type === 'question';
          const isAns = evt.type === 'answer';

          return (
            <div key={i} className={`evt-row${isQ ? ' evt-question' : ''}${isAns ? ' evt-answer' : ''}`}>
              <span className="evt-ts mono">{evt.ts}</span>
              <span className={`evt-icon evt-icon-${evt.type}`}>{icon}</span>
              {ag
                ? <span className="evt-agent" style={{ color: ag.color }}>{ag.name}</span>
                : <span className="evt-agent evt-agent-user">User</span>
              }
              <span className="evt-msg">{evt.message}</span>
            </div>
          );
        })}

        {events.length === 0 && (
          <div className="evt-empty">Waiting for pipeline events…</div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { EventStreamBar });
