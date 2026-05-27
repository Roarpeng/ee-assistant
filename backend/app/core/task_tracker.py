"""Lightweight registry for asyncio background tasks.

Tracks running/completed/failed tasks so admins can inspect what's happening
and errors are not silently swallowed by fire-and-forget ``create_task()``.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

log = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    running = "running"
    completed = "completed"
    failed = "failed"


class _TaskRecord:
    __slots__ = ("id", "label", "status", "created_at", "finished_at", "error")

    def __init__(self, label: str) -> None:
        self.id = str(uuid.uuid4())[:8]
        self.label = label
        self.status = TaskStatus.running
        self.created_at = datetime.now(timezone.utc)
        self.finished_at: datetime | None = None
        self.error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error": self.error,
        }


class TaskTracker:
    """Process-wide registry of background asyncio tasks."""

    def __init__(self, max_finished: int = 100) -> None:
        self._active: dict[str, _TaskRecord] = {}
        self._finished: list[_TaskRecord] = []
        self._max_finished = max_finished

    def track(self, coro: Any, *, label: str) -> asyncio.Task:
        """Wrap *coro* in an asyncio.Task, register it, and return the task.

        On completion (success or failure) the record is moved from active
        to finished.  Errors are logged and stored in the record.
        """
        record = _TaskRecord(label)
        self._active[record.id] = record

        async def _wrapper():
            try:
                result = await coro
                record.status = TaskStatus.completed
                return result
            except Exception as exc:
                record.status = TaskStatus.failed
                record.error = str(exc)[:500]
                log.error("Background task '%s' (%s) failed: %r", label, record.id, exc)
                raise
            finally:
                record.finished_at = datetime.now(timezone.utc)
                self._active.pop(record.id, None)
                self._finished.append(record)
                if len(self._finished) > self._max_finished:
                    self._finished = self._finished[-self._max_finished :]

        task = asyncio.create_task(_wrapper(), name=f"bg:{label}:{record.id}")
        return task

    def list_active(self) -> list[dict[str, Any]]:
        return [r.to_dict() for r in self._active.values()]

    def list_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        return [r.to_dict() for r in self._finished[-limit:]]

    def summary(self) -> dict[str, int]:
        return {
            "running": len(self._active),
            "recent_finished": len(self._finished),
            "recent_failed": sum(1 for r in self._finished if r.status == TaskStatus.failed),
        }


# Singleton
task_tracker = TaskTracker()
