from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field
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
    text: str = Field("", validation_alias="message")
    machine_type: str | None = None
    safety_level: str | None = None
    environment: str | None = None
    plc_family: str = "S7-1200"
    llm_config: dict | None = None
    embedding_config: dict | None = None


class SelectionInput(BaseModel):
    project_id: str


class SchematicInput(BaseModel):
    project_id: str


class CodegenInput(BaseModel):
    project_id: str


class KnowledgeDocUpload(BaseModel):
    manufacturer: str
    category_tags: list[str] = Field(default_factory=list)


class KnowledgeSearch(BaseModel):
    query: str
    category_filter: list[str] | None = None
    manufacturer_filter: str | None = None
    top_k: int = 5


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
    uploaded_at: datetime
    model_config = {"from_attributes": True}


class BatchDeleteInput(BaseModel):
    ids: list[str]


class KnowledgeChunkOut(BaseModel):
    id: str
    content: str
    metadata: dict


class ProjectOut(BaseModel):
    id: str
    name: str
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    requirement: RequirementOut | None = None
    bom_items: list[BOMItemOut] = Field(default_factory=list)
    schematic: SchematicOut | None = None
    code_modules: list[STModuleOut] = Field(default_factory=list)
    model_config = {"from_attributes": True}


class ConnectivityTestInput(BaseModel):
    chat: dict  # {api_key, base_url, model}
    embedding: dict  # {api_key, base_url, model, dimension}


class ProgressEvent(BaseModel):
    stage: str
    message: str
    data: dict | None = None
