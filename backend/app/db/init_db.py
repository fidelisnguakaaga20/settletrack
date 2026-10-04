from app.db.database import Base, engine
from app.db.migrations import run_migrations
from app.models import (
    AuditLog,
    Business,
    Feedback,
    PasswordResetToken,
    ProviderConnection,
    ReconciliationResult,
    ReconciliationRun,
    Settlement,
    Transaction,
    UpgradeInterest,
    User,
)


def init_db():
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully.")