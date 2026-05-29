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
    usage: dict = field(default_factory=lambda: {
        "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
        "calls": 0, "cost_usd": 0.0,
    })
    usage_by_agent: dict = field(default_factory=dict)
    bg_task: Any = None

    def now_ts(self) -> str:
        """Returns current time as HH:MM:SS.mmm"""
        t = time.localtime()
        ms = int((time.time() % 1) * 1000)
        return f"{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d}.{ms:03d}"

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

    async def set_answer(self, answer: str) -> None:
        """Store answer, signal event, clear pending question, resume session."""
        self.answer_text = answer
        self.pending_question = None
        self.status = "running"
        self.human_answer_event.set()
        await self.emit({
            "type": "answer",
            "agent": "human",
            "message": f"Human answered: {answer}",
        })

    async def add_usage(self, agent: str, model: str, usage: Any) -> None:
        """Accumulate token usage from an LLM response and emit a usage_update."""
        if usage is None:
            return
        from pricing import estimate_cost
        pt = int(getattr(usage, "prompt_tokens", 0) or 0)
        ct = int(getattr(usage, "completion_tokens", 0) or 0)
        tt = int(getattr(usage, "total_tokens", 0) or (pt + ct))
        cost = estimate_cost(model, pt, ct)

        self.usage["prompt_tokens"] += pt
        self.usage["completion_tokens"] += ct
        self.usage["total_tokens"] += tt
        self.usage["calls"] += 1
        self.usage["cost_usd"] = round(self.usage["cost_usd"] + cost, 6)

        a = self.usage_by_agent.setdefault(agent, {
            "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0, "cost_usd": 0.0,
        })
        a["prompt_tokens"] += pt
        a["completion_tokens"] += ct
        a["total_tokens"] += tt
        a["calls"] += 1
        a["cost_usd"] = round(a["cost_usd"] + cost, 6)

        await self.emit({
            "type": "usage_update",
            "agent": agent,
            "model": model,
            "prompt_tokens": self.usage["prompt_tokens"],
            "completion_tokens": self.usage["completion_tokens"],
            "total_tokens": self.usage["total_tokens"],
            "calls": self.usage["calls"],
            "cost_usd": self.usage["cost_usd"],
        })

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
