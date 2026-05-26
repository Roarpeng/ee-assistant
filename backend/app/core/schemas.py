from __future__ import annotations
from datetime import datetime
from pydantic import AliasChoices, BaseModel, Field
from enum import Enum


class IOType(str, Enum):
    DI = "DI"
    DO = "DO"
    AI = "AI"
    AO = "AO"


class ConfidenceLevel(str, Enum):
    RAG = "rag"
    LLM = "llm"
    MIXED = "mixed"


class ModuleType(str, Enum):
    OB = "OB"
    FC = "FC"
    FB = "FB"
    DB = "DB"


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    ANALYZING = "analyzing"
    READY = "ready"
    SELECTING = "selecting"
    DONE = "done"


class RequirementInput(BaseModel):
    text: str = Field("", validation_alias=AliasChoices("text", "message"))
    machine_type: str | None = None
    safety_level: str | None = None
    environment: str | None = None
    plc_family: str = "S7-1200"
    llm_config: dict | None = None
    embedding_config: dict | None = None
    history: list[dict] | None = None
    canvas_context: dict | None = None


class ChatInput(BaseModel):
    text: str = Field("", validation_alias=AliasChoices("text", "message"))
    history: list[dict] = Field(default_factory=list)
    canvas_context: dict = Field(default_factory=dict)
    llm_config: dict | None = None


class SelectionInput(BaseModel):
    project_id: str


class SchematicInput(BaseModel):
    project_id: str


class CodegenInput(BaseModel):
    project_id: str


class TopologySnapshotInput(BaseModel):
    snapshot: dict = Field(default_factory=lambda: {"nodes": [], "edges": []})
    source: str = "user"


class TopologyConfirmInput(BaseModel):
    topology_id: str | None = None


class TopologyOut(BaseModel):
    id: str
    project_id: str
    version: int
    status: str
    source: str
    snapshot: dict
    created_at: datetime
    confirmed_at: datetime | None = None
    model_config = {"from_attributes": True}


class KnowledgeDocUpload(BaseModel):
    manufacturer: str
    category_tags: list[str] = Field(default_factory=list)


class KnowledgeSearch(BaseModel):
    query: str
    category_filter: list[str] | None = None
    manufacturer_filter: str | None = None
    top_k: int = 5
    embedding_config: dict | None = None


class IOItemOut(BaseModel):
    id: str
    tag: str
    io_type: IOType
    description: str
    model_config = {"from_attributes": True}


class LogicRuleOut(BaseModel):
    id: str
    description: str
    model_config = {"from_attributes": True}


class RequirementOut(BaseModel):
    id: str
    machine_type: str | None
    safety_level: str | None
    environment: str | None
    plc_family: str | None
    raw_text: str | None
    io_items: list[IOItemOut] = Field(default_factory=list)
    logic_rules: list[LogicRuleOut] = Field(default_factory=list)
    model_config = {"from_attributes": True}


class BOMItemOut(BaseModel):
    id: str
    category: str
    manufacturer: str
    model: str
    quantity: int
    specifications: dict = Field(default_factory=dict)
    confidence: ConfidenceLevel
    source_chunk_id: str | None
    alternatives: list[dict] = Field(default_factory=list)
    model_config = {"from_attributes": True}


class SchematicOut(BaseModel):
    id: str
    mermaid_code: str
    svg_data: str | None
    model_config = {"from_attributes": True}


class STModuleOut(BaseModel):
    id: str
    name: str
    module_type: ModuleType
    code: str
    sort_order: int
    model_config = {"from_attributes": True}


class KnowledgeDocOut(BaseModel):
    id: str
    filename: str
    manufacturer: str
    category_tags: list[str]
    chunk_count: int
    status: str
    source_type: str = "pdf"
    source_url: str | None = None
    uploaded_at: datetime
    model_config = {"from_attributes": True}


class KnowledgeURLIngest(BaseModel):
    """Body for POST /api/knowledge/urls — single-page web ingestion."""
    url: str
    manufacturer: str = "Unknown"
    category_tags: list[str] = Field(default_factory=list)
    llm_config: dict | None = None
    embedding_config: dict | None = None


class BatchDeleteInput(BaseModel):
    ids: list[str]


