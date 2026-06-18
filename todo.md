# Autopilot S&OP — Backlog

Ideas for future work. Roughly ordered by leverage. Tick off as done.

## ★★★ TOP PRIORITY — Phase 1 MVP: Two-stage rough-cut capacity check on real SAP plans

> Product thesis (converged 2026-05-30). The planner's real S&OP loop has two capacity
> checks SAP never does for itself, both gated on capacity that lives only in planners'
> heads (tribal):
>
> **Stage 1 — Assembly-line loading (in-house).** SAP receives the latest FG plan from
> upstream IBP (sales demand). The planner checks it against **assembly-line capacity** and
> produces a feasible **loading plan** (what each line builds, when). The loading plan goes
> back into SAP.
> **Stage 2 — Supplier capacity (procurement).** From the loading plan, SAP MRP generates
> **planned orders** (component PR/PO demand). The planner checks those against **supplier
> capacity** and flags over-allocation.
>
> SAP plans both stages on infinite capacity. The MVP turns each into a *feasible, agreed*
> plan: ingest the SAP files from the local folder, check against the tribal capacity, flag
> the breaches, and drive the human consensus (re-time / reallocate / dual-source) —
> capturing the line- and supplier-capacity truth SAP never holds.
>
> We do NOT rebuild MRP, BOM, forecasting/IBP, or requirements optimization — upstream
> systems already do all of that. Our value is the **two capacity reality checks +
> consensus + the living constraint model.**
>
> Altitude: rough-cut (RCCP) — line-level loading and supplier-level allocation, NOT
> detailed work-center sequencing / finite scheduling (that's APS — see future scope).
>
> Why this beats the old "rebuild the intelligence" plan: the multi-agent pipeline, human
> checkpoint, audit/report/share, and approvals are all built. The MVP just points the
> finished pipeline at REAL computations so its output stops being asserted constants and
> becomes true. Smallest real value → planner adoption → feedback → climb the longer arc
> below.

### 1. Real data layer — ingest SAP snapshots from the local folder ("target, not gate")
- [ ] **Data Resolver** — read the daily files the scheduled job drops into a local folder
  and map each *toward* a canonical schema. The contract is a target the agent maps toward,
  NOT a gate the data must pass: deterministic column hints → LLM semantic inference (on
  names + sample values) → confidence score → confirm with the user ONLY when uncertain →
  remember the mapping so it's never asked twice. Priority chain: user override → latest
  snapshot → mock fallback (keeps demo mode alive).
- [ ] **SAP-format robustness** — TSV/CRLF, trailing-minus negatives (`720-`), misspelled
  headers (`Sales Forcast`), mixed UOM, multi-row-per-material roll-up, and filename-encoded
  metadata (domain/plant/date, e.g. `SSTK2100…`, `2100FGPLAN…`).
- [ ] **Data Steward** — elevate the Master Data agent from BOM-only to universal: it
  profiles the resolved data, reports what it understood vs. what's missing, and coaches the
  user to upload/correct — it never rejects. Parsing is deterministic Python + an
  orchestrator pre-flight; the agent narrates and grades.
- Sources & open dependencies:
  - FG demand plan (IBP output; PCD Plan v001) ✅ sampled — Stage 1 input.
  - Stock snapshot ✅ sampled — starting position.
  - **Needed: FG→assembly-line eligibility** (from `Production Version`? or tribal) — Stage 1.
  - **Needed: MRP planned-order output** (component PR/PO demand per period, with vendor if
    present, else tribal) — Stage 2.

### 2. Tribal capacity model — the proprietary, compounding asset (two resource types)
- [ ] **Assembly-line capacity** — planners define line throughput/availability per period,
  and which lines can build which FG families. Stage-1 input; entirely tribal.
- [ ] **Supplier capacity** — planners define supplier (× component × period) ceilings,
  allocation limits, qualified alternative sources. Stage-2 input; entirely tribal. Start
  with the Pareto-few that actually bind.
- [ ] **Living constraint model** — planner corrections persist and compound every cycle.
  This is the moat SAP doesn't have and the real first job of the learning loop.

### 3. The two-stage check + consensus loop — the value moment
- [ ] **Stage 1 — line loading** — allocate the FG plan to assembly lines within tribal
  capacity; flag overloaded lines/periods; produce the feasible loading plan.
- [ ] **Stage 2 — supplier check** — sum MRP planned-order demand per supplier × period,
  compare to the captured ceiling, flag the breaches. Honest, auditable arithmetic.
- [ ] **Replace the asserted plan with the computed one** — the Planner's hardcoded KPIs and
  scripted decision (constants in `agent_defs.py` + `orchestrator._handle_complete_session`)
  give way to the real results; the capacity + procurement + risk agents narrate real gaps.
- [ ] **Real human checkpoint(s)** — e.g. "Line L3 overloaded +20% in W24–W26 — overtime /
  reallocate / defer?" and "Supplier X over-allocated +40% — confirm / re-time / dual-source?"
  Capture the resolution + any new constraint back into the model; approve + share the plan.

### 4. Deprioritized for MVP — upstream systems already do these (don't rebuild)
- Forecasting / demand sensing — IBP already produces the FG plan; we ingest it.
- BOM explosion / component netting — MRP already produces planned orders + projected balance.
- MILP optimization & detailed finite scheduling — out of MVP (the latter is APS).

---

## ★★ The longer Real-Intelligence arc (post-MVP — pursue with planner feedback)

> Kept from the original plan. The RCCP MVP above reframes it: #1 (data layer) is now
> MVP §1; forecasting (#2) and optimization (#4) are deprioritized because MRP does them;
> negotiation (#5) ≈ the consensus loop; learning (#6) ≈ the supplier-capacity model.
> **Accuracy tracking (#3) and SAP write-back (#7) remain the genuine next frontiers**
> once the MVP earns trust.

### 1. Real data layer — the non-negotiable foundation
- [ ] **SAP S/4HANA read integration** — replace `mock_data.py` tool responses with
  live OData API calls: inventory positions, open POs, production orders, goods
  receipts, sales orders, BOM/routing. Without real data every agent output is
  fiction. Start read-only; write-back comes after trust is established.
- [ ] **Demand signals beyond SAP** — distributor sell-through (POS, not shipments),
  APAC seasonality calendars, channel mix. Shimano bicycle components have strong
  regional seasonal patterns the ERP alone doesn't capture.
- [ ] **Supplier data feed** — live lead times, confirmed vs. requested dates,
  allocation limits from key suppliers. Powers the procurement and risk agents with
  ground truth instead of hardcoded assumptions.

### 2. Real forecasting engine — replace AutoML Forecast agent's mock tools
- [ ] **Statistical baseline** — Prophet or `statsforecast` hierarchical time-series
  for SKU-level demand; bottom-up aggregation across the 847-SKU catalogue.
- [ ] **ML layer** — LightGBM/XGBoost with features: seasonality, promotions, price,
  channel, weather. Materially outperforms statistical baseline on intermittent demand.
- [ ] **Prediction intervals, not point forecasts** — the Risk agent needs probability
  distributions; single-number forecasts hide the uncertainty that drives safety stock.
- [ ] **LLM agent role shift** — agent interprets the model output, flags anomalies,
  adjusts for known events (promos, NPIs) the model doesn't see. Forecast accuracy
  becomes auditable and improvable independently of the LLM.

### 3. Plan accuracy tracking — proves (or disproves) the system is working
- [ ] **Actuals ingestion loop** — pull SAP delivery actuals weekly; compare to the
  plan that was approved for that week. Without this there is no feedback signal.
- [ ] **Forecast accuracy dashboard** — MAPE, bias, WMAPE by SKU and horizon on every
  completed cycle. Planners won't trust a system whose accuracy they can't inspect.
- [ ] **Decision quality tracking** — for each human-approved recommendation, did the
  resulting actuals hit the stated KPI target? Surfaces which agent outputs are
  reliable and which need human scrutiny.
- [ ] **Agent scorecard** — automated per-agent accuracy metrics surfaced in Agents Hub.
  Creates accountability and a prioritised improvement backlog.

### 4. Real optimization engine — replace Plan Optimizer agent's mock tools
- [ ] **LP/MIP solver** — `PuLP` or `OR-Tools` mixed-integer program: maximise OTIF
  subject to capacity by plant/line, safety stock floors, lead-time constraints,
  budget cap. Deterministic, auditable, reproducible — properties an LLM alone can't
  provide for a plan that moves real inventory.
- [ ] **LLM agent as interpreter** — translates business constraints into solver
  parameters, runs the solver tool, explains the output and trade-offs in plain
  language. Optimization is math; communication is LLM.
- [ ] **Sensitivity analysis** — solver re-runs with ±10% demand and capacity to show
  how fragile the plan is. Directly feeds the what-if simulator with real numbers.

### 5. Agent negotiation protocol — the genuine agentic leap beyond a pipeline
- [ ] **Conflict detection** — after the initial parallel pass, Planner identifies
  unresolved conflicts: demand > capacity, cost > budget, OTIF < target.
- [ ] **Structured re-dispatch** — conflicting agents re-run with each other's
  constraints as context and must propose a compromise (partial fulfillment,
  alternative sourcing, deferred delivery), not just re-state their position.
- [ ] **Convergence loop** — iterate until conflicts resolve or a pre-set round limit
  triggers human escalation. This is what makes the system more capable than a
  human S&OP process: it runs this across 847 SKUs simultaneously.

### 6. Memory and learning — compounding returns over time
- [ ] **RAG over past decisions** — when an agent faces a situation (e.g. +30% spike
  on a hero SKU), retrieve how similar past cycles handled it and what the outcome
  was. Wire into agent context via a vector store over the decisions/approvals store.
- [ ] **Wire the feedback store** — 👍/👎 on agent outputs currently writes to a dead
  end. Use approved recommendations as few-shot examples and overridden ones as
  counter-examples in agent prompts. Accuracy compounds with each cycle.
- [ ] **Constraint memory** — if a planner consistently overrides a specific agent's
  estimates (e.g. Line 4 capacity), flag it automatically and surface a prompt to
  correct the underlying assumption.

### 7. SAP write-back — from recommendation to execution (earned after #3 proves trust)
- [ ] **Safety stock parameter updates** — lowest-risk write-back; approved targets
  push directly to SAP MRP parameters. Good first proof of closed-loop execution.
- [ ] **Purchase order creation/update** — approved procurement recommendations raise
  or amend SAP POs automatically. Requires approval workflow gate (already built).
- [ ] **Production order updates** — approved production plan updates SAP planned
  orders. Highest-commitment write-back; only after accuracy tracking (#3) shows
  consistent plan quality.

---

## ★ High-impact bets (practical · sellable · sticky · trial+feedback)

> The set most likely to make planners want to try it, use it daily, and give
> feedback. Suggested first wave: Scenario comparison → Feedback widget →
> Run-on-your-data → Auto exec summary.

### Trial magnets — make them lean in and want to try
- [x] **Run it on YOUR data (CSV upload)** — the sidebar dropzone is now real
  (`DataUpload`): drop/click a CSV/TSV → it's parsed + profiled (auto-detects
  SKU/demand/inventory/date/plant columns, counts unique SKUs, totals, period
  range). Live uploads to `POST /api/uploads` (raw body, no multipart dep, via
  `uploads.py`); demo parses client-side. "▶ Plan on this data" launches a cycle
  seeded with the data summary so the agents plan on the user's numbers
  (`data_upload_id` folded into the goal). Excel → asks for CSV export (todo).
- [x] **Scenario gallery / templates** — five one-click templates (Standard
  cycle, Demand Surge, Supplier Disruption, New Product Launch, Cost-down) in
  `data/templates.ts`. A `TemplateGallery` sits at the top of Home and a compact
  template chip-row appears inside the launch modal — each seeds the goal + name
  so users never face a blank canvas.
- [x] **Conversational kickoff** — a `KickoffBar` (top of Home + the pipeline
  landing) takes a plain-English brief and launches a cycle. Live mode expands
  the brief into a structured goal + name via `POST /api/sessions/kickoff`
  (LLM, JSON; falls back to the brief verbatim); demo seeds the launch modal.
  Example prompts included. (The chat's `start_cycle` tool still works too.)
- [x] **Auto-generated executive summary** — LLM 3-sentence "what happened +
  what I recommend" via `POST /api/sessions/{id}/exec-summary` (with a Python
  heuristic fallback when the model is offline). Shown as a banner at the top of
  a finished run (`ExecSummaryBanner`), at the top of the Report modal, and
  embedded in the exported Markdown/PDF. Demo uses the client-side heuristic.

### Daily-use practicality — why they come back
- [x] **Scenario comparison dashboard** — `/compare` page: pick up to 3 cycles
  (baseline vs what-if), side-by-side KPI table with deltas vs baseline,
  best-per-metric markers, and a composite "★ Recommended" highlight. Works in
  demo (built-in scenarios) and live (`/api/sessions`, entity-scoped). Entry
  points: Home "⇄ Compare" + pipeline toolbar "⇄ Compare" (deep-links the
  current run). Supersedes the simpler "Run comparison" below.
- [x] **Scheduled / recurring autonomous runs** — `/schedules` page + a backend
  scheduler (`scheduler.py`, persisted) with hourly/daily/weekly cadences. A
  startup background loop launches due schedules autonomously (new runs appear in
  the cycles list and fire alerts). CRUD + pause/resume + "▶ Run now" via
  `/api/schedules`. The literal autopilot promise. (Live mode; demo shows a
  notice.)
- [x] **Alerts & notifications** — global `NotificationCenter` (bell + toasts,
  mounted app-wide) polls `GET /api/notifications`, which derives alerts from
  live session state (run paused for a decision, OTIF below target, capacity
  critical). New alerts toast once; the bell shows an unread count; clicking an
  alert opens that run. Optional **Slack/Teams webhook** (`notifications.py`,
  stdlib, best-effort) configurable from the bell, with a "Send test". Closes
  "Decision notifications" below.
- [x] **Interactive what-if sliders** — 🎚 Simulate modal (pipeline toolbar):
  drag demand %, capacity %, and supplier lead-time and watch OTIF / capacity /
  weeks-of-supply / Δ EBIT re-estimate live via a transparent directional model
  (`lib/whatif.ts`, not a full re-run). "Launch as a what-if run" hands the
  adjusted constraints to the branch flow. Works in demo + live.

### Trust & sellability — what closes the deal
- [x] **Decision log / audit trail** — every human decision is recorded with
  its options, chosen answer, an optional **rationale** (new field in the
  decision modal), timestamp/elapsed, and a **KPI snapshot at decision time**.
  Stored on the session (`decisions`, persisted), exposed via
  `GET /api/sessions/{id}/decisions`, and shown in a 🗒 Decisions modal (pipeline
  toolbar). Demo derives the log from answered question steps. Rationale also
  flows into the exported report.
- [x] **Explainability + data lineage ("Why?")** — every KPI cell is clickable
  (ⓘ) and opens an ExplainModal that traces the number to the agents that drove
  it (reasoning), the step results, and the source systems/feeds it came from
  (SAP tables / supplier portal), with a lineage chain `sources → agents → KPI`
  (`lib/lineage.ts`). Works in demo + live (uses live agent traces when present).
- [x] **ROI / value dashboard** — 💰 Value modal (pipeline toolbar) translates a
  run's KPIs into business value: Plan Δ EBIT, revenue protected (OTIF uplift ×
  $/pt), optimisation savings (scanned from agent metrics), OTIF uplift, plus a
  headline **annualised value**. Transparent, assumption-driven model
  (`lib/value.ts`) with the calculation basis spelled out. Works in demo + live.
- [x] **Approvals workflow** — ✓ Approvals modal (pipeline toolbar): plan
  sign-off from Finance / Operations / Demand leads with approver + comment.
  Overall status (pending / approved / rejected) is computed from the latest
  sign-off per role. Persisted on the session (`approvals`) via
  `GET/POST /api/sessions/{id}/approvals`; demo keeps local state.

### Feedback loop
- [x] **In-app feedback widget** — reusable `FeedbackControl` (👍/👎 + optional
  comment) on each agent step (Drawer) and the whole run (Report modal). Live
  mode posts to `/api/feedback` (append-only `feedback_store.py`); demo records
  locally. `GET /api/feedback/summary` rolls up satisfaction %, per-agent
  counts, and recent comments, surfaced live in the Agents Hub → Performance &
  Governance tab.
- [x] **Shareable run / report links** — `POST /api/sessions/{id}/share` mints a
  short token (`shares.py`, persisted, idempotent per run); `GET /api/share/{token}`
  returns a read-only snapshot (KPIs, exec summary, decisions, approvals, agent
  activity). A public `/share/:token` page renders it with no app chrome (chat &
  bell hidden). "🔗 Share link" in the Report modal copies the URL (live mode).

## High-leverage (finish the sessions / concurrency story)

- [x] **Run comparison** — done as the **Scenario comparison dashboard** above
  (`/compare`): side-by-side KPIs, per-cycle key decision, and plan deltas.
- [x] **Decision notifications** — delivered as part of **Alerts &
  notifications** above: a paused background cycle raises a toast + bell badge on
  any page, and clicking it jumps straight to the run.
- [x] **Executive report export** — a "⤓ Report" button in the pipeline opens a
  preview modal with one-click **Markdown** download and **Print / Save PDF**.
  Built entirely from session state (`src/lib/report.ts`) so it works in demo
  and live: KPIs, key decisions, Financial Sign-off, Risk Register, and an
  agent activity summary.

## Deepen existing pieces

- [x] **Live Agent Console across sessions** — the Agent Console now has a real
  live mode (demo keeps the scripted view): `GET /api/activity` aggregates every
  session's steps into per-agent status + the runs each agent is working in;
  the console polls it and shows live agent tiles, aggregate counts, and an
  Active Runs panel (click to open a run). Multi-USER grouping still needs
  auth/user identity — remaining future work.
- [x] **Actionable chat** — the planner chat now has write tools: `start_cycle`
  (launch a run) and `answer_decision` (submit a decision to a paused run),
  alongside the read tools. Prompt-gated to act only on clear user intent.
- [x] **What-if scenario branching** — a ⎇ What-if action (Home cycle rows +
  pipeline toolbar) opens the launch config pre-filled with the source cycle's
  goal so you can tweak constraints and launch a linked branch. Backend stores
  `parent_id`; the pipeline breadcrumb shows '⎇ of <parent>'. Pairs with the
  (future) Run comparison item.
- [x] **Wire Agent Settings to runtime** — Agent Settings now saves per-agent
  system-prompt + temperature overrides to the backend (`agent_config.py`,
  persisted JSON); the orchestrator/workers read the effective values, so edits
  affect new live runs. Includes GET/PUT/reset `/api/agents` endpoints and a
  'Reset to default' action. Demo mode stays illustrative.
- [x] **Planning Entity scoping** — planning entities are now real. A scope
  selector in the top bar (and the functional sidebar list with "+ New entity")
  switches the active entity; new cycles are tagged with it (LaunchConfig
  dropdown); Home and the sidebar cycle list filter by it. Backend: sessions
  carry `entity`, accepted on create, returned in summary/get, `?entity=` list
  filter, persisted.

## Smaller polish / nice-to-haves

- [x] **Token / cost tracking** — sessions accumulate Azure OpenAI token usage
  (`session.add_usage` from every planner/worker completion); `GET
  /api/sessions/{id}/usage` returns prompt/completion/total tokens, call count,
  and an estimated USD cost (prices configurable via `AZURE_PRICE_INPUT/OUTPUT`
  per 1M tokens). A live `UsageChip` in the pipeline toolbar shows `tok · $cost`
  (hover for the breakdown). Persisted.
- [x] **Streaming chat** — `POST /api/chat/stream` streams the reply as a chunked
  text response; PlannerChat reads the stream and grows the assistant bubble
  token-by-token for a live-typing feel. (Tool calls are resolved server-side
  first, then the final answer streams.)
- [x] **Single global planner chat** — one continuous conversation that never
  switches context based on navigation. When viewing a run, that run's id is
  passed as a lightweight hint (`session_id` on `/api/chat[/stream]`) so "this
  run" resolves to real data — without ever swapping the conversation.
  (Per-session server-side chat threads were tried and removed: switching the
  thread on navigation was confusing UX.) Chat loop lives in the shared
  `_run_chat` helper.
- [x] **Chat conversation history** — `backend/chat_store.py` (SQLite,
  `chat.db`) keeps past conversations browsable from a history drawer in
  PlannerChat: new chat, resume-on-refresh, rename, delete, auto-title (from the
  first user message). Scoped by `owner` = a per-browser UUID (`X-Client-Id`
  header / `sop-client-id`) since there's no login yet — history isn't shared
  across devices/users and migrates to user email when auth lands. CRUD at
  `/api/conversations[...]`; threads persisted via `PUT .../messages`. The old
  single-thread `sop-chat-history` is migrated once on first open. **Markdown**
  in chat bubbles also rendered (dependency-free).

## Future scope — beyond S&OP (heavier, different products)

- [ ] **APS / finite-capacity scheduling** — detailed, resource-level finite scheduling
  (sequencing, setup/changeover, lot-sizing) for in-house work-centers — the layer the MVP
  deliberately excludes. A genuinely different and much heavier product than rough-cut
  S&OP; pursue only after the supplier-capacity RCCP MVP is sticky.
- [ ] **S&OE — Sales & Operations Execution** — the short-horizon, weekly/daily execution
  layer below S&OP: react to today's actuals, expedites, and disruptions and re-balance
  the near-term plan. Natural extension once the monthly S&OP loop is trusted; pairs with
  the in-house finite scheduling above.

## Known limitations (by design, document if asked)

- In-flight (running/paused) sessions are in-memory only and cannot resume
  after a backend restart — only terminal (completed/terminated) cycles are
  archived. Resuming a half-run agent pipeline would require checkpointing
  orchestrator execution state.
