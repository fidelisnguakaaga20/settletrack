from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)

    provider = Column(String, nullable=False, index=True)
    source = Column(String, nullable=False)  # CSV or PAYSTACK
    transaction_reference = Column(String, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(String, nullable=False, index=True)
    payment_date = Column(DateTime(timezone=True), nullable=False)
    customer_identifier = Column(String, nullable=True, index=True)
    settlement_reference = Column(String, nullable=True, index=True)
    raw_payload = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
