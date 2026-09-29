from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel
from app.models.enums import DeliveryStatus, VehicleType


class DeliveryStatusUpdateRequest(BaseModel):
    status: DeliveryStatus
    proof_image_url: Optional[str] = None
    notes: Optional[str] = None


class DeliveryResponse(BaseModel):
    id: uuid.UUID
    donation_id: uuid.UUID
    request_id: uuid.UUID
    ngo_id: uuid.UUID
    driver_id: Optional[uuid.UUID] = None

    status: DeliveryStatus
    food_title: str
    food_type: str
    servings: int
    quantity_kg: float

    # Route locations
    pickup_address: str
    pickup_lat: float
    pickup_lng: float

    drop_organization: str
    drop_address: str

    # Timestamps
    pickup_time: Optional[datetime] = None
    delivered_time: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True