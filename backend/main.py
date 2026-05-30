from __future__ import annotations

# Run: cd backend && uvicorn main:app --reload --port 8000
# Or from repo root: uvicorn backend.main:app --reload --port 8000

"""
FastAPI backend for the Shimano APAC autonomous multi-agent S&OP system.
Provides SSE streaming, session management, and human-in-the-loop answer endpoints.
"""

import asyncio
import json
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
# Quieten noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from session import SessionState, sessions
from orchestrator import run_orchestrator
from persistence import save_session, delete_session_file, load_sessions
import mock_data

# Restore archived (completed / terminated) sessions so they survive restarts.
sessions.update(load_sessions())

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Autopilot S&OP Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_GOAL = """
Q3-2026 S&OP Planning Cycle — Shimano APAC Manufacturing
Scope: 847 SKUs, 12 plants (SPL + SBMB), planning horizon W22–W34 (13 weeks)
Targets: OTIF ≥ 98%, Gross Margin ≥ 22%, Weeks of Supply 4–5 wks
Data sources: SAP S/4HANA, Supplier Portal, Tooling Asset Register
Constraints: Line 4 bottleneck (SPL-L3 at 92%), Supplier X lead-time extension (8 weeks)
"""

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class StartSession(BaseModel):
    goal: str = DEFAULT_GOAL
    name: str = ""
    parent_id: str = ""
    entity: str = ""
    data_upload_id: str = ""   # attach a previously uploaded dataset


class AnswerBody(BaseModel):
    answer: str
    rationale: str = ""


class SuggestNameBody(BaseModel):
    goal: str = ""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage] = []


class AgentConfigBody(BaseModel):
    system_prompt: str | None = None
    temperature: float | None = None


class FeedbackBody(BaseModel):
    session_id: str = ""
    target: str = "run"          # "run" or a step_id
    target_label: str = ""
    agent_id: str = ""
    rating: str = "up"           # "up" | "down"
    comment: str = ""


def _derive_session_name(goal: str, session_id: str) -> str:
    """
    Heuristic fallback name from the goal text: prefer the first non-empty line,
    trimmed to a sensible length. Falls back to a short session id.
    """
    for line in (goal or "").splitlines():
        line = line.strip()
        if line:
            return line[:60]
    return f"Cycle {session_id[:8]}"


# ---------------------------------------------------------------------------
# SSE event generator
# ---------------------------------------------------------------------------
async def event_generator(session: SessionState):
    """
    Yields SSE-formatted events.
    First replays all existing events (for reconnections), then streams new ones.
    Sends keepalive comments every 15 seconds.
    Stops when session is done/error and the queue is empty.
    """
    # Replay existing events for clients that connect after start
    for evt in list(session.events):
        yield f"data: {json.dumps(evt)}\n\n"

    last_keepalive = time.time()

    while True:
        try:
            evt = await asyncio.wait_for(session.event_queue.get(), timeout=1.0)
            yield f"data: {json.dumps(evt)}\n\n"

            # Stop streaming once session is complete and queue is drained
            if session.status in ("done", "error") and session.event_queue.empty():
                break

        except asyncio.TimeoutError:
            # Send keepalive to prevent proxy/browser from closing connection
            if time.time() - last_keepalive > 15:
                yield ": keepalive\n\n"
                last_keepalive = time.time()

            # Check if we should stop
            if session.status in ("done", "error") and session.event_queue.empty():
                break


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

_DATASOURCE_PREVIEW = {
    "sap-mdg":         lambda: mock_data.get_bom_data(),
    "sap-mm":          lambda: mock_data.get_supplier_atp(),
    "sap-ibp":         lambda: mock_data.get_demand_history(),
    "sap-pp":          lambda: mock_data.get_production_orders(),
    "sap-ppcds":       lambda: mock_data.get_capacity_config(),
    "sap-wm":          lambda: {**mock_data.get_inventory_snapshot(), "abc": mock_data.get_abc_classification()},
    "sap-fico":        lambda: mock_data.run_milp_optimization({}),
    "sap-pm":          lambda: mock_data.get_tooling_data(),
    "supplier-portal": lambda: mock_data.get_supplier_atp(),
    "mes":             lambda: mock_data.get_production_orders(),
    "tooling-register":lambda: mock_data.get_tooling_data(),
    "erm":             lambda: mock_data.generate_risk_register(),
}


