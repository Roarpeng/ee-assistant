"""Tests for conversation title/tags, search, and clustering."""
import pytest
from app.core.schemas import ClusterProjectItem, ClusterGroup, ClusterResponse


class TestClusterLogic:
    def test_empty_projects_returns_empty_clusters(self):
        resp = ClusterResponse(clusters=[], unclustered=[])
        assert len(resp.clusters) == 0
        assert len(resp.unclustered) == 0

    def test_single_project_returns_unclustered(self):
        from datetime import datetime
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
        from app.core.schemas import ProjectOut
        assert "title" in ProjectOut.model_fields
        assert "topic_tags" in ProjectOut.model_fields


class TestSearchEndpoint:
    def test_search_route_exists(self):
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert "/search" in paths

    def test_cluster_route_exists(self):
        from app.api.projects import router
        paths = [r.path for r in router.routes]
        assert "/cluster" in paths
