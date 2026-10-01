from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, Field
from app.models.enums import RequestStatus, DonationStatus


class NearbyDonationResponse(BaseModel):
    id: uuid.UUID
    donor_id: uuid.UUID
    title: str
    food_type: str
    description: Optional[str] = None
    quantity_kg: float
    servings: int
    pickup_address: str
    latitude: float
    longitude: float
    distance_km: float  # Computed by PostGIS!
    expires_at: datetime
    status: DonationStatus
    created_at: datetime


class DonationClaimRequest(BaseModel):
    servings_requested: int = Field(..., gt=0, example=30)
    notes: Optional[str] = Field(
        None,
        example="We will distribute this to the children's shelter by 7 PM."
    )


class DonationClaimResponse(BaseModel):
    id: uuid.UUID
    donation_id: uuid.UUID
    ngo_id: uuid.UUID
    servings_requested: int
    status: RequestStatus
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MyClaimWithDonationResponse(BaseModel):
    claim_id: uuid.UUID
    donation_id: uuid.UUID
    delivery_id: Optional[uuid.UUID] = None
    title: str
    food_type: str
    servings: int
    servings_requested: int
    pickup_address: str
    claim_status: RequestStatus
    donation_status: DonationStatus
    expires_at: datetime
    created_at: datetime