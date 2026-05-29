from app.services.security import hash_password, verify_password


def test_hash_and_verify_password():
    password = "testpassword123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrongpassword123", hashed) is False