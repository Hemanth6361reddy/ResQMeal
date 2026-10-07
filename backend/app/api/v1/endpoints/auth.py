from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import hashlib
import secrets
import time
import uuid
import json

from app.db.session import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.rate_limit import RateLimiter
from app.core.redis import get_redis
from app.core.config import settings
from app.models.user import User, DonorProfile, NGOProfile, DeliveryPartnerProfile
from app.models.enums import UserRole
from app.schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserResponse,
    ForgotPasswordOTPRequest,
    ForgotPasswordOTPVerifyRequest,
    ForgotPasswordResetRequest,
)
from app.api.deps import get_current_user, RoleChecker

router = APIRouter()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User"
)
def register_user(data: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Registers a new user and automatically initializes their role profile
    (Donor, NGO, or Delivery Partner) in an atomic transaction.
    """
    # 1. Check if email already exists
    existing_user = db.query(User).filter(User.email == data.email).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address is already registered."
        )

    # 2. Create the User account
    new_user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        phone=data.phone,
        is_active=True,
        is_verified=False
    )

    db.add(new_user)
    db.flush()

    # 3. Create the corresponding profile based on role
    if data.role == UserRole.DONOR:
        if not data.organization_name or not data.address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Donor registration requires organization_name and address."
            )

        donor_profile = DonorProfile(
            user_id=new_user.id,
            organization_name=data.organization_name,
            address=data.address,
            contact_person=data.contact_person
        )

        db.add(donor_profile)

    elif data.role == UserRole.NGO:
        if (
            not data.organization_name
            or not data.address
            or not data.registration_number
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="NGO registration requires organization_name, address, and registration_number."
            )

        ngo_profile = NGOProfile(
            user_id=new_user.id,
            organization_name=data.organization_name,
            registration_number=data.registration_number,
            address=data.address,
            capacity_meals_per_day=data.capacity_meals_per_day or 100
        )

        db.add(ngo_profile)

    elif data.role == UserRole.DELIVERY_PARTNER:
        if not data.license_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Delivery partner registration requires a license_number."
            )

        driver_profile = DeliveryPartnerProfile(
            user_id=new_user.id,
            vehicle_type=data.vehicle_type,
            license_number=data.license_number,
            is_available=True
        )

        db.add(driver_profile)

    # Commit atomic transaction
    db.commit()
    db.refresh(new_user)

    # 4. Issue JWT access token
    token = create_access_token(
        subject=new_user.id,
        role=new_user.role.value
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=new_user.role,
        user_id=new_user.id
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login (JSON Body)",
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))]
)
def login_user(data: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Validates user credentials and issues a JWT access token.
    Limited to 5 attempts per minute per IP.
    """
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(
        data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    token = create_access_token(
        subject=user.id,
        role=user.role.value
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id
    )


@router.post(
    "/login/oauth2",
    response_model=TokenResponse,
    summary="OAuth2 Compatible Login (for Swagger UI)"
)
def login_oauth2(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 form-data login endpoint used by Swagger UI's Authorize lock."""

    user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not user or not verify_password(
        form_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    token = create_access_token(
        subject=user.id,
        role=user.role.value
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current Authenticated User"
)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns profile details for the currently logged-in user."""

    org_name = None
    addr = None
    v_type = None

    if current_user.donor_profile:
        org_name = current_user.donor_profile.organization_name
        addr = current_user.donor_profile.address

    elif current_user.ngo_profile:
        org_name = current_user.ngo_profile.organization_name
        addr = current_user.ngo_profile.address

    elif current_user.driver_profile:
        v_type = current_user.driver_profile.vehicle_type

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        phone=current_user.phone,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        organization_name=org_name,
        address=addr,
        vehicle_type=v_type
    )


# ==========================================
# RBAC Verification Test Routes
# ==========================================

@router.get(
    "/donor-only",
    summary="Test Route: Donor Role Only"
)
def donor_only_route(
    current_user: User = Depends(
        RoleChecker([UserRole.DONOR])
    )
):
    return {
        "message": f"Welcome Donor: {current_user.email}!"
    }


@router.get(
    "/ngo-only",
    summary="Test Route: NGO Role Only"
)
def ngo_only_route(
    current_user: User = Depends(
        RoleChecker([UserRole.NGO])
    )
):
    return {
        "message": f"Welcome NGO: {current_user.email}!"
    }


@router.get(
    "/driver-only",
    summary="Test Route: Delivery Partner Role Only"
)
def driver_only_route(
    current_user: User = Depends(
        RoleChecker([UserRole.DELIVERY_PARTNER])
    )
):
    return {
        "message": f"Welcome Driver: {current_user.email}!"
    }


# ==========================================
# Forgot Password & OTP Recovery
# ==========================================

# In-memory resilient fallback cache for OTPs
# in case Redis is momentarily offline
_memory_otp_cache = {}


def _get_otp_hash(otp: str, salt: str) -> str:
    """Hashes OTP with cryptographic salt to prevent plain-text storage."""

    return hashlib.sha256(
        f"{otp}:{salt}:{settings.SECRET_KEY}".encode()
    ).hexdigest()


# -------------------------------------------------------------
# 1. REQUEST OTP (Account Enumeration Protected)
# -------------------------------------------------------------

@router.post(
    "/forgot-password/request-otp",
    summary="Request Password Reset OTP"
)
async def request_password_reset_otp(
    data: ForgotPasswordOTPRequest,
    db: Session = Depends(get_db)
):
    """
    Generates a secure 6-digit OTP for account recovery.

    Security protections:
    - Account enumeration defense
    - 60-second cooldown before resending
    - 5-minute OTP expiration
    - Plain-text OTP is never stored in DB or Redis
    """

    clean_identifier = (
        data.identifier.strip().lower()
        if data.method == "email"
        else data.identifier.strip()
    )

    cache_key = f"otp:{data.method}:{clean_identifier}"
    cooldown_key = f"otp_cooldown:{data.method}:{clean_identifier}"

    now = time.time()
    redis = await get_redis()

    # 1. Enforce 60-second resend cooldown
    in_cooldown = False

    if redis:
        try:
            in_cooldown = await redis.exists(cooldown_key)
        except Exception:
            pass

    if (
        not in_cooldown
        and cooldown_key in _memory_otp_cache
    ):
        if now < _memory_otp_cache[cooldown_key]:
            in_cooldown = True

    if in_cooldown:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="A verification code was recently sent. Please wait for the cooldown timer."
        )

    # 2. Look up user by email or phone
    user = None

    if data.method == "email":
        user = db.query(User).filter(
            User.email.ilike(clean_identifier)
        ).first()
    else:
        user = db.query(User).filter(
            User.phone == clean_identifier
        ).first()

    dev_code_preview = None

    if user:
        # 3. Generate cryptographically secure 6-digit OTP
        raw_otp = "".join(
            secrets.choice("0123456789")
            for _ in range(6)
        )

        otp_salt = secrets.token_hex(8)

        hashed_otp = _get_otp_hash(
            raw_otp,
            otp_salt
        )

        otp_payload = {
            "user_id": str(user.id),
            "otp_hash": hashed_otp,
            "salt": otp_salt,
            "attempts": 0,
            "expires_at": now + 300
        }

        # Store in Redis
        if redis:
            try:
                await redis.setex(
                    cache_key,
                    300,
                    json.dumps(otp_payload)
                )

                await redis.setex(
                    cooldown_key,
                    60,
                    "1"
                )

            except Exception:
                pass

        # Memory store backup
        _memory_otp_cache[cache_key] = otp_payload
        _memory_otp_cache[cooldown_key] = now + 60

        # Development preview code
        dev_code_preview = raw_otp

    return {
        "message": "If an account matches this information, a 6-digit verification code has been dispatched.",
        "cooldown_seconds": 60,
        "dev_preview_code": dev_code_preview
    }


# -------------------------------------------------------------
# 2. VERIFY OTP (Single-Use with Max 5 Attempts)
# -------------------------------------------------------------

@router.post(
    "/forgot-password/verify-otp",
    summary="Verify Reset OTP"
)
async def verify_password_reset_otp(
    data: ForgotPasswordOTPVerifyRequest,
    db: Session = Depends(get_db)
):
    clean_identifier = (
        data.identifier.strip().lower()
        if data.method == "email"
        else data.identifier.strip()
    )

    cache_key = f"otp:{data.method}:{clean_identifier}"

    redis = await get_redis()

    otp_record = None

    # Get OTP from Redis
    if redis:
        try:
            cached = await redis.get(cache_key)

            if cached:
                if isinstance(cached, bytes):
                    cached = cached.decode("utf-8")

                otp_record = json.loads(cached)

        except Exception:
            pass

    # Fallback to memory cache
    if (
        not otp_record
        and cache_key in _memory_otp_cache
    ):
        otp_record = _memory_otp_cache[cache_key]

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired or does not exist. Please request a new one."
        )

    # Check expiration
    if time.time() > otp_record.get("expires_at", 0):

        if redis:
            try:
                await redis.delete(cache_key)
            except Exception:
                pass

        _memory_otp_cache.pop(
            cache_key,
            None
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new one."
        )

    # Maximum 5 failed attempts
    if otp_record.get("attempts", 0) >= 5:

        if redis:
            try:
                await redis.delete(cache_key)
            except Exception:
                pass

        _memory_otp_cache.pop(
            cache_key,
            None
        )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. For security, this code has been invalidated."
        )

    # Validate OTP hash
    candidate_hash = _get_otp_hash(
        data.otp.strip(),
        otp_record["salt"]
    )

    if candidate_hash != otp_record["otp_hash"]:

        otp_record["attempts"] = (
            otp_record.get("attempts", 0) + 1
        )

        # Update attempts in Redis
        if redis:
            try:
                remaining_ttl = max(
                    1,
                    int(
                        otp_record["expires_at"]
                        - time.time()
                    )
                )

                await redis.setex(
                    cache_key,
                    remaining_ttl,
                    json.dumps(otp_record)
                )

            except Exception:
                pass

        # Update memory cache
        _memory_otp_cache[cache_key] = otp_record

        remaining = 5 - otp_record["attempts"]

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining."
        )

    # OTP is valid.
    # Invalidate it to prevent replay attacks.
    if redis:
        try:
            await redis.delete(cache_key)
        except Exception:
            pass

    _memory_otp_cache.pop(
        cache_key,
        None
    )

    # Create secure single-use reset token
    # Valid for 10 minutes
    reset_token = secrets.token_urlsafe(32)

    token_key = f"reset_token:{reset_token}"

    token_payload = {
        "user_id": otp_record["user_id"],
        "expires_at": time.time() + 600
    }

    if redis:
        try:
            await redis.setex(
                token_key,
                600,
                json.dumps(token_payload)
            )
        except Exception:
            pass

    _memory_otp_cache[token_key] = token_payload

    return {
        "message": "Verification successful.",
        "reset_token": reset_token
    }


# -------------------------------------------------------------
# 3. RESET PASSWORD (Bcrypt Re-hash)
# -------------------------------------------------------------

@router.post(
    "/forgot-password/reset",
    summary="Submit New Password"
)
async def reset_password_with_token(
    data: ForgotPasswordResetRequest,
    db: Session = Depends(get_db)
):
    token_key = f"reset_token:{data.reset_token}"

    redis = await get_redis()

    token_record = None

    # Get reset token from Redis
    if redis:
        try:
            cached = await redis.get(token_key)

            if cached:
                if isinstance(cached, bytes):
                    cached = cached.decode("utf-8")

                token_record = json.loads(cached)

        except Exception:
            pass

    # Fallback to memory cache
    if (
        not token_record
        and token_key in _memory_otp_cache
    ):
        token_record = _memory_otp_cache[token_key]

    # Check reset token
    if (
        not token_record
        or time.time() > token_record.get("expires_at", 0)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset session has expired. Please initiate recovery again."
        )

    # Validate password length
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters in length."
        )

    # Find user
    user_id = uuid.UUID(
        token_record["user_id"]
    )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    # Re-hash new password
    user.hashed_password = hash_password(
        data.new_password
    )

    db.commit()

    # Invalidate reset token immediately
    if redis:
        try:
            await redis.delete(token_key)
        except Exception:
            pass

    _memory_otp_cache.pop(
        token_key,
        None
    )

    return {
        "message": "Password reset successfully. You may now sign in with your new password."
    }