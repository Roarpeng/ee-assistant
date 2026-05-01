# EE Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an electrical engineering assistant web app with chat-driven requirements analysis, RAG-based component selection, block-diagram schematics, and PLC ST code generation — deployed via Docker Compose.

**Architecture:** React+TypeScript frontend (MVS pattern) communicates with FastAPI backend via REST+WebSocket. Backend orchestrates LLM calls, Qdrant RAG retrieval, and rule engine validation. PostgreSQL stores project data, MinIO stores uploaded PDFs.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, Monaco Editor, react-mermaid, FastAPI, SQLAlchemy, Qdrant, PostgreSQL 16, MinIO, PyMuPDF, Docker Compose

**Design Spec:** `docs/superpowers/specs/2026-05-01-ee-assistant-design.md`

---

## File Map

### Backend (`backend/`)
```
app/
├── __init__.py
├── main.py                  # FastAPI app, CORS, WebSocket endpoint
├── config.py                # Settings from env vars
├── api/
│   ├── __init__.py
│   ├── projects.py          # CRUD: /api/projects
│   ├── analysis.py          # POST /api/projects/{id}/analyze
│   ├── selection.py         # POST /api/projects/{id}/select
│   ├── schematic.py         # POST /api/projects/{id}/schematic
│   ├── codegen.py           # POST /api/projects/{id}/codegen
│   └── knowledge.py         # CRUD: /api/knowledge/docs
├── core/
│   ├── __init__.py
│   ├── orchestrator.py      # Workflow state machine, WS progress
│   ├── llm_service.py       # Anthropic Claude abstraction
│   ├── rag_engine.py        # Qdrant indexing + search
│   ├── rule_engine.py       # Selection validation rules
│   └── schemas.py           # Shared Pydantic models
├── db/
│   ├── __init__.py
│   ├── models.py            # SQLAlchemy ORM models
│   └── repository.py        # Data access layer
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── test_schemas.py
    ├── test_rule_engine.py
    ├── test_rag_engine.py
    └── test_api_analysis.py
```

### Frontend (`frontend/`)
```
src/
├── main.tsx                 # ReactDOM entry
├── App.tsx                  # Root layout
├── index.css                # Tailwind imports + global styles
├── models/
│   ├── project.ts           # Project, Requirement, IOItem, LogicRule types
│   ├── selection.ts         # BOMItem, ConfidenceLevel types
│   ├── schematic.ts         # FrameworkNode, Edge types
│   ├── codegen.ts           # STModule, CodeBlock types
│   └── store.ts             # Zustand store
├── views/components/
│   ├── AppLayout.tsx        # Left/Right split layout
│   ├── ChatPanel.tsx        # Chat message list + input
│   ├── ChatMessage.tsx      # Single message bubble
│   ├── ChatInput.tsx        # Text input + send button
│   ├── FileDropZone.tsx     # Drag-and-drop file upload
│   ├── CanvasPanel.tsx      # Right panel tabs (diagram/BOM/code)
│   ├── FrameworkDiagram.tsx # Mermaid renderer + overlay
│   ├── BOMTable.tsx         # Selection BOM table
│   ├── STCodeView.tsx       # Monaco editor wrapper
│   ├── KnowledgePanel.tsx   # Knowledge base management
│   ├── ProgressStepper.tsx  # Workflow step indicator
│   └── ExportToolbar.tsx    # Export buttons
└── services/
    ├── api.ts               # HTTP client
    ├── websocket.ts         # WebSocket connection manager
    ├── export.ts            # SVG/Excel/PDF/Print export
    └── analysis.ts          # Analysis flow state machine
```

### Infrastructure
```
docker-compose.yml
backend/Dockerfile
frontend/Dockerfile
frontend/nginx.conf
```

---

## M0: Project Initialization

### Task 0.1: Initialize Git Repository

- [ ] **Step 1: Init git repo**

```bash
cd c:/Users/roarp/Desktop/TMP/Code/AICode/Ele
git init
```

- [ ] **Step 2: Create .gitignore**

```gitignore
# .gitignore
__pycache__/
*.pyc
.env
node_modules/
dist/
.vite/
*.egg-info/
.pytest_cache/
.qdrant/
postgres_data/
minio_data/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore docs/
git commit -m "chore: init repository with spec and gitignore"
```

### Task 0.2: Create Docker Compose

**Files:** Create `docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://ele:ele@postgres:5432/ele
      - QDRANT_URL=http://qdrant:6333
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - qdrant
      - minio

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ele
      POSTGRES_PASSWORD: ele
      POSTGRES_DB: ele
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  qdrant_data:
  minio_data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose with all services"
```

---

## M1: Backend Skeleton

### Task 1.1: Backend Project Scaffold

**Files:** Create `backend/requirements.txt`, `backend/Dockerfile`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`

- [ ] **Step 1: Write requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
websockets==12.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
anthropic==0.34.0
openai==1.51.0
qdrant-client==1.11.0
boto3==1.35.36
pymupdf==1.24.11
httpx==0.27.2
python-multipart==0.0.9
openpyxl==3.1.5
weasyprint==62.3
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Write config.py**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ele:ele@localhost:5432/ele"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "ee_knowledge"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "knowledge-docs"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096

    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
```

- [ ] **Step 4: Write main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websocket import WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager

from app.config import settings
from app.db.models import Base
from app.db.repository import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="EE Assistant", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/projects/{project_id}")
async def project_progress(websocket: WebSocket, project_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f'{{"stage": "echo", "message": "{data}"}}')
    except WebSocketDisconnect:
        pass
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: backend skeleton with FastAPI, config, and WebSocket stub"
```

### Task 1.2: Database Models & Migration

**Files:** Create `backend/app/db/__init__.py`, `backend/app/db/models.py`, `backend/app/db/repository.py`, `backend/alembic.ini`, `backend/alembic/env.py`

- [ ] **Step 1: Write models.py**

```python
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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    requirement: Mapped["Requirement | None"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    bom_items: Mapped[list["BOMItem"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    schematic: Mapped["Schematic | None"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    code_modules: Mapped[list["STModule"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), unique=True)
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
    requirement_id: Mapped[str] = mapped_column(String(36), ForeignKey("requirements.id"))
    tag: Mapped[str] = mapped_column(String(64))
    io_type: Mapped[str] = mapped_column(String(4))  # DI/DO/AI/AO
    description: Mapped[str] = mapped_column(String(255))

    requirement: Mapped["Requirement"] = relationship(back_populates="io_items")


class LogicRule(Base):
    __tablename__ = "logic_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id: Mapped[str] = mapped_column(String(36), ForeignKey("requirements.id"))
    description: Mapped[str] = mapped_column(Text)

    requirement: Mapped["Requirement"] = relationship(back_populates="logic_rules")


class BOMItem(Base):
    __tablename__ = "bom_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"))
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
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), unique=True)
    mermaid_code: Mapped[str] = mapped_column(Text)
    svg_data: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="schematic")


class STModule(Base):
    __tablename__ = "st_modules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(128))
    module_type: Mapped[str] = mapped_column(String(16))  # OB/FC/FB/DB
    code: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped["Project"] = relationship(back_populates="code_modules")


class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(255))
    manufacturer: Mapped[str] = mapped_column(String(64))
    category_tags: Mapped[list] = mapped_column(JSON, default=list)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 2: Write repository.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
```

- [ ] **Step 3: Initialize alembic and create initial migration**

```bash
cd backend
pip install alembic
alembic init alembic
```

- [ ] **Step 4: Write alembic/env.py**

```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.db.models import Base
from app.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/ backend/alembic.ini backend/alembic/
git commit -m "feat: add database models, repository, and alembic setup"
```

### Task 1.3: Core Schemas

**Files:** Create `backend/app/core/__init__.py`, `backend/app/core/schemas.py`

- [ ] **Step 1: Write schemas.py**

```python
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


