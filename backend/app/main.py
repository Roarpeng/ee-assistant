from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from openai import AsyncOpenAI

from app.config import settings
from app.db.models import Base
from app.db.repository import engine
from app.core.schemas import ConnectivityTestInput
from app.api.projects import router as projects_router
from app.api.analysis import router as analysis_router
from app.api.selection import router as selection_router
from app.api.knowledge import router as knowledge_router
from app.api.schematic import router as schematic_router
from app.api.codegen import router as codegen_router
from app.api.topology import router as topology_router
from app.api.messages import router as messages_router
from app.api.orgs import router as orgs_router
from app.api.clarify_answer import router as clarify_answer_router
from app.api.feedback import router as feedback_router
from app.api.memory_sources import router as memory_sources_router
from app.api.episodes import router as episodes_router
from app.api.admin_memory import router as admin_memory_router
from app.middleware.org_auth import org_auth_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    from app.core.rag_engine import rag_engine
    await rag_engine.init_collection()
    yield
    await engine.dispose()


app = FastAPI(title="EE Assistant", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(org_auth_middleware)

app.include_router(projects_router)
app.include_router(analysis_router)
app.include_router(selection_router)
app.include_router(knowledge_router)
app.include_router(schematic_router)
app.include_router(codegen_router)
app.include_router(topology_router)
app.include_router(messages_router)
app.include_router(orgs_router)
app.include_router(clarify_answer_router)
app.include_router(feedback_router)
app.include_router(memory_sources_router)
app.include_router(episodes_router)
app.include_router(admin_memory_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/test-connectivity")
async def test_connectivity(body: ConnectivityTestInput):
    results = {}

    # Test chat LLM
    chat = body.chat
    if chat.get("api_key") and chat.get("base_url"):
        try:
            client = AsyncOpenAI(api_key=chat["api_key"], base_url=chat["base_url"])
            r = await client.chat.completions.create(
                model=chat.get("model", "gpt-4o"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            results["chat"] = {"ok": True, "model": r.model, "tokens": r.usage.total_tokens if r.usage else 0}
        except Exception as e:
            results["chat"] = {"ok": False, "error": str(e)[:200]}
    else:
        results["chat"] = {"ok": False, "error": "API Key or Base URL missing"}

    # Test embedding
    emb = body.embedding
    if emb.get("api_key") and emb.get("base_url"):
        try:
            client = AsyncOpenAI(api_key=emb["api_key"], base_url=emb["base_url"])
            r = await client.embeddings.create(
                model=emb.get("model", "text-embedding-3-small"),
                input="test",
                dimensions=emb.get("dimension", 1536),
            )
            results["embedding"] = {"ok": True, "dimension": len(r.data[0].embedding)}
        except Exception as e:
            results["embedding"] = {"ok": False, "error": str(e)[:200]}
    else:
        results["embedding"] = {"ok": False, "error": "API Key or Base URL missing"}

    return results


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


@app.websocket("/ws/knowledge/docs/{doc_id}")
async def knowledge_doc_progress(websocket: WebSocket, doc_id: str):
    from app.api.knowledge import knowledge_progress
    await websocket.accept()
    knowledge_progress.register(doc_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        knowledge_progress.unregister(doc_id)
