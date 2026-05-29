# Autopilot S&OP — Backlog

Ideas for future work. Roughly ordered by leverage. Tick off as done.

## High-leverage (finish the sessions / concurrency story)

- [ ] **Run comparison** — pick two cycles, show side-by-side KPIs, the human
  decision each made, and plan deltas. Fulfills the original reason for session
  persistence ("refer back to previous runs for comparing").
- [ ] **Decision notifications** — toast + badge when any *background* cycle
  pauses for a human decision, so the human-in-the-loop checkpoint reaches you
  even when you're on another page or in another run.
- [ ] **Executive report export** — one-click PDF/Markdown summary of a
  completed cycle (KPIs + Finance sign-off + Risk register) for exec review.

## Deepen existing pieces

- [ ] **Actionable chat** — give the planner chat write tools (start a cycle,
  answer a pending decision) so it can act, not just advise. Currently
  read-only (`list_sessions`, `get_session_context`).
- [ ] **What-if scenario branching** — clone an existing run with tweaked
  constraints (e.g. Supplier X lead time, SPL-L3 capacity) to compare outcomes.
  Pairs with Run comparison.
- [ ] **Wire Agent Settings to runtime** — make the prompt/model edits on the
  Agent Settings page actually affect live runs (turn the mockup into a real
  control panel).

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
