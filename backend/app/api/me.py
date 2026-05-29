from fastapi import APIRouter, Depends

from app.models.user import User
from app.services.auth_dependency import get_current_user

router = APIRouter(prefix="/me", tags=["Me"])


@router.get("")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email
    }