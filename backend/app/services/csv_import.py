import csv
from io import StringIO


REQUIRED_COLUMNS = {
    "transaction_reference",
    "amount",
    "status",
    "payment_date",
    "customer_identifier",
    "provider",
}


def parse_transaction_csv(file_content: str):
    reader = csv.DictReader(StringIO(file_content))
    rows = list(reader)

    if not reader.fieldnames:
        return [], ["CSV file is empty or missing headers"]

    missing_columns = REQUIRED_COLUMNS - set(reader.fieldnames)

    if missing_columns:
        return [], [f"Missing columns: {', '.join(sorted(missing_columns))}"]

    valid_rows = []
    errors = []

    for index, row in enumerate(rows, start=2):
        if not row.get("transaction_reference"):
            errors.append(f"Row {index}: transaction_reference is required")
            continue

        if not row.get("amount"):
            errors.append(f"Row {index}: amount is required")
            continue

        valid_rows.append(row)

    return valid_rows, errors