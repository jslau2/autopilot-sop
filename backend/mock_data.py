from __future__ import annotations

"""
Realistic mock SAP/ERP data functions for the Shimano APAC S&OP system.
All functions are synchronous and return dicts.
"""


def get_inventory_snapshot() -> dict:
    """Returns inventory snapshot: 847 SKUs, $12.4M value, 4.2 WOS, 44 below safety stock."""
    return {
        "total_skus": 847,
        "total_value_usd": 12_400_000,
        "weeks_of_supply": 4.2,
        "below_safety_stock": 44,
        "above_max": 23,
        "healthy": 780,
        "top_risk_skus": [
            {
                "sku": "DRG-XTR-001",
                "description": "Derailleurs XTR M9100 12spd",
                "wos": 1.2,
                "on_hand_units": 840,
                "safety_stock_units": 2100,
                "gap_units": 1260,
                "risk": "CRITICAL",
            },
            {
                "sku": "BRK-DUR-105",
                "description": "Brake Caliper Dura-Ace R9200",
                "wos": 1.8,
                "on_hand_units": 1260,
                "safety_stock_units": 2400,
                "gap_units": 1140,
                "risk": "HIGH",
            },
            {
                "sku": "CST-105-11",
                "description": "Cassette 105 R7100 11-34T",
                "wos": 2.1,
                "on_hand_units": 3150,
                "safety_stock_units": 5040,
                "gap_units": 1890,
                "risk": "HIGH",
            },
        ],
        "by_plant": {
            "SPL": {"skus": 512, "value_usd": 7_800_000, "wos": 4.0},
            "SBMB": {"skus": 335, "value_usd": 4_600_000, "wos": 4.5},
        },
        "snapshot_date": "2026-05-27",
        "currency": "USD",
    }


def get_demand_history() -> dict:
    """Returns 36-month demand history with 109,512 rows, 14 promo events, 312 outliers."""
    return {
        "total_rows": 109_512,
        "months": 36,
        "skus": 847,
        "promo_events": 14,
        "outliers_detected": 312,
        "outliers_treated": 298,
        "date_range": {"start": "2023-06-01", "end": "2026-05-27"},
        "top_selling_skus": [
            {"sku": "CST-105-11", "avg_weekly_units": 4200, "trend": "+12%"},
            {"sku": "DRG-XTR-001", "avg_weekly_units": 700, "trend": "+8%"},
            {"sku": "PED-DEO-XT", "avg_weekly_units": 2100, "trend": "+5%"},
        ],
        "seasonality_detected": True,
        "peak_season": "Q3",
        "yoy_growth_pct": 11.4,
        "demand_volatility_cv": 0.28,
        "data_completeness_pct": 99.1,
    }


def get_supplier_atp() -> dict:
    """Returns supplier ATP data: 892 components, 12 ATP gaps, 3 CTP risks, 14 MOQ flags."""
    return {
        "total_components": 892,
        "atp_gaps": 12,
        "ctp_risks": 3,
        "moq_flags": 14,
        "on_time_delivery_rate": 0.871,
        "critical_gaps": [
            {
                "component": "DRG-XTR-001",
                "supplier": "Supplier X",
                "required_units": 5040,
                "atp_units": 2100,
                "gap_units": 2940,
                "lead_time_weeks": 8,
                "risk": "CRITICAL",
                "alternate_available": False,
            },
            {
                "component": "BRK-HYD-XTR",
                "supplier": "Supplier Y",
                "required_units": 3200,
                "atp_units": 1800,
                "gap_units": 1400,
                "lead_time_weeks": 6,
                "risk": "HIGH",
                "alternate_available": True,
            },
            {
                "component": "CHN-SLX-12",
                "supplier": "Supplier Z",
                "required_units": 8400,
                "atp_units": 6300,
                "gap_units": 2100,
                "lead_time_weeks": 4,
                "risk": "MEDIUM",
                "alternate_available": True,
            },
        ],
        "supplier_scorecard": {
            "Supplier X": {"otd": 0.72, "quality": 0.98, "risk_rating": "HIGH"},
            "Supplier Y": {"otd": 0.89, "quality": 0.99, "risk_rating": "MEDIUM"},
            "Supplier Z": {"otd": 0.94, "quality": 0.97, "risk_rating": "LOW"},
        },
        "pending_pos": 47,
        "po_value_usd": 2_340_000,
    }


