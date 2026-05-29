from fastapi import APIRouter, Body

from app.services.mismatch_detection import detect_mismatches

router = APIRouter(prefix="/mismatches", tags=["Mismatch Detection"])


@router.post("/detect")
def detect(
    reconciliation_results: list = Body(...)
):
    return {
        "mismatches": detect_mismatches(reconciliation_results)
    }