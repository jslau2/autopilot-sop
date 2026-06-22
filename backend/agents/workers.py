from __future__ import annotations

"""
Worker agent runner for the Shimano APAC autonomous S&OP system.
Each worker runs a specialist agent with tool-use loop against Azure OpenAI.
"""

import asyncio
import json
import logging
import os

from openai import AzureOpenAI

logger = logging.getLogger(__name__)

from session import SessionState
from .agent_defs import AGENT_DEFS
import mock_data
import bom_graph
from engines import forecast_client, planning_client, handoff

# ---------------------------------------------------------------------------
# Azure OpenAI client — lazy init so missing creds don't break imports
# ---------------------------------------------------------------------------
_client: AzureOpenAI | None = None

def get_client() -> AzureOpenAI:
    global _client
    if _client is None:
        _client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.environ["AZURE_OPENAI_API_VERSION"],
        )
    return _client

def get_deployment() -> str:
    return os.environ["AZURE_OPENAI_DEPLOYMENT"]

# ---------------------------------------------------------------------------
# Tool dispatch table
# ---------------------------------------------------------------------------
TOOL_DISPATCH: dict = {
    # masterdata — governs the Neo4j BOM graph (live), falls back to mock data
    "validate_bom": lambda args: bom_graph.validate_bom() or mock_data.get_bom_data(),
    "explode_bom": lambda args: bom_graph.explode_bom(
        args.get("material"), args.get("max_levels", 10)
    ) or {"error": "BOM graph unavailable", "material": args.get("material")},
    "where_used": lambda args: bom_graph.where_used(
        args.get("material"), args.get("max_levels", 10)
    ) or {"error": "BOM graph unavailable", "material": args.get("material")},
    "find_bom_orphans": lambda args: bom_graph.find_orphans(args.get("limit", 50))
    or {"error": "BOM graph unavailable"},
    "resolve_bom_gaps": lambda args: {
        "resolved": args.get("gap_count", 0) - 3,
        "remaining": 3,
        "method": "alternate_component_mapping",
    },
    "score_data_quality": lambda args: {
        "score": 97.3,
        "issues": 34,
        "auto_resolved": 31,
        "manual_required": 3,
        "completeness_pct": 98.9,
    },
    # procurement
    "get_supplier_atp": lambda args: mock_data.get_supplier_atp(),
    "evaluate_alternate_sources": lambda args: {
        "component": args.get("component"),
        "alternates": 2,
        "lead_time_improvement_weeks": 2,
        "cost_premium_pct": 4.5,
        "qualification_status": "pre-qualified",
    },
    "generate_purchase_recommendations": lambda args: {
        "po_count": len(args.get("gaps", [])),
        "total_value_usd": 840_000,
        "urgent": 3,
        "standard": max(0, len(args.get("gaps", [])) - 3),
        "recommended_action": "Issue urgent POs for DRG-XTR-001 and BRK-HYD-XTR within 48 hours",
    },
    # demand — live booking-curve engine (forecast_client), falls back to mock data
    "get_demand_history": lambda args: forecast_client.get_demand_history()
    or mock_data.get_demand_history(),
    "run_forecast_models": lambda args: forecast_client.run_forecast_models(
        args.get("horizon_weeks", 13)
    ) or mock_data.run_forecast_models(args.get("horizon_weeks", 13)),
    "generate_demand_plan": lambda args: forecast_client.generate_demand_plan(
        args.get("winning_model"), args.get("adjust_spike_pct", 34.0)
    ) or {
        "model": args.get("winning_model"),
        "total_units": 312_400,
        "spike_skus": 1,
        "spike_pct": args.get("adjust_spike_pct", 34.0),
        "mape": 5.8,
        "bias": 0.3,
        "confidence_interval_90": [298_200, 326_600],
        "by_week": "W22:22400, W23:23100, W24:28800, W25:29400, W26:27600, W27:24200",
    },
    # spi
    "get_inventory_snapshot": lambda args: mock_data.get_inventory_snapshot(),
    "get_production_orders": lambda args: mock_data.get_production_orders(),
    "compute_inventory_gaps": lambda args: {
        "below_ss": 44,
        "gap_units": 1240,
        "gap_value_usd": 442_000,
        "covered_by_wip": 18,
        "requires_new_po": 26,
        "critical_skus": ["DRG-XTR-001", "BRK-DUR-105", "CST-105-11"],
    },
    # inventory
    "get_abc_classification": lambda args: mock_data.get_abc_classification(),
    "compute_safety_stock": lambda args: mock_data.compute_safety_stock(
        args.get("service_level", 0.95)
    ),
    "generate_replenishment_plan": lambda args: {
        "orders": args.get("below_ss_skus", 44),
        "total_value_usd": 1_200_000,
        "priority_a_skus": 8,
        "priority_b_skus": 18,
        "priority_c_skus": 18,
        "lead_time_weeks_avg": 3.2,
    },
    # tooling
    "get_tooling_data": lambda args: mock_data.get_tooling_data(),
    "assess_tooling_risk": lambda args: {
        "critical": 3,
        "high": 12,
        "medium": 24,
        "low": 245,
        "risk_score": 0.23,
        "top_risk": "DIE-SPL-L3-001 (1,800 cycles remaining)",
    },
    "schedule_maintenance": lambda args: {
        "scheduled": len(args.get("critical_tool_ids", [])),
        "downtime_days": 3,
        "impact_units": 750,
        "scheduled_weeks": [6, 7],
        "maintenance_windows": "Low-demand W6-W7 identified",
    },
    # capacity
    "get_capacity_config": lambda args: mock_data.get_capacity_config(),
    "run_capacity_plan": lambda args: mock_data.run_capacity_plan(
        args.get("demand_units", 312_400), args.get("horizon_weeks", 13)
    ),
    "identify_bottlenecks": lambda args: {
        "bottlenecks": ["SPL-L1", "SPL-L3"],
        "relief_options": ["overtime", "lot_split", "alternate_routing"],
        "recommended_relief": "6% overtime on SPL-L3 weeks 3-5, lot-split on SPL-L1",
        "cost_impact_usd": 42_000,
    },
    # wip
    "compute_wip_risk": lambda args: {
        "at_risk_orders": 36,
        "value_at_risk_usd": 540_000,
        "top_risk": "SPL-L3 bottleneck causing 14 orders at risk",
        "recovery_possible": True,
    },
    "prioritize_orders": lambda args: {
        "reprioritized": 36,
        "method": "critical_path",
        "otif_recovery": "+2.1%",
        "expedite_orders": 8,
        "bottleneck_lines_addressed": args.get("bottleneck_lines", []),
    },
    # optimizer — live fg-planning-optimizer (planning_client), falls back to mock data.
    # If the Demand agent forecast ran this session, the MILP solves against it.
    "run_milp_optimization": lambda args: planning_client.run_milp_optimization(
        args.get("constraints", {})
    ) or mock_data.run_milp_optimization(args.get("constraints", {})),
    "compute_pareto_frontier": lambda args: {
        "scenarios": args.get("num_scenarios", 3),
        "frontier_points": [
            {"otif": "97.8%", "margin": "23.1%", "label": "Balanced"},
            {"otif": "98.5%", "margin": "21.8%", "label": "OTIF-maximized"},
            {"otif": "96.2%", "margin": "24.3%", "label": "Margin-maximized"},
        ],
    },
    "select_operating_point": lambda args: {
        "selected": args.get("objective", "balanced"),
        "otif": "97.8%",
        "margin": "23.1%",
        "rationale": "Optimal OTIF/margin trade-off given capacity constraints",
        "ebit_delta_usd": 140_000,
    },
    # finance
    "compute_revenue_forecast": lambda args: {
        "revenue_usd": 18_400_000,
        "skus": 847,
        "horizon_weeks": 13,
        "avg_asp_usd": 58.9,
        "vs_plan_pct": "+3.2%",
    },
    "compute_margin": lambda args: {
        "margin_pct": 23.1,
        "gross_profit_usd": 4_250_000,
        "vs_target": "+1.1pp",
        "cogs_usd": 14_150_000,
        "overtime_cost_usd": 42_000,
        "freight_cost_usd": 85_000,
    },
    "generate_financial_signoff": lambda args: {
        "approved": True,
        "revenue_usd": 18_400_000,
        "margin_pct": 23.1,
        "ebit_delta_usd": 140_000,
        "signoff_date": "2026-05-27",
        "approver": "Finance Controller",
        "conditions": "Subject to procurement closing DRG-XTR-001 alternate source within 72 hours",
    },
    # risk
    "assess_supply_risks": lambda args: {
        "high": 2,
        "medium": 5,
        "low": 8,
        "top_risk": "Supplier X DRG-XTR-001 lead time 8wk — CRITICAL",
        "composite_supply_risk": 0.61,
    },
    "assess_capacity_risks": lambda args: {
        "bottleneck_lines": 2,
        "utilization_peak": args.get("utilization", 0.92),
        "risk_level": "MEDIUM",
        "composite_capacity_risk": 0.38,
    },
    "generate_risk_register": lambda args: {
        "risks": len(args.get("supply_risks", [])) + len(args.get("capacity_risks", [])) + 2,
        "mitigated": 4,
        "residual": 3,
        "composite_risk_score": 0.42,
        "executive_signoff_eligible": True,
    },
}