def get_bom_data() -> dict:
    """Returns BOM data: 3240 records, 34 issues, 3 duplicate vendors."""
    return {
        "total_bom_records": 3240,
        "total_issues": 34,
        "duplicate_vendors": 3,
        "missing_lead_times": 12,
        "uom_mismatches": 8,
        "phantom_boms": 6,
        "orphaned_components": 5,
        "auto_resolvable": 31,
        "manual_review_required": 3,
        "bom_completeness_pct": 98.9,
        "last_validated": "2026-05-26",
        "affected_skus": 18,
        "critical_issues": [
            {
                "issue": "Missing lead time",
                "component": "DRG-XTR-001",
                "impact": "Cannot ATP check",
            },
            {
                "issue": "Duplicate vendor record",
                "component": "BRK-DUR-105",
                "impact": "Incorrect cost rollup",
            },
            {
                "issue": "UOM mismatch",
                "component": "BRK-HYD-XTR",
                "impact": "Incorrect quantity planning",
            },
        ],
    }


def get_capacity_config() -> dict:
    """Returns capacity config: 5 production lines at SPL/SBMB, 79-92% utilization, 2 bottlenecks."""
    return {
        "total_lines": 5,
        "plants": ["SPL", "SBMB"],
        "planning_horizon_weeks": 13,
        "lines": [
            {
                "line_id": "SPL-L1",
                "plant": "SPL",
                "description": "Drivetrain Assembly Line 1",
                "capacity_units_per_week": 12_000,
                "planned_utilization": 0.87,
                "oee": 0.79,
                "bottleneck": True,
                "constraint": "fixture_availability",
            },
            {
                "line_id": "SPL-L2",
                "plant": "SPL",
                "description": "Brake Component Line",
                "capacity_units_per_week": 9_600,
                "planned_utilization": 0.79,
                "oee": 0.82,
                "bottleneck": False,
                "constraint": None,
            },
            {
                "line_id": "SPL-L3",
                "plant": "SPL",
                "description": "High-Precision Gear Line",
                "capacity_units_per_week": 8_400,
                "planned_utilization": 0.92,
                "oee": 0.76,
                "bottleneck": True,
                "constraint": "tooling_wear",
            },
            {
                "line_id": "SBMB-L1",
                "plant": "SBMB",
                "description": "Cassette & Chain Assembly",
                "capacity_units_per_week": 15_000,
                "planned_utilization": 0.81,
                "oee": 0.84,
                "bottleneck": False,
                "constraint": None,
            },
            {
                "line_id": "SBMB-L2",
                "plant": "SBMB",
                "description": "Pedal & Crankset Line",
                "capacity_units_per_week": 7_200,
                "planned_utilization": 0.83,
                "oee": 0.81,
                "bottleneck": False,
                "constraint": None,
            },
        ],
        "total_weekly_capacity": 52_200,
        "bottleneck_lines": ["SPL-L1", "SPL-L3"],
        "relief_options": ["overtime", "lot_split", "alternate_routing", "subcontract"],
    }


def get_tooling_data() -> dict:
    """Returns tooling data: 284 die sets, 12 due for maintenance, 3 critical."""
    return {
        "total_die_sets": 284,
        "due_maintenance": 12,
        "critical": 3,
        "high_risk": 12,
        "medium_risk": 24,
        "low_risk": 245,
        "critical_tools": [
            {
                "tool_id": "DIE-SPL-L3-001",
                "line": "SPL-L3",
                "description": "Gear precision die set",
                "cycles_since_last_pm": 48_200,
                "pm_cycle_limit": 50_000,
                "remaining_cycles": 1_800,
                "est_weeks_remaining": 1.5,
                "risk": "CRITICAL",
            },
            {
                "tool_id": "DIE-SPL-L1-007",
                "line": "SPL-L1",
                "description": "Derailleur fixture assembly",
                "cycles_since_last_pm": 47_800,
                "pm_cycle_limit": 50_000,
                "remaining_cycles": 2_200,
                "est_weeks_remaining": 2.0,
                "risk": "CRITICAL",
            },
            {
                "tool_id": "DIE-SBMB-L1-003",
                "line": "SBMB-L1",
                "description": "Cassette carrier press die",
                "cycles_since_last_pm": 49_100,
                "pm_cycle_limit": 50_000,
                "remaining_cycles": 900,
                "est_weeks_remaining": 1.0,
                "risk": "CRITICAL",
            },
        ],
        "maintenance_schedule_weeks": [1, 2, 3],
        "total_downtime_days_planned": 9,
        "production_impact_units": 2_250,
    }


def get_production_orders() -> dict:
    """Returns production orders: 234 open orders, $3.8M WIP, 78% OEE."""
    return {
        "open_orders": 234,
        "total_wip_value_usd": 3_800_000,
        "oee": 0.78,
        "on_time_completions_pct": 0.84,
        "at_risk_orders": 36,
        "value_at_risk_usd": 540_000,
        "by_line": {
            "SPL-L1": {"orders": 58, "wip_usd": 980_000, "at_risk": 12},
            "SPL-L2": {"orders": 42, "wip_usd": 620_000, "at_risk": 4},
            "SPL-L3": {"orders": 51, "wip_usd": 890_000, "at_risk": 14},
            "SBMB-L1": {"orders": 54, "wip_usd": 860_000, "at_risk": 4},
            "SBMB-L2": {"orders": 29, "wip_usd": 450_000, "at_risk": 2},
        },
        "priority_a_orders": 28,
        "expedite_flags": 8,
        "schedule_adherence_pct": 0.81,
    }


