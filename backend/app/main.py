from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.db.models import Base
from app.db.repository import engine
from app.api.projects import router as projects_router
from app.api.analysis import router as analysis_router
from app.api.selection import router as selection_router
from app.api.knowledge import router as knowledge_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="EE Assistant", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(analysis_router)
app.include_router(selection_router)
app.include_router(knowledge_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/projects/{project_id}")
async def project_progress(websocket: WebSocket, project_id: str):
    from app.core.orchestrator import orchestrator
    await websocket.accept()
    orchestrator.register_ws(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        orchestrator.unregister_ws(project_id)
