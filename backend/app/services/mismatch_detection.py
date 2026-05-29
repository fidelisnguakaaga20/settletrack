def detect_mismatches(reconciliation_results):
    mismatches = []

    for result in reconciliation_results:
        if result["result_type"] != "MATCHED":
            mismatches.append({
                "csv_transaction_id": result["csv_transaction_id"],
                "provider_transaction_id": result["provider_transaction_id"],
                "mismatch_type": result["result_type"],
                "reason": result["reason"]
            })

    return mismatches