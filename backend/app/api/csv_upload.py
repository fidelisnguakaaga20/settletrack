from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_dependency import get_current_user
from app.services.csv_import import parse_transaction_csv

router = APIRouter(prefix="/csv", tags=["CSV Upload"])


@router.post("/transactions")
async def upload_transactions_csv(
    business_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    business = db.query(Business).filter(
        Business.id == business_id,
        Business.user_id == current_user.id
    ).first()

    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    content = await file.read()
    decoded_content = content.decode("utf-8")

    valid_rows, errors = parse_transaction_csv(decoded_content)

    if errors:
        return {
            "imported": 0,
            "errors": errors
        }

    imported_count = 0
    skipped_errors = []

    for row in valid_rows:
        existing_transaction = db.query(Transaction).filter(
            Transaction.business_id == business_id,
            Transaction.transaction_reference == row["transaction_reference"],
            Transaction.source == "CSV"
        ).first()

        if existing_transaction:
            skipped_errors.append(
                f"Duplicate skipped: {row['transaction_reference']}"
            )
            continue

        transaction = Transaction(
            business_id=business_id,
            provider=row["provider"],
            source="CSV",
            transaction_reference=row["transaction_reference"],
            amount=row["amount"],
            status=row["status"],
            payment_date=datetime.fromisoformat(row["payment_date"]),
            customer_identifier=row.get("customer_identifier"),
            settlement_reference=row.get("settlement_reference") or None
        )

        db.add(transaction)
        imported_count += 1

    db.commit()

    return {
        "imported": imported_count,
        "errors": skipped_errors
    }