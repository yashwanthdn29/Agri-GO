"""add representative market price

Revision ID: 4f28a6bc1d72
Revises: 82a1c9f70d6e
Create Date: 2026-10-08 23:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f28a6bc1d72"
down_revision: Union[str, Sequence[str], None] = "82a1c9f70d6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "market_prices",
        sa.Column("representative_price", sa.Numeric(precision=12, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("market_prices", "representative_price")
