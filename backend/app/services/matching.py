from collections import defaultdict


def match_transactions(csv_transactions, provider_transactions):
    results = []

    provider_groups = defaultdict(list)

    for provider_txn in provider_transactions:
        provider_groups[provider_txn.transaction_reference].append(provider_txn)

    for csv_txn in csv_transactions:
        matching_providers = provider_groups.get(csv_txn.transaction_reference, [])

        if len(matching_providers) > 1:
            results.append({
                "csv_transaction_id": csv_txn.id,
                "provider_transaction_id": None,
                "result_type": "DUPLICATE_REFERENCE",
                "reason": "Multiple provider transactions found with same reference"
            })
            continue

        if not matching_providers:
            results.append({
                "csv_transaction_id": csv_txn.id,
                "provider_transaction_id": None,
                "result_type": "UNMATCHED",
                "reason": "No provider transaction found with same reference"
            })
            continue

        provider_txn = matching_providers[0]

        if csv_txn.amount != provider_txn.amount:
            results.append({
                "csv_transaction_id": csv_txn.id,
                "provider_transaction_id": provider_txn.id,
                "result_type": "AMOUNT_MISMATCH",
                "reason": "Transaction reference matched but amount differs"
            })
            continue

        results.append({
            "csv_transaction_id": csv_txn.id,
            "provider_transaction_id": provider_txn.id,
            "result_type": "MATCHED",
            "reason": "Reference and amount matched"
        })

    return results