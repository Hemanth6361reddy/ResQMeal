from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, donations, ngos, deliveries, ws

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(health.router, tags=["System Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & RBAC"])
api_router.include_router(donations.router, prefix="/donations", tags=["Donations (Donor Module)"])
api_router.include_router(ngos.router, prefix="/ngo", tags=["NGO Module & Proximity Search"])
api_router.include_router(deliveries.router, prefix="/deliveries", tags=["Delivery Partner Module"])
api_router.include_router(ws.router, prefix="/ws", tags=["Real-Time WebSockets"])