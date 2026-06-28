from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth_dependency import get_current_user
from app.services.csv_import import parse_smart_transaction_file

router = APIRouter(prefix="/csv", tags=["CSV Upload"])


@router.post("/transactions")
async def upload_transactions_csv(
    business_id: int = Form(...),
    provider: str | None = Form(None),
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

    content = await file.read()

    import_result = parse_smart_transaction_file(
        filename=file.filename or "",
        content=content,
        provider_fallback=provider,
    )

    valid_rows = import_result.pop("valid_rows", [])

    if import_result["message"] != "File processed successfully.":
        return import_result

    imported_count = 0
    rejected_rows = list(import_result["rejected_rows"])

    for row in valid_rows:
        existing_transaction = db.query(Transaction).filter(
            Transaction.business_id == business_id,
            Transaction.transaction_reference == row["transaction_reference"],
            Transaction.source == "Smart Import"
        ).first()

        if existing_transaction:
            rejected_rows.append({
                "row": None,
                "reason": f"Duplicate skipped: {row['transaction_reference']}",
            })
            continue

        try:
            payment_date = datetime.fromisoformat(row["payment_date"])
        except ValueError:
            rejected_rows.append({
                "row": None,
                "reason": f"Invalid date: {row['payment_date']}",
            })
            continue

        transaction = Transaction(
            business_id=business_id,
            provider=row["provider"],
            source="Smart Import",
            transaction_reference=row["transaction_reference"],
            amount=row["amount"],
            status=row["status"],
            payment_date=payment_date,
            customer_identifier=row.get("customer_identifier"),
            settlement_reference=row.get("settlement_reference") or None
        )

        db.add(transaction)
        imported_count += 1

    db.commit()

    import_result["imported"] = imported_count
    import_result["rejected"] = len(rejected_rows)
    import_result["total_rejected_rows"] = len(rejected_rows)
    import_result["rejected_rows"] = rejected_rows

    return import_result
