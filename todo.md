# Autopilot S&OP — Backlog

Ideas for future work. Roughly ordered by leverage. Tick off as done.

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
  (hover for the breakdown). Persisted. (Fresh, isolated take.)
- [ ] **Streaming chat** — token-by-token responses in the planner chat for a
  more "live" feel.
- [x] **Per-session chat threads** — when viewing a run, the planner chat becomes
  that run's own thread, stored server-side on the session (`chat`, persisted)
  via `GET/POST/DELETE /api/sessions/{id}/chat`. The thread is auto-scoped to the
  run (the assistant defaults to its context). Off a run page it stays the global
  localStorage thread. Chat loop refactored into a shared `_run_chat` helper.

## Known limitations (by design, document if asked)

- In-flight (running/paused) sessions are in-memory only and cannot resume
  after a backend restart — only terminal (completed/terminated) cycles are
  archived. Resuming a half-run agent pipeline would require checkpointing
  orchestrator execution state.
