from pydantic import BaseModel, EmailStr, Field


class BusinessCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    category: str | None = None
    location: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None