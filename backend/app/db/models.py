import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, JSON, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), default="Untitled")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft|analyzing|ready|selecting|done
    org_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    requirement: Mapped["Requirement | None"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    bom_items: Mapped[list["BOMItem"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    schematic: Mapped["Schematic | None"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    code_modules: Mapped[list["STModule"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    topologies: Mapped[list["ProjectTopology"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), unique=True, nullable=False)
    machine_type: Mapped[str | None] = mapped_column(String(128))
    safety_level: Mapped[str | None] = mapped_column(String(16))
    environment: Mapped[str | None] = mapped_column(String(64))
    plc_family: Mapped[str | None] = mapped_column(String(64))
    raw_text: Mapped[str | None] = mapped_column(Text)

    project: Mapped["Project"] = relationship(back_populates="requirement")
    io_items: Mapped[list["IOItem"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")
    logic_rules: Mapped[list["LogicRule"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")


class IOItem(Base):
    __tablename__ = "io_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id: Mapped[str] = mapped_column(String(36), ForeignKey("requirements.id"), nullable=False)
    tag: Mapped[str] = mapped_column(String(64))
    io_type: Mapped[str] = mapped_column(String(4))  # DI/DO/AI/AO
    description: Mapped[str] = mapped_column(String(255))

    requirement: Mapped["Requirement"] = relationship(back_populates="io_items")


class LogicRule(Base):
    __tablename__ = "logic_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id: Mapped[str] = mapped_column(String(36), ForeignKey("requirements.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text)

    requirement: Mapped["Requirement"] = relationship(back_populates="logic_rules")


class BOMItem(Base):
    __tablename__ = "bom_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(64))
    manufacturer: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    specifications: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[str] = mapped_column(String(16))  # rag|llm|mixed
    source_chunk_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    alternatives: Mapped[list] = mapped_column(JSON, default=list)

    project: Mapped["Project"] = relationship(back_populates="bom_items")


class Schematic(Base):
    __tablename__ = "schematics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), unique=True, nullable=False)
    mermaid_code: Mapped[str] = mapped_column(Text)
    svg_data: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="schematic")


class STModule(Base):
    __tablename__ = "st_modules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128))
    module_type: Mapped[str] = mapped_column(String(16))  # OB/FC/FB/DB
    code: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped["Project"] = relationship(back_populates="code_modules")


class ProjectTopology(Base):
    __tablename__ = "project_topologies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    source: Mapped[str] = mapped_column(String(32), default="user")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="topologies")


class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(255))
    manufacturer: Mapped[str] = mapped_column(String(64))
    category_tags: Mapped[list] = mapped_column(JSON, default=list)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="uploading")
    # Canonical short tag: pdf|txt|md|html|docx|url. Set by the extractor
    # dispatch (or by the URL endpoint). Defaults to 'pdf' so old rows
    # migrated in place keep their original semantics.
    source_type: Mapped[str] = mapped_column(String(16), default="pdf", server_default="pdf")
    # Populated only when the doc originated from /api/knowledge/urls.
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ComponentNode(Base):
    __tablename__ = "component_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    component_type: Mapped[str] = mapped_column(String(64))
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    community: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_doc_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_docs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source_doc: Mapped["KnowledgeDoc | None"] = relationship()
    outgoing_edges: Mapped[list["ComponentEdge"]] = relationship(
        back_populates="source_node", foreign_keys="ComponentEdge.source_id"
    )


class ComponentEdge(Base):
    __tablename__ = "component_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id: Mapped[str] = mapped_column(String(36), ForeignKey("component_nodes.id"), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), ForeignKey("component_nodes.id"), nullable=False)
    relation: Mapped[str] = mapped_column(String(32))
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[str] = mapped_column(String(16), default="extracted")
    source_doc_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_docs.id", ondelete="SET NULL"), nullable=True)

    source_node: Mapped["ComponentNode"] = relationship(
        back_populates="outgoing_edges", foreign_keys=[source_id]
    )
    target_node: Mapped["ComponentNode"] = relationship(foreign_keys=[target_id])
    source_doc: Mapped["KnowledgeDoc | None"] = relationship()


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # sha256 hex
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OrgPreference(Base):
    __tablename__ = "org_preferences"

    org_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    # 'clarify' | 'admin' | 'inferred'
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="clarify")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# ── Memory flywheel M2: decisions / run_history / selection_weights ──


class Decision(Base):
    """Captured user decision that disagreed with (or confirmed) the AI's
    suggestion. Drives the org-level selection bias loop in M2 and the
    per-org learned-preferences synthesis in M3."""

    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), index=True, nullable=False
    )
    org_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    # 'manual_select' | 'bom_edit' | 'wiring_edit' | 'topology_edit' |
    # 'thumbs_down' | 'clarify'
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    context: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class RunHistory(Base):
    """Per-analysis-run telemetry. Track B writes start/finish; Track A
    just owns the table definition + migration."""

    __tablename__ = "run_history"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), index=True, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # {node_name: ms_elapsed}
    nodes_executed: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # [{"node": str, "error": str}, ...]
    errors: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    final_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SelectionWeight(Base):
    """Per-(org, category, manufacturer, model) accumulator that biases
    selection_supervisor candidate ordering. NULL `org_id` is reserved
    for "global" preferences; the service layer substitutes the literal
    string ``"_global_"`` to side-step SQLite NULL-in-composite-PK
    quirks."""

    __tablename__ = "selection_weights"

    org_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("organizations.id"),
        primary_key=True,
        nullable=True,
    )
    category: Mapped[str] = mapped_column(String(64), primary_key=True)
    manufacturer: Mapped[str] = mapped_column(String(120), primary_key=True)
    model: Mapped[str] = mapped_column(String(120), primary_key=True)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_selected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# ── Memory flywheel M3: episodic_memories / weekly_memory_reports ──


class EpisodicMemory(Base):
    """One row per finished analysis run — distilled into a one-line
    summary plus the structured ``key_decisions`` extracted from the
    run's ``decisions`` rows. The selection_supervisor (Track B) reads
    the most-recent N rows for an org to inject historical context into
    the prompt.

    ``embedding_id`` is reserved for M3.6 (Qdrant hybrid search); today's
    retrieval is plain SQL ``ORDER BY created_at DESC``.
    """

    __tablename__ = "episodic_memories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False, index=True
    )
    org_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    requirement_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    bom_snapshot: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # [{cat, before, after, rationale, type}, ...]
    key_decisions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class WeeklyMemoryReport(Base):
    """Sleep-time consolidation output (owned by Track B's
    ``consolidation_service``). Track A owns only the table definition
    so Track B can land its writer + endpoints against a stable schema.

    Each row is a snapshot of decisions analysed in the given period:
      - ``new_rules``: (cat × manufacturer × model) tuples seen ≥ 3
        times in ``manual_select`` decisions
      - ``revisions``: edit targets that recurred in the period
      - ``gaps``: thumbs_down decisions grouped by component
      - ``metrics``: scan counts (decisions_scanned, candidate_rules, ...)
    """

    __tablename__ = "weekly_memory_reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    org_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    new_rules: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    revisions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    gaps: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
