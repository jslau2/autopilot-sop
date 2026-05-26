import { useState } from 'react';

interface QuestionModalProps {
  question: { stepId: string; text: string };
  onAnswer: (answer: string) => void;
  onTerminate: () => void;
}

export default function QuestionModal({ question, onAnswer, onTerminate }: QuestionModalProps) {
  const [text, setText] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAnswer(text.trim());
    setText('');
  };

  return (
    <div className="q-overlay">
      <div className="q-modal">
        <div className="qm-hd">
          <span className="qm-agent">Planner</span>
          <span className="qm-badge">⏸ Decision Required</span>
        </div>
        <div className="qm-body">
          <p className="qm-text">{question.text}</p>
          <form className="qm-form" onSubmit={submit}>
            <textarea
              className="qm-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="State your decision (e.g. Option A — approve overtime)…"
              autoFocus
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={onTerminate}
                style={{
                  fontSize: 11.5, fontWeight: 500, color: 'var(--danger)',
                  background: 'oklch(from var(--danger) l c h / .1)',
                  border: '1px solid oklch(from var(--danger) l c h / .3)',
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                }}
              >
                ⛔ Terminate session
              </button>
              <span style={{ flex: 1 }} />
              <button type="submit" className="qm-submit" disabled={!text.trim()}>
                Confirm Decision →
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
