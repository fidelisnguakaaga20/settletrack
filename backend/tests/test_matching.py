from types import SimpleNamespace

from app.services.matching import match_transactions


def test_matching_logic_matched():
    csv_transactions = [
        SimpleNamespace(id=1, transaction_reference="TXN-1", amount=5000)
    ]

    provider_transactions = [
        SimpleNamespace(id=2, transaction_reference="TXN-1", amount=5000)
    ]

    results = match_transactions(csv_transactions, provider_transactions)

    assert results[0]["result_type"] == "MATCHED"


def test_matching_logic_amount_mismatch():
    csv_transactions = [
        SimpleNamespace(id=1, transaction_reference="TXN-1", amount=5000)
    ]

    provider_transactions = [
        SimpleNamespace(id=2, transaction_reference="TXN-1", amount=7000)
    ]

    results = match_transactions(csv_transactions, provider_transactions)

    assert results[0]["result_type"] == "AMOUNT_MISMATCH"


def test_matching_logic_unmatched():
    csv_transactions = [
        SimpleNamespace(id=1, transaction_reference="TXN-1", amount=5000)
    ]

    provider_transactions = []

    results = match_transactions(csv_transactions, provider_transactions)

    assert results[0]["result_type"] == "UNMATCHED"