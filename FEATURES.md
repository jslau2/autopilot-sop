# Autopilot S&OP — Features & USPs

A launch/demo-oriented summary of what the product does and why it stands out.
Everything here is implemented on `main`.

---

## Elevator pitch
**Autopilot S&OP** runs a complete Sales & Operations Planning cycle with a team
of **12 specialized AI agents** orchestrated in parallel — from demand forecast
to supply/capacity reconciliation, a human decision checkpoint, optimization,
and financial & risk sign-off — with full live transparency and a human in the
loop.

---

## Top USPs (the differentiators)

1. **A team of agents, not a chatbot.** A Planner orchestrates **11 specialist
   agents** (demand, procurement, capacity, inventory, tooling, finance, risk,
   optimizer, …) in parallel phases — each a real tool-using agent with its own
   prompt, tools, and data source.
2. **Human-in-the-loop by design.** The cycle pauses at the critical decision
   point and asks the planner to choose (e.g. approve overtime vs. accept
   shortfall) — the AI escalates with quantified trade-offs instead of deciding
   silently.
3. **Total transparency.** Watch every agent work live on a swimlane/timeline
   with dependency arrows, a live KPI bar, and a click-through drawer showing
   each step's output and reasoning.
4. **Demo *and* Live in one app.** A scripted, deterministic **Demo mode** (no
   backend) for flawless sales demos, and a **Live mode** running real Azure
   OpenAI agents — toggled in one click.
5. **Real planning workflow, not a toy.** Full cycle lifecycle, concurrent runs,
   what-if scenario branching, entity scoping, and an executive report you can
   hand to leadership.

---

## Features by theme

### Multi-agent orchestration
- **12 agents** (1 Planner + 11 specialists), parallelized across 5 phases.
- Dependency-aware: the swimlane draws connectors showing how work fans out.
- **Human decision checkpoint** with options and quantified trade-offs.

### Live transparency & control
- **Swimlane & Timeline** views of the run (toggle with `T`).
- **Live KPI bar** — OTIF, forecast accuracy, capacity utilisation, weeks of
  supply, plan Δ EBIT.
- **Step drawer** — per-step output, reasoning, and raw detail.
- **Event stream** of everything happening, in real time.
- **Focus mode** — hide the app chrome for a distraction-free war-room view.

### Planning cycles (sessions)
- **"+ New Cycle"** everywhere → a launch screen (goal, auto-suggested name,
  scope, planning entity).
- **Concurrent runs** — start several cycles; they run in the background.
- **Switch** between runs instantly (full state rebuilt on reconnect).
- **Terminate** (keeps an archived record) and **Delete**.
- **Persistence** — completed/terminated cycles survive backend restarts.
- **What-if scenario branching** — clone a run with tweaked constraints to
  compare alternatives; branches are linked to their parent.
- **Planning Entity scoping** — scope cycles & lists to a plant grouping/region.

### The agent fleet
- **Agent Console — Live Agent Activity:** a real-time fleet monitor showing
  every agent's status aggregated across **all active runs**, with an Active
  Runs panel. (Demo mode shows a scripted walkthrough.)
- **Agents Hub:**
  - *Configure* — edit each agent's **system prompt & temperature**; changes
    apply to new live runs.
  - *Performance & Governance* — per-agent analytics, growth trends, and a
    Governance Agent assessment.

### Planner chat assistant
- Global, **draggable** assistant that follows you across the app.
- **Reads** real run context on demand (and asks which run if ambiguous).
- **Acts** on your behalf — start a cycle or answer a pending decision.
- Persistent history; sparkles "AI" affordance.

### Data & outputs
- **Data Sources** — the ERP/external feeds powering the plan (SAP S/4HANA,
  Supplier Portal, Tooling Register, …) with **live data preview**.
- **Executive report export** — one click to **Markdown** or **PDF**: KPIs, key
  decisions, financial sign-off, risk register, and agent activity summary.

---

## Suggested launch-demo flow (≈3–4 min)
1. **Home** — show the Planning Cycles list and the consistent top nav
   (Home · Cycle · Agent Console · Agents · Data Sources).
2. **+ New Cycle** — edit the goal, hit **✨ Suggest** for a name, pick an
   entity, launch.
3. **Pipeline** — watch agents light up the swimlane in parallel; open a step
   to show its reasoning; point out the live KPIs.
4. **Decision modal** — the cycle pauses; make the call (the human-in-the-loop
   moment). Show the trade-offs.
5. **Completion** — open **⤓ Report** → export the executive PDF.
6. **What-if** — hit **⎇ What-if** to branch the run with a tweaked constraint.
7. **Agent Console** — switch to show the live fleet of agents across runs.
8. **Agents hub** — tweak a prompt to show the system is configurable.
9. (Optional) **Planner chat** — ask "what's the status of my run?" and let it
   pull context.

---

## Modes
- **Demo** — scripted, deterministic, no backend. Perfect for sales demos.
- **Live** — real Azure OpenAI agents via the FastAPI backend (SSE streaming).
  Requires Azure credentials.

## Tech highlights (for technical audiences)
- React 18 + TypeScript SPA; FastAPI backend with **SSE streaming**.
- Backend runs agents as concurrent async tasks; SSE **replays history** on
  reconnect so any run can be reopened with full state.
- Pluggable agent definitions (prompt + tools + data source) in one file.

---

*Roadmap candidates: run comparison (side-by-side cycle outcomes), decision
notifications, multi-user fleet view (with auth), streaming chat. See `todo.md`.*
