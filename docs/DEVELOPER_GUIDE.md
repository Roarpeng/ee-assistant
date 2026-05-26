# Volta Developer Guide

This guide is for developers who want to contribute to Volta or extend it for their own use.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Backend Development](#backend-development)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Database Migrations](#database-migrations)
- [LangGraph Development](#langgraph-development)
- [Knowledge Graph Development](#knowledge-graph-development)
- [Adding New Features](#adding-new-features)
- [Debugging](#debugging)
- [Performance Optimization](#performance-optimization)

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Docker and Docker Compose
- Git
- OpenAI-compatible API keys (Chat + Embedding)

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/Roarpeng/ee-assistant.git
cd ee-assistant

# Start dependencies
docker compose up -d postgres qdrant minio

# Backend setup
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

Access the application at http://localhost:5173

### IDE Configuration

#### VS Code

Recommended extensions:
- Python (Microsoft)
- Pylance (Microsoft)
- ESLint
- Prettier
- Docker

#### PyCharm

- Configure Python interpreter to use `.venv`
- Enable pytest runner
- Configure TypeScript for frontend

## Project Structure

```
ele/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Configuration (Pydantic Settings)
│   │   ├── api/                    # API endpoints
│   │   │   ├── projects.py         # Project CRUD
│   │   │   ├── analysis.py         # Analysis endpoints
│   │   │   ├── knowledge.py        # Knowledge base
│   │   │   ├── topology.py         # Topology management
│   │   │   ├── feedback.py         # Feedback API
│   │   │   ├── episodes.py         # Episodic memory
│   │   │   └── ...
│   │   ├── core/                   # Core business logic
│   │   │   ├── graph/              # LangGraph agents
│   │   │   │   ├── state.py       # AnalysisState TypedDict
│   │   │   │   ├── agents.py      # Agent node functions
│   │   │   │   └── builder.py     # StateGraph builder
│   │   │   ├── orchestrator.py    # WebSocket + graph orchestration
│   │   │   ├── llm_service.py     # LLM wrapper
│   │   │   ├── rag_engine.py      # Qdrant vector search
│   │   │   ├── graph_rag.py       # Hybrid retrieval
│   │   │   ├── knowledge_graph.py # Component graph CRUD
│   │   │   ├── rule_engine.py     # Validation rules
│   │   │   ├── entity_extractor.py # Entity extraction
│   │   │   ├── community_detector.py # Louvain clustering
│   │   │   ├── episode_extractor.py # Memory extraction
│   │   │   ├── consolidation_service.py # Memory consolidation
│   │   │   └── ...
│   │   ├── db/
│   │   │   ├── models.py          # SQLAlchemy ORM models
│   │   │   └── repository.py      # Database session factory
│   │   └── middleware/
│   │       └── org_auth.py        # Organization authentication
│   ├── tests/                    # Backend tests
│   │   ├── unit/                 # Unit tests
│   │   ├── api/                  # API tests
│   │   ├── integration/          # Integration tests
│   │   └── memory/               # Memory system tests
│   ├── alembic/                  # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── models/               # Zustand stores + types
│   │   │   ├── store.ts          # Global state
│   │   │   └── yjsStore.ts       # Yjs collaboration
│   │   ├── services/             # API clients
│   │   │   ├── api.ts            # Main API client
│   │   │   ├── conversations.ts
│   │   │   ├── feedback.ts
│   │   │   ├── memory.ts
│   │   │   └── ...
│   │   ├── views/components/     # React components
│   │   │   ├── AppLayout.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── TopologyPanel.tsx
│   │   │   ├── BOMPanel.tsx
│   │   │   └── ...
│   │   ├── hooks/                # Custom React hooks
│   │   └── utils/                # Utility functions
│   ├── public/
│   └── package.json
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
└── docker-compose.yml
```

## Architecture Overview

Volta follows a clean architecture with clear separation of concerns:

### Backend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FastAPI Application                  │
├─────────────────────────────────────────────────────────┤
│  API Layer (app/api/)                                    │
│  - REST endpoints                                        │
│  - WebSocket handlers                                    │
│  - Request/response validation (Pydantic)                │
├─────────────────────────────────────────────────────────┤
│  Core Layer (app/core/)                                  │
│  - Business logic                                        │
│  - LangGraph orchestration                              │
│  - RAG engines                                           │
│  - Rule validation                                       │
├─────────────────────────────────────────────────────────┤
│  Data Layer (app/db/)                                   │
│  - SQLAlchemy ORM models                                 │
│  - Repository pattern                                   │
│  - Session management                                   │
├─────────────────────────────────────────────────────────┤
│  External Services                                      │
│  - PostgreSQL (relational + graph)                       │
│  - Qdrant (vector search)                               │
│  - MinIO (object storage)                               │
│  - LLM APIs (Chat + Embedding)                          │
└─────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Application                     │
├─────────────────────────────────────────────────────────┤
│  View Layer (views/components/)                          │
│  - UI components (React + MUI)                           │
│  - ReactFlow topology editor                             │
│  - Monaco code editor                                    │
├─────────────────────────────────────────────────────────┤
│  State Layer (models/)                                  │
│  - Zustand global state                                 │
│  - Yjs collaboration state                               │
│  - TypeScript types                                     │
├─────────────────────────────────────────────────────────┤
│  Service Layer (services/)                               │
│  - API clients (axios)                                  │
│  - WebSocket clients                                    │
│  - Business logic utilities                              │
├─────────────────────────────────────────────────────────┤
│  External APIs                                           │
│  - FastAPI backend                                      │
│  - WebSocket (real-time updates)                         │
└─────────────────────────────────────────────────────────┘
```

## Backend Development

### Adding a New API Endpoint

1. Create or edit a file in `app/api/`:

```python
# app/api/my_endpoint.py
from fastapi import APIRouter, Depends
from app.db.repository import get_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

@router.get("/my-endpoint")
async def get_my_data(
    db: AsyncSession = Depends(get_db)
):
    # Your logic here
    return {"data": "result"}
```

2. Register the router in `app/main.py`:

```python
from app.api.my_endpoint import router as my_endpoint_router

app.include_router(my_endpoint_router, prefix="/api", tags=["my-endpoint"])
```

3. Add tests in `tests/api/`:

```python
# tests/api/test_my_endpoint.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_my_data(async_client: AsyncClient):
    response = await async_client.get("/api/my-endpoint")
    assert response.status_code == 200
    assert response.json()["data"] == "result"
```

### Adding a New Database Model

1. Add model to `app/db/models.py`:

```python
from sqlalchemy import Column, Integer, String
from app.db.models import Base

class MyModel(Base):
    __tablename__ = "my_models"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
```

2. Create migration:

```bash
cd backend
alembic revision --autogenerate -m "Add MyModel"
alembic upgrade head
```

3. Add repository methods if needed in `app/db/repository.py`

### Adding a New LangGraph Agent

1. Define state update in `app/core/graph/state.py`:

```python
from typing import Annotated, TypedDict
from langgraph.graph import add_messages

class AnalysisState(TypedDict):
    messages: Annotated[list, add_messages]
    my_field: str
```

2. Implement agent function in `app/core/graph/agents.py`:

```python
from app.core.llm_service import llm_service
from app.core.graph.state import AnalysisState

async def my_agent(state: AnalysisState) -> AnalysisState:
    prompt = f"Process: {state['messages'][-1]}"
    response = await llm_service.chat("You are an expert.", prompt)
    
    return {
        **state,
        "my_field": response
    }
```

3. Add node to graph in `app/core/graph/builder.py`:

```python
from app.core.graph.agents import my_agent

workflow.add_node("my_agent", my_agent)
workflow.add_edge("previous_node", "my_agent")
```

## Frontend Development

### Adding a New Component

1. Create component in `src/views/components/`:

```tsx
// src/views/components/MyComponent.tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

interface MyComponentProps {
  title: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  return (
    <Box>
      <Typography variant="h6">{title}</Typography>
    </Box>
  );
};
```

2. Add tests in `src/views/components/MyComponent.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

### Adding to Global State

1. Add to store in `src/models/store.ts`:

```typescript
interface StoreState {
  myData: string;
  setMyData: (data: string) => void;
}

export const useStore = create<StoreState>((set) => ({
  myData: '',
  setMyData: (data) => set({ myData: data }),
}));
```

2. Use in component:

```tsx
import { useStore } from '../../models/store';

export const MyComponent = () => {
  const { myData, setMyData } = useStore();
  
  return <button onClick={() => setMyData('new')}>{myData}</button>;
};
```

### Adding API Service

1. Create in `src/services/`:

```typescript
// src/services/myService.ts
import { apiClient } from './api';

export interface MyData {
  id: string;
  name: string;
}

export async function getMyData(): Promise<MyData[]> {
  const response = await apiClient.get('/api/my-endpoint');
  return response.data;
}
```

2. Add tests in `src/services/myService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getMyData } from './myService';
import { apiClient } from './api';

vi.mock('./api');

describe('getMyData', () => {
  it('fetches data', async () => {
    const mockData = [{ id: '1', name: 'Test' }];
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockData });
    
    const result = await getMyData();
    expect(result).toEqual(mockData);
  });
});
```

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
python -m pytest tests/ -q

# Run specific test file
python -m pytest tests/api/test_projects.py -q

# Run with coverage
python -m pytest tests/ --cov=app --cov-report=html

# Run only unit tests (no integration)
python -m pytest tests/ -m "not integration"
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm run test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test -- --coverage
```

### Test Organization

- `tests/unit/`: Pure logic tests (no external dependencies)
- `tests/api/`: FastAPI endpoint tests (use aiosqlite)
- `tests/integration/`: Tests requiring Qdrant/Postgres/MinIO
- `tests/memory/`: Memory system tests

## Database Migrations

### Creating a Migration

```bash
cd backend
alembic revision --autogenerate -m "Description of changes"
```

### Applying Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Apply specific migration
alembic upgrade +1

# Rollback one migration
alembic downgrade -1

# Rollback to base
alembic downgrade base
```

### Migration Best Practices

- Always review generated migration files
- Never edit applied migrations
- Use `alembic revision --autogenerate` for schema changes
- Add custom SQL in migration if needed
- Test migrations on a copy of production data

## LangGraph Development

### Understanding the State

The `AnalysisState` TypedDict flows through all agents:

```python
class AnalysisState(TypedDict):
    messages: Annotated[list, add_messages]
    requirements: dict
    categories: dict
    safety_assessment: dict
    constraints: dict
    bom_items: list
    validated_bom: list
    mermaid_code: str
    st_code: str
    wiring_rows: list
    commissioning_steps: list
    final_report: dict
    errors: list[str]
```

### Adding a New Agent Node

1. Define the agent function
2. Update state if needed
3. Add to workflow graph
4. Add tests
5. Update documentation

### Debugging LangGraph

Enable checkpoint inspection:

```python
from langgraph.checkpoint.memory import MemorySaver

workflow.compile(checkpointer=MemorySaver())
```

View state during execution:

```python
async for event in graph.astream(initial_state):
    print(event)
```

## Knowledge Graph Development

### Component Graph Structure

Nodes: `component_nodes` table
Edges: `component_edges` table

Relations:
- REQUIRES_POWER
- OUTPUTS_SIGNAL
- USES_PROTOCOL
- COMPATIBLE_WITH
- ALTERNATIVE_TO
- MOUNTS_ON
- CONTROLS

### Adding Entity Extraction

Entity extraction is done by LLM in `core/entity_extractor.py`:

```python
async def extract_entities(text: str) -> List[Entity]:
    prompt = f"Extract electrical components from: {text}"
    response = await llm_service.chat(system_prompt, prompt)
    return parse_entities(response)
```

### Graph Traversal

BFS traversal in `core/knowledge_graph.py`:

```python
async def bfs_traversal(start_node_id: str, max_depth: int = 3):
    visited = set()
    queue = [(start_node_id, 0)]
    
    while queue:
        node_id, depth = queue.pop(0)
        if depth > max_depth:
            continue
        
        # Process node
        # Add neighbors to queue
```

## Adding New Features

### Feature Development Checklist

- [ ] Design the feature (write spec if complex)
- [ ] Update database schema if needed (migration)
- [ ] Implement backend logic
- [ ] Add API endpoints
- [ ] Implement frontend UI
- [ ] Add tests (backend + frontend)
- [ ] Update documentation
- [ ] Update CHANGELOG.md
- [ ] Create PR with description

### Example: Adding a New Export Format

1. Backend: Add export function in `core/exporters.py`
2. API: Add endpoint in `api/export.py`
3. Frontend: Add export button in component
4. Tests: Add test for export function
5. Docs: Update USER_GUIDE.md

## Debugging

### Backend Debugging

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Run with debugger
python -m pdb -m uvicorn app.main:app --reload

# View logs
docker compose logs -f backend
```

### Frontend Debugging

```bash
# Run with source maps
npm run dev

# Debug in browser
# Open DevTools (F12)
# React DevTools extension recommended
```

### Common Issues

**Database connection errors:**
- Check PostgreSQL is running: `docker compose ps postgres`
- Check DATABASE_URL in .env
- Check logs: `docker compose logs postgres`

**Qdrant connection errors:**
- Check Qdrant is running: `docker compose ps qdrant`
- Check QDRANT_URL in .env
- Verify collection exists

**LLM API errors:**
- Check API keys in Settings
- Test connectivity in Settings
- Check LLM provider status
- View backend logs for specific error

## Performance Optimization

### Backend Optimization

- Use async/await consistently
- Add database indexes on frequently queried columns
- Cache LLM responses where appropriate
- Use connection pooling for database
- Optimize Qdrant queries with filters

### Frontend Optimization

- Use React.memo for expensive components
- Implement virtual scrolling for large lists
- Lazy load components with React.lazy
- Optimize bundle size (code splitting)
- Use service worker for caching

### Database Optimization

```sql
-- Add index
CREATE INDEX idx_projects_org_id ON projects(org_id);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM projects WHERE org_id = 1;
```

## Code Style

### Python

- Follow PEP 8
- Use type hints
- Maximum line length: 100
- Use `ruff` for linting
- Use `black` for formatting

```bash
ruff check app/
black app/
```

### TypeScript

- Follow ESLint configuration
- Use Prettier for formatting
- Maximum line length: 100
- Use functional components

```bash
npm run lint
npm run format
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## Getting Help

- [GitHub Issues](https://github.com/Roarpeng/ee-assistant/issues)
- [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- [Developer Documentation](../docs/)
