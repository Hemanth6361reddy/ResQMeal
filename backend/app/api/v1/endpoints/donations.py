
from datetime import datetime, timezone
from typing import List
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape

from app.db.session import get_db, SessionLocal
from app.models.user import User
from app.models.donation import Donation
from app.models.request import DonationRequest
from app.models.enums import UserRole, DonationStatus, RequestStatus
from app.schemas.donation import (
    DonationCreateRequest,
    DonationUpdateRequest,
    DonationResponse,
)
from app.api.deps import get_current_user, RoleChecker
from app.core.redis import get_redis

router = APIRouter()


def serialize_donation(donation: Donation) -> DonationResponse:
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
        created_at=donation.created_at,
    )


def cleanup_expired_donations_background():
    db = SessionLocal()

    try:
        now = datetime.now(timezone.utc)

        count = (
            db.query(Donation)
            .filter(
                Donation.status == DonationStatus.AVAILABLE,
                Donation.expires_at < now,
            )
            .update(
                {Donation.status: DonationStatus.EXPIRED}
            )
        )

        db.commit()

        if count:
            print(f"Expired {count} donations.")

    except Exception as exc:
        db.rollback()
        print(f"Donation cleanup failed: {exc}")

    finally:
        db.close()


@router.post(
    "",
    response_model=DonationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Food Donation",
)
async def create_donation(
    data: DonationCreateRequest,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(RoleChecker([UserRole.DONOR])),
):
    donor = current_user.donor_profile

    if not donor:
        raise HTTPException(
            status_code=400,
            detail="Donor profile not found.",
        )

    donation = Donation(
        donor_id=donor.id,
        title=data.title,
        food_type=data.food_type,
        description=data.description,
        quantity_kg=data.quantity_kg,
        servings=data.servings,
        pickup_address=data.pickup_address,
        pickup_location=WKTElement(
            f"POINT({data.longitude} {data.latitude})",
            srid=4326,
        ),
        available_from=data.available_from,
        expires_at=data.expires_at,
        status=DonationStatus.AVAILABLE,
        image_url=data.image_url,
    )

    db.add(donation)
    db.commit()
    db.refresh(donation)

    if redis:
        try:
            async for key in redis.scan_iter(match="cache:nearby:*"):
                await redis.delete(key)
        except Exception as exc:
            print(f"Redis invalidation failed: {exc}")

    return serialize_donation(donation)


@router.get(
    "/my",
    response_model=List[DonationResponse],
    summary="List My Donations",
)
def list_my_donations(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR])),
):
    background_tasks.add_task(cleanup_expired_donations_background)

    donor = current_user.donor_profile

    if not donor:
        return []

    donations = (
        db.query(Donation)
        .filter(Donation.donor_id == donor.id)
        .order_by(Donation.created_at.desc())
        .all()
    )

    return [serialize_donation(item) for item in donations]


@router.get(
    "/{id}",
    response_model=DonationResponse,
    summary="Get Donation Details",
)
def get_donation(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    donation = db.query(Donation).filter(Donation.id == id).first()

    if not donation:
        raise HTTPException(
            status_code=404,
            detail="Donation not found.",
        )

    return serialize_donation(donation)


@router.patch(
    "/{id}",
    response_model=DonationResponse,
    summary="Edit Donation Details",
)
def update_donation(
    id: uuid.UUID,
    data: DonationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR])),
):
    donation = db.query(Donation).filter(Donation.id == id).first()

    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found.")

    donor = current_user.donor_profile

    if not donor or donation.donor_id != donor.id:
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own donations.",
        )

    if donation.status not in (
        DonationStatus.AVAILABLE,
        DonationStatus.REQUESTED,
    ):
        raise HTTPException(
            status_code=400,
            detail="This donation can no longer be edited.",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(donation, field, value)

    db.commit()
    db.refresh(donation)

    return serialize_donation(donation)


@router.patch(
    "/{id}/cancel",
    response_model=DonationResponse,
    summary="Cancel Food Donation Listing",
)
@router.delete(
    "/{id}/cancel",
    response_model=DonationResponse,
    summary="Cancel Food Donation Listing",
)
async def cancel_donation(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(RoleChecker([UserRole.DONOR])),
):
    # 1. Validate donor profile.
    donor = current_user.donor_profile

    if not donor:
        raise HTTPException(
            status_code=400,
            detail="Donor profile not found.",
        )

    # 2. Find the donation.
    donation = db.query(Donation).filter(Donation.id == id).first()

    if not donation:
        raise HTTPException(
            status_code=404,
            detail="Donation listing not found.",
        )

    # 3. Verify ownership.
    if donation.donor_id != donor.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot cancel another donor's listing.",
        )

    # 4. Allow cancellation only while available.
    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot cancel donation with status "
                f"'{donation.status.value}'. Only AVAILABLE "
                f"donations can be cancelled."
            ),
        )

    # 5. Reject donations with active NGO requests.
    active_request = (
        db.query(DonationRequest.id)
        .filter(
            DonationRequest.donation_id == donation.id,
            DonationRequest.status.in_(
                [RequestStatus.PENDING, RequestStatus.APPROVED]
            ),
        )
        .first()
    )

    if active_request:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot cancel donation because an NGO has "
                "an active request for this food."
            ),
        )

    # 6. Cancel the donation.
    try:
        donation.status = DonationStatus.CANCELLED
        db.commit()
        db.refresh(donation)
    except Exception:
        db.rollback()
        raise

    # 7. Clear nearby-food caches.
    if redis:
        try:
            async for key in redis.scan_iter(match="cache:nearby:*"):
                await redis.delete(key)
        except Exception as exc:
            print(f"Redis invalidation failed: {exc}")

    return serialize_donation(donation)
