from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

# Base.metadata.create_all() only creates missing tables, never adds columns
# to tables that already exist. These statements backfill columns added to
# models after their tables were first created. Each runs in its own
# transaction and swallows "column already exists" errors, since SQLite and
# Postgres don't share a portable ADD COLUMN IF NOT EXISTS syntax.
MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMP",
]


def run_migrations(engine):
    for statement in MIGRATIONS:
        try:
            with engine.begin() as conn:
                conn.execute(text(statement))
        except (OperationalError, ProgrammingError):
            pass
