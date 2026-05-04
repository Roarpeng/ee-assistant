import operator
from typing import Annotated, TypedDict


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
    graph_traces: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]
    stage: str
    llm_config: dict | None
    embedding_config: dict | None
