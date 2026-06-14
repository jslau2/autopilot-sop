import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { GraphNode, GraphEdge } from './GraphCanvas';

// Lazy so cytoscape (~450 kB) stays a separate chunk, loaded only when a graph renders.
const BomGraph = lazy(() => import('./BomGraph'));
const GraphCanvas = lazy(() => import('./GraphCanvas'));

interface MaterialHit { material: string; description: string | null; material_type: string | null; }

interface AskResult {
  question?: string;
  cypher?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  node_count?: number;
  truncated?: boolean;
  error?: string;
  read_only_rejected?: boolean;
}

type View = { type: 'material'; material: string } | { type: 'nl' } | { type: 'none' };

const graphFallback = (h: number) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading graph…</div>
);

export default function BomExplorerPanel({ height = 520, initialMaterial }: { height?: number; initialMaterial?: string }) {
  const [view, setView] = useState<View>(initialMaterial ? { type: 'material', material: initialMaterial } : { type: 'none' });

  // Material code/description search
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MaterialHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Natural-language ask
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(() => {
      fetch(`/api/bom/search?q=${encodeURIComponent(q)}&limit=25`)
        .then(r => (r.ok ? r.json() : Promise.reject(r.status === 503 ? 'BOM graph unavailable' : r.statusText)))
        .then(d => { setHits(d.results || []); setSearchError(null); setSearching(false); })
        .catch(e => { setSearchError(String(e)); setSearching(false); });
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  function ask() {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setAskError(null);
    setAskResult(null);
    fetch('/api/bom/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.detail || r.statusText);
        return body as AskResult;
      })
      .then(res => { setAskResult(res); setView({ type: 'nl' }); setAsking(false); })
      .catch(e => { setAskError(String(e.message || e)); setAsking(false); });
  }

  const nlGraph = askResult && (askResult.nodes?.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Natural-language ask */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ag-masterdata)', letterSpacing: '0.04em', marginBottom: 6 }}>ASK IN PLAIN ENGLISH</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask(); }}
            placeholder="e.g. components shared across more than 5 finished goods"
            style={{ flex: 1, boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}
          />
          <button onClick={ask} disabled={asking || !question.trim()}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: asking ? 'default' : 'pointer', background: 'var(--ag-masterdata)', color: 'oklch(0.15 0 0)', border: 'none', borderRadius: 6, opacity: asking || !question.trim() ? 0.6 : 1 }}>
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
          Translated to a <strong>read-only</strong> Cypher query — write/modify queries are always rejected.
        </div>
        {askError && <div style={{ fontSize: 11, color: 'oklch(0.7 0.18 30)', marginTop: 4 }}>{askError}</div>}
      </div>

      {/* Material code search */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>OR SEARCH A MATERIAL</div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by code or description…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}
        />
        {searchError && <div style={{ fontSize: 11, color: 'oklch(0.7 0.18 30)', marginTop: 4 }}>{searchError}</div>}
        {query.trim().length >= 2 && (
          <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', border: hits.length ? '1px solid var(--border-subtle)' : 'none', borderRadius: 6 }}>
            {searching && <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 10px' }}>Searching…</div>}
            {!searching && hits.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 10px' }}>No matches.</div>}
            {hits.map(h => (
              <div
                key={h.material}
                onClick={() => { setView({ type: 'material', material: h.material }); setQuery(''); setHits([]); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'oklch(0.74 0.14 235 / 0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-1)', fontWeight: 600 }}>{h.material}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', flex: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.description}</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{h.material_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Result area */}
      {view.type === 'material' && (
        <Suspense fallback={graphFallback(height)}>
          <BomGraph material={view.material} height={height} />
        </Suspense>
      )}

      {view.type === 'nl' && askResult && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
          {askResult.cypher && (
            <details style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <summary style={{ fontSize: 11, color: 'var(--text-2)', padding: '8px 12px', cursor: 'pointer' }}>
                Generated Cypher{askResult.read_only_rejected ? ' · rejected (not read-only)' : ''}
              </summary>
              <pre style={{ fontSize: 11, color: 'var(--text-2)', background: 'oklch(0 0 0 / 0.18)', margin: 0, padding: '10px 12px', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{askResult.cypher}</pre>
            </details>
          )}
          {askResult.error
            ? <div style={{ padding: 16, fontSize: 13, color: 'oklch(0.7 0.18 30)' }}>{askResult.error}</div>
            : nlGraph
              ? <Suspense fallback={graphFallback(height)}>
                  <GraphCanvas nodes={askResult.nodes!} edges={askResult.edges || []} height={height} />
                </Suspense>
              : <NlTable result={askResult} />
          }
          {!askResult.error && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '6px 12px', borderTop: '1px solid var(--border-subtle)' }}>
              {nlGraph
                ? `${askResult.node_count} nodes${askResult.truncated ? ' · ⚠ truncated' : ''}`
                : `${askResult.row_count ?? askResult.rows?.length ?? 0} rows${askResult.truncated ? ' · ⚠ truncated' : ''}`}
            </div>
          )}
        </div>
      )}

      {view.type === 'none' && (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--border-subtle)', borderRadius: 8 }}>
          Ask a question or pick a material to visualize the BOM structure.
        </div>
      )}
    </div>
  );
}

function NlTable({ result }: { result: AskResult }) {
  const rows = result.rows || [];
  if (rows.length === 0) return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>No rows returned.</div>;
  const cols = result.columns?.length ? result.columns : Object.keys(rows[0]);
  const fmt = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <div style={{ overflowX: 'auto', maxHeight: 360 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '5px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{c.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'oklch(0 0 0 / 0.04)' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-1)', whiteSpace: 'nowrap', fontFamily: typeof row[c] === 'number' ? 'monospace' : undefined }}>{fmt(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
