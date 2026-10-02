from datetime import datetime, timezone
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape

from app.db.session import get_db
from app.models.user import User
from app.models.donation import Donation
from app.models.request import DonationRequest
from app.models.delivery import Delivery
from app.models.enums import UserRole, DeliveryStatus, RequestStatus, DonationStatus
from app.schemas.delivery import DeliveryResponse, DeliveryStatusUpdateRequest
from app.api.deps import get_current_user, RoleChecker

router = APIRouter()


def serialize_delivery(d: Delivery) -> DeliveryResponse:
    """Helper formatting delivery entity into client response with route coordinates."""
    pickup_point = to_shape(d.donation.pickup_location)
    
    drop_lat = 12.9784
    drop_lng = 77.6408
    if d.ngo and d.ngo.location:
        ngo_point = to_shape(d.ngo.location)
        drop_lat = ngo_point.y
        drop_lng = ngo_point.x

    return DeliveryResponse(
        id=d.id,
        donation_id=d.donation_id,
        request_id=d.request_id,
        ngo_id=d.ngo_id,
        driver_id=d.driver_id,
        status=d.status,
        food_title=d.donation.title,
        food_type=d.donation.food_type,
        servings=d.request.servings_requested,
        quantity_kg=d.donation.quantity_kg,
        pickup_address=d.donation.pickup_address,
        pickup_lat=pickup_point.y,
        pickup_lng=pickup_point.x,
        drop_organization=d.ngo.organization_name,
        drop_address=d.ngo.address,
        drop_lat=drop_lat,
        drop_lng=drop_lng,
        pickup_time=d.pickup_time,
        delivered_time=d.delivered_time,
        created_at=d.created_at
    )

# ==========================================
# 1. STATIC PATH ROUTES (MUST COME FIRST!)
# ==========================================

@router.post("/dispatch/{request_id}", response_model=DeliveryResponse, status_code=status.HTTP_201_CREATED, summary="Dispatch Delivery for Claimed Food")
def dispatch_delivery(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DONOR, UserRole.NGO, UserRole.ADMIN]))
):
    claim = db.query(DonationRequest).filter(DonationRequest.id == request_id).first()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donation claim not found")

    existing = db.query(Delivery).filter(Delivery.request_id == request_id).first()
    if existing:
        return serialize_delivery(existing)

    claim.status = RequestStatus.APPROVED
    claim.donation.status = DonationStatus.ACCEPTED

    new_delivery = Delivery(
        donation_id=claim.donation_id,
        request_id=claim.id,
        ngo_id=claim.ngo_id,
        status=DeliveryStatus.ASSIGNMENT_PENDING
    )
    db.add(new_delivery)
    db.commit()
    db.refresh(new_delivery)
    return serialize_delivery(new_delivery)


@router.get("/available", response_model=List[DeliveryResponse], summary="List Deliveries Waiting for Drivers")
def list_available_deliveries(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))
):
    deliveries = (
        db.query(Delivery)
        .filter(Delivery.status == DeliveryStatus.ASSIGNMENT_PENDING)
        .order_by(Delivery.created_at.asc())
        .all()
    )
    return [serialize_delivery(d) for d in deliveries]


@router.get("/my-active", response_model=Optional[DeliveryResponse], summary="Get Driver's Current Active Task")
def get_my_active_delivery(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))
):
    driver_profile = current_user.driver_profile
    if not driver_profile:
        return None

    delivery = (
        db.query(Delivery)
        .filter(
            Delivery.driver_id == driver_profile.id,
            Delivery.status.in_([DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.ON_THE_WAY])
        )
        .first()
    )
    if not delivery:
        return None
    return serialize_delivery(delivery)


@router.get("/my-history", response_model=List[DeliveryResponse], summary="Get Driver's Delivery History")
def get_my_delivery_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))
):
    driver_profile = current_user.driver_profile
    if not driver_profile:
        return []

    deliveries = (
        db.query(Delivery)
        .filter(
            Delivery.driver_id == driver_profile.id,
            Delivery.status.in_([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED])
        )
        .order_by(Delivery.updated_at.desc())
        .all()
    )
    return [serialize_delivery(d) for d in deliveries]


# ==========================================
# 2. PARAMETERIZED ROUTES (COME AFTER STATIC ROUTES!)
# ==========================================

@router.get("/{id}", response_model=DeliveryResponse, summary="Get Delivery by ID")
def get_delivery_by_id(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    delivery = db.query(Delivery).filter(Delivery.id == id).first()
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery task not found")
    return serialize_delivery(delivery)


@router.post("/{id}/accept", response_model=DeliveryResponse, summary="Accept Delivery Task")
def accept_delivery(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))
):
    driver_profile = current_user.driver_profile
    if not driver_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Driver profile not found")

    # Check if driver already has an active, incomplete run
    active_run = (
        db.query(Delivery)
        .filter(
            Delivery.driver_id == driver_profile.id,
            Delivery.status.in_([DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.ON_THE_WAY])
        )
        .first()
    )
    if active_run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an active rescue run in progress. Please complete it first!"
        )

    delivery = db.query(Delivery).filter(Delivery.id == id).first()
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery task not found")

    if delivery.status != DeliveryStatus.ASSIGNMENT_PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This task is not available (Status: {delivery.status.value})."
        )

    delivery.driver_id = driver_profile.id
    delivery.status = DeliveryStatus.ACCEPTED
    db.commit()
    db.refresh(delivery)

    return serialize_delivery(delivery)


@router.patch("/{id}/status", response_model=DeliveryResponse, summary="Update Delivery Status")
def update_delivery_status(
    id: uuid.UUID,
    data: DeliveryStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))
):
    driver_profile = current_user.driver_profile
    delivery = db.query(Delivery).filter(Delivery.id == id).first()
    if not delivery:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")

    if delivery.driver_id != driver_profile.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this delivery")

    valid_transitions = {
        DeliveryStatus.ACCEPTED: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED],
        DeliveryStatus.PICKED_UP: [DeliveryStatus.ON_THE_WAY, DeliveryStatus.CANCELLED],
        DeliveryStatus.ON_THE_WAY: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED],
    }

    allowed_next = valid_transitions.get(delivery.status, [])
    if data.status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {delivery.status.value} to {data.status.value}"
        )

    delivery.status = data.status
    if data.status == DeliveryStatus.PICKED_UP:
        delivery.pickup_time = datetime.now(timezone.utc)
        delivery.donation.status = DonationStatus.PICKED_UP
    elif data.status == DeliveryStatus.ON_THE_WAY:
        delivery.donation.status = DonationStatus.ON_THE_WAY
    elif data.status == DeliveryStatus.DELIVERED:
        delivery.delivered_time = datetime.now(timezone.utc)
        delivery.donation.status = DonationStatus.DELIVERED
        delivery.proof_image_url = data.proof_image_url

    if data.notes:
        delivery.notes = data.notes

    db.commit()
    db.refresh(delivery)
    return serialize_delivery(delivery)