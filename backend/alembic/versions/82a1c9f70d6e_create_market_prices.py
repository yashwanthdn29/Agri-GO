"""create official market price observations

Revision ID: 82a1c9f70d6e
Revises: 5ba1e4be9182
Create Date: 2026-10-08 22:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "82a1c9f70d6e"
down_revision: Union[str, Sequence[str], None] = "5ba1e4be9182"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "market_prices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("commodity", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=120), nullable=False),
        sa.Column("district", sa.String(length=120), nullable=False),
        sa.Column("market", sa.String(length=160), nullable=False),
        sa.Column("variety", sa.String(length=160), nullable=False),
        sa.Column("arrival_date", sa.Date(), nullable=True),
        sa.Column("min_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("max_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("modal_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("source_record_id", sa.String(length=64), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_record_id", name="uq_market_prices_source_record"
        ),
    )
    op.create_index(
        "ix_market_prices_commodity_date",
        "market_prices",
        ["commodity", "arrival_date"],
    )
    op.create_index(
        "ix_market_prices_state_district",
        "market_prices",
        ["state", "district"],
    )
    op.create_index(
        "ix_market_prices_market_date",
        "market_prices",
        ["market", "arrival_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_market_prices_market_date", table_name="market_prices")
    op.drop_index("ix_market_prices_state_district", table_name="market_prices")
    op.drop_index("ix_market_prices_commodity_date", table_name="market_prices")
    op.drop_table("market_prices")