class KnowledgeRetryInput(BaseModel):
    llm_config: dict | None = None
    embedding_config: dict | None = None


class KnowledgeChunkOut(BaseModel):
    id: str
    content: str
    metadata: dict


class ProjectOut(BaseModel):
    id: str
    name: str
    # Conversation-workspace surface (alembic 008): short LLM-derived title
    # for the project list, topic_tags drive the cluster sidebar. Default
    # to safe empties so legacy Project rows that pre-date 008 still
    # validate via from_attributes.
    title: str | None = None
    topic_tags: list[str] = Field(default_factory=list)
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    requirement: RequirementOut | None = None
    bom_items: list[BOMItemOut] = Field(default_factory=list)
    schematic: SchematicOut | None = None
    code_modules: list[STModuleOut] = Field(default_factory=list)
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Conversation-workspace: search + clustering
# ---------------------------------------------------------------------------


class ProjectSearchInput(BaseModel):
    """Body for POST /api/projects/search — full-text-ish project lookup."""
    query: str
    limit: int = 20


class ClusterProjectItem(BaseModel):
    """Slim projection of a Project, suitable for the cluster sidebar.

    We deliberately omit heavy relations (bom_items, schematic, code_modules)
    so a 200-project list stays cheap to serialize.
    """
    id: str
    name: str
    title: str | None = None
    topic_tags: list[str] = Field(default_factory=list)
    updated_at: datetime
    model_config = {"from_attributes": True}


class ClusterGroup(BaseModel):
    """A coherent group of related projects produced by the cluster engine."""
    label: str
    project_ids: list[str] = Field(default_factory=list)
    projects: list[ClusterProjectItem] = Field(default_factory=list)


class ClusterResponse(BaseModel):
    """Full cluster sidebar payload: grouped + leftover projects."""
    clusters: list[ClusterGroup] = Field(default_factory=list)
    unclustered: list[ClusterProjectItem] = Field(default_factory=list)


class ClusterRequest(BaseModel):
    embedding_config: dict | None = None


class ConnectivityTestInput(BaseModel):
    # chat:      {api_key, base_url, model, provider?}
    # embedding: {api_key, base_url, model, dimension, provider?}
    # `provider` is an optional canonical id (see app.core.llm_providers.PROVIDERS)
    # used to pick the right embedding-dimensions behaviour without relying on
    # base_url substring matching.
    chat: dict
    embedding: dict


class ProgressEvent(BaseModel):
    stage: str
    message: str
    data: dict | None = None


class ResumeRequest(BaseModel):
    """Human-provided manual component selection to resume a paused workflow."""
    manual_selections: list[dict] = Field(default_factory=list)
    # Each dict: {"category": str, "manufacturer": str, "order_number": str, "model": str, "quantity": int}


# ── GraphRAG API Schemas ──

class GraphRetrievalRequestSchema(BaseModel):
    """API request body for graph-based component retrieval."""
    category: str
    machine_type: str = ""
    safety_level: str = ""
    plc_family: str = "S7-1200"
    required_protocols: list[str] = Field(default_factory=list)
    constraints: dict = Field(default_factory=dict)


class ComponentNodeOut(BaseModel):
    """API response: a component node from the knowledge graph."""
    id: str
    name: str
    component_type: str
    manufacturer: str = ""
    order_number: str = ""
    properties: dict = Field(default_factory=dict)
    community: str | None = None


class AccessoryRequirementOut(BaseModel):
    """API response: a mandatory accessory dependency."""
    source_component_id: str
    target_accessory_type: str
    target_order_number: str = ""
    target_name: str = ""
    relation: str
    quantity: int = 1
    mandatory: bool = True


class GraphRetrievalResponseSchema(BaseModel):
    """API response for graph-based component retrieval."""
    status: str  # FOUND | NOT_FOUND | PARTIAL | EMPTY
    components: list[ComponentNodeOut] = Field(default_factory=list)
    accessory_requirements: list[AccessoryRequirementOut] = Field(default_factory=list)
    missing_accessories: list[str] = Field(default_factory=list)
    graph_trace: list[dict] = Field(default_factory=list)
    human_intervention_required: bool = False
    message: str = ""


