from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.provider_connection import ProviderConnection
from app.models.user import User
from app.services.auth_dependency import get_current_user

router = APIRouter(prefix="/paystack", tags=["Paystack"])


class PaystackConnectRequest(BaseModel):
    business_id: int
    secret_key: str = Field(min_length=10)


@router.post("/connect")
def connect_paystack(
    payload: PaystackConnectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    business = db.query(Business).filter(
        Business.id == payload.business_id,
        Business.user_id == current_user.id
    ).first()

    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    connection = ProviderConnection(
        business_id=payload.business_id,
        provider="PAYSTACK",
        encrypted_secret_key=f"dev-encrypted::{payload.secret_key}",
        is_active=True
    )

    db.add(connection)
    db.commit()
    db.refresh(connection)

    return {
        "message": "Paystack connected successfully",
        "connection_id": connection.id
    }


@router.post("/sync")
def sync_paystack_transactions(
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

    connection = db.query(ProviderConnection).filter(
        ProviderConnection.business_id == business_id,
        ProviderConnection.provider == "PAYSTACK",
        ProviderConnection.is_active == True
    ).first()

    if not connection:
        raise HTTPException(status_code=400, detail="Paystack is not connected")

    return {
        "message": "Paystack sync placeholder ready",
        "business_id": business_id,
        "provider": "PAYSTACK"
    }