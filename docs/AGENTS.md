# Agent Roster & Tools

> Autopilot S&OP — Shimano APAC autonomous multi-agent planning system.
> Auto-generated reference of every agent and the tools it can call.
> Source of truth: [`backend/agent_defs.py`](../backend/agent_defs.py).

The system is **multi-agent and concurrent**: the **Planner** (orchestrator) builds a
task graph and dispatches the 11 specialist agents in parallel phases. Each agent is a
tool-using LLM with its own system prompt, tool set, and data source.

**12 agents total** = 1 orchestrator (`planner`) + 11 specialist workers. All are LLM-powered.

A separate **Governance Agent** (shown in the Agent Manager) evaluates/scores the other
agents and is not a planning worker. The **Planner chat** assistant reuses the Planner
persona with read-only lookup tools (`list_sessions`, `get_session_context`).

---

## Orchestrator

### `planner` — S&OP Orchestrator (Planner)
- **Data source:** All Systems
- **Role:** Runs the complete Q3-2026 S&OP cycle in 5 phases (data foundation → supply &
  capacity → human decision checkpoint → WIP & optimization → final sign-off), dispatching
  specialists in parallel and pausing exactly once for a human decision.
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `dispatch_agent` | Dispatch a specialist agent to run a task asynchronously | `agent_id`, `task`, `context` |
  | `wait_for_agents` | Wait for a group of dispatched agents to complete and return results | `task_ids` |
  | `ask_human` | Pause the cycle and ask the human planner a critical decision question | `question`, `options`, `context` |
  | `complete_session` | Mark the session complete and record final KPIs | `summary`, `otif`, `forecast_acc`, `capacity_util`, `wos`, `ebit_delta` |

---

## Specialist Agents

### `masterdata` — Master Data Agent
- **Data source:** SAP MDG / BOM Repository
- **Role:** Validate & cleanse BOM records (3,240 records across 847 SKUs), resolve data gaps, score data quality before the cycle begins.
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `validate_bom` | Validate all BOM records for completeness, UOM consistency, duplicate vendors | — |
  | `resolve_bom_gaps` | Auto-resolve BOM gaps using alternate component mapping and MDG rules | `gap_count` |
  | `score_data_quality` | Compute overall data quality score across all master data domains | — |

### `procurement` — Procurement Agent
- **Data source:** SAP MM / Supplier Portal
- **Role:** Assess supplier ATP positions (892 components, 47 tier-1 suppliers), evaluate alternate sources, generate purchase recommendations. Focus on Supplier X (DRG-XTR-001, 8-week lead time).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_supplier_atp` | Retrieve current ATP positions from all suppliers via the Supplier Portal | — |
  | `evaluate_alternate_sources` | Evaluate alternate suppliers for a component to close ATP gaps | `component` |
  | `generate_purchase_recommendations` | Generate prioritized PO recommendations to close supply gaps | `gaps` |

### `demand` — Demand Planning Agent (UI: "AutoML Forecast")
- **Data source:** SAP IBP / Historical Sales
- **Role:** Generate the statistical demand forecast for W22–W34 across 847 SKUs via a model tournament (ETS, Prophet, LightGBM, NBEATS, TFT); flag spikes >30% for review.
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_demand_history` | Retrieve 36-month demand history with outlier flags and promo events | — |
  | `run_forecast_models` | Run model tournament and return results | `horizon_weeks` |
  | `generate_demand_plan` | Generate the final demand plan using the winning model | `winning_model`, `adjust_spike_pct` |

### `spi` — Supply-Production Interface Agent (UI: "SPI Analyst")
- **Data source:** SAP PP / Inventory Management
- **Role:** Reconcile inventory positions vs. open production orders, identify gaps vs. safety stock (847 SKUs, $12.4M inventory, 44 SKUs below SS).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_inventory_snapshot` | Retrieve current inventory snapshot with WOS and safety stock positions | — |
  | `get_production_orders` | Retrieve all open production orders with WIP values and risk flags | — |
  | `compute_inventory_gaps` | Compute inventory gaps vs. safety stock targets in units and value | `safety_stock_weeks` |

### `inventory` — Inventory Optimization Agent (UI: "Inventory Mgmt")
- **Data source:** SAP WM / Inventory Analytics
- **Role:** ABC classification + statistical safety stock models to set optimal targets and replenishment plans (A=127, B=254, C=466 SKUs; service levels 99/97/95%).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_abc_classification` | Retrieve ABC classification with revenue and velocity data | — |
  | `compute_safety_stock` | Compute safety stock per ABC tier using statistical variability models | `service_level` |
  | `generate_replenishment_plan` | Generate prioritized replenishment orders for SKUs below safety stock | `below_ss_skus` |

