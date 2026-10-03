import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.redis import get_redis
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


@router.get("/health/redis", summary="Redis In-Memory Store Health Check")
async def health_check_redis(
    redis: aioredis.Redis = Depends(get_redis)
):
    """
    Pings Upstash Redis and returns connection latency in milliseconds.
    """
    if not redis:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis client is not initialized"
        )

    try:
        start_time = time.perf_counter()

        pong = await redis.ping()

        latency_ms = round(
            (time.perf_counter() - start_time) * 1000,
            2
        )

        return {
            "status": "healthy",
            "ping": pong,
            "latency_ms": latency_ms,
            "provider": "Upstash Serverless Cloud Redis"
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis health check failed: {str(e)}"
        )