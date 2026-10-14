import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.core.config import settings, UPLOAD_DIR
from app.api.v1.router import api_router
from app.core.redis import init_redis_pool, close_redis_pool
from app.db.session import engine


# Ensure the standardized uploads directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 0. Sync files between legacy backend/app/uploads and standardized UPLOAD_DIR
    try:
        legacy_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
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

    # 1. Ensure 'media_urls' column exists in 'donations' table
    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE donations "
                    "ADD COLUMN IF NOT EXISTS media_urls TEXT;"
                )
            )
            conn.commit()
    except Exception as e:
        print(f"Database media_urls column check: {e}")

    # 2. Connect to Redis
    try:
        await init_redis_pool()
        print("Connected to Upstash Redis successfully.")
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")

    yield

    # 3. Shutdown
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
    # 1. Check in standardized UPLOAD_DIR (backend/uploads)
    p1 = os.path.join(UPLOAD_DIR, filename)
    if os.path.isfile(p1):
        return FileResponse(p1)

    # 2. Check in legacy backend/app/uploads
    legacy_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    p2 = os.path.join(legacy_dir, filename)
    if os.path.isfile(p2):
        return FileResponse(p2)

    raise HTTPException(status_code=404, detail="Uploaded file not found")


@app.get(f"{settings.API_V1_STR}/uploads/{{filename:path}}")
async def serve_api_upload(filename: str):
    return await serve_upload(filename)


# Mount Static Uploads Folder
app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads",
)


# Mount API V1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)