def get_abc_classification() -> dict:
    """Returns ABC classification: A=127 SKUs (72% revenue), B=254 (21%), C=466 (7%)."""
    return {
        "total_skus": 847,
        "tiers": {
            "A": {
                "skus": 127,
                "revenue_pct": 72,
                "cumulative_revenue_pct": 72,
                "avg_weekly_velocity": 3800,
                "service_level_target": 0.99,
                "examples": ["DRG-XTR-001", "BRK-DUR-105", "CST-105-11"],
            },
            "B": {
                "skus": 254,
                "revenue_pct": 21,
                "cumulative_revenue_pct": 93,
                "avg_weekly_velocity": 820,
                "service_level_target": 0.97,
                "examples": ["PED-DEO-XT", "HUB-XTR-F15", "RIM-WH-R9"],
            },
            "C": {
                "skus": 466,
                "revenue_pct": 7,
                "cumulative_revenue_pct": 100,
                "avg_weekly_velocity": 120,
                "service_level_target": 0.95,
                "examples": ["NUT-M5-SS", "CABLE-SHIFT-2M", "GRIP-TAPE-BK"],
            },
        },
        "classification_date": "2026-05-27",
        "method": "Pareto-ABC with velocity weighting",
    }


def run_forecast_models(horizon_weeks: int = 13) -> dict:
    """Model tournament results. LightGBM wins with 5.8% MAPE."""
    return {
        "horizon_weeks": horizon_weeks,
        "models": [
            {
                "name": "ETS",
                "mape": 8.4,
                "rmse": 412,
                "bias": -1.2,
                "train_time_sec": 8,
                "rank": 5,
                "selected": False,
            },
            {
                "name": "Prophet",
                "mape": 6.2,
                "rmse": 318,
                "bias": 0.8,
                "train_time_sec": 24,
                "rank": 3,
                "selected": False,
            },
            {
                "name": "LightGBM",
                "mape": 5.8,
                "rmse": 284,
                "bias": 0.3,
                "train_time_sec": 42,
                "rank": 1,
                "selected": True,
            },
            {
                "name": "NBEATS",
                "mape": 6.1,
                "rmse": 301,
                "bias": -0.5,
                "train_time_sec": 187,
                "rank": 4,
                "selected": False,
            },
            {
                "name": "TFT",
                "mape": 5.9,
                "rmse": 291,
                "bias": 0.4,
                "train_time_sec": 312,
                "rank": 2,
                "selected": False,
            },
        ],
        "winning_model": "LightGBM",
        "winning_mape": 5.8,
        "selection_criteria": "Best MAPE with acceptable bias and training time",
        "total_forecast_units": 312_400,
        "spike_skus": 3,
        "spike_threshold_pct": 30,
    }


def run_capacity_plan(demand_units: int = 312_400, horizon_weeks: int = 13) -> dict:
    """Returns capacity plan with bottleneck analysis."""
    weekly_demand = demand_units / horizon_weeks
    return {
        "demand_units": demand_units,
        "horizon_weeks": horizon_weeks,
        "weekly_avg_demand": round(weekly_demand, 0),
        "total_capacity_units": 678_600,
        "capacity_utilization": 0.846,
        "feasible": True,
        "bottleneck_weeks": [3, 4, 5, 8, 9],
        "bottleneck_lines": ["SPL-L3", "SPL-L1"],
        "overflow_units": 4_200,
        "overflow_relief": "overtime + lot_split",
        "by_line": {
            "SPL-L1": {
                "allocated_units": 145_600,
                "utilization": 0.931,
                "relief_needed": True,
            },
            "SPL-L2": {"allocated_units": 112_320, "utilization": 0.812, "relief_needed": False},
            "SPL-L3": {
                "allocated_units": 107_380,
                "utilization": 0.984,
                "relief_needed": True,
            },
            "SBMB-L1": {"allocated_units": 176_800, "utilization": 0.895, "relief_needed": False},
            "SBMB-L2": {"allocated_units": 83_200, "utilization": 0.801, "relief_needed": False},
        },
        "recommended_actions": [
            "Approve 6% overtime on SPL-L3 for weeks 3-5",
            "Lot-split DRG-XTR-001 orders across SPL-L1 and SPL-L3",
            "Schedule SPL-L3 tooling PM in week 6 (low demand window)",
        ],
    }


