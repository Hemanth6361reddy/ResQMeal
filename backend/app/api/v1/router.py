from fastapi import APIRouter
from app.api.v1.endpoints import health

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(health.router, tags=["System Health"])
# Future routers will be registered here:
# api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# api_router.include_router(donations.router, prefix="/donations", tags=["Donations"])