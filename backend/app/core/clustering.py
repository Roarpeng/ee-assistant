"""Project clustering for the conversation-workspace sidebar.

Pure-logic module — no DB / no LLM dependencies — so it's trivially
unit-testable and reusable in any context that has a list of projects with
``topic_tags``.

Algorithm (tag-frequency clustering)
------------------------------------
1. Count how often each tag appears across all projects.
2. Pick "anchor tags" — those that appear on >= MIN_GROUP_SIZE projects.
   These become cluster labels.
3. For each anchor tag, group every project that carries that tag.
4. A project may legitimately appear in multiple clusters (a "电机控制"
   project that also touches "安全" belongs in both sidebars). Callers that
   need a partition can pick the highest-scoring cluster per project.
5. Projects that don't share any anchor tag with another project are
   returned in ``unclustered``.

Why this over k-means / Louvain on the knowledge graph
------------------------------------------------------
- Conversation projects rarely cross the dozens; statistical methods
  overfit and behave erratically at small N.
- Tag-frequency is explainable: users see "this cluster exists because 4
  projects share '电机控制'", which matches the sidebar metaphor.
- Zero LLM cost — clustering runs on every sidebar load.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable, Protocol


# A project must appear on at least this many projects' tag lists before
# we consider it a cluster anchor. Set to 2 so a single shared tag forms
# a cluster (small workspaces benefit; large ones can override).
MIN_GROUP_SIZE = 2


class _ProjectLike(Protocol):
    """Structural type matched by both the ORM Project and the
    `ClusterProjectItem` Pydantic model — anything with these attributes
    works."""
    id: str
    topic_tags: list[str]


@dataclass(frozen=True)
class _ClusterPlan:
    """Internal pre-rendering structure: maps anchor tag → ordered project IDs."""
    label: str
    project_ids: tuple[str, ...]


def _normalize_tag(tag: str) -> str:
    """Trim + collapse case for matching. Leaves CJK characters untouched."""
    return (tag or "").strip().lower()


def _project_tag_set(project: _ProjectLike) -> set[str]:
    return {_normalize_tag(t) for t in (project.topic_tags or []) if t and t.strip()}


def compute_clusters(
    projects: Iterable[_ProjectLike],
    *,
    min_group_size: int = MIN_GROUP_SIZE,
) -> tuple[list[_ClusterPlan], list[str]]:
    """Compute (clusters, unclustered_ids) from a project iterable.

    Returns ``(plans, unclustered_ids)`` where:
    - ``plans`` is a list of ``_ClusterPlan`` ordered by descending
      cluster size (largest first), tie-broken by label alphabetical.
    - ``unclustered_ids`` is the list of project IDs that did not land in
      any cluster, preserving the input order.
    """
    project_list = list(projects)
    if not project_list:
        return [], []

    # Map tag → list of project IDs carrying that tag (preserving input order)
    tag_to_pids: dict[str, list[str]] = defaultdict(list)
    seen_pids: set[str] = set()  # de-dup by id
    for project in project_list:
        if project.id in seen_pids:
            continue
        seen_pids.add(project.id)
        for tag in _project_tag_set(project):
            tag_to_pids[tag].append(project.id)

    # Anchor tags: appear on >= min_group_size projects
    anchors = [tag for tag, pids in tag_to_pids.items() if len(pids) >= min_group_size]
    anchors.sort(key=lambda t: (-len(tag_to_pids[t]), t))

    # Build display labels — preserve original casing of the most common
    # spelling seen for that normalized tag (some users mix "PLC"/"plc").
    label_for_tag = _build_display_labels(project_list)

    plans: list[_ClusterPlan] = [
        _ClusterPlan(label=label_for_tag.get(tag, tag), project_ids=tuple(tag_to_pids[tag]))
        for tag in anchors
    ]

    clustered_ids: set[str] = {pid for plan in plans for pid in plan.project_ids}
    unclustered_ids = [p.id for p in project_list if p.id not in clustered_ids]

    return plans, unclustered_ids


def _build_display_labels(projects: list[_ProjectLike]) -> dict[str, str]:
    """For each normalized tag, pick the most-frequent original casing as
    its display label. Stable tie-break = first-seen wins.
    """
    spellings: dict[str, Counter[str]] = defaultdict(Counter)
    for project in projects:
        for raw in project.topic_tags or []:
            if not raw or not raw.strip():
                continue
            spellings[_normalize_tag(raw)][raw.strip()] += 1
    return {
        tag: counter.most_common(1)[0][0] for tag, counter in spellings.items()
    }


def render_clusters(
    projects: Iterable[_ProjectLike],
    *,
    min_group_size: int = MIN_GROUP_SIZE,
) -> tuple[list[dict], list[dict]]:
    """High-level helper: returns (clusters, unclustered) as plain dicts
    suitable for direct serialization through ``ClusterResponse``.

    The shape matches ``ClusterGroup`` / ``ClusterProjectItem`` so callers
    can do ``ClusterResponse(clusters=clusters, unclustered=unclustered)``.
    """
    project_list = list(projects)
    by_id = {p.id: p for p in project_list}
    plans, unclustered_ids = compute_clusters(project_list, min_group_size=min_group_size)

    clusters_out: list[dict] = []
    for plan in plans:
        items = [_to_item(by_id[pid]) for pid in plan.project_ids if pid in by_id]
        clusters_out.append(
            {
                "label": plan.label,
                "project_ids": list(plan.project_ids),
                "projects": items,
            }
        )

    unclustered_out = [_to_item(by_id[pid]) for pid in unclustered_ids if pid in by_id]
    return clusters_out, unclustered_out


def _to_item(project: _ProjectLike) -> dict:
    """Convert a project-like object to the ClusterProjectItem dict shape.

    Tolerates missing optional attributes (title) so we can be fed any
    object with ``id`` + ``topic_tags`` + the basic Project columns.
    """
    return {
        "id": project.id,
        "name": getattr(project, "name", "") or "",
        "title": getattr(project, "title", None),
        "topic_tags": list(getattr(project, "topic_tags", []) or []),
        "updated_at": getattr(project, "updated_at", None),
    }
