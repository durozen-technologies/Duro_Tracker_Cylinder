from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    TENANT_ADMIN = "tenant_admin"
    DRIVER = "driver"



class BuyerType(str, Enum):
    COMMERCIAL = "commercial"
    DOMESTIC = "domestic"
