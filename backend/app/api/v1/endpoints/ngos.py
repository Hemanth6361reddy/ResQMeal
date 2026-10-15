from datetime import datetime, timezone
from typing import List, Optional
import uuid
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func, cast
from geoalchemy2 import Geography
from geoalchemy2.shape import to_shape
import redis.asyncio as aioredis

from app.db.session import get_db
from app.models.user import User
from app.models.donation import Donation
from app.models.request import DonationRequest
from app.models.delivery import Delivery
from app.models.enums import (
    UserRole,
    DonationStatus,
    RequestStatus,
    DeliveryStatus,
)
from app.schemas.request import (
    NearbyDonationResponse,
    DonationClaimRequest,
    DonationClaimResponse,
    MyClaimWithDonationResponse,
)
from app.api.deps import RoleChecker
from app.core.redis import get_redis

router = APIRouter()


@router.get(
    "/nearby",
    response_model=List[NearbyDonationResponse],
    summary="Find Nearby Donations (PostGIS Spatial Query)",
)
async def get_nearby_donations(
    response: Response,
    latitude: float = Query(
        ...,
        ge=-90.0,
        le=90.0,
        example=12.9716,
    ),
    longitude: float = Query(
        ...,
        ge=-180.0,
        le=180.0,
        example=77.5946,
    ),
    radius_km: float = Query(
        15.0,
        ge=1.0,
        le=100.0,
        description="Search radius in kilometers",
    ),
    food_type: Optional[str] = Query(
        None,
        description="Optional category filter",
    ),
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(RoleChecker([UserRole.NGO])),
):
    """
    Geospatial PostGIS query with Redis caching.

    Cache MISS:
        Runs the PostGIS spatial query and stores the result
        in Redis for 60 seconds.

    Cache HIT:
        Returns the cached result from Redis.
    """

    # 1. Create Redis cache key
    cache_key = (
        f"cache:nearby:"
        f"{round(latitude, 4)}:"
        f"{round(longitude, 4)}:"
        f"{radius_km}:"
        f"{food_type or 'all'}"
    )

    # 2. Check Redis cache
    if redis:
        try:
            cached_data = await redis.get(cache_key)

            if cached_data:
                response.headers["X-Cache"] = "HIT"
                return json.loads(cached_data)

        except Exception:
            # Redis failure should not break the main API.
            pass

    # 3. Execute PostGIS query
    ngo_point = func.ST_SetSRID(
        func.ST_MakePoint(longitude, latitude),
        4326,
    )

    distance_in_meters = func.ST_Distance(
        cast(Donation.pickup_location, Geography),
        cast(ngo_point, Geography),
    )

    query = (
        db.query(
            Donation,
            (distance_in_meters / 1000.0).label("distance_km"),
        )
        .filter(
            Donation.status == DonationStatus.AVAILABLE,
            Donation.expires_at > datetime.now(timezone.utc),
            func.ST_DWithin(
                cast(Donation.pickup_location, Geography),
                cast(ngo_point, Geography),
                radius_km * 1000.0,
            ),
        )
    )

    if food_type:
        query = query.filter(Donation.food_type == food_type)

    results = query.order_by("distance_km").all()

    # 4. Build response output with full authoritative timestamp metadata
    output = []

    for donation, dist_km in results:
        point = to_shape(donation.pickup_location)

        # Parse stored media URLs safely.
        media = []
        stored_media = getattr(donation, "media_urls", None)

        if stored_media:
            if isinstance(stored_media, list):
                media = stored_media
            else:
                try:
                    parsed_media = json.loads(stored_media)

                    if isinstance(parsed_media, list):
                        media = parsed_media
                    elif isinstance(parsed_media, str):
                        media = [parsed_media]
                except (json.JSONDecodeError, TypeError):
                    # Support a single URL stored as plain text.
                    media = [stored_media]

        now_utc = datetime.now(timezone.utc)
        created_at_dt = getattr(donation, "created_at", None) or now_utc
        updated_at_dt = getattr(donation, "updated_at", None) or created_at_dt
        published_at_dt = getattr(donation, "available_from", None) or created_at_dt

        output.append(
            {
                "id": str(donation.id),
                "donor_id": str(donation.donor_id),
                "title": donation.title,
                "food_type": donation.food_type,
                "description": donation.description,
                "quantity_kg": donation.quantity_kg,
                "servings": donation.servings,
                "pickup_address": donation.pickup_address,
                "latitude": point.y,
                "longitude": point.x,
                "distance_km": round(float(dist_km), 2),
                "status": donation.status.value,
                "expires_at": donation.expires_at.isoformat(),
                "created_at": created_at_dt.isoformat(),
                "updated_at": updated_at_dt.isoformat(),
                "published_at": published_at_dt.isoformat(),
                "expiresAt": donation.expires_at.isoformat(),
                "createdAt": created_at_dt.isoformat(),
                "updatedAt": updated_at_dt.isoformat(),
                "publishedAt": published_at_dt.isoformat(),
                "media_urls": media,
            }
        )

    # 5. Store result in Redis for 60 seconds
    if redis:
        try:
            await redis.setex(
                cache_key,
                60,
                json.dumps(output),
            )
        except Exception:
            # Redis failure should not break the main API.
            pass

    # 6. Mark response as cache MISS
    response.headers["X-Cache"] = "MISS"

    return output


