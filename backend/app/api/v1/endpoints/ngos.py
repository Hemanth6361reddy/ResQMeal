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
    DeliveryStatus
)
from app.schemas.request import (
    NearbyDonationResponse,
    DonationClaimRequest,
    DonationClaimResponse,
    MyClaimWithDonationResponse
)
from app.api.deps import RoleChecker
from app.core.redis import get_redis

router = APIRouter()


@router.get(
    "/nearby",
    response_model=List[NearbyDonationResponse],
    summary="Find Nearby Donations (PostGIS Spatial Query)"
)
async def get_nearby_donations(
    response: Response,
    latitude: float = Query(
        ...,
        ge=-90.0,
        le=90.0,
        example=12.9716
    ),
    longitude: float = Query(
        ...,
        ge=-180.0,
        le=180.0,
        example=77.5946
    ),
    radius_km: float = Query(
        15.0,
        ge=1.0,
        le=100.0,
        description="Search radius in kilometers"
    ),
    food_type: Optional[str] = Query(
        None,
        description="Optional category filter"
    ),
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(
        RoleChecker([UserRole.NGO])
    )
):
    """
    Geospatial PostGIS Query with Redis caching.

    Cache MISS:
    Runs the PostGIS spatial query and stores the result
    in Redis for 60 seconds.

    Cache HIT:
    Returns the cached result from Redis.
    """

    # ---------------------------------------------------------
    # 1. Create Redis cache key
    # ---------------------------------------------------------

    cache_key = (
        f"cache:nearby:"
        f"{round(latitude, 4)}:"
        f"{round(longitude, 4)}:"
        f"{radius_km}:"
        f"{food_type or 'all'}"
    )

    # ---------------------------------------------------------
    # 2. Check Redis Cache
    # ---------------------------------------------------------

    if redis:
        try:
            cached_data = await redis.get(cache_key)

            if cached_data:
                response.headers["X-Cache"] = "HIT"

                return json.loads(cached_data)

        except Exception:
            # Redis failure should not break the main API.
            pass

    # ---------------------------------------------------------
    # 3. Cache MISS - Execute PostGIS Query
    # ---------------------------------------------------------

    ngo_point = func.ST_SetSRID(
        func.ST_MakePoint(longitude, latitude),
        4326
    )

    distance_in_meters = func.ST_Distance(
        cast(Donation.pickup_location, Geography),
        cast(ngo_point, Geography)
    )

    query = (
        db.query(
            Donation,
            (distance_in_meters / 1000.0).label("distance_km")
        )
        .filter(
            Donation.status == DonationStatus.AVAILABLE,
            Donation.expires_at > datetime.now(timezone.utc),
            func.ST_DWithin(
                cast(Donation.pickup_location, Geography),
                cast(ngo_point, Geography),
                radius_km * 1000.0
            )
        )
    )

    if food_type:
        query = query.filter(
            Donation.food_type == food_type
        )

    results = query.order_by("distance_km").all()

    # ---------------------------------------------------------
    # 4. Build response output
    # ---------------------------------------------------------

    output = []

    for donation, dist_km in results:
        point = to_shape(donation.pickup_location)

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
                "expires_at": donation.expires_at.isoformat(),
                "status": donation.status.value,
                "created_at": donation.created_at.isoformat()
            }
        )

    # ---------------------------------------------------------
    # 5. Store result in Redis for 60 seconds
    # ---------------------------------------------------------

    if redis:
        try:
            await redis.setex(
                cache_key,
                60,
                json.dumps(output)
            )
        except Exception:
            # Redis failure should not break the main API.
            pass

    # ---------------------------------------------------------
    # 6. Mark response as Cache MISS
    # ---------------------------------------------------------

    response.headers["X-Cache"] = "MISS"

    return output


@router.post(
    "/donations/{id}/request",
    response_model=DonationClaimResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Claim/Request Food Donation"
)
async def request_donation(
    id: uuid.UUID,
    data: DonationClaimRequest,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(
        RoleChecker([UserRole.NGO])
    )
):
    """
    Allows a verified NGO to place a request for an available
    food donation.

    Transitions donation status to ACCEPTED and automatically
    dispatches a delivery task to the driver queue.

    Also invalidates nearby Redis caches so that NGOs don't
    receive stale information about already-claimed food.
    """

    # ---------------------------------------------------------
    # 1. Get NGO profile
    # ---------------------------------------------------------

    ngo_profile = current_user.ngo_profile

    if not ngo_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NGO profile not found"
        )

    # ---------------------------------------------------------
    # 2. Find donation
    # ---------------------------------------------------------

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

    # ---------------------------------------------------------
    # 3. Check donation availability
    # ---------------------------------------------------------

    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"This food is no longer available. "
                f"Current status: {donation.status.value}"
            )
        )

    # ---------------------------------------------------------
    # 4. Check expiration
    # ---------------------------------------------------------

    if donation.expires_at < datetime.now(timezone.utc):
        donation.status = DonationStatus.EXPIRED

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This donation has expired"
        )

    # ---------------------------------------------------------
    # 5. Create the request claim
    # ---------------------------------------------------------

    claim = DonationRequest(
        donation_id=donation.id,
        ngo_id=ngo_profile.id,
        servings_requested=min(
            data.servings_requested,
            donation.servings
        ),
        status=RequestStatus.APPROVED,
        notes=data.notes
    )

    # ---------------------------------------------------------
    # 6. Mark donation as accepted
    # ---------------------------------------------------------

    donation.status = DonationStatus.ACCEPTED

    db.add(claim)

    # ---------------------------------------------------------
    # 7. Generate claim ID
    # ---------------------------------------------------------

    db.flush()

    # ---------------------------------------------------------
    # 8. Automatically dispatch to delivery queue
    # ---------------------------------------------------------

    new_delivery = Delivery(
        donation_id=donation.id,
        request_id=claim.id,
        ngo_id=ngo_profile.id,
        status=DeliveryStatus.ASSIGNMENT_PENDING
    )

    db.add(new_delivery)

    # ---------------------------------------------------------
    # 9. Save claim + delivery
    # ---------------------------------------------------------

    db.commit()

    db.refresh(claim)

    # ---------------------------------------------------------
    # 10. Invalidate nearby search caches
    # ---------------------------------------------------------

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
    summary="List My Claimed Donations"
)
def list_my_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        RoleChecker([UserRole.NGO])
    )
):
    """
    Returns all food donation claims placed by this NGO
    along with their active delivery ID.
    """

    ngo_profile = current_user.ngo_profile

    if not ngo_profile:
        return []

    claims = (
        db.query(DonationRequest)
        .filter(
            DonationRequest.ngo_id == ngo_profile.id
        )
        .order_by(
            DonationRequest.created_at.desc()
        )
        .all()
    )

    output = []

    for c in claims:
        # Find the delivery attached to this claim
        delivery = (
            db.query(Delivery)
            .filter(
                Delivery.request_id == c.id
            )
            .first()
        )

        output.append(
            MyClaimWithDonationResponse(
                claim_id=c.id,
                donation_id=c.donation.id,
                delivery_id=delivery.id if delivery else None,
                title=c.donation.title,
                food_type=c.donation.food_type,
                servings=c.donation.servings,
                servings_requested=c.servings_requested,
                pickup_address=c.donation.pickup_address,
                claim_status=c.status,
                donation_status=c.donation.status,
                expires_at=c.donation.expires_at,
                created_at=c.created_at
            )
        )

    return output