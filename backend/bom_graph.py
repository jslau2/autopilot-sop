from __future__ import annotations

"""
Neo4j BOM graph client for the Shimano APAC S&OP system.

Governed exclusively by the Master Data agent (see agents/agent_defs.py). This is
a LIVE-only data source — demo mode never touches it. Only the `BOM` node label and
its `PARENT_OF`/`CHILD_OF` structure are used; the `Lot` and `ProcessInfo` domains
in the same database are intentionally ignored.

Graph schema (as deployed):
    (:BOM {Material, MaterialDesc, MaterialType})-[:PARENT_OF {Quantity}]->(:BOM)
    `Material` is the unique key. PARENT_OF goes parent -> child (assembly -> component).

Connection comes from backend/.env (NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD), loaded
via python-dotenv in main.py — same pattern as the Azure creds.

Every public function degrades gracefully: if Neo4j is unconfigured or unreachable it
logs and returns None, so callers can fall back to mock_data.
"""

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# Lazy singleton driver — a missing/unreachable DB must not break imports or demo runs.
_driver: Any = None
_init_failed = False

# Cap explosion/where-used traversal so a pathological cycle can't run away.
_MAX_LEVELS = 10


def _get_driver():
    """Return a connected Neo4j driver, or None if unconfigured/unreachable."""
    global _driver, _init_failed
    if _driver is not None:
        return _driver
    if _init_failed:
        return None

    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not uri or not user or not password:
        logger.info("Neo4j not configured (NEO4J_URI/USER/PASSWORD); BOM tools will use mock data.")
        _init_failed = True
        return None

    try:
        from neo4j import GraphDatabase

        drv = GraphDatabase.driver(uri, auth=(user, password))
        drv.verify_connectivity()
        _driver = drv
        logger.info("Connected to Neo4j BOM graph at %s", uri)
        return _driver
    except Exception as exc:  # noqa: BLE001 — any failure means fall back to mock
        logger.warning("Neo4j connection failed (%s); BOM tools will use mock data.", exc)
        _init_failed = True
        return None


def _database() -> str | None:
    """Optional NEO4J_DATABASE; None lets the driver use the server default."""
    return os.environ.get("NEO4J_DATABASE") or None


def _run(query: str, **params) -> list[dict] | None:
    """Run a read query, returning a list of record dicts, or None on any failure."""
    drv = _get_driver()
    if drv is None:
        return None
    try:
        with drv.session(database=_database()) as session:
            return [r.data() for r in session.run(query, **params)]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j query failed (%s); falling back to mock data.", exc)
        return None


def is_available() -> bool:
    """True if the BOM graph is configured and reachable."""
    return _get_driver() is not None


# ---------------------------------------------------------------------------
# Master Data tools
# ---------------------------------------------------------------------------
def validate_bom() -> dict | None:
    """
    Structural data-quality scan of the whole BOM graph. Returns metrics the graph
    can actually compute (orphans, depth, type mix, completeness) — NOT the vendor/
    lead-time/UoM fields the mock emits, which don't exist as properties here.
    """
    rows = _run(
        """
        MATCH (b:BOM)
        WITH count(b) AS total,
             count(DISTINCT b.Material) AS distinct_materials
        CALL () {
            MATCH (o:BOM)
            WHERE NOT (o)-[:PARENT_OF]->() AND NOT (o)-[:CHILD_OF]->()
            RETURN count(o) AS orphans
        }
        CALL () {
            MATCH (r:BOM)
            WHERE (r)-[:PARENT_OF]->() AND NOT (r)-[:CHILD_OF]->()
            RETURN count(r) AS roots
        }
        CALL () {
            MATCH (l:BOM)
            WHERE (l)-[:CHILD_OF]->() AND NOT (l)-[:PARENT_OF]->()
            RETURN count(l) AS leaves
        }
        CALL () {
            MATCH ()-[rel:PARENT_OF]->()
            RETURN count(rel) AS edges
        }
        RETURN total, distinct_materials, orphans, roots, leaves, edges
        """
    )
    if not rows:
        return None
    r = rows[0]
    total = r["total"] or 0
    orphans = r["orphans"] or 0
    completeness = round((1 - orphans / total) * 100, 1) if total else 0.0

    type_rows = _run(
        "MATCH (b:BOM) RETURN b.MaterialType AS material_type, count(*) AS count "
        "ORDER BY count DESC"
    ) or []

    return {
        "source": "Neo4j BOM Graph",
        "total_materials": total,
        "distinct_materials": r["distinct_materials"] or 0,
        "total_bom_links": r["edges"] or 0,
        "root_assemblies": r["roots"] or 0,
        "leaf_components": r["leaves"] or 0,
        "orphaned_components": orphans,
        "bom_completeness_pct": completeness,
        "material_type_distribution": [
            {"material_type": t["material_type"], "count": t["count"]} for t in type_rows
        ],
    }


