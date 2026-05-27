import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from openai import AsyncOpenAI
from sqlalchemy import text

from app.config import settings
from app.logging_config import setup_logging
from app.db.models import Base
from app.db.repository import engine
from app.core.schemas import ConnectivityTestInput
from app.core.llm_providers import (
    PROVIDERS,
    detect_provider,
    get_provider,
    provider_to_dict,
)
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


log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    log.info("EE Assistant backend starting up")
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
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        log.warning("Health check DB probe failed: %s", e)
        db_ok = False
    status = "ok" if db_ok else "degraded"
    return {"status": status, "database": "ok" if db_ok else "unreachable"}


def _resolve_preset(explicit_provider: str | None, base_url: str | None):
    """Pick a ProviderPreset using explicit hint first, base_url fallback.

    Both args are optional / nullable so callers can pass raw user input.
    Returns ``None`` when nothing resolves so the caller can fall back to
    legacy behaviour.
    """
    preset = get_provider(explicit_provider) if explicit_provider else None
    if preset is None:
        preset = detect_provider(base_url)
    return preset


@app.get("/api/llm-providers")
async def list_llm_providers():
    """Return the canonical LLM provider registry as JSON.

    Used by the frontend on mount so the provider dropdown / autofilled
    base URLs / recommended model lists always match the backend's view of
    what's supported. Keeping a single source of truth here avoids the
    (常见) bug of frontend-only enums drifting from the actual quirks
    encoded in `rag_engine.embed()`.
    """
    return {"providers": [provider_to_dict(p) for p in PROVIDERS.values()]}


@app.post("/api/test-connectivity")
async def test_connectivity(body: ConnectivityTestInput):
    results: dict = {}

    # ── Chat probe ────────────────────────────────────────────────────────
    chat = body.chat
    chat_preset = _resolve_preset(chat.get("provider"), chat.get("base_url"))
    if chat.get("api_key") and chat.get("base_url"):
        try:
            client = AsyncOpenAI(api_key=chat["api_key"], base_url=chat["base_url"])
            r = await client.chat.completions.create(
                model=chat.get("model", "gpt-4o"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            results["chat"] = {
                "ok": True,
                "model": r.model,
                "tokens": r.usage.total_tokens if r.usage else 0,
                "provider": chat_preset.id if chat_preset else "custom",
            }
        except Exception as e:
            results["chat"] = {
                "ok": False,
                "error": str(e)[:200],
                "provider": chat_preset.id if chat_preset else "custom",
            }
    else:
        results["chat"] = {
            "ok": False,
            "error": "API Key or Base URL missing",
            "provider": chat_preset.id if chat_preset else "custom",
        }

    # ── Embedding probe ───────────────────────────────────────────────────
    emb = body.embedding
    emb_preset = _resolve_preset(emb.get("provider"), emb.get("base_url"))
    emb_model = emb.get("model", "text-embedding-3-small")
    _is_multimodal = (
        emb_preset is not None
        and emb_preset.supports_multimodal_embed
        and emb_model in emb_preset.multimodal_embed_models
    )

    if emb.get("api_key") and (emb.get("base_url") or _is_multimodal):
        try:
            if _is_multimodal:
                # Multimodal model → use DashScope native SDK
                import asyncio as _asyncio
                from dashscope import MultiModalEmbedding

                resp = await _asyncio.to_thread(
                    MultiModalEmbedding.call,
                    api_key=emb["api_key"],
                    model=emb_model,
                    input=[{"text": "connectivity test"}],
                )
                if resp.status_code != 200:
                    raise RuntimeError(
                        f"DashScope multimodal error (status={resp.status_code}): {resp.message}"
                    )
                dim = len(resp.output["embedding"]) if resp.output and "embedding" in resp.output else 0
                results["embedding"] = {
                    "ok": True,
                    "dimension": dim,
                    "provider": emb_preset.id if emb_preset else "custom",
                    "multimodal": True,
                }
            else:
                # Standard OpenAI-compatible embedding
                client = AsyncOpenAI(api_key=emb["api_key"], base_url=emb["base_url"])

                kwargs: dict = {
                    "model": emb_model,
                    "input": "test",
                }
                supports_dim = (
                    emb_preset.embed_supports_dimensions if emb_preset is not None else True
                )
                if supports_dim:
                    requested_dim = emb.get("dimension", 1536)
                    if (
                        emb_preset is not None
                        and emb_preset.id == "dashscope"
                        and isinstance(requested_dim, int)
                        and requested_dim > 1024
                    ):
                        requested_dim = 1024
                    kwargs["dimensions"] = requested_dim

                r = await client.embeddings.create(**kwargs)
                results["embedding"] = {
                    "ok": True,
                    "dimension": len(r.data[0].embedding),
                    "provider": emb_preset.id if emb_preset else "custom",
                    "sent_dimensions_kwarg": "dimensions" in kwargs,
                }
        except Exception as e:
            results["embedding"] = {
                "ok": False,
                "error": str(e)[:200],
                "provider": emb_preset.id if emb_preset else "custom",
            }
    else:
        results["embedding"] = {
            "ok": False,
            "error": "API Key or Base URL missing",
            "provider": emb_preset.id if emb_preset else "custom",
        }

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


from pydantic import BaseModel

class DebugLogInput(BaseModel):
    error: str
    stack: str | None = None

@app.post("/api/debug/log")
async def receive_debug_log(body: DebugLogInput):
    log.error("[FRONTEND ERROR] %s\nSTACK:\n%s", body.error, body.stack)
    return {"status": "logged"}


@app.get("/api/tasks")
async def list_background_tasks():
    """Return running and recently finished background tasks."""
    from app.core.task_tracker import task_tracker
    return {
        "summary": task_tracker.summary(),
        "active": task_tracker.list_active(),
        "recent": task_tracker.list_recent(limit=20),
    }