# ---------------------------------------------------------------------------
# Run-on-your-data — upload + profile a CSV/TSV export
# ---------------------------------------------------------------------------
@app.post("/api/uploads")
async def upload_data(request: Request, filename: str = "upload.csv"):
    """
    Parse + profile an uploaded CSV/TSV dataset for planning on real numbers.
    The file is sent as the raw request body (no multipart dependency); the
    original filename is passed as ?filename=.
    """
    import uploads as uploads_mod
    raw = await request.body()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 8 MB).")
    name = filename or "upload.csv"
    if name.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=415, detail="Excel not supported yet — please export to CSV and re-upload.")
    try:
        rec = uploads_mod.parse_csv(name, raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return uploads_mod.public_record(rec)


@app.get("/api/uploads")
async def list_uploads():
    import uploads as uploads_mod
    return {"uploads": [uploads_mod.public_record(r) for r in
                        sorted(uploads_mod.uploads.values(), key=lambda r: r["uploaded_at"], reverse=True)]}


@app.get("/api/uploads/{upload_id}")
async def get_upload(upload_id: str):
    import uploads as uploads_mod
    rec = uploads_mod.uploads.get(upload_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"No upload '{upload_id}'")
    return uploads_mod.public_record(rec)


@app.get("/api/datasources/{source_id}/preview")
async def datasource_preview(source_id: str):
    fn = _DATASOURCE_PREVIEW.get(source_id)
    if fn is None:
        raise HTTPException(status_code=404, detail=f"No preview for '{source_id}'")
    return fn()


@app.post("/api/sessions/suggest-name")
async def suggest_name(body: SuggestNameBody):
    """
    Suggest a concise cycle name from the goal using the LLM. Falls back to the
    heuristic name (first line) if the model is unavailable.
    """
    fallback = _derive_session_name(body.goal, "")
    try:
        from orchestrator import get_client, DEPLOYMENT
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: get_client().chat.completions.create(
                model=DEPLOYMENT,
                messages=[
                    {"role": "system", "content": (
                        "You name S&OP planning cycles. Given the goal, reply with a single "
                        "concise title (max 6 words, no quotes, no trailing punctuation). "
                        "Capture the quarter/region and any scenario (e.g. 'Q3-2026 APAC Supplier-X Scenario')."
                    )},
                    {"role": "user", "content": body.goal[:1500]},
                ],
                temperature=0.4,
                max_completion_tokens=24,
            ),
        )
        name = (resp.choices[0].message.content or "").strip().strip('"').strip()
        return {"name": name[:60] or fallback, "source": "llm"}
    except Exception as exc:
        return {"name": fallback, "source": "fallback", "detail": str(exc)}


def _heuristic_exec_summary(s: SessionState) -> str:
    """Offline 3-sentence summary built from session KPIs + decisions."""
    k = s.kpis
    bits = []
    if k.get("otif"): bits.append(f"OTIF {k['otif']}")
    if k.get("forecastAcc"): bits.append(f"forecast accuracy {k['forecastAcc']}")
    if k.get("capacityUtil"): bits.append(f"capacity utilisation {k['capacityUtil']}")
    kpi_str = ", landing at " + ", ".join(bits) if bits else ""
    n = len([st for st in s.steps.values() if st.get("agent") != "planner"])
    s1 = f"The cycle ran {n} agent task{'' if n == 1 else 's'} across demand, supply, optimisation and risk{kpi_str}."

    decision = None
    for ev in s.events:
        if ev.get("type") == "answer":
            decision = ev.get("message", "")
            break
    s2 = (f"Key human decision recorded: {decision[:140]}." if decision
          else "No human decision checkpoint was required during this cycle.")

    pd = str(k.get("planDelta") or "")
    if pd.startswith("+"):
        s3 = f"The optimised plan protects {pd} EBIT vs. the unconstrained baseline — recommend approving and locking the plan."
    else:
        s3 = "Recommend reviewing the financial and risk sign-off before approving the plan."
    return f"{s1} {s2} {s3}"