### `tooling` — Tooling & Asset Agent (UI: "Tooling & Mold")
- **Data source:** Tooling Asset Register / SAP PM
- **Role:** Monitor 284 die sets/tooling assets, assess maintenance risk, schedule preventive maintenance (3 critical, incl. DIE-SPL-L3-001 on the bottleneck line).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_tooling_data` | Retrieve tooling asset register with cycle counts and PM schedules | — |
  | `assess_tooling_risk` | Assess risk levels for all tooling assets, compute composite risk score | — |
  | `schedule_maintenance` | Schedule preventive maintenance for critical tools in low-demand windows | `critical_tool_ids` |

### `capacity` — Capacity Planning Agent (UI: "Capacity Plan")
- **Data source:** SAP PP-CDS / MES
- **Role:** Detailed capacity planning across 5 lines for W22–W34, match demand vs. capacity, model relief options. SPL-L3 is the primary bottleneck (92%).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_capacity_config` | Retrieve capacity configuration for all lines incl. OEE and constraints | — |
  | `run_capacity_plan` | Run detailed capacity plan with relief modeling | `demand_units`, `horizon_weeks` |
  | `identify_bottlenecks` | Identify capacity bottlenecks and enumerate relief options | — |

### `wip` — WIP & Order Management Agent (UI: "WIP")
- **Data source:** SAP PP / MES / Shop Floor
- **Role:** Manage 234 open production orders ($3.8M WIP), identify at-risk orders, reprioritize via critical path for OTIF recovery (36 orders / $540K at risk).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `get_production_orders` | Retrieve all open production orders with status, WIP value, risk flags | — |
  | `compute_wip_risk` | Compute WIP-at-risk in units and value based on current bottlenecks | — |
  | `prioritize_orders` | Reprioritize production orders using critical path method for OTIF recovery | `bottleneck_lines` |

### `optimizer` — Supply Chain Optimizer Agent (UI: "Plan Optimizer")
- **Data source:** Optimization Engine / Scenario Planner
- **Role:** MILP optimization balancing OTIF (≥98%), margin (≥22%), WOS (4–5 wks); compute Pareto frontier across scenarios and recommend the operating point.
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `run_milp_optimization` | Run MILP optimization to find the optimal production and inventory plan | `constraints` |
  | `compute_pareto_frontier` | Compute Pareto frontier across OTIF/margin/WOS trade-offs | `num_scenarios` |
  | `select_operating_point` | Select the recommended operating point from the Pareto frontier | `objective` |

### `finance` — Financial Controller Agent (UI: "Finance")
- **Data source:** SAP FI/CO / Revenue Analytics
- **Role:** Compute revenue, gross margin, EBIT delta vs. plan; provide financial sign-off (targets: $18.4M rev, 23.1% margin, +$140K EBIT).
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `compute_revenue_forecast` | Compute revenue forecast for the horizon based on demand plan | `demand_units` |
  | `compute_margin` | Compute gross margin given revenue and constraint costs | `revenue`, `constraints` |
  | `generate_financial_signoff` | Generate the formal financial sign-off document | `otif`, `margin`, `ebit_delta` |

### `risk` — Risk Management Agent (UI: "Risk")
- **Data source:** Risk Register / ERM System
- **Role:** Assess supply/capacity/demand/data risks (probability × impact), generate the formal risk register; composite score must be < 0.50 for sign-off.
- **Tools:**
  | Tool | Description | Params |
  |------|-------------|--------|
  | `assess_supply_risks` | Assess supply-side risks from ATP gaps, lead-time extensions, scorecard | `atp_gaps` |
  | `assess_capacity_risks` | Assess capacity risks from utilization, tooling health, bottleneck severity | `utilization` |
  | `generate_risk_register` | Generate the formal risk register with severity scores and mitigations | `supply_risks`, `capacity_risks` |

---

## Planner Chat assistant (not a separate agent)

Reuses the `planner` persona (same system prompt) but with **read-only** tools so it can
discuss runs without acting on them. Defined in [`backend/main.py`](../backend/main.py).

| Tool | Description | Params |
|------|-------------|--------|
| `list_sessions` | List planning runs (newest first) with id, name, status, goal excerpt | — |
| `get_session_context` | Get full context for one session: goal, status, KPIs, steps, pending decision | `session_id` |

---

*Regenerate this list from `backend/agent_defs.py` whenever agents or tools change.*
