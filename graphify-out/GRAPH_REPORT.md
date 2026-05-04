# Graph Report - .  (2026-05-04)

## Corpus Check
- 64 files ， ~38,180 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 365 nodes ， 482 edges ， 37 communities detected
- Extraction: 74% EXTRACTED ， 26% INFERRED ， 0% AMBIGUOUS ， INFERRED: 124 edges (avg confidence: 0.76)
- Token cost: 0 input ， 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Base|Base]]
- [[_COMMUNITY_Orchestrator (WebSocket progre|Orchestrator (WebSocket progre]]
- [[_COMMUNITY_schemas.py|schemas.py]]
- [[_COMMUNITY_CanvasPanel Component|CanvasPanel Component]]
- [[_COMMUNITY_ComponentGraph|ComponentGraph]]
- [[_COMMUNITY_validate_all()|validate_all()]]
- [[_COMMUNITY_agents.py|agents.py]]
- [[_COMMUNITY_knowledge.py|knowledge.py]]
- [[_COMMUNITY_Frontend Project Domain Model|Frontend Project Domain Model]]
- [[_COMMUNITY_LLMService|LLMService]]
- [[_COMMUNITY_t()|t()]]
- [[_COMMUNITY_env.py|env.py]]
- [[_COMMUNITY_projects.py|projects.py]]
- [[_COMMUNITY_validate_all - master validati|validate_all - master validati]]
- [[_COMMUNITY_001_initial_tables.py|001_initial_tables.py]]
- [[_COMMUNITY_main.py|main.py]]
- [[_COMMUNITY_WebSocketClient|WebSocketClient]]
- [[_COMMUNITY_EntityExtractor|EntityExtractor]]
- [[_COMMUNITY_Settings|Settings]]
- [[_COMMUNITY_EE Assistant Application|EE Assistant Application]]
- [[_COMMUNITY_a4d5b3e39d74_add_component_gra|a4d5b3e39d74_add_component_gra]]
- [[_COMMUNITY_api.ts|api.ts]]
- [[_COMMUNITY_get_session()|get_session()]]
- [[_COMMUNITY_setup_database()|setup_database()]]
- [[_COMMUNITY_test_analyze_endpoint_requires|test_analyze_endpoint_requires]]
- [[_COMMUNITY_App()|App()]]
- [[_COMMUNITY_runFullAnalysis()|runFullAnalysis()]]
- [[_COMMUNITY_ExportToolbar()|ExportToolbar()]]
- [[_COMMUNITY_FileDropZone()|FileDropZone()]]
- [[_COMMUNITY_FrameworkDiagram()|FrameworkDiagram()]]
- [[_COMMUNITY_STCodeView()|STCodeView()]]
- [[_COMMUNITY_React App Root Component|React App Root Component]]
- [[_COMMUNITY_Test Database Fixture|Test Database Fixture]]
- [[_COMMUNITY_API Analysis Endpoint Tests|API Analysis Endpoint Tests]]
- [[_COMMUNITY_Rule Engine Validation Tests|Rule Engine Validation Tests]]
- [[_COMMUNITY_Schema Validation Tests|Schema Validation Tests]]
- [[_COMMUNITY_Frontend Requirement Model|Frontend Requirement Model]]

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

### Community 0 - "Base"
Cohesion: 0.1
Nodes (19): analyze_project_v2(), generate_code(), generate_schematic(), AsyncAttrs, Component knowledge graph ！ CRUD + BFS traversal over PostgreSQL tables., Orchestrator, Base, BOMItem (+11 more)

### Community 1 - "Orchestrator (WebSocket progre"
Cohesion: 0.11
Nodes (34): Alembic migration environment config, Initial migration: all 8 tables, POST /api/projects/{id}/analyze endpoint, POST /api/projects/{id}/codegen endpoint, chunk_text(), extract_pdf_text (PyMuPDF), search(), POST /api/knowledge/docs endpoint (PDF upload) (+26 more)

### Community 2 - "schemas.py"
Cohesion: 0.17
Nodes (26): BaseModel, BOMItemOut, CodegenInput, ConfidenceLevel, IOItemOut, IOType, KnowledgeChunkOut, KnowledgeDocOut (+18 more)

### Community 3 - "CanvasPanel Component"
Cohesion: 0.12
Nodes (25): runFullAnalysis (Analysis Flow State Machine), API Client Service, BOMTable Component, CanvasPanel Component, ChatInput Component, ChatMessage Component, ChatPanel Component, Component Selection Engine (+17 more)

### Community 4 - "ComponentGraph"
Cohesion: 0.11
Nodes (4): ComponentGraph, RAGEngine, Dual-path search: Qdrant semantic + graph neighbor lookup., test_search_constructs_correct_filter()

### Community 5 - "validate_all()"
Cohesion: 0.21
Nodes (14): run_selection(), check_breaker_rating(), check_motor_starter_match(), check_protocol_compatibility(), check_sil_redundancy(), check_voltage_matching(), Selection validation rules for electrical components., validate_all() (+6 more)

### Community 6 - "agents.py"
Cohesion: 0.14
Nodes (6): fanout_selection_supervisor(), LangGraph agent node functions ！ each node receives state, returns partial state, Fan-out: for each category, search RAG + graph neighbors. One async session per, rule_validator(), AnalysisState, TypedDict

### Community 7 - "knowledge.py"
Cohesion: 0.21
Nodes (7): _extract_graph_knowledge(), extract_pdf_text(), Extract component entities and relationships from PDF text into the knowledge gr, upload_doc(), CommunityDetector, Community detection on component knowledge graph using NetworkX Louvain., Run Louvain community detection.          nodes: [{id, name, component_type}, ..

### Community 8 - "Frontend Project Domain Model"
Cohesion: 0.42
Nodes (10): Frontend BOM Item Model, Frontend Project Domain Model, IEC 61131-3 ST Module Type, Frontend Schematic Model, WebSocket Progress Client, REST API Client Module, Export Service (SVG/Excel/PDF/Print), Full Analysis Pipeline Orchestrator (+2 more)

### Community 9 - "LLMService"
Cohesion: 0.33
Nodes (1): LLMService

### Community 10 - "t()"
Cohesion: 0.22
Nodes (4): BOMPanel(), Header(), SettingsModal(), t()

### Community 11 - "env.py"
Cohesion: 0.6
Nodes (4): do_run_migrations(), run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 12 - "projects.py"
Cohesion: 0.53
Nodes (4): create_project(), delete_project(), get_project(), list_projects()

### Community 13 - "validate_all - master validati"
Cohesion: 0.47
Nodes (6): check_breaker_rating rule, check_motor_starter_match rule, check_protocol_compatibility rule, check_sil_redundancy rule, validate_all - master validation entry, check_voltage_matching rule

### Community 14 - "001_initial_tables.py"
Cohesion: 0.6
Nodes (3): downgrade(), initial: all 8 tables  Revision ID: 001 Revises: None Create Date: 2026-05-01, upgrade()

### Community 15 - "main.py"
Cohesion: 0.6
Nodes (3): health(), lifespan(), project_progress()

### Community 16 - "WebSocketClient"
Cohesion: 0.4
Nodes (1): WebSocketClient

### Community 17 - "EntityExtractor"
Cohesion: 0.4
Nodes (2): EntityExtractor, LLM-powered entity and relation extraction from PDF text for component knowledge

### Community 18 - "Settings"
Cohesion: 0.5
Nodes (2): Settings, BaseSettings

### Community 20 - "EE Assistant Application"
Cohesion: 0.5
Nodes (4): EE Assistant Application, Docker Compose Deployment (5 Services), EE Assistant Implementation Plan, EE Assistant Project Overview

### Community 21 - "a4d5b3e39d74_add_component_gra"
Cohesion: 0.5
Nodes (1): add component graph tables  Revision ID: a4d5b3e39d74 Revises: 001 Create Date:

### Community 23 - "api.ts"
Cohesion: 0.5
Nodes (1): request()

### Community 24 - "get_session()"
Cohesion: 0.67
Nodes (1): get_session()

### Community 25 - "setup_database()"
Cohesion: 0.67
Nodes (1): setup_database()

### Community 26 - "test_analyze_endpoint_requires"
Cohesion: 0.67
Nodes (1): test_analyze_endpoint_requires_project()

### Community 27 - "App()"
Cohesion: 0.67
Nodes (1): App()

### Community 28 - "runFullAnalysis()"
Cohesion: 0.67
Nodes (1): runFullAnalysis()

### Community 30 - "ExportToolbar()"
Cohesion: 0.67
Nodes (1): ExportToolbar()

### Community 31 - "FileDropZone()"
Cohesion: 0.67
Nodes (1): FileDropZone()

### Community 32 - "FrameworkDiagram()"
Cohesion: 0.67
Nodes (1): FrameworkDiagram()

### Community 33 - "STCodeView()"
Cohesion: 0.67
Nodes (1): STCodeView()

### Community 34 - "React App Root Component"
Cohesion: 0.67
Nodes (3): React App Root Component, Main Application Layout Component, React DOM Entry Point

### Community 39 - "Test Database Fixture"
Cohesion: 1.0
Nodes (2): Test Database Fixture, RAG Engine Tests

### Community 58 - "API Analysis Endpoint Tests"
Cohesion: 1.0
Nodes (1): API Analysis Endpoint Tests

### Community 59 - "Rule Engine Validation Tests"
Cohesion: 1.0
Nodes (1): Rule Engine Validation Tests

### Community 60 - "Schema Validation Tests"
Cohesion: 1.0
Nodes (1): Schema Validation Tests

### Community 61 - "Frontend Requirement Model"
Cohesion: 1.0
Nodes (1): Frontend Requirement Model

## Knowledge Gaps
- **30 isolated node(s):** `Lifespan context manager (table creation on startup)`, `WebSocket endpoint for project progress`, `Async SQLAlchemy engine + session factory`, `check_protocol_compatibility rule`, `ProgressEvent pydantic schema` (+25 more)
  These have ＋1 connection - possible missing edges or undocumented components.
- **Thin community `LLMService`** (9 nodes): `llm_service.py`, `llm_service.py`, `LLMService`, `.analyze_requirements()`, `.chat()`, `.generate_schematic_mermaid()`, `.generate_st_code()`, `.__init__()`, `.map_categories()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `WebSocketClient`** (5 nodes): `websocket.ts`, `websocket.ts`, `WebSocketClient`, `.connect()`, `.disconnect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `EntityExtractor`** (5 nodes): `entity_extractor.py`, `EntityExtractor`, `.extract_entities()`, `.extract_relations()`, `LLM-powered entity and relation extraction from PDF text for component knowledge`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings`** (4 nodes): `Settings`, `config.py`, `BaseSettings`, `config.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `a4d5b3e39d74_add_component_gra`** (4 nodes): `a4d5b3e39d74_add_component_graph_tables.py`, `downgrade()`, `add component graph tables  Revision ID: a4d5b3e39d74 Revises: 001 Create Date:`, `upgrade()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `api.ts`** (4 nodes): `api.ts`, `api.ts`, `getSettings()`, `request()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `get_session()`** (3 nodes): `repository.py`, `repository.py`, `get_session()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `setup_database()`** (3 nodes): `conftest.py`, `conftest.py`, `setup_database()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `test_analyze_endpoint_requires`** (3 nodes): `test_api_analysis.py`, `test_api_analysis.py`, `test_analyze_endpoint_requires_project()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App()`** (3 nodes): `App.tsx`, `App.tsx`, `App()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `runFullAnalysis()`** (3 nodes): `analysis.ts`, `analysis.ts`, `runFullAnalysis()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ExportToolbar()`** (3 nodes): `ExportToolbar.tsx`, `ExportToolbar()`, `ExportToolbar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FileDropZone()`** (3 nodes): `FileDropZone.tsx`, `FileDropZone()`, `FileDropZone.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FrameworkDiagram()`** (3 nodes): `FrameworkDiagram.tsx`, `FrameworkDiagram()`, `FrameworkDiagram.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `STCodeView()`** (3 nodes): `STCodeView.tsx`, `STCodeView()`, `STCodeView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Database Fixture`** (2 nodes): `Test Database Fixture`, `RAG Engine Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Analysis Endpoint Tests`** (1 nodes): `API Analysis Endpoint Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule Engine Validation Tests`** (1 nodes): `Rule Engine Validation Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Schema Validation Tests`** (1 nodes): `Schema Validation Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Requirement Model`** (1 nodes): `Frontend Requirement Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `run_selection()` connect `validate_all()` to `Base`, `schemas.py`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `validate_all()` connect `validate_all()` to `agents.py`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `upload_doc()` connect `knowledge.py` to `Base`, `Orchestrator (WebSocket progre`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `ComponentGraph` (e.g. with `RAGEngine` and `_extract_graph_knowledge()`) actually correct?**
  _`ComponentGraph` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Orchestrator` (e.g. with `ProgressEvent` and `Requirement`) actually correct?**
  _`Orchestrator` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Lifespan context manager (table creation on startup)`, `WebSocket endpoint for project progress`, `Async SQLAlchemy engine + session factory` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Base` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._