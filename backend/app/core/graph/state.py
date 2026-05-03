from typing import TypedDict


class AnalysisState(TypedDict):
    project_id: str
    user_input: str
    requirement: dict | None
    categories: list[str] | None
    safety_level: str | None
    constraints: dict | None
    bom_items: list[dict] | None
    violations: list[dict] | None
    mermaid_code: str | None
    st_modules: list[dict] | None
    review_notes: list[str] | None
    graph_traces: list[dict]
    errors: list[str]
    stage: str
