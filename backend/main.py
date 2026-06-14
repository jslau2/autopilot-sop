from __future__ import annotations

# Run: cd backend && uvicorn main:app --reload --port 8000
# Or from repo root: uvicorn backend.main:app --reload --port 8000

"""
FastAPI backend for the Shimano APAC autonomous multi-agent S&OP system.
Provides SSE streaming, session management, and human-in-the-loop answer endpoints.
"""

import asyncio
import json
import re
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

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

from collections import OrderedDict

from session import SessionState, sessions
from agents.orchestrator import run_orchestrator
from persistence import save_session, delete_session_file
import mock_data
import bom_graph
import session_store

# Archived (terminal) sessions live in SQLite and are hydrated lazily — they are
# NOT bulk-loaded into memory at startup (that used to grow RAM with history).
session_store.init()

from features import scheduler
scheduler.load()

import llm_audit
llm_audit.load()

from features import chat_store
chat_store.init()

# Small LRU of archived sessions hydrated on demand (when a past run is opened),
# so reopening history doesn't permanently grow memory.
_HYDRATED_CAP = 32
_hydrated: "OrderedDict[str, SessionState]" = OrderedDict()


def _get_session(session_id: str) -> SessionState | None:
    """Live session if present, else hydrate from the archive (cached)."""
    s = sessions.get(session_id)
    if s is not None:
        return s
    s = _hydrated.get(session_id)
    if s is not None:
        _hydrated.move_to_end(session_id)
        return s
    s = session_store.hydrate(session_id)
    if s is not None:
        _hydrated[session_id] = s
        _hydrated.move_to_end(session_id)
        while len(_hydrated) > _HYDRATED_CAP:
            _hydrated.popitem(last=False)
    return s


def _resolve_name(session_id: str) -> str:
    if not session_id:
        return ""
    s = sessions.get(session_id) or _hydrated.get(session_id)
    if s is not None:
        return s.name
    return session_store.name_of(session_id)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Autopilot S&OP Backend", version="2.0.0")

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
    agents: list[str] | None = None   # optional per-run subset of specialist agents to run


class AnswerBody(BaseModel):
    answer: str
    rationale: str = ""


class SuggestNameBody(BaseModel):
    goal: str = ""


class BomAskBody(BaseModel):
    question: str = ""


class KickoffBody(BaseModel):
    brief: str = ""
    entity: str = ""
    agents: list[str] | None = None   # optional per-run subset of specialist agents to run


class ScheduleBody(BaseModel):
    name: str = ""
    goal: str = DEFAULT_GOAL
    cadence: str = "weekly"
    entity: str = ""


class ScheduleUpdateBody(BaseModel):
    enabled: bool | None = None


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage] = []
    session_id: str = ""   # optional "current run" hint for the global thread


class AgentConfigBody(BaseModel):
    system_prompt: str | None = None
    temperature: float | None = None
    enabled: bool | None = None


