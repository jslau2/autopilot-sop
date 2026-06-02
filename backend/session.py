from __future__ import annotations

import asyncio
import time
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionState:
    session_id: str
    name: str = ""
    goal: str = ""
    status: str = "running"   # running | paused | done | error
    elapsed_start: float = field(default_factory=time.time)
    steps: dict = field(default_factory=dict)
    events: list = field(default_factory=list)
    kpis: dict = field(default_factory=lambda: {
        "otif": None,
        "forecastAcc": None,
        "capacityUtil": None,
        "wos": None,
        "planDelta": None,
    })
    pending_question: dict | None = None
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    human_answer_event: asyncio.Event = field(default_factory=asyncio.Event)
    answer_text: str | None = None
    agent_tasks: dict = field(default_factory=dict)   # task_id → asyncio.Task
    agent_results: dict = field(default_factory=dict) # task_id → result dict
    traces: dict = field(default_factory=dict)        # task_id → message trace list
    created_at: float = field(default_factory=time.time)
    elapsed_final: float | None = None   # set when terminal; freezes elapsed()
    current_planner_step: str = ""        # latest planner step — deps source for dispatched agents
    decisions: list = field(default_factory=list)  # audit trail of human decisions
    approvals: list = field(default_factory=list)   # plan sign-offs (approvals workflow)
    usage: dict = field(default_factory=lambda: {
        "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cached_tokens": 0, "calls": 0,
    })
    parent_id: str = ""                   # set when this run is a what-if branch of another
    entity: str = ""                      # planning entity (plant grouping / region) this run is scoped to
    active_agents: list = field(default_factory=list)  # specialist agents in scope for this run (resolved at orchestration start)
    user_paused: bool = False             # user pressed Pause — orchestrator parks at the next safe checkpoint
    resume_event: asyncio.Event = field(default_factory=asyncio.Event)  # set = running, cleared = paused
    bg_task: Any = None

    def __post_init__(self) -> None:
        # Runs start un-paused (the orchestrator only blocks when this is cleared).
        self.resume_event.set()

    def now_ts(self) -> str:
        """Returns current time as HH:MM:SS.mmm"""
        t = time.localtime()
        ms = int((time.time() % 1) * 1000)
        return f"{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d}.{ms:03d}"

    def add_usage(self, usage: Any) -> None:
        """Accumulate Azure OpenAI token usage from a completion response."""
        if usage is None:
            return
        try:
            self.usage["prompt_tokens"] += int(getattr(usage, "prompt_tokens", 0) or 0)
            self.usage["completion_tokens"] += int(getattr(usage, "completion_tokens", 0) or 0)
            self.usage["total_tokens"] += int(getattr(usage, "total_tokens", 0) or 0)
            details = getattr(usage, "prompt_tokens_details", None)
            self.usage["cached_tokens"] += int(getattr(details, "cached_tokens", 0) or 0)
            self.usage["calls"] += 1
        except Exception:
            pass

    def elapsed(self) -> float:
        """Seconds elapsed since session start (frozen once the session ends)."""
        if self.elapsed_final is not None:
            return self.elapsed_final
        return time.time() - self.elapsed_start

    async def emit(self, event: dict) -> None:
        """Appends to self.events and puts on queue. Always adds 'ts' field."""
        event["ts"] = self.now_ts()
        self.events.append(event)
        await self.event_queue.put(event)

    async def emit_log(self, agent: str, message: str, step_id: str | None = None) -> None:
        """Emit a log event."""
        evt: dict = {
            "type": "log",
            "agent": agent,
            "message": message,
        }
        if step_id is not None:
            evt["step_id"] = step_id
        await self.emit(evt)

    async def emit_step_start(
        self,
        agent: str,
        step_id: str,
        label: str,
        deps: list | None = None,
        data_source: str = "",
    ) -> None:
        """Emit step_start and create step entry in self.steps."""
        self.steps[step_id] = {
            "step_id": step_id,
            "agent": agent,
            "label": label,
            "status": "running",
            "deps": deps or [],
            "data_source": data_source,
            "started_at": self.now_ts(),
        }
        await self.emit({
            "type": "step_start",
            "agent": agent,
            "step_id": step_id,
            "label": label,
            "deps": deps or [],
            "data_source": data_source,
        })

    async def emit_step_complete(
        self,
        agent: str,
        step_id: str,
        message: str,
        output: dict | None = None,
        metrics: dict | None = None,
        records: int = 0,
    ) -> None:
        """Emit step_complete and update step status to done."""
        if step_id in self.steps:
            self.steps[step_id]["status"] = "done"
            self.steps[step_id]["completed_at"] = self.now_ts()
            self.steps[step_id]["message"] = message
        await self.emit({
            "type": "step_complete",
            "agent": agent,
            "step_id": step_id,
            "message": message,
            "output": output or {},
            "metrics": metrics or {},
            "records": records,
        })

    async def emit_kpi(self, key: str, value: Any) -> None:
        """Emit kpi_update and update self.kpis."""
        if key in self.kpis:
            self.kpis[key] = value
        await self.emit({
            "type": "kpi_update",
            "key": key,
            "value": value,
        })

    async def emit_question(
        self,
        step_id: str,
        agent: str,
        label: str,
        text: str,
        options: list[str],
    ) -> None:
        """Emit question event, set pending_question, and pause session."""
        self.pending_question = {
            "step_id": step_id,
            "agent": agent,
            "label": label,
            "text": text,
            "options": options,
        }
        self.status = "paused"
        await self.emit({
            "type": "question",
            "step_id": step_id,
            "agent": agent,
            "label": label,
            "text": text,
            "options": options,
        })

    async def wait_for_answer(self) -> str:
        """Wait for human answer, clear event, return answer text."""
        await self.human_answer_event.wait()
        self.human_answer_event.clear()
        return self.answer_text or ""

    async def set_answer(self, answer: str, rationale: str = "") -> None:
        """Store answer, record it in the decision log, resume session."""
        # Record the decision (audit trail) with a KPI snapshot at decision time.
        q = self.pending_question or {}
        self.decisions.append({
            "ts": self.now_ts(),
            "elapsed": round(self.elapsed(), 1),
            "step_id": q.get("step_id", ""),
            "question": q.get("text", ""),
            "options": q.get("options", []),
            "answer": answer,
            "rationale": rationale,
            "kpis_at_decision": dict(self.kpis),
        })
        self.answer_text = answer
        self.pending_question = None
        self.status = "running"
        self.human_answer_event.set()
        await self.emit({
            "type": "answer",
            "agent": "human",
            "message": f"Human answered: {answer}" + (f" — {rationale}" if rationale else ""),
        })

    async def pause_run(self) -> bool:
        """User-pause: orchestrator parks at its next safe checkpoint. The run
        stays alive (resumable) — this is NOT a terminate."""
        if self.status in ("done", "error") or self.user_paused:
            return False
        self.user_paused = True
        self.resume_event.clear()
        await self.emit({"type": "run_paused", "agent": "user"})
        await self.emit_log("planner", "⏸ Run paused by user — will park at the next safe checkpoint")
        return True

    async def resume_run(self) -> bool:
        """Resume a user-paused run from where it parked."""
        if not self.user_paused:
            return False
        self.user_paused = False
        self.resume_event.set()
        await self.emit({"type": "run_resumed", "agent": "user"})
        await self.emit_log("planner", "▶ Run resumed by user")
        return True

    async def wait_if_paused(self) -> None:
        """Orchestrator checkpoint: blocks here while the run is user-paused."""
        if not self.resume_event.is_set():
            await self.resume_event.wait()

    async def done(self, summary: str = "") -> None:
        """Mark session complete, emit session_complete, and persist to disk."""
        self.status = "done"
        self.elapsed_final = time.time() - self.elapsed_start
        await self.emit({
            "type": "session_complete",
            "summary": summary,
            "elapsed": self.elapsed(),
            "kpis": self.kpis,
        })
        # Archive terminal session so it survives a backend restart.
        try:
            from persistence import save_session
            save_session(self)
        except Exception:
            pass


# Global session registry
sessions: dict[str, SessionState] = {}
