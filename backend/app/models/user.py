import uuid
from typing import Optional
from sqlalchemy import String, Boolean, Enum as SQLEnum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.db.base import Base, UUIDMixin, TimestampMixin
from app.models.enums import UserRole, VehicleType


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 1:1 Profile Relationships
    donor_profile: Mapped[Optional["DonorProfile"]] = relationship("DonorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    ngo_profile: Mapped[Optional["NGOProfile"]] = relationship("NGOProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    driver_profile: Mapped[Optional["DeliveryPartnerProfile"]] = relationship("DeliveryPartnerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class DonorProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "donor_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    
    # PostGIS Point for donor location (Longitude, Latitude)
    location: Mapped[Optional[str]] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="donor_profile")
    donations: Mapped[list["Donation"]] = relationship("Donation", back_populates="donor", cascade="all, delete-orphan")


class NGOProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ngo_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    registration_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    capacity_meals_per_day: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # PostGIS Point for NGO location (Longitude, Latitude)
    location: Mapped[Optional[str]] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="ngo_profile")


class DeliveryPartnerProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "delivery_partner_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    vehicle_type: Mapped[VehicleType] = mapped_column(SQLEnum(VehicleType), default=VehicleType.MOTORBIKE, nullable=False)
    license_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # PostGIS Point for live driver GPS location
    current_location: Mapped[Optional[str]] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="driver_profile")