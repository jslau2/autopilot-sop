# Design Doc — Integrating the Deterministic Engines

**Status:** Implemented · **Date:** 2026-06-22 · **Owner:** S&OP platform

> **Implementation note (shipped):** Phases 0–3 are built and verified end to
> end against live engines. In `autopilot-sop` the `backend/engines/` package
> (`forecast_client`, `planning_client`, `grain_map`, `handoff`) wires the
> booking-curve and optimizer engines into the `demand` and `optimizer` agents
> through `workers.TOOL_DISPATCH`, with `or mock_data` fallback; tool dispatch is
> now offloaded to a thread so a slow solve never blocks the event loop. The
> booking-curve repo gained `predict.py` + `serve.py`; the optimizer repo now
> boots as a lean sidecar (lazy LLM/DB imports). Verified: demand history,
> forecast and demand-plan tools return live data; the forecast hands off to the
> optimizer, which solves against it when a master-data crosswalk exists and
> degrades safely to its own demand otherwise. The remaining open item is the
> production `sales_model_code -> Material` crosswalk (§8/§10).

How the two standalone engines —
[`fg-planning-optimizer`](https://github.com/jslau2/fg-planning-optimizer) (MIP/LP
production scheduler) and
[`incoming-sales-booking-curve`](https://github.com/jslau2/incoming-sales-booking-curve)
(demand booking-curve forecaster) — plug into the Autopilot S&OP multi-agent
orchestration as the real "deterministic engines" behind two specialist agents.

This doc is the integration plan. No orchestration code changes have been made yet;
see [Rollout](#rollout) for the staged build.

---

## 1. Motivation

The architecture canvas already drew this: each specialist agent is an LLM that
*reasons and explains* while a **deterministic engine** (ML / LP / rules) does the
actual maths. Today those engines are stubs — static dicts in `backend/mock_data.py`
and inline lambdas in `backend/workers.py`. We have now built two of the real engines
as standalone repos. Integration means swapping the mock for the real engine **behind
the same tool name**, so the orchestration, UI, and demo mode are unaffected.

This realises backlog items `todo.md` §2 (real forecasting engine) and the
optimization line of §1/§4.

## 2. The mapping (engine → agent → tools)

The canvas slots map 1:1 onto existing agents and tools — nothing new to invent.

| Canvas layer | Agent (`agent_defs.py`) | Engine repo | Tools the engine backs |
|---|---|---|---|
| T1 Demand-Sensing → **Forecast Model** | `demand` — Demand Planning, phase 1 (`agent_defs.py:199-266`) | **incoming-sales-booking-curve** | `run_forecast_models`, `generate_demand_plan`, `get_demand_history` |
| T3 Schedule-Optimizer → **MIP/LP Solver** | `optimizer` — Supply Chain Optimizer, phase 4 (`agent_defs.py:571-640`) | **fg-planning-optimizer** | `run_milp_optimization`, `compute_pareto_frontier`, `select_operating_point` |
| (feeds) Capacity check | `capacity` — phase 2 (`agent_defs.py:448-510`) | **fg-planning-optimizer** (utilization view) | `run_capacity_plan`, `identify_bottlenecks` |

The LLM agent's role does **not** change: it still narrates the brief, flags
anomalies, and adjusts for events the model can't see. The engine just replaces the
fabricated numbers with computed ones — making accuracy auditable independently of the
LLM (`todo.md` §2, "LLM agent role shift").

## 3. The integration seam

There is one clean seam, and we have already used it.

- `backend/workers.py:43` — `TOOL_DISPATCH`, a `tool_name → fn(args: dict) -> dict`
  registry. Every specialist tool call funnels through `_execute_tool`
  (`workers.py:231`).
- **Precedent:** the `masterdata` agent already calls a real engine (Neo4j) with a
  mock fallback:

  ```python
  "validate_bom": lambda args: bom_graph.validate_bom() or mock_data.get_bom_data(),
  ```

  `backend/bom_graph.py` reads its connection from `.env` and **returns `None` when the
  engine is unreachable**, so `or mock_data(...)` keeps the demo alive. This is the
  exact template for both new engines.

Tool functions take a single `args: dict` and return a `dict`; non-dict returns are
wrapped, exceptions are caught and surfaced as `{"error": ...}` (`workers.py:231-239`).
The returned dict's keys flow into the UI (`_extract_metrics` / `_build_summary`,
`workers.py:429-501`) — so adapters must emit the keys the UI already reads
(`mape`, `total_units`, `otif`, `revenue_usd`, `capacity_utilization`, …).

## 4. Recommended architecture — engines as HTTP sidecars

Run each engine as its own service; agent tools call them over HTTP. **Recommended over
in-process import.**

```
┌─────────────────────────── autopilot-sop backend ───────────────────────────┐
│  orchestrator → workers.TOOL_DISPATCH                                        │
│        │                                                                     │
│        ├── "run_forecast_models"  → engines/forecast_client.py ─┐            │
│        ├── "generate_demand_plan" → engines/forecast_client.py ─┤  HTTP      │
│        ├── "run_milp_optimization"→ engines/planning_client.py ─┤  (.env     │
│        └── "run_capacity_plan"    → engines/planning_client.py ─┘   base URLs)│
│                  each: real call  OR  None → `or mock_data.<fn>(...)`         │
└──────────────────────────────────────────────────────────────────────────────┘
        │ http                                   │ http
        ▼                                        ▼
┌────────────────────────┐          ┌─────────────────────────────────────┐
│ booking-curve service  │          │ fg-planning-optimizer FastAPI       │
│ (thin FastAPI, NEW)    │          │ (EXISTS: POST /api/runs, /status,   │
│ /forecast → XGBoost    │          │  SSE /events, /kpis, /tables/{slug})│
└────────────────────────┘          └─────────────────────────────────────┘
```

Why HTTP and not in-process import:

- **fg-planning-optimizer already ships a FastAPI** with async jobs, SSE progress,
  `/kpis`, `/tables/{slug}`, and Azure-powered `/explain`. Reusing it is near-zero
  work and its SSE maps onto the swimlane.
- Keeps heavy / conflicting deps (HiGHS+PuLP, xgboost, pyodbc) **out of** the
  orchestration backend.
- Matches the canvas mental model — agents *wrap* independent engines.
- The `bom_graph.py` fallback pattern carries over unchanged; HTTP is just a different
  transport with the same None-on-failure contract.

New code in autopilot-sop:

- `backend/engines/planning_client.py` — wraps fg-planning-optimizer: `POST /api/runs`
  → poll `/status` until `done` → read `/kpis` + `/tables/{slug}`. Returns `None` on
  unconfigured/unreachable. Base URL from `.env` (`FG_OPTIMIZER_URL`).
- `backend/engines/forecast_client.py` — wraps the booking-curve service `/forecast`.
  Base URL from `.env` (`BOOKING_CURVE_URL`). Returns `None` on failure.
- Output translation in each adapter → UI keys (see §6).
- `.env.example` entries for both URLs (creds/URLs stay gitignored, per CLAUDE.md).

## 5. Per-engine readiness

### fg-planning-optimizer — ready to call
- CLSP-with-setup-times MILP, **PuLP + HiGHS** (both MIT; no commercial solver, no
  network needed to solve). Entry: `src/optimizer.py:347` `solve_line(...)`; HTTP
  runner `backend/app/services/runner.py:63` `run_job`.
- API: `POST /api/runs` (body defaults to bundled sample data — minimal call is `{}`),
  `GET /api/runs/{id}/status`, SSE `/events`, `GET /api/runs/{id}/kpis`
  (`total_demand, total_produced, total_shortage, avg_utilization, peak_utilization,
  total_setups`), `/tables/{consolidated|production|inventory|capacity|setup|shortage}`.
- **Work:** stand up `uvicorn backend.app.main:app`; write `planning_client.py`. Done.

### incoming-sales-booking-curve — needs an inference layer (it has none today)
- XGBoost regression on `booking_ratio`; converts to units via `backtransform`; the
  demand signal is `already_booked + predicted_remaining` (projected final demand) per
  grain. Metric: WMAPE on `remaining`.
- Ships **no predict function, no saved artifacts, no API** — only `prepare.py`
  (data) and `train.py` (trains + scores, no `__main__` guard, not import-safe).
- **Work (NEW):**
  1. one-time `python prepare.py` then `python train.py` → produces
     `models/xgb_booking_ratio.json` + `models/ordinal_encoder.pkl`;
  2. a small `predict.py` wrapper: load artifacts → encode `CAT_COLS` →
     predict ratio → `backtransform` → `predicted_remaining`;
  3. a thin FastAPI (`/forecast`) mirroring the optimizer's response shape.

## 6. Output-key translation

Adapters must map engine output → the keys the UI reads (`workers.py:429-501`). Sketch:

| Tool | Engine output | UI key emitted |
|---|---|---|
| `run_forecast_models` | per-grain `predicted_remaining`, validation WMAPE | `winning_mape` = `100*(wmape)`, `total_forecast_units`, `spike_skus` |
| `generate_demand_plan` | `already_booked + predicted_remaining` aggregated | `total_units`, `by_week`, `confidence_interval_90` |
| `run_milp_optimization` | `/kpis` + `/tables/consolidated` | `status`, `otif` (from shortage), `avg`→`capacity_utilization`, `binding_constraints` |
| `run_capacity_plan` | `/tables/capacity` | `capacity_utilization`, bottleneck lines |

## 7. One structural change required

`TOOL_DISPATCH` is **synchronous**, but a MILP solve is a long, blocking job. Calling
it directly inside the lambda would stall the event loop. Fix is small and local:
make the dispatch path **await-aware** so engine calls offload via
`run_in_executor` / async `httpx` — exactly how the Azure SDK call is already wrapped
(`workers.py:298`). This is the only change to existing orchestration control flow;
everything else is additive.

## 8. The bigger prize — chain the two engines

Beyond filling slots independently, the high-value move is closing the loop the canvas
describes ("T1's demand brief becomes T2's typed input"): the `demand` agent's
**projected final demand** (booking-curve output) becomes the **demand vector** the
optimizer's MILP consumes. The planner already passes typed context between phases, so
phase-1 forecast → phase-4 optimization becomes a live data handoff.

The one piece of genuine glue: a **grain mapping** between
booking-curve's `sales_model_code / part_code / request_month` and the optimizer's
`Material + Plan_Date (PCD_Plan)` + capacity join. Dates already align — `today`
2026-06-22, booking-curve predicts 202606–202608, optimizer's horizon starts now — so a
coherent end-to-end live demo is achievable.

## 9. Rollout

1. **Optimizer live (lowest risk).** Run fg-planning-optimizer's FastAPI; add
   `planning_client.py` + `.env` (`FG_OPTIMIZER_URL`); rewire `run_milp_optimization`
   with mock fallback; make dispatch await-aware (§7).
2. **Forecast live.** Build booking-curve's inference wrapper + thin API; add
   `forecast_client.py` + `.env` (`BOOKING_CURVE_URL`); rewire the `demand` tools.
3. **Chain them.** Build the grain mapping; pass forecast output as typed context into
   the optimizer's demand input (§8).

Each step is independently shippable and demo-safe (mock fallback preserves demo mode).

## 10. Risks / open questions

- **Solve latency vs. SSE.** Long solves need progress on the swimlane; the optimizer's
  `/events` SSE can drive it, but wiring SSE-through-agent is more than a tool return.
  Step 1 can start with blocking-poll + a spinner, upgrade later.
- **Data alignment.** Both engines run on Shimano data with `today=2026-06-22`; confirm
  the SKU/Material catalogues reconcile for the §8 chain.
- **Deploy topology.** Three services instead of one — needs a compose/process manager
  for local + a deployment story. Acceptable for the dep-isolation benefit.
- **booking-curve artifacts.** Model files are gitignored and built on demand; the
  service needs a build/warm step before first `/forecast`.
