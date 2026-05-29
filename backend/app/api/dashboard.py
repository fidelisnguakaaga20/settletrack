from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_dependency import get_current_user
from app.services.matching import match_transactions
from app.services.mismatch_detection import detect_mismatches

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def dashboard_summary(
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

    transactions = db.query(Transaction).filter(
        Transaction.business_id == business_id
    ).all()

    total_payments = len(transactions)
    successful_payments = [txn for txn in transactions if txn.status == "success"]
    failed_payments = [txn for txn in transactions if txn.status == "failed"]

    total_amount = sum(float(txn.amount) for txn in successful_payments)
    failed_count = len(failed_payments)

    csv_transactions = [
        txn for txn in transactions if txn.source == "CSV"
    ]

    provider_transactions = [
        txn for txn in transactions if txn.source == "PAYSTACK"
    ]

    reconciliation_results = match_transactions(
        csv_transactions,
        provider_transactions
    )

    mismatches = detect_mismatches(reconciliation_results)

    return {
        "business_id": business_id,
        "total_payments": total_payments,
        "mismatch_count": len(mismatches),
        "successful_payments": len(successful_payments),
        "failed_payments": failed_count,
        "total_successful_amount": total_amount
    }