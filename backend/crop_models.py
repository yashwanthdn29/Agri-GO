from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Crop(Base):
    __tablename__ = "crops"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True
    )

    farmer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )

    crop_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    area_cultivated: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    season: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="growing"
    )