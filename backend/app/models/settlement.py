from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.sql import func

from app.db.database import Base


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)

    provider = Column(String, nullable=False, index=True)
    settlement_reference = Column(String, nullable=False, index=True)
    settlement_status = Column(String, nullable=False, index=True)
    settlement_date = Column(DateTime(timezone=True), nullable=True)

    gross_amount = Column(Numeric(12, 2), nullable=True)
    provider_fee = Column(Numeric(12, 2), nullable=True)
    net_amount = Column(Numeric(12, 2), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
