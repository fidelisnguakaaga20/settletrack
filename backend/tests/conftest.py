import os

# Must run before any `app.*` module is imported anywhere in the test session,
# since app.db.database creates its engine once at import time from this value.
os.environ["DATABASE_URL"] = "sqlite:///./test-session.db"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from app.db.database import Base, engine

    Base.metadata.drop_all(bind=engine)

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
