import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websocket import WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager

from app.config import settings
from app.db.models import Base
from app.db.repository import engine


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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/projects/{project_id}")
async def project_progress(websocket: WebSocket, project_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(json.dumps({"stage": "echo", "message": data}))
    except WebSocketDisconnect:
        pass
