from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.user import User
from app.schemas.business import BusinessCreateRequest
from app.services.auth_dependency import get_current_user

router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.post("")
def create_business(
    payload: BusinessCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    business = Business(
        user_id=current_user.id,
        name=payload.name,
        category=payload.category,
        location=payload.location,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone
    )

    db.add(business)
    db.commit()
    db.refresh(business)

    return {
        "message": "Business created successfully",
        "business_id": business.id
    }

@router.get("/my")
def get_my_businesses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    businesses = db.query(Business).filter(
        Business.user_id == current_user.id
    ).all()

    return businesses