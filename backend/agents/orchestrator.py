from __future__ import annotations

"""
Orchestrator for the Shimano APAC autonomous S&OP multi-agent system.
The Planner agent autonomously runs the full S&OP cycle using Azure OpenAI function calling.
"""

import asyncio
import json
import logging
import os
from uuid import uuid4

from openai import AzureOpenAI

logger = logging.getLogger(__name__)

from session import SessionState
from .agent_defs import AGENT_DEFS
from .workers import run_worker_agent

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

PLANNER_DEF = AGENT_DEFS["planner"]
PLANNER_TOOLS = PLANNER_DEF["tools"]
PLANNER_SYSTEM_PROMPT = PLANNER_DEF["system_prompt"]
from .agent_config import effective_system_prompt, effective_temperature


# ---------------------------------------------------------------------------
# Tool handlers for the planner
# ---------------------------------------------------------------------------
async def _handle_dispatch_agent(session: SessionState, args: dict) -> dict:
    """Dispatch a worker agent as an asyncio Task and return the task_id."""
    agent_id = args.get("agent_id", "")
    task = args.get("task", "")
    context = args.get("context", "")

    task_id = f"{agent_id}-{uuid4().hex[:6]}"

    # Link each dispatched agent back to the planner's current orchestration
    # step so the swimlane can draw connectors (planner → agents fan-out).
    deps = [session.current_planner_step] if session.current_planner_step else []

    # Create and store the asyncio Task
    async_task = asyncio.create_task(
        run_worker_agent(session, agent_id, task, context, task_id, deps)
    )
    session.agent_tasks[task_id] = async_task

    await session.emit_log(
        "planner",
        f"→ Dispatching {agent_id}: {task[:80]}",
    )

    return {"task_id": task_id, "status": "dispatched", "agent_id": agent_id}


async def _handle_wait_for_agents(session: SessionState, args: dict) -> dict:
    """Wait for a list of task_ids to complete and collect results."""
    task_ids: list[str] = args.get("task_ids", [])

    if not task_ids:
        return {"results": {}, "completed": 0}

    # Gather all tasks, tolerating partial failures
    tasks = []
    valid_ids = []
    for tid in task_ids:
        t = session.agent_tasks.get(tid)
        if t is not None:
            tasks.append(t)
            valid_ids.append(tid)
        else:
            await session.emit_log(
                "planner",
                f"WARNING: task_id '{tid}' not found in agent_tasks",
            )

    if not tasks:
        return {"results": {}, "completed": 0, "warning": "No valid task IDs found"}

    await session.emit_log(
        "planner",
        f"⏳ Waiting for {len(tasks)} agent(s): {', '.join(valid_ids)}",
    )

    gathered = await asyncio.gather(*tasks, return_exceptions=True)

    results: dict = {}
    for tid, outcome in zip(valid_ids, gathered):
        if isinstance(outcome, Exception):
            results[tid] = {"error": str(outcome), "task_id": tid}
            await session.emit_log("planner", f"Agent {tid} raised exception: {outcome}")
        else:
            results[tid] = outcome
            session.agent_results[tid] = outcome

    await session.emit_log(
        "planner",
        f"✓ {len(results)} agent(s) completed",
    )

    return {"results": results, "completed": len(results)}


async def _handle_ask_human(
    session: SessionState, args: dict, planner_step_id: str
) -> dict:
    """Pause the session and wait for a human decision."""
    question = args.get("question", "")
    options: list[str] = args.get("options", [])
    context = args.get("context", "")

    q_step_id = f"pln-q-{uuid4().hex[:4]}"

    await session.emit_log("planner", f"Awaiting human decision on: {question[:80]}")
    await session.emit_question(
        step_id=q_step_id,
        agent="planner",
        label="Decision Required",
        text=question,
        options=options,
    )

    # Mark current planner step as paused
    if planner_step_id in session.steps:
        session.steps[planner_step_id]["status"] = "paused"

    answer = await session.wait_for_answer()

    await session.emit_log("planner", f"Human decision received: {answer}")

    # Resume with a new planner step
    resume_step_id = f"pln-resume-{uuid4().hex[:4]}"
    await session.emit_step_start(
        agent="planner",
        step_id=resume_step_id,
        label="Incorporating Human Decision",
        data_source="Human Input",
        deps=[session.current_planner_step] if session.current_planner_step else [],
    )
    session.current_planner_step = resume_step_id

    return {"answer": answer, "context": context, "resume_step_id": resume_step_id}


