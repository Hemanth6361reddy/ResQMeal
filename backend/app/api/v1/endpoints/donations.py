import os
import json
import uuid
from datetime import datetime, timezone
from typing import List

import redis.asyncio as aioredis
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    UploadFile,
    File,
    Request,
)
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape

from app.core.config import UPLOAD_DIR
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


# --------------------------------------------------
# Media upload configuration
# --------------------------------------------------

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
}

ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
}

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_SIZE = 30 * 1024 * 1024

# Map validated MIME types to server-controlled extensions.
MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}


# --------------------------------------------------
# Helper: serialize donation with all 4 timestamps
# --------------------------------------------------

def serialize_donation(donation: Donation) -> DonationResponse:
    point = to_shape(donation.pickup_location)

    media = getattr(donation, "media_urls", None)

    if not media:
        media = []
    elif isinstance(media, str):
        try:
            parsed_media = json.loads(media)
            media = (
                parsed_media
                if isinstance(parsed_media, list)
                else [media]
            )
        except (json.JSONDecodeError, TypeError):
            media = [media]
    elif not isinstance(media, list):
        media = []

    now = datetime.now(timezone.utc)
    created_at = getattr(donation, "created_at", None) or now
    updated_at = getattr(donation, "updated_at", None) or created_at
    published_at = getattr(donation, "available_from", None) or created_at
    expires_at = getattr(donation, "expires_at", None) or now

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
        expires_at=expires_at,
        status=donation.status,
        image_url=donation.image_url,
        media_urls=media,
        created_at=created_at,
        updated_at=updated_at,
        published_at=published_at,
        createdAt=created_at,
        updatedAt=updated_at,
        publishedAt=published_at,
        expiresAt=expires_at,
    )


# --------------------------------------------------
# Background task: expire old donations
# --------------------------------------------------

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


# --------------------------------------------------
# Create donation
# --------------------------------------------------

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
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    ),
):
    donor = current_user.donor_profile

    if not donor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor profile not found.",
        )

    media_urls = data.media_urls or []
    server_now = datetime.now(timezone.utc)

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
        available_from=server_now,  # Authoritative server-side publish timestamp
        expires_at=data.expires_at,
        status=DonationStatus.AVAILABLE,
        image_url=data.image_url,
        media_urls=json.dumps(media_urls) if media_urls else None,
    )

    db.add(donation)
    db.commit()
    db.refresh(donation)

    if redis:
        try:
            async for key in redis.scan_iter(
                match="cache:nearby:*"
            ):
                await redis.delete(key)
        except Exception as exc:
            print(f"Redis invalidation failed: {exc}")

    return serialize_donation(donation)


# --------------------------------------------------
# List current donor's donations
# --------------------------------------------------

@router.get(
    "/my",
    response_model=List[DonationResponse],
    summary="List My Donations",
)
def list_my_donations(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    ),
):
    background_tasks.add_task(
        cleanup_expired_donations_background
    )

    donor = current_user.donor_profile

    if not donor:
        return []

    donations = (
        db.query(Donation)
        .filter(Donation.donor_id == donor.id)
        .order_by(Donation.created_at.desc())
        .all()
    )

    return [
        serialize_donation(item)
        for item in donations
    ]


# --------------------------------------------------
# Get donation details
# --------------------------------------------------

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
    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found.",
        )

    return serialize_donation(donation)


# --------------------------------------------------
# Update donation
# --------------------------------------------------

