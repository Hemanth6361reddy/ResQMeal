from fastapi import APIRouter
from app.api.v1.endpoints import health, auth

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(health.router, tags=["System Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & RBAC"])