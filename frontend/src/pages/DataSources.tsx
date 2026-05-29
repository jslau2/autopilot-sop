import { useState } from 'react';
import AppShell from '../components/AppShell';

interface DataSource {
  id: string;
  system: string;
  module: string;
  description: string;
  agents: string[];
  records: string;
  status: 'live' | 'connected';
  color: string;
}

const SOURCES: DataSource[] = [
  { id: 'sap-mdg',         system: 'SAP S/4HANA',       module: 'MDG · BOM Repository',          description: 'Bills of materials, routing configs, master data governance', agents: ['Master Data'],              records: '3,240 BOM records · 847 SKUs',        status: 'live',      color: 'var(--ag-masterdata)'  },
  { id: 'sap-mm',          system: 'SAP S/4HANA',       module: 'MM · Materials Management',      description: 'Purchase orders, supplier master, ATP/CTP positions, GR/GI',   agents: ['Procurement', 'WIP'],      records: '892 components · 47 suppliers',       status: 'live',      color: 'var(--ag-procurement)' },
  { id: 'sap-ibp',         system: 'SAP IBP',            module: 'Integrated Business Planning',   description: 'Historical sales orders, promo calendar, market intelligence',  agents: ['AutoML Forecast'],         records: '104 wks history · 847 SKUs',          status: 'live',      color: 'var(--ag-demand)'      },
  { id: 'sap-pp',          system: 'SAP S/4HANA',       module: 'PP · Production Planning',       description: 'Production orders, work centre capacities, MRP outputs, WIP',  agents: ['SPI Analyst', 'WIP'],      records: '12 plants · 234 open prod orders',    status: 'live',      color: 'var(--ag-spi)'         },
  { id: 'sap-ppcds',       system: 'SAP PP-CDS',         module: 'PP-CDS · Detailed Scheduling',   description: 'Assembly line loading, finite capacity, constraint propagation', agents: ['Capacity Plan'],           records: '5 lines · W22–W34 horizon',           status: 'live',      color: 'var(--ag-capacity)'    },
  { id: 'sap-wm',          system: 'SAP S/4HANA',       module: 'WM · Warehouse Management',      description: 'Real-time stock positions, ABC classification, safety stock',    agents: ['Inventory Mgmt', 'SPI Analyst'], records: '847 SKUs · 12 locations',        status: 'live',      color: 'var(--ag-inventory)'   },
  { id: 'sap-fico',        system: 'SAP S/4HANA',       module: 'FI/CO · Finance & Controlling',  description: 'Standard costs, revenue actuals, margin analytics, EBIT',       agents: ['Finance'],                 records: '847 SKUs · P&L by product line',      status: 'live',      color: 'var(--ag-finance)'     },
  { id: 'sap-pm',          system: 'SAP PM',             module: 'Plant Maintenance',              description: 'PM schedules, breakdown history, asset criticality ratings',    agents: ['Tooling & Mold'],          records: '284 die sets · 1,200 mold assets',    status: 'live',      color: 'var(--ag-tooling)'     },
  { id: 'supplier-portal', system: 'Supplier Portal',    module: 'ATP Confirmations · Scorecards', description: 'Supplier commit confirmations, lead time updates, scorecards',   agents: ['Procurement'],             records: '47 tier-1 suppliers',                 status: 'connected', color: 'var(--ag-procurement)' },
  { id: 'mes',             system: 'MES',                module: 'Manufacturing Execution System', description: 'Real-time shop floor data, machine OEE, cycle times, scrap',    agents: ['Capacity Plan', 'WIP'],    records: '12 plants · real-time feeds',         status: 'connected', color: 'var(--ag-wip)'         },
  { id: 'tooling-register',system: 'Tooling Asset Register', module: 'Die Sets · Mold Asset Life', description: 'Tool life counters, PM schedules, qualification status',         agents: ['Tooling & Mold'],          records: '284 die sets · 1,200 molds',          status: 'connected', color: 'var(--ag-tooling)'     },
  { id: 'erm',             system: 'Risk Register / ERM', module: 'Enterprise Risk Management',   description: 'Supply risk scores, geopolitical flags, supplier health',        agents: ['Risk'],                    records: '15 active risk categories',           status: 'connected', color: 'var(--ag-risk)'        },
];

const GROUPS = [
  { label: 'SAP ERP Systems',       ids: ['sap-mdg', 'sap-mm', 'sap-ibp', 'sap-pp', 'sap-ppcds', 'sap-wm', 'sap-fico', 'sap-pm'] },
  { label: 'External & Shop Floor', ids: ['supplier-portal', 'mes', 'tooling-register'] },
  { label: 'Risk & Compliance',     ids: ['erm'] },
];

const STATUS_DOT: Record<string, string> = {
  live:      'var(--success)',
  connected: 'oklch(0.75 0.18 220)',
};

// ----- Data Preview Panel -----

type PreviewData = Record<string, unknown>;