class ApprovalBody(BaseModel):
    role: str
    decision: str = "approve"   # "approve" | "reject"
    approver: str = ""
    comment: str = ""


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

    Streams from session.events via an index cursor (the complete, ordered log),
    which covers both replay-on-connect and live tailing with no duplicates. The
    event_queue is used only as a low-latency wakeup signal — its contents would
    otherwise overlap the replayed snapshot and double-send early events.
    Sends keepalive comments every 15 seconds; stops when the session is terminal
    and the log is fully flushed.
    """
    idx = 0
    last_keepalive = time.time()

    while True:
        # Flush any events appended since we last looked.
        while idx < len(session.events):
            yield f"data: {json.dumps(session.events[idx])}\n\n"
            idx += 1

        # Stop once the session is complete and everything has been sent.
        if session.status in ("done", "error") and idx >= len(session.events):
            break

        try:
            # Wait for a wakeup (new event) — drain the signal queue without
            # yielding from it (events are sourced from session.events above).
            await asyncio.wait_for(session.event_queue.get(), timeout=1.0)
            while not session.event_queue.empty():
                session.event_queue.get_nowait()
        except asyncio.TimeoutError:
            # Send keepalive to prevent proxy/browser from closing connection
            if time.time() - last_keepalive > 15:
                yield ": keepalive\n\n"
                last_keepalive = time.time()



# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

_DATASOURCE_PREVIEW = {
    "neo4j-bom":       lambda: bom_graph.validate_bom() or mock_data.get_bom_data(),
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
    from features import uploads as uploads_mod
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
    from features import uploads as uploads_mod
    return {"uploads": [uploads_mod.public_record(r) for r in
                        sorted(uploads_mod.uploads.values(), key=lambda r: r["uploaded_at"], reverse=True)]}


@app.get("/api/uploads/{upload_id}")
async def get_upload(upload_id: str):
    from features import uploads as uploads_mod
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


# ---------------------------------------------------------------------------
# BOM graph (Neo4j) — interactive visualization endpoints
# ---------------------------------------------------------------------------
@app.get("/api/bom/search")
async def bom_search(q: str = "", limit: int = 25):
    """Lookup BOM materials by code or description for the explorer search box."""
    result = bom_graph.search_materials(q, limit)
    if result is None:
        raise HTTPException(status_code=503, detail="BOM graph unavailable")
    return result


@app.get("/api/bom/graph")
async def bom_graph_view(material: str, direction: str = "down", levels: int = 10):
    """Node+edge subgraph for visualizing a material's explosion (down) or where-used (up)."""
    if not material:
        raise HTTPException(status_code=422, detail="material is required")
    result = bom_graph.bom_subgraph(material, direction, levels)
    if result is None:
        raise HTTPException(status_code=503, detail="BOM graph unavailable")
    return result


def _extract_cypher(text: str) -> str:
    """Pull a Cypher statement out of an LLM reply, tolerating ```cypher fences."""
    t = (text or "").strip()
    fence = re.search(r"```(?:cypher)?\s*(.+?)```", t, re.S | re.I)
    if fence:
        t = fence.group(1).strip()
    return t.rstrip(";").strip()


async def _bom_nl_to_cypher(question: str) -> str:
    """Translate a natural-language BOM question into a single read-only Cypher query."""
    from agents.orchestrator import get_client, get_deployment
    loop = asyncio.get_event_loop()
    system = (
        "You translate a natural-language question about a Neo4j BOM graph into ONE read-only Cypher "
        "query. Output ONLY the Cypher — no prose, no markdown fences. " + _BOM_SCHEMA_HINT
    )
    resp = await loop.run_in_executor(
        None,
        lambda: llm_audit.audited_create(
            get_client(), session=None, agent="bom-nl2cypher", model=get_deployment(),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": question}],
            temperature=0,
            max_completion_tokens=400,
        ),
    )
    return _extract_cypher(resp.choices[0].message.content or "")


@app.post("/api/bom/ask")
async def bom_ask(body: BomAskBody):
    """Natural-language → read-only Cypher → graph/table. Used by the BOM Explorer NL box."""
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="question is required")
    try:
        cypher = await _bom_nl_to_cypher(question)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Could not translate question: {exc}")
    result = bom_graph.run_cypher(cypher)
    if result is None:
        raise HTTPException(status_code=503, detail="BOM graph unavailable")
    result["question"] = question
    return result


