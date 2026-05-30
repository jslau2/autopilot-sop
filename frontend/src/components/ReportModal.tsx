import { useMemo } from 'react';
import type { SimState } from '../types';
import { buildReport, reportToMarkdown, reportToHtml } from '../lib/report';
import { useExecSummary } from '../hooks/useExecSummary';
import FeedbackControl from './FeedbackControl';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return (s || 'cycle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'cycle';
}

/**
 * Executive report preview with Markdown + Print/PDF export. Works in demo and
 * live — the report is built entirely from the current session state.
 */
export default function ReportModal({
  S, name, goal, onClose, sessionId, demoMode,
}: {
  S: SimState; name: string; goal: string; onClose: () => void;
  sessionId?: string; demoMode?: boolean;
}) {
  const baseReport = useMemo(() => buildReport(S, { name, goal }), [S, name, goal]);
  const { summary, source, loading } = useExecSummary(baseReport, { sessionId, demoMode });
  const report = useMemo(() => ({ ...baseReport, execSummary: summary }), [baseReport, summary]);
  const html = useMemo(() => reportToHtml(report), [report]);
  const base = slug(name);

  const onMarkdown = () => download(`sop-report-${base}.md`, reportToMarkdown(report), 'text/markdown');

  const onPrint = () => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give the new document a tick to lay out before printing.
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

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
          width: '100%', maxWidth: 860, height: 'calc(100vh - 64px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Executive Report</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{name} · preview below</div>
          </div>
          <button className="cfg-toolbar-btn" onClick={onMarkdown}>⤓ Markdown</button>
          <button
            onClick={onPrint}
            style={{
              padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#fff',
            }}
          >⎙ Print / Save PDF</button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }}
            aria-label="Close"
          >×</button>
        </div>

        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
          background: 'oklch(0.55 0.18 260 / 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'oklch(0.78 0.16 260)' }}>
              ✦ EXECUTIVE SUMMARY
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {loading ? 'generating…' : source === 'llm' ? 'AI-generated' : 'auto-generated'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-1)' }}>{summary}</p>
        </div>

        <iframe
          title="Report preview"
          srcDoc={html}
          style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
        />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 18px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>How useful was this plan / run?</span>
          <FeedbackControl
            sessionId={sessionId}
            target="run"
            targetLabel={name}
            demoMode={demoMode}
            compact
          />
        </div>
      </div>
    </div>
  );
}
