import operator
from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


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
    topology: dict | None # { nodes: list, edges: list }
    review_notes: list[str] | None
    project_meta: dict | None  # {safety_level, bom_cost} for InfoPanel
    io_budget: list[dict] | None  # BudgetItem[] for IOBudgetBar
    commissioning_steps: list[dict] | None  # [{title, body}] for GuidePanel
    io_items: list[dict] | None  # [{tag, signal, from, to, wire}] for WiringPanel
    clarification: dict | None  # {needed, groups: [{key, label, choices}]} for ClarifyCard
    graph_traces: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]
    messages: Annotated[list[dict], add_messages]
    llm_fallback_categories: list[str] | None  # categories where RAG had no results
    stage: str
    llm_config: dict | None
    embedding_config: dict | None
    org_id: str | None  # propagated from Project.org_id at run start (M1)
