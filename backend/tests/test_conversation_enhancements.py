"""Tests for conversation title/tags, search, and clustering."""
from datetime import datetime

import pytest

from app.core.schemas import (
    ClusterGroup,
    ClusterProjectItem,
    ClusterResponse,
    ProjectOut,
)


class TestClusterLogic:
    def test_empty_projects_returns_empty_clusters(self):
        resp = ClusterResponse(clusters=[], unclustered=[])
        assert len(resp.clusters) == 0
        assert len(resp.unclustered) == 0

    def test_single_project_returns_unclustered(self):
        item = ClusterProjectItem(
            id="p1", name="Test", title="测试",
            topic_tags=["电机"], updated_at=datetime.now()
        )
        resp = ClusterResponse(clusters=[], unclustered=[item])
        assert len(resp.clusters) == 0
        assert len(resp.unclustered) == 1

    def test_cluster_group_has_label_and_ids(self):
        group = ClusterGroup(
            label="电机控制",
            project_ids=["p1", "p2"],
            projects=[],
        )
        assert group.label == "电机控制"
        assert len(group.project_ids) == 2


class TestProjectSchema:
    def test_project_out_has_title_and_tags(self):
        assert "title" in ProjectOut.model_fields
        assert "topic_tags" in ProjectOut.model_fields


class TestSearchEndpoint:
    """Routes are registered with their router prefix already applied
    (FastAPI stores the full path in `route.path`), so we assert the path
    *ends with* the static segment we registered. This is the same check
    semantically — that the route exists — but doesn't depend on whether
    the prefix lives on the router or on app.include_router."""

    def test_search_route_exists(self):
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert any(p.endswith("/search") for p in paths), paths

    def test_cluster_route_exists(self):
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert any(p.endswith("/cluster") for p in paths), paths


class TestSearchBehavior:
    """End-to-end behavioral checks for the new endpoints, not just shape.

    These exercise the real router + ORM + clustering pipeline against a
    seeded in-memory project set so regressions in the wiring are caught
    here, not in production."""

    @pytest.mark.asyncio
    async def test_search_matches_name_substring(self):
        from httpx import ASGITransport, AsyncClient
        from app.db.models import Project
        from app.db.repository import async_session
        from app.main import app

        async with async_session() as s:
            s.add(Project(id="srch-1", name="电机控制柜 A1"))
            s.add(Project(id="srch-2", name="液压泵站"))
            await s.commit()

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
                resp = await ac.post("/api/projects/search", json={"query": "电机", "limit": 10})
            assert resp.status_code == 200
            ids = [r["id"] for r in resp.json()]
            assert "srch-1" in ids
            assert "srch-2" not in ids
        finally:
            async with async_session() as s:
                from sqlalchemy import select
                for pid in ("srch-1", "srch-2"):
                    obj = (await s.execute(select(Project).where(Project.id == pid))).scalar()
                    if obj is not None:
                        await s.delete(obj)
                await s.commit()

    @pytest.mark.asyncio
    async def test_cluster_groups_by_shared_tag(self):
        from httpx import ASGITransport, AsyncClient
        from app.db.models import Project
        from app.db.repository import async_session
        from app.main import app

        async with async_session() as s:
            s.add(Project(id="clst-1", name="P1", topic_tags=["电机"]))
            s.add(Project(id="clst-2", name="P2", topic_tags=["电机"]))
            s.add(Project(id="clst-3", name="P3", topic_tags=["独立工艺"]))
            await s.commit()

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
                resp = await ac.get("/api/projects/cluster")
            assert resp.status_code == 200
            payload = resp.json()
            cluster_ids = {pid for c in payload["clusters"] for pid in c["project_ids"]}
            assert {"clst-1", "clst-2"}.issubset(cluster_ids)
            unclustered_ids = {u["id"] for u in payload["unclustered"]}
            assert "clst-3" in unclustered_ids
        finally:
            async with async_session() as s:
                from sqlalchemy import select
                for pid in ("clst-1", "clst-2", "clst-3"):
                    obj = (await s.execute(select(Project).where(Project.id == pid))).scalar()
                    if obj is not None:
                        await s.delete(obj)
                await s.commit()
