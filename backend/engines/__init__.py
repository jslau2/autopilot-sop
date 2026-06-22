"""
Deterministic-engine clients for the Autopilot S&OP specialist agents.

Each agent is an LLM that reasons and explains; the heavy maths is done by a
real engine the agent calls through a tool. These clients wrap those engines
over HTTP and follow the same contract as `bom_graph.py`: configuration comes
from environment variables, and every public function returns `None` when the
engine is unconfigured or unreachable so the caller can fall back to
`mock_data` (keeping demo mode and a degraded live mode working).

Engines:
- forecast_client  -> incoming-sales-booking-curve   (Demand Planning agent)
- planning_client  -> fg-planning-optimizer (MIP/LP)  (Supply Chain Optimizer agent)

See autopilot-sop/docs/integration-engines.md.
"""
