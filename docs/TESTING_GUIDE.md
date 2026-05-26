# Volta Testing Guide

This guide covers testing strategies, tools, and best practices for Volta.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Organization](#test-organization)
- [Backend Testing](#backend-testing)
- [Frontend Testing](#frontend-testing)
- [Integration Testing](#integration-testing)
- [E2E Testing](#e2e-testing)
- [Performance Testing](#performance-testing)
- [Test Coverage](#test-coverage)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)

## Testing Philosophy

Volta follows the testing pyramid:

```
        /\
       /E2E\      (Few, slow, expensive)
      /------\
     /Integration\ (More, medium speed)
    /------------\
   /   Unit Tests  \ (Many, fast, cheap)
  /________________\
```

### Principles

- **Test behavior, not implementation**
- **Tests should be fast and reliable**
- **Tests should be independent**
- **Tests should be readable and maintainable**
- **Mock external dependencies**
- **Test at appropriate levels**

## Test Organization

### Backend Structure

```
backend/tests/
├── unit/              # Pure logic tests
│   ├── test_rule_engine.py
│   ├── test_io_budget.py
│   ├── test_topology_lint.py
│   └── ...
├── api/               # FastAPI endpoint tests
│   ├── test_api_projects.py
│   ├── test_api_analysis.py
│   ├── test_api_knowledge.py
│   └── ...
├── integration/       # Tests requiring external services
│   ├── test_rag_engine.py
│   ├── test_postgres_checkpointer.py
│   └── ...
├── memory/            # Memory system tests
│   ├── test_episode_extractor.py
│   ├── test_consolidation_service.py
│   └── ...
└── conftest.py        # Pytest configuration and fixtures
```

### Frontend Structure

```
frontend/src/
├── services/
│   ├── api.test.ts
│   ├── feedback.test.ts
│   └── ...
└── views/components/
    ├── BOMPanel.test.tsx
    ├── ChatPanel.test.tsx
    └── ...
```

## Backend Testing

### Unit Tests

Test pure business logic without external dependencies:

```python
# tests/unit/test_rule_engine.py
import pytest
from app.core.rule_engine import check_breaker_rating

def test_breaker_rating_pass():
    """Test breaker rating validation passes when adequate."""
    load_current = 10.0
    breaker_rating = 15.0
    
    result = check_breaker_rating(load_current, breaker_rating)
    
    assert result.passed is True
    assert result.message == "Breaker rating adequate"

def test_breaker_rating_fail():
    """Test breaker rating validation fails when inadequate."""
    load_current = 10.0
    breaker_rating = 10.0  # Exactly 1.0x, should fail (need 1.25x)
    
    result = check_breaker_rating(load_current, breaker_rating)
    
    assert result.passed is False
    assert "insufficient" in result.message.lower()
```

### API Tests

Test FastAPI endpoints using TestClient:

```python
# tests/api/test_api_projects.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_create_project(async_client: AsyncClient):
    """Test creating a new project."""
    response = await async_client.post(
        "/api/projects",
        json={"name": "Test Project", "description": "Test"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert "id" in data

@pytest.mark.asyncio
async def test_get_project(async_client: AsyncClient, test_project):
    """Test retrieving a project."""
    response = await async_client.get(f"/api/projects/{test_project['id']}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_project["id"]

@pytest.mark.asyncio
async def test_delete_project(async_client: AsyncClient, test_project):
    """Test deleting a project."""
    response = await async_client.delete(f"/api/projects/{test_project['id']}")
    
    assert response.status_code == 200
    
    # Verify deletion
    response = await async_client.get(f"/api/projects/{test_project['id']}")
    assert response.status_code == 404
```

### Fixtures

Use pytest fixtures for common setup:

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.main import app
from app.db.models import Base
from app.db.repository import get_db

# Test database
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
async def async_engine():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def async_session(async_engine):
    async_session = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session

@pytest.fixture
async def async_client(async_session):
    async def override_get_db():
        yield async_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    app.dependency_overrides.clear()

@pytest.fixture
async def test_project(async_client: AsyncClient):
    """Create a test project."""
    response = await async_client.post(
        "/api/projects",
        json={"name": "Test Project", "description": "Test"}
    )
    return response.json()
```

### Mocking LLM Calls

Mock LLM service for unit tests:

```python
# tests/unit/test_llm_service.py
import pytest
from unittest.mock import AsyncMock, patch
from app.core.llm_service import llm_service

@pytest.mark.asyncio
async def test_chat_success():
    """Test successful LLM chat."""
    with patch.object(llm_service, 'client') as mock_client:
        mock_client.chat.completions.create = AsyncMock(
            return_value=Mock(
                choices=[Mock(message=Mock(content="Test response"))]
            )
        )
        
        response = await llm_service.chat(
            system="You are helpful.",
            user="Hello"
        )
        
        assert response == "Test response"
        mock_client.chat.completions.create.assert_called_once()
```

## Frontend Testing

### Component Tests

Test React components with React Testing Library:

```tsx
// src/views/components/BOMPanel.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BOMPanel } from './BOMPanel';
import { useStore } from '../../models/store';

describe('BOMPanel', () => {
  beforeEach(() => {
    useStore.setState({
      bom: [
        { id: '1', name: 'PLC', manufacturer: 'Siemens', model: 'S7-1200', qty: 1 }
      ],
      language: 'en'
    });
  });

  it('renders BOM table', () => {
    render(<BOMPanel />);
    expect(screen.getByText('PLC')).toBeInTheDocument();
    expect(screen.getByText('Siemens')).toBeInTheDocument();
  });

  it('filters BOM by search term', () => {
    render(<BOMPanel />);
    
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Siemens' } });
    
    expect(screen.getByText('Siemens')).toBeInTheDocument();
  });

  it('calls edit callback when edit button clicked', () => {
    const onEdit = vi.fn();
    render(<BOMPanel onEdit={onEdit} />);
    
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);
    
    expect(onEdit).toHaveBeenCalled();
  });
});
```

### Service Tests

Test API client functions:

```typescript
// src/services/api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getProjects, createProject } from './api';
import { apiClient } from './api';

vi.mock('./api');

describe('API Service', () => {
  it('fetches projects successfully', async () => {
    const mockProjects = [
      { id: '1', name: 'Project 1' },
      { id: '2', name: 'Project 2' }
    ];
    
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockProjects });
    
    const projects = await getProjects();
    
    expect(projects).toEqual(mockProjects);
    expect(apiClient.get).toHaveBeenCalledWith('/api/projects');
  });

  it('creates project successfully', async () => {
    const newProject = { name: 'New Project' };
    const createdProject = { id: '3', ...newProject };
    
    vi.mocked(apiClient.post).mockResolvedValue({ data: createdProject });
    
    const result = await createProject(newProject);
    
    expect(result).toEqual(createdProject);
    expect(apiClient.post).toHaveBeenCalledWith('/api/projects', newProject);
  });
});
```

### Hook Tests

Test custom React hooks:

```typescript
// src/hooks/useChatHistory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatHistory } from './useChatHistory';
import { useStore } from '../models/store';

describe('useChatHistory', () => {
  beforeEach(() => {
    useStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' }
      ]
    });
  });

  it('returns messages from store', () => {
    const { result } = renderHook(() => useChatHistory());
    
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('Hello');
  });

  it('adds message to store', () => {
    const { result } = renderHook(() => useChatHistory());
    
    act(() => {
      result.current.addMessage({
        role: 'user',
        content: 'New message'
      });
    });
    
    expect(result.current.messages).toHaveLength(3);
  });
});
```

## Integration Testing

### Database Integration

Test with real database (PostgreSQL):

```python
# tests/integration/test_rag_engine.py
import pytest
import asyncio
from app.core.rag_engine import RAGEngine

@pytest.mark.integration
@pytest.mark.asyncio
async def test_rag_search_integration():
    """Test RAG search with real Qdrant."""
    rag = RAGEngine()
    
    # Insert test document
    await rag.upsert_document(
        collection_name="test",
        document_id="doc1",
        text="Siemens S7-1200 is a compact PLC",
        metadata={"manufacturer": "Siemens"}
    )
    
    # Wait for indexing
    await asyncio.sleep(1)
    
    # Search
    results = await rag.search(
        collection_name="test",
        query="Siemens PLC",
        limit=5
    )
    
    assert len(results) > 0
    assert any("Siemens" in r.text for r in results)
    
    # Cleanup
    await rag.delete_document("test", "doc1")
```

### LangGraph Integration

Test LangGraph workflow:

```python
# tests/integration/test_langgraph_workflow.py
import pytest
from app.core.graph.builder import create_graph

@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_analysis_workflow():
    """Test complete LangGraph analysis workflow."""
    graph = create_graph()
    
    initial_state = {
        "messages": [{"role": "user", "content": "Design a simple motor control"}],
        "requirements": {},
        "bom_items": [],
        "errors": []
    }
    
    config = {"configurable": {"thread_id": "test_thread"}}
    
    result = await graph.ainvoke(initial_state, config)
    
    assert "requirements" in result
    assert len(result["errors"]) == 0
    assert len(result["bom_items"]) > 0
```

## E2E Testing

### Playwright Setup

```bash
cd frontend
npm install -D @playwright/test
npx playwright install
```

### E2E Test Example

```typescript
// e2e/project-creation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Project Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('creates and analyzes a project', async ({ page }) => {
    // Navigate to projects
    await page.click('text=Projects');
    
    // Create new project
    await page.click('button:has-text("New Project")');
    await page.fill('input[name="name"]', 'Test Project');
    await page.click('button:has-text("Create")');
    
    // Verify project created
    await expect(page.locator('text=Test Project')).toBeVisible();
    
    // Run analysis
    await page.fill('textarea[placeholder*="Describe"]', 'Design a motor control system');
    await page.click('button:has-text("Full Engineering Run")');
    
    // Wait for completion
    await page.waitForSelector('text=Analysis complete', { timeout: 300000 });
    
    // Verify BOM generated
    await page.click('text=BOM');
    await expect(page.locator('table')).toBeVisible();
  });
});
```

Run E2E tests:

```bash
npx playwright test
```

## Performance Testing

### Load Testing with Locust

```python
# locustfile.py
from locust import HttpUser, task, between