@router.patch(
    "/{id}",
    response_model=DonationResponse,
    summary="Edit Donation Details",
)
async def update_donation(
    id: uuid.UUID,
    data: DonationUpdateRequest,
    db: Session = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    ),
):
    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found.",
        )

    donor = current_user.donor_profile

    if not donor or donation.donor_id != donor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own donations.",
        )

    # Strictly enforce that only PUBLISHED / AVAILABLE donations can be edited
    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This donation can no longer be edited because it has already been claimed.",
        )

    # Check if an NGO has an active claim or request on this food
    active_claim = (
        db.query(DonationRequest.id)
        .filter(
            DonationRequest.donation_id == donation.id,
            DonationRequest.status.in_(
                [
                    RequestStatus.PENDING,
                    RequestStatus.APPROVED,
                ]
            ),
        )
        .first()
    )

    if active_claim:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This donation can no longer be edited because it has already been claimed.",
        )

    # Update basic fields if provided
    if data.title is not None:
        donation.title = data.title
    if data.food_type is not None:
        donation.food_type = data.food_type
    if data.description is not None:
        donation.description = data.description
    if data.servings is not None:
        donation.servings = data.servings
    if data.quantity_kg is not None:
        donation.quantity_kg = data.quantity_kg
    if data.pickup_address is not None:
        donation.pickup_address = data.pickup_address
    if data.expires_at is not None:
        donation.expires_at = data.expires_at
    if data.image_url is not None:
        donation.image_url = data.image_url

    # Update coordinates / PostGIS geometry if provided
    if data.latitude is not None and data.longitude is not None:
        donation.pickup_location = WKTElement(
            f"POINT({data.longitude} {data.latitude})",
            srid=4326,
        )

    # Update media URLs if provided
    if data.media_urls is not None:
        donation.media_urls = json.dumps(data.media_urls) if data.media_urls else None

    # Authoritative server-side update: update updatedAt timestamp while strictly preserving created_at and available_from
    donation.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(donation)

    # Invalidate Redis cache so NGOs see updated data immediately
    if redis:
        try:
            async for key in redis.scan_iter(
                match="cache:nearby:*"
            ):
                await redis.delete(key)
        except Exception as exc:
            print(f"Redis invalidation failed: {exc}")

    return serialize_donation(donation)


# --------------------------------------------------
# Cancel donation
# --------------------------------------------------

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
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    ),
):
    donor = current_user.donor_profile

    if not donor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor profile not found.",
        )

    donation = (
        db.query(Donation)
        .filter(Donation.id == id)
        .first()
    )

    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation listing not found.",
        )

    if donation.donor_id != donor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot cancel another donor's listing.",
        )

    if donation.status != DonationStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot cancel donation with status "
                f"'{donation.status.value}'. Only AVAILABLE "
                f"donations can be cancelled."
            ),
        )

    active_request = (
        db.query(DonationRequest.id)
        .filter(
            DonationRequest.donation_id == donation.id,
            DonationRequest.status.in_(
                [
                    RequestStatus.PENDING,
                    RequestStatus.APPROVED,
                ]
            ),
        )
        .first()
    )

    if active_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot cancel donation because an NGO has "
                "an active request for this food."
            ),
        )

    try:
        donation.status = DonationStatus.CANCELLED
        donation.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(donation)
    except Exception:
        db.rollback()
        raise

    if redis:
        try:
            async for key in redis.scan_iter(
                match="cache:nearby:*"
            ):
                await redis.delete(key)
        except Exception as exc:
            print(f"Redis invalidation failed: {exc}")

    return serialize_donation(donation)


# --------------------------------------------------
# Upload donation photo or video
# --------------------------------------------------

@router.post(
    "/upload-media",
    summary="Upload Food Photos or Video",
)
async def upload_donation_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    ),
):
    donor = current_user.donor_profile

    if not donor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor profile not found.",
        )

    content_type = (
        (file.content_type or "").lower().strip()
    )

    if (
        content_type not in ALLOWED_IMAGE_TYPES
        and content_type not in ALLOWED_VIDEO_TYPES
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported format. Only JPG, PNG, WEBP "
                "images and MP4, WEBM, MOV videos are allowed."
            ),
        )

    is_image = content_type in ALLOWED_IMAGE_TYPES
    max_size = MAX_IMAGE_SIZE if is_image else MAX_VIDEO_SIZE

    try:
        content = await file.read(max_size + 1)

        if len(content) > max_size:
            limit_message = (
                "Image size exceeds the 10MB maximum limit."
                if is_image
                else "Video size exceeds the 30MB maximum limit."
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=limit_message,
            )

        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file is empty.",
            )

        extension = MIME_EXTENSIONS[content_type]
        unique_filename = f"food_{uuid.uuid4().hex}{extension}"

        os.makedirs(UPLOAD_DIR, exist_ok=True)

        file_path = os.path.join(
            UPLOAD_DIR,
            unique_filename,
        )

        with open(file_path, "xb") as uploaded_file:
            uploaded_file.write(content)

        media_url = str(
            request.base_url
        ).rstrip("/") + f"/uploads/{unique_filename}"

        return {
            "url": media_url,
            "media_type": "image" if is_image else "video",
            "filename": unique_filename,
        }

    finally:
        await file.close()