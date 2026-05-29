# Branch: `ux-restructure`

Restructure the frontend so the information architecture matches the planner's
mental model. Goal: the whole app should reduce to **three nouns — Cycles ·
Agents · Data** — with everything else being a *view or action inside* one of
those.

## Why
Today the structure fights the mental model:
- The 4 Home cards treat unequal things as peers (Pipeline = daily workspace;
  Console = a lens into a run; Settings/Manager = rare config/governance).
- "Pipeline View" as a card is redundant now that you enter a run by opening a
  cycle.
- Agent Console is a disconnected twin of Pipeline View (separate page, its own
  scripted data) when it should be a tab *inside* a cycle.
- Navigation is inconsistent (cards vs toolbar vs per-page headers); you often
  go "back Home" just to move around.
- Config is scattered across three levels (Settings card, Manager card, Data
  Sources sidebar/toolbar links).

## Plan / checklist

- [ ] **1. Persistent app shell (top nav)** — one consistent header across the
  browse/config pages: `Logo · Cycles · Agents · Data · [demo/live]`. Removes
  per-page headers and the "back Home to navigate" friction.
- [ ] **2. Home reframe** — Planning Cycles stays primary (done earlier).
  Replace the 4 big cards with a compact secondary nav to **Agents** and **Data
  Sources**; drop the Pipeline View and Agent Console cards.
- [ ] **3. Agent Console as a tab inside a cycle** — add a third lens to the
  pipeline view: `Swimlane · Timeline · Consoles`, driven by the real session
  (per-agent cards from the session's steps), not the old standalone scripted
  page. Retire the standalone `/console` route.
- [ ] **4. Merge Agent Settings + Agent Manager into an "Agents" hub** — one
  page at `/agents` with tabs: **Configure** (prompts/models) and **Performance
  & Governance** (analytics). Old `/settings` and `/manager` redirect here.
- [ ] **5. Breadcrumbs + consistent naming** — e.g. `Cycles › Q3-2026 APAC ›
  Swimlane`, so the user always knows where they are and can climb back.

## Non-goals (this branch)
- Wiring Agent Settings edits to actually affect live runs (kept as todo).
- Run comparison / report export / notifications (separate backlog items).
- Backend changes beyond what the above requires.

## Done =
All builds green, navigation consistent, Console reachable as a cycle tab,
Agents hub live, Home reframed, breadcrumbs in place — then a self-review pass
on the resulting UX.
