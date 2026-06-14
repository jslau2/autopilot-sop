import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import BomExplorerPanel from '../components/BomExplorerPanel';

export default function BomExplorer() {
  // Allow deep-linking a material: /bom-explorer?material=100A1301117
  const [params] = useSearchParams();
  const initial = params.get('material') || undefined;

  return (
    <AppShell active="bom">
      <div style={{ padding: '20px 28px 0', maxWidth: 1100 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>BOM Explorer</h1>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Neo4j BOM Graph · governed by the Master Data agent</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
          Explore the live product structure: explode an assembly into its multi-level components, or trace
          where a component is used. Double-tap any node to re-root the view.
        </p>
      </div>
      <div style={{ padding: '16px 28px 28px', maxWidth: 1100 }}>
        <BomExplorerPanel height={560} initialMaterial={initial} />
      </div>
    </AppShell>
  );
}
