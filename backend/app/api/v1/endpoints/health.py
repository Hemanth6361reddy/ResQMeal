from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    environment: str
    timestamp: str


class DBHealthResponse(BaseModel):
    status: str
    database: str
    postgis_version: str
    timestamp: str


@router.get("/health", response_model=HealthResponse, summary="System Health Check")
async def health_check():
    """Returns basic API health."""
    return HealthResponse(
        status="healthy",
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


@router.get("/health/db", response_model=DBHealthResponse, summary="Database & PostGIS Health Check")
def database_health_check(db: Session = Depends(get_db)):
    """
    Actively checks PostgreSQL connection and PostGIS extension status.
    """
    try:
        # Check basic connection
        db.execute(text("SELECT 1"))
        
        # Check PostGIS extension
        postgis_ver = db.execute(text("SELECT PostGIS_Version()")).scalar()
        
        return DBHealthResponse(
            status="connected",
            database="PostgreSQL",
            postgis_version=str(postgis_ver),
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection failed: {str(e)}"
        )