def _execute_tool(name: str, args: dict, session: SessionState | None = None) -> dict:
    """
    Execute a tool from TOOL_DISPATCH, returning an error dict on failure.

    Binds the active session (thread-local) so engine-backed tools can share a
    cross-tool hand-off within a run (e.g. the forecast -> optimizer demand
    chain). Runs synchronously; the caller offloads it to a thread so a slow
    engine (HTTP / MILP solve) never blocks the event loop.
    """
    handoff.bind_session(session)
    try:
        fn = TOOL_DISPATCH[name]
        result = fn(args)
        return result if isinstance(result, dict) else {"result": result}
    except KeyError:
        return {"error": f"Unknown tool: {name}", "tool": name}
    except Exception as exc:
        return {"error": str(exc), "tool": name}


# ---------------------------------------------------------------------------
# Worker agent runner
# ---------------------------------------------------------------------------
async def run_worker_agent(
    session: SessionState,
    agent_id: str,
    task: str,
    context: str,
    task_id: str,
    deps: list[str] | None = None,
) -> dict:
    """
    Run a single worker agent with an agentic tool-use loop.
    Returns the final result dict from the agent.
    """
    agent_def = AGENT_DEFS.get(agent_id)
    if agent_def is None:
        err = {"error": f"Unknown agent: {agent_id}"}
        await session.emit_log(agent_id, f"ERROR: Unknown agent '{agent_id}'", step_id=task_id)
        return err

    # Emit step start
    await session.emit_step_start(
        agent=agent_id,
        step_id=task_id,
        label=task[:60],
        data_source=agent_def.get("data_source", ""),
        deps=deps or [],
    )
    await session.emit_log(
        agent_id,
        f"Starting task: {task[:80]}",
        step_id=task_id,
    )

    # Build initial messages — system prompt honors any runtime override.
    from .agent_config import effective_system_prompt, effective_temperature
    messages: list[dict] = [
        {"role": "system", "content": effective_system_prompt(agent_id)},
        {
            "role": "user",
            "content": f"Task: {task}\n\nContext from prior phases:\n{context}",
        },
    ]
    temperature = effective_temperature(agent_id)

    tools = agent_def.get("tools", [])
    result: dict = {}
    loop = asyncio.get_event_loop()

    # Agentic tool-use loop (max 8 iterations)
    for iteration in range(8):
        logger.debug("[%s/%s] iter %d — sending %d messages to LLM", agent_id, task_id, iteration+1, len(messages))
        try:
            import llm_audit
            response = await loop.run_in_executor(
                None,
                lambda: llm_audit.audited_create(
                    get_client(),
                    session=session, agent=agent_id, model=get_deployment(),
                    messages=messages,
                    tools=tools if tools else None,
                    tool_choice="auto" if tools else None,
                    temperature=temperature,
                    max_completion_tokens=1024,
                ),
            )
        except Exception as exc:
            logger.error("[%s] LLM call failed iter %d: %s", agent_id, iteration+1, exc)
            await session.emit_log(
                agent_id,
                f"LLM call failed (iteration {iteration + 1}): {exc}",
                step_id=task_id,
            )
            result = {"error": str(exc)}
            break

        msg = response.choices[0].message

        # If there are tool calls, execute them
        if msg.tool_calls:
            # Append the assistant message with tool calls
            messages.append({"role": "assistant", "content": msg.content, "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]})

            for tool_call in msg.tool_calls:
                tool_name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                logger.info("[%s] tool_call: %s(%s)", agent_id, tool_name, json.dumps(args)[:200])
                await session.emit_log(
                    agent_id,
                    f"→ Calling tool: {tool_name}({json.dumps(args)[:120]})",
                    step_id=task_id,
                )

                # Offload to a thread: an engine-backed tool may do blocking HTTP
                # or wait on a MILP solve, which must not stall the event loop.
                tool_result = await loop.run_in_executor(
                    None, _execute_tool, tool_name, args, session
                )

                logger.debug("[%s] tool_result: %s → %s", agent_id, tool_name, str(tool_result)[:300])
                await session.emit_log(
                    agent_id,
                    f"← {tool_name} returned {len(str(tool_result))} chars",
                    step_id=task_id,
                )

                # Append tool result message
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result),
                })

        else:
            # No tool calls — this is the final answer
            final_content = msg.content or ""
            logger.info("[%s/%s] final answer (%d chars): %s", agent_id, task_id, len(final_content), final_content[:400])
            await session.emit_log(
                agent_id,
                f"Analysis complete — generating summary",
                step_id=task_id,
            )

            # Try to parse JSON result, fall back to wrapping raw content
            try:
                result = json.loads(final_content)
                if not isinstance(result, dict):
                    result = {"summary": final_content}
            except (json.JSONDecodeError, ValueError):
                result = {"summary": final_content}
            break
    else:
        # Exhausted iterations without a final answer
        await session.emit_log(
            agent_id,
            "Max iterations reached — using last tool result",
            step_id=task_id,
        )
        if not result:
            result = {"summary": "Agent completed after maximum iterations", "agent": agent_id}

    # Store trace for UI inspection
    session.traces[task_id] = [
        {
            "role": m.get("role") if isinstance(m, dict) else m.role,
            "content": (m.get("content") if isinstance(m, dict) else m.content) or "",
            "tool_calls": [
                {
                    "name": tc.get("function", {}).get("name") if isinstance(tc, dict) else tc.function.name,
                    "arguments": tc.get("function", {}).get("arguments") if isinstance(tc, dict) else tc.function.arguments,
                    "id": tc.get("id") if isinstance(tc, dict) else tc.id,
                }
                for tc in (m.get("tool_calls", []) if isinstance(m, dict) else (m.tool_calls or []))
            ] if (m.get("tool_calls") if isinstance(m, dict) else m.tool_calls) else [],
        }
        for m in messages
    ]

    # Extract metrics for the step complete event
    metrics = _extract_metrics(agent_id, result)
    summary_message = _build_summary(agent_id, task, result)

    result["_trace"] = session.traces[task_id]
    await session.emit_step_complete(
        agent=agent_id,
        step_id=task_id,
        message=summary_message,
        output=result,
        metrics=metrics,
        records=_extract_record_count(result),
    )

    return result


