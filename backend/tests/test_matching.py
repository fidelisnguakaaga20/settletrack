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

    provider_transactions = [
        SimpleNamespace(id=2, transaction_reference="TXN-OTHER", amount=5000)
    ]

    results = match_transactions(csv_transactions, provider_transactions)

    assert results[0]["result_type"] == "UNMATCHED"

def test_matching_logic_duplicate_reference_in_imported_transactions():
    csv_transactions = [
        SimpleNamespace(id=1, transaction_reference="TXN001", amount=5000, status="success"),
        SimpleNamespace(id=2, transaction_reference="TXN001", amount=5000, status="success"),
        SimpleNamespace(id=3, transaction_reference="TXN002", amount=7000, status="success"),
    ]

    provider_transactions = []

    results = match_transactions(csv_transactions, provider_transactions)

    duplicate_results = [
        result for result in results
        if result["result_type"] == "DUPLICATE_REFERENCE"
    ]

    assert duplicate_results
    assert duplicate_results[0]["transaction_reference"] == "TXN001"
    assert "Duplicate transaction reference found: TXN001" in duplicate_results[0]["reason"]


def test_matching_logic_failed_payment_in_imported_transactions():
    csv_transactions = [
        SimpleNamespace(id=1, transaction_reference="TXN003", amount=3000, status="failed")
    ]

    provider_transactions = []

    results = match_transactions(csv_transactions, provider_transactions)

    failed_results = [
        result for result in results
        if result["result_type"] == "FAILED_PAYMENT"
    ]

    assert failed_results
    assert failed_results[0]["transaction_reference"] == "TXN003"
    assert "Failed payment found: TXN003" in failed_results[0]["reason"]
