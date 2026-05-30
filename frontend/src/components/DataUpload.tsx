import { useState, useRef } from 'react';

/**
 * "Run it on YOUR data" — a real dropzone for the sidebar. Live mode uploads to
 * /api/uploads (parsed + profiled server-side); demo mode parses client-side.
 * "Plan on this data" launches a cycle seeded with a goal that references the
 * uploaded figures (+ upload_id in live mode so the agents see the numbers).
 */

export interface UploadSeed {
  goal?: string;
  name?: string;
  uploadId?: string;
}

interface Parsed {
  upload_id?: string;
  filename: string;
  columns: string[];
  roles: Record<string, string>;
  row_count: number;
  profile: Record<string, number | string>;
  summary: string;
}

const ROLE_HINTS: Record<string, string[]> = {
  sku: ['sku', 'item', 'material', 'part', 'product', 'article'],
  demand: ['demand', 'qty', 'quantity', 'forecast', 'sales', 'units', 'order'],
  inventory: ['inventory', 'stock', 'on_hand', 'onhand', 'soh', 'available'],
  date: ['date', 'week', 'period', 'month', 'wk'],
  plant: ['plant', 'site', 'location', 'warehouse', 'dc', 'facility'],
};

function detectDelim(headerLine: string): string {
  return [',', '\t', ';', '|'].sort((a, b) => headerLine.split(b).length - headerLine.split(a).length)[0];
}

/** Lightweight client-side CSV parse + profile for demo mode. */
function parseClientSide(filename: string, text: string): Parsed {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const delim = detectDelim(lines[0] || '');
  const columns = (lines[0] || '').split(delim).map(c => c.trim());
  const rows = lines.slice(1).map(l => {
    const cells = l.split(delim);
    const o: Record<string, string> = {};
    columns.forEach((c, i) => { o[c] = (cells[i] ?? '').trim(); });
    return o;
  });
  const roles: Record<string, string> = {};
  for (const [role, hints] of Object.entries(ROLE_HINTS)) {
    const col = columns.find(c => hints.some(h => c.toLowerCase().includes(h)));
    if (col) roles[role] = col;
  }
  const num = (v: string) => { const n = parseFloat((v || '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
  const profile: Record<string, number | string> = {};
  if (roles.sku) profile.unique_skus = new Set(rows.map(r => r[roles.sku]).filter(Boolean)).size;
  for (const m of ['demand', 'inventory'] as const) {
    if (roles[m]) {
      const vals = rows.map(r => num(r[roles[m]])).filter((v): v is number => v != null);
      if (vals.length) profile[`total_${m}`] = Math.round(vals.reduce((a, b) => a + b, 0));
    }
  }
  if (roles.plant) profile.plants = new Set(rows.map(r => r[roles.plant]).filter(Boolean)).size;

  const facts: string[] = [];
  if (profile.unique_skus) facts.push(`${profile.unique_skus} unique SKUs`);
  if (profile.plants) facts.push(`${profile.plants} plants/sites`);
  if (profile.total_demand != null) facts.push(`total demand ${Number(profile.total_demand).toLocaleString()}`);
  if (profile.total_inventory != null) facts.push(`total inventory ${Number(profile.total_inventory).toLocaleString()}`);
  const summary = `Uploaded dataset '${filename}' with ${rows.length.toLocaleString()} rows and columns: ${columns.slice(0, 12).join(', ')}.`
    + (facts.length ? ` Profile: ${facts.join(', ')}.` : '') + ' Plan using these figures where relevant.';

  return { filename, columns, roles, row_count: rows.length, profile, summary };
}

export default function DataUpload({
  demoMode, onPlan,
}: {
  demoMode: boolean;
  onPlan: (seed: UploadSeed) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(''); setBusy(true);
    try {
      if (file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
        setError('Excel not supported yet — export to CSV.');
        return;
      }
      if (demoMode) {
        const text = await file.text();
        setParsed(parseClientSide(file.name, text));
      } else {
        // Send the file as the raw request body (backend reads it directly,
        // no multipart dependency); pass the original name via query param.
        const res = await fetch(`/api/uploads?filename=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: file,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || `Upload failed (${res.status})`);
        }
        setParsed(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read file');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const planOnData = () => {
    if (!parsed) return;
    const goal = `Plan on uploaded data: ${parsed.filename}\n\n${parsed.summary}\n\n`
      + `Targets: maintain OTIF and weeks-of-supply within policy; flag capacity and supply risks from these figures.`;
    onPlan({
      goal,
      name: `Plan on ${parsed.filename.replace(/\.[^.]+$/, '')}`,
      uploadId: parsed.upload_id,
    });
  };

  if (parsed) {
    const chips: string[] = [];
    if (parsed.profile.unique_skus) chips.push(`${parsed.profile.unique_skus} SKUs`);
    if (parsed.profile.plants) chips.push(`${parsed.profile.plants} plants`);
    if (parsed.profile.total_demand != null) chips.push(`demand ${Number(parsed.profile.total_demand).toLocaleString()}`);
    if (parsed.profile.periods) chips.push(`${parsed.profile.periods} periods`);
    return (
      <div className="drop-zone" style={{ alignItems: 'stretch', textAlign: 'left', cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dz-file-dot" style={{ background: 'oklch(0.7 0.17 145)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {parsed.filename}
          </span>
          <button
            onClick={() => { setParsed(null); setError(''); }}
            title="Clear"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: 0 }}
          >×</button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0' }}>
          {parsed.row_count.toLocaleString()} rows · {parsed.columns.length} cols
        </div>
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {chips.map(c => (
              <span key={c} style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{c}</span>
            ))}
          </div>
        )}
        <button
          onClick={planOnData}
          style={{
            width: '100%', padding: '7px 0', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none',
          }}
        >▶ Plan on this data</button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{ cursor: 'pointer' }}
      >
        <div className="dz-icon">⬡</div>
        <div className="dz-hint">{busy ? 'Parsing…' : 'Drop CSV or click to upload'}</div>
        <div className="dz-current">
          <span className="dz-file-dot" />
          SAP S/4HANA · Live
        </div>
        <div className="dz-stats">or run on your own export</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
      />
      {error && <div style={{ fontSize: 10.5, color: 'oklch(0.72 0.18 25)', marginTop: 4 }}>{error}</div>}
    </>
  );
}
