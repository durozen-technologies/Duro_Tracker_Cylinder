import asyncio
import sys

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.database import get_session_local
from app.models.enums import UserRole
from app.models.user import User


async def seed_super_admin(username, password):
    async with get_session_local()() as session:
        result = await session.execute(
            select(User).where(User.username == username)
        )
        existing = result.scalar_one_or_none()
        if existing:
            print(f"User {username} already exists.")
            return

        user = User(
            username=username,
            password_hash=get_password_hash(password),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            organization_id=None
        )
        session.add(user)
        await session.commit()
        print(f"Successfully created SUPER_ADMIN: {username}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python manage.py <username> <password>")
        sys.exit(1)
        
    asyncio.run(seed_super_admin(sys.argv[1], sys.argv[2]))
