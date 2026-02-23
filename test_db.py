import asyncio
from admin.database import SessionLocal
from admin.models import User
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(User))
        for u in result.scalars().all():
            print(f"ID={u.id} github_id={u.github_id} email={u.email} token={u.telegram_bot_token}")

asyncio.run(main())
