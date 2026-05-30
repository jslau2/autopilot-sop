from __future__ import annotations

"""
"Run it on YOUR data" — parse an uploaded CSV/TSV export (SKU / demand /
inventory etc.), profile it, and build a short natural-language summary that can
be injected into a planning cycle's goal so the agents plan on the user's own
numbers.

CSV/TSV is parsed with the stdlib (no pandas dependency). .xlsx is accepted only
if openpyxl happens to be installed; otherwise we ask the user to export CSV.
"""

import csv
import io
import logging
import time
import uuid

log = logging.getLogger("uploads")

# In-memory store of parsed datasets (ephemeral; cleared on restart).
uploads: dict[str, dict] = {}

_MAX_STORE_ROWS = 2000
_PREVIEW_ROWS = 8

# Column-name heuristics → semantic role.
_ROLE_HINTS = {
    "sku": ["sku", "item", "material", "part", "product", "article"],
    "demand": ["demand", "qty", "quantity", "forecast", "sales", "units", "order"],
    "inventory": ["inventory", "stock", "on_hand", "onhand", "soh", "available"],
    "date": ["date", "week", "period", "month", "wk"],
    "plant": ["plant", "site", "location", "warehouse", "dc", "facility"],
}


def _detect_roles(columns: list[str]) -> dict[str, str]:
    """Map a semantic role -> the first column whose name matches its hints."""
    roles: dict[str, str] = {}
    lower = {c: c.lower().strip() for c in columns}
    for role, hints in _ROLE_HINTS.items():
        for col in columns:
            name = lower[col]
            if any(h in name for h in hints):
                roles[role] = col
                break
    return roles


def _to_float(v) -> float | None:
    try:
        s = str(v).replace(",", "").replace("$", "").strip()
        if not s:
            return None
        return float(s)
    except (ValueError, TypeError):
        return None


def _sniff_dialect(sample: str) -> str:
    """Return delimiter — tab if it looks like TSV, else comma/semicolon."""
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
        return dialect.delimiter
    except csv.Error:
        # fall back to whichever common delimiter appears most in the header line
        head = sample.splitlines()[0] if sample else ""
        return max(",\t;|", key=lambda d: head.count(d))


def parse_csv(filename: str, raw: bytes) -> dict:
    """Parse CSV/TSV bytes into a stored, profiled dataset. Raises ValueError."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    if not text.strip():
        raise ValueError("File is empty.")

    delim = _sniff_dialect(text[:4096])
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    columns = [c for c in (reader.fieldnames or []) if c is not None]
    if not columns:
        raise ValueError("Could not read a header row.")

    rows: list[dict] = []
    for i, row in enumerate(reader):
        if i >= _MAX_STORE_ROWS:
            break
        rows.append({k: row.get(k) for k in columns})

    # also count remaining rows beyond the store cap (cheap)
    extra = sum(1 for _ in reader)
    row_count = len(rows) + extra

    roles = _detect_roles(columns)
    profile = _profile(rows, roles)

    upload_id = uuid.uuid4().hex[:12]
    record = {
        "upload_id": upload_id,
        "filename": filename,
        "uploaded_at": time.time(),
        "columns": columns,
        "roles": roles,
        "row_count": row_count,
        "stored_rows": len(rows),
        "preview": rows[:_PREVIEW_ROWS],
        "profile": profile,
        "summary": build_summary(filename, columns, roles, profile, row_count),
        "_rows": rows,  # full (capped) data — not returned in API payloads
    }
    uploads[upload_id] = record
    return record


def _profile(rows: list[dict], roles: dict[str, str]) -> dict:
    profile: dict = {}
    if not rows:
        return profile

    sku_col = roles.get("sku")
    if sku_col:
        skus = {str(r.get(sku_col)).strip() for r in rows if r.get(sku_col)}
        profile["unique_skus"] = len(skus)

    for metric in ("demand", "inventory"):
        col = roles.get(metric)
        if not col:
            continue
        vals = [v for v in (_to_float(r.get(col)) for r in rows) if v is not None]
        if vals:
            profile[f"total_{metric}"] = round(sum(vals), 2)
            profile[f"avg_{metric}"] = round(sum(vals) / len(vals), 2)

    date_col = roles.get("date")
    if date_col:
        dates = sorted({str(r.get(date_col)).strip() for r in rows if r.get(date_col)})
        if dates:
            profile["date_min"] = dates[0]
            profile["date_max"] = dates[-1]
            profile["periods"] = len(dates)

    plant_col = roles.get("plant")
    if plant_col:
        plants = {str(r.get(plant_col)).strip() for r in rows if r.get(plant_col)}
        profile["plants"] = len(plants)

    return profile


def build_summary(filename: str, columns: list[str], roles: dict[str, str],
                  profile: dict, row_count: int) -> str:
    """Natural-language summary injected into the planning goal/context."""
    parts = [f"Uploaded dataset '{filename}' with {row_count:,} rows and columns: {', '.join(columns[:12])}."]
    facts = []
    if profile.get("unique_skus"):
        facts.append(f"{profile['unique_skus']:,} unique SKUs")
    if profile.get("plants"):
        facts.append(f"{profile['plants']} plants/sites")
    if profile.get("total_demand") is not None:
        facts.append(f"total demand {profile['total_demand']:,.0f}")
    if profile.get("total_inventory") is not None:
        facts.append(f"total inventory {profile['total_inventory']:,.0f}")
    if profile.get("date_min"):
        facts.append(f"period {profile['date_min']}–{profile['date_max']}")
    if facts:
        parts.append("Profile: " + ", ".join(facts) + ".")
    parts.append("Plan using these figures where relevant.")
    return " ".join(parts)


def public_record(rec: dict) -> dict:
    """Strip the bulky internal _rows field for API responses."""
    return {k: v for k, v in rec.items() if not k.startswith("_")}
