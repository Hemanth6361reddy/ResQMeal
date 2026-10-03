from fastapi import Request, HTTPException, status
from app.core.redis import get_redis


class RateLimiter:
    """
    Redis Sliding-Window Rate Limiter:
    Restricts a client IP to `max_requests` per `window_seconds`.
    """
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(self, request: Request):
        redis = await get_redis()
        if not redis:
            return  # Allow gracefully if Redis is momentarily unavailable

        # Extract client IP
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        key = f"rate_limit:{path}:{client_ip}"

        # Increment request count
        current_count = await redis.incr(key)

        # Set expiration on the first request
        if current_count == 1:
            await redis.expire(key, self.window_seconds)

        # Check limit
        if current_count > self.max_requests:
            ttl = await redis.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.max_requests} requests per minute. Try again in {ttl} seconds.",
                headers={"Retry-After": str(ttl)}
            )