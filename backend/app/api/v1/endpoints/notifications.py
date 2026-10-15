from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.models.user import User
from app.models.notification import Notification
from app.api.deps import get_current_user

router = APIRouter()


class NotificationResponse(BaseModel):
    id: uuid.UUID
    donation_id: uuid.UUID | None = None
    type: str
    title: str
    message: str
    channels: str
    recipient_email: str | None = None
    recipient_phone: str | None = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get(
    "/my",
    response_model=List[NotificationResponse],
    summary="Get Current User's Notifications",
)
def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return notifications


@router.patch(
    "/{id}/read",
    summary="Mark Notification as Read",
)
def mark_notification_as_read(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    notification.is_read = True
    db.commit()
    return {"status": "success", "id": str(id)}


@router.get(
    "/unread-count",
    summary="Get Unread Notification Count",
)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .count()
    )
    return {"unread_count": count}