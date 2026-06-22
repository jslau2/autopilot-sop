"""
Grain mapping for the forecast -> optimizer chain.

The booking-curve forecaster works at the grain
    sales_office_code x customer x sales_model_code x part_code x request_month
and emits monthly `projected_final_demand`. The fg-planning-optimizer consumes a
demand table keyed by `Material` + `Plan_Date` with a `PCD_Plan` quantity
(joined to capacity on `Material_Code`).

This module bridges the two:
  1. map sales_model_code -> Material via a crosswalk (master-data dependency),
  2. aggregate projected demand by (Material, request_month),
  3. place each month's quantity on the month's last business day as PCD_Plan,
  4. optionally keep only Materials the optimizer has capacity for.

The crosswalk is the one genuine master-data dependency (see
integration-engines.md §8/§10). Without it we fall back to an identity map
(Material = sales_model_code); if that yields no overlap with the optimizer's
capacity catalogue, `to_optimizer_demand_csv` returns None and the caller runs
the optimizer on its own demand source instead — so the chain degrades safely.

Crosswalk file (CSV, optional), pointed to by env GRAIN_CROSSWALK_CSV:
    sales_model_code,Material
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_crosswalk() -> dict:
    """sales_model_code -> Material, from GRAIN_CROSSWALK_CSV. Empty if unset."""
    path = os.environ.get("GRAIN_CROSSWALK_CSV")
    if not path or not os.path.exists(path):
        return {}
    try:
        import pandas as pd

        df = pd.read_csv(path, encoding="utf-8-sig")
        return dict(zip(df["sales_model_code"].astype(str), df["Material"].astype(str)))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load grain crosswalk %s (%s); using identity map.", path, exc)
        return {}


def _month_end_business_day(yyyymm: int):
    import pandas as pd

    period = pd.Period(str(int(yyyymm)), freq="M")
    last = period.to_timestamp(how="end").normalize()
    # Snap a weekend month-end back to the preceding Friday (optimizer does the same).
    while last.weekday() >= 5:
        last -= pd.Timedelta(days=1)
    return last.date().isoformat()


def to_optimizer_demand_csv(
    grains: list[dict],
    known_materials: set[str] | None = None,
) -> str | None:
    """
    Build an optimizer demand CSV (Material, Material_Description, Plan_Date,
    PCD_Plan, Plant) from booking-curve grain rows. Returns the CSV text, or
    None if nothing maps (caller should then use the optimizer's own demand).
    """
    if not grains:
        return None
    try:
        import pandas as pd

        df = pd.DataFrame(grains)
        if df.empty or "projected_final_demand" not in df.columns:
            return None

        crosswalk = _load_crosswalk()
        df["Material"] = df["sales_model_code"].astype(str).map(
            lambda s: crosswalk.get(s, s)  # identity fallback
        )

        if known_materials:
            df = df[df["Material"].isin(known_materials)]
        if df.empty:
            logger.info("Grain map: no overlap with optimizer capacity catalogue; "
                        "optimizer will use its own demand source.")
            return None

        agg = (
            df.groupby(["Material", "request_month"])["projected_final_demand"]
            .sum()
            .reset_index()
        )
        agg = agg[agg["projected_final_demand"] > 0]
        if agg.empty:
            return None

        agg["Plan_Date"] = agg["request_month"].map(_month_end_business_day)
        agg["PCD_Plan"] = agg["projected_final_demand"].round().astype(int)
        agg["Material_Description"] = agg["Material"]
        agg["Plant"] = "S&OP"

        out = agg[["Plant", "Material", "Material_Description", "Plan_Date", "PCD_Plan"]]
        return out.to_csv(index=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Grain mapping failed (%s); optimizer will use its own demand.", exc)
        return None
