import uuid
from typing import Optional
from sqlalchemy import String, Integer, Text, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, UUIDMixin, TimestampMixin
from app.models.enums import RequestStatus


class DonationRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "donation_requests"

    donation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="CASCADE"), nullable=False, index=True)
    ngo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ngo_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    servings_requested: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RequestStatus] = mapped_column(SQLEnum(RequestStatus), default=RequestStatus.PENDING, nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    donation: Mapped["Donation"] = relationship("Donation")
    ngo: Mapped["NGOProfile"] = relationship("NGOProfile")