function isRowArray(val: unknown): val is Record<string, unknown>[] {
  return Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function TableBlock({ rows, color }: { rows: Record<string, unknown>[]; color: string }) {
  const keys = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {keys.map(k => (
              <th key={k} style={{
                textAlign: 'left', padding: '4px 8px', fontSize: 9.5, fontWeight: 700,
                letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase',
                borderBottom: `1px solid ${color}44`, whiteSpace: 'nowrap',
              }}>{k.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'oklch(0 0 0 / 0.03)' }}>
              {keys.map(k => {
                const v = row[k];
                const isRisk = k === 'risk' || k === 'severity_label' || k === 'status';
                const riskColor = v === 'CRITICAL' ? 'oklch(0.65 0.2 30)' : v === 'HIGH' ? 'oklch(0.7 0.18 55)' : v === 'MEDIUM' ? 'oklch(0.75 0.15 90)' : 'var(--text-2)';
                return (
                  <td key={k} style={{
                    padding: '5px 8px', borderBottom: '1px solid var(--border-subtle)',
                    color: isRisk && typeof v === 'string' ? riskColor : 'var(--text-1)',
                    fontWeight: isRisk ? 700 : 400,
                    fontFamily: typeof v === 'number' ? 'monospace' : undefined,
                    whiteSpace: 'nowrap',
                  }}>
                    {typeof v === 'boolean'
                      ? <span style={{ color: v ? 'var(--success)' : 'oklch(0.65 0.2 30)', fontWeight: 600 }}>{v ? 'Yes' : 'No'}</span>
                      : renderValue(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsGrid({ data, color }: { data: PreviewData; color: string }) {
  const scalars = Object.entries(data).filter(([, v]) =>
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
  if (scalars.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 16 }}>
      {scalars.map(([k, v]) => (
        <div key={k} style={{
          background: `${color}0e`, border: `1px solid ${color}33`,
          borderRadius: 6, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
            {k.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>
            {renderValue(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DataPreviewPanel({ src, onClose }: { src: DataSource; onClose: () => void }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    fetch(`/api/datasources/${src.id}/preview`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  });

  const sections = data
    ? Object.entries(data).filter(([, v]) => typeof v === 'object' && v !== null)
    : [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', justifyContent: 'flex-end',
      background: 'oklch(0 0 0 / 0.45)',
    }} onClick={e => e.currentTarget === e.target && onClose()}>
      <div style={{
        width: 680, maxWidth: '95vw', height: '100vh',
        background: 'var(--bg-card)', borderLeft: `3px solid ${src.color}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: src.color, letterSpacing: '0.04em' }}>{src.system}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>{src.module}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{src.description}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading data…</div>}
          {error && <div style={{ color: 'oklch(0.65 0.2 30)', fontSize: 13 }}>Error: {error}</div>}
          {data && (
            <>
              <StatsGrid data={data} color={src.color} />
              {sections.map(([key, val]) => (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: src.color, marginBottom: 8, paddingBottom: 4,
                    borderBottom: `1px solid ${src.color}33`,
                  }}>{key.replace(/_/g, ' ')}</div>
                  {isRowArray(val)
                    ? <TableBlock rows={val} color={src.color} />
                    : <pre style={{
                        fontSize: 11, color: 'var(--text-2)', background: 'oklch(0 0 0 / 0.12)',
                        border: '1px solid var(--border-subtle)', borderRadius: 6,
                        padding: '10px 12px', margin: 0, whiteSpace: 'pre-wrap', overflowX: 'auto',
                      }}>{JSON.stringify(val, null, 2)}</pre>
                  }
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Main Page -----

export default function DataSources() {
  const [selected, setSelected] = useState<DataSource | null>(null);
  const srcMap = Object.fromEntries(SOURCES.map(s => [s.id, s]));

  return (
    <AppShell active="data">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '20px 28px 0', maxWidth: 1100 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Data Sources</h1>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{SOURCES.length} sources · {SOURCES.filter(s => s.status === 'live').length} live</span>
      </div>

      <div style={{ padding: '16px 28px 28px', maxWidth: 1100 }}>
        {/* Summary strip */}
        <div style={{
          display: 'flex', gap: 0, marginBottom: 28,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden',
        }}>
          {[
            { label: 'SAP Modules', val: '7' },
            { label: 'External Systems', val: '4' },
            { label: 'Total SKUs', val: '847' },
            { label: 'Components', val: '892' },
            { label: 'Planning Horizon', val: 'W22–W34' },
            { label: 'Plants', val: '12' },
          ].map((item, i, arr) => (
            <div key={item.label} style={{
              flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
              padding: '12px 16px',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <span style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{item.label}</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-1)' }}>{item.val}</span>
            </div>
          ))}
        </div>

        {/* Grouped source cards */}
        {GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>
              {group.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
              {group.ids.map(id => {
                const src = srcMap[id];
                if (!src) return null;
                return (
                  <div
                    key={id}
                    onClick={() => setSelected(src)}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                      borderLeft: `3px solid ${src.color}`, borderRadius: 8, padding: '14px 16px',
                      display: 'flex', flexDirection: 'column', gap: 8,
                      cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${src.color}0a`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: src.color, letterSpacing: '0.03em' }}>{src.system}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginTop: 1 }}>{src.module}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[src.status], boxShadow: `0 0 5px ${STATUS_DOT[src.status]}` }} />
                        <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'capitalize' }}>{src.status}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{src.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{src.records}</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {src.agents.map(a => (
                          <span key={a} style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                            background: `${src.color}18`, color: src.color, border: `1px solid ${src.color}44`,
                          }}>{a}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: src.color, fontWeight: 600, marginTop: 2 }}>View data →</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && <DataPreviewPanel src={selected} onClose={() => setSelected(null)} />}
    </AppShell>
  );
}
