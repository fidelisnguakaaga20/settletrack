import logging

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

logger = logging.getLogger("settletrack.migrations")

# Base.metadata.create_all() only creates missing tables, never adds columns
# to tables that already exist. These statements backfill columns added to
# models after their tables were first created. Each runs in its own
# transaction. SQLite and Postgres phrase "column already exists" errors
# differently, so that specific case is detected by message and skipped;
# any other failure is logged loudly and re-raised, since a swallowed
# migration error leaves the app running against a broken schema.
MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMP",
    "ALTER TABLE transactions ADD COLUMN import_batch_id VARCHAR",
    "ALTER TABLE transactions ADD COLUMN source_filename VARCHAR",
]

ALREADY_EXISTS_MARKERS = ("already exists", "duplicate column")


def run_migrations(engine):
    for statement in MIGRATIONS:
        try:
            with engine.begin() as conn:
                conn.execute(text(statement))
        except (OperationalError, ProgrammingError) as error:
            message = str(error).lower()
            if any(marker in message for marker in ALREADY_EXISTS_MARKERS):
                continue
            logger.error("Migration failed: %s\n%s", statement, error)
            raise
