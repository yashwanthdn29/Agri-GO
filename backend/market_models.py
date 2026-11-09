from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, DateTime, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class MarketPrice(Base):
    __tablename__ = "market_prices"
    __table_args__ = (
        UniqueConstraint("source_record_id", name="uq_market_prices_source_record"),
        Index("ix_market_prices_commodity_date", "commodity", "arrival_date"),
        Index("ix_market_prices_state_district", "state", "district"),
        Index("ix_market_prices_market_date", "market", "arrival_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    commodity: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    district: Mapped[str] = mapped_column(String(120), nullable=False)
    market: Mapped[str] = mapped_column(String(160), nullable=False)
    variety: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    arrival_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    min_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    max_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    modal_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    representative_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    unit: Mapped[str] = mapped_column(String(40), nullable=False, default="Rs/quintal")
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(64), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
