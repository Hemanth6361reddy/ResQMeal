import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.core.config import settings, UPLOAD_DIR
from app.api.v1.router import api_router
from app.core.redis import init_redis_pool, close_redis_pool, get_redis
from app.db.session import engine, SessionLocal
from app.services.expiration_service import process_expired_donations


# Ensure the standardized uploads directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def run_expiration_worker():
    """
    Background worker that continuously monitors and expires past-deadline donations,
    dispatches email/SMS notifications, and purges Redis caches every 10 seconds.
    """
    print("⏰ [ResQMeal] Food donation expiration worker started.")
    while True:
        try:
            db = SessionLocal()
            try:
                redis_client = await get_redis()
                count = process_expired_donations(db, redis_client)
                if count > 0:
                    print(
                        f"⚡ [ResQMeal] Expiration worker transitioned {count} donation(s) to EXPIRED."
                    )
            finally:
                db.close()
        except asyncio.CancelledError:
            print("🛑 [ResQMeal] Food donation expiration worker stopped.")
            break
        except Exception as e:
            print(f"⚠️ [ResQMeal] Expiration worker cycle warning: {e}")

        await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 0. Sync files between legacy backend/app/uploads and standardized UPLOAD_DIR
    try:
        legacy_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "uploads"
        )
        os.makedirs(legacy_dir, exist_ok=True)
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        import shutil

        for item in os.listdir(legacy_dir):
            src = os.path.join(legacy_dir, item)
            dst = os.path.join(UPLOAD_DIR, item)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
        for item in os.listdir(UPLOAD_DIR):
            src = os.path.join(UPLOAD_DIR, item)
            dst = os.path.join(legacy_dir, item)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
    except Exception as e:
        print(f"Upload directory sync check: {e}")

    # 1. Ensure required columns and tables exist
    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE donations "
                    "ADD COLUMN IF NOT EXISTS media_urls TEXT;"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE donations "
                    "ADD COLUMN IF NOT EXISTS expiry_notified BOOLEAN DEFAULT FALSE;"
                )
            )
            conn.execute(
                text(
                    """
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    message TEXT NOT NULL,
                    channels VARCHAR(100) NOT NULL DEFAULT 'email,sms',
                    recipient_email VARCHAR(255),
                    recipient_phone VARCHAR(50),
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                );
                """
                )
            )
            conn.commit()
    except Exception as e:
        print(f"Database schema auto-check: {e}")

    # 2. Connect to Redis
    try:
        await init_redis_pool()
        print("Connected to Upstash Redis successfully.")
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")

    # 3. Start Background Expiration Worker
    expiration_task = asyncio.create_task(run_expiration_worker())

    yield

    # 4. Shutdown Worker & Redis
    expiration_task.cancel()
    try:
        await expiration_task
    except asyncio.CancelledError:
        pass

    try:
        await close_redis_pool()
    except Exception as e:
        print(f"Warning: Redis shutdown failed: {e}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Real-Time Food Rescue Platform API connecting "
        "Donors, NGOs, and Delivery Partners."
    ),
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Cache",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
    ],
)


# Explicit route to serve uploads with full CORS & fallback between both directories
@app.get("/uploads/{filename:path}")
async def serve_upload(filename: str):
    primary = os.path.join(UPLOAD_DIR, filename)
    if os.path.isfile(primary):
        return FileResponse(primary)

    legacy = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "uploads", filename
    )
    if os.path.isfile(legacy):
        return FileResponse(legacy)

    raise HTTPException(status_code=404, detail="File not found")


# Mount static files as well
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Include master API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root_check():
    return {
        "status": "online",
        "platform": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "documentation": "/docs",
    }