def explode_bom(material: str, max_levels: int = _MAX_LEVELS) -> dict | None:
    """
    Multi-level component explosion of an assembly. Effective quantity is the product
    of PARENT_OF.Quantity along each path (qty-aware rollup).
    """
    if not material:
        return None
    levels = max(1, min(int(max_levels or _MAX_LEVELS), _MAX_LEVELS))
    # The upper bound of a variable-length pattern can't be parameterised, so it is
    # interpolated from the int-validated `levels` above (no injection surface).
    rows = _run(
        f"""
        MATCH (root:BOM {{Material: $material}})
        OPTIONAL MATCH path = (root)-[rels:PARENT_OF*1..{levels}]->(comp:BOM)
        WITH root, path, comp, rels
        WHERE comp IS NOT NULL
        RETURN comp.Material AS material,
               comp.MaterialDesc AS description,
               comp.MaterialType AS material_type,
               length(path) AS level,
               reduce(q = 1.0, r IN rels | q * toFloat(coalesce(r.Quantity, '1'))) AS effective_qty
        ORDER BY level, material
        """,
        material=material,
    )
    if rows is None:
        return None
    root = _run(
        "MATCH (b:BOM {Material: $material}) "
        "RETURN b.Material AS material, b.MaterialDesc AS description, b.MaterialType AS material_type",
        material=material,
    )
    if not root:
        return {"material": material, "found": False, "components": []}
    return {
        "material": material,
        "found": True,
        "description": root[0]["description"],
        "material_type": root[0]["material_type"],
        "max_levels": levels,
        "component_count": len(rows),
        "max_depth": max((row["level"] for row in rows), default=0),
        "components": [
            {
                "material": row["material"],
                "description": row["description"],
                "material_type": row["material_type"],
                "level": row["level"],
                "effective_qty": round(row["effective_qty"], 4),
            }
            for row in rows
        ],
    }


def where_used(material: str, max_levels: int = _MAX_LEVELS) -> dict | None:
    """Reverse traversal: every assembly that (directly or indirectly) consumes a component."""
    if not material:
        return None
    levels = max(1, min(int(max_levels or _MAX_LEVELS), _MAX_LEVELS))
    rows = _run(
        f"""
        MATCH (comp:BOM {{Material: $material}})
        OPTIONAL MATCH path = (parent:BOM)-[:PARENT_OF*1..{levels}]->(comp)
        WITH comp, path, parent
        WHERE parent IS NOT NULL
        RETURN DISTINCT parent.Material AS material,
               parent.MaterialDesc AS description,
               parent.MaterialType AS material_type,
               min(length(path)) AS level
        ORDER BY level, material
        """,
        material=material,
    )
    if rows is None:
        return None
    return {
        "material": material,
        "used_in_count": len(rows),
        "top_level_assemblies": sum(1 for r in rows if r["material_type"] == "FERT"),
        "parents": [
            {
                "material": r["material"],
                "description": r["description"],
                "material_type": r["material_type"],
                "level": r["level"],
            }
            for r in rows
        ],
    }


def find_orphans(limit: int = 50) -> dict | None:
    """Sample BOM materials with no parent and no child — the master-data integrity backlog."""
    lim = max(1, min(int(limit or 50), 500))
    rows = _run(
        f"""
        MATCH (o:BOM)
        WHERE NOT (o)-[:PARENT_OF]->() AND NOT (o)-[:CHILD_OF]->()
        RETURN o.Material AS material, o.MaterialDesc AS description, o.MaterialType AS material_type
        ORDER BY material
        LIMIT {lim}
        """
    )
    if rows is None:
        return None
    total = _run(
        "MATCH (o:BOM) WHERE NOT (o)-[:PARENT_OF]->() AND NOT (o)-[:CHILD_OF]->() "
        "RETURN count(o) AS c"
    )
    return {
        "orphaned_components": (total[0]["c"] if total else len(rows)),
        "sample_size": len(rows),
        "orphans": rows,
    }


def search_materials(query: str, limit: int = 25) -> dict | None:
    """Lookup BOM materials by code (substring) or description (case-insensitive) for the explorer."""
    q = (query or "").strip()
    if not q:
        return {"query": q, "results": []}
    lim = max(1, min(int(limit or 25), 100))
    rows = _run(
        f"""
        MATCH (b:BOM)
        WHERE b.Material CONTAINS $q OR toLower(b.MaterialDesc) CONTAINS toLower($q)
        RETURN b.Material AS material, b.MaterialDesc AS description, b.MaterialType AS material_type
        ORDER BY b.Material
        LIMIT {lim}
        """,
        q=q,
    )
    if rows is None:
        return None
    return {"query": q, "results": rows}


