from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.feedback import Feedback
from app.models.upgrade_interest import UpgradeInterest
from app.models.user import User
from app.schemas.feedback import FeedbackCreate
from app.services.auth_dependency import get_current_user

router = APIRouter(tags=["Feedback"])


@router.post("/feedback")
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    feedback = Feedback(
        user_id=current_user.id,
        message=payload.message,
        rating=payload.rating,
        contact_email=payload.contact_email,
    )

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return {"message": "Thank you for your feedback.", "feedback_id": feedback.id}


@router.post("/upgrade-interest")
def submit_upgrade_interest(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    interest = UpgradeInterest(user_id=current_user.id)

    db.add(interest)
    db.commit()
    db.refresh(interest)

    return {"message": "Thanks — we'll be in touch about upgrading.", "interest_id": interest.id}
