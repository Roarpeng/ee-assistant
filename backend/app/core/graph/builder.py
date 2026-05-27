"""LangGraph graph builder.

Uses PostgresSaver so the graph state (`AnalysisState` per project_id)
survives across container restarts. The checkpointer creates and
manages its own tables via `setup()` on first build.
"""
from __future__ import annotations
import asyncio
import os

from langgraph.graph import StateGraph, END
from app.core.graph.state import AnalysisState

_compiled_graph = None
_checkpointer_ctx = None
_checkpointer = None
_setup_done = False
_lock = asyncio.Lock()


def _pg_conn_str() -> str:
    """Build a psycopg conninfo from POSTGRES_* env vars.

    The SQLAlchemy URL is async (postgresql+asyncpg://...); psycopg
    wants a sync-style conninfo. We re-derive from env so the two
    paths stay in sync without parsing the SQLAlchemy URL.

    NOTE: The backend container does NOT currently export
    POSTGRES_USER/PASSWORD/HOST/PORT/DB env vars (only DATABASE_URL),
    so the defaults here MUST match the actual deployment
    (ele:ele@postgres:5432/ele) rather than generic placeholders.
    """
    user = os.getenv("POSTGRES_USER", "ele")
    pwd = os.getenv("POSTGRES_PASSWORD", "ele")
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "ele")
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}"


def reset_graph_cache() -> None:
    """For tests: drop the in-process compile cache so the next
    build_graph() rebuilds. Does NOT reset the underlying Postgres
    checkpoint store — that's the point of durability."""
    global _compiled_graph
    _compiled_graph = None


async def build_graph():
    """Async builder. Holds a module-level compile cache so we don't
    re-build the StateGraph on every request, and a module-level
    checkpointer context so the psycopg pool is shared."""
    global _compiled_graph, _checkpointer_ctx, _checkpointer, _setup_done

    async with _lock:
        if _checkpointer is None:
            if "sqlite" in os.getenv("DATABASE_URL", ""):
                from langgraph.checkpoint.memory import MemorySaver
                _checkpointer = MemorySaver()
                _setup_done = True
            else:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
                _checkpointer_ctx = AsyncPostgresSaver.from_conn_string(_pg_conn_str())
                _checkpointer = await _checkpointer_ctx.__aenter__()
        if not _setup_done:
            await _checkpointer.setup()
            _setup_done = True


        if _compiled_graph is not None:
            return _compiled_graph

        workflow = StateGraph(AnalysisState)

        from app.core.graph.agents import (
            requirements_agent,
            title_generator,
            category_mapper,
            safety_assessor,
            constraint_extractor,
            fanout_selection_supervisor,
            rule_validator,
            schematic_generator,
            code_generator,
            final_review_agent,
            commissioning_generator,
            wiring_generator,
        )

        workflow.add_node("requirements_agent", requirements_agent)
        workflow.add_node("category_mapper", category_mapper)
        workflow.add_node("safety_assessor", safety_assessor)
        workflow.add_node("constraint_extractor", constraint_extractor)
        workflow.add_node("title_generator", title_generator)
        workflow.add_node("selection_supervisor", fanout_selection_supervisor)
        workflow.add_node("rule_validator", rule_validator)
        workflow.add_node("schematic_generator", schematic_generator)
        workflow.add_node("code_generator", code_generator)
        workflow.add_node("final_review_agent", final_review_agent)
        workflow.add_node("commissioning_generator", commissioning_generator)
        workflow.add_node("wiring_generator", wiring_generator)

        workflow.set_entry_point("requirements_agent")
        workflow.add_edge("requirements_agent", "category_mapper")
        workflow.add_edge("requirements_agent", "safety_assessor")
        workflow.add_edge("requirements_agent", "constraint_extractor")
        workflow.add_edge("requirements_agent", "title_generator")
        workflow.add_edge("category_mapper", "selection_supervisor")
        workflow.add_edge("safety_assessor", "selection_supervisor")
        workflow.add_edge("constraint_extractor", "selection_supervisor")
        workflow.add_edge("title_generator", "selection_supervisor")
        workflow.add_edge("selection_supervisor", "rule_validator")
        workflow.add_edge("rule_validator", "schematic_generator")
        workflow.add_edge("rule_validator", "code_generator")
        workflow.add_edge("rule_validator", "final_review_agent")
        workflow.add_edge("rule_validator", "commissioning_generator")
        workflow.add_edge("rule_validator", "wiring_generator")
        workflow.add_edge("schematic_generator", END)
        workflow.add_edge("code_generator", END)
        workflow.add_edge("final_review_agent", END)
        workflow.add_edge("commissioning_generator", END)
        workflow.add_edge("wiring_generator", END)

        _compiled_graph = workflow.compile(checkpointer=_checkpointer)
        return _compiled_graph
