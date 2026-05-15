"""Verify the LangGraph checkpointer is durable across builder rebuilds.

We can't literally restart the container in unit tests, but we can
verify that two SEPARATE build_graph() invocations sharing the same
project_id (thread_id) see each other's state — which is the same
invariant MemorySaver violated.
"""
import os
import uuid
import pytest

pytestmark = pytest.mark.asyncio


async def test_state_survives_separate_build_graph_calls():
    """First builder writes a 'requirement' on a project_id; a fresh
    builder must see it. With MemorySaver this fails — instances
    don't share state. With PostgresSaver they share the DB."""
    from app.core.graph.builder import build_graph, reset_graph_cache

    project_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": project_id}}

    reset_graph_cache()
    g1 = await build_graph()
    await g1.aupdate_state(config, {"requirement": {"machine_type": "test"}})

    reset_graph_cache()
    g2 = await build_graph()
    state = await g2.aget_state(config)

    assert state.values.get("requirement") == {"machine_type": "test"}
