# Graph Report - .  (2026-05-03)

## Corpus Check
- 72 files ， ~25,924 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 344 nodes ， 466 edges ， 36 communities detected
- Extraction: 74% EXTRACTED ， 26% INFERRED ， 0% AMBIGUOUS ， INFERRED: 121 edges (avg confidence: 0.76)
- Token cost: 0 input ， 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `ComponentGraph` - 15 edges
2. `Base` - 13 edges
3. `Orchestrator` - 11 edges
4. `Orchestrator (WebSocket progress + analysis flow)` - 11 edges
5. `RAGEngine` - 10 edges
6. `validate_all()` - 10 edges
7. `LLMService` - 8 edges
8. `ProgressEvent` - 8 edges
9. `Initial migration: all 8 tables` - 8 edges
10. `Project ORM model` - 8 edges

## Surprising Connections (you probably didn't know these)
- `runFullAnalysis (Analysis Flow State Machine)` --semantically_similar_to--> `Orchestrator (Backend Workflow State Machine)`  [INFERRED] [semantically similar]
  frontend/src/services/analysis.ts ★ docs/superpowers/specs/2026-05-01-ee-assistant-design.md
- `FrameworkDiagram Component` --implements--> `Schematic Generation Stage`  [INFERRED]
  frontend/src/views/components/FrameworkDiagram.tsx ★ docs/superpowers/specs/2026-05-01-ee-assistant-design.md
- `exportService` --conceptually_related_to--> `Schematic Generation Stage`  [INFERRED]
  frontend/src/services/export.ts ★ docs/superpowers/specs/2026-05-01-ee-assistant-design.md
- `MVS Architecture Pattern` --rationale_for--> `Zustand Global Store (useStore)`  [INFERRED]
  docs/superpowers/specs/2026-05-01-ee-assistant-design.md ★ frontend/src/models/store.ts
- `rule_validator()` --calls--> `validate_all()`  [INFERRED]
  backend\app\core\graph\agents.py ★ backend\app\core\rule_engine.py

