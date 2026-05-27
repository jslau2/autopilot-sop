import { Link } from 'react-router-dom';

interface DataSource {
  id: string;
  system: string;
  module: string;
  description: string;
  agents: string[];
  records: string;
  lastSync: string;
  status: 'live' | 'connected' | 'file';
  color: string;
}

const SOURCES: DataSource[] = [
  {
    id: 'sap-mdg',
    system: 'SAP S/4HANA',
    module: 'MDG · BOM Repository',
    description: 'Master data governance, bills of materials, routing configurations',
    agents: ['Master Data'],
    records: '3,240 BOM records · 847 SKUs',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-masterdata)',
  },
  {
    id: 'sap-mm',
    system: 'SAP S/4HANA',
    module: 'MM · Materials Management',
    description: 'Purchase orders, supplier master, ATP/CTP positions, GR/GI movements',
    agents: ['Procurement', 'WIP'],
    records: '892 components · 47 suppliers',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-procurement)',
  },
  {
    id: 'sap-ibp',
    system: 'SAP IBP',
    module: 'Integrated Business Planning',
    description: 'Historical sales orders, promo calendar, market intelligence feeds',
    agents: ['AutoML Forecast'],
    records: '104 wks history · 847 SKUs',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-demand)',
  },
  {
    id: 'sap-pp',
    system: 'SAP S/4HANA',
    module: 'PP · Production Planning',
    description: 'Production orders, work centre capacities, MRP run outputs, WIP status',
    agents: ['SPI Analyst', 'WIP', 'Capacity Plan'],
    records: '12 plants · 847 active prod orders',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-spi)',
  },
  {
    id: 'sap-ppcds',
    system: 'SAP PP-CDS',
    module: 'PP-CDS · Detailed Scheduling',
    description: 'Assembly line loading, finite capacity scheduling, constraint propagation',
    agents: ['Capacity Plan'],
    records: '24 lines · W22–W34 horizon',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-capacity)',
  },
  {
    id: 'sap-wm',
    system: 'SAP S/4HANA',
    module: 'WM · Warehouse Management',
    description: 'Real-time stock positions, ABC classification, safety stock levels, bin locations',
    agents: ['Inventory Mgmt', 'SPI Analyst'],
    records: '847 SKUs · 12 storage locations',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-inventory)',
  },
  {
    id: 'sap-fico',
    system: 'SAP S/4HANA',
    module: 'FI/CO · Finance & Controlling',
    description: 'Standard costs, revenue actuals, margin analytics, EBIT reporting',
    agents: ['Finance'],
    records: '847 SKUs · P&L by product line',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-finance)',
  },
  {
    id: 'sap-pm',
    system: 'SAP PM',
    module: 'Plant Maintenance',
    description: 'Preventive maintenance schedules, breakdown history, asset criticality ratings',
    agents: ['Tooling & Mold'],
    records: '284 die sets · 1,200 mold assets',
    lastSync: 'Live',
    status: 'live',
    color: 'var(--ag-tooling)',
  },
  {
    id: 'supplier-portal',
    system: 'Supplier Portal',
    module: 'ATP Confirmations · Scorecards',
    description: 'Supplier commit confirmations, lead time updates, quality scorecards',
    agents: ['Procurement'],
    records: '47 tier-1 suppliers',
    lastSync: 'Live',
    status: 'connected',
    color: 'var(--ag-procurement)',
  },
  {
    id: 'mes',
    system: 'MES',
    module: 'Manufacturing Execution System',
    description: 'Real-time shop floor data, machine OEE, cycle times, scrap rates',
    agents: ['Capacity Plan', 'WIP'],
    records: '12 plants · real-time feeds',
    lastSync: 'Live',
    status: 'connected',
    color: 'var(--ag-wip)',
  },
  {
    id: 'tooling-register',
    system: 'Tooling Asset Register',
    module: 'Die Sets · Mold Asset Life',
    description: 'Tool life counters, PM schedules, qualification status, press compatibility',
    agents: ['Tooling & Mold'],
    records: '284 die sets · 1,200 molds',
    lastSync: 'Live',
    status: 'connected',
    color: 'var(--ag-tooling)',
  },
  {
    id: 'erm',
    system: 'Risk Register / ERM',
    module: 'Enterprise Risk Management',
    description: 'Supply risk scores, geopolitical flags, supplier financial health indicators',
    agents: ['Risk'],
    records: '15 active risk categories',
    lastSync: 'Live',
    status: 'connected',
    color: 'var(--ag-risk)',
  },
];

const GROUPS = [
  { label: 'SAP ERP Systems', ids: ['sap-mdg', 'sap-mm', 'sap-ibp', 'sap-pp', 'sap-ppcds', 'sap-wm', 'sap-fico', 'sap-pm'] },
  { label: 'External & Shop Floor', ids: ['supplier-portal', 'mes', 'tooling-register'] },
  { label: 'Risk & Compliance', ids: ['erm'] },
];

const STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  live:      { label: 'Live',      dot: 'var(--success)' },
  connected: { label: 'Connected', dot: 'oklch(0.75 0.18 220)' },
  file:      { label: 'File',      dot: 'oklch(0.75 0.15 55)' },
};

export default function DataSources() {
  const sourceMap = Object.fromEntries(SOURCES.map(s => [s.id, s]));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-1)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
      }}>
        <Link to="/pipeline" className="cfg-toolbar-btn" style={{ textDecoration: 'none' }}>← Pipeline</Link>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Data Sources</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{SOURCES.length} sources · {SOURCES.filter(s => s.status === 'live').length} live</span>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
        {/* Summary strip */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 28,
          padding: '12px 16px', borderRadius: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        }}>
          {[
            { label: 'SAP Modules', val: '7' },
            { label: 'External Systems', val: '4' },
            { label: 'Total SKUs', val: '847' },
            { label: 'Total Components', val: '892' },
            { label: 'Planning Horizon', val: 'W22–W34' },
            { label: 'Plants', val: '12' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 16, borderRight: '1px solid var(--border-subtle)' }}
              className="last:border-none">
              <span style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{item.label}</span>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{item.val}</span>
            </div>
          ))}
        </div>

        {/* Grouped source cards */}
        {GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>
              {group.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
              {group.ids.map(id => {
                const src = sourceMap[id];
                if (!src) return null;
                const st = STATUS_STYLES[src.status];
                return (
                  <div key={id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    borderLeft: `3px solid ${src.color}`,
                    borderRadius: 8, padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    transition: 'border-color 0.15s',
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: src.color, letterSpacing: '0.03em' }}>
                          {src.system}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginTop: 1 }}>
                          {src.module}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, boxShadow: `0 0 5px ${st.dot}` }} />
                        <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>{st.label}</span>
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
                      {src.description}
                    </div>

                    {/* Footer row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                        {src.records}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {src.agents.map(a => (
                          <span key={a} style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                            background: `${src.color}18`, color: src.color, border: `1px solid ${src.color}44`,
                          }}>{a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
