from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timezone
from app.core.config import settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    environment: str
    timestamp: str


@router.get("/health", response_model=HealthResponse, summary="System Health Check")
async def health_check():
    """
    Returns the operational status of the ResQMeal API.
    Used by monitoring services, load balancers, and Docker health checks.
    """
    return HealthResponse(
        status="healthy",
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat()
    )