class VoltaUser(HttpUser):
    wait_time = between(1, 5)
    
    def on_start(self):
        # Login or setup
        self.client.post("/api/auth/login", json={"token": "test"})
    
    @task(3)
    def get_projects(self):
        self.client.get("/api/projects")
    
    @task(1)
    def create_project(self):
        self.client.post("/api/projects", json={"name": "Load Test Project"})
    
    @task(1)
    def run_analysis(self):
        self.client.post("/api/projects/test/analyze-v2", json={
            "requirement_text": "Design a simple system"
        })
```

Run load test:

```bash
locust -f locustfile.py --host=http://localhost:8000
```

### Backend Performance

```python
# tests/performance/test_analysis_latency.py
import pytest
import time
from app.core.graph.builder import create_graph

@pytest.mark.performance
@pytest.mark.asyncio
async def test_analysis_latency():
    """Measure analysis execution time."""
    graph = create_graph()
    
    start_time = time.time()
    
    result = await graph.ainvoke({
        "messages": [{"role": "user", "content": "Simple requirement"}],
        "requirements": {},
        "bom_items": [],
        "errors": []
    })
    
    duration = time.time() - start_time
    
    # Should complete within 5 minutes
    assert duration < 300, f"Analysis took {duration}s, expected < 300s"
```

## Test Coverage

### Backend Coverage

```bash
cd backend
pytest --cov=app --cov-report=html --cov-report=term
```

Target: 80%+ coverage

### Frontend Coverage

```bash
cd frontend
npm run test -- --coverage
```

Target: 70%+ coverage

### Coverage Report

View HTML coverage report:

```bash
# Backend
open backend/htmlcov/index.html

