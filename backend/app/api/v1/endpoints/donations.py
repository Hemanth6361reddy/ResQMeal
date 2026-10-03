from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape
import redis.asyncio as aioredis

from app.db.session import get_db, SessionLocal
from app.models.user import User
from app.models.donation import Donation
from app.models.enums import UserRole, DonationStatus
from app.schemas.donation import (
    DonationCreateRequest,
    DonationUpdateRequest,
    DonationResponse
)
from app.api.deps import get_current_user, RoleChecker
from app.core.redis import get_redis

router = APIRouter()


def serialize_donation(donation: Donation) -> DonationResponse:
    """Helper converting PostGIS Point to latitude & longitude floats for JSON response."""
    point = to_shape(donation.pickup_location)

    return DonationResponse(
        id=donation.id,
        donor_id=donation.donor_id,
        title=donation.title,
        food_type=donation.food_type,
        description=donation.description,
        quantity_kg=donation.quantity_kg,
        servings=donation.servings,
        pickup_address=donation.pickup_address,
        latitude=point.y,
        longitude=point.x,
        available_from=donation.available_from,
        expires_at=donation.expires_at,
        status=donation.status,
        image_url=donation.image_url,
        created_at=donation.created_at
    )


def cleanup_expired_donations_background():
    """
    Background task running asynchronously out-of-band
    to expire past-deadline food donations.
    """
    db = SessionLocal()

    try:
        now = datetime.now(timezone.utc)

        expired_count = (
            db.query(Donation)
            .filter(
                Donation.status == DonationStatus.AVAILABLE,
                Donation.expires_at < now
            )
            .update(
                {Donation.status: DonationStatus.EXPIRED}
            )
        )

        if expired_count > 0:
            db.commit()
            print(
                f"[Background Task] Cleaned up "
                f"{expired_count} expired donations."
            )

    except Exception as e:
        print(f"[Background Task Error]: {e}")

    finally:
        db.close()


@router.post(
    "",
    response_model=DonationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Food Donation"
)
async def create_donation(
    data: DonationCreateRequest,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(RoleChecker([UserRole.DONOR]))
):
    """
    Creates a new food rescue donation listing with PostGIS coordinates.
    Restricted to verified DONOR role accounts.

    Also invalidates nearby Redis caches so that the new
    donation appears immediately in nearby searches.
    """

    donor_profile = current_user.donor_profile

    if not donor_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor profile missing. Please complete registration profile."
        )

    # Convert coordinates into PostGIS WKT Point:
    # POINT(longitude latitude)
    pickup_point = WKTElement(
        f"POINT({data.longitude} {data.latitude})",
        srid=4326
    )

    new_donation = Donation(
        donor_id=donor_profile.id,
        title=data.title,
        food_type=data.food_type,
        description=data.description,
        quantity_kg=data.quantity_kg,
        servings=data.servings,
        pickup_address=data.pickup_address,
        pickup_location=pickup_point,
        available_from=data.available_from,
        expires_at=data.expires_at,
        status=DonationStatus.AVAILABLE,
        image_url=data.image_url
    )

    db.add(new_donation)
    db.commit()
    db.refresh(new_donation)

    # ---------------------------------------------------------
    # Invalidate nearby search caches
    # ---------------------------------------------------------
    #
    # A new donation can change the result of nearby searches.
    # Remove all cached nearby results so NGOs receive fresh data.
    #

    if redis:
        try:
            keys = await redis.keys("cache:nearby:*")

            if keys:
                await redis.delete(*keys)

        except Exception:
            # Redis failure should not break donation creation.
            pass

    return serialize_donation(new_donation)


@router.get(
    "/my",
    response_model=List[DonationResponse],
    summary="List My Donations"
)
def list_my_donations(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR]))
):
    """
    Returns all donations created by the currently authenticated donor.

    Also schedules a background task to clean up expired donations
    without delaying the API response.
    """

    # Schedule background cleanup without delaying this response
    background_tasks.add_task(
        cleanup_expired_donations_background
    )

    donor_profile = current_user.donor_profile

    if not donor_profile:
        return []

    donations = (
        db.query(Donation)
        .filter(Donation.donor_id == donor_profile.id)
        .order_by(Donation.created_at.desc())
        .all()
    )

    return [serialize_donation(d) for d in donations]


@router.get(
    "/{id}",
    response_model=DonationResponse,
    summary="Get Donation Details"
)
def get_donation(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetches details for a specific donation."""

    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found"
        )

    return serialize_donation(donation)


@router.patch(
    "/{id}",
    response_model=DonationResponse,
    summary="Edit Donation Details"
)
def update_donation(
    id: uuid.UUID,
    data: DonationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR]))
):
    """Allows donor to update food quantity or expiry before pickup."""

    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found"
        )

    if donation.donor_id != current_user.donor_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own donations"
        )

    if donation.status not in [
        DonationStatus.AVAILABLE,
        DonationStatus.REQUESTED
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a donation already picked up or delivered"
        )

    update_dict = data.model_dump(exclude_unset=True)

    for key, value in update_dict.items():
        setattr(donation, key, value)

    db.commit()
    db.refresh(donation)

    return serialize_donation(donation)


@router.delete(
    "/{id}/cancel",
    response_model=DonationResponse,
    summary="Cancel Food Donation"
)
def cancel_donation(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR]))
):
    """Cancels an available food listing."""

    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found"
        )

    if donation.donor_id != current_user.donor_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own donations"
        )

    if donation.status in [
        DonationStatus.PICKED_UP,
        DonationStatus.ON_THE_WAY,
        DonationStatus.DELIVERED
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel a donation already picked up by a driver"
        )

    donation.status = DonationStatus.CANCELLED

    db.commit()
    db.refresh(donation)

    return serialize_donation(donation)