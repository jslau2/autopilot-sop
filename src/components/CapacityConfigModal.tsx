import { useState } from 'react';

const CONFIG_DATA = {
  lines: [
    { plant: 'Plant 2', line: 'Line 4', type: 'Premium Assembly', rated: 480, oee: 85, shift: '2-Shift', hoursWk: 80, maint: 'W25 · 2d PM', status: 'constrained' },
    { plant: 'Plant 2', line: 'Line 1–3', type: 'Standard Assembly', rated: 1200, oee: 88, shift: '2-Shift', hoursWk: 120, maint: '—', status: 'ok' },
    { plant: 'Plant 7', line: 'All', type: 'Component Assy.', rated: 960, oee: 90, shift: '3-Shift', hoursWk: 168, maint: '—', status: 'ok' },
    { plant: 'Plant 5', line: 'Line 1–4', type: 'Accessories', rated: 800, oee: 85, shift: '2-Shift', hoursWk: 80, maint: 'W29 · 5d shut.', status: 'planned' },
    { plant: 'Plant 3', line: 'Line 2', type: 'Sub-Assembly', rated: 320, oee: 82, shift: '2-Shift', hoursWk: 40, maint: 'W22 · 1d tool', status: 'ok' },
    { plant: 'Plant 12', line: 'Line 1–2', type: 'EMEA Assembly', rated: 320, oee: 82, shift: '1-Shift', hoursWk: 40, maint: '—', status: 'ok' },
  ],
  maintenance: [
    { plant: 'Plant 2', line: 'Line 4', week: 'W25', days: 2, type: 'Preventive Maintenance', impact: '−960 units', owner: 'Maint. Engineering', locked: true },
    { plant: 'Plant 5', line: 'All Lines', week: 'W29', days: 5, type: 'Planned Annual Shutdown', impact: '−4,000 units', owner: 'Plant 5 Director', locked: true },
    { plant: 'Plant 3', line: 'Line 2', week: 'W22', days: 1, type: 'Tooling Change', impact: '−320 units', owner: 'Production Eng.', locked: false },
    { plant: 'Plant 7', line: 'Line 3', week: 'W31', days: 1, type: 'Calibration', impact: '−480 units', owner: 'Quality Eng.', locked: false },
  ],
  constraints: [
    { id: 'C-01', name: 'Line 4 Capacity Wall', impact: 'High', status: 'mitigated', mitigation: '840h OT approved', owner: 'Plant 2 Manager' },
    { id: 'C-02', name: 'Supplier X Lead Time +4wk', impact: 'High', status: 'in-progress', mitigation: 'Alt. sourcing activated', owner: 'Procurement' },
    { id: 'C-03', name: 'Tooling Shortage Plant 3', impact: 'Medium', status: 'open', mitigation: 'Manual workaround W22–W23', owner: 'Plant 3 Engineer' },
    { id: 'C-04', name: 'Plant 5 W29 Shutdown', impact: 'Medium', status: 'planned', mitigation: 'Pre-build buffer W27–W28', owner: 'Plant 5 Director' },
    { id: 'C-05', name: 'SKU-88X Demand Spike', impact: 'Medium', status: 'mitigated', mitigation: 'OT schedule applied Jul 4–25', owner: 'Capacity Planning' },
  ],
};

type TabId = 'lines' | 'maintenance' | 'constraints';

interface CapacityConfigModalProps {
  onClose: () => void;
}

export default function CapacityConfigModal({ onClose }: CapacityConfigModalProps) {
  const [tab, setTab] = useState<TabId>('lines');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const badge = (cls: string, label: string) => (
    <span className={`cfg-badge cfg-badge-${cls}`}>{label}</span>
  );

  const statusBadge = (s: string) => {
    const m: Record<string, [string, string]> = {
      ok: ['ok', 'OK'], constrained: ['warn', 'CONSTRAINED'], planned: ['plan', 'PLANNED'],
      'in-progress': ['ip', 'IN PROGRESS'], mitigated: ['ok', 'MITIGATED'], open: ['crit', 'OPEN'],
    };
    const [c, l] = m[s] ?? ['plan', s];
    return badge(c, l);
  };

  const impactBadge = (v: string) => badge(v === 'High' ? 'crit' : v === 'Medium' ? 'warn' : 'plan', v.toUpperCase());

  const TABS: [TabId, string][] = [
    ['lines', 'Lines & Capacity'],
    ['maintenance', 'Maintenance Windows'],
    ['constraints', 'Constraint Register'],
  ];

  return (
    <div className="cfg-overlay" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="cfg-modal">
        <div className="cfg-header">
          <div className="cfg-header-text">
            <div className="cfg-title">Master Capacity Configuration</div>
            <div className="cfg-subtitle">Q3-2026 · SPL &amp; SBMB Plan · W22–W34 · 12 plants · 6 assembly lines</div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="cfg-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={`cfg-tab${tab === id ? ' cfg-tab-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="cfg-body">
          {tab === 'lines' && (
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Plant</th><th>Line</th><th>Type</th><th>Rated Cap.</th>
                  <th>OEE Target</th><th>Shift</th><th>Hrs / Wk</th>
                  <th>Known Maintenance</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {CONFIG_DATA.lines.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-1)', fontWeight: 500 }}>{r.plant}</td>
                    <td>{r.line}</td>
                    <td style={{ color: 'var(--text-3)' }}>{r.type}</td>
                    <td><input className="cfg-input" defaultValue={r.rated + ' u/day'} style={{ width: 90 }} /></td>
                    <td><input className="cfg-input" defaultValue={r.oee + '%'} style={{ width: 56 }} /></td>
                    <td style={{ color: 'var(--text-2)' }}>{r.shift}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.hoursWk}h</td>
                    <td style={{ color: r.maint === '—' ? 'var(--text-3)' : 'var(--warning)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.maint}</td>
                    <td>{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'maintenance' && (
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Plant</th><th>Line</th><th>Week</th><th>Duration</th>
                  <th>Type</th><th>Capacity Impact</th><th>Owner</th><th>State</th>
                </tr>
              </thead>
              <tbody>
                {CONFIG_DATA.maintenance.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-1)', fontWeight: 500 }}>{r.plant}</td>
                    <td>{r.line}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-1)' }}>{r.week}</td>
                    <td><input className="cfg-input" defaultValue={r.days + ' day' + (r.days > 1 ? 's' : '')} style={{ width: 72 }} /></td>
                    <td>{r.type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)' }}>{r.impact}</td>
                    <td style={{ color: 'var(--text-3)' }}>{r.owner}</td>
                    <td>{badge(r.locked ? 'warn' : 'ip', r.locked ? 'LOCKED' : 'DRAFT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'constraints' && (
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>ID</th><th>Constraint</th><th>Impact</th><th>Status</th>
                  <th>Mitigation</th><th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {CONFIG_DATA.constraints.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{r.id}</td>
                    <td style={{ color: 'var(--text-1)', fontWeight: 500 }}>{r.name}</td>
                    <td>{impactBadge(r.impact)}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{r.mitigation}</td>
                    <td style={{ color: 'var(--text-3)' }}>{r.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="cfg-footer">
          <span className="cfg-footer-hint">Last saved 2026-05-23 07:30 UTC · Changes apply to next planning run</span>
          <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="cfg-btn-save" onClick={handleSave}>{saved ? '✓ Saved' : 'Save & Apply'}</button>
        </div>
      </div>
    </div>
  );
}
