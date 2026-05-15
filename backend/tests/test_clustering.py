"""Unit tests for the project-clustering pure logic.

We use a tiny fake project class so these tests have zero DB / ORM /
network dependency — they document the algorithm contract in isolation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import pytest

from app.core.clustering import compute_clusters, render_clusters


@dataclass
class FakeProject:
    id: str
    topic_tags: list[str]
    name: str = ""
    title: str | None = None
    updated_at: datetime = field(default_factory=datetime.now)


def test_empty_input_returns_empty_results():
    plans, unclustered = compute_clusters([])
    assert plans == []
    assert unclustered == []


def test_single_project_is_unclustered():
    p = FakeProject(id="p1", topic_tags=["电机"])
    plans, unclustered = compute_clusters([p])
    assert plans == []
    assert unclustered == ["p1"]


def test_two_projects_sharing_a_tag_form_one_cluster():
    a = FakeProject(id="a", topic_tags=["电机", "PLC"])
    b = FakeProject(id="b", topic_tags=["电机", "安全"])
    c = FakeProject(id="c", topic_tags=["独立工艺"])
    plans, unclustered = compute_clusters([a, b, c])

    assert len(plans) == 1
    plan = plans[0]
    assert plan.label == "电机"
    # Insertion order preserved within the cluster.
    assert plan.project_ids == ("a", "b")
    assert unclustered == ["c"]


def test_clusters_sorted_by_size_then_label():
    # 3 projects share "电机", 2 share "PLC", so 电机 cluster comes first.
    projects = [
        FakeProject(id="p1", topic_tags=["电机", "PLC"]),
        FakeProject(id="p2", topic_tags=["电机", "PLC"]),
        FakeProject(id="p3", topic_tags=["电机"]),
        FakeProject(id="p4", topic_tags=["独立"]),
    ]
    plans, _ = compute_clusters(projects)
    labels = [p.label for p in plans]
    assert labels == ["电机", "PLC"]


def test_project_can_appear_in_multiple_clusters():
    """A project tagged with two anchor tags belongs in both — that's
    intentional for the sidebar UX."""
    a = FakeProject(id="a", topic_tags=["电机", "安全"])
    b = FakeProject(id="b", topic_tags=["电机"])
    c = FakeProject(id="c", topic_tags=["安全"])
    plans, unclustered = compute_clusters([a, b, c])

    assert {p.label for p in plans} == {"电机", "安全"}
    pid_sets = {p.label: set(p.project_ids) for p in plans}
    assert pid_sets["电机"] == {"a", "b"}
    assert pid_sets["安全"] == {"a", "c"}
    assert unclustered == []


def test_min_group_size_threshold_respected():
    # min_group_size=3 means a 2-project shared tag does NOT cluster.
    a = FakeProject(id="a", topic_tags=["电机"])
    b = FakeProject(id="b", topic_tags=["电机"])
    plans, unclustered = compute_clusters([a, b], min_group_size=3)
    assert plans == []
    assert sorted(unclustered) == ["a", "b"]


def test_normalization_collapses_case():
    """plc / PLC should land in the same cluster after normalization."""
    a = FakeProject(id="a", topic_tags=["PLC"])
    b = FakeProject(id="b", topic_tags=["plc"])
    plans, unclustered = compute_clusters([a, b])
    assert len(plans) == 1
    assert plans[0].label == "PLC"  # most common spelling wins; ties → first seen
    assert set(plans[0].project_ids) == {"a", "b"}
    assert unclustered == []


def test_blank_and_none_tags_ignored():
    a = FakeProject(id="a", topic_tags=["电机", "", "  "])
    b = FakeProject(id="b", topic_tags=["电机"])
    plans, _ = compute_clusters([a, b])
    assert plans[0].label == "电机"


def test_render_clusters_returns_serializable_dicts():
    a = FakeProject(id="a", topic_tags=["电机"], name="A", title="电机 A")
    b = FakeProject(id="b", topic_tags=["电机"], name="B")
    clusters, unclustered = render_clusters([a, b])

    assert len(clusters) == 1
    cluster = clusters[0]
    assert cluster["label"] == "电机"
    assert cluster["project_ids"] == ["a", "b"]
    assert len(cluster["projects"]) == 2
    item_a = cluster["projects"][0]
    assert item_a["id"] == "a"
    assert item_a["name"] == "A"
    assert item_a["title"] == "电机 A"
    assert item_a["topic_tags"] == ["电机"]
    assert "updated_at" in item_a
    assert unclustered == []


def test_render_unclustered_appear_in_separate_list():
    a = FakeProject(id="a", topic_tags=["电机"])
    b = FakeProject(id="b", topic_tags=["电机"])
    c = FakeProject(id="c", topic_tags=["孤立"])
    clusters, unclustered = render_clusters([a, b, c])
    assert len(clusters) == 1
    assert [u["id"] for u in unclustered] == ["c"]


def test_dedupe_by_id_does_not_double_count():
    """If the same project id appears twice, count it once. Defensive against
    upstream callers that haven't deduped."""
    a = FakeProject(id="a", topic_tags=["电机"])
    a_dup = FakeProject(id="a", topic_tags=["电机"])
    b = FakeProject(id="b", topic_tags=["电机"])
    plans, _ = compute_clusters([a, a_dup, b])
    assert plans[0].project_ids == ("a", "b")