@app.post("/api/sessions/suggest-name")
async def suggest_name(body: SuggestNameBody):
    """
    Suggest a concise cycle name from the goal using the LLM. Falls back to the
    heuristic name (first line) if the model is unavailable.
    """
    fallback = _derive_session_name(body.goal, "")
    try:
        from agents.orchestrator import get_client, get_deployment
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: llm_audit.audited_create(
                get_client(), agent="suggest-name", model=get_deployment(),
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


@app.post("/api/sessions/kickoff")
async def kickoff(body: KickoffBody):
    """
    Conversational kickoff: expand a plain-English brief (e.g. "Plan Q4 with +10%
    growth and Supplier X delayed 4 weeks") into a structured planning goal + a
    name, then launch the cycle. Falls back to using the brief verbatim if the
    LLM is unavailable.
    """
    brief = (body.brief or "").strip()
    if not brief:
        raise HTTPException(status_code=422, detail="Please describe the scenario to plan.")

    goal = brief
    name = _derive_session_name(brief, "")
    try:
        from agents.orchestrator import get_client, get_deployment
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: llm_audit.audited_create(
                get_client(), agent="kickoff", model=get_deployment(),
                messages=[
                    {"role": "system", "content": (
                        "You turn a planner's plain-English brief into a structured S&OP planning goal for "
                        "Shimano APAC manufacturing. Output JSON with keys 'name' (≤6 words) and 'goal' "
                        "(a multi-line goal covering scope, horizon, event/constraints, and targets — keep any "
                        "numbers the user gave). No commentary, JSON only."
                    )},
                    {"role": "user", "content": brief[:1500]},
                ],
                temperature=0.4,
                max_completion_tokens=400,
                response_format={"type": "json_object"},
            ),
        )
        import json as _json
        data = _json.loads(resp.choices[0].message.content or "{}")
        goal = (data.get("goal") or brief).strip()
        name = (data.get("name") or name).strip()[:60]
    except Exception:
        pass  # fall back to verbatim brief

    session_id = str(uuid.uuid4())
    session = SessionState(session_id=session_id, name=name, goal=goal)
    session.entity = (body.entity or "").strip()
    if body.agents:
        session.active_agents = [a for a in body.agents if a]
    sessions[session_id] = session
    session.bg_task = asyncio.create_task(run_orchestrator(session, goal))
    return {"session_id": session_id, "name": name, "goal": goal, "status": "running"}


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
    s = _get_session(session_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    fallback = _heuristic_exec_summary(s)
    try:
        from agents.orchestrator import get_client, get_deployment
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
            lambda: llm_audit.audited_create(
                get_client(), session=s, agent="exec-summary", model=get_deployment(),
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
    "if there's any ambiguity. After acting, briefly state what you did (include the run name).\n\n"
    "You can also answer questions about the BOM (bill of materials) graph, owned by the Master Data "
    "agent. Use bom_search to find a material by code/description; bom_explode to break an assembly into "
    "its multi-level components; bom_where_used to find which assemblies consume a component; bom_quality "
    "for overall structural data-quality (orphans, completeness, type mix). For open-ended structural "
    "questions that those don't cover, use bom_query with a READ-ONLY Cypher query (the system rejects any "
    "write). When you return BOM results, offer the user a link to visualize them at "
    "/bom-explorer?material=<code> so they can see the graph."
)

# Shared schema blurb so the chat tool + NL→Cypher endpoint describe the graph identically.
_BOM_SCHEMA_HINT = (
    "Neo4j BOM graph schema: (:BOM {Material, MaterialDesc, MaterialType})-[:PARENT_OF {Quantity}]->(:BOM). "
    "`Material` is the unique key; PARENT_OF goes parent->child (assembly->component). MaterialType values "
    "include FERT (finished goods), SFUB/SFPB/SFPR (semi-finished), ROH (raw material), plus PROD/SUB/VERP/etc. "
    "Use only the :BOM label. The query MUST be read-only (MATCH/OPTIONAL MATCH/WHERE/WITH/RETURN/ORDER BY/"
    "UNWIND/LIMIT only — never CREATE/MERGE/SET/DELETE/REMOVE/DROP/CALL). Always include a LIMIT (<= 200). "
    "To produce a visualizable graph, RETURN whole paths or nodes+relationships; otherwise RETURN scalar columns."
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
    {
        "type": "function",
        "function": {
            "name": "bom_search",
            "description": "Find BOM materials by code (substring) or description (case-insensitive).",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Code or description text to search."}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bom_explode",
            "description": "Explode an assembly into its multi-level components (with rolled-up quantities).",
            "parameters": {
                "type": "object",
                "properties": {
                    "material": {"type": "string", "description": "Material code of the assembly."},
                    "max_levels": {"type": "integer", "description": "Explosion depth, 1–10 (default 10)."},
                },
                "required": ["material"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bom_where_used",
            "description": "Find every assembly that directly or indirectly consumes a given component.",
            "parameters": {
                "type": "object",
                "properties": {
                    "material": {"type": "string", "description": "Material code of the component."},
                    "max_levels": {"type": "integer", "description": "Upward depth, 1–10 (default 10)."},
                },
                "required": ["material"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bom_quality",
            "description": "Structural data-quality summary of the BOM graph (orphans, completeness, type mix).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bom_query",
            "description": (
                "Run a custom READ-ONLY Cypher query against the BOM graph for open-ended / conditional "
                "questions not covered by the other bom_* tools. The system rejects any non-read query. "
                + _BOM_SCHEMA_HINT
            ),
            "parameters": {
                "type": "object",
                "properties": {"cypher": {"type": "string", "description": "A single read-only Cypher query."}},
                "required": ["cypher"],
            },
        },
    },
]


def _explorer_link(material: str | None) -> str:
    return f"/bom-explorer?material={material}" if material else "/bom-explorer"


def _chat_list_sessions() -> list[dict]:
    # Live + archived (lazy summaries) so the assistant can reference past runs.
    return [{
        "session_id": s["session_id"],
        "name": s["name"],
        "status": s["status"],
        "created_at": s["created_at"],
        "goal": (s.get("goal") or "")[:200],
    } for s in _merged_summaries()]


def _chat_get_session_context(session_id: str) -> dict:
    s = _get_session(session_id)
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
    s = _get_session(session_id)
    if s is None:
        return {"error": f"No session with id '{session_id}'. Use list_sessions to see valid ids."}
    if s.status != "paused" or s.pending_question is None:
        return {"error": f"Session '{s.name}' is not awaiting a decision (status: {s.status})."}
    await s.set_answer(answer)
    return {"session_id": session_id, "name": s.name, "answer": answer, "submitted": True}


def _unavailable_or(result):
    """BOM tools return None when Neo4j is down — surface a clear message to the model."""
    return result if result is not None else {"error": "BOM graph unavailable (Neo4j not reachable)."}


def _chat_bom_dispatch(name: str, args: dict):
    if name == "bom_search":
        return _unavailable_or(bom_graph.search_materials(args.get("query", ""), 20))
    if name == "bom_explode":
        r = bom_graph.explode_bom(args.get("material", ""), args.get("max_levels", 10))
        if r and r.get("found"):
            r["explorer_url"] = _explorer_link(args.get("material"))
        return _unavailable_or(r)
    if name == "bom_where_used":
        r = bom_graph.where_used(args.get("material", ""), args.get("max_levels", 10))
        if r is not None:
            r["explorer_url"] = _explorer_link(args.get("material"))
        return _unavailable_or(r)
    if name == "bom_quality":
        return _unavailable_or(bom_graph.validate_bom())
    if name == "bom_query":
        return _unavailable_or(bom_graph.run_cypher(args.get("cypher", "")))
    return None


async def _chat_dispatch(name: str, args: dict):
    if name == "list_sessions":
        return _chat_list_sessions()
    if name == "get_session_context":
        return _chat_get_session_context(args.get("session_id", ""))
    if name == "start_cycle":
        return _chat_start_cycle(args.get("goal", ""), args.get("name", ""))
    if name == "answer_decision":
        return await _chat_answer_decision(args.get("session_id", ""), args.get("answer", ""))
    if name.startswith("bom_"):
        return _chat_bom_dispatch(name, args)
    return {"error": f"Unknown tool '{name}'"}


def _run_context_note(session) -> str:
    """A system-prompt addendum telling the assistant which run the user is viewing,
    so 'this run' / 'the cycle' resolves without fabricating or asking."""
    return (
        f"The user is currently viewing run '{session.name}' (session_id: {session.session_id}). "
        "Default to THIS run when they ask about 'this run' / 'the cycle' — call get_session_context "
        f"with session_id '{session.session_id}' for its real data."
    )


async def _run_chat(messages: list[dict], session=None) -> str:
    """Run the bounded planner tool-calling loop over `messages`, return the reply."""
    from agents.orchestrator import get_client, get_deployment
    loop = asyncio.get_event_loop()
    for _ in range(5):
        resp = await loop.run_in_executor(
            None,
            lambda msgs=messages: llm_audit.audited_create(
                get_client(), session=session, agent="chat", model=get_deployment(),
                messages=msgs,
                tools=CHAT_TOOLS,
                tool_choice="auto",
                temperature=0.4,
                max_completion_tokens=700,
            ),
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return (msg.content or "").strip()
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
    return "I wasn't able to complete that — could you rephrase or be more specific?"


async def _chunk_stream(text: str):
    """Stream a resolved reply token-ish by token for a live-typing feel.
    (Tool calls are resolved server-side first, then the final answer streams.)"""
    if not text:
        yield ""
        return
    words = text.split(" ")
    for i, w in enumerate(words):
        yield (" " if i > 0 else "") + w
        await asyncio.sleep(0.015)


_STREAM_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@app.post("/api/chat/stream")
async def planner_chat_stream(body: ChatBody):
    """Streaming variant of /api/chat — streams the reply text as it's produced."""
    try:
        from agents.orchestrator import get_client, get_deployment  # noqa: F401
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat unavailable: {exc}")
    system = CHAT_SYSTEM_PROMPT
    hint = _get_session(body.session_id) if body.session_id else None
    if hint is not None:
        system = system + "\n\n" + _run_context_note(hint)
    messages: list[dict] = [{"role": "system", "content": system}]
    for m in body.messages[-20:]:
        if m.role in ("user", "assistant") and m.content:
            messages.append({"role": m.role, "content": m.content})
    try:
        reply = await _run_chat(messages, session=hint)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")
    return StreamingResponse(_chunk_stream(reply), media_type="text/plain", headers=_STREAM_HEADERS)


@app.post("/api/chat")
async def planner_chat(body: ChatBody):
    """Conversational planner assistant with tool access to session data."""
    try:
        from agents.orchestrator import get_client, get_deployment  # noqa: F401
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Chat unavailable: {exc}")

    system = CHAT_SYSTEM_PROMPT
    hint = _get_session(body.session_id) if body.session_id else None
    if hint is not None:
        system = system + "\n\n" + _run_context_note(hint)
    messages: list[dict] = [{"role": "system", "content": system}]
    for m in body.messages[-20:]:  # keep recent history bounded
        if m.role in ("user", "assistant") and m.content:
            messages.append({"role": m.role, "content": m.content})
    try:
        return {"reply": await _run_chat(messages, session=hint)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")


# --- Chat conversation history (SQLite, scoped by client id) ----------------
# No user login yet, so history is scoped to a per-browser UUID the frontend
# sends in X-Client-Id. Conversations never switch on navigation — the user
# explicitly picks one from the history list.
class ConversationCreateBody(BaseModel):
    title: str = ""
    run_hint: str = ""


class ConversationRenameBody(BaseModel):
    title: str = ""


class ConversationMessagesBody(BaseModel):
    messages: list[ChatMessage] = []
    run_hint: str = ""


def _client_id(request: Request) -> str:
    cid = (request.headers.get("X-Client-Id") or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="Missing X-Client-Id header")
    return cid


@app.get("/api/conversations")
async def list_conversations(request: Request):
    return {"conversations": chat_store.list_conversations(_client_id(request))}


@app.post("/api/conversations")
async def create_conversation(request: Request, body: ConversationCreateBody):
    return chat_store.create(_client_id(request), title=body.title, run_hint=body.run_hint)


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str, request: Request):
    conv = chat_store.get(conv_id, _client_id(request))
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.put("/api/conversations/{conv_id}/messages")
async def save_conversation_messages(conv_id: str, request: Request, body: ConversationMessagesBody):
    msgs = [{"role": m.role, "content": m.content}
            for m in body.messages if m.role in ("user", "assistant") and m.content]
    res = chat_store.save_messages(conv_id, _client_id(request), msgs, run_hint=body.run_hint)
    if res is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return res


@app.patch("/api/conversations/{conv_id}")
async def rename_conversation(conv_id: str, request: Request, body: ConversationRenameBody):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Empty title")
    if not chat_store.rename(conv_id, _client_id(request), title):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"id": conv_id, "title": title[:80]}


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str, request: Request):
    if not chat_store.delete(conv_id, _client_id(request)):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Agent runtime config (Agent Settings → live runs)
# ---------------------------------------------------------------------------
@app.get("/api/agents")
async def list_agent_configs():
    from agents import agent_config
    return {"agents": agent_config.list_configs()}


@app.get("/api/agents/{agent_id}")
async def get_agent_config(agent_id: str):
    from agents import agent_config
    cfg = agent_config.get_config(agent_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return cfg


@app.put("/api/agents/{agent_id}")
async def update_agent_config(agent_id: str, body: AgentConfigBody):
    from agents import agent_config
    cfg = agent_config.set_config(
        agent_id,
        system_prompt=body.system_prompt,
        temperature=body.temperature,
        enabled=body.enabled,
    )
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{agent_id}'")
    return cfg


@app.post("/api/agents/{agent_id}/reset")
async def reset_agent_config(agent_id: str):
    from agents import agent_config
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
    from features import feedback_store
    return feedback_store.record(body.model_dump())


@app.get("/api/feedback")
async def get_feedback(session_id: str = ""):
    from features import feedback_store
    return {"feedback": feedback_store.list_feedback(session_id)}


@app.get("/api/feedback/summary")
async def feedback_summary():
    from features import feedback_store
    return feedback_store.summary()


# ---------------------------------------------------------------------------
# Alerts & notifications — derived from live session state + optional webhook
# ---------------------------------------------------------------------------
class WebhookBody(BaseModel):
    webhook_url: str | None = None
    enabled: bool | None = None


@app.get("/api/notifications")
async def get_notifications():
    from features import notifications
    return {"alerts": notifications.compute_alerts(sessions)}


@app.get("/api/notifications/webhook")
async def get_webhook():
    from features import notifications
    cfg = notifications.get_config()
    # don't echo the full URL back for safety; just whether it's set
    return {"enabled": cfg.get("enabled", False), "configured": bool(cfg.get("webhook_url"))}


@app.put("/api/notifications/webhook")
async def set_webhook(body: WebhookBody):
    from features import notifications
    cfg = notifications.set_config(body.webhook_url, body.enabled)
    return {"enabled": cfg.get("enabled", False), "configured": bool(cfg.get("webhook_url"))}


@app.post("/api/notifications/test")
async def test_webhook():
    from features import notifications
    return notifications.dispatch_webhook("✅ Autopilot S&OP test alert — your webhook is connected.")


# ---------------------------------------------------------------------------
# Scheduled / recurring autonomous runs
# ---------------------------------------------------------------------------
def _launch_session(goal: str, name: str, entity: str = "") -> str:
    """Create + start a session (shared by the API and the scheduler)."""
    session_id = str(uuid.uuid4())
    nm = (name or "").strip() or _derive_session_name(goal, session_id)
    session = SessionState(session_id=session_id, name=nm, goal=goal)
    session.entity = entity
    sessions[session_id] = session
    session.bg_task = asyncio.create_task(run_orchestrator(session, goal))
    return session_id


async def _schedule_loop():
    """Background loop: launch any due schedules. Checks every 20s."""
    while True:
        try:
            for sch in scheduler.due():
                name = f"{sch['name']} · {time.strftime('%Y-%m-%d %H:%M')}"
                sid = _launch_session(sch["goal"], name, sch.get("entity", ""))
                scheduler.mark_ran(sch["id"], sid)
                logging.getLogger("scheduler").info("Launched scheduled run %s -> %s", sch["id"], sid)
        except Exception:
            logging.getLogger("scheduler").exception("schedule loop error")
        await asyncio.sleep(20)


@app.on_event("startup")
async def _start_scheduler():
    asyncio.create_task(_schedule_loop())


@app.get("/api/schedules")
async def list_schedules():
    return {"schedules": sorted(scheduler.schedules.values(), key=lambda s: s.get("created_at", 0), reverse=True),
            "cadences": list(scheduler.CADENCE_SECONDS.keys())}


@app.post("/api/schedules")
async def create_schedule(body: ScheduleBody):
    return scheduler.create(body.name, body.goal, body.cadence, body.entity)


@app.put("/api/schedules/{sid}")
async def update_schedule(sid: str, body: ScheduleUpdateBody):
    sch = scheduler.update(sid, enabled=body.enabled)
    if sch is None:
        raise HTTPException(status_code=404, detail=f"No schedule '{sid}'")
    return sch


@app.post("/api/schedules/{sid}/run-now")
async def run_schedule_now(sid: str):
    sch = scheduler.force_due(sid)
    if sch is None:
        raise HTTPException(status_code=404, detail=f"No schedule '{sid}'")
    # launch immediately rather than waiting for the loop tick
    name = f"{sch['name']} · {time.strftime('%Y-%m-%d %H:%M')}"
    session_id = _launch_session(sch["goal"], name, sch.get("entity", ""))
    scheduler.mark_ran(sid, session_id)
    return {"schedule_id": sid, "session_id": session_id, "launched": True}


@app.delete("/api/schedules/{sid}")
async def delete_schedule(sid: str):
    if not scheduler.delete(sid):
        raise HTTPException(status_code=404, detail=f"No schedule '{sid}'")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Admin Hub — fleet-wide LLM usage / cost audit
# ---------------------------------------------------------------------------
@app.get("/api/admin/llm-usage")
async def admin_llm_usage(recent_limit: int = 100):
    """Fleet-wide token/cost totals + per-agent / per-session rollups + a recent
    call audit trail. (No auth yet — admin gating is future work.)"""
    return llm_audit.summary(recent_limit=recent_limit)


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
        "parent_name": _resolve_name(s.parent_id),
        "entity": s.entity,
        "active_agents": s.active_agents,
        "user_paused": s.user_paused,
    }


def _merged_summaries(entity: str = "") -> list[dict]:
    """All sessions newest-first: live (in-memory) + archived (SQLite summaries,
    NOT hydrated). Live overrides archived for the same id. Parent names resolved."""
    merged: dict[str, dict] = {}
    for row in session_store.summaries(entity):
        merged[row["session_id"]] = row
    for s in sessions.values():
        if entity and s.entity != entity:
            continue
        merged[s.session_id] = _session_summary(s)
    items = sorted(merged.values(), key=lambda s: s.get("created_at", 0), reverse=True)
    names = {it["session_id"]: it.get("name", "") for it in items}
    for it in items:
        pid = it.get("parent_id", "")
        it["parent_name"] = names.get(pid) or _resolve_name(pid)
    return items


@app.get("/api/sessions")
async def list_sessions(entity: str = ""):
    """List all sessions, newest first. Optional ?entity= scopes to one entity."""
    return {"sessions": _merged_summaries(entity)}


@app.get("/api/sessions/current")
async def get_current_session():
    """Return the most recently created session, or 404 if none."""
    items = _merged_summaries()
    if not items:
        raise HTTPException(status_code=404, detail="No active sessions")
    return items[0]


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
        from features import uploads as uploads_mod
        rec = uploads_mod.uploads.get(body.data_upload_id)
        if rec:
            goal = f"{body.goal}\n\n--- UPLOADED DATA ---\n{rec['summary']}"

    session = SessionState(session_id=session_id, name=name, goal=goal)
    if body.parent_id and body.parent_id in sessions:
        session.parent_id = body.parent_id
    session.entity = (body.entity or "").strip()
    if body.agents:
        session.active_agents = [a for a in body.agents if a]
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
    session = _get_session(session_id)
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
    session = _get_session(session_id)
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
        "parent_name": _resolve_name(session.parent_id),
        "entity": session.entity,
        "active_agents": session.active_agents,
        "user_paused": session.user_paused,
        "event_count": len(session.events),
    }


@app.post("/api/sessions/{session_id}/answer")
async def submit_answer(session_id: str, body: AnswerBody):
    """
    Submit a human answer for a paused session.
    The orchestrator is awaiting this answer at ask_human().
    """
    session = _get_session(session_id)
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


@app.post("/api/sessions/{session_id}/pause")
async def pause_session(session_id: str):
    """User-pause a running session. The orchestrator parks at its next safe
    checkpoint; the run stays alive and can be resumed anytime (this process)."""
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    if session.status in ("done", "error"):
        raise HTTPException(status_code=400, detail=f"Session is {session.status}; cannot pause.")
    ok = await session.pause_run()
    return {"session_id": session_id, "user_paused": session.user_paused, "changed": ok}


@app.post("/api/sessions/{session_id}/resume")
async def resume_session(session_id: str):
    """Resume a user-paused session from where it parked."""
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    ok = await session.resume_run()
    return {"session_id": session_id, "user_paused": session.user_paused, "changed": ok}


REQUIRED_APPROVAL_ROLES = ["Finance Lead", "Operations Lead", "Demand Planning"]


def _approval_status(session: SessionState) -> dict:
    """Latest sign-off per role + overall plan status."""
    latest: dict[str, dict] = {}
    for a in session.approvals:
        latest[a.get("role", "")] = a
    roles = []
    approved = True
    for role in REQUIRED_APPROVAL_ROLES:
        a = latest.get(role)
        state = a.get("decision") if a else "pending"
        roles.append({
            "role": role, "state": state,
            "approver": a.get("approver", "") if a else "",
            "comment": a.get("comment", "") if a else "",
            "ts": a.get("ts", "") if a else "",
        })
        if state != "approve":
            approved = False
    if any(r["state"] == "reject" for r in roles):
        overall = "rejected"
    elif approved:
        overall = "approved"
    else:
        overall = "pending"
    return {"roles": roles, "overall": overall, "history": session.approvals}


@app.get("/api/sessions/{session_id}/approvals")
async def get_approvals(session_id: str):
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return _approval_status(session)


@app.post("/api/sessions/{session_id}/approvals")
async def add_approval(session_id: str, body: ApprovalBody):
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    session.approvals.append({
        "ts": session.now_ts(),
        "role": body.role,
        "decision": "reject" if body.decision == "reject" else "approve",
        "approver": body.approver,
        "comment": body.comment,
    })
    try:
        save_session(session)
    except Exception:
        pass
    return _approval_status(session)


def _share_snapshot(s: SessionState) -> dict:
    """Read-only report-style snapshot for a shared link."""
    done_msg = {}
    for ev in s.events:
        if ev.get("type") == "step_complete" and ev.get("step_id"):
            done_msg[ev["step_id"]] = ev.get("message", "")
    activity = []
    for st in s.steps.values():
        if st.get("agent") == "planner":
            continue
        activity.append({
            "agent": st.get("agent", ""),
            "label": st.get("label", ""),
            "result": done_msg.get(st.get("step_id", ""), ""),
            "data_source": st.get("data_source", ""),
        })
    return {
        "name": s.name,
        "goal": s.goal,
        "status": s.status,
        "kpis": s.kpis,
        "exec_summary": _heuristic_exec_summary(s),
        "decisions": s.decisions,
        "approvals": getattr(s, "approvals", []),
        "activity": activity,
        "elapsed": round(s.elapsed(), 1),
    }


@app.post("/api/sessions/{session_id}/share")
async def create_share(session_id: str):
    from features import shares
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    token = shares.create_token(session_id)
    return {"token": token, "path": f"/share/{token}"}


@app.get("/api/share/{token}")
async def get_shared(token: str):
    from features import shares
    session_id = shares.resolve(token)
    session = _get_session(session_id) if session_id else None
    if session is None:
        raise HTTPException(status_code=404, detail="This shared link is invalid or has expired.")
    return _share_snapshot(session)


def _usage_payload(s: SessionState) -> dict:
    u = s.usage
    cost = llm_audit.cost_of(u["prompt_tokens"], u["completion_tokens"], u.get("cached_tokens", 0))
    return {
        **u,
        "est_cost_usd": round(cost, 6),
        "price_input_per_m": llm_audit.PRICE_INPUT_PER_M,
        "price_cached_input_per_m": llm_audit.PRICE_CACHED_INPUT_PER_M,
        "price_output_per_m": llm_audit.PRICE_OUTPUT_PER_M,
    }


@app.get("/api/sessions/{session_id}/usage")
async def get_usage(session_id: str):
    session = _get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return _usage_payload(session)


@app.get("/api/sessions/{session_id}/decisions")
async def get_decisions(session_id: str):
    """Audit trail of human decisions for a run (with KPI snapshots)."""
    session = _get_session(session_id)
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
    session = _get_session(session_id)
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
    """Permanently remove a session from memory and the archive (hard delete)."""
    session = sessions.pop(session_id, None)
    _hydrated.pop(session_id, None)
    archived = session_store.exists(session_id)
    if session is None and not archived:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    if session is not None:
        await _stop_session_tasks(session)
    session_store.delete(session_id)   # remove from SQLite archive

    return {"session_id": session_id, "deleted": True}
