from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

engine_args = {
    "echo": False,
    "pool_pre_ping": True,
    "pool_recycle": 3600,
}
if not settings.database_url.startswith("sqlite"):
    engine_args["pool_size"] = 10
    engine_args["max_overflow"] = 20

engine = create_async_engine(
    settings.database_url,
    **engine_args
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
