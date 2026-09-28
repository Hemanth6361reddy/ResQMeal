from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, Field
from app.models.enums import DonationStatus


class DonationCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200, example="50 Fresh Veg Thali Meals")
    food_type: str = Field(..., example="Cooked Meals", description="Cooked Meals, Bakery, Groceries, Produce")
    description: Optional[str] = Field(None, example="Prepared today for lunch, packed in hygienic containers.")
    quantity_kg: float = Field(..., gt=0, example=25.0)
    servings: int = Field(..., gt=0, example=50)
    pickup_address: str = Field(..., min_length=5, example="Grand Palace Hotel, Banquet Hall Gate 2, Bangalore")
    latitude: float = Field(..., ge=-90.0, le=90.0, example=12.9716)
    longitude: float = Field(..., ge=-180.0, le=180.0, example=77.5946)
    available_from: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(..., description="Shelf-life deadline for pickup")
    image_url: Optional[str] = None


class DonationUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    servings: Optional[int] = None
    quantity_kg: Optional[float] = None
    pickup_address: Optional[str] = None
    expires_at: Optional[datetime] = None


class DonationResponse(BaseModel):
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
    available_from: datetime
    expires_at: datetime
    status: DonationStatus
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True