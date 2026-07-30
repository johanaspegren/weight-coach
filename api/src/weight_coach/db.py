import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS daily (
    date TEXT PRIMARY KEY,
    weight_kg REAL,
    waist_cm REAL,
    kcal_in_est INTEGER,
    kcal_out_est INTEGER,
    deficit_kcal INTEGER,
    notes TEXT,
    scale_json TEXT
);

CREATE TABLE IF NOT EXISTS garmin_raw (
    date TEXT PRIMARY KEY,
    body_battery INTEGER,       -- 0..100 (max of the day)
    sleep_score INTEGER,        -- 0..100
    hrv_ms REAL,                -- last-night HRV, ms
    resting_hr INTEGER,         -- bpm
    stress_avg INTEGER,         -- 0..100
    total_burn INTEGER,         -- kcal
    active_burn INTEGER,        -- kcal
    steps INTEGER,
    workouts_json TEXT,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oura_raw (
    date TEXT PRIMARY KEY,
    readiness INTEGER,
    sleep_score INTEGER,
    hrv_avg REAL,
    total_burn INTEGER,
    active_burn INTEGER,
    workouts_json TEXT,
    stress_high_min INTEGER,
    recovery_high_min INTEGER,
    resilience_level TEXT,
    vo2_max REAL,
    tags_json TEXT,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,           -- 'checkin' | 'manual' | 'template'
    category TEXT,                  -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
    raw_text TEXT,
    parsed_json TEXT,
    kcal INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    food_groups TEXT,               -- comma-separated tags
    template_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES meal_templates(id)
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

CREATE TABLE IF NOT EXISTS meal_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL UNIQUE,     -- normalized food-item key
    display_name TEXT NOT NULL,
    kcal INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    food_groups TEXT,
    day_type TEXT,                       -- 'weekday' | 'weekend' | 'any'
    occurrences INTEGER NOT NULL DEFAULT 1,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
    date TEXT PRIMARY KEY,
    transcript TEXT NOT NULL,
    summary TEXT,
    tomorrow_plan TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_notes (
    week_ending TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    adjustments_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,           -- 'manual' | 'oura'
    kind TEXT NOT NULL,             -- 'x-trainer' | 'run' | 'walk' | 'other'
    duration_min INTEGER,
    kcal_burn INTEGER,
    avg_hr INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def connect():
    path = settings.db_path
    _ensure_parent(path)
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


# Idempotent ADD COLUMN migrations for existing databases. SQLite raises if the
# column already exists — swallow that specific error only.
_COLUMN_MIGRATIONS: list[tuple[str, str, str]] = [
    ("oura_raw", "stress_high_min", "INTEGER"),
    ("oura_raw", "recovery_high_min", "INTEGER"),
    ("oura_raw", "resilience_level", "TEXT"),
    ("oura_raw", "vo2_max", "REAL"),
    ("oura_raw", "tags_json", "TEXT"),
    ("daily", "scale_json", "TEXT"),
]


def _add_missing_columns(conn) -> None:
    for table, col, typ in _COLUMN_MIGRATIONS:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e).lower():
                raise


def migrate() -> None:
    with connect() as c:
        c.executescript(SCHEMA)
        _add_missing_columns(c)


if __name__ == "__main__":
    migrate()
    print(f"Migrated {settings.db_path}")
