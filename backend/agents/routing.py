from __future__ import annotations

"""
Dynamic agent routing for the S&OP orchestrator.

The Planner's "route" is no longer hardcoded. It is derived per-run from the
*active agent set*, which is:

    (per-run requested subset, if any)  ∩  (agents enabled in Agent Settings)

Two things are generated from that active set:
  • build_planner_tools — narrows the dispatch_agent enum so the Planner can
    only ever dispatch active agents (the hard gate).
  • build_playbook — regenerates the PHASE 1–5 playbook text (grouped by each
    agent's `phase` metadata), making the Phase 3 human-decision checkpoint
    conditional on the demand/capacity agents being active.
"""

import copy

from .agent_defs import AGENT_DEFS
from .agent_config import enabled_specialists

# Specialist agents (everything the Planner can dispatch), in canonical order.
SPECIALIST_IDS: list[str] = [aid for aid in AGENT_DEFS if aid != "planner"]

# Phase headers for the generated playbook. Phase 3 is the human checkpoint and
# is handled separately (it dispatches no agents).
PHASE_LABELS: dict[int, str] = {
    1: "PHASE 1 — DATA FOUNDATION (dispatch in parallel)",
    2: "PHASE 2 — SUPPLY & CAPACITY ANALYSIS (dispatch after Phase 1, run in parallel)",
    4: "PHASE 4 — WIP & OPTIMIZATION (dispatch after the human decision, run in parallel)",
    5: "PHASE 5 — FINAL SIGN-OFF (dispatch after optimization, run in parallel)",
}

# Concise per-agent action lines, kept close to the original hardcoded playbook
# so the generated prompt reads naturally. Falls back to the agent name.
AGENT_ACTIONS: dict[str, str] = {
    "masterdata": "Validate BOM records and score data quality",
    "procurement": "Get supplier ATP and identify component gaps",
    "demand": "Run forecast model tournament and generate demand plan",
    "spi": "Reconcile inventory vs. safety stock, identify gaps",
    "inventory": "Run ABC classification and compute safety stock levels",
    "tooling": "Assess tooling risks and schedule maintenance",
    "capacity": "Run capacity plan and identify bottlenecks",
    "wip": "Prioritize at-risk production orders based on the bottleneck and decision",
    "optimizer": "Run MILP optimization incorporating the human decision",
    "finance": "Compute revenue, margin, and generate financial sign-off",
    "risk": "Assess all risks and generate risk register",
}


def resolve_active_agents(requested: list[str] | None) -> list[str]:
    """Active set for a run = (requested subset or all) ∩ enabled, in canonical
    order. If the requested subset resolves to nothing valid, fall back to all
    enabled agents so a run is never left with zero specialists."""
    enabled = enabled_specialists()
    if not requested:
        return enabled
    req = {a for a in requested}
    active = [a for a in enabled if a in req]
    return active or enabled


def build_planner_tools(active_ids: list[str]) -> list[dict]:
    """Clone the planner tool schema, narrowing dispatch_agent's enum to the
    active agents (the hard gate the LLM cannot cross)."""
    tools = copy.deepcopy(AGENT_DEFS["planner"]["tools"])
    enum = list(active_ids) or SPECIALIST_IDS
    for t in tools:
        fn = t.get("function", {})
        if fn.get("name") == "dispatch_agent":
            fn["parameters"]["properties"]["agent_id"]["enum"] = enum
    return tools


def _checkpoint_block(active: set[str]) -> str:
    """Phase 3 — the critical human decision. The demand-spike question only
    makes sense when demand (and capacity, for the constraint) are active."""
    if "demand" in active and "capacity" in active:
        return (
            "PHASE 3 — CRITICAL DECISION CHECKPOINT:\n"
            "  • After reviewing demand and capacity results, ask the human ONE critical question.\n"
            "  • If LightGBM forecasts a demand spike >30% for premium groupsets (W24–W26), ask:\n"
            '    "DRG-XTR-001 demand spike of +34% detected for W24–W26. With Supplier X at 8-week '
            "lead time and SPL-L3 at 92% capacity, should we: (A) Accept spike in full and approve "
            "emergency overtime + air freight ($85K cost), (B) Cap spike at +20% and reallocate "
            'to W28–W30, or (C) Reject spike and hold baseline forecast?"\n'
        )
    if "demand" in active or "capacity" in active:
        return (
            "PHASE 3 — DECISION CHECKPOINT:\n"
            "  • After reviewing the Phase 1–2 results, if a material trade-off requires human "
            "judgment, ask the human ONE concise decision question with clear options. "
            "Otherwise proceed without asking.\n"
        )
    # Neither demand nor capacity is active — no meaningful checkpoint.
    return (
        "PHASE 3 — DECISION CHECKPOINT:\n"
        "  • No human decision checkpoint is required for this cycle; proceed directly.\n"
    )


def build_playbook(active_ids: list[str]) -> str:
    """Generate the PHASE playbook for the active agents, grouped by each
    agent's `phase`. Phases with no active agents are omitted."""
    active = set(active_ids)
    by_phase: dict[int, list[str]] = {}
    for aid in active_ids:
        phase = AGENT_DEFS[aid].get("phase", 1)
        by_phase.setdefault(phase, []).append(aid)

    out: list[str] = [
        "AGENT PLAYBOOK FOR THIS CYCLE — dispatch only the agents listed below, "
        "in the phase order shown:\n",
    ]
    # Walk phases in order, inserting the Phase 3 checkpoint between 2 and 4.
    for phase in (1, 2, 3, 4, 5):
        if phase == 3:
            out.append(_checkpoint_block(active))
            out.append("")
            continue
        ids = by_phase.get(phase)
        if not ids:
            continue
        out.append(PHASE_LABELS.get(phase, f"PHASE {phase}") + ":")
        for aid in ids:
            action = AGENT_ACTIONS.get(aid, AGENT_DEFS[aid].get("name", aid))
            out.append(f"  • {aid}: {action}")
        out.append("")

    return "\n".join(out).strip()
