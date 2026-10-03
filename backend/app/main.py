from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import api_router
from app.core.redis import init_redis_pool, close_redis_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to Redis
    try:
        await init_redis_pool()
        print("Connected to Upstash Redis successfully.")
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")
    yield
    # Shutdown: Close connections
    await close_redis_pool()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Real-Time Food Rescue Platform API connecting Donors, NGOs, and Delivery Partners.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache", "X-RateLimit-Limit", "X-RateLimit-Remaining"]
)

# Mount API V1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)