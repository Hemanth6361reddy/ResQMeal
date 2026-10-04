from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.models.donation import Donation
from app.models.delivery import Delivery
from app.models.enums import UserRole, DonationStatus, DeliveryStatus
from app.api.deps import RoleChecker

router = APIRouter()


# Schemas
class SystemMetricsResponse(BaseModel):
    total_donations: int
    completed_rescues: int
    total_servings_saved: int
    total_weight_kg_saved: float
    co2_emissions_avoided_kg: float
    active_deliveries_in_transit: int
    total_donors: int
    total_ngos: int
    total_drivers: int


class CategoryBreakdownItem(BaseModel):
    category: str
    count: int
    servings: int


class DailyTrendItem(BaseModel):
    date: str
    meals_rescued: int
    rescues_count: int


class UserManagementItem(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    is_active: bool
    phone: Optional[str]
    organization_name: Optional[str]
    created_at: datetime


class UserStatusUpdateRequest(BaseModel):
    is_active: bool


# 1. System-Wide Metrics & CO2 Avoided
@router.get("/metrics", response_model=SystemMetricsResponse, summary="Get Platform-Wide Impact Metrics")
def get_system_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.ADMIN]))
):
    """Computes total meals, kilograms, and environmental impact across the platform."""
    total_donations = db.query(func.count(Donation.id)).scalar() or 0

    # Rescued metrics (DELIVERED status)
    delivered_query = db.query(
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.servings), 0),
        func.coalesce(func.sum(Donation.quantity_kg), 0.0)
    ).filter(Donation.status == DonationStatus.DELIVERED).first()

    completed_rescues = delivered_query[0] or 0
    total_servings_saved = delivered_query[1] or 0
    total_weight_kg_saved = float(delivered_query[2] or 0.0)

    # 1 kg food waste in landfill = ~2.5 kg CO2e greenhouse gas emissions
    co2_emissions_avoided_kg = round(total_weight_kg_saved * 2.5, 2)

    active_in_transit = db.query(func.count(Delivery.id)).filter(
        Delivery.status.in_([DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.ON_THE_WAY])
    ).scalar() or 0

    total_donors = db.query(func.count(User.id)).filter(User.role == UserRole.DONOR).scalar() or 0
    total_ngos = db.query(func.count(User.id)).filter(User.role == UserRole.NGO).scalar() or 0
    total_drivers = db.query(func.count(User.id)).filter(User.role == UserRole.DELIVERY_PARTNER).scalar() or 0

    return SystemMetricsResponse(
        total_donations=total_donations,
        completed_rescues=completed_rescues,
        total_servings_saved=total_servings_saved,
        total_weight_kg_saved=round(total_weight_kg_saved, 1),
        co2_emissions_avoided_kg=co2_emissions_avoided_kg,
        active_deliveries_in_transit=active_in_transit,
        total_donors=total_donors,
        total_ngos=total_ngos,
        total_drivers=total_drivers
    )


# 2. Category & Trend Analytics
@router.get("/analytics/trends", summary="Get 7-Day Rescue Trends & Category Distribution")
def get_analytics_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.ADMIN]))
):
    # Category Distribution
    category_rows = db.query(
        Donation.food_type,
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.servings), 0)
    ).group_by(Donation.food_type).all()

    categories = [
        {"category": row[0], "count": row[1], "servings": int(row[2])}
        for row in category_rows
    ]

    # Past 7 Days Trends
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]

    trends = []
    for d in days:
        start_of_day = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)

        row = db.query(
            func.count(Donation.id),
            func.coalesce(func.sum(Donation.servings), 0)
        ).filter(
            Donation.created_at >= start_of_day,
            Donation.created_at < end_of_day
        ).first()

        trends.append({
            "date": d.strftime("%b %d"),
            "rescues_count": row[0] or 0,
            "meals_rescued": int(row[1] or 0)
        })

    return {
        "categories": categories,
        "daily_trends": trends
    }


# 3. User Governance: List All Users
@router.get("/users", response_model=List[UserManagementItem], summary="List All Users")
def list_users(
    role: Optional[UserRole] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.ADMIN]))
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)

    users = query.order_by(User.created_at.desc()).all()

    output = []
    for u in users:
        org_name = None
        if u.donor_profile:
            org_name = u.donor_profile.organization_name
        elif u.ngo_profile:
            org_name = u.ngo_profile.organization_name
        elif u.driver_profile:
            org_name = f"Fleet ({u.driver_profile.vehicle_type.value})"

        output.append(
            UserManagementItem(
                id=u.id,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                phone=u.phone,
                organization_name=org_name,
                created_at=u.created_at
            )
        )
    return output


# 4. User Governance: Suspend / Reactivate User
@router.patch("/users/{user_id}/status", summary="Suspend or Reactivate User")
def update_user_status(
    user_id: uuid.UUID,
    data: UserStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.ADMIN]))
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot deactivate their own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = data.is_active
    db.commit()
    db.refresh(user)

    action = "activated" if user.is_active else "suspended"
    return {"message": f"User {user.email} successfully {action}.", "is_active": user.is_active}