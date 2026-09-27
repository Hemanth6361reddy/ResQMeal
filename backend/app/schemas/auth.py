from typing import Optional
import uuid
from pydantic import BaseModel, EmailStr, Field
from app.models.enums import UserRole, VehicleType


# ==========================================
# Registration Schemas
# ==========================================
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    role: UserRole
    phone: Optional[str] = None

    # Role-Specific Profile Information
    organization_name: Optional[str] = Field(None, description="Required for DONOR and NGO")
    address: Optional[str] = Field(None, description="Required for DONOR and NGO")
    contact_person: Optional[str] = None  # DONOR
    registration_number: Optional[str] = None  # NGO
    capacity_meals_per_day: Optional[int] = 100  # NGO

    # DELIVERY_PARTNER
    vehicle_type: Optional[VehicleType] = VehicleType.MOTORBIKE
    license_number: Optional[str] = None


# ==========================================
# Login & Token Schemas
# ==========================================
class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: uuid.UUID


# ==========================================
# User Output Schemas
# ==========================================
class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: UserRole
    phone: Optional[str] = None
    is_active: bool
    is_verified: bool

    # Profile summary
    organization_name: Optional[str] = None
    address: Optional[str] = None
    vehicle_type: Optional[VehicleType] = None

    class Config:
        from_attributes = True