@app.post("/api/sessions/{session_id}/exec-summary")
async def exec_summary(session_id: str):
    """
    LLM-generated 3-sentence executive summary ("what happened + what I
    recommend") for a run. Falls back to a heuristic if the model is unavailable.
    """
    s = sessions.get(session_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    fallback = _heuristic_exec_summary(s)
    try:
        from orchestrator import get_client, DEPLOYMENT
        decisions = [ev.get("message", "") for ev in s.events if ev.get("type") == "answer"]
        context = {
            "goal": (s.goal or "")[:800],
            "status": s.status,
            "kpis": s.kpis,
            "decisions": decisions[:5],
            "step_count": len(s.steps),
        }
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: get_client().chat.completions.create(
                model=DEPLOYMENT,
                messages=[
                    {"role": "system", "content": (
                        "You are the Planner agent. Write a crisp 3-sentence executive summary of an "
                        "S&OP planning run for a busy supply-chain VP: (1) what happened + headline KPIs, "
                        "(2) the key human decision (or that none was needed), (3) your clear recommendation. "
                        "No preamble, no bullet points, exactly 3 sentences."
                    )},
                    {"role": "user", "content": json.dumps(context, default=str)},
                ],
                temperature=0.4,
                max_completion_tokens=220,
            ),
        )
        text = (resp.choices[0].message.content or "").strip()
        return {"summary": text or fallback, "source": "llm" if text else "fallback"}
    except Exception as exc:
        return {"summary": fallback, "source": "fallback", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Planner chat — a conversational assistant that can pull session context
# on demand via tools, and asks the user to clarify when the run is ambiguous.
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = (
    "You are the Planner agent for Shimano APAC's autonomous S&OP system, acting as a concise, "
    "practical conversational assistant to a human supply-chain planner. Ground your answers in "
    "S&OP and supply-chain planning best practice.\n\n"
    "By default, answer general planning questions directly. If the user refers to a specific "
    "planning run / cycle / session (its status, plan, steps, KPIs, or decisions), use the tools "
    "to look up real data — never fabricate run-specific numbers. Use list_sessions to discover "
    "what runs exist. If it is ambiguous which session the user means (e.g. several exist and they "
    "didn't specify), ask them to clarify and show the available sessions by name. Only call "
    "get_session_context once you know which session. Keep replies short unless asked for detail.\n\n"
    "You can also ACT on the user's behalf: start_cycle launches a new planning run, and "
    "answer_decision submits a human decision to a run that is paused awaiting one. Only take these "
    "actions when the user clearly asks; for answer_decision, confirm which session and option first "
    "if there's any ambiguity. After acting, briefly state what you did (include the run name)."
)

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_sessions",
            "description": "List planning runs/sessions (newest first) with id, name, status and a goal excerpt.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_session_context",
            "description": "Get full context for one planning session: goal, status, KPIs, steps, and any pending decision.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string", "description": "The session_id to look up."},
                },
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_cycle",
            "description": "Start a NEW S&OP planning cycle/run. Use only when the user explicitly asks to start/launch a run.",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {"type": "string", "description": "Planning goal/scope for the run. Optional — a sensible default is used if omitted."},
                    "name": {"type": "string", "description": "Optional short name for the cycle."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "answer_decision",
            "description": "Submit a human decision to a run that is PAUSED awaiting one. Use only when the user states their decision.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string", "description": "The session_id of the paused run."},
                    "answer": {"type": "string", "description": "The decision text / chosen option."},
                },
                "required": ["session_id", "answer"],
            },
        },
    },
]


def _chat_list_sessions() -> list[dict]:
    ordered = sorted(sessions.values(), key=lambda s: s.created_at, reverse=True)
    return [{
        "session_id": s.session_id,
        "name": s.name,
        "status": s.status,
        "created_at": s.created_at,
        "goal": (s.goal or "")[:200],
    } for s in ordered]


def _chat_get_session_context(session_id: str) -> dict:
    s = sessions.get(session_id)
    if s is None:
        return {"error": f"No session with id '{session_id}'. Use list_sessions to see valid ids."}
    steps = [{
        "label": st.get("label"),
        "agent": st.get("agent"),
        "status": st.get("status"),
    } for st in list(s.steps.values())[:60]]
    return {
        "session_id": s.session_id,
        "name": s.name,
        "goal": s.goal,
        "status": s.status,
        "elapsed": round(s.elapsed(), 1),
        "kpis": s.kpis,
        "pending_question": s.pending_question,
        "steps": steps,
    }