class HybridSearchResponseSchema(BaseModel):
    """API response for dual-path (graph + vector) retrieval."""
    graph_result: GraphRetrievalResponseSchema
    vector_results: list[dict] = Field(default_factory=list)
    requires_human_review: bool = False


# ── Chat message persistence (M0 Track B) ──

class ChatMessageIn(BaseModel):
    role: str
    content: str
    options: list[dict] | None = None


class ChatMessageOut(BaseModel):
    id: str
    project_id: str
    role: str
    content: str
    options: list[dict] | None
    sequence: int
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Organizations + preferences (M1 Track A) ──

class OrgIn(BaseModel):
    name: str


class OrgCreated(BaseModel):
    id: str
    name: str
    code: str
    token: str  # only shown at creation


class OrgOut(BaseModel):
    id: str
    name: str
    code: str

    model_config = {"from_attributes": True}


class PrefIn(BaseModel):
    value: dict
    confidence: float | None = None
    source: str | None = None


class PrefOut(BaseModel):
    key: str
    value: dict
    confidence: float
    source: str
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Memory flywheel M2: feedback + memory-sources ──


class SelectFeedbackIn(BaseModel):
    """Body for POST /api/projects/{pid}/feedback/select."""
    category: str
    manufacturer: str
    model: str
    before: dict | None = None
    rationale: str | None = None


class SelectFeedbackOut(BaseModel):
    decision_id: str
    weight: float


class EditFeedbackIn(BaseModel):
    """Body for POST /api/projects/{pid}/feedback/edit."""
    target: str  # 'bom' | 'wiring' | 'topology'
    before: dict
    after: dict
    rationale: str | None = None


class EditFeedbackOut(BaseModel):
    decision_id: str


class NegativeFeedbackIn(BaseModel):
    """Body for POST /api/projects/{pid}/feedback/negative."""
    target: str  # 'bom_row' | 'general'
    context: dict = Field(default_factory=dict)
    rationale: str | None = None


class NegativeFeedbackOut(BaseModel):
    decision_id: str


class MemorySourcesOut(BaseModel):
    """Response for GET /api/projects/{pid}/memory-sources/{cat}/{mfg}/{model}."""
    org_pref_match: bool = False
    selection_weight: float = 0.0
    similar_episodes_count: int = 0  # M3 placeholder
    kb_doc_hits: int = 0  # M3 placeholder
    total_signals: int = 0


# ── Memory flywheel M3: episodic memories + weekly reports ──


class EpisodeOut(BaseModel):
    """Read-shape for ``GET /api/orgs/me/episodes`` (and reusable from
    Track B's retrieval endpoints).

    We deliberately omit ``requirement_snapshot`` / ``bom_snapshot``
    from the listing payload — they can be heavy and the UI's "memory"
    tab only renders the summary + decision count today. A detail
    endpoint can surface them later if needed.
    """

    id: str
    project_id: str
    org_id: str | None
    summary: str
    key_decisions: list[dict] = Field(default_factory=list)
    score: float
    created_at: datetime
    model_config = {"from_attributes": True}


class ReportOut(BaseModel):
    """Read-shape for ``GET /api/orgs/me/memory-reports`` (Track B
    writes the rows; Track A owns the schema)."""

    id: str
    org_id: str | None
    period_start: datetime
    period_end: datetime
    new_rules: list[dict] = Field(default_factory=list)
    revisions: list[dict] = Field(default_factory=list)
    gaps: list[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Component Graph Visualizer & Editor Schemas ──

class ComponentGraphNodeCreate(BaseModel):
    name: str
    component_type: str
    properties: dict = Field(default_factory=dict)
    source_doc_id: str | None = None


class ComponentGraphNodeOut(BaseModel):
    id: str
    name: str
    component_type: str
    properties: dict = Field(default_factory=dict)
    community: str | None = None
    source_doc_id: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ComponentGraphEdgeCreate(BaseModel):
    source_id: str
    target_id: str
    relation: str
    properties: dict = Field(default_factory=dict)
    confidence: str = "extracted"
    source_doc_id: str | None = None


class ComponentGraphEdgeOut(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation: str
    properties: dict = Field(default_factory=dict)
    confidence: str
    source_doc_id: str | None = None
    model_config = {"from_attributes": True}
