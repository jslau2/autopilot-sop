# Autopilot S&OP — Backlog

Ideas for future work. Roughly ordered by leverage. Tick off as done.

## High-leverage (finish the sessions / concurrency story)

- [ ] **Run comparison** — pick two cycles, show side-by-side KPIs, the human
  decision each made, and plan deltas. Fulfills the original reason for session
  persistence ("refer back to previous runs for comparing").
- [ ] **Decision notifications** — toast + badge when any *background* cycle
  pauses for a human decision, so the human-in-the-loop checkpoint reaches you
  even when you're on another page or in another run.
- [x] **Executive report export** — a "⤓ Report" button in the pipeline opens a
  preview modal with one-click **Markdown** download and **Print / Save PDF**.
  Built entirely from session state (`src/lib/report.ts`) so it works in demo
  and live: KPIs, key decisions, Financial Sign-off, Risk Register, and an
  agent activity summary.

## Deepen existing pieces

- [ ] **Live Agent Console across sessions & users** (north-star for the
  Console) — make it a real fleet monitor: every agent's activity streaming
  live, aggregated across all active runs and (eventually) users. Approach:
  backend exposes a global activity stream (e.g. `GET /api/activity` SSE that
  multiplexes step_start/step_complete across sessions, tagged by session +
  user), or the Console subscribes to `GET /api/sessions` + each session's
  events. Frontend already has the "Live Agent Activity" shell with aggregate
  counts; swap the scripted sim for real data and add session/user grouping &
  filters. Needs auth/user identity for the multi-user dimension.

- [x] **Actionable chat** — the planner chat now has write tools: `start_cycle`
  (launch a run) and `answer_decision` (submit a decision to a paused run),
  alongside the read tools. Prompt-gated to act only on clear user intent.
- [ ] **What-if scenario branching** — clone an existing run with tweaked
  constraints (e.g. Supplier X lead time, SPL-L3 capacity) to compare outcomes.
  Pairs with Run comparison.
- [x] **Wire Agent Settings to runtime** — Agent Settings now saves per-agent
  system-prompt + temperature overrides to the backend (`agent_config.py`,
  persisted JSON); the orchestrator/workers read the effective values, so edits
  affect new live runs. Includes GET/PUT/reset `/api/agents` endpoints and a
  'Reset to default' action. Demo mode stays illustrative.
- [ ] **Planning Entity scoping** — the sidebar "Planning Entity" section
  (SPL & SBMB Plan / China Region / Regional Consolidated) and its "+ New
  entity" button are currently dummy/static. Make it real: an entity scopes
  sessions and data to a plant grouping/region. Needs backend support — tag
  new cycles with an entity, filter the session list by the selected entity,
  and switch the active entity. Closer to a multi-tenant/scoping concept.

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
