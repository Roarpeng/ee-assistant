"""Centralized logging configuration for the EE Assistant backend.

Usage in any module::

    import logging
    log = logging.getLogger(__name__)

Call ``setup_logging()`` once at startup (in ``main.py`` lifespan).
"""
import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Configure root logger with a structured, single-line format."""
    fmt = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=fmt,
        stream=sys.stdout,
        force=True,  # override any prior basicConfig calls
    )
    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
