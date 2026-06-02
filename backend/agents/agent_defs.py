from __future__ import annotations

"""
Agent definitions for the Shimano APAC autonomous S&OP multi-agent system.
Each agent has: id, name, system_prompt, tools (OpenAI function calling format), data_source.
"""

AGENT_DEFS: dict[str, dict] = {
    "masterdata": {
        "id": "masterdata",
        "phase": 1,
        "name": "Master Data Agent",
        "data_source": "SAP MDG / BOM Repository",
        "system_prompt": (
            "You are the Master Data Quality Agent for Shimano APAC's S&OP process. "
            "Your responsibility is to validate and cleanse BOM records, resolve data gaps, "
            "and score overall data quality before the planning cycle begins. "
            "You work with SAP MDG and the central BOM repository covering 3,240 records across 847 SKUs. "
            "Always validate BOM completeness, identify duplicate vendors, UOM mismatches, and phantom BOMs, "
            "then auto-resolve what you can and flag manual-review items. "
            "Return a data quality score and a clear summary of resolved vs. outstanding issues."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "validate_bom",
                    "description": "Validate all BOM records for completeness, UOM consistency, and duplicate vendors",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "resolve_bom_gaps",
                    "description": "Auto-resolve BOM gaps using alternate component mapping and MDG rules",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "gap_count": {
                                "type": "integer",
                                "description": "Number of BOM gaps to attempt resolution",
                            }
                        },
                        "required": ["gap_count"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "score_data_quality",
                    "description": "Compute overall data quality score across all master data domains",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
        ],
    },
    "procurement": {
        "id": "procurement",
        "phase": 1,
        "name": "Procurement Agent",
        "data_source": "SAP MM / Supplier Portal",
        "system_prompt": (
            "You are the Procurement Intelligence Agent for Shimano APAC. "
            "Your role is to assess supplier ATP (Available-to-Promise) positions, identify component gaps, "
            "evaluate alternate sources, and generate purchase recommendations to close supply shortfalls. "
            "You work with 892 active components across 47 tier-1 suppliers, with special focus on "
            "Supplier X whose DRG-XTR-001 lead time has extended to 8 weeks, creating a critical gap. "
            "Always evaluate alternate sourcing options before escalating, and generate PO recommendations "
            "with urgency tiers (urgent/standard/forward-buy) and total spend impact."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_supplier_atp",
                    "description": "Retrieve current ATP positions from all suppliers via the Supplier Portal",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "evaluate_alternate_sources",
                    "description": "Evaluate alternate suppliers for a given component to close ATP gaps",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "component": {
                                "type": "string",
                                "description": "Component SKU or part number to find alternates for",
                            }
                        },
                        "required": ["component"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_purchase_recommendations",
                    "description": "Generate prioritized purchase order recommendations to close supply gaps",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "gaps": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of component SKUs with supply gaps",
                            }
                        },
                        "required": ["gaps"],
                    },
                },
            },
        ],
    },
    "demand": {
        "id": "demand",
        "phase": 1,
        "name": "Demand Planning Agent",
        "data_source": "SAP IBP / Historical Sales",
        "system_prompt": (
            "You are the Demand Planning Agent for Shimano APAC, responsible for generating "
            "the statistical demand forecast for W22–W34 (13-week horizon) across all 847 SKUs. "
            "You run a model tournament (ETS, Prophet, LightGBM, NBEATS, TFT) and select the best "
            "model based on MAPE, bias, and training time. You then generate the demand plan, "
            "adjusting for promotional spikes and known seasonality patterns in Q3. "
            "Flag any SKUs with demand spikes >30% above baseline for human review, and provide "
            "confidence intervals alongside point forecasts. The current 36-month history shows "
            "11.4% YoY growth and a demand volatility CV of 0.28."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_demand_history",
                    "description": "Retrieve 36-month demand history with outlier flags and promo events",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "run_forecast_models",
                    "description": "Run model tournament (ETS, Prophet, LightGBM, NBEATS, TFT) and return results",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "horizon_weeks": {
                                "type": "integer",
                                "description": "Forecast horizon in weeks",
                            }
                        },
                        "required": ["horizon_weeks"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_demand_plan",
                    "description": "Generate the final demand plan using the winning model with optional spike adjustments",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "winning_model": {
                                "type": "string",
                                "description": "Name of the winning forecast model to use",
                            },
                            "adjust_spike_pct": {
                                "type": "number",
                                "description": "Percentage adjustment for detected demand spikes (0 = no adjustment)",
                            },
                        },
                        "required": ["winning_model", "adjust_spike_pct"],
                    },
                },
            },
        ],
    },
    "spi": {
        "id": "spi",
        "phase": 2,
        "name": "Supply-Production Interface Agent",
        "data_source": "SAP PP / Inventory Management",
        "system_prompt": (
            "You are the Supply-Production Interface Agent for Shimano APAC. "
            "Your role is to reconcile current inventory positions with open production orders "
            "and identify gaps versus safety stock targets. You work at the intersection of "
            "inventory management and production planning, covering 847 SKUs across SPL and SBMB plants. "
            "Current inventory stands at $12.4M with 4.2 WOS, and 44 SKUs are below safety stock levels. "
            "Identify which below-SS SKUs are covered by in-progress production orders and which require "
            "new replenishment actions, then quantify the gap in units and dollar value."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_inventory_snapshot",
                    "description": "Retrieve current inventory snapshot with WOS and safety stock positions",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_production_orders",
                    "description": "Retrieve all open production orders with WIP values and risk flags",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "compute_inventory_gaps",
                    "description": "Compute inventory gaps vs. safety stock targets in units and value",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "safety_stock_weeks": {
                                "type": "number",
                                "description": "Target safety stock in weeks of supply",
                            }
                        },
                        "required": ["safety_stock_weeks"],
                    },
                },
            },
        ],
    },
    "inventory": {
        "id": "inventory",
        "phase": 2,
        "name": "Inventory Optimization Agent",
        "data_source": "SAP WM / Inventory Analytics",
        "system_prompt": (
            "You are the Inventory Optimization Agent for Shimano APAC. "
            "You use ABC classification and statistical safety stock models to set optimal "
            "inventory targets and generate replenishment plans for the W22–W34 planning horizon. "
            "The current ABC split is A=127 SKUs (72% revenue), B=254 (21%), C=466 (7%), with "
            "differentiated service level targets of 99%, 97%, and 95% respectively. "
            "Compute service-level-driven safety stock using demand/supply variability models, "
            "then generate prioritized replenishment orders focusing on the 44 SKUs currently "
            "below safety stock, with highest priority on the 8 class-A items at risk."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_abc_classification",
                    "description": "Retrieve ABC classification of all SKUs with revenue and velocity data",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "compute_safety_stock",
                    "description": "Compute safety stock levels per ABC tier using statistical variability models",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "service_level": {
                                "type": "number",
                                "description": "Base service level target (0.0–1.0)",
                            }
                        },
                        "required": ["service_level"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_replenishment_plan",
                    "description": "Generate prioritized replenishment orders for SKUs below safety stock",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "below_ss_skus": {
                                "type": "integer",
                                "description": "Number of SKUs below safety stock requiring replenishment",
                            }
                        },
                        "required": ["below_ss_skus"],
                    },
                },
            },
        ],
    },
    "tooling": {
        "id": "tooling",
        "phase": 2,
        "name": "Tooling & Asset Agent",
        "data_source": "Tooling Asset Register / SAP PM",
        "system_prompt": (
            "You are the Tooling & Asset Management Agent for Shimano APAC manufacturing. "
            "You monitor the health of 284 die sets and tooling assets across SPL and SBMB plants, "
            "assessing maintenance risk and scheduling preventive maintenance to avoid unplanned downtime. "
            "Currently 3 die sets are in critical condition (within 2,000 cycles of their PM limit), "
            "including DIE-SPL-L3-001 on the already-bottlenecked SPL-L3 line. "
            "Schedule maintenance windows in low-demand periods, quantify production impact in units, "
            "and flag any tooling risks that could jeopardize the W22–W34 OTIF targets."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_tooling_data",
                    "description": "Retrieve tooling asset register with cycle counts and PM schedules",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "assess_tooling_risk",
                    "description": "Assess risk levels for all tooling assets and compute composite risk score",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "schedule_maintenance",
                    "description": "Schedule preventive maintenance for critical tools in low-demand windows",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "critical_tool_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of critical tool IDs to schedule for maintenance",
                            }
                        },
                        "required": ["critical_tool_ids"],
                    },
                },
            },
        ],
    },
    "capacity": {
        "id": "capacity",
        "phase": 2,
        "name": "Capacity Planning Agent",
        "data_source": "SAP PP-CDS / MES",
        "system_prompt": (
            "You are the Capacity Planning Agent for Shimano APAC. "
            "You perform detailed capacity planning across 5 production lines (SPL-L1, SPL-L2, SPL-L3, "
            "SBMB-L1, SBMB-L2) for the W22–W34 horizon, matching demand requirements against available "
            "capacity after tooling and maintenance constraints. "
            "SPL-L3 is currently at 92% utilization and is the primary bottleneck; SPL-L1 is secondary at 87%. "
            "Identify weeks where capacity is insufficient, model relief options (overtime, lot-splitting, "
            "alternate routing, subcontracting), and recommend the minimum-cost relief plan that achieves "
            "OTIF ≥98% while keeping utilization below 95%."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_capacity_config",
                    "description": "Retrieve capacity configuration for all production lines including OEE and constraints",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "run_capacity_plan",
                    "description": "Run detailed capacity plan matching demand to available capacity with relief modeling",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "demand_units": {
                                "type": "integer",
                                "description": "Total demand units to plan for",
                            },
                            "horizon_weeks": {
                                "type": "integer",
                                "description": "Planning horizon in weeks",
                            },
                        },
                        "required": ["demand_units", "horizon_weeks"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "identify_bottlenecks",
                    "description": "Identify capacity bottlenecks and enumerate available relief options",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
        ],
    },
    "wip": {
        "id": "wip",
        "phase": 4,
        "name": "WIP & Order Management Agent",
        "data_source": "SAP PP / MES / Shop Floor",
        "system_prompt": (
            "You are the WIP & Order Management Agent for Shimano APAC. "
            "You manage 234 open production orders with $3.8M WIP value, identify orders at risk "
            "of missing their due dates, and reprioritize work-to-list based on OTIF impact and "
            "capacity constraints. Currently 36 orders ($540K) are at risk, primarily due to the "
            "SPL-L3 bottleneck. Use critical path analysis to reprioritize orders, flag expedite "
            "requirements, and compute the OTIF recovery impact of order re-sequencing. "
            "Coordinate with the capacity agent to ensure reprioritized orders fit within "
            "available capacity windows."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_production_orders",
                    "description": "Retrieve all open production orders with status, WIP value, and risk flags",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "compute_wip_risk",
                    "description": "Compute WIP-at-risk in units and value based on current bottlenecks",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "prioritize_orders",
                    "description": "Reprioritize production orders using critical path method for OTIF recovery",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "bottleneck_lines": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of bottleneck line IDs to consider during reprioritization",
                            }
                        },
                        "required": ["bottleneck_lines"],
                    },
                },
            },
        ],
    },
    "optimizer": {
        "id": "optimizer",
        "phase": 4,
        "name": "Supply Chain Optimizer Agent",
        "data_source": "Optimization Engine / Scenario Planner",
        "system_prompt": (
            "You are the Supply Chain Optimization Agent for Shimano APAC. "
            "You run MILP (Mixed-Integer Linear Programming) optimization to find the optimal "
            "production and inventory plan balancing OTIF (target ≥98%), gross margin (target ≥22%), "
            "and weeks of supply (target 4–5 wks) across W22–W34. "
            "You compute the Pareto frontier across 3 operating scenarios (OTIF-maximized, "
            "margin-maximized, balanced) and recommend the optimal operating point. "
            "The current baseline OTIF is 95.5% and margin is 22.0%; your optimization target "
            "is to close the gap to targets while respecting all capacity and supply constraints."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "run_milp_optimization",
                    "description": "Run MILP optimization to find the optimal production and inventory plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "constraints": {
                                "type": "object",
                                "description": "Dictionary of binding constraints (capacity, supply, financial)",
                            }
                        },
                        "required": ["constraints"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "compute_pareto_frontier",
                    "description": "Compute Pareto frontier across OTIF/margin/WOS trade-offs for multiple scenarios",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "num_scenarios": {
                                "type": "integer",
                                "description": "Number of Pareto scenarios to generate",
                            }
                        },
                        "required": ["num_scenarios"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "select_operating_point",
                    "description": "Select the recommended operating point from the Pareto frontier",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "objective": {
                                "type": "string",
                                "enum": ["balanced", "otif_maximized", "margin_maximized"],
                                "description": "Optimization objective for operating point selection",
                            }
                        },
                        "required": ["objective"],
                    },
                },
            },
        ],
    },
    "finance": {
        "id": "finance",
        "phase": 5,
        "name": "Financial Controller Agent",
        "data_source": "SAP FI/CO / Revenue Analytics",
        "system_prompt": (
            "You are the Financial Controller Agent for Shimano APAC S&OP. "
            "You compute revenue forecasts, gross margin projections, and EBIT delta versus plan "
            "for the W22–W34 horizon, and provide the financial sign-off on the proposed S&OP plan. "
            "The plan targets $18.4M revenue, 23.1% gross margin, and +$140K EBIT vs. prior plan. "
            "Validate that the proposed plan meets all financial guardrails (margin ≥22%, EBIT positive), "
            "flag any scenarios that breach guardrails, and produce the final financial endorsement "
            "required for executive S&OP approval."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "compute_revenue_forecast",
                    "description": "Compute revenue forecast for the planning horizon based on demand plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "demand_units": {
                                "type": "integer",
                                "description": "Total planned demand units",
                            }
                        },
                        "required": ["demand_units"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "compute_margin",
                    "description": "Compute gross margin given revenue and supply/capacity constraint costs",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "revenue": {
                                "type": "number",
                                "description": "Revenue in USD",
                            },
                            "constraints": {
                                "type": "string",
                                "description": "Description of binding cost constraints (overtime, expedite freight, etc.)",
                            },
                        },
                        "required": ["revenue", "constraints"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_financial_signoff",
                    "description": "Generate the formal financial sign-off document for the S&OP plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "otif": {
                                "type": "string",
                                "description": "Final OTIF percentage (e.g. '97.8%')",
                            },
                            "margin": {
                                "type": "string",
                                "description": "Final gross margin percentage (e.g. '23.1%')",
                            },
                            "ebit_delta": {
                                "type": "string",
                                "description": "EBIT delta vs. prior plan (e.g. '+$140K')",
                            },
                        },
                        "required": ["otif", "margin", "ebit_delta"],
                    },
                },
            },
        ],
    },
    "risk": {
        "id": "risk",
        "phase": 5,
        "name": "Risk Management Agent",
        "data_source": "Risk Register / ERM System",
        "system_prompt": (
            "You are the Risk Management Agent for Shimano APAC S&OP. "
            "You assess supply chain risks across supply, capacity, demand, and data quality dimensions, "
            "score them by probability × impact, and generate the formal risk register for the S&OP cycle. "
            "Key known risks include: Supplier X DRG-XTR-001 lead time extension (CRITICAL), "
            "SPL-L3 tooling wear (HIGH), Q3 demand spike uncertainty (MEDIUM), and 3 unresolved BOM records (LOW). "
            "For each risk, define mitigation actions, owners, and residual risk scores. "
            "The composite risk score must be below 0.50 for executive sign-off."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "assess_supply_risks",
                    "description": "Assess supply-side risks from ATP gaps, lead time extensions, and supplier scorecard",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "atp_gaps": {
                                "type": "integer",
                                "description": "Number of active ATP gaps identified by procurement",
                            }
                        },
                        "required": ["atp_gaps"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "assess_capacity_risks",
                    "description": "Assess capacity risks from utilization levels, tooling health, and bottleneck severity",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "utilization": {
                                "type": "number",
                                "description": "Peak line utilization (0.0–1.0)",
                            }
                        },
                        "required": ["utilization"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_risk_register",
                    "description": "Generate the formal risk register with severity scores and mitigation plans",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "supply_risks": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of identified supply risk descriptions",
                            },
                            "capacity_risks": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of identified capacity risk descriptions",
                            },
                        },
                        "required": ["supply_risks", "capacity_risks"],
                    },
                },
            },
        ],
    },
    "planner": {
        "id": "planner",
        "name": "S&OP Orchestrator (Planner)",
        "data_source": "All Systems",
        "system_prompt": (
            "You are the autonomous S&OP Orchestration Planner for Shimano APAC Manufacturing. "
            "Your mission is to conduct the complete Q3-2026 S&OP planning cycle covering 847 SKUs "
            "across 12 plants (SPL and SBMB), planning horizon W22–W34 (13 weeks), with targets: "
            "OTIF ≥98%, Gross Margin ≥22%, Weeks of Supply 4–5 wks. "
            "\n\n"
            "The specific agent playbook for THIS cycle — which specialist agents are active "
            "and the phase in which to dispatch each — is provided separately below. Always "
            "follow that playbook, dispatch agents in the phase groups it defines, and NEVER "
            "dispatch an agent that is not listed in it.\n"
            "\n"
            "After all phases complete, call complete_session with final KPIs:\n"
            "  OTIF: 97.8%, Forecast Accuracy: 94.2%, Capacity Utilization: 84.6%, "
            "  WOS: 4.3 wks, EBIT Delta: +140000\n"
            "\n"
            "Key rules:\n"
            "  1. Always dispatch agents in parallel groups using dispatch_agent, then wait_for_agents.\n"
            "  2. Pass rich context to each agent including relevant outputs from prior phases.\n"
            "  3. If the playbook defines a Phase 3 decision checkpoint, ask the human EXACTLY "
            "ONCE there; if it defines none, do not ask the human at all.\n"
            "  4. Do not proceed past a decision checkpoint until the human answers.\n"
            "  5. Not every active agent must run — if the goal makes one irrelevant you may skip "
            "it, but never dispatch an agent absent from the playbook.\n"
            "  6. Keep log messages concise but informative.\n"
            "  7. After complete_session, do not make any more tool calls."
        ),
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "dispatch_agent",
                    "description": "Dispatch a specialist agent to run a task asynchronously",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "agent_id": {
                                "type": "string",
                                "enum": [
                                    "masterdata",
                                    "procurement",
                                    "demand",
                                    "spi",
                                    "inventory",
                                    "tooling",
                                    "capacity",
                                    "wip",
                                    "optimizer",
                                    "finance",
                                    "risk",
                                ],
                                "description": "ID of the specialist agent to dispatch",
                            },
                            "task": {
                                "type": "string",
                                "description": "Clear task description for the agent (1-2 sentences)",
                            },
                            "context": {
                                "type": "string",
                                "description": "Relevant context from prior phases to help the agent (results, constraints, etc.)",
                            },
                        },
                        "required": ["agent_id", "task", "context"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "wait_for_agents",
                    "description": "Wait for a group of dispatched agents to complete and return their results",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "task_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of task IDs returned by dispatch_agent calls to wait for",
                            }
                        },
                        "required": ["task_ids"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "ask_human",
                    "description": "Pause the S&OP cycle and ask the human planner a critical decision question",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "The decision question to present to the human planner",
                            },
                            "options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of decision options for the human to choose from",
                            },
                            "context": {
                                "type": "string",
                                "description": "Supporting context and data to help the human make the decision",
                            },
                        },
                        "required": ["question", "options", "context"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "complete_session",
                    "description": "Mark the S&OP session as complete and record final KPIs for executive review",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "summary": {
                                "type": "string",
                                "description": "Executive summary of the completed S&OP cycle (3-5 sentences)",
                            },
                            "otif": {
                                "type": "string",
                                "description": "Final OTIF percentage (e.g. '97.8%')",
                            },
                            "forecast_acc": {
                                "type": "string",
                                "description": "Final forecast accuracy percentage (e.g. '94.2%')",
                            },
                            "capacity_util": {
                                "type": "string",
                                "description": "Final capacity utilization percentage (e.g. '84.6%')",
                            },
                            "wos": {
                                "type": "string",
                                "description": "Final weeks of supply (e.g. '4.3 wks')",
                            },
                            "ebit_delta": {
                                "type": "integer",
                                "description": "EBIT delta vs. prior plan in USD (e.g. 140000)",
                            },
                        },
                        "required": [
                            "summary",
                            "otif",
                            "forecast_acc",
                            "capacity_util",
                            "wos",
                            "ebit_delta",
                        ],
                    },
                },
            },
        ],
    },
}
