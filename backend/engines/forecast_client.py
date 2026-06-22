"""
Client for the incoming-sales-booking-curve engine (Demand Planning agent).

Wraps the booking-curve service (serve.py: GET /history, POST /forecast) and
translates its responses into the shapes the demand tools already return, so
the UI's metric/summary extractors render unchanged. Returns None on any
failure -> workers falls back to mock_data.

Config (backend/.env):
    FORECAST_ENGINE_URL   e.g. http://localhost:8200   (alias: BOOKING_CURVE_URL)
"""

from __future__ import annotations

import logging

from . import handoff
from ._common import base_url, client

logger = logging.getLogger(__name__)


def _url() -> str | None:
    return base_url("FORECAST_ENGINE_URL", "BOOKING_CURVE_URL")


def is_available() -> bool:
    url = _url()
    if not url:
        return False
    c = client(timeout=5.0)
    if c is None:
        return False
    try:
        with c:
            r = c.get(f"{url}/health")
            return r.status_code == 200 and r.json().get("model_trained", False)
    except Exception as exc:  # noqa: BLE001
        logger.info("Forecast engine not reachable (%s); using mock data.", exc)
        return False


def _post_forecast(detail: bool = False) -> dict | None:
    url = _url()
    if not url:
        return None
    c = client()
    if c is None:
        return None
    try:
        with c:
            r = c.post(f"{url}/forecast", json={"detail": detail, "top_n": 5})
            if r.status_code != 200:
                logger.warning("Forecast engine /forecast -> %s; using mock.", r.status_code)
                return None
            return r.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Forecast engine call failed (%s); using mock.", exc)
        return None


# ---------------------------------------------------------------------------
# Demand agent tools
# ---------------------------------------------------------------------------
def get_demand_history() -> dict | None:
    """Back get_demand_history with the real feature-table aggregates."""
    url = _url()
    if not url:
        return None
    c = client()
    if c is None:
        return None
    try:
        with c:
            r = c.get(f"{url}/history")
            if r.status_code != 200:
                return None
            h = r.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Forecast engine /history failed (%s); using mock.", exc)
        return None

    dr = h.get("date_range", {})
    return {
        "source": h.get("source", "incoming-sales-booking-curve"),
        "total_rows": h.get("total_rows", 0),
        "months": h.get("months", 0),
        "skus": h.get("sales_models", 0),
        "part_codes": h.get("part_codes", 0),
        "customers": h.get("customers", 0),
        "sales_offices": h.get("sales_offices", 0),
        "date_range": {"start": dr.get("start"), "end": dr.get("end")},
        "total_final_demand_units": h.get("total_final_demand_units", 0),
        "avg_booking_ratio": h.get("avg_booking_ratio"),
        "engine": "live",
    }


def run_forecast_models(horizon_weeks: int = 13) -> dict | None:
    """Back run_forecast_models with the real model's validation accuracy."""
    data = _post_forecast(detail=False)
    if data is None:
        return None
    m = data.get("model", {})
    plan = data.get("plan", {})
    mape = m.get("mape_pct")
    return {
        "horizon_weeks": horizon_weeks,
        "models": [
            {
                "name": m.get("name", "XGBoost (booking-ratio)"),
                "mape": mape,
                "forecast_accuracy": m.get("forecast_accuracy"),
                "mae_units": m.get("mae_units"),
                "within_10pct": m.get("within_10pct"),
                "within_25pct": m.get("within_25pct"),
                "rank": 1,
                "selected": True,
            }
        ],
        "winning_model": m.get("name", "XGBoost (booking-ratio)"),
        "winning_mape": mape,
        "mape": mape,
        "val_rows_scored": m.get("val_rows_scored"),
        "total_forecast_units": plan.get("total_projected_demand"),
        "total_units": plan.get("total_projected_demand"),
        "request_months": data.get("request_months"),
        "selection_criteria": "Held-out WMAPE on pinned validation months (booking-curve engine)",
        "engine": "live",
    }


def generate_demand_plan(winning_model: str | None = None, adjust_spike_pct: float = 0.0) -> dict | None:
    """
    Back generate_demand_plan with the projected-final-demand plan, and stash the
    per-grain detail on the session so the optimizer can consume it (chaining).
    """
    data = _post_forecast(detail=True)
    if data is None:
        return None
    m = data.get("model", {})
    plan = data.get("plan", {})

    # Hand the per-grain forecast to the optimizer for this run.
    grains = data.get("grains")
    if grains:
        handoff.put_demand_signal({
            "grains": grains,
            "request_months": data.get("request_months"),
            "total_projected_demand": plan.get("total_projected_demand"),
            "source": "booking-curve",
        })

    by_month = plan.get("by_month", [])
    by_month_str = ", ".join(
        f"{r['request_month']}:{r['projected_final_demand']:,}" for r in by_month
    )
    top = plan.get("top_movers", [])

    return {
        "model": winning_model or m.get("name", "XGBoost (booking-ratio)"),
        "total_units": plan.get("total_projected_demand", 0),
        "already_booked_units": plan.get("total_already_booked", 0),
        "predicted_remaining_units": plan.get("total_predicted_remaining", 0),
        "grains": plan.get("n_grains", 0),
        "mape": m.get("mape_pct"),
        "forecast_accuracy": m.get("forecast_accuracy"),
        "by_month": by_month_str,
        "top_movers": top,
        "spike_pct": adjust_spike_pct,
        "engine": "live",
    }
