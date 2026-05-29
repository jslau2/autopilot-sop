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

- [x] **1. Persistent app shell (top nav)** — one consistent header across the
  browse/config pages: `Logo · Cycles · Agent Console · Agents · Data ·
  [demo/live]`. Removes per-page headers and the "back Home to navigate"
  friction. (Pipeline keeps its own workspace toolbar; Agent Console keeps its
  own header pending its rework.)
- [x] **2. Home reframe** — Planning Cycles primary; brand de-duplicated into
  the shell; the 4 big cards become 3 compact cards (**Agent Console**,
  **Agents**, **Data Sources**). Pipeline View dropped as a card (reached by
  opening a cycle).
- [x] **3. Keep Agent Console as a first-class destination** — (revised) NOT
  merged or retired. It stays a standalone top-level page and gains a slot in
  the app-shell nav. Future ambition: a live, cross-user view of every agent
  actively working (a fleet/ops monitor as the app gains many users). Its
  nav links updated to the new structure.
- [x] **4. Merge Agent Settings + Agent Manager into an "Agents" hub** — one
  page at `/agents` with tabs: **Configure** (prompts/models) and **Performance
  & Governance** (analytics). Old `/settings` and `/manager` redirect here.
- [x] **5. Breadcrumbs + consistent naming** — pipeline shows `Cycles › <cycle
  name> › <view>`, so the user always knows where they are and can climb back.

## Post-review refinements (done)
- [x] **Single demo/live toggle** — `useDemoMode` shared store (localStorage +
  event); the shell has a real two-segment toggle that works from any page and
  stays in sync everywhere. Home's bespoke toggle removed; hero compacted.
- [x] **Compact Home hero** — dropped the brand row + big toggle box; agent
  strip moved below the nav cards so the cycle list surfaces sooner.
- [x] **Agent Console reworked + under the shell** — now a "Live Agent
  Activity" view: shell nav + a header strip with aggregate live counts
  (Active / Idle-Queued / Done / Agents), keeping the agent grid, message bus,
  and event feed. Framed for its future as a cross-run/cross-user fleet monitor
  (north-star tracked in todo.md).
- [x] **Pipeline "Focus mode"** — the shell now also wraps the pipeline; a
  Focus button hides it for a distraction-free workspace (persisted).
- [x] **Naming fix** — the `/` nav item is **Home** (it *lists* cycles); an
  individual **Cycle** is the pipeline opened from it. Breadcrumb reads
  `Home › Cycle › <name> › <view>`.
- [x] **Dead CSS removed** — `.con-header/.con-brand*/.con-nav-btn/.con-spacer`
  and `.home-brand-*` after the rework.

## Non-goals (this branch)
- Wiring Agent Settings edits to actually affect live runs (kept as todo).
- Run comparison / report export / notifications (separate backlog items).
- Backend changes beyond what the above requires.

## Done =
All builds green, navigation consistent, Console reachable as a cycle tab,
Agents hub live, Home reframed, breadcrumbs in place — then a self-review pass
on the resulting UX.
