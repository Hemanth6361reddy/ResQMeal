import redis.asyncio as aioredis
from app.core.config import settings

# Global async Redis client instance
redis_client: aioredis.Redis = None


async def init_redis_pool():
    """Initializes the connection pool to Upstash Redis with TLS/SSL and auto-retry."""
    global redis_client
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=15,
        socket_timeout=5.0,
        socket_connect_timeout=5.0,
        retry_on_timeout=True
    )


async def close_redis_pool():
    """Closes the Redis connection pool cleanly during application shutdown."""
    global redis_client
    if redis_client:
        await redis_client.close()


async def get_redis() -> aioredis.Redis:
    """Dependency for injecting Redis into FastAPI routes."""
    return redis_client