# Soft cap so a heavily-shared component can't render thousands of nodes into the browser.
_MAX_GRAPH_NODES = 400


def bom_subgraph(material: str, direction: str = "down", max_levels: int = _MAX_LEVELS) -> dict | None:
    """
    Node+edge subgraph around a material for interactive (hierarchical) visualization.
      direction="down" -> explosion (assembly to components, following PARENT_OF)
      direction="up"   -> where-used (component to assemblies, against PARENT_OF)
    Nodes carry level (graph distance from the focus material); edges carry the
    PARENT_OF Quantity. Result is truncated to _MAX_GRAPH_NODES with a `truncated` flag.
    """
    if not material:
        return None
    direction = "up" if str(direction).lower() == "up" else "down"
    levels = max(1, min(int(max_levels or _MAX_LEVELS), _MAX_LEVELS))

    # PARENT_OF goes parent -> child. Down = follow it from the focus; up = follow it into the focus.
    if direction == "down":
        node_pat = f"(focus)-[:PARENT_OF*1..{levels}]->(n:BOM)"
        edge_pat = f"path = (focus)-[:PARENT_OF*1..{levels}]->(:BOM)"
    else:
        node_pat = f"(n:BOM)-[:PARENT_OF*1..{levels}]->(focus)"
        edge_pat = f"path = (:BOM)-[:PARENT_OF*1..{levels}]->(focus)"

    focus = _run(
        "MATCH (b:BOM {Material: $material}) "
        "RETURN b.Material AS material, b.MaterialDesc AS description, b.MaterialType AS material_type",
        material=material,
    )
    if focus is None:
        return None
    if not focus:
        return {"material": material, "direction": direction, "found": False, "nodes": [], "edges": []}

    node_rows = _run(
        f"""
        MATCH (focus:BOM {{Material: $material}})
        OPTIONAL MATCH {node_pat}
        WITH focus, collect(DISTINCT n) AS others
        UNWIND ([focus] + others) AS m
        WITH DISTINCT m
        RETURN m.Material AS material, m.MaterialDesc AS description,
               m.MaterialType AS material_type
        """,
        material=material,
    ) or []

    edge_rows = _run(
        f"""
        MATCH (focus:BOM {{Material: $material}})
        OPTIONAL MATCH {edge_pat}
        WITH [r IN relationships(path) | r] AS rels
        UNWIND rels AS rel
        WITH DISTINCT rel
        RETURN startNode(rel).Material AS source, endNode(rel).Material AS target,
               rel.Quantity AS quantity
        """,
        material=material,
    ) or []

    # Level = BFS distance from the focus along the chosen direction (cheap + correct in Python).
    adj: dict[str, list[str]] = {}
    for e in edge_rows:
        frm, to = (e["source"], e["target"]) if direction == "down" else (e["target"], e["source"])
        adj.setdefault(frm, []).append(to)
    level_by_mat = {material: 0}
    frontier = [material]
    depth = 0
    while frontier:
        depth += 1
        nxt = []
        for m in frontier:
            for child in adj.get(m, []):
                if child not in level_by_mat:
                    level_by_mat[child] = depth
                    nxt.append(child)
        frontier = nxt
    for n in node_rows:
        n["level"] = level_by_mat.get(n["material"], 0)
    node_rows.sort(key=lambda n: (n["level"], n["material"]))

    truncated = len(node_rows) > _MAX_GRAPH_NODES
    if truncated:
        node_rows = node_rows[:_MAX_GRAPH_NODES]
        keep = {n["material"] for n in node_rows}
        edge_rows = [e for e in edge_rows if e["source"] in keep and e["target"] in keep]

    return {
        "material": material,
        "direction": direction,
        "found": True,
        "max_levels": levels,
        "truncated": truncated,
        "node_count": len(node_rows),
        "edge_count": len(edge_rows),
        "focus": focus[0],
        "nodes": node_rows,
        "edges": edge_rows,
    }


# ---------------------------------------------------------------------------
# Read-only ad-hoc Cypher (for NL-driven / conditional queries)
# ---------------------------------------------------------------------------
# Defense in depth: (1) static rejection of any write/DDL/procedure clause, and
# (2) execution inside a Neo4j READ transaction — the server itself refuses a
# write in a read tx, so even a clause that slipped past (1) cannot mutate data.
_MAX_ROWS = 500