@router.post(
    "/donations/{id}/request",
    response_model=DonationClaimResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Claim Food Donation (Transactional)",
)
async def request_donation(
    id: uuid.UUID,
    data: DonationClaimRequest,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(RoleChecker([UserRole.NGO])),
):
    """
    Transitions donation status to ACCEPTED and automatically
    provisions a delivery assignment pending driver claim.
    """

    ngo_profile = current_user.ngo_profile

    if not ngo_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NGO profile not found for this account.",
        )

    # 1. Fetch donation with pessimistic lock
    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .with_for_update()
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found.",
        )

    # 2. Check if donation is currently available
    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Donation is no longer available to claim. "
                f"Current status: {donation.status.value}"
            ),
        )

    # 3. Check expiration timestamp
    if donation.expires_at <= datetime.now(timezone.utc):
        donation.status = DonationStatus.EXPIRED
        donation.updated_at = datetime.now(timezone.utc)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donation listing has expired and cannot be requested.",
        )

    # 4. Check requested servings
    if data.servings_requested > donation.servings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot request {data.servings_requested} servings. "
                f"Only {donation.servings} are available."
            ),
        )

    # 5. Create donation request claim
    claim = DonationRequest(
        donation_id=donation.id,
        ngo_id=ngo_profile.id,
        servings_requested=data.servings_requested,
        pickup_window_start=donation.available_from,
        pickup_window_end=donation.expires_at,
        status=RequestStatus.APPROVED,
        notes=data.notes,
    )

    # 6. Mark donation as accepted and stamp updated_at
    donation.status = DonationStatus.ACCEPTED
    donation.updated_at = datetime.now(timezone.utc)
    db.add(claim)

    # 7. Generate claim ID
    db.flush()

    # 8. Automatically dispatch to delivery queue
    new_delivery = Delivery(
        donation_id=donation.id,
        request_id=claim.id,
        ngo_id=ngo_profile.id,
        status=DeliveryStatus.ASSIGNMENT_PENDING,
    )

    db.add(new_delivery)

    # 9. Save claim and delivery
    db.commit()
    db.refresh(claim)

    # 10. Invalidate nearby search caches
    if redis:
        try:
            keys = await redis.keys("cache:nearby:*")

            if keys:
                await redis.delete(*keys)

        except Exception:
            # Redis failure should not break claim creation.
            pass

    return claim


@router.get(
    "/claims/my",
    response_model=List[MyClaimWithDonationResponse],
    summary="List My Claimed Donations",
)
def list_my_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.NGO])),
):
    """
    Returns all food donation claims placed by this NGO,
    along with their active delivery ID and timestamp metadata.
    """

    ngo_profile = current_user.ngo_profile

    if not ngo_profile:
        return []

    claims = (
        db.query(DonationRequest)
        .filter(DonationRequest.ngo_id == ngo_profile.id)
        .order_by(DonationRequest.created_at.desc())
        .all()
    )

    output = []

    for claim in claims:
        # Find the delivery attached to this claim.
        delivery = (
            db.query(Delivery)
            .filter(Delivery.request_id == claim.id)
            .first()
        )

        d_created = getattr(claim.donation, "created_at", claim.created_at)
        d_updated = getattr(claim.donation, "updated_at", d_created)
        d_published = getattr(claim.donation, "available_from", d_created)

        output.append(
            MyClaimWithDonationResponse(
                claim_id=claim.id,
                donation_id=claim.donation.id,
                delivery_id=delivery.id if delivery else None,
                title=claim.donation.title,
                food_type=claim.donation.food_type,
                servings=claim.donation.servings,
                servings_requested=claim.servings_requested,
                pickup_address=claim.donation.pickup_address,
                claim_status=claim.status,
                donation_status=claim.donation.status,
                expires_at=claim.donation.expires_at,
                created_at=d_created,
                updated_at=d_updated,
                published_at=d_published,
                createdAt=d_created,
                updatedAt=d_updated,
                publishedAt=d_published,
                expiresAt=claim.donation.expires_at,
            )
        )

    return output