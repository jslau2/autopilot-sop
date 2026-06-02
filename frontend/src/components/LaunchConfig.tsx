import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { suggestName } from '../hooks/useLaunchCycle';
import { useEntity, ALL_ENTITIES } from '../hooks/useEntity';
import { TEMPLATES } from '../data/templates';
import { AGENTS } from '../data/agents';

export const DEFAULT_GOAL = `Q3-2026 S&OP Planning Cycle — Shimano APAC Manufacturing
Scope: 847 SKUs, 12 plants (SPL + SBMB), planning horizon W22–W34 (13 weeks)
Targets: OTIF ≥ 98%, Gross Margin ≥ 22%, Weeks of Supply 4–5 wks
Data sources: SAP S/4HANA, Supplier Portal, Tooling Asset Register
Constraints: Line 4 bottleneck (SPL-L3 at 92%), Supplier X lead-time extension (8 weeks)`;

export default function LaunchConfig({
  demoMode,
  onClose,
  onLaunch,
  initialGoal,
  initialName,
  scenarioOf,
}: {
  demoMode: boolean;
  onClose: () => void;
  onLaunch: (goal: string, name: string, entity: string, agents: string[]) => void;
  initialGoal?: string;
  initialName?: string;
  scenarioOf?: string;
}) {
  const { active, entities } = useEntity();
  const [goal, setGoal] = useState(initialGoal ?? DEFAULT_GOAL);
  const [name, setName] = useState(() => initialName ?? suggestName(initialGoal ?? DEFAULT_GOAL));
  const [entity, setEntity] = useState(() => (active !== ALL_ENTITIES ? active : entities[0] ?? ''));
  const [nameTouched, setNameTouched] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const accentColor = demoMode ? 'oklch(0.55 0.18 145)' : 'oklch(0.55 0.18 260)';

  // Live mode: which specialist agents are enabled (selectable for this run).
  // `selected` is the per-run subset; when it equals the full enabled set we
  // send nothing (the Planner runs all enabled and skips what's irrelevant).
  const [enabledAgents, setEnabledAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (demoMode) return;
    fetch('/api/agents')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.agents) return;
        const ids = d.agents.filter((a: { id: string; enabled?: boolean }) => a.id !== 'planner' && a.enabled !== false).map((a: { id: string }) => a.id);
        setEnabledAgents(ids);
        setSelected(ids);  // default: all enabled selected
      })
      .catch(() => { /* picker stays hidden if config can't load */ });
  }, [demoMode]);

  const toggleAgent = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  // Live mode: ask the LLM for a name based on the goal.
  const suggestViaLLM = async () => {
    setSuggesting(true);
    try {
      const res = await fetch('/api/sessions/suggest-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (data.name) { setName(data.name); setNameTouched(true); }
    } catch {
      // fall back to the existing heuristic name silently
    } finally {
      setSuggesting(false);
    }
  };

  // Keep the suggested name in sync with the goal until the user edits it.
  const onGoalChange = (v: string) => {
    setGoal(v);
    if (!nameTouched) setName(suggestName(v));
  };

  // The agent picker is shown only in live mode once enabled agents are known.
  const pickerActive = !demoMode && enabledAgents.length > 0;
  // A run needs at least one specialist — block launch if all are deselected.
  const noneSelected = pickerActive && selected.length === 0;

  const launch = () => {
    if (!goal.trim() || noneSelected) return;
    // Send an explicit subset only when narrowed to *some* (not all) agents;
    // when all are selected, pass [] so the backend runs all enabled (Planner
    // decides what to skip).
    const narrowed = pickerActive && selected.length < enabledAgents.length;
    onLaunch(goal, name.trim(), entity, narrowed ? selected : []);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'oklch(0.08 0.01 250 / 0.72)',
        backdropFilter: 'blur(6px)',
        padding: 32,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20,
          boxShadow: '0 24px 64px oklch(0.04 0.01 250 / 0.7)',
          maxHeight: 'calc(100vh - 64px)', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 8px',
              borderRadius: 4, border: '1px solid',
              ...(demoMode
                ? { color: 'oklch(0.75 0.18 145)', background: 'oklch(0.45 0.12 145 / 0.12)', borderColor: 'oklch(0.45 0.12 145 / 0.4)' }
                : { color: 'oklch(0.75 0.18 260)', background: 'oklch(0.55 0.18 260 / 0.12)', borderColor: 'oklch(0.55 0.18 260 / 0.4)' }),
            }}>
              {demoMode ? 'DEMO MODE' : 'LIVE MODE'}
            </span>
            <Link to="/" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>
              Switch mode →
            </Link>
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 2,
              }}
              aria-label="Close"
            >×</button>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0, lineHeight: 1.2 }}>
            {scenarioOf ? 'What-if Scenario' : 'New Planning Cycle'}
          </h2>
          {scenarioOf && (
            <div style={{ fontSize: 12, color: accentColor, marginTop: 4, fontWeight: 600 }}>
              ⎇ Branched from “{scenarioOf}” — tweak the constraints below
            </div>
          )}
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, marginBottom: 0 }}>
            {demoMode
              ? 'Runs a scripted simulation — no backend required.'
              : 'Dispatches real AI agents via Azure OpenAI — backend must be running.'}
          </p>
        </div>

        {/* Template quick-pick */}
        {!scenarioOf && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              START FROM A TEMPLATE
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setGoal(t.goal); setName(t.name); setNameTouched(true); }}
                  title={t.blurb}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                    background: 'var(--bg-base)', border: `1px solid ${t.accent.replace(')', ' / 0.5)')}`,
                    color: 'var(--text-2)',
                  }}
                >{t.icon} {t.title}</button>
              ))}
            </div>
          </div>
        )}

        {/* Cycle name */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            CYCLE NAME
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setNameTouched(true); }}
              placeholder="Auto-named from goal if left blank"
              style={{
                flex: 1, boxSizing: 'border-box',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 7, padding: '9px 12px',
                fontSize: 13, color: 'var(--text-1)', outline: 'none',
              }}
            />
            {!demoMode && (
              <button
                onClick={suggestViaLLM}
                disabled={suggesting || !goal.trim()}
                title="Suggest a name with AI"
                style={{
                  flexShrink: 0, padding: '0 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-base)', border: `1px solid ${accentColor.replace(')', ' / 0.5)')}`,
                  color: suggesting ? 'var(--text-3)' : accentColor, cursor: suggesting ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >{suggesting ? '…' : '✨ Suggest'}</button>
            )}
          </div>
        </div>

        {/* Planning entity */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            PLANNING ENTITY
          </label>
          <select
            value={entity}
            onChange={e => setEntity(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 7, padding: '9px 12px', fontSize: 13, color: 'var(--text-1)', outline: 'none',
            }}
          >
            {entities.map(en => <option key={en} value={en}>{en}</option>)}
          </select>
        </div>

        {/* Goal editor */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            PLANNING GOAL
          </label>
          <textarea
            value={goal}
            onChange={e => onGoalChange(e.target.value)}
            rows={6}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 7, padding: '10px 12px',
              fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-1)',
              resize: 'vertical', lineHeight: 1.6, outline: 'none',
            }}
          />
        </div>

        {/* Agent selection (live mode) — narrow which specialists run this cycle */}
        {!demoMode && enabledAgents.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                AGENTS · {selected.length}/{enabledAgents.length}
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSelected(enabledAgents)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)' }}>All</button>
                <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)' }}>None</button>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>
              All enabled agents run by default; the Planner skips any irrelevant to the goal. Deselect to force-exclude an agent from this run. (Enable/disable agents globally in Agent Settings.)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {enabledAgents.map(id => {
                const ag = AGENTS[id];
                const on = selected.includes(id);
                const color = ag?.rawColor ?? accentColor;
                return (
                  <button
                    key={id}
                    onClick={() => toggleAgent(id)}
                    aria-pressed={on}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                      background: on ? color.replace(')', ' / 0.16)') : 'var(--bg-base)',
                      border: `1px solid ${on ? color.replace(')', ' / 0.6)') : 'var(--border)'}`,
                      color: on ? 'var(--text-1)' : 'var(--text-3)',
                      opacity: on ? 1 : 0.6,
                    }}
                  >{on ? '✓ ' : ''}{ag?.name ?? id}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scope chips */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
            SCOPE
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['847 SKUs', '12 plants', 'W22–W34 horizon', 'SAP S/4HANA', 'Supplier Portal', 'OTIF ≥ 98%', 'Margin ≥ 22%'].map(chip => (
              <span key={chip} style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}>{chip}</span>
            ))}
          </div>
        </div>

        {/* Launch button */}
        <button
          onClick={launch}
          disabled={!goal.trim() || noneSelected}
          title={noneSelected ? 'Select at least one agent to run' : undefined}
          style={{
            padding: '13px 0', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: accentColor, color: '#fff', border: 'none',
            cursor: (!goal.trim() || noneSelected) ? 'not-allowed' : 'pointer',
            opacity: (goal.trim() && !noneSelected) ? 1 : 0.5, transition: 'opacity 0.15s',
            boxShadow: `0 4px 16px ${accentColor.replace(')', ' / 0.35)')}`,
          }}
        >
          {noneSelected ? 'Select at least one agent' : demoMode ? '▶  Run Simulation' : '⚡  Launch Live Run'}
        </button>
      </div>
    </div>
  );
}