def run_milp_optimization(constraints: dict | None = None) -> dict:
    """Returns MILP optimization result: OTIF 97.8%, margin 23.1%, EBIT delta +140k."""
    return {
        "status": "optimal",
        "solver": "HiGHS",
        "solve_time_sec": 14.2,
        "otif": 0.978,
        "otif_pct": "97.8%",
        "gross_margin": 0.231,
        "gross_margin_pct": "23.1%",
        "ebit_delta_usd": 140_000,
        "revenue_usd": 18_400_000,
        "gross_profit_usd": 4_252_400,
        "total_units_planned": 312_400,
        "fill_rate": 0.982,
        "service_level": 0.978,
        "scenarios_evaluated": 3,
        "pareto_frontier": [
            {"otif": 0.978, "margin": 0.231, "label": "Balanced (selected)"},
            {"otif": 0.985, "margin": 0.218, "label": "OTIF-maximized"},
            {"otif": 0.962, "margin": 0.243, "label": "Margin-maximized"},
        ],
        "binding_constraints": ["SPL-L3 capacity", "Supplier X ATP", "W22-W24 demand spike"],
        "slack_constraints": ["SBMB-L2 capacity", "Budget ceiling"],
        "recommended_plan": "balanced",
        "vs_baseline": {
            "otif_improvement": "+2.3pp",
            "margin_improvement": "+1.1pp",
            "ebit_improvement_usd": 140_000,
        },
    }


def compute_safety_stock(service_level: float = 0.95) -> dict:
    """Returns safety stock levels per tier based on service level."""
    z_score = {0.90: 1.28, 0.95: 1.645, 0.97: 1.88, 0.98: 2.054, 0.99: 2.326}.get(
        round(service_level, 2), 1.645
    )
    return {
        "service_level": service_level,
        "z_score": z_score,
        "method": "Demand/Supply variability model (sigma_d * LT + sigma_lt * D_avg)",
        "tiers": {
            "A": {
                "skus": 127,
                "avg_safety_stock_weeks": 3.0,
                "total_units": 48_300,
                "total_value_usd": 2_890_000,
                "service_level": 0.99,
            },
            "B": {
                "skus": 254,
                "avg_safety_stock_weeks": 2.5,
                "total_units": 52_400,
                "total_value_usd": 1_240_000,
                "service_level": 0.97,
            },
            "C": {
                "skus": 466,
                "avg_safety_stock_weeks": 2.0,
                "total_units": 89_200,
                "total_value_usd": 620_000,
                "service_level": service_level,
            },
        },
        "total_safety_stock_units": 189_900,
        "total_safety_stock_value_usd": 4_750_000,
        "below_target": 44,
        "above_target": 23,
        "on_target": 780,
    }


def generate_risk_register(risks: list | None = None) -> dict:
    """Returns risk register with severity scores."""
    if risks is None:
        risks = []
    base_risks = [
        {
            "id": "RSK-001",
            "category": "Supply",
            "description": "Supplier X DRG-XTR-001 lead time extended to 8 weeks",
            "probability": 0.85,
            "impact": 0.90,
            "severity": 0.765,
            "severity_label": "CRITICAL",
            "mitigation": "Dual-source qualification + emergency air freight",
            "owner": "Procurement",
            "status": "OPEN",
        },
        {
            "id": "RSK-002",
            "category": "Capacity",
            "description": "SPL-L3 tooling wear risk — potential unplanned downtime",
            "probability": 0.70,
            "impact": 0.80,
            "severity": 0.560,
            "severity_label": "HIGH",
            "mitigation": "Preventive maintenance week 6, alternate routing to SPL-L1",
            "owner": "Manufacturing",
            "status": "MITIGATED",
        },
        {
            "id": "RSK-003",
            "category": "Demand",
            "description": "Q3 demand spike >30% for premium groupsets vs. forecast",
            "probability": 0.55,
            "impact": 0.65,
            "severity": 0.358,
            "severity_label": "MEDIUM",
            "mitigation": "Safety stock buffer, fast-track replenishment PO",
            "owner": "Demand Planning",
            "status": "MONITORING",
        },
        {
            "id": "RSK-004",
            "category": "Data Quality",
            "description": "3 BOM records with unresolved duplicate vendor entries",
            "probability": 0.40,
            "impact": 0.30,
            "severity": 0.120,
            "severity_label": "LOW",
            "mitigation": "Manual data cleanse by master data team",
            "owner": "Master Data",
            "status": "IN_PROGRESS",
        },
    ]
    total = len(base_risks) + len(risks)
    return {
        "total_risks": total,
        "critical": 1,
        "high": 1,
        "medium": 1,
        "low": total - 3,
        "mitigated": 4,
        "residual": 3,
        "risks": base_risks,
        "risk_score_composite": 0.42,
        "generated_at": "2026-05-27",
    }