# Frontend
open frontend/coverage/index.html
```

## Running Tests

### All Tests

```bash
# Backend
cd backend
pytest tests/ -q

# Frontend
cd frontend
npm run test
```

### Specific Test Categories

```bash
# Unit tests only
cd backend
pytest tests/unit/ -q

# API tests only
cd backend
pytest tests/api/ -q

# Integration tests (requires services)
cd backend
pytest tests/integration/ -q

# Memory tests
cd backend
pytest tests/memory/ -q
```

### Watch Mode

```bash
# Frontend watch mode
cd frontend
npm run test:watch
```

### Parallel Execution

```bash
# Backend with pytest-xdist
cd backend
pytest -n auto tests/
```

## Writing Tests

### Test Naming

Use descriptive names:

```python
# Good
def test_breaker_rating_passes_when_rating_is_125_percent_of_load():
    pass

# Bad
def test_breaker():
    pass
```

### AAA Pattern

Arrange-Act-Assert:

```python
def test_user_creation():
    # Arrange
    user_data = {"name": "John", "email": "john@example.com"}
    
    # Act
    user = create_user(user_data)
    
    # Assert
    assert user.name == "John"
    assert user.email == "john@example.com"
```

### Test Data Factories

Use factories for test data:

```python
# tests/factories.py
from app.db.models import Project

def create_project_factory(name="Test Project"):
    return Project(name=name, status="draft")

# Use in tests
def test_with_factory():
    project = create_project_factory()
    assert project.name == "Test Project"
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      - name: Run tests
        run: |
          cd backend
          pytest tests/ --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      - name: Run tests
        run: |
          cd frontend
          npm run test -- --coverage
```

## Best Practices

### DO

- Write tests for new features
- Keep tests fast and focused
- Use descriptive test names
- Mock external dependencies
- Test edge cases and error conditions
- Keep test data independent
- Use fixtures for common setup

### DON'T

- Test implementation details
- Write slow integration tests for unit logic
- Copy-paste test code
- Ignore flaky tests
- Test third-party libraries
- Over-mock (test nothing)
- Skip tests without good reason

## Troubleshooting

### Tests Failing Locally

```bash
# Clear cache
pytest --cache-clear

# Run in verbose mode
pytest -vv

# Run specific test
pytest tests/unit/test_rule_engine.py::test_breaker_rating_pass
```

### Database Lock Issues

```bash
# Use different test database
export TEST_DATABASE_URL="sqlite+aiosqlite:///:memory:"
```

### Time-dependent Tests

Use freezegun for time-related tests:

```python
import pytest
from freezegun import freeze_time

@freeze_time("2026-05-26")
def test_time_dependent():
    assert datetime.now().year == 2026
```

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