async def _handle_complete_session(session: SessionState, args: dict) -> dict:
    """Complete the session and emit final KPIs."""
    summary = args.get("summary", "S&OP cycle complete.")
    otif = args.get("otif", "97.8%")
    forecast_acc = args.get("forecast_acc", "94.2%")
    capacity_util = args.get("capacity_util", "84.6%")
    wos = args.get("wos", "4.3 wks")
    ebit_delta = args.get("ebit_delta", 140_000)

    await session.emit_kpi("otif", otif)
    await session.emit_kpi("forecastAcc", forecast_acc)
    await session.emit_kpi("capacityUtil", capacity_util)
    await session.emit_kpi("wos", wos)
    await session.emit_kpi("planDelta", f"+${ebit_delta:,}")

    await session.emit_log("planner", "S&OP cycle complete — all KPIs recorded")
    await session.done(summary=summary)

    return {"done": True, "summary": summary}


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------
async def run_orchestrator(session: SessionState, goal: str) -> None:
    """
    Main orchestration loop.
    The Planner LLM autonomously coordinates the S&OP cycle by dispatching
    worker agents, waiting for results, asking the human a decision question,
    and completing the session.
    """
    planner_step_id = f"pln-{uuid4().hex[:6]}"
    await session.emit_step_start(
        agent="planner",
        step_id=planner_step_id,
        label="Parse Goal & Build Task Graph",
        data_source="All Systems",
    )
    session.current_planner_step = planner_step_id
    await session.emit_log("planner", "Initializing S&OP orchestration cycle")
    await session.emit_log("planner", f"Goal: {goal[:120]}")

    # Initial planner message
    messages: list[dict] = [
        {"role": "system", "content": effective_system_prompt("planner")},
        {
            "role": "user",
            "content": (
                f"Begin the S&OP planning cycle with this goal:\n\n{goal}\n\n"
                "Follow the playbook in your system prompt. "
                "Start by dispatching Phase 1 agents in parallel, then proceed through each phase. "
                "Remember to ask the human for a decision at the Phase 3 checkpoint."
            ),
        },
    ]

    loop = asyncio.get_event_loop()
    phase1_complete = False
    resume_step_id: str | None = None

    try:
        for iteration in range(30):
            await session.emit_log(
                "planner",
                f"Planner iteration {iteration + 1}",
            )
            logger.debug("[planner] iter %d — %d messages", iteration+1, len(messages))

            # Call the Planner LLM
            try:
                import llm_audit
                response = await loop.run_in_executor(
                    None,
                    lambda: llm_audit.audited_create(
                        get_client(),
                        session=session, agent="planner", model=get_deployment(),
                        messages=messages,
                        tools=PLANNER_TOOLS,
                        tool_choice="auto",
                        temperature=effective_temperature("planner"),
                        max_completion_tokens=2048,
                    ),
                )
            except Exception as exc:
                await session.emit_log("planner", f"LLM call failed: {exc}")
                await session.emit({
                    "type": "error",
                    "agent": "planner",
                    "message": str(exc),
                })
                session.status = "error"
                return

            msg = response.choices[0].message

            if not msg.tool_calls:
                # No more tool calls — planner is done with text response
                logger.info("[planner] complete — %s", msg.content[:300] if msg.content else "(no content)")
                await session.emit_log(
                    "planner",
                    f"Planner final message: {(msg.content or '')[:200]}",
                )
                # If session isn't already done, mark it done now
                if session.status not in ("done", "error"):
                    await session.done(summary=msg.content or "S&OP cycle completed.")
                break

            # Append assistant message
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            })

            # Process each tool call
            session_done = False
            for tool_call in msg.tool_calls:
                tool_name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                await session.emit_log(
                    "planner",
                    f"Planner tool call: {tool_name}",
                )

                # Route to the appropriate handler
                if tool_name == "dispatch_agent":
                    agent_id = args.get("agent_id", "")
                    task_text = args.get("task", "")
                    logger.info("[planner] dispatch_agent → %s: %s", agent_id, task_text[:120])
                    tool_result = await _handle_dispatch_agent(session, args)

                    # Mark Phase 1 task graph step complete after first batch of dispatches
                    if not phase1_complete and session.steps.get(planner_step_id, {}).get("status") == "running":
                        await session.emit_step_complete(
                            agent="planner",
                            step_id=planner_step_id,
                            message="Task graph built — agents dispatched",
                            output={"dispatched_agent": args.get("agent_id")},
                        )
                        phase1_complete = True

                elif tool_name == "wait_for_agents":
                    logger.info("[planner] wait_for_agents: %s", args.get("task_ids", []))
                    tool_result = await _handle_wait_for_agents(session, args)

                elif tool_name == "ask_human":
                    question_text = args.get("question", "")
                    logger.info("[planner] ask_human: %s", question_text[:200])
                    current_step = resume_step_id or planner_step_id
                    tool_result = await _handle_ask_human(session, args, current_step)
                    resume_step_id = tool_result.get("resume_step_id")

                elif tool_name == "complete_session":
                    logger.info("[planner] complete_session called")
                    # Complete the current planner step if still running
                    current_step = resume_step_id or planner_step_id
                    if session.steps.get(current_step, {}).get("status") == "running":
                        await session.emit_step_complete(
                            agent="planner",
                            step_id=current_step,
                            message="All phases complete — finalizing S&OP plan",
                        )
                    tool_result = await _handle_complete_session(session, args)
                    session_done = True

                else:
                    await session.emit_log(
                        "planner",
                        f"Unknown planner tool: {tool_name}",
                    )
                    tool_result = {"error": f"Unknown planner tool: {tool_name}"}

                # Append tool result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result),
                })

            if session_done or session.status in ("done", "error"):
                break

        else:
            # Exhausted max iterations
            await session.emit_log(
                "planner",
                "Max orchestrator iterations reached — completing session",
            )
            if session.status not in ("done", "error"):
                await session.emit_kpi("otif", "97.8%")
                await session.emit_kpi("forecastAcc", "94.2%")
                await session.emit_kpi("capacityUtil", "84.6%")
                await session.emit_kpi("wos", "4.3 wks")
                await session.emit_kpi("planDelta", "+$140,000")
                await session.done(
                    summary="S&OP cycle completed after maximum orchestration iterations."
                )

    except asyncio.CancelledError:
        await session.emit_log("planner", "Orchestration cancelled")
        session.status = "error"

    except Exception as exc:
        await session.emit_log("planner", f"Orchestration error: {exc}")
        await session.emit({
            "type": "error",
            "agent": "planner",
            "message": str(exc),
        })
        session.status = "error"
