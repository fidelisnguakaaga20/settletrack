from app.services.csv_import import parse_transaction_csv


def test_parse_valid_transaction_csv():
    content = """transaction_reference,amount,status,payment_date,customer_identifier,provider,settlement_reference
TXN-1,5000,success,2026-05-24T22:10:00,user@example.com,PAYSTACK,SETTLE-1
"""

    rows, errors = parse_transaction_csv(content)

    assert len(rows) == 1
    assert errors == []


def test_reject_invalid_transaction_csv_missing_columns():
    content = """reference,amount,status
TXN-1,5000,success
"""

    rows, errors = parse_transaction_csv(content)

    assert rows == []
    assert len(errors) == 1
    assert "Missing columns" in errors[0]