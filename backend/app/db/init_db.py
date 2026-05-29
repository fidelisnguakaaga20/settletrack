from app.db.database import Base, engine
from app.models import (
    AuditLog,
    Business,
    ProviderConnection,
    ReconciliationResult,
    ReconciliationRun,
    Settlement,
    Transaction,
    User,
)


def init_db():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully.")