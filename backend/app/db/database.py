from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(
    settings.database_url,
    connect_args=connect_args
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def check_database_connection() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True