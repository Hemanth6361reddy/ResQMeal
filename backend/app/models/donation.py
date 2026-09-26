import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, Enum as SQLEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.db.base import Base, UUIDMixin, TimestampMixin
from app.models.enums import DonationStatus


class Donation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "donations"

    donor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("donor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    food_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    servings: Mapped[int] = mapped_column(Integer, nullable=False)
    
    pickup_address: Mapped[str] = mapped_column(String(500), nullable=False)
    # PostGIS Point for pickup coordinates (Longitude, Latitude)
    pickup_location: Mapped[str] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)

    available_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[DonationStatus] = mapped_column(SQLEnum(DonationStatus), default=DonationStatus.AVAILABLE, nullable=False, index=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Relationship back to donor
    donor: Mapped["DonorProfile"] = relationship("DonorProfile", back_populates="donations")