def _chat_start_cycle(goal: str, name: str) -> dict:
    """Create + launch a new session (same as POST /api/sessions)."""
    goal = (goal or "").strip() or DEFAULT_GOAL
    session_id = str(uuid.uuid4())
    nm = (name or "").strip() or _derive_session_name(goal, session_id)
    session = SessionState(session_id=session_id, name=nm, goal=goal)
    sessions[session_id] = session
    session.bg_task = asyncio.create_task(run_orchestrator(session, goal))
    return {"session_id": session_id, "name": nm, "status": "running", "started": True}


async def _chat_answer_decision(session_id: str, answer: str) -> dict:
    s = sessions.get(session_id)
    if s is None:
        return {"error": f"No session with id '{session_id}'. Use list_sessions to see valid ids."}
    if s.status != "paused" or s.pending_question is None:
        return {"error": f"Session '{s.name}' is not awaiting a decision (status: {s.status})."}
    await s.set_answer(answer)
    return {"session_id": session_id, "name": s.name, "answer": answer, "submitted": True}


async def _chat_dispatch(name: str, args: dict):
    if name == "list_sessions":
        return _chat_list_sessions()
    if name == "get_session_context":
        return _chat_get_session_context(args.get("session_id", ""))
    if name == "start_cycle":
        return _chat_start_cycle(args.get("goal", ""), args.get("name", ""))
    if name == "answer_decision":
        return await _chat_answer_decision(args.get("session_id", ""), args.get("answer", ""))
    return {"error": f"Unknown tool '{name}'"}


