import csv
import re
from io import BytesIO, StringIO

from openpyxl import load_workbook


REQUIRED_FIELDS = {
    "transaction_reference",
    "amount",
    "status",
    "payment_date",
    "customer_identifier",
    "provider",
}

COLUMN_MAPPINGS = {
    "transaction_reference": {
        "transaction reference",
        "reference",
        "ref",
        "transaction ref",
        "transaction id",
        "payment reference",
        "provider reference",
    },
    "amount": {
        "amount",
        "amount paid",
        "paid amount",
        "transaction amount",
        "value",
    },
    "status": {
        "status",
        "payment status",
        "transaction status",
        "result",
    },
    "payment_date": {
        "payment date",
        "date",
        "transaction date",
        "paid at",
        "created at",
        "time",
    },
    "customer_identifier": {
        "customer identifier",
        "customer",
        "email",
        "customer email",
        "phone",
        "customer phone",
        "payer",
        "account name",
    },
    "provider": {
        "provider",
        "payment provider",
        "gateway",
        "channel",
        "source",
    },
}


def normalize_column_name(column_name: str) -> str:
    cleaned = str(column_name or "").strip().lower()
    cleaned = cleaned.replace("_", " ").replace("-", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def get_file_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def read_csv_rows(content: bytes):
    decoded_content = content.decode("utf-8-sig")
    reader = csv.DictReader(StringIO(decoded_content))
    detected_columns = reader.fieldnames or []
    return detected_columns, list(reader)


def read_xlsx_rows(content: bytes):
    workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))

    if not rows:
        return [], []

    detected_columns = [str(value).strip() if value is not None else "" for value in rows[0]]
    data_rows = []

    for row_values in rows[1:]:
        row = {}
        for index, column in enumerate(detected_columns):
            row[column] = row_values[index] if index < len(row_values) else None
        data_rows.append(row)

    return detected_columns, data_rows


def map_columns(detected_columns):
    mapped_columns = {}

    for original_column in detected_columns:
        normalized = normalize_column_name(original_column)

        for internal_field, variations in COLUMN_MAPPINGS.items():
            if normalized in variations:
                mapped_columns[original_column] = internal_field
                break

    return mapped_columns


def parse_smart_transaction_file(filename: str, content: bytes, provider_fallback: str | None = None):
    extension = get_file_extension(filename)

    if extension == "xls":
        return {
            "message": "Old Excel .xls files are not supported yet. Please upload CSV or .xlsx.",
            "imported": 0,
            "rejected": 0,
            "detected_file_type": "xls",
            "detected_columns": [],
            "mapped_columns": {},
            "missing_required_fields": list(REQUIRED_FIELDS),
            "rejected_rows": [],
            "valid_rows": [],
        }

    if extension in {"pdf", "png", "jpg", "jpeg"}:
        return {
            "message": "PDF/image import is coming soon. Please upload CSV or Excel for now.",
            "imported": 0,
            "rejected": 0,
            "detected_file_type": extension,
            "detected_columns": [],
            "mapped_columns": {},
            "missing_required_fields": list(REQUIRED_FIELDS),
            "rejected_rows": [],
            "valid_rows": [],
        }

    if extension == "csv":
        detected_columns, raw_rows = read_csv_rows(content)
    elif extension == "xlsx":
        detected_columns, raw_rows = read_xlsx_rows(content)
    else:
        return {
            "message": "Unsupported file type. Please upload CSV or .xlsx.",
            "imported": 0,
            "rejected": 0,
            "detected_file_type": extension or "unknown",
            "detected_columns": [],
            "mapped_columns": {},
            "missing_required_fields": list(REQUIRED_FIELDS),
            "rejected_rows": [],
            "valid_rows": [],
        }

    mapped_columns = map_columns(detected_columns)
    mapped_fields = set(mapped_columns.values())

    if "provider" not in mapped_fields and provider_fallback:
        mapped_fields.add("provider")

    missing_required_fields = sorted(REQUIRED_FIELDS - mapped_fields)

    valid_rows = []
    rejected_rows = []

    for index, raw_row in enumerate(raw_rows, start=2):
        normalized_row = {}

        for original_column, internal_field in mapped_columns.items():
            value = raw_row.get(original_column)
            normalized_row[internal_field] = str(value).strip() if value is not None else ""

        if not normalized_row.get("provider") and provider_fallback:
            normalized_row["provider"] = provider_fallback

        row_errors = []

        for required_field in REQUIRED_FIELDS:
            if not normalized_row.get(required_field):
                row_errors.append(f"Missing {required_field}")

        if normalized_row.get("amount"):
            try:
                normalized_row["amount"] = float(normalized_row["amount"])
            except ValueError:
                row_errors.append("Invalid amount")

        if row_errors:
            rejected_rows.append({
                "row": index,
                "reason": "; ".join(row_errors),
            })
            continue

        valid_rows.append(normalized_row)

    return {
        "message": "Smart import completed.",
        "imported": len(valid_rows),
        "rejected": len(rejected_rows),
        "detected_file_type": extension,
        "detected_columns": detected_columns,
        "mapped_columns": mapped_columns,
        "missing_required_fields": missing_required_fields,
        "rejected_rows": rejected_rows,
        "valid_rows": valid_rows,
    }


def parse_transaction_csv(file_content: str):
    result = parse_smart_transaction_file("transactions.csv", file_content.encode("utf-8"))

    errors = [
        f"Row {row['row']}: {row['reason']}"
        for row in result["rejected_rows"]
    ]

    if result["missing_required_fields"]:
        errors.insert(
            0,
            f"Missing columns: {', '.join(result['missing_required_fields'])}"
        )

    return result["valid_rows"], errors
