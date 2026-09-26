import enum


class UserRole(str, enum.Enum):
    DONOR = "DONOR"
    NGO = "NGO"
    DELIVERY_PARTNER = "DELIVERY_PARTNER"
    ADMIN = "ADMIN"


class DonationStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    REQUESTED = "REQUESTED"
    ACCEPTED = "ACCEPTED"
    PICKED_UP = "PICKED_UP"
    ON_THE_WAY = "ON_THE_WAY"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class VehicleType(str, enum.Enum):
    BICYCLE = "BICYCLE"
    MOTORBIKE = "MOTORBIKE"
    CAR = "CAR"
    VAN = "VAN"
    TRUCK = "TRUCK"
    AUTO_RICKSHAW = "AUTO_RICKSHAW"