def _extract_metrics(agent_id: str, result: dict) -> dict:
    """Extract key metrics from agent result for display."""
    metrics: dict = {}
    metric_keys = [
        "mape", "otif", "margin_pct", "score", "risk_score",
        "capacity_utilization", "total_units", "revenue_usd",
    ]
    for key in metric_keys:
        if key in result:
            metrics[key] = result[key]
    return metrics


def _extract_record_count(result: dict) -> int:
    """Extract record count from result for step complete."""
    for key in ["total_rows", "total_bom_records", "open_orders", "total_skus", "total_components"]:
        if key in result:
            val = result[key]
            if isinstance(val, int):
                return val
    return 0


def _build_summary(agent_id: str, task: str, result: dict) -> str:
    """Build a human-readable summary message for the completed step."""
    summaries = {
        "masterdata": lambda r: (
            f"BOM validation complete: score {r.get('score', 'N/A')}%, "
            f"{r.get('auto_resolved', 'N/A')} issues auto-resolved, "
            f"{r.get('manual_required', r.get('remaining', 'N/A'))} require manual review"
        ),
        "procurement": lambda r: (
            f"Procurement analysis done: {r.get('atp_gaps', r.get('po_count', 'N/A'))} gaps identified, "
            f"${r.get('total_value_usd', r.get('po_value_usd', 0)):,.0f} in recommended POs"
        ),
        "demand": lambda r: (
            f"Demand plan generated: {r.get('total_units', r.get('winning_model', 'N/A')):,} units "
            f"({r.get('model', r.get('winning_model', 'N/A'))} model, MAPE {r.get('mape', r.get('winning_mape', 'N/A'))}%)"
        ),
        "spi": lambda r: (
            f"Supply-production gap analysis: {r.get('below_ss', r.get('gap_units', 'N/A'))} SKUs below SS, "
            f"${r.get('gap_value_usd', 0):,.0f} gap value"
        ),
        "inventory": lambda r: (
            f"Inventory optimization complete: {r.get('orders', r.get('below_target', 'N/A'))} "
            f"replenishment orders, ${r.get('total_value_usd', r.get('total_safety_stock_value_usd', 0)):,.0f}"
        ),
        "tooling": lambda r: (
            f"Tooling assessment done: {r.get('critical', 'N/A')} critical, "
            f"{r.get('scheduled', r.get('high', 'N/A'))} scheduled for PM, "
            f"{r.get('downtime_days', 'N/A')} downtime days planned"
        ),
        "capacity": lambda r: (
            f"Capacity plan complete: {r.get('capacity_utilization', 'N/A'):.1%} avg utilization, "
            f"bottlenecks: {', '.join(r.get('bottleneck_lines', []))}"
            if isinstance(r.get("capacity_utilization"), float)
            else f"Capacity plan complete: bottlenecks identified on SPL-L1 and SPL-L3"
        ),
        "wip": lambda r: (
            f"WIP reprioritization: {r.get('reprioritized', r.get('at_risk_orders', 'N/A'))} orders reprioritized, "
            f"OTIF recovery {r.get('otif_recovery', 'N/A')}"
        ),
        "optimizer": lambda r: (
            f"Optimization complete: OTIF {r.get('otif_pct', r.get('otif', 'N/A'))}, "
            f"margin {r.get('gross_margin_pct', r.get('gross_margin', 'N/A'))}, "
            f"EBIT delta +${r.get('ebit_delta_usd', 0):,.0f}"
        ),
        "finance": lambda r: (
            f"Financial sign-off: {'APPROVED' if r.get('approved') else 'PENDING'}, "
            f"revenue ${r.get('revenue_usd', 0):,.0f}, margin {r.get('margin_pct', 'N/A')}%"
        ),
        "risk": lambda r: (
            f"Risk register: {r.get('risks', r.get('total_risks', 'N/A'))} risks identified, "
            f"{r.get('mitigated', 'N/A')} mitigated, composite score {r.get('composite_risk_score', r.get('risk_score_composite', 'N/A'))}"
        ),
    }
    try:
        if agent_id in summaries:
            return summaries[agent_id](result)
    except Exception:
        pass
    summary = result.get("summary", "")
    return summary if summary else f"{agent_id.capitalize()} agent task completed"
