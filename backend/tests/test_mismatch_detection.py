from app.services.mismatch_detection import detect_mismatches


def test_detect_mismatches():
    reconciliation_results = [
        {
            "csv_transaction_id": 1,
            "provider_transaction_id": None,
            "result_type": "UNMATCHED",
            "reason": "Not found"
        },
        {
            "csv_transaction_id": 2,
            "provider_transaction_id": 4,
            "result_type": "AMOUNT_MISMATCH",
            "reason": "Amount differs"
        },
        {
            "csv_transaction_id": 3,
            "provider_transaction_id": 5,
            "result_type": "MATCHED",
            "reason": "Matched"
        }
    ]

    mismatches = detect_mismatches(reconciliation_results)

    assert len(mismatches) == 2
    assert mismatches[0]["mismatch_type"] == "UNMATCHED"
    assert mismatches[1]["mismatch_type"] == "AMOUNT_MISMATCH"