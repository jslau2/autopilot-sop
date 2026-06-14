import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Register the dagre (hierarchical) layout once.
let dagreRegistered = false;
function ensureDagre() {
  if (!dagreRegistered) {
    cytoscape.use(dagre);
    dagreRegistered = true;
  }
}

// Color by MaterialType — finished goods, semi-finished, raw, other.
// Uses literal oklch() (not CSS vars) because cytoscape paints to canvas, not the DOM.
const TYPE_COLOR: Record<string, string> = {
  FERT: 'oklch(0.70 0.17 148)', // finished goods — green
  SFUB: 'oklch(0.74 0.14 235)', // semi-finished — blue
  SFPB: 'oklch(0.66 0.15 235)',
  SFPR: 'oklch(0.60 0.13 235)',
  ROH:  'oklch(0.72 0.17 55)',  // raw material — amber
  PROD: 'oklch(0.70 0.20 308)', // production — purple
  SUB:  'oklch(0.72 0.18 325)',
  VERP: 'oklch(0.74 0.15 190)', // packaging — teal
};
const DEFAULT_COLOR = 'oklch(0.62 0.03 250)';
const FOCUS_COLOR = 'oklch(0.80 0.16 78)'; // planner gold — the focus node

export function colorFor(type: string | null | undefined): string {
  return (type && TYPE_COLOR[type]) || DEFAULT_COLOR;
}

export interface GraphNode { material: string; description: string | null; material_type: string | null; level?: number; }
export interface GraphEdge { source: string; target: string; quantity: string | number | null; }

const LEGEND: { label: string; type: string }[] = [
  { label: 'Finished (FERT)', type: 'FERT' },
  { label: 'Semi-finished', type: 'SFUB' },
  { label: 'Raw (ROH)', type: 'ROH' },
  { label: 'Other', type: '_other' },
];

/**
 * Presentational hierarchical graph. Renders the given nodes/edges with a dagre
 * layout; no data fetching. `focusId` highlights/enlarges a node; `onReroot` (if
 * provided) fires on double-tap so a parent can re-center the graph.
 */
export default function GraphCanvas({
  nodes, edges, focusId, height = 480, onReroot,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId?: string;
  height?: number;
  onReroot?: (material: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    ensureDagre();

    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map(n => ({
        data: {
          id: n.material,
          label: n.material,
          desc: n.description || '',
          mtype: n.material_type || '',
          color: n.material === focusId ? FOCUS_COLOR : colorFor(n.material_type),
          isFocus: n.material === focusId ? 1 : 0,
        },
      })),
      // Drop edges whose endpoints aren't in the node set (defensive).
      ...edges
        .filter(e => nodes.some(n => n.material === e.source) && nodes.some(n => n.material === e.target))
        .map(e => ({
          data: {
            id: `${e.source}->${e.target}`,
            source: e.source,
            target: e.target,
            qty: e.quantity != null && Number(e.quantity) !== 1 ? `×${e.quantity}` : '',
          },
        })),
    ];

    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: 'oklch(0.97 0 0)',
            'font-size': 9,
            'text-valign': 'center',
            'text-halign': 'center',
            width: 18,
            height: 18,
            'border-width': 'data(isFocus)',
            'border-color': 'oklch(0.98 0 0)',
            'text-outline-width': 2,
            'text-outline-color': 'data(color)',
          },
        },
        { selector: 'node[isFocus = 1]', style: { width: 30, height: 30, 'font-size': 11, 'border-width': 2 } },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': 'oklch(0.55 0.02 250)',
            'target-arrow-color': 'oklch(0.55 0.02 250)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            label: 'data(qty)',
            'font-size': 8,
            color: 'oklch(0.75 0.02 250)',
            'text-background-color': 'oklch(0.18 0.01 250)',
            'text-background-opacity': 0.8,
            'text-background-padding': '1px',
          },
        },
      ],
      layout: { name: 'dagre', rankDir: 'TB', nodeSep: 18, rankSep: 42, animate: false } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 3,
    });

    cy.on('tap', 'node', evt => {
      const d = evt.target.data();
      setSelected({ material: d.id, description: d.desc, material_type: d.mtype });
    });
    if (onReroot) cy.on('dbltap', 'node', evt => onReroot(evt.target.id()));

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [nodes, edges, focusId, onReroot]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height, width: '100%', background: 'oklch(0.16 0.01 250)', borderRadius: 6 }} />
      <button
        onClick={() => cyRef.current?.fit(undefined, 30)}
        style={{ position: 'absolute', right: 10, bottom: 10, fontSize: 11, padding: '4px 10px', cursor: 'pointer', background: 'oklch(0.2 0.01 250 / 0.9)', color: 'var(--text-2)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}
      >Fit</button>

      {/* Legend */}
      <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 3, background: 'oklch(0.18 0.01 250 / 0.85)', padding: '6px 8px', borderRadius: 6 }}>
        {LEGEND.map(l => (
          <div key={l.type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'oklch(0.85 0 0)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.type === '_other' ? DEFAULT_COLOR : colorFor(l.type) }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Selected node detail */}
      {selected && (
        <div style={{ position: 'absolute', right: 10, top: 10, maxWidth: 260, background: 'oklch(0.18 0.01 250 / 0.94)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'oklch(0.95 0 0)' }}>{selected.material}</div>
          <div style={{ fontSize: 10, color: 'oklch(0.78 0 0)', marginTop: 2 }}>{selected.description || '—'}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: colorFor(selected.material_type), color: 'oklch(0.15 0 0)', fontWeight: 700 }}>{selected.material_type || '—'}</span>
            {onReroot && selected.material !== focusId && (
              <button onClick={() => onReroot(selected.material)}
                style={{ fontSize: 9.5, padding: '2px 8px', cursor: 'pointer', background: 'var(--ag-masterdata)', color: 'oklch(0.15 0 0)', border: 'none', borderRadius: 4, fontWeight: 600 }}>
                Re-root here
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
