from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.db.session import get_db_for_org, get_platform_db
from app.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    db: AsyncSession = Depends(get_platform_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise _credentials_exception()
        user_id = UUID(user_id_str)
    except (JWTError, ValueError, TypeError) as exc:
        raise _credentials_exception() from exc

    user = await db.scalar(
        select(User).options(selectinload(User.organization)).where(User.id == user_id)
    )
    if user is None:
        raise _credentials_exception()

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    if current_user.organization_id is not None:
        if current_user.organization is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Organization not found"
            )
    return current_user


from typing import Any, Coroutine


def require_roles(*roles: UserRole) -> Callable[..., Coroutine[Any, Any, User]]:
    async def dependency(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return current_user

    return dependency


def require_super_admin() -> Callable[..., Coroutine[Any, Any, User]]:
    return require_roles(UserRole.SUPER_ADMIN)


def require_tenant_admin() -> Callable[..., Coroutine[Any, Any, User]]:
    return require_roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)


async def get_tenant_db(
    current_user: User = Depends(get_current_active_user),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not associated with an organization")
    async for db in get_db_for_org(current_user.organization_id):
        yield db
