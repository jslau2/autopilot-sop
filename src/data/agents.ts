import type { Agent } from '../types';

export const AGENTS: Record<string, Agent> = {
  planner:     { id: 'planner',     name: 'Planner',          sub: 'Orchestrator',              color: 'var(--ag-planner)',     code: 'PLN' },
  demand:      { id: 'demand',      name: 'AutoML Forecast',  sub: 'AutoML · Model Selection',  color: 'var(--ag-demand)',      code: 'AML' },
  spi:         { id: 'spi',         name: 'SPI Analyst',      sub: 'Sales · Prod · Inv',        color: 'var(--ag-spi)',         code: 'SPI' },
  capacity:    { id: 'capacity',    name: 'Capacity Plan',    sub: 'Assembly Loading',           color: 'var(--ag-capacity)',    code: 'CAP' },
  wip:         { id: 'wip',         name: 'WIP',              sub: 'PO · Shop Floor',            color: 'var(--ag-wip)',         code: 'WIP' },
  finance:     { id: 'finance',     name: 'Finance',          sub: 'P&L · Margin · OTIF',       color: 'var(--ag-finance)',     code: 'FIN' },
  risk:        { id: 'risk',        name: 'Risk',             sub: 'Constraints · Disruption',  color: 'var(--ag-risk)',        code: 'RSK' },
  inventory:   { id: 'inventory',   name: 'Inventory Mgmt',   sub: 'ABC · Safety Stock',        color: 'var(--ag-inventory)',   code: 'INV' },
  masterdata:  { id: 'masterdata',  name: 'Master Data',      sub: 'MDM · BOM · Routing',       color: 'var(--ag-masterdata)',  code: 'MDM' },
  procurement: { id: 'procurement', name: 'Procurement',      sub: 'ATP · CTP · Supplier Commit',color: 'var(--ag-procurement)', code: 'PRO' },
  optimizer:   { id: 'optimizer',   name: 'Plan Optimizer',   sub: 'MILP · CP-SAT · Pareto',    color: 'var(--ag-optimizer)',   code: 'OPT' },
  tooling:     { id: 'tooling',     name: 'Tooling & Mold',   sub: 'Die Sets · Asset Life',     color: 'var(--ag-tooling)',     code: 'TLG' },
};

export const AGENT_ORDER = [
  'planner', 'masterdata', 'procurement', 'demand', 'spi',
  'inventory', 'tooling', 'capacity', 'wip', 'optimizer', 'finance', 'risk'
];
