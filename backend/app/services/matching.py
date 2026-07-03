from collections import Counter, defaultdict


def get_transaction_reference(transaction):
    return getattr(transaction, "transaction_reference", None)


def get_transaction_status(transaction):
    return str(getattr(transaction, "status", "") or "").strip().lower()


def build_result(
    csv_transaction_id,
    provider_transaction_id,
    result_type,
    reason,
    transaction_reference=None,
):
    return {
        "csv_transaction_id": csv_transaction_id,
        "provider_transaction_id": provider_transaction_id,
        "transaction_reference": transaction_reference,
        "result_type": result_type,
        "reason": reason,
    }


def match_transactions(csv_transactions, provider_transactions):
    results = []

    csv_reference_counts = Counter(
        get_transaction_reference(transaction)
        for transaction in csv_transactions
        if get_transaction_reference(transaction)
    )

    provider_groups = defaultdict(list)

    for provider_txn in provider_transactions:
        provider_groups[get_transaction_reference(provider_txn)].append(provider_txn)

    for csv_txn in csv_transactions:
        reference = get_transaction_reference(csv_txn)
        status = get_transaction_status(csv_txn)

        if reference and csv_reference_counts[reference] > 1:
            results.append(
                build_result(
                    csv_transaction_id=csv_txn.id,
                    provider_transaction_id=None,
                    transaction_reference=reference,
                    result_type="DUPLICATE_REFERENCE",
                    reason=f"Duplicate transaction reference found: {reference}",
                )
            )
            continue

        if status in {"failed", "fail"}:
            results.append(
                build_result(
                    csv_transaction_id=csv_txn.id,
                    provider_transaction_id=None,
                    transaction_reference=reference,
                    result_type="FAILED_PAYMENT",
                    reason=f"Failed payment found: {reference}",
                )
            )
            continue

        matching_providers = provider_groups.get(reference, [])

        if len(matching_providers) > 1:
            results.append(
                build_result(
                    csv_transaction_id=csv_txn.id,
                    provider_transaction_id=None,
                    transaction_reference=reference,
                    result_type="DUPLICATE_REFERENCE",
                    reason=f"Duplicate transaction reference found: {reference}",
                )
            )
            continue

        if not matching_providers:
            if provider_transactions:
                results.append(
                    build_result(
                        csv_transaction_id=csv_txn.id,
                        provider_transaction_id=None,
                        transaction_reference=reference,
                        result_type="UNMATCHED",
                        reason="No provider transaction found with same reference",
                    )
                )
            continue

        provider_txn = matching_providers[0]

        if csv_txn.amount != provider_txn.amount:
            results.append(
                build_result(
                    csv_transaction_id=csv_txn.id,
                    provider_transaction_id=provider_txn.id,
                    transaction_reference=reference,
                    result_type="AMOUNT_MISMATCH",
                    reason="Transaction reference matched but amount differs",
                )
            )
            continue

        results.append(
            build_result(
                csv_transaction_id=csv_txn.id,
                provider_transaction_id=provider_txn.id,
                transaction_reference=reference,
                result_type="MATCHED",
                reason="Reference and amount matched",
            )
        )

    return results