@app.post("/api/chat")
async def planner_chat(body: ChatBody):
    """Conversational planner assistant with tool access to session data."""
    try:
        from orchestrator import get_client, DEPLOYMENT
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat unavailable: {exc}")

    messages: list[dict] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    for m in body.messages[-20:]:  # keep recent history bounded
        if m.role in ("user", "assistant") and m.content:
            messages.append({"role": m.role, "content": m.content})

    loop = asyncio.get_event_loop()
    try:
        for _ in range(5):  # bounded tool-calling loop
            resp = await loop.run_in_executor(
                None,
                lambda msgs=messages: get_client().chat.completions.create(
                    model=DEPLOYMENT,
                    messages=msgs,
                    tools=CHAT_TOOLS,
                    tool_choice="auto",
                    temperature=0.4,
                    max_completion_tokens=700,
                ),
            )
            msg = resp.choices[0].message
            if not msg.tool_calls:
                return {"reply": (msg.content or "").strip()}

            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [{
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                } for tc in msg.tool_calls],
            })
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = await _chat_dispatch(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                })

        return {"reply": "I wasn't able to complete that — could you rephrase or be more specific?"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")


# ---------------------------------------------------------------------------
# Agent runtime config (Agent Settings → live runs)
# ---------------------------------------------------------------------------
@app.get("/api/agents")
async def list_agent_configs():
    import agent_config
    return {"agents": agent_config.list_configs()}


@app.get("/api/agents/{agent_id}")
async def get_agent_config(agent_id: str):
    import agent_config
    cfg = agent_config.get_config(agent_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return cfg


@app.put("/api/agents/{agent_id}")
async def update_agent_config(agent_id: str, body: AgentConfigBody):
    import agent_config
    cfg = agent_config.set_config(agent_id, system_prompt=body.system_prompt, temperature=body.temperature)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return cfg


@app.post("/api/agents/{agent_id}/reset")
async def reset_agent_config(agent_id: str):
    import agent_config
    cfg = agent_config.reset_config(agent_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return cfg


@app.get("/api/activity")
async def activity():
    """Cross-session agent activity for the live Agent Console (fleet view).
    Aggregates every session's steps into per-agent status + the runs each agent
    is currently working in. (Multi-user grouping is future work — needs auth.)"""
    agents: dict[str, dict] = {}
    runs = []
    for s in sessions.values():
        running_here = []
        for st in s.steps.values():
            aid = st.get("agent", "")
            if not aid:
                continue
            a = agents.setdefault(aid, {"agent_id": aid, "active_sessions": [], "done_count": 0})
            if st.get("status") == "running":
                a["active_sessions"].append({
                    "session_id": s.session_id, "name": s.name, "label": st.get("label", ""),
                })
                running_here.append(aid)
            elif st.get("status") == "done":
                a["done_count"] += 1
        if s.status in ("running", "paused"):
            runs.append({
                "session_id": s.session_id, "name": s.name, "status": s.status,
                "entity": s.entity, "running_agents": sorted(set(running_here)),
            })
    agent_list = [{
        "agent_id": a["agent_id"],
        "active_count": len(a["active_sessions"]),
        "active_sessions": a["active_sessions"],
        "done_count": a["done_count"],
    } for a in agents.values()]
    totals = {
        "active_agents": sum(1 for a in agent_list if a["active_count"] > 0),
        "running_sessions": sum(1 for s in sessions.values() if s.status == "running"),
        "paused_sessions": sum(1 for s in sessions.values() if s.status == "paused"),
        "total_sessions": len(sessions),
    }
    return {"agents": agent_list, "runs": sorted(runs, key=lambda r: r["name"]), "totals": totals}


# ---------------------------------------------------------------------------
# In-app feedback (👍 / 👎 + comment) on agent outputs / whole runs
# ---------------------------------------------------------------------------
@app.post("/api/feedback")
async def submit_feedback(body: FeedbackBody):
    import feedback_store
    return feedback_store.record(body.model_dump())


@app.get("/api/feedback")
async def get_feedback(session_id: str = ""):
    import feedback_store
    return {"feedback": feedback_store.list_feedback(session_id)}


@app.get("/api/feedback/summary")
async def feedback_summary():
    import feedback_store
    return feedback_store.summary()


# ---------------------------------------------------------------------------
# Alerts & notifications — derived from live session state + optional webhook
# ---------------------------------------------------------------------------
class WebhookBody(BaseModel):
    webhook_url: str | None = None
    enabled: bool | None = None


@app.get("/api/notifications")
async def get_notifications():
    import notifications
    return {"alerts": notifications.compute_alerts(sessions)}


@app.get("/api/notifications/webhook")
async def get_webhook():
    import notifications
    cfg = notifications.get_config()
    # don't echo the full URL back for safety; just whether it's set
    return {"enabled": cfg.get("enabled", False), "configured": bool(cfg.get("webhook_url"))}


@app.put("/api/notifications/webhook")
async def set_webhook(body: WebhookBody):
    import notifications
    cfg = notifications.set_config(body.webhook_url, body.enabled)
    return {"enabled": cfg.get("enabled", False), "configured": bool(cfg.get("webhook_url"))}


@app.post("/api/notifications/test")
async def test_webhook():
    import notifications
    return notifications.dispatch_webhook("✅ Autopilot S&OP test alert — your webhook is connected.")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Autopilot S&OP Backend",
        "active_sessions": len(sessions),
    }


# IMPORTANT: /api/sessions/current and the list endpoint MUST be defined before
# /api/sessions/{session_id} to prevent FastAPI from matching "current" as a session_id.

def _session_summary(s: SessionState) -> dict:
    """Lightweight metadata for switcher / home listing."""
    return {
        "session_id": s.session_id,
        "name": s.name,
        "goal": s.goal,
        "status": s.status,
        "created_at": s.created_at,
        "elapsed": s.elapsed(),
        "kpis": s.kpis,
        "step_count": len(s.steps),
        "parent_id": s.parent_id,
        "parent_name": sessions[s.parent_id].name if s.parent_id in sessions else "",
        "entity": s.entity,
    }


@app.get("/api/sessions")
async def list_sessions(entity: str = ""):
    """List all sessions, newest first. Optional ?entity= scopes to one entity."""
    ordered = sorted(sessions.values(), key=lambda s: s.created_at, reverse=True)
    if entity:
        ordered = [s for s in ordered if s.entity == entity]
    return {"sessions": [_session_summary(s) for s in ordered]}


@app.get("/api/sessions/current")
async def get_current_session():
    """Return the most recently created session ID, or 404 if none."""
    if not sessions:
        raise HTTPException(status_code=404, detail="No active sessions")

    # Find the most recently created session
    latest = max(sessions.values(), key=lambda s: s.created_at)
    return _session_summary(latest)


@app.post("/api/sessions")
async def create_session(body: StartSession):
    """
    Create a new S&OP session and start the autonomous orchestrator in the background.
    Returns the session_id immediately; use the SSE endpoint to stream progress.
    """
    session_id = str(uuid.uuid4())
    name = (body.name or "").strip() or _derive_session_name(body.goal, session_id)

    # If a dataset was uploaded, fold its summary into the goal so the agents
    # plan on the user's real numbers.
    goal = body.goal
    if body.data_upload_id:
        import uploads as uploads_mod
        rec = uploads_mod.uploads.get(body.data_upload_id)
        if rec:
            goal = f"{body.goal}\n\n--- UPLOADED DATA ---\n{rec['summary']}"

    session = SessionState(session_id=session_id, name=name, goal=goal)
    if body.parent_id and body.parent_id in sessions:
        session.parent_id = body.parent_id
    session.entity = (body.entity or "").strip()
    sessions[session_id] = session

    # Launch orchestrator as a background task
    bg_task = asyncio.create_task(run_orchestrator(session, goal))
    session.bg_task = bg_task

    return {
        "session_id": session_id,
        "name": name,
        "status": "running",
        "message": "S&OP session started. Connect to SSE endpoint to stream events.",
    }


@app.get("/api/sessions/{session_id}/events")
async def stream_events(session_id: str):
    """
    SSE endpoint — streams all S&OP events for a session.
    Replays historical events on reconnect, then streams new ones.
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    return StreamingResponse(
        event_generator(session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Return current state of a session."""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    return {
        "session_id": session.session_id,
        "name": session.name,
        "goal": session.goal,
        "status": session.status,
        "elapsed": session.elapsed(),
        "kpis": session.kpis,
        "steps": session.steps,
        "pending_question": session.pending_question,
        "parent_id": session.parent_id,
        "parent_name": sessions[session.parent_id].name if session.parent_id in sessions else "",
        "entity": session.entity,
        "event_count": len(session.events),
    }


@app.post("/api/sessions/{session_id}/answer")
async def submit_answer(session_id: str, body: AnswerBody):
    """
    Submit a human answer for a paused session.
    The orchestrator is awaiting this answer at ask_human().
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    if session.status != "paused":
        raise HTTPException(
            status_code=400,
            detail=f"Session is not paused (current status: '{session.status}'). No answer expected.",
        )

    if session.pending_question is None:
        raise HTTPException(
            status_code=400,
            detail="No pending question found for this session.",
        )

    await session.set_answer(body.answer, body.rationale)

    return {
        "session_id": session_id,
        "answer_accepted": True,
        "answer": body.answer,
        "status": session.status,
    }


@app.get("/api/sessions/{session_id}/decisions")
async def get_decisions(session_id: str):
    """Audit trail of human decisions for a run (with KPI snapshots)."""
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return {"session_id": session_id, "decisions": session.decisions}


async def _stop_session_tasks(session: SessionState) -> None:
    """Cancel the orchestrator and any outstanding agent tasks for a session."""
    if session.bg_task and not session.bg_task.done():
        session.bg_task.cancel()
        try:
            await session.bg_task
        except asyncio.CancelledError:
            pass
    for task in session.agent_tasks.values():
        if not task.done():
            task.cancel()


@app.post("/api/sessions/{session_id}/terminate")
async def terminate_session(session_id: str):
    """
    Stop a running session but KEEP it: the orchestrator is cancelled and the
    session is marked done and archived so it can be reviewed later.
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    await _stop_session_tasks(session)

    if session.status not in ("done", "error"):
        await session.done(summary="Session terminated by user")  # persists
    else:
        save_session(session)

    return {"session_id": session_id, "status": session.status, "terminated": True}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Permanently remove a session from memory and disk (hard delete)."""
    session = sessions.pop(session_id, None)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    await _stop_session_tasks(session)
    delete_session_file(session_id)

    return {"session_id": session_id, "deleted": True}
