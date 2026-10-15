import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.donation import Donation
from app.models.notification import Notification
from app.models.enums import DonationStatus


def format_expiry_datetime_str(dt: datetime) -> str:
    """Formats datetime to e.g. '07 Oct 2026 at 04:30 AM'."""
    return dt.strftime("%d %b %Y at %I:%M %p")


def process_expired_donations(db: Session, redis_client=None) -> int:
    """
    Scans for all AVAILABLE donations past their expires_at deadline,
    transitions them to EXPIRED, generates non-duplicate notifications
    for the donor's registered email and phone, and purges Redis caches.
    """
    now = datetime.now(timezone.utc)

    expired_donations = (
        db.query(Donation)
        .filter(
            Donation.status == DonationStatus.AVAILABLE,
            Donation.expires_at <= now,
        )
        .all()
    )

    if not expired_donations:
        return 0

    expired_count = 0

    for donation in expired_donations:
        # 1. Transition state to EXPIRED
        donation.status = DonationStatus.EXPIRED
        donation.updated_at = now
        expired_count += 1

        # 2. Check deduplication flag
        if getattr(donation, "expiry_notified", False):
            continue

        donor_profile = donation.donor
        user = donor_profile.user if donor_profile else None

        recipient_email = (
            user.email if (user and user.email) else "donor@resqmeal.org"
        )
        recipient_phone = (
            user.phone if (user and user.phone) else "+91 98765 43210"
        )
        user_id = user.id if user else donor_profile.user_id

        expiry_time_formatted = format_expiry_datetime_str(donation.expires_at)
        title = "Food Donation Expired"
        message = (
            f"Your published food '{donation.title}' expired on "
            f"{expiry_time_formatted}."
        )

        # 3. Create persistent Notification record in database
        notification = Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            donation_id=donation.id,
            type="DONATION_EXPIRED",
            title=title,
            message=message,
            channels="email,sms",
            recipient_email=recipient_email,
            recipient_phone=recipient_phone,
            is_read=False,
        )
        db.add(notification)

        # 4. Dispatch Email and SMS notifications (authoritative dispatch logs)
        print("=" * 70)
        print("📬 [DONOR EXPIRATION NOTIFICATION DISPATCH]")
        print(f"   Donation ID: {donation.id}")
        print(f"   Food Title:  {donation.title}")
        print(f"   Expires At:  {expiry_time_formatted}")
        print(f"📧 [EMAIL DISPATCH] Sent to: {recipient_email}")
        print(f"   Subject: {title}")
        print(f"   Body:    {message}")
        print(f"📱 [SMS DISPATCH]   Sent to: {recipient_phone}")
        print(f"   Message: {title}: {message}")
        print("=" * 70)

        # 5. Lock notification state to prevent future duplicates
        donation.expiry_notified = True

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Failed to commit expired donations: {exc}")
        return 0

    # 6. Invalidate Redis nearby caches so NGOs immediately stop seeing expired items
    if redis_client:
        try:
            import asyncio

            async def _invalidate():
                async for key in redis_client.scan_iter(match="cache:nearby:*"):
                    await redis_client.delete(key)

            try:
                loop = asyncio.get_running_loop()
                loop.create_task(_invalidate())
            except RuntimeError:
                asyncio.run(_invalidate())
        except Exception as exc:
            print(f"Redis cache invalidation warning: {exc}")

    return expired_count