# Any of these keywords means the query is not a pure view query.
_WRITE_RE = re.compile(
    r"\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|FOREACH|LOAD\s+CSV|"
    r"GRANT|REVOKE|START|STOP|ALTER|RENAME|ENABLE|DISABLE|USE\s+PERIODIC)\b",
    re.IGNORECASE,
)
# CALL of a named procedure (CALL apoc.*, CALL db.*, …). CALL {…} / CALL (…) read
# subqueries are allowed — any writes inside them are still caught by _WRITE_RE.
_PROC_CALL_RE = re.compile(r"\bCALL\s+[A-Za-z_$]", re.IGNORECASE)


def _strip_literals(q: str) -> str:
    """Remove comments, string literals and backtick identifiers so keyword scans
    can't be fooled by (or trip over) text inside them."""
    q = re.sub(r"//[^\n]*", " ", q)
    q = re.sub(r"/\*.*?\*/", " ", q, flags=re.S)
    q = re.sub(r"'(?:\\.|[^'])*'", "''", q)
    q = re.sub(r'"(?:\\.|[^"])*"', '""', q)
    q = re.sub(r"`[^`]*`", "``", q)
    return q


def validate_read_only(cypher: str) -> tuple[bool, str]:
    """Return (ok, reason). Only single-statement, view-only Cypher passes."""
    if not cypher or not cypher.strip():
        return False, "Empty query."
    stripped = _strip_literals(cypher)
    # No statement stacking (a trailing semicolon is fine).
    if ";" in stripped.rstrip().rstrip(";"):
        return False, "Multiple statements are not allowed — submit one read-only query."
    if _WRITE_RE.search(stripped):
        return False, "Rejected: only read-only queries are allowed (a write/DDL keyword was detected)."
    if _PROC_CALL_RE.search(stripped):
        return False, "Rejected: procedure calls (CALL …) are not allowed."
    if not re.search(r"\bRETURN\b", stripped, re.IGNORECASE):
        return False, "Query must RETURN data (it has to be a read-only view query)."
    return True, ""


def run_cypher(cypher: str, limit: int = _MAX_ROWS) -> dict | None:
    """
    Execute a validated, READ-ONLY Cypher query. Returns tabular rows plus any
    graph entities (nodes/edges) found in the result, shaped for the BOM renderer.
    Returns None if Neo4j is unavailable; an {"error": ...} dict on rejection/failure.
    """
    ok, reason = validate_read_only(cypher)
    if not ok:
        return {"error": reason, "cypher": cypher, "read_only_rejected": True}
    drv = _get_driver()
    if drv is None:
        return None
    cap = max(1, min(int(limit or _MAX_ROWS), _MAX_ROWS))

    try:
        from neo4j.graph import Node, Relationship, Path

        def _work(tx):
            res = tx.run(cypher)
            records = list(res)
            return records, list(res.keys())

        with drv.session(database=_database()) as session:
            # execute_read forces READ access mode → the server rejects writes here.
            records, keys = session.execute_read(_work)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Read-only Cypher failed (%s).", exc)
        return {"error": str(exc), "cypher": cypher}

    node_map: dict[str, dict] = {}
    edge_map: dict[tuple, dict] = {}

    def _add_node(n) -> str:
        props = dict(n)
        key = props.get("Material") or n.element_id
        if key not in node_map:
            node_map[key] = {
                "material": key,
                "description": props.get("MaterialDesc") or "",
                "material_type": props.get("MaterialType") or next(iter(n.labels), ""),
                "level": 0,
            }
        return key

    def _add_rel(r) -> None:
        s, t = _add_node(r.start_node), _add_node(r.end_node)
        if (s, t) not in edge_map:
            edge_map[(s, t)] = {"source": s, "target": t, "quantity": dict(r).get("Quantity")}

    def _scan(v) -> None:
        if isinstance(v, Node):
            _add_node(v)
        elif isinstance(v, Relationship):
            _add_rel(v)
        elif isinstance(v, Path):
            for n in v.nodes:
                _add_node(n)
            for r in v.relationships:
                _add_rel(r)
        elif isinstance(v, (list, tuple)):
            for x in v:
                _scan(x)
        elif isinstance(v, dict):
            for x in v.values():
                _scan(x)

    rows = []
    for rec in records[:cap]:
        rows.append(rec.data())  # nodes/rels flattened to property dicts for the table
        for k in keys:
            _scan(rec[k])

    nodes = list(node_map.values())
    edges = list(edge_map.values())
    truncated = len(nodes) > _MAX_GRAPH_NODES
    if truncated:
        nodes = nodes[:_MAX_GRAPH_NODES]
        keep = {n["material"] for n in nodes}
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

    return {
        "cypher": cypher,
        "columns": keys,
        "row_count": len(records),
        "rows": rows,
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "truncated": truncated or len(records) > cap,
    }
