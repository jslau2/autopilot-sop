import { TEMPLATES, type ScenarioTemplate } from '../data/templates';

/**
 * One-click scenario gallery. Clicking a card seeds the launch config with the
 * template's goal + name so users never face a blank canvas.
 */
export default function TemplateGallery({ onPick }: { onPick: (t: ScenarioTemplate) => void }) {
  return (
    <div className="sessions-panel" style={{ padding: 0 }}>
      <div className="sp-header">
        <span className="sp-title">Start from a template</span>
        <span className="sp-count">one-click scenarios</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 10, padding: 14,
      }}>
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left',
              padding: '13px 14px', borderRadius: 11, cursor: 'pointer',
              background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
              borderLeft: `3px solid ${t.accent}`, transition: 'border-color .15s, transform .1s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = t.accent; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.borderLeftColor = t.accent; }}
          >
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t.title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{t.blurb}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.accent, marginTop: 2 }}>Use template →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
