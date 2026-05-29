from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.core.config import settings
from app.db.database import check_database_connection
from app.api.business import router as business_router
from app.api.transactions import router as transactions_router
from app.api.me import router as me_router
from app.api.csv_upload import router as csv_upload_router
from app.api.reconciliation import router as reconciliation_router
from app.api.mismatch_detection import router as mismatch_router
from app.api.dashboard import router as dashboard_router
from app.api.export import router as export_router
from app.api.paystack import router as paystack_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(me_router)
app.include_router(business_router)
app.include_router(transactions_router)
app.include_router(csv_upload_router)
app.include_router(reconciliation_router)
app.include_router(mismatch_router)
app.include_router(dashboard_router)
app.include_router(export_router)
app.include_router(paystack_router)

@app.get("/health")
def health_check():
    database_ok = check_database_connection()

    return {
        "status": "ok",
        "service": settings.app_name,
        "database": database_ok
    }