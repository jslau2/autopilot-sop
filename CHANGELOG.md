# Changelog

All notable changes to **Autopilot S&OP** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/);
this project uses [Semantic Versioning](https://semver.org/).

## [2.0.0] — 2026-05-30

A major release turning the core multi-agent demo into a far more practical,
sellable, and sticky product — plus the first scaling/admin foundations.

### Added — trial magnets
- **Run it on YOUR data** — the sidebar dropzone parses & profiles an uploaded
  CSV/TSV (auto-detects SKU/demand/inventory/date/plant, totals, period) and the
  agents plan on the user's real numbers. Live via `POST /api/uploads` (raw body,
  no multipart dep); demo parses client-side.
- **Scenario gallery / templates** — five one-click starts (Standard cycle,
  Demand Surge, Supplier Disruption, New Product Launch, Cost-down) on Home and
  in the launch modal.
- **Conversational kickoff** — describe a scenario in plain English and launch a
  cycle; the brief is expanded into a structured goal (`POST /api/sessions/kickoff`).
- **Auto-generated executive summary** — a 3-sentence "what happened + what I
  recommend" on every finished run, the Report modal, and the exported report
  (`POST /api/sessions/{id}/exec-summary`, with offline heuristic fallback).

### Added — decide, compare, prove value
- **Scenario comparison dashboard** (`/compare`) — up to 3 cycles side-by-side:
  KPI deltas, best-per-metric, a recommended plan, and each run's key decision.
- **Interactive what-if simulator** — drag demand / capacity / lead-time and
  watch KPIs re-estimate live; launch the tweak as a linked what-if run.
- **ROI / value dashboard** — EBIT, revenue protected, savings, OTIF uplift, and
  an annualised value per run, with the calculation basis surfaced.
- **Explainability + data lineage ("Why?")** — click any KPI to trace it to the
  agents, their reasoning, and the source systems/feeds.
- **Decision log / audit trail** — every human decision with rationale,
  timestamp, and a KPI snapshot (`/api/sessions/{id}/decisions`).
- **Approvals workflow** — Finance / Operations / Demand sign-off with status
  (pending / approved / rejected) (`/api/sessions/{id}/approvals`).

### Added — autopilot, alerts & feedback
- **Scheduled / recurring autonomous runs** (`/schedules`) — hourly/daily/weekly
  cadences launched by a background loop; the literal autopilot promise.
- **Alerts & notifications** — app-wide bell + toasts for runs paused on a
  decision or KPI breaches, with an optional Slack/Teams webhook.
- **In-app feedback widget** — 👍/👎 + comment on any agent output or whole run,
  rolled up into the Agents Hub governance view.

### Added — chat & sharing
- **Per-session chat threads** — the planner chat scopes to the run you're
  viewing, stored server-side per run.
- **Streaming chat** — replies stream token-by-token.
- **Shareable run / report links** — a public, read-only `/share/:token` snapshot.

### Added — admin & operations
- **Admin Hub** (`/admin`) — fleet-wide LLM token usage & cost overview with a
  full audit trail of every API call (per-agent / per-run breakdowns).
- **Token / cost tracking** — live token usage + estimated cost per run, shown in
  the pipeline toolbar.
- **Stop a running cycle** — halt a run (kept + archived, not deleted) from the
  pipeline toolbar, Home rows, and the session switcher.

### Changed — scalability
- **LLM audit log → SQLite** with lifetime counters that survive pruning and a
  configurable retention window (replaces an O(n²) full-file-rewrite JSON store).
- **Session archive → SQLite with lazy hydration** — archived runs are no longer
  bulk-loaded into memory at startup; lists read summary columns and a run is
  hydrated only when opened (bounded memory, O(1) startup). One-time migration
  folds legacy `sessions/*.json` into the DB.

### Notes
- Demo mode remains fully functional with no backend; live features degrade
  gracefully (heuristic fallbacks / "live mode only" notices) without Azure.
- Config stores (`agent_overrides`, `notify_config`, `schedules`) intentionally
  remain JSON.

## [1.0.0] — baseline

- Autonomous multi-agent S&OP: a Planner orchestrating 11 specialist agents in
  parallel phases, with a human-in-the-loop decision checkpoint.
- Demo (scripted, no backend) and Live (Azure OpenAI via FastAPI SSE) modes.
- Planning cycles: create / switch / terminate / delete, concurrent runs,
  what-if scenario branching, planning-entity scoping, persistence of finished
  runs.
- Swimlane & timeline views, live KPI bar, step drawer, event stream, Focus mode.
- Agent Console (live cross-session activity), Agents Hub (configure prompts +
  performance & governance), Data Sources with preview.
- Global Planner chat assistant; executive report export (Markdown / PDF).
