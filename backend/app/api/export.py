import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_dependency import get_current_user
from app.services.matching import match_transactions
from app.services.mismatch_detection import detect_mismatches

router = APIRouter(prefix="/export", tags=["CSV Export"])


@router.get("/transactions")
def export_transactions(
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

    output = StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "id",
        "provider",
        "source",
        "transaction_reference",
        "amount",
        "status",
        "payment_date",
        "customer_identifier",
        "settlement_reference"
    ])

    for txn in transactions:
        writer.writerow([
            txn.id,
            txn.provider,
            txn.source,
            txn.transaction_reference,
            txn.amount,
            txn.status,
            txn.payment_date,
            txn.customer_identifier,
            txn.settlement_reference
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=settletrack-transactions.csv"
        }
    )


@router.get("/mismatches")
def export_mismatches(
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
        Transaction.source.in_(["CSV", "Smart Import"])
    ).all()

    provider_transactions = db.query(Transaction).filter(
        Transaction.business_id == business_id,
        Transaction.source == "PAYSTACK"
    ).all()

    results = match_transactions(csv_transactions, provider_transactions)
    mismatches = detect_mismatches(results)

    transactions_by_id = {txn.id: txn for txn in csv_transactions + provider_transactions}

    output = StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "mismatch_type",
        "reason",
        "transaction_reference",
        "amount",
        "customer_identifier",
        "payment_date",
        "provider",
    ])

    for mismatch in mismatches:
        txn = (
            transactions_by_id.get(mismatch["csv_transaction_id"])
            or transactions_by_id.get(mismatch["provider_transaction_id"])
        )

        writer.writerow([
            mismatch["mismatch_type"],
            mismatch["reason"],
            txn.transaction_reference if txn else "",
            txn.amount if txn else "",
            txn.customer_identifier if txn else "",
            txn.payment_date if txn else "",
            txn.provider if txn else "",
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=settletrack-mismatches.csv"
        }
    )