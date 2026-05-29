from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import TransactionCreateRequest
from app.services.auth_dependency import get_current_user

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.post("")
def create_transaction(
    payload: TransactionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    business = db.query(Business).filter(
        Business.id == payload.business_id,
        Business.user_id == current_user.id
    ).first()

    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    transaction = Transaction(**payload.model_dump())

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return {
        "message": "Transaction created successfully",
        "transaction_id": transaction.id
    }


@router.get("")
def get_transactions(
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

    return db.query(Transaction).filter(
        Transaction.business_id == business_id
    ).all()