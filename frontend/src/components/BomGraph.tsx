import { useEffect, useState } from 'react';
import GraphCanvas, { type GraphNode, type GraphEdge } from './GraphCanvas';

interface SubgraphData {
  material: string;
  direction: 'down' | 'up';
  found: boolean;
  truncated?: boolean;
  node_count?: number;
  edge_count?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type Direction = 'down' | 'up';

/**
 * Material-driven BOM graph: fetches a subgraph for `material` and renders it via
 * GraphCanvas, with explode/where-used + depth controls. Double-tap re-roots.
 */
export default function BomGraph({ material, height = 480 }: { material: string; height?: number }) {
  const [focus, setFocus] = useState(material);
  const [direction, setDirection] = useState<Direction>('down');
  const [levels, setLevels] = useState(6);
  const [data, setData] = useState<SubgraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setFocus(material); }, [material]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/bom/graph?material=${encodeURIComponent(focus)}&direction=${direction}&levels=${levels}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status === 503 ? 'BOM graph unavailable' : r.statusText)))
      .then((d: SubgraphData) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [focus, direction, levels]);

  const directionLabel = direction === 'down' ? 'Explosion (components)' : 'Where-used (assemblies)';

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          {(['down', 'up'] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', border: 'none',
                background: direction === d ? 'var(--ag-masterdata)' : 'transparent',
                color: direction === d ? 'oklch(0.15 0 0)' : 'var(--text-2)',
              }}
            >{d === 'down' ? '↓ Explode' : '↑ Where-used'}</button>
          ))}
        </div>
        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          Depth
          <select value={levels} onChange={e => setLevels(Number(e.target.value))}
            style={{ fontSize: 11, padding: '2px 4px', background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{directionLabel} · <span style={{ fontFamily: 'monospace' }}>{focus}</span></span>
        {data?.found && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {data.node_count} nodes · {data.edge_count} links{data.truncated ? ' · ⚠ truncated' : ''}
          </span>
        )}
      </div>

      {/* Canvas / states */}
      {loading && <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading graph…</div>}
      {error && <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'oklch(0.7 0.18 30)', fontSize: 13 }}>{error}</div>}
      {!loading && !error && data && !data.found && <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Material “{focus}” not found in the BOM graph.</div>}
      {!loading && !error && data?.found && (
        <GraphCanvas nodes={data.nodes} edges={data.edges} focusId={focus} height={height} onReroot={setFocus} />
      )}

      <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '6px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        Tap a node for details · double-tap to re-root · scroll to zoom, drag to pan
      </div>
    </div>
  );
}
