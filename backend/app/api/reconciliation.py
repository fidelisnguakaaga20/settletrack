from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_dependency import get_current_user
from app.services.matching import match_transactions
from app.services.mismatch_detection import detect_mismatches

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])


@router.post("/run")
def run_reconciliation(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    business = db.query(Business).filter(
        Business.id == business_id,
        Business.user_id == current_user.id
    ).first()

    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    csv_transactions = db.query(Transaction).filter(
        Transaction.business_id == business_id,
        Transaction.source == "CSV"
    ).all()

    provider_transactions = db.query(Transaction).filter(
        Transaction.business_id == business_id,
        Transaction.source == "PAYSTACK"
    ).all()

    results = match_transactions(csv_transactions, provider_transactions)

    mismatches = detect_mismatches(results)

    return {
        "business_id": business_id,
        "results": results,
        "mismatches": mismatches
    }