## Hyperedges (group relationships)
- **Requirements Analysis Pipeline: LLM extracts structured reqs -> saves to Requirement/IOItem/LogicRule models -> pushes WebSocket progress** ！ api_analysis_analyze, orchestrator, llm_service, models_requirement, models_ioitem, models_logicrule, schemas_progress_event [INFERRED 0.90]
- **Component Selection Pipeline: LLM maps categories -> RAG searches knowledge base -> Rule engine validates -> saves BOMItem** ！ api_selection_select, llm_service, rag_engine, rule_engine_validate_all, models_bomitem, orchestrator [INFERRED 0.90]
- **ST Code Generation Pipeline: LLM generates ST modules -> saves to STModule -> pushes WebSocket progress** ！ api_codegen_generate, llm_service, models_stmodule, orchestrator, schemas_progress_event, models_project [INFERRED 0.85]
- **Full Analysis Workflow Pipeline** ！ runFullAnalysis, api, useStore, WebSocketClient [INFERRED 0.85]
- **Frontend Domain Model Aggregate** ！ Project, Requirement, BOMItem, Schematic, STModule [INFERRED 0.90]
- **Backend Test Infrastructure Suite** ！ conftest_setup_database, test_api_analysis, test_rag_engine, test_rule_engine, test_schemas [INFERRED 0.85]
- **Full Analysis Pipeline: ChatPanel triggers runFullAnalysis which calls api.analyze -> api.runSelection -> api.generateSchematic -> api.generateCode** ！ chatpanel_ChatPanel, analysis_runFullAnalysis, api_service, progressstepper_ProgressStepper, design_Requirements_Analysis, design_Component_Selection_Engine, design_Schematic_Generation, design_ST_Code_Generation [INFERRED 0.85]
- **MVS Canvas Rendering: CanvasPanel (View) reads useStore (Model) to route tabs; ExportToolbar delegates to exportService (Service)** ！ canvaspanel_CanvasPanel, store_useStore, frameworkdiagram_FrameworkDiagram, bomtable_BOMTable, stcodeview_STCodeView, exporttoolbar_ExportToolbar, export_exportService [INFERRED 0.85]
- **Tiered Confidence Display: BOMTable calls confidenceBadge for rag/llm/mixed levels defined in Component Selection Engine design** ！ bomtable_BOMTable, knowledgepanel_confidenceBadge, design_Tiered_Confidence_Display, design_Component_Selection_Engine [INFERRED 0.88]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (19): analyze_project_v2(), generate_code(), generate_schematic(), AsyncAttrs, Component knowledge graph ！ CRUD + BFS traversal over PostgreSQL tables., Orchestrator, Base, BOMItem (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (34): Alembic migration environment config, Initial migration: all 8 tables, POST /api/projects/{id}/analyze endpoint, POST /api/projects/{id}/codegen endpoint, chunk_text(), extract_pdf_text (PyMuPDF), search(), POST /api/knowledge/docs endpoint (PDF upload) (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (26): BaseModel, BOMItemOut, CodegenInput, ConfidenceLevel, IOItemOut, IOType, KnowledgeChunkOut, KnowledgeDocOut (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (25): runFullAnalysis (Analysis Flow State Machine), API Client Service, BOMTable Component, CanvasPanel Component, ChatInput Component, ChatMessage Component, ChatPanel Component, Component Selection Engine (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (4): ComponentGraph, RAGEngine, Dual-path search: Qdrant semantic + graph neighbor lookup., test_search_constructs_correct_filter()

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (14): run_selection(), check_breaker_rating(), check_motor_starter_match(), check_protocol_compatibility(), check_sil_redundancy(), check_voltage_matching(), Selection validation rules for electrical components., validate_all() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (6): fanout_selection_supervisor(), LangGraph agent node functions ！ each node receives state, returns partial state, Fan-out: for each category, search RAG + graph neighbors. One async session per, rule_validator(), AnalysisState, TypedDict

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (7): _extract_graph_knowledge(), extract_pdf_text(), Extract component entities and relationships from PDF text into the knowledge gr, upload_doc(), CommunityDetector, Community detection on component knowledge graph using NetworkX Louvain., Run Louvain community detection.          nodes: [{id, name, component_type}, ..

### Community 8 - "Community 8"
Cohesion: 0.42
Nodes (10): Frontend BOM Item Model, Frontend Project Domain Model, IEC 61131-3 ST Module Type, Frontend Schematic Model, WebSocket Progress Client, REST API Client Module, Export Service (SVG/Excel/PDF/Print), Full Analysis Pipeline Orchestrator (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.33
Nodes (1): LLMService

### Community 10 - "Community 10"
Cohesion: 0.6
Nodes (4): do_run_migrations(), run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 11 - "Community 11"
Cohesion: 0.53
Nodes (4): create_project(), delete_project(), get_project(), list_projects()

### Community 12 - "Community 12"
Cohesion: 0.47
Nodes (6): check_breaker_rating rule, check_motor_starter_match rule, check_protocol_compatibility rule, check_sil_redundancy rule, validate_all - master validation entry, check_voltage_matching rule

### Community 13 - "Community 13"
Cohesion: 0.6
Nodes (3): downgrade(), initial: all 8 tables  Revision ID: 001 Revises: None Create Date: 2026-05-01, upgrade()

### Community 14 - "Community 14"
Cohesion: 0.6
Nodes (3): health(), lifespan(), project_progress()

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (1): WebSocketClient

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (2): EntityExtractor, LLM-powered entity and relation extraction from PDF text for component knowledge

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (2): Settings, BaseSettings

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (4): EE Assistant Application, Docker Compose Deployment (5 Services), EE Assistant Implementation Plan, EE Assistant Project Overview

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (1): add component graph tables  Revision ID: a4d5b3e39d74 Revises: 001 Create Date:

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (1): get_session()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (1): setup_database()

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): test_analyze_endpoint_requires_project()

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (1): App()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (1): runFullAnalysis()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (1): request()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): ExportToolbar()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (1): FileDropZone()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (1): FrameworkDiagram()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (1): STCodeView()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (3): React App Root Component, Main Application Layout Component, React DOM Entry Point

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (2): Test Database Fixture, RAG Engine Tests

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): API Analysis Endpoint Tests

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Rule Engine Validation Tests

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Schema Validation Tests

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Frontend Requirement Model

## Knowledge Gaps
- **30 isolated node(s):** `Lifespan context manager (table creation on startup)`, `WebSocket endpoint for project progress`, `Async SQLAlchemy engine + session factory`, `check_protocol_compatibility rule`, `ProgressEvent pydantic schema` (+25 more)
  These have ＋1 connection - possible missing edges or undocumented components.
- **Thin community `Community 9`** (9 nodes): `llm_service.py`, `llm_service.py`, `LLMService`, `.analyze_requirements()`, `.chat()`, `.generate_schematic_mermaid()`, `.generate_st_code()`, `.__init__()`, `.map_categories()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (5 nodes): `websocket.ts`, `websocket.ts`, `WebSocketClient`, `.connect()`, `.disconnect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (5 nodes): `entity_extractor.py`, `EntityExtractor`, `.extract_entities()`, `.extract_relations()`, `LLM-powered entity and relation extraction from PDF text for component knowledge`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (4 nodes): `Settings`, `config.py`, `BaseSettings`, `config.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `a4d5b3e39d74_add_component_graph_tables.py`, `downgrade()`, `add component graph tables  Revision ID: a4d5b3e39d74 Revises: 001 Create Date:`, `upgrade()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (3 nodes): `repository.py`, `repository.py`, `get_session()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (3 nodes): `conftest.py`, `conftest.py`, `setup_database()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (3 nodes): `test_api_analysis.py`, `test_api_analysis.py`, `test_analyze_endpoint_requires_project()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (3 nodes): `App.tsx`, `App.tsx`, `App()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (3 nodes): `analysis.ts`, `analysis.ts`, `runFullAnalysis()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `api.ts`, `api.ts`, `request()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `ExportToolbar.tsx`, `ExportToolbar()`, `ExportToolbar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `FileDropZone.tsx`, `FileDropZone()`, `FileDropZone.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `FrameworkDiagram.tsx`, `FrameworkDiagram()`, `FrameworkDiagram.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `STCodeView.tsx`, `STCodeView()`, `STCodeView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Test Database Fixture`, `RAG Engine Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `API Analysis Endpoint Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Rule Engine Validation Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Schema Validation Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Frontend Requirement Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `run_selection()` connect `Community 5` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `validate_all()` connect `Community 5` to `Community 6`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `upload_doc()` connect `Community 7` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `ComponentGraph` (e.g. with `_extract_graph_knowledge()` and `Extract component entities and relationships from PDF text into the knowledge gr`) actually correct?**
  _`ComponentGraph` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Orchestrator` (e.g. with `ProgressEvent` and `Requirement`) actually correct?**
  _`Orchestrator` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Lifespan context manager (table creation on startup)`, `WebSocket endpoint for project progress`, `Async SQLAlchemy engine + session factory` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._