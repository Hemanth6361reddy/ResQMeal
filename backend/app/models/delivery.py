import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin
from app.models.enums import DeliveryStatus


class Delivery(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "deliveries"

    donation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("donation_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    ngo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ngo_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Driver assignment (nullable until a driver accepts)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("delivery_partner_profiles.id", ondelete="SET NULL"), nullable=True, index=True)

    status: Mapped[DeliveryStatus] = mapped_column(SQLEnum(DeliveryStatus), default=DeliveryStatus.ASSIGNMENT_PENDING, nullable=False, index=True)
    pickup_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    donation: Mapped["Donation"] = relationship("Donation")
    request: Mapped["DonationRequest"] = relationship("DonationRequest")
    ngo: Mapped["NGOProfile"] = relationship("NGOProfile")
    driver: Mapped[Optional["DeliveryPartnerProfile"]] = relationship("DeliveryPartnerProfile")