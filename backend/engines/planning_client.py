"""
Client for the fg-planning-optimizer engine (Supply Chain Optimizer agent).

Wraps the optimizer's FastAPI (POST /api/runs -> poll /status -> /kpis +
/tables) and translates the result into the shape `run_milp_optimization`
already returns, so the UI renders unchanged. Returns None on any failure ->
workers falls back to mock_data.

If the Demand agent produced a forecast earlier in the same run, its projected
demand is mapped to the optimizer's demand schema and uploaded, so the MILP
solves against the live forecast (the forecast -> optimizer chain). Otherwise
the optimizer runs on its configured demand source.

Config (backend/.env):
    OPTIMIZER_ENGINE_URL   e.g. http://localhost:8100   (alias: FG_OPTIMIZER_URL)
    OPTIMIZER_MAX_WAIT_SEC poll ceiling for a solve (default 180)
"""

from __future__ import annotations

import logging
import os
import time

from . import grain_map, handoff
from ._common import base_url, client

logger = logging.getLogger(__name__)

# Solver params we accept from the agent's `constraints` arg and pass through.
_PARAM_KEYS = {
    "solver_time_limit", "mip_gap", "setup_time_min",
    "hold_weight", "setup_weight", "shortage_weight",
    "filter_line", "solve_by_line", "solve_mode",
}


def _url() -> str | None:
    return base_url("OPTIMIZER_ENGINE_URL", "FG_OPTIMIZER_URL")


def _max_wait() -> float:
    try:
        return float(os.environ.get("OPTIMIZER_MAX_WAIT_SEC", "180"))
    except ValueError:
        return 180.0


def is_available() -> bool:
    url = _url()
    if not url:
        return False
    c = client(timeout=5.0)
    if c is None:
        return False
    try:
        with c:
            return c.get(f"{url}/api/health").status_code == 200
    except Exception as exc:  # noqa: BLE001
        logger.info("Optimizer engine not reachable (%s); using mock data.", exc)
        return False


def _known_materials(c, url: str) -> set[str]:
    """Materials the optimizer has capacity for (to filter mapped demand)."""
    try:
        r = c.get(f"{url}/api/samples/capacity")
        if r.status_code != 200:
            return set()
        rows = r.json().get("rows", [])
        return {str(row.get("Material_Code")) for row in rows if row.get("Material_Code")}
    except Exception:  # noqa: BLE001
        return set()


def _maybe_upload_forecast_demand(c, url: str) -> tuple[str | None, str]:
    """
    If the Demand agent produced a forecast this run, map + upload it as the
    optimizer's demand. Returns (dem_upload_id|None, demand_source_label).
    """
    signal = handoff.get_demand_signal()
    if not signal or not signal.get("grains"):
        return None, "sample"
    csv_text = grain_map.to_optimizer_demand_csv(
        signal["grains"], known_materials=_known_materials(c, url)
    )
    if not csv_text:
        return None, "sample (forecast grains did not map to capacity catalogue)"
    try:
        r = c.post(
            f"{url}/api/uploads",
            data={"kind": "demand"},
            files={"file": ("forecast_demand.csv", csv_text, "text/csv")},
        )
        if r.status_code != 200:
            logger.warning("Forecast demand upload -> %s; optimizer uses sample.", r.status_code)
            return None, "sample (upload rejected)"
        return r.json().get("upload_id"), "booking-curve forecast"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Forecast demand upload failed (%s); optimizer uses sample.", exc)
        return None, "sample (upload failed)"


def run_milp_optimization(constraints: dict | None = None) -> dict | None:
    """Run the MILP solve and translate KPIs/tables into the agent tool shape."""
    url = _url()
    if not url:
        return None
    c = client(timeout=_max_wait() + 30)
    if c is None:
        return None

    constraints = constraints or {}
    params = {k: v for k, v in constraints.items() if k in _PARAM_KEYS}

    try:
        with c:
            dem_upload_id, demand_source = _maybe_upload_forecast_demand(c, url)
            body: dict = {"params": params}
            if dem_upload_id:
                body["dem_source"] = "upload"
                body["dem_upload_id"] = dem_upload_id

            r = c.post(f"{url}/api/runs", json=body)
            if r.status_code != 200:
                logger.warning("Optimizer /api/runs -> %s; using mock.", r.status_code)
                return None
            job = r.json()
            job_id = job.get("job_id")
            if not job_id:
                return None

            deadline = time.time() + _max_wait()
            status = "pending"
            err = None
            while time.time() < deadline:
                sr = c.get(f"{url}/api/runs/{job_id}/status")
                if sr.status_code != 200:
                    return None
                st = sr.json()
                status = st.get("status")
                if status in ("done", "error"):
                    err = st.get("error")
                    break
                time.sleep(2)

            if status != "done":
                logger.warning("Optimizer run %s ended status=%s err=%s; using mock.",
                               job_id, status, err)
                return None

            kpis = c.get(f"{url}/api/runs/{job_id}/kpis").json()
            cap = _capacity_table(c, url, job_id)
            return _translate(kpis, cap, demand_source, job.get("lines", []))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Optimizer call failed (%s); using mock.", exc)
        return None


def _capacity_table(c, url: str, job_id: str) -> dict:
    try:
        r = c.get(f"{url}/api/runs/{job_id}/tables/capacity")
        return r.json() if r.status_code == 200 else {}
    except Exception:  # noqa: BLE001
        return {}


def _translate(kpis: dict, cap: dict, demand_source: str, lines: list) -> dict:
    """Map optimizer KPIs/tables -> the keys run_milp_optimization emits."""
    demand = kpis.get("total_demand", 0) or 0
    shortage = kpis.get("total_shortage", 0) or 0
    produced = kpis.get("total_produced", 0) or 0
    otif = round(1 - (shortage / demand), 4) if demand else 1.0
    avg_util = round((kpis.get("avg_utilization", 0.0) or 0.0) / 100.0, 4)
    peak_util = round((kpis.get("peak_utilization", 0.0) or 0.0) / 100.0, 4)

    # Lines running hottest are the binding constraints.
    binding: list[str] = []
    rows = cap.get("rows", []) if isinstance(cap, dict) else []
    if rows:
        try:
            by_line: dict[str, float] = {}
            for row in rows:
                ln = row.get("Prod_Line")
                u = float(row.get("Utilization_Pct", 0) or 0)
                if ln is not None:
                    by_line[ln] = max(by_line.get(ln, 0.0), u)
            binding = [ln for ln, u in sorted(by_line.items(), key=lambda x: -x[1])[:3] if u >= 90]
        except Exception:  # noqa: BLE001
            binding = []

    return {
        "status": "optimal",
        "solver": "HiGHS (fg-planning-optimizer)",
        "demand_source": demand_source,
        "otif": otif,
        "otif_pct": f"{otif * 100:.1f}%",
        "capacity_utilization": avg_util,
        "peak_utilization": peak_util,
        "total_units_planned": int(produced),
        "total_demand_units": int(demand),
        "total_shortage_units": int(shortage),
        "total_setups": kpis.get("total_setups", 0),
        "fill_rate": round(produced / demand, 4) if demand else 1.0,
        "lines_planned": kpis.get("lines", lines),
        "binding_constraints": binding or kpis.get("lines", []),
        "engine": "live",
    }
