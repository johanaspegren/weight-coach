import csv
import io
import json
import sqlite3
import zipfile
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response

from ..db import connect

router = APIRouter(prefix="/data", tags=["data"])

EXPORT_VERSION = 1
EXPORT_TABLES = [
    "daily",
    "oura_raw",
    "garmin_raw",
    "meal_templates",
    "meals",
    "checkins",
    "coach_notes",
    "workouts",
]

IMPORT_TABLES = EXPORT_TABLES


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _table_info(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return conn.execute(f"PRAGMA table_info({table})").fetchall()


def _table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r["name"] for r in _table_info(conn, table)]


def _primary_key(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r["name"] for r in _table_info(conn, table) if r["pk"]]


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _export_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    tables = {}
    for table in EXPORT_TABLES:
        columns = _table_columns(conn, table)
        rows = conn.execute(
            f"SELECT * FROM {_quote_ident(table)} ORDER BY rowid"
        ).fetchall()
        tables[table] = {
            "columns": columns,
            "primary_key": _primary_key(conn, table),
            "rows": [dict(r) for r in rows],
        }

    return {
        "app": "weight-coach",
        "export_version": EXPORT_VERSION,
        "created_at": _utc_now(),
        "tables": tables,
    }


@router.get("/export.json")
def export_json():
    with connect() as c:
        payload = _export_payload(c)

    filename = f"weight-coach-export-{datetime.now(timezone.utc).date()}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.csv.zip")
def export_csv_zip():
    with connect() as c:
        payload = _export_payload(c)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "app": payload["app"],
                    "export_version": payload["export_version"],
                    "created_at": payload["created_at"],
                    "tables": {
                        name: {
                            "columns": table["columns"],
                            "primary_key": table["primary_key"],
                            "rows": len(table["rows"]),
                        }
                        for name, table in payload["tables"].items()
                    },
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
        for name, table in payload["tables"].items():
            text = io.StringIO()
            writer = csv.DictWriter(text, fieldnames=table["columns"])
            writer.writeheader()
            writer.writerows(table["rows"])
            zf.writestr(f"{name}.csv", text.getvalue())

    filename = f"weight-coach-export-{datetime.now(timezone.utc).date()}.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("app") != "weight-coach":
        raise HTTPException(status_code=400, detail="Not a weight-coach export")
    tables = payload.get("tables")
    if not isinstance(tables, dict):
        raise HTTPException(status_code=400, detail="Export is missing tables")
    return tables


def _insert_row(
    conn: sqlite3.Connection,
    table: str,
    row: dict[str, Any],
    current_columns: set[str],
    pk_columns: list[str],
) -> None:
    cols = [c for c in row.keys() if c in current_columns]
    if not cols:
        return

    quoted_cols = ", ".join(_quote_ident(c) for c in cols)
    placeholders = ", ".join("?" for _ in cols)
    values = [row[c] for c in cols]

    if pk_columns and all(pk in cols for pk in pk_columns):
        conflict_cols = ", ".join(_quote_ident(c) for c in pk_columns)
        update_cols = [c for c in cols if c not in pk_columns]
        if update_cols:
            updates = ", ".join(
                f"{_quote_ident(c)} = excluded.{_quote_ident(c)}" for c in update_cols
            )
            sql = (
                f"INSERT INTO {_quote_ident(table)} ({quoted_cols}) "
                f"VALUES ({placeholders}) "
                f"ON CONFLICT ({conflict_cols}) DO UPDATE SET {updates}"
            )
        else:
            sql = (
                f"INSERT INTO {_quote_ident(table)} ({quoted_cols}) "
                f"VALUES ({placeholders}) "
                f"ON CONFLICT ({conflict_cols}) DO NOTHING"
            )
    else:
        sql = (
            f"INSERT INTO {_quote_ident(table)} ({quoted_cols}) "
            f"VALUES ({placeholders})"
        )

    conn.execute(sql, values)


@router.post("/import")
def import_json(
    payload: dict[str, Any],
    mode: str = Query(default="merge", pattern="^(merge|replace)$"),
):
    tables = _validate_payload(payload)
    summary = {
        "mode": mode,
        "imported": {},
        "ignored_tables": [],
        "ignored_columns": {},
    }

    with connect() as c:
        c.execute("BEGIN")
        try:
            known_tables = set(EXPORT_TABLES)
            if mode == "replace":
                for table in [
                    "meals",
                    "workouts",
                    "meal_templates",
                    "daily",
                    "oura_raw",
                    "checkins",
                    "coach_notes",
                ]:
                    c.execute(f"DELETE FROM {_quote_ident(table)}")

            for table in sorted(set(tables) - known_tables):
                summary["ignored_tables"].append(table)

            for table in IMPORT_TABLES:
                if table not in tables:
                    continue
                table_payload = tables[table]
                rows = table_payload.get("rows", [])
                if not isinstance(rows, list):
                    raise HTTPException(
                        status_code=400,
                        detail=f"{table} rows must be a list",
                    )

                current_columns = set(_table_columns(c, table))
                exported_columns = set(table_payload.get("columns", []))
                ignored = sorted(exported_columns - current_columns)
                if ignored:
                    summary["ignored_columns"][table] = ignored

                count = 0
                pk_columns = _primary_key(c, table)
                for row in rows:
                    if not isinstance(row, dict):
                        raise HTTPException(
                            status_code=400,
                            detail=f"{table} contains a non-object row",
                        )
                    try:
                        _insert_row(c, table, row, current_columns, pk_columns)
                    except sqlite3.DatabaseError as e:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Import failed in {table} row {count + 1}: {e}",
                        ) from e
                    count += 1
                summary["imported"][table] = count

            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise

    return {"ok": True, **summary}
