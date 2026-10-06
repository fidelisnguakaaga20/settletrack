from app.schemas.business import BusinessCreateRequest


def test_blank_optional_fields_are_treated_as_none():
    request = BusinessCreateRequest(
        name="My Shop",
        category="",
        location="",
        contact_email="",
        contact_phone="",
    )

    assert request.category is None
    assert request.location is None
    assert request.contact_email is None
    assert request.contact_phone is None


def test_real_contact_email_still_validated():
    request = BusinessCreateRequest(name="My Shop", contact_email="owner@example.com")

    assert request.contact_email == "owner@example.com"


def test_invalid_contact_email_still_rejected():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        BusinessCreateRequest(name="My Shop", contact_email="not-an-email")
