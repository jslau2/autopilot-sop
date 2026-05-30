import { useMemo } from 'react';
import type { SimState } from '../types';
import { buildLineage } from '../lib/lineage';

/**
 * "Why?" — explainability + data lineage for a KPI. Traces the number back to
 * the agents that drove it, their reasoning, and the source systems / feeds.
 */
export default function ExplainModal({
  S, kpiKey, onClose,
}: {
  S: SimState; kpiKey: string; onClose: () => void;
}) {
  const lin = useMemo(() => buildLineage(S, kpiKey), [S, kpiKey]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 210, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: 'oklch(0.08 0.01 250 / 0.72)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 600, maxHeight: 'calc(100vh - 64px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Why is {lin.kpiLabel} = {lin.value}?</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Traced to the agents and data behind this number</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, padding: 2 }} aria-label="Close">×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18 }}>
          {lin.drivers.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
              No contributing agent steps yet — this number is still being computed.
            </div>
          )}

          {/* Lineage chain */}
          {lin.sources.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16, fontSize: 11.5 }}>
              <span style={{ color: 'var(--text-3)' }}>Lineage:</span>
              {lin.sources.map(s => (
                <span key={s} style={{ padding: '2px 8px', borderRadius: 12, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>🗄 {s}</span>
              ))}
              <span style={{ color: 'var(--border)' }}>→</span>
              <span style={{ color: 'var(--text-3)' }}>agents</span>
              <span style={{ color: 'var(--border)' }}>→</span>
              <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{lin.kpiLabel}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lin.drivers.map((d, i) => (
              <div key={i} style={{ border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${d.agentColor}`, borderRadius: 10, padding: '12px 14px', background: 'var(--bg-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: d.agentColor }}>{d.agentName}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {d.stepLabel}</span>
                </div>
                {d.dataSource && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>🗄 Source: <span style={{ color: 'var(--text-2)' }}>{d.dataSource}</span></div>
                )}
                {d.result && <div style={{ fontSize: 12.5, color: 'var(--text-1)', marginBottom: d.reasoning ? 5 : 0 }}>{d.result}</div>}
                {d.reasoning && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                    {d.reasoning.length > 320 ? d.reasoning.slice(0, 320) + '…' : d.reasoning}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