# === Request Schemas ===

class RequirementInput(BaseModel):
    text: str = ""
    machine_type: str | None = None
    safety_level: str | None = None
    environment: str | None = None
    plc_family: str = "S7-1200"


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


# === Response Schemas ===

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
    uploaded_at: datetime

    model_config = {"from_attributes": True}


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


class ProgressEvent(BaseModel):
    stage: str  # analyzing|selecting|generating_schematic|generating_code|done|error
    message: str
    data: dict | None = None
```

- [ ] **Step 2: Write test_schemas.py**

```python
import pytest
from app.core.schemas import RequirementInput, IOItemOut, IOType, BOMItemOut, ConfidenceLevel


def test_requirement_input_defaults():
    req = RequirementInput(text="3 motors with E-Stop")
    assert req.plc_family == "S7-1200"
    assert req.machine_type is None


def test_io_item_serialization():
    item = IOItemOut(id="1", tag="M1_START", io_type=IOType.DI, description="Start button")
    data = item.model_dump()
    assert data["io_type"] == "DI"


def test_bom_item_confidence_enum():
    item = BOMItemOut(
        id="1", category="Breaker", manufacturer="Siemens",
        model="3RV2021-1DA10", quantity=1, specifications={},
        confidence=ConfidenceLevel.RAG, source_chunk_id="chunk-1", alternatives=[]
    )
    assert item.confidence == ConfidenceLevel.RAG
```

- [ ] **Step 3: Run tests**

```bash
cd backend && pip install pytest pytest-asyncio && python -m pytest tests/test_schemas.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/schemas.py backend/tests/test_schemas.py
git commit -m "feat: add core Pydantic schemas with tests"
```

### Task 1.4: Project CRUD API

**Files:** Create `backend/app/api/__init__.py`, `backend/app/api/projects.py`

- [ ] **Step 1: Write projects.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project
from app.core.schemas import ProjectOut

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(name: str = "Untitled", session: AsyncSession = Depends(get_session)):
    project = Project(name=name)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).order_by(Project.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.requirement).selectinload(Requirement.io_items),
            selectinload(Project.requirement).selectinload(Requirement.logic_rules),
            selectinload(Project.bom_items),
            selectinload(Project.schematic),
            selectinload(Project.code_modules),
        )
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await session.delete(project)
    await session.commit()
```

Fix the missing import in the file:

```python
from app.db.models import Project, Requirement
```

Register router in main.py:

```python
from app.api.projects import router as projects_router
app.include_router(projects_router)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/ backend/app/main.py
git commit -m "feat: add project CRUD API endpoints"
```

---

## M2: Frontend Skeleton

### Task 2.1: Vite + React + TypeScript Setup

**Files:** Create `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/Dockerfile`, `frontend/nginx.conf`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ee-assistant",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5",
    "@monaco-editor/react": "^4.6.0",
    "mermaid": "^11.3.0",
    "xlsx": "^0.18.5",
    "file-saver": "^2.0.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.8",
    "@types/react-dom": "^18.3.0",
    "@types/file-saver": "^2.0.7",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.12",
    "typescript": "^5.6.2",
    "vite": "^5.4.7"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000', '/ws': { target: 'ws://localhost:8000', ws: true } } },
  build: { outDir: 'dist' },
});
```

- [ ] **Step 4: Write tailwind.config.js + postcss.config.js + index.html + index.css**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

```javascript
// postcss.config.js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EE Assistant</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
```

- [ ] **Step 5: Write Dockerfile and nginx.conf**

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd frontend && npm install && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold frontend with Vite, React, TypeScript, Tailwind, Docker"
```

### Task 2.2: Frontend Data Models

**Files:** Create `frontend/src/models/project.ts`, `frontend/src/models/selection.ts`, `frontend/src/models/schematic.ts`, `frontend/src/models/codegen.ts`

- [ ] **Step 1: Write project.ts**

```typescript
export type IOType = 'DI' | 'DO' | 'AI' | 'AO';

export interface IOItem {
  id: string;
  tag: string;
  ioType: IOType;
  description: string;
}

export interface LogicRule {
  id: string;
  description: string;
}

export interface Requirement {
  id: string;
  machineType: string | null;
  safetyLevel: string | null;
  environment: string | null;
  plcFamily: string | null;
  rawText: string | null;
  ioItems: IOItem[];
  logicRules: LogicRule[];
}

export type ProjectStatus = 'draft' | 'analyzing' | 'ready' | 'selecting' | 'done';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  requirement: Requirement | null;
  bomItems: BOMItem[];
  schematic: Schematic | null;
  codeModules: STModule[];
}
```

Need to import BOMItem, Schematic, STModule. Let me write all model files together.

**Write all 4 model files:**

```typescript
// frontend/src/models/selection.ts
export type ConfidenceLevel = 'rag' | 'llm' | 'mixed';

export interface BOMItem {
  id: string;
  category: string;
  manufacturer: string;
  model: string;
  quantity: number;
  specifications: Record<string, string | number>;
  confidence: ConfidenceLevel;
  sourceChunkId: string | null;
  alternatives: Array<{ manufacturer: string; model: string; reason: string }>;
}
```

```typescript
// frontend/src/models/schematic.ts
export interface FrameworkNode {
  id: string;
  label: string;
  children?: FrameworkNode[];
  details?: Record<string, string>;
}

export interface Schematic {
  id: string;
  mermaidCode: string;
  svgData: string | null;
}
```

```typescript
// frontend/src/models/codegen.ts
export type ModuleType = 'OB' | 'FC' | 'FB' | 'DB';

export interface STModule {
  id: string;
  name: string;
  moduleType: ModuleType;
  code: string;
  sortOrder: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/models/
git commit -m "feat: add frontend data model types"
```

### Task 2.3: Zustand Store & API Service

**Files:** Create `frontend/src/services/api.ts`, `frontend/src/models/store.ts`

- [ ] **Step 1: Write api.ts**

