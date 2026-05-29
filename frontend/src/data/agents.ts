import type { Agent } from '../types';

export const AGENTS: Record<string, Agent> = {
  planner:     { id: 'planner',     name: 'Planner',          sub: 'Orchestrator',              color: 'var(--ag-planner)',     rawColor: 'oklch(0.80 0.16 78)',  code: 'PLN', llm: true },
  demand:      { id: 'demand',      name: 'AutoML Forecast',  sub: 'AutoML · Model Selection',  color: 'var(--ag-demand)',      rawColor: 'oklch(0.68 0.17 255)', code: 'AML', llm: true },
  spi:         { id: 'spi',         name: 'SPI Analyst',      sub: 'Sales · Prod · Inv',        color: 'var(--ag-spi)',         rawColor: 'oklch(0.74 0.15 190)', code: 'SPI', llm: true },
  capacity:    { id: 'capacity',    name: 'Capacity Plan',    sub: 'Assembly Loading',           color: 'var(--ag-capacity)',    rawColor: 'oklch(0.72 0.17 148)', code: 'CAP', llm: true },
  wip:         { id: 'wip',         name: 'WIP',              sub: 'PO · Shop Floor',            color: 'var(--ag-wip)',         rawColor: 'oklch(0.70 0.20 308)', code: 'WIP', llm: true },
  finance:     { id: 'finance',     name: 'Finance',          sub: 'P&L · Margin · OTIF',       color: 'var(--ag-finance)',     rawColor: 'oklch(0.73 0.19 48)',  code: 'FIN', llm: true },
  risk:        { id: 'risk',        name: 'Risk',             sub: 'Constraints · Disruption',  color: 'var(--ag-risk)',        rawColor: 'oklch(0.70 0.21 15)',  code: 'RSK', llm: true },
  inventory:   { id: 'inventory',   name: 'Inventory Mgmt',   sub: 'ABC · Safety Stock',        color: 'var(--ag-inventory)',   rawColor: 'oklch(0.72 0.18 325)', code: 'INV', llm: true },
  masterdata:  { id: 'masterdata',  name: 'Master Data',      sub: 'MDM · BOM · Routing',       color: 'var(--ag-masterdata)',  rawColor: 'oklch(0.74 0.14 235)', code: 'MDM', llm: true },
  procurement: { id: 'procurement', name: 'Procurement',      sub: 'ATP · CTP · Supplier Commit',color: 'var(--ag-procurement)', rawColor: 'oklch(0.73 0.16 276)', code: 'PRO', llm: true },
  optimizer:   { id: 'optimizer',   name: 'Plan Optimizer',   sub: 'MILP · CP-SAT · Pareto',    color: 'var(--ag-optimizer)',   rawColor: 'oklch(0.77 0.19 110)', code: 'OPT', llm: true },
  tooling:     { id: 'tooling',     name: 'Tooling & Mold',   sub: 'Die Sets · Asset Life',     color: 'var(--ag-tooling)',     rawColor: 'oklch(0.70 0.17 55)',  code: 'TLG', llm: true },
};

export const AGENT_ORDER = [
  'planner', 'masterdata', 'procurement', 'demand', 'spi',
  'inventory', 'tooling', 'capacity', 'wip', 'optimizer', 'finance', 'risk'
];
