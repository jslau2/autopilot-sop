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
- [ ] **Scenario gallery / templates** — one-click starts (Demand surge,
  Supplier disruption, New product launch, Cost-down quarter). Removes the
  blank-canvas problem; shows range instantly.
- [ ] **Conversational kickoff** — extend the actionable chat so a natural-
  language brief ("Plan Q4 with +10% growth and Supplier X delayed 4 weeks")
  configures and launches a cycle.
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
- [ ] **Scheduled / recurring autonomous runs** — "run the weekly S&OP every
  Monday 6am and ping me." The literal autopilot promise; big stickiness.
- [ ] **Alerts & notifications** — toast + optional email/Slack/Teams webhook
  when a run pauses for a decision, a KPI breaches threshold, or a risk goes
  critical. (Extends "Decision notifications" below.)
- [ ] **Interactive what-if sliders** — drag capacity / lead-time / demand% and
  watch KPIs re-estimate live (lightweight estimate, not a full re-run).

### Trust & sellability — what closes the deal
- [ ] **Decision log / audit trail** — every human decision with rationale,
  timestamp, and resulting KPI impact. Governance/compliance + trust.
- [ ] **Explainability + data lineage ("Why?")** — any KPI/recommendation
  traces back to agent reasoning AND the source row (SAP table / supplier feed).
- [ ] **ROI / value dashboard** — quantify each run's worth ("protected $340k
  revenue, saved $34k, +2.3pts OTIF"). Sells to the budget holder.
- [ ] **Approvals workflow** — plan sign-off from finance/ops leads with
  comments; matches how S&OP actually closes.

### Feedback loop
- [x] **In-app feedback widget** — reusable `FeedbackControl` (👍/👎 + optional
  comment) on each agent step (Drawer) and the whole run (Report modal). Live
  mode posts to `/api/feedback` (append-only `feedback_store.py`); demo records
  locally. `GET /api/feedback/summary` rolls up satisfaction %, per-agent
  counts, and recent comments, surfaced live in the Agents Hub → Performance &
  Governance tab.
- [ ] **Shareable run / report links** — read-only share of a completed cycle or
  its report → collaboration + organic virality.

## High-leverage (finish the sessions / concurrency story)

- [x] **Run comparison** — done as the **Scenario comparison dashboard** above
  (`/compare`): side-by-side KPIs, per-cycle key decision, and plan deltas.
- [ ] **Decision notifications** — toast + badge when any *background* cycle
  pauses for a human decision, so the human-in-the-loop checkpoint reaches you
  even when you're on another page or in another run.
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

- [ ] **Token / cost tracking** — show Azure OpenAI token usage and est. cost
  per run (live mode).
- [ ] **Streaming chat** — token-by-token responses in the planner chat for a
  more "live" feel.
- [ ] **Per-session chat threads** — store chat history server-side, tied to a
  run, so each cycle keeps its own reviewable conversation (currently
  browser-local via localStorage).

## Known limitations (by design, document if asked)

- In-flight (running/paused) sessions are in-memory only and cannot resume
  after a backend restart — only terminal (completed/terminated) cycles are
  archived. Resuming a half-run agent pipeline would require checkpointing
  orchestrator execution state.
