from pydantic import BaseModel, EmailStr, Field, field_validator


class BusinessCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    category: str | None = None
    location: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None

    @field_validator("category", "location", "contact_email", "contact_phone", mode="before")
    @classmethod
    def blank_string_to_none(cls, value):
        # An empty string from an optional form field is not a valid EmailStr
        # and shouldn't be treated differently from the field being omitted.
        if isinstance(value, str) and not value.strip():
            return None
        return value