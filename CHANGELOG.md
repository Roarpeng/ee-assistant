# Changelog

All notable changes to Volta will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project export package functionality (ZIP with BOM, wiring, SCL, topology JSON)
- Spreadsheet utilities for Excel generation
- TopologyPanel component testing
- Analysis routing utilities for intelligent chat/analysis routing
- Demo documentation (docs/DEMO.md)
- GitHub CI workflow configuration
- Open-source governance files (LICENSE, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md)

### Changed
- Updated README.md with Volta branding and feature highlights
- Updated .env.example with Volta naming

### Fixed
- Resolved frontend 422/400 errors
- Fixed WebRTC WebSocket connection warnings
- Refactored bottom-level Yjs gravity layout engine

## [0.1.0] - 2026-05-26

### Added
- LangGraph multi-agent pipeline (12 nodes)
- Hybrid RAG system (Qdrant + PostgreSQL knowledge graph)
- ReactFlow topology editor as single source of truth
- Memory flywheel (M0-M3) for learning from user decisions
- Knowledge base with document upload and processing
- Component selection with rule validation
- Schematic generation (Mermaid)
- ST/SCL code generation (Monaco editor)
- Wiring table generation
- Commissioning guide generation
- Organization and preference management
- Clarification问答 system
- Episodic memory and consolidation
- Docker Compose deployment (5 services)
- WebSocket real-time progress updates

### Security
- Organization token authentication
- Environment variable validation
- Input validation with Pydantic
- SQL injection protection via SQLAlchemy ORM

## [0.0.1] - 2026-05-01

### Added
- Initial project structure
- Basic FastAPI backend
- React frontend with MUI
- PostgreSQL database
- Qdrant vector database
- MinIO object storage
