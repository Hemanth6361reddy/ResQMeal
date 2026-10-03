from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.rate_limit import RateLimiter
from app.models.user import User, DonorProfile, NGOProfile, DeliveryPartnerProfile
from app.models.enums import UserRole
from app.schemas.auth import UserRegisterRequest, UserLoginRequest, TokenResponse, UserResponse
from app.api.deps import get_current_user, RoleChecker

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, summary="Register New User")
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
    db.flush()  # Generates new_user.id without committing transaction yet

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
        if not data.organization_name or not data.address or not data.registration_number:
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
    token = create_access_token(subject=new_user.id, role=new_user.role.value)
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
    if not user or not verify_password(data.password, user.hashed_password):
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

    token = create_access_token(subject=user.id, role=user.role.value)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id
    )


@router.post("/login/oauth2", response_model=TokenResponse, summary="OAuth2 Compatible Login (for Swagger UI)")
def login_oauth2(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 form-data login endpoint used by Swagger UI's Authorize lock."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    token = create_access_token(subject=user.id, role=user.role.value)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id
    )


@router.get("/me", response_model=UserResponse, summary="Get Current Authenticated User")
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
@router.get("/donor-only", summary="Test Route: Donor Role Only")
def donor_only_route(current_user: User = Depends(RoleChecker([UserRole.DONOR]))):
    return {"message": f"Welcome Donor: {current_user.email}!"}


@router.get("/ngo-only", summary="Test Route: NGO Role Only")
def ngo_only_route(current_user: User = Depends(RoleChecker([UserRole.NGO]))):
    return {"message": f"Welcome NGO: {current_user.email}!"}


@router.get("/driver-only", summary="Test Route: Delivery Partner Role Only")
def driver_only_route(current_user: User = Depends(RoleChecker([UserRole.DELIVERY_PARTNER]))):
    return {"message": f"Welcome Driver: {current_user.email}!"}