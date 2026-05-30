/**
 * One-click scenario templates — remove the blank-canvas problem and show the
 * product's range instantly. Each seeds the launch config with a goal + name.
 */
export interface ScenarioTemplate {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  accent: string;   // oklch
  name: string;
  goal: string;
}

export const TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'baseline',
    title: 'Standard S&OP Cycle',
    icon: '📋',
    blurb: 'The full quarterly plan across all SKUs and plants.',
    accent: 'oklch(0.68 0.17 255)',
    name: 'Q3-2026 S&OP Cycle',
    goal: `Q3-2026 S&OP Planning Cycle — Shimano APAC Manufacturing
Scope: 847 SKUs, 12 plants (SPL + SBMB), planning horizon W22–W34 (13 weeks)
Targets: OTIF ≥ 98%, Gross Margin ≥ 22%, Weeks of Supply 4–5 wks
Data sources: SAP S/4HANA, Supplier Portal, Tooling Asset Register
Constraints: Line 4 bottleneck (SPL-L3 at 92%)`,
  },
  {
    id: 'surge',
    title: 'Demand Surge',
    icon: '📈',
    blurb: 'A sudden +30% spike on a hero SKU — can we serve it?',
    accent: 'oklch(0.73 0.19 48)',
    name: 'Demand Surge Scenario',
    goal: `Demand Surge Scenario — Shimano APAC
Scope: 847 SKUs, 12 plants, horizon W22–W34
Event: SKU-88X demand spikes +34% vs forecast over W24–W28.
Question: can we protect OTIF ≥ 98% without breaching capacity, and at what margin/EBIT cost?
Targets: OTIF ≥ 98%, WoS 4–5 wks. Flag capacity and supply risks.`,
  },
  {
    id: 'supplier',
    title: 'Supplier Disruption',
    icon: '⛓️‍💥',
    blurb: 'A key supplier slips 8 weeks — contingency sourcing.',
    accent: 'oklch(0.70 0.21 15)',
    name: 'Supplier X Disruption Contingency',
    goal: `Supplier Disruption Contingency — Shimano APAC
Scope: 847 SKUs, 12 plants, horizon W18–W26
Event: Supplier X extends lead time by 8 weeks on 12 critical components.
Question: re-plan supply with dual-sourcing / safety-stock draw-down to hold service; quantify the margin impact.
Targets: hold OTIF ≥ 96%; minimise EBIT erosion. Produce a risk register.`,
  },
  {
    id: 'launch',
    title: 'New Product Launch',
    icon: '🚀',
    blurb: 'Ramp a new line in alongside the base plan.',
    accent: 'oklch(0.70 0.20 308)',
    name: 'New Product Launch Ramp',
    goal: `New Product Launch Ramp — Shimano APAC
Scope: base 847 SKUs + 18 new launch SKUs, horizon W26–W38
Event: phased launch ramp for a new component family; tooling and capacity must be reserved.
Question: sequence the ramp without starving the base plan; check tooling readiness and capacity.
Targets: launch OTIF ≥ 95%, base plan OTIF ≥ 98%.`,
  },
  {
    id: 'costdown',
    title: 'Cost-down Quarter',
    icon: '💵',
    blurb: 'Margin-first plan — trim cost while holding service.',
    accent: 'oklch(0.72 0.17 148)',
    name: 'Cost-down Quarter',
    goal: `Cost-down Quarter — Shimano APAC
Scope: 847 SKUs, 12 plants, horizon W22–W34
Objective: maximise EBIT / gross margin while keeping OTIF ≥ 97%.
Levers: trim safety stock to policy minimum, optimise run sizes, reduce overtime.
Targets: Gross Margin ≥ 24%, WoS 4 wks. Report the realised savings.`,
  },
];
