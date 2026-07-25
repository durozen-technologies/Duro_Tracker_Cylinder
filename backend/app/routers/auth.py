from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token, verify_password
from app.db.session import get_platform_db
from app.models.user import User
from app.schemas.auth import Token

router = APIRouter()
settings = Settings()

@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_platform_db),
) -> Token:
    # Strip whitespace to prevent login failures from accidental spaces
    clean_username = form_data.username.strip().lower()
    
    valid_user = await db.scalar(
        select(User).where(func.lower(User.username) == clean_username)
    )
    if not valid_user or not verify_password(form_data.password, valid_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not valid_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    
    access_token = create_access_token(
        subject=valid_user.id,
        role=valid_user.role,
        org_id=valid_user.organization_id,
        expires_delta=access_token_expires
    )
    
    # Update last login timestamp for analytics and session tracking
    valid_user.last_login_at = func.now()
    await db.commit()
    
    return Token(access_token=access_token, token_type="bearer")
