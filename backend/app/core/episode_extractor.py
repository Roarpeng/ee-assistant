"""Distil a finished AnalysisState (+ that project's decisions) into
a single ``EpisodicMemory`` row.

Deterministic template — no LLM dependency for M3.0; an LLM-based
summariser is deferred to M3.6. Keeping it template-based means tests
are hermetic (no API key) and the orchestrator hook can run on every
``done`` event without paying a model round-trip.

Contract: ``extract_and_store_episode`` is **best-effort**. It returns
the new episode id on success, or ``None`` on any failure. Callers
(today: ``orchestrator._stream_events``) must treat it as telemetry —
a write failure here must never surface to the user or break the
graph.
"""
from __future__ import annotations

from sqlalchemy import select

from app.db.models import Decision, EpisodicMemory
from app.db.repository import async_session


def _summarize(req: dict, bom: list[dict], decisions: list[dict]) -> str:
    """One-line natural-language summary of this analysis run.

    Shape: ``"<machine_type> (<safety_level>) 用 <plc-models> — N 处手动选型; M 处编辑"``
    All segments are individually optional — when the underlying state
    is sparse the summary degrades gracefully rather than emitting an
    empty string (caller relies on ``summary`` being a non-empty Text
    column for retrieval).
    """
    req = req or {}
    machine = req.get("machine_type") or "项目"
    safety = req.get("safety_level")

    plc_models = [
        b.get("model")
        for b in (bom or [])
        if isinstance(b, dict) and b.get("category") == "PLC_CPU" and b.get("model")
    ]

    manual_count = sum(1 for d in decisions if d.get("type") == "manual_select")
    edit_count = sum(1 for d in decisions if "edit" in (d.get("type") or ""))

    safety_part = f" ({safety})" if safety else ""
    plc_part = f" 用 {', '.join(plc_models)}" if plc_models else ""

    extras: list[str] = []
    if manual_count:
        extras.append(f"{manual_count} 处手动选型")
    if edit_count:
        extras.append(f"{edit_count} 处编辑")
    extra_part = "; ".join(extras)
    extra_segment = f" — {extra_part}" if extra_part else ""

    return f"{machine}{safety_part}{plc_part}{extra_segment}".strip()


def _key_decisions(decisions: list[dict]) -> list[dict]:
    """Distil ``manual_select`` + ``*_edit`` rows into a compact form
    suitable for the ``EpisodicMemory.key_decisions`` JSON column.

    ``thumbs_down`` / ``clarify`` are intentionally excluded — they're
    valuable for consolidation (Track B) but noise for cross-project
    selection bias (which is what episodes are for).
    """
    out: list[dict] = []
    for d in decisions:
        t = d.get("type")
        if t == "manual_select":
            after = d.get("after") or {}
            before = d.get("before") or {}
            out.append({
                "type": t,
                "cat": after.get("category"),
                "before": before.get("model"),
                "after": after.get("model") or after.get("order_number"),
                "rationale": d.get("rationale"),
            })
        elif t and "edit" in t:
            out.append({"type": t, "rationale": d.get("rationale")})
    return out


def _is_extractable(req: dict, bom: list, decisions: list) -> bool:
    """Bare state has nothing worth recording. We don't pollute the
    episodic table with empty rows; an analysis that crashed before
    requirements were even parsed has no learnable signal."""
    has_req = bool((req or {}).get("machine_type") or (req or {}).get("safety_level"))
    has_bom = bool(bom)
    has_decisions = bool(decisions)
    return has_req or has_bom or has_decisions


async def extract_and_store_episode(
    project_id: str,
    org_id: str | None,
    final_state: dict | None,
) -> str | None:
    """Write one ``EpisodicMemory`` row distilled from ``final_state`` +
    every ``Decision`` row currently associated with ``project_id``.

    Returns the new episode id, or ``None`` if extraction was skipped
    (empty state) or the DB write failed. Never raises.
    """
    try:
        req = (final_state or {}).get("requirement") or {}
        bom = (final_state or {}).get("bom_items") or []

        async with async_session() as session:
            rows = (await session.execute(
                select(Decision).where(Decision.project_id == project_id)
            )).scalars().all()
            decisions = [{
                "type": r.type,
                "before": r.before,
                "after": r.after,
                "rationale": r.rationale,
                "context": r.context,
            } for r in rows]

            if not _is_extractable(req, bom, decisions):
                return None

            summary = _summarize(req, bom, decisions)
            if not summary:
                # Defensive — _summarize always returns at least the
                # fallback "项目" placeholder, but keep the guard so
                # the NOT NULL Text column never blows up.
                summary = "(空记忆)"

            key_decisions = _key_decisions(decisions)
            # Quality signal: more captured decisions ⇒ higher confidence
            # this episode is worth retrieving later. Capped at 1.0.
            score = min(1.0, 0.4 + 0.1 * len(key_decisions))

            ep = EpisodicMemory(
                project_id=project_id,
                org_id=org_id,
                requirement_snapshot=req if isinstance(req, dict) else {},
                bom_snapshot=bom if isinstance(bom, list) else [],
                key_decisions=key_decisions,
                summary=summary,
                score=score,
            )
            session.add(ep)
            await session.commit()
            await session.refresh(ep)
            return ep.id
    except Exception:
        return None
