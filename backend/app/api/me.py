from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.models.user import User
from app.services.auth_dependency import get_current_user

router = APIRouter(prefix="/me", tags=["Me"])

TRIAL_LENGTH_DAYS = 14


@router.get("")
def get_me(current_user: User = Depends(get_current_user)):
    trial_started_at = current_user.trial_started_at

    if trial_started_at is not None:
        if trial_started_at.tzinfo is None:
            trial_started_at = trial_started_at.replace(tzinfo=timezone.utc)

        elapsed_days = (datetime.now(timezone.utc) - trial_started_at).days
        trial_days_remaining = max(TRIAL_LENGTH_DAYS - elapsed_days, 0)
    else:
        trial_days_remaining = TRIAL_LENGTH_DAYS

    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "trial_days_remaining": trial_days_remaining,
        "trial_expired": trial_days_remaining <= 0,
    }
