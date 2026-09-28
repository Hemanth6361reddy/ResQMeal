from datetime import datetime, timezone
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, cast
from geoalchemy2 import Geography
from geoalchemy2.shape import to_shape

from app.db.session import get_db
from app.models.user import User
from app.models.donation import Donation
from app.models.request import DonationRequest
from app.models.enums import UserRole, DonationStatus, RequestStatus
from app.schemas.request import NearbyDonationResponse, DonationClaimRequest, DonationClaimResponse, MyClaimWithDonationResponse
from app.api.deps import RoleChecker

router = APIRouter()


@router.get("/nearby", response_model=List[NearbyDonationResponse], summary="Find Nearby Donations (PostGIS Spatial Query)")
def get_nearby_donations(
    latitude: float = Query(..., ge=-90.0, le=90.0, example=12.9716),
    longitude: float = Query(..., ge=-180.0, le=180.0, example=77.5946),
    radius_km: float = Query(15.0, ge=1.0, le=100.0, description="Search radius in kilometers"),
    food_type: Optional[str] = Query(None, description="Optional category filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.NGO]))
):
    """
    Geospatial PostGIS Query:
    1. Casts coordinates to Geography to account for Earth's curvature.
    2. Uses ST_DWithin with spatial index to filter within radius_km.
    3. Uses ST_Distance to compute exact distance in meters.
    4. Sorts results from closest to furthest.
    """
    # Create the reference point for the NGO
    ngo_point = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)

    # PostGIS distance expression in meters, converted to kilometers
    distance_in_meters = func.ST_Distance(
        cast(Donation.pickup_location, Geography),
        cast(ngo_point, Geography)
    )

    query = (
        db.query(Donation, (distance_in_meters / 1000.0).label("distance_km"))
        .filter(
            Donation.status == DonationStatus.AVAILABLE,
            Donation.expires_at > datetime.now(timezone.utc),
            func.ST_DWithin(
                cast(Donation.pickup_location, Geography),
                cast(ngo_point, Geography),
                radius_km * 1000.0  # Convert km to meters
            )
        )
    )

    if food_type:
        query = query.filter(Donation.food_type == food_type)

    results = query.order_by("distance_km").all()

    output = []
    for donation, dist_km in results:
        point = to_shape(donation.pickup_location)
        output.append(
            NearbyDonationResponse(
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
                distance_km=round(dist_km, 2),
                expires_at=donation.expires_at,
                status=donation.status,
                created_at=donation.created_at
            )
        )
    return output


@router.post("/donations/{id}/request", response_model=DonationClaimResponse, status_code=status.HTTP_201_CREATED, summary="Claim/Request Food Donation")
def request_donation(
    id: uuid.UUID,
    data: DonationClaimRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.NGO]))
):
    """
    Allows a verified NGO to place a request for an available food donation.
    Transitions donation status to REQUESTED.
    """
    ngo_profile = current_user.ngo_profile
    if not ngo_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="NGO profile not found")

    donation = db.query(Donation).filter(Donation.id == id).first()
    if not donation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donation not found")

    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This food is no longer available. Current status: {donation.status.value}"
        )

    if donation.expires_at < datetime.now(timezone.utc):
        donation.status = DonationStatus.EXPIRED
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This donation has expired")

    # Create the request record
    claim = DonationRequest(
        donation_id=donation.id,
        ngo_id=ngo_profile.id,
        servings_requested=min(data.servings_requested, donation.servings),
        status=RequestStatus.PENDING,
        notes=data.notes
    )
    # Transition donation status
    donation.status = DonationStatus.REQUESTED

    db.add(claim)
    db.commit()
    db.refresh(claim)

    return claim


@router.get("/claims/my", response_model=List[MyClaimWithDonationResponse], summary="List My Claimed Donations")
def list_my_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.NGO]))
):
    """Returns all food donation claims placed by this NGO."""
    ngo_profile = current_user.ngo_profile
    if not ngo_profile:
        return []

    claims = (
        db.query(DonationRequest)
        .filter(DonationRequest.ngo_id == ngo_profile.id)
        .order_by(DonationRequest.created_at.desc())
        .all()
    )

    return [
        MyClaimWithDonationResponse(
            claim_id=c.id,
            donation_id=c.donation.id,
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
        for c in claims
    ]