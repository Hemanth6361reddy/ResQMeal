from datetime import datetime
from typing import List, Optional
import uuid

from pydantic import BaseModel, Field

from app.models.enums import DonationStatus


class DonationCreateRequest(BaseModel):
    title: str = Field(
        ...,
        min_length=3,
        max_length=200,
        example="50 Fresh Veg Thali Meals",
    )
    food_type: str = Field(
        ...,
        example="Cooked Meals",
        description="Cooked Meals, Bakery, Groceries, Produce",
    )
    description: Optional[str] = Field(
        None,
        example="Prepared today for lunch, packed in hygienic containers.",
    )
    quantity_kg: float = Field(..., gt=0, example=25.0)
    servings: int = Field(..., gt=0, example=50)
    pickup_address: str = Field(
        ...,
        min_length=5,
        example="Grand Palace Hotel, Banquet Hall Gate 2, Bangalore",
    )
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        example=12.9716,
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        example=77.5946,
    )
    available_from: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(
        ...,
        description="Shelf-life deadline for pickup",
    )
    image_url: Optional[str] = None
    media_urls: List[str] = Field(default_factory=list)


class DonationUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    food_type: Optional[str] = None
    description: Optional[str] = None
    servings: Optional[int] = Field(None, gt=0)
    quantity_kg: Optional[float] = Field(None, gt=0)
    pickup_address: Optional[str] = Field(None, min_length=5)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    expires_at: Optional[datetime] = None
    image_url: Optional[str] = None
    media_urls: Optional[List[str]] = None


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
    media_urls: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None

    # CamelCase aliases for frontend compatibility
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    publishedAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None

    class Config:
        from_attributes = True