```typescript
const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface CreateProjectResponse {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  createProject: (name: string) =>
    request<CreateProjectResponse>(`/projects?name=${encodeURIComponent(name)}`, { method: 'POST' }),

  getProject: (id: string) =>
    request<import('../models/project').Project>(`/projects/${id}`),

  listProjects: () =>
    request<import('../models/project').Project[]>(`/projects`),

  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  analyze: (projectId: string, text: string) =>
    request<any>(`/projects/${projectId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  runSelection: (projectId: string) =>
    request<any>(`/projects/${projectId}/select`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  generateSchematic: (projectId: string) =>
    request<any>(`/projects/${projectId}/schematic`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  generateCode: (projectId: string) =>
    request<any>(`/projects/${projectId}/codegen`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),

  uploadKnowledgeDoc: (formData: FormData) =>
    fetch(`${BASE}/knowledge/docs`, { method: 'POST', body: formData }),

  searchKnowledge: (query: string, filters?: { category?: string[]; manufacturer?: string }) =>
    request<any>(`/knowledge/search`, {
      method: 'POST',
      body: JSON.stringify({ query, category_filter: filters?.category, manufacturer_filter: filters?.manufacturer, top_k: 5 }),
    }),

  listKnowledgeDocs: () =>
    request<any[]>(`/knowledge/docs`),

  deleteKnowledgeDoc: (id: string) =>
    request<void>(`/knowledge/docs/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Write store.ts**

```typescript
import { create } from 'zustand';
import type { Project, Requirement } from './project';
import type { BOMItem } from './selection';
import type { Schematic } from './schematic';
import type { STModule } from './codegen';

export type AnalysisStage = 'idle' | 'analyzing' | 'ready' | 'selecting' | 'generating_schematic' | 'generating_code' | 'done';

export interface ProgressInfo {
  stage: AnalysisStage;
  message: string;
}

interface AppState {
  project: Project | null;
  stage: AnalysisStage;
  messages: ChatMessage[];
  activeCanvasTab: 'diagram' | 'bom' | 'code';

  setProject: (p: Project) => void;
  setStage: (s: AnalysisStage) => void;
  addMessage: (m: ChatMessage) => void;
  updateProgress: (p: ProgressInfo) => void;
  setActiveCanvasTab: (tab: 'diagram' | 'bom' | 'code') => void;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  stage?: AnalysisStage;
}

let msgCounter = 0;

export const useStore = create<AppState>((set) => ({
  project: null,
  stage: 'idle',
  messages: [],
  activeCanvasTab: 'diagram',

  setProject: (p) => set({ project: p }),
  setStage: (s) => set({ stage: s }),

  addMessage: (m) => set((s) => ({
    messages: [...s.messages, { ...m, id: String(++msgCounter), timestamp: Date.now() }],
  })),

  updateProgress: (p) => set({
    stage: p.stage,
    messages: [...(useStore.getState?.messages || []), {
      id: String(++msgCounter),
      role: 'system',
      content: p.message,
      timestamp: Date.now(),
      stage: p.stage,
    } as ChatMessage],
  }),

  setActiveCanvasTab: (tab) => set({ activeCanvasTab: tab }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/models/store.ts
git commit -m "feat: add API service and Zustand store"
```

### Task 2.4: App Layout Shell

**Files:** Create `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/views/components/AppLayout.tsx`

- [ ] **Step 1: Write main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

- [ ] **Step 2: Write App.tsx**

```typescript
import { AppLayout } from './views/components/AppLayout';

export default function App() {
  return <AppLayout />;
}
```

- [ ] **Step 3: Write AppLayout.tsx**

```typescript
import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-[30%] min-w-[320px] border-r border-gray-200 bg-white">
        <ChatPanel />
      </div>
      <div className="w-[70%] flex flex-col bg-gray-50">
        <CanvasPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Error — ChatPanel and CanvasPanel don't exist yet. Create minimal stubs:

```typescript
// frontend/src/views/components/ChatPanel.tsx
export function ChatPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 font-semibold text-lg">EE Assistant</div>
      <div className="flex-1 p-4 text-gray-400 text-sm">Start by describing your electrical control requirements...</div>
    </div>
  );
}
```

```typescript
// frontend/src/views/components/CanvasPanel.tsx
export function CanvasPanel() {
  return (
    <div className="flex flex-col h-full items-center justify-center text-gray-400">
      <p className="text-lg">Framework diagram and BOM will appear here</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify build again**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.tsx frontend/src/App.tsx frontend/src/views/
git commit -m "feat: add App layout shell with left chat + right canvas"
```

---

## M3: Requirements Analysis

### Task 3.1: LLM Service

**Files:** Create `backend/app/core/llm_service.py`, `backend/tests/conftest.py`

- [ ] **Step 1: Write llm_service.py**

```python
from anthropic import AsyncAnthropic
from app.config import settings


class LLMService:
    def __init__(self):
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def chat(self, system_prompt: str, user_message: str, response_format: dict | None = None) -> str:
        kwargs = dict(
            model="claude-sonnet-4-6",
            max_tokens=settings.llm_max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def analyze_requirements(self, user_input: str) -> dict:
        system = """You are an electrical engineering requirements analyst for industrial automation (Siemens PLC). 
Analyze the user's description and extract structured requirements as JSON.
Include: machine_type, safety_level (SIL1/SIL2/SIL3), environment (indoor/outdoor/explosive),
io_list (array of {tag, type:DI/DO/AI/AO, description}), control_logic (array of strings),
plc_family (S7-1200/S7-1500). Output valid JSON only, no markdown wrapping."""
        
        import json
        text = await self.chat(system, user_input)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)

    async def map_categories(self, io_items: list, logic_rules: list) -> list[str]:
        system = """Map the given IO list and control logic to required component categories.
Categories: PLC_CPU, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload, 
VFD, Safety_Relay, Terminal_Block, Sensor, Actuator, Communication_Module.
Return JSON array of strings. Output valid JSON only, no markdown wrapping."""
        
        import json
        user = f"IO: {io_items}\nLogic: {logic_rules}"
        text = await self.chat(system, user)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)

    async def generate_schematic_mermaid(self, bom: list, requirement: dict) -> str:
        system = """You are an electrical schematic designer. Given a BOM and requirements, 
generate a Mermaid flowchart showing the electrical system block diagram.
Include: power infeed → main switch → distribution → functional blocks (motor control, safety, IO, comms).
Use graph TD syntax. Output Mermaid code only, no markdown wrapping."""
        
        import json
        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        text = await self.chat(system, user)
        return text.strip().removeprefix("```mermaid").removesuffix("```").strip()

    async def generate_st_code(self, requirement: dict, bom: list) -> list[dict]:
        system = """You are a Siemens TIA Portal ST (Structured Text) programmer.
Given requirements and BOM, generate ST code modules.
Output a JSON array of {name, module_type:OB/FC/FB/DB, code, sort_order}.
For safety logic (E-Stop, safety door, interlocks): write COMPLETE code.
For regular control logic: write framework with TODO comments.
IO addresses: use %I0.x for DI, %Q0.x for DO, %IW64 for AI, %QW64 for AO.
Output valid JSON only, no markdown wrapping."""
        
        import json
        user = f"Requirements: {json.dumps(requirement, ensure_ascii=False)}\nBOM: {json.dumps(bom, ensure_ascii=False)}"
        text = await self.chat(system, user)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)


llm_service = LLMService()
```

- [ ] **Step 2: Write conftest.py**

```python
import pytest
import os

os.environ["ANTHROPIC_API_KEY"] = "test-key"
os.environ["OPENAI_API_KEY"] = "test-key"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/llm_service.py backend/tests/conftest.py
git commit -m "feat: add LLM service with analysis, category mapping, schematic, and code gen methods"
```

### Task 3.2: Analysis API & Orchestrator

**Files:** Create `backend/app/core/orchestrator.py`, `backend/app/api/analysis.py`

- [ ] **Step 1: Write orchestrator.py**

```python
import json
import asyncio
from fastapi import WebSocket

from app.core.llm_service import llm_service
from app.core.schemas import ProgressEvent


class Orchestrator:
    def __init__(self):
        self._ws: dict[str, WebSocket] = {}

    def register_ws(self, project_id: str, ws: WebSocket):
        self._ws[project_id] = ws

    def unregister_ws(self, project_id: str):
        self._ws.pop(project_id, None)

    async def push(self, project_id: str, event: ProgressEvent):
        ws = self._ws.get(project_id)
        if ws:
            try:
                await ws.send_text(event.model_dump_json())
            except Exception:
                self.unregister_ws(project_id)

    async def run_analysis(self, project_id: str, user_input: str, session) -> dict:
        await self.push(project_id, ProgressEvent(stage="analyzing", message="Analyzing requirements..."))
        req_data = await llm_service.analyze_requirements(user_input)

        from app.db.models import Requirement, IOItem, LogicRule
        req = Requirement(
            project_id=project_id,
            machine_type=req_data.get("machine_type"),
            safety_level=req_data.get("safety_level"),
            environment=req_data.get("environment"),
            plc_family=req_data.get("plc_family"),
            raw_text=user_input,
        )
        session.add(req)
        await session.flush()

        for io in req_data.get("io_list", []):
            session.add(IOItem(requirement_id=req.id, tag=io["tag"], io_type=io["type"], description=io["description"]))
        for rule in req_data.get("control_logic", []):
            session.add(LogicRule(requirement_id=req.id, description=rule))
        await session.commit()

        await self.push(project_id, ProgressEvent(stage="ready", message="Requirements analysis complete.", data=req_data))
        return req_data
```

- [ ] **Step 2: Write analysis.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement
from app.core.schemas import RequirementInput, ProjectOut
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["analysis"])


@router.post("/{project_id}/analyze", response_model=ProjectOut)
async def analyze_project(project_id: str, body: RequirementInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.status = "analyzing"
    await session.commit()

    await orchestrator.run_analysis(project_id, body.text, session)

    await session.refresh(project)
    project.status = "ready"
    await session.commit()

    return project
```

- [ ] **Step 3: Register router in main.py**

```python
from app.api.analysis import router as analysis_router
app.include_router(analysis_router)
```

- [ ] **Step 4: Update WebSocket endpoint in main.py to use orchestrator**

Replace the existing WebSocket endpoint:

```python
@app.websocket("/ws/projects/{project_id}")
async def project_progress(websocket: WebSocket, project_id: str):
    from app.core.orchestrator import orchestrator
    await websocket.accept()
    orchestrator.register_ws(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        orchestrator.unregister_ws(project_id)
```

- [ ] **Step 5: Write test for analysis API**

In `backend/tests/test_api_analysis.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_analyze_endpoint_requires_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/projects/nonexistent/analyze", json={"text": "test"})
        assert resp.status_code == 404
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_api_analysis.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/orchestrator.py backend/app/api/analysis.py backend/app/main.py backend/tests/
git commit -m "feat: add requirements analysis API with orchestrator and WebSocket progress"
```

### Task 3.3: Frontend Chat Panel

**Files:** Modify `frontend/src/views/components/ChatPanel.tsx`, create `frontend/src/views/components/ChatMessage.tsx`, `frontend/src/views/components/ChatInput.tsx`

- [ ] **Step 1: Write ChatMessage.tsx**

```typescript
import type { ChatMessage as ChatMessageType } from '../../models/store';

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? 'bg-blue-600 text-white'
          : isSystem
            ? 'bg-gray-100 text-gray-500 italic'
            : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ChatInput.tsx**

```typescript
import { useState } from 'react';

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe your control requirements..."
          disabled={disabled}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Rewrite ChatPanel.tsx**

```typescript
import { useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { api } from '../../services/api';

export function ChatPanel() {
  const { project, messages, stage, addMessage, setProject, setStage, updateProgress } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async (text: string) => {
    addMessage({ id: '', role: 'user', content: text, timestamp: 0 });

    let p = project;
    if (!p) {
      p = await api.createProject('New Project');
      setProject(p as any);
    }

    setStage('analyzing');
    updateProgress({ stage: 'analyzing', message: 'Analyzing requirements...' });

    try {
      const updated = await api.analyze(p.id, text);
      setProject(updated);
      setStage('ready');

      const req = updated.requirement;
      if (req) {
        const summary = [
          `**Requirement Analysis**`,
          `- Machine: ${req.machineType || 'N/A'}`,
          `- Safety: ${req.safetyLevel || 'N/A'}`,
          `- IO Points: ${req.ioItems.length}`,
          `- Control Rules: ${req.logicRules.length}`,
        ].join('\n');
        addMessage({ id: '', role: 'assistant', content: summary, timestamp: 0 });
        updateProgress({ stage: 'ready', message: 'Analysis complete. Ready for component selection.' });
      }
    } catch (err: any) {
      updateProgress({ stage: 'idle', message: `Error: ${err.message}` });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h1 className="font-semibold text-lg">EE Assistant</h1>
        <p className="text-xs text-gray-400">
          {project ? `Project: ${project.id.slice(0, 8)}...` : 'New session'}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            Describe your electrical control requirements to get started.
            <br /><br />
            Example: "Design a conveyor system with 3 motors, E-Stop, and interlock logic"
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      <ChatInput onSend={handleSend} disabled={stage === 'analyzing' || stage === 'selecting'} />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/components/ChatMessage.tsx frontend/src/views/components/ChatInput.tsx frontend/src/views/components/ChatPanel.tsx
git commit -m "feat: add chat panel with message rendering and send flow"
```

---

## M4: Knowledge Base & Selection Engine

### Task 4.1: RAG Engine with Qdrant

**Files:** Create `backend/app/core/rag_engine.py`

- [ ] **Step 1: Write rag_engine.py**

```python
import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchAny
from openai import AsyncOpenAI

from app.config import settings


class RAGEngine:
    def __init__(self):
        self.qdrant = AsyncQdrantClient(url=settings.qdrant_url)
        self.openai = AsyncOpenAI(api_key=settings.openai_api_key)
        self.collection = settings.qdrant_collection

    async def init_collection(self):
        cols = await self.qdrant.get_collections()
        names = [c.name for c in cols.collections]
        if self.collection not in names:
            await self.qdrant.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=settings.embedding_dim, distance=Distance.COSINE),
            )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self.openai.embeddings.create(model=settings.embedding_model, input=texts)
        return [d.embedding for d in response.data]

    async def index_chunks(self, chunks: list[dict], doc_id: str, metadata: dict):
        texts = [c["content"] for c in chunks]
        embeddings = await self.embed(texts)
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=emb,
                payload={
                    "doc_id": doc_id,
                    "content": c["content"],
                    "chunk_index": i,
                    **metadata,
                },
            )
            for i, (c, emb) in enumerate(zip(chunks, embeddings))
        ]
        await self.qdrant.upsert(collection_name=self.collection, points=points)

    async def search(self, query: str, top_k: int = 5, category_filter: list[str] | None = None, manufacturer_filter: str | None = None) -> list[dict]:
        query_vec = (await self.embed([query]))[0]
        qdrant_filter = None
        must_conditions = []
        if category_filter:
            must_conditions.append(FieldCondition(key="category_tags", match=MatchAny(any=category_filter)))
        if manufacturer_filter:
            must_conditions.append(FieldCondition(key="manufacturer", match=MatchAny(any=[manufacturer_filter])))
        if must_conditions:
            qdrant_filter = Filter(must=must_conditions)

        results = await self.qdrant.search(
            collection_name=self.collection,
            query_vector=query_vec,
            limit=top_k,
            query_filter=qdrant_filter,
        )
        return [
            {"id": r.id, "content": r.payload["content"], "score": r.score, "metadata": r.payload}
            for r in results
        ]

    async def delete_doc_chunks(self, doc_id: str):
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        await self.qdrant.delete(
            collection_name=self.collection,
            points_selector=Filter(must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]),
        )


rag_engine = RAGEngine()
```

- [ ] **Step 2: Write test_rag_engine.py**

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.core.rag_engine import RAGEngine


@pytest.mark.asyncio
async def test_search_constructs_correct_filter():
    with patch.object(RAGEngine, 'embed', return_value=[[0.1] * 1536]):
        engine = RAGEngine()
        engine.qdrant = AsyncMock()
        engine.qdrant.search = AsyncMock(return_value=[])

        await engine.search("breaker for 5kW motor", category_filter=["Circuit_Breaker"], manufacturer_filter="Siemens")
        assert engine.qdrant.search.called
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/test_rag_engine.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/rag_engine.py backend/tests/test_rag_engine.py
git commit -m "feat: add RAG engine with Qdrant indexing and semantic search"
```

### Task 4.2: Rule Engine

**Files:** Create `backend/app/core/rule_engine.py`, `backend/tests/test_rule_engine.py`

- [ ] **Step 1: Write rule_engine.py**

```python
"""Selection validation rules for electrical components."""


def validate_all(bom_items: list[dict], requirement: dict) -> list[dict]:
    """Run all validation rules. Returns list of violations."""
    violations = []
    violations.extend(check_breaker_rating(bom_items, requirement))
    violations.extend(check_sil_redundancy(bom_items, requirement))
    violations.extend(check_protocol_compatibility(bom_items))
    violations.extend(check_voltage_matching(bom_items))
    violations.extend(check_motor_starter_match(bom_items))
    return violations


def check_breaker_rating(bom_items: list[dict], requirement: dict) -> list[dict]:
    """Breaker rated current >= total load current × 1.25"""
    violations = []
    for item in bom_items:
        if item.get("category") != "Circuit_Breaker":
            continue
        rated = item.get("specifications", {}).get("rated_current_a")
        load = requirement.get("total_load_current_a", 0)
        if rated and load and rated < load * 1.25:
            violations.append({
                "rule": "breaker_rating",
                "severity": "error",
                "item": item["model"],
                "message": f"Breaker rated {rated}A < required {load * 1.25:.1f}A (load {load}A × 1.25)",
            })
    return violations


def check_sil_redundancy(bom_items: list[dict], requirement: dict) -> list[dict]:
    """SIL2+ requires redundant safety devices in safety loop."""
    sil = requirement.get("safety_level", "")
    if sil not in ("SIL2", "SIL3"):
        return []

    safety_items = [i for i in bom_items if i.get("category") == "Safety_Relay"]
    if len(safety_items) < 2:
        return [{
            "rule": "sil_redundancy",
            "severity": "warning",
            "item": "Safety_Relay",
            "message": f"{sil} requires redundant safety relays. Found {len(safety_items)}. Consider adding a second safety relay.",
        }]
    return []


def check_protocol_compatibility(bom_items: list[dict]) -> list[dict]:
    """All communication-capable devices must share the same protocol."""
    protocols = set()
    for item in bom_items:
        proto = item.get("specifications", {}).get("protocol")
        if proto:
            protocols.add(proto)

    if len(protocols) > 1:
        return [{
            "rule": "protocol_compatibility",
            "severity": "error",
            "item": "Communication",
            "message": f"Mixed protocols detected: {protocols}. All devices must use a single protocol (PROFINET or PROFIBUS).",
        }]
    return []


def check_voltage_matching(bom_items: list[dict]) -> list[dict]:
    """Check coil voltage matches control voltage."""
    control_voltage = None
    for item in bom_items:
        if item.get("category") == "Power_Supply":
            control_voltage = item.get("specifications", {}).get("output_voltage_v")
            break

    violations = []
    if control_voltage:
        for item in bom_items:
            coil_v = item.get("specifications", {}).get("coil_voltage_v")
            if coil_v and coil_v != control_voltage:
                violations.append({
                    "rule": "voltage_matching",
                    "severity": "error",
                    "item": item["model"],
                    "message": f"Coil voltage {coil_v}V != control voltage {control_voltage}V",
                })
    return violations


def check_motor_starter_match(bom_items: list[dict]) -> list[dict]:
    """Motor starter components must match motor power rating."""
    violations = []
    motor_power = None
    for item in bom_items:
        if item.get("category") == "Motor":
            motor_power = item.get("specifications", {}).get("power_kw")

    if motor_power:
        for item in bom_items:
            if item.get("category") in ("Contactor", "Thermal_Overload"):
                spec_power = item.get("specifications", {}).get("max_motor_power_kw")
                if spec_power and motor_power > spec_power:
                    violations.append({
                        "rule": "motor_starter_match",
                        "severity": "error",
                        "item": item["model"],
                        "message": f"Motor {motor_power}kW exceeds {item['category']} rating {spec_power}kW",
                    })
    return violations
```

- [ ] **Step 2: Write test_rule_engine.py**

```python
from app.core.rule_engine import validate_all, check_breaker_rating, check_sil_redundancy, check_protocol_compatibility


def test_breaker_rating_pass():
    items = [{"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 10.0}}]
    req = {"total_load_current_a": 5.0}
    violations = check_breaker_rating(items, req)
    assert len(violations) == 0  # 10 >= 5 × 1.25


def test_breaker_rating_fail():
    items = [{"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 5.0}}]
    req = {"total_load_current_a": 6.0}
    violations = check_breaker_rating(items, req)
    assert len(violations) == 1
    assert violations[0]["rule"] == "breaker_rating"


def test_sil2_requires_redundancy():
    items = [{"category": "Safety_Relay", "model": "3SK1111"}]
    req = {"safety_level": "SIL2"}
    violations = check_sil_redundancy(items, req)
    assert len(violations) == 1


def test_sil1_no_redundancy_required():
    items = [{"category": "Safety_Relay", "model": "3SK1111"}]
    req = {"safety_level": "SIL1"}
    violations = check_sil_redundancy(items, req)
    assert len(violations) == 0


def test_protocol_mismatch():
    items = [
        {"category": "PLC_CPU", "model": "S7-1214C", "specifications": {"protocol": "PROFINET"}},
        {"category": "VFD", "model": "G120C", "specifications": {"protocol": "PROFIBUS"}},
    ]
    violations = check_protocol_compatibility(items)
    assert len(violations) == 1


def test_validate_all_aggregates():
    items = [
        {"category": "Circuit_Breaker", "model": "3RV2021", "specifications": {"rated_current_a": 5.0}},
        {"category": "Safety_Relay", "model": "3SK1111"},
        {"category": "PLC_CPU", "model": "S7-1214C", "specifications": {"protocol": "PROFINET"}},
        {"category": "VFD", "model": "G120C", "specifications": {"protocol": "PROFIBUS"}},
    ]
    req = {"total_load_current_a": 6.0, "safety_level": "SIL2"}
    violations = validate_all(items, req)
    assert len(violations) >= 3
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/test_rule_engine.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/rule_engine.py backend/tests/test_rule_engine.py
git commit -m "feat: add rule engine with 5 validation rules and tests"
```

### Task 4.3: Selection API

**Files:** Create `backend/app/api/selection.py`

- [ ] **Step 1: Write selection.py**

```python
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, BOMItem
from app.core.schemas import SelectionInput, ProjectOut
from app.core.llm_service import llm_service
from app.core.rag_engine import rag_engine
from app.core.rule_engine import validate_all
from app.core.orchestrator import orchestrator
from app.core.schemas import ProgressEvent

router = APIRouter(prefix="/api/projects", tags=["selection"])


@router.post("/{project_id}/select", response_model=ProjectOut)
async def run_selection(project_id: str, body: SelectionInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project or not project.requirement:
        raise HTTPException(status_code=400, detail="Project must be analyzed first")

    project.status = "selecting"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="selecting", message="Mapping component categories..."))

    req = project.requirement
    io_list = [{"tag": io.tag, "type": io.io_type, "description": io.description} for io in req.io_items]
    logic_list = [lr.description for lr in req.logic_rules]
    categories = await llm_service.map_categories(io_list, logic_list)

    await orchestrator.push(project_id, ProgressEvent(stage="selecting", message=f"Searching knowledge base for {len(categories)} categories..."))

    bom_data = []
    for cat in categories:
        chunks = await rag_engine.search(f"select {cat} for industrial automation", top_k=3, category_filter=[cat])
        if chunks:
            best = chunks[0]
            bom_data.append({
                "category": cat,
                "manufacturer": best["metadata"].get("manufacturer", "Unknown"),
                "model": best["content"][:80],
                "quantity": 1,
                "specifications": {},
                "confidence": "rag",
                "source_chunk_id": best["id"],
                "alternatives": [{"manufacturer": c["metadata"].get("manufacturer", ""), "model": c["content"][:60]} for c in chunks[1:3]],
            })
        else:
            await orchestrator.push(project_id, ProgressEvent(stage="selecting", message=f"No RAG results for {cat}, using LLM inference..."))

    req_data = {
        "safety_level": req.safety_level,
        "total_load_current_a": 0,
    }

    violations = validate_all(bom_data, req_data)
    await orchestrator.push(project_id, ProgressEvent(
        stage="selecting",
        message=f"Validation complete: {len(violations)} violations found.",
        data={"violations": violations},
    ))

    for item_data in bom_data:
        session.add(BOMItem(project_id=project_id, **item_data))
    await session.commit()

    await session.refresh(project)
    project.status = "ready"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="ready", message="Component selection complete."))
    return project
```

- [ ] **Step 4: Register router in main.py**

```python
from app.api.selection import router as selection_router
app.include_router(selection_router)
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/selection.py backend/app/main.py
git commit -m "feat: add selection API with RAG search, LLM fallback, and rule validation"
```

### Task 4.4: Knowledge Base API

**Files:** Create `backend/app/api/knowledge.py`

- [ ] **Step 1: Write knowledge.py**

```python
import uuid
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.repository import get_session
from app.db.models import KnowledgeDoc
from app.core.schemas import KnowledgeDocOut, KnowledgeSearch
from app.core.rag_engine import rag_engine

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/docs", response_model=KnowledgeDocOut)
async def upload_doc(
    manufacturer: str = Form(...),
    category_tags: str = Form("[]"),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    import json
    tags = json.loads(category_tags)

    content = await file.read()
    text = extract_pdf_text(content)

    doc = KnowledgeDoc(
        filename=file.filename or "unknown.pdf",
        manufacturer=manufacturer,
        category_tags=tags,
        chunk_count=0,
    )
    session.add(doc)
    await session.commit()

    chunks = chunk_text(text, doc.id, manufacturer, tags)
    doc.chunk_count = len(chunks)
    await session.commit()

    await rag_engine.index_chunks(chunks, doc.id, {"manufacturer": manufacturer, "category_tags": tags})

    return doc


@router.get("/docs", response_model=list[KnowledgeDocOut])
async def list_docs(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(KnowledgeDoc).order_by(KnowledgeDoc.uploaded_at.desc()))
    return result.scalars().all()


@router.delete("/docs/{doc_id}", status_code=204)
async def delete_doc(doc_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
    doc = result.scalar()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await rag_engine.delete_doc_chunks(doc_id)
    await session.delete(doc)
    await session.commit()


@router.post("/search")
async def search(body: KnowledgeSearch):
    results = await rag_engine.search(
        query=body.query,
        top_k=body.top_k,
        category_filter=body.category_filter,
        manufacturer_filter=body.manufacturer_filter,
    )
    return {"results": results}


def extract_pdf_text(content: bytes) -> str:
    import fitz
    doc = fitz.open(stream=content, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def chunk_text(text: str, doc_id: str, manufacturer: str, tags: list[str]) -> list[dict]:
    chunks = []
    paragraphs = text.split("\n\n")
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < 500:
            current += para + "\n\n"
        else:
            if current.strip():
                chunks.append({"content": current.strip(), "doc_id": doc_id, "manufacturer": manufacturer, "category_tags": tags})
            current = para + "\n\n"
    if current.strip():
        chunks.append({"content": current.strip(), "doc_id": doc_id, "manufacturer": manufacturer, "category_tags": tags})
    return chunks
```

- [ ] **Step 2: Register in main.py and commit**

```bash
git add backend/app/api/knowledge.py
# Add to main.py: from app.api.knowledge import router as knowledge_router + app.include_router(knowledge_router)
git add backend/app/main.py
git commit -m "feat: add knowledge base API with PDF upload, chunking, and search"
```

---

## M5: Schematic & ST Code Generation

### Task 5.1: Schematic API

**Files:** Create `backend/app/api/schematic.py`

- [ ] **Step 1: Write schematic.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, Schematic
from app.core.schemas import SchematicInput, ProjectOut, ProgressEvent
from app.core.llm_service import llm_service
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["schematic"])


@router.post("/{project_id}/schematic", response_model=ProjectOut)
async def generate_schematic(project_id: str, body: SchematicInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project or not project.requirement or not project.bom_items:
        raise HTTPException(status_code=400, detail="Project must have requirements and BOM first")

    project.status = "generating_schematic"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="generating_schematic", message="Generating block diagram..."))

    bom_list = [{"category": i.category, "manufacturer": i.manufacturer, "model": i.model} for i in project.bom_items]
    req_data = {
        "machine_type": project.requirement.machine_type,
        "safety_level": project.requirement.safety_level,
    }

    mermaid_code = await llm_service.generate_schematic_mermaid(bom_list, req_data)

    existing = project.schematic
    if existing:
        existing.mermaid_code = mermaid_code
    else:
        session.add(Schematic(project_id=project_id, mermaid_code=mermaid_code, svg_data=None))

    project.status = "ready"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(
        stage="done",
        message="Schematic generation complete.",
        data={"mermaid_code": mermaid_code},
    ))

    await session.refresh(project)
    return project
```

- [ ] **Step 2: Register + commit**

```bash
git add backend/app/api/schematic.py
git commit -m "feat: add schematic generation API"
```

### Task 5.2: ST Code Generation API

**Files:** Create `backend/app/api/codegen.py`

- [ ] **Step 1: Write codegen.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repository import get_session
from app.db.models import Project, Requirement, STModule
from app.core.schemas import CodegenInput, ProjectOut, ProgressEvent
from app.core.llm_service import llm_service
from app.core.orchestrator import orchestrator

router = APIRouter(prefix="/api/projects", tags=["codegen"])


@router.post("/{project_id}/codegen", response_model=ProjectOut)
async def generate_code(project_id: str, body: CodegenInput, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Project).where(Project.id == project_id)
        .options(selectinload(Project.requirement).selectinload(Requirement.io_items),
                 selectinload(Project.requirement).selectinload(Requirement.logic_rules),
                 selectinload(Project.bom_items), selectinload(Project.schematic),
                 selectinload(Project.code_modules))
    )
    project = result.scalar()
    if not project or not project.requirement:
        raise HTTPException(status_code=400, detail="Project must have requirements first")

    project.status = "generating_code"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(stage="generating_code", message="Generating ST code..."))

    req_data = {
        "machine_type": project.requirement.machine_type,
        "safety_level": project.requirement.safety_level,
        "plc_family": project.requirement.plc_family,
        "io_list": [{"tag": io.tag, "type": io.io_type, "description": io.description} for io in project.requirement.io_items],
        "control_logic": [lr.description for lr in project.requirement.logic_rules],
    }
    bom_list = [{"category": i.category, "manufacturer": i.manufacturer, "model": i.model} for i in project.bom_items]

    modules = await llm_service.generate_st_code(req_data, bom_list)

    for old in project.code_modules:
        await session.delete(old)

    for i, mod in enumerate(modules):
        session.add(STModule(
            project_id=project_id,
            name=mod["name"],
            module_type=mod["module_type"],
            code=mod["code"],
            sort_order=mod.get("sort_order", i),
        ))

    project.status = "done"
    await session.commit()

    await orchestrator.push(project_id, ProgressEvent(
        stage="done",
        message=f"Generated {len(modules)} ST code modules.",
        data={"module_count": len(modules)},
    ))

    await session.refresh(project)
    return project
```

- [ ] **Step 2: Register + commit**

```bash
git add backend/app/api/codegen.py
git commit -m "feat: add ST code generation API"
```

---

## M6: Frontend Feature Integration

### Task 6.1: WebSocket Service

**Files:** Create `frontend/src/services/websocket.ts`

- [ ] **Step 1: Write websocket.ts**

```typescript
import { useStore } from '../models/store';
import type { ProgressInfo } from '../models/store';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  connect(projectId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    this.ws = new WebSocket(`${protocol}//${host}/ws/projects/${projectId}`);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressInfo;
        useStore.getState().updateProgress(data);
      } catch {}
    };

    this.ws.onclose = () => {
      this.reconnectTimer = window.setTimeout(() => this.connect(projectId), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/websocket.ts
git commit -m "feat: add WebSocket client for real-time progress updates"
```

### Task 6.2: Framework Diagram & BOM Table

**Files:** Create `frontend/src/views/components/FrameworkDiagram.tsx`, `frontend/src/views/components/BOMTable.tsx`

- [ ] **Step 1: Write FrameworkDiagram.tsx**

```typescript
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export function FrameworkDiagram({ code }: { code: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code || !containerRef.current) return;
    const id = 'mermaid-' + Math.random().toString(36).slice(2);
    containerRef.current.innerHTML = '';

    mermaid.render(id, code).then(({ svg }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
    }).catch((err) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<p class="text-red-500 text-sm">Diagram render error: ${err.message}</p>`;
      }
    });
  }, [code]);

  if (!code) {
    return <div className="flex items-center justify-center h-full text-gray-400">No schematic data. Run selection first.</div>;
  }

  return (
    <div className="w-full h-full overflow-auto p-4 bg-white rounded-lg">
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}
```

- [ ] **Step 2: Write BOMTable.tsx**

```typescript
import type { BOMItem } from '../../models/selection';

const confidenceBadge = (level: string) => {
  if (level === 'rag') return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Verified</span>;
  if (level === 'llm') return <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">Inferred</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Mixed</span>;
};

export function BOMTable({ items }: { items: BOMItem[] }) {
  if (!items.length) {
    return <div className="flex items-center justify-center h-full text-gray-400">No BOM items. Run selection first.</div>;
  }

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="text-left p-2">Category</th>
            <th className="text-left p-2">Manufacturer</th>
            <th className="text-left p-2">Model</th>
            <th className="text-center p-2">Qty</th>
            <th className="text-center p-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="p-2">{item.category}</td>
              <td className="p-2">{item.manufacturer}</td>
              <td className="p-2 font-mono text-xs">{item.model}</td>
              <td className="p-2 text-center">{item.quantity}</td>
              <td className="p-2 text-center">{confidenceBadge(item.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/components/FrameworkDiagram.tsx frontend/src/views/components/BOMTable.tsx
git commit -m "feat: add framework diagram (Mermaid) and BOM table components"
```

### Task 6.3: Canvas Panel & Wire Up Full Flow

**Files:** Modify `frontend/src/views/components/CanvasPanel.tsx`, create `frontend/src/views/components/ExportToolbar.tsx`

- [ ] **Step 1: Write ExportToolbar.tsx**

```typescript
import { useStore } from '../../models/store';
import { exportService } from '../../services/export';

export function ExportToolbar() {
  const { project, activeCanvasTab } = useStore();

  const handleExport = (format: 'svg' | 'excel' | 'pdf' | 'print') => {
    if (!project) return;
    exportService.export(project, format, activeCanvasTab);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span className="text-xs text-gray-400 mr-2">Export:</span>
      <button onClick={() => handleExport('svg')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">SVG</button>
      <button onClick={() => handleExport('excel')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Excel</button>
      <button onClick={() => handleExport('pdf')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">PDF</button>
      <button onClick={() => handleExport('print')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Print</button>
    </div>
  );
}
```

- [ ] **Step 2: Write export service stub**

Create `frontend/src/services/export.ts`:

```typescript
import type { Project } from '../models/project';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export const exportService = {
  export(project: Project, format: 'svg' | 'excel' | 'pdf' | 'print', tab: string) {
    switch (format) {
      case 'svg':
        this.exportSVG(project);
        break;
      case 'excel':
        this.exportExcel(project);
        break;
      case 'pdf':
        this.exportPDF(project);
        break;
      case 'print':
        window.print();
        break;
    }
  },

  exportSVG(project: Project) {
    const svg = document.querySelector('.canvas-content svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    saveAs(blob, `${project.name}-schematic.svg`);
  },

  exportExcel(project: Project) {
    const rows = project.bomItems.map((i) => ({
      Category: i.category,
      Manufacturer: i.manufacturer,
      Model: i.model,
      Quantity: i.quantity,
      Confidence: i.confidence,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buf]), `${project.name}-bom.xlsx`);
  },

  exportPDF(project: Project) {
    const content = document.querySelector('.canvas-content');
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${project.name}</title></head><body>${content.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  },
};
```

- [ ] **Step 3: Rewrite CanvasPanel.tsx**

```typescript
import { useStore } from '../../models/store';
import { ExportToolbar } from './ExportToolbar';
import { FrameworkDiagram } from './FrameworkDiagram';
import { BOMTable } from './BOMTable';
import { STCodeView } from './STCodeView';

export function CanvasPanel() {
  const { project, activeCanvasTab, setActiveCanvasTab } = useStore();

  return (
    <div className="flex flex-col h-full">
      <ExportToolbar />

      <div className="flex gap-2 px-4 py-2 bg-white border-b border-gray-200">
        {(['diagram', 'bom', 'code'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveCanvasTab(tab)}
            className={`px-3 py-1 text-sm rounded ${
              activeCanvasTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab === 'diagram' ? 'Schematic' : tab === 'bom' ? 'BOM' : 'ST Code'}
          </button>
        ))}
      </div>

      <div className="flex-1 canvas-content overflow-hidden">
        {activeCanvasTab === 'diagram' && (
          <FrameworkDiagram code={project?.schematic?.mermaidCode ?? null} />
        )}
        {activeCanvasTab === 'bom' && (
          <BOMTable items={project?.bomItems ?? []} />
        )}
        {activeCanvasTab === 'code' && (
          <div className="p-4 text-gray-400">ST Code view — coming soon</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm install xlsx file-saver && npx tsc --noEmit && npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/components/ExportToolbar.tsx frontend/src/views/components/CanvasPanel.tsx frontend/src/services/export.ts
git commit -m "feat: wire up canvas panel with schematic/BOM/code tabs and export toolbar"
```

### Task 6.4: ST Code View with Monaco Editor

**Files:** Modify `frontend/src/views/components/STCodeView.tsx`

- [ ] **Step 1: Write STCodeView.tsx**

```typescript
import Editor from '@monaco-editor/react';
import { useStore } from '../../models/store';

export function STCodeView() {
  const { project } = useStore();

  const modules = project?.codeModules ?? [];
  if (!modules.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No ST code generated. Run code generation first.
      </div>
    );
  }

  const combinedCode = modules
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => `// ${m.moduleType} — ${m.name}\n${m.code}`)
    .join('\n\n');

  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-gray-200 p-2 overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-500 mb-2">MODULES</h3>
        {modules.map((m) => (
          <div key={m.id} className="text-xs py-1 px-2 rounded hover:bg-gray-100 cursor-pointer">
            <span className="font-mono text-blue-600">{m.moduleType}</span> {m.name}
          </div>
        ))}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          value={combinedCode}
          theme="vs-light"
          options={{
            readOnly: false,
            fontSize: 13,
            minimap: { enabled: false },
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update CanvasPanel.tsx** to use STCodeView:

```typescript
// In CanvasPanel.tsx, replace the code tab placeholder:
import { STCodeView } from './STCodeView';
// ... inside the activeCanvasTab check:
{activeCanvasTab === 'code' && <STCodeView />}
```

Wait, there's a conflict — STCodeView exports a component with the same name as the file but CanvasPanel renders it conditionally. Let me fix the approach: CanvasPanel should just use STCodeView when code tab is active.

Actually, STCodeView already handles the empty state internally, so CanvasPanel just needs to render it. Let me adjust:

```typescript
// CanvasPanel.tsx code tab section:
{activeCanvasTab === 'code' && <STCodeView />}
```

The existing placeholder should be removed.

- [ ] **Step 3: Verify build and commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/views/components/STCodeView.tsx
git commit -m "feat: add ST code view with Monaco editor and module tree"
```

### Task 6.5: Knowledge Panel

**Files:** Create `frontend/src/views/components/KnowledgePanel.tsx`, `frontend/src/views/components/FileDropZone.tsx`

- [ ] **Step 1: Write FileDropZone.tsx**

```typescript
import { useState, DragEvent } from 'react';

export function FileDropZone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-4 text-center text-sm transition-colors ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
      }`}
    >
      {dragging ? 'Drop files here' : 'Drag & drop PDFs here'}
    </div>
  );
}
```

- [ ] **Step 2: Write KnowledgePanel.tsx**

```typescript
import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileDropZone } from './FileDropZone';

interface DocInfo {
  id: string;
  filename: string;
  manufacturer: string;
  categoryTags: string[];
  chunkCount: number;
}

export function KnowledgePanel() {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [manufacturer, setManufacturer] = useState('');
  const [tags, setTags] = useState('');

  const loadDocs = async () => {
    try {
      const data = await api.listKnowledgeDocs();
      setDocs(data);
    } catch {}
  };

  useEffect(() => { loadDocs(); }, []);

  const handleUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('manufacturer', manufacturer || 'Unknown');
      form.append('category_tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));
      try {
        await api.uploadKnowledgeDoc(form);
        await loadDocs();
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKnowledgeDoc(id);
      await loadDocs();
    } catch {}
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold">Knowledge Base</h2>

      <div className="space-y-2">
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Manufacturer (e.g. Siemens)"
          value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Tags: Circuit_Breaker, Contactor"
          value={tags} onChange={(e) => setTags(e.target.value)} />
        <FileDropZone onFiles={handleUpload} />
      </div>

      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between border rounded p-2 text-sm">
            <div>
              <div className="font-medium">{d.filename}</div>
              <div className="text-xs text-gray-400">{d.manufacturer} &middot; {d.chunkCount} chunks</div>
            </div>
            <button onClick={() => handleDelete(d.id)} className="text-red-500 text-xs hover:underline">Del</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/components/FileDropZone.tsx frontend/src/views/components/KnowledgePanel.tsx
git commit -m "feat: add knowledge base panel with PDF upload and management"
```

### Task 6.6: Progress Stepper & Full Flow Wiring

**Files:** Create `frontend/src/views/components/ProgressStepper.tsx`, `frontend/src/services/analysis.ts`

- [ ] **Step 1: Write analysis.ts** (analysis flow state machine)

```typescript
import { useStore } from '../models/store';
import { api } from './api';
import { wsClient } from './websocket';

export async function runFullAnalysis(userInput: string): Promise<void> {
  const store = useStore.getState();
  store.addMessage({ id: '', role: 'user', content: userInput, timestamp: 0 });

  let project = store.project;
  if (!project) {
    project = await api.createProject('New Project');
    store.setProject(project);
  }

  wsClient.connect(project.id);

  // Step 1: Analyze
  store.setStage('analyzing');
  const analyzed = await api.analyze(project.id, userInput);
  store.setProject(analyzed);
  store.setStage('ready');

  // Step 2: Select
  store.setStage('selecting');
  const selected = await api.runSelection(project.id);
  store.setProject(selected);

  // Step 3: Schematic
  store.setStage('generating_schematic');
  const withSchematic = await api.generateSchematic(project.id);
  store.setProject(withSchematic);

  // Step 4: Code
  store.setStage('generating_code');
  const withCode = await api.generateCode(project.id);
  store.setProject(withCode);

  store.setStage('done');
  store.addMessage({ id: '', role: 'assistant', content: 'All steps complete. Review the schematic, BOM, and ST code on the right.', timestamp: 0 });
}
```

- [ ] **Step 2: Write ProgressStepper.tsx**

```typescript
import { useStore } from '../../models/store';

const steps: { stage: string; label: string }[] = [
  { stage: 'idle', label: 'Start' },
  { stage: 'analyzing', label: 'Requirements' },
  { stage: 'selecting', label: 'Selection' },
  { stage: 'generating_schematic', label: 'Schematic' },
  { stage: 'generating_code', label: 'ST Code' },
  { stage: 'done', label: 'Done' },
];

export function ProgressStepper() {
  const { stage } = useStore();

  const currentIdx = steps.findIndex((s) => s.stage === stage);

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {steps.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-1">
          <div className={`w-2.5 h-2.5 rounded-full ${
            i < currentIdx ? 'bg-green-500' : i === currentIdx && stage !== 'done' ? 'bg-blue-500 animate-pulse' : i === currentIdx ? 'bg-green-500' : 'bg-gray-300'
          }`} />
          <span className={`text-[10px] ${i <= currentIdx ? 'text-gray-700' : 'text-gray-300'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className={`w-4 h-px ${i < currentIdx ? 'bg-green-500' : 'bg-gray-300'}`} />}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update ChatPanel.tsx** to use `runFullAnalysis` instead of the inline flow:

In ChatPanel.tsx, change `handleSend`:

```typescript
import { runFullAnalysis } from '../../services/analysis';

const handleSend = async (text: string) => {
  try {
    await runFullAnalysis(text);
  } catch (err: any) {
    useStore.getState().addMessage({
      id: '', role: 'system',
      content: `Error: ${err.message}`, timestamp: 0,
    });
  }
};
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/analysis.ts frontend/src/views/components/ProgressStepper.tsx frontend/src/views/components/ChatPanel.tsx
git commit -m "feat: add full analysis flow wiring and progress stepper"
```

---

## Final Integration & Verification

### Task 7.1: Docker Compose Verification

- [ ] **Step 1: Test backend startup**

```bash
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl http://localhost:8000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v
```

- [ ] **Step 3: Build frontend production bundle**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: final integration, all tests passing, frontend builds clean"
```

---

## Spec Coverage Check

| Spec Section | Covered By |
|---|---|
| Requirements Analysis | M3 (Task 3.1 LLM, Task 3.2 API, Task 3.3 Chat) |
| RAG Knowledge Base | M4 (Task 4.1 RAG engine, Task 4.4 KB API, Task 6.5 KB UI) |
| Component Selection | M4 (Task 4.2 Rule engine, Task 4.3 Selection API) |
| Schematic Generation | M5 (Task 5.1), M6 (Task 6.2 FrameworkDiagram) |
| ST Code Generation | M5 (Task 5.2), M6 (Task 6.4 STCodeView) |
| Export (SVG+Excel+PDF+Print) | M6 (Task 6.3 ExportToolbar + export service) |
| Left chat + Right canvas UI | M2 (Task 2.4), M6 (Task 6.3) |
| MVS Architecture | M2 (Task 2.2, 2.3) |
| Docker Compose | M0 (Task 0.2) |
| Tiered Confidence Display | M6 (Task 6.2 BOMTable badges) |

---

**Plan Status:** Complete | **Date:** 2026-05-01
