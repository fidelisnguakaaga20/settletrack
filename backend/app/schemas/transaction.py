from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TransactionCreateRequest(BaseModel):
    business_id: int
    provider: str = Field(min_length=2, max_length=50)
    source: str = Field(min_length=2, max_length=50)
    transaction_reference: str = Field(min_length=2, max_length=150)
    amount: Decimal
    status: str = Field(min_length=2, max_length=50)
    payment_date: datetime
    customer_identifier: str | None = None
    settlement_reference: str | None = None