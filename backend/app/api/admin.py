from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.business import Business
from app.models.feedback import Feedback
from app.models.transaction import Transaction
from app.models.upgrade_interest import UpgradeInterest
from app.models.user import User
from app.services.auth_dependency import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/overview")
def admin_overview(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    return {
        "total_users": db.query(func.count(User.id)).scalar(),
        "total_businesses": db.query(func.count(Business.id)).scalar(),
        "total_transactions": db.query(func.count(Transaction.id)).scalar(),
        "total_feedback": db.query(func.count(Feedback.id)).scalar(),
        "total_upgrade_interest": db.query(func.count(UpgradeInterest.id)).scalar(),
    }


@router.get("/users")
def admin_list_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    business_counts = dict(
        db.query(Business.user_id, func.count(Business.id))
        .group_by(Business.user_id)
        .all()
    )

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "is_admin": user.is_admin,
            "business_count": business_counts.get(user.id, 0),
            "created_at": user.created_at,
        }
        for user in users
    ]


@router.get("/feedback")
def admin_list_feedback(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    rows = (
        db.query(Feedback, User)
        .join(User, Feedback.user_id == User.id)
        .order_by(Feedback.created_at.desc())
        .all()
    )

    return [
        {
            "id": feedback.id,
            "message": feedback.message,
            "rating": feedback.rating,
            "contact_email": feedback.contact_email or user.email,
            "submitted_by": user.full_name,
            "created_at": feedback.created_at,
        }
        for feedback, user in rows
    ]
