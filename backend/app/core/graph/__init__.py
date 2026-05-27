# Lazy re-export: avoids importing builder.py (and its heavy
# langgraph-checkpoint-postgres dependency) at package-import time.
# This keeps ``from app.core.graph.agents import …`` usable in tests
# even when the Postgres checkpointer package is not installed.

def __getattr__(name: str):
    if name == "build_graph":
        from app.core.graph.builder import build_graph
        return build_graph
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
