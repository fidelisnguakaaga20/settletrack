from pathlib import Path

from app.services.csv_import import parse_smart_transaction_file

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_parse_valid_pdf_statement():
    content = (FIXTURES_DIR / "sample-bolt-statement.pdf").read_bytes()

    result = parse_smart_transaction_file("statement.pdf", content, provider_fallback="Bolt")

    assert result["message"] == "File processed successfully."
    assert result["imported"] == 7
    assert result["rejected"] == 0
    assert result["detected_file_type"] == "pdf"

    references = {row["transaction_reference"] for row in result["valid_rows"]}
    assert references == {f"BOLT-100{i}" for i in range(1, 8)}

    failed_rows = [row for row in result["valid_rows"] if row["status"] == "failed"]
    assert len(failed_rows) == 2


def test_reject_scanned_pdf_with_no_text():
    content = (FIXTURES_DIR / "blank-scanned-page.pdf").read_bytes()

    result = parse_smart_transaction_file("scan.pdf", content)

    assert result["imported"] == 0
    assert "scanned image" in result["message"]


def test_reject_pdf_with_text_but_no_table():
    content = (FIXTURES_DIR / "prose-only.pdf").read_bytes()

    result = parse_smart_transaction_file("letter.pdf", content)

    assert result["imported"] == 0
    assert result["message"] == "We could not read this file clearly."
