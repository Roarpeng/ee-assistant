# Volta API Documentation

This document provides detailed API documentation for Volta's REST and WebSocket endpoints.

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: Configure via environment variable

## Authentication

Volta uses organization token-based authentication. Include the token in the `X-Org-Token` header:

```http
X-Org-Token: your-organization-token
```

## Response Format

All API responses follow this format:

```json
{
  "data": { ... },
  "error": null,
  "message": "Success"
}
```

Error responses:

```json
{
  "data": null,
  "error": "Error message",
  "message": "Error occurred"
}
```

## REST API Endpoints

### System

#### Health Check

```http
GET /api/health
```

Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-05-26T10:00:00Z"
}
```

#### Test Connectivity

```http
POST /api/test-connectivity
Content-Type: application/json

{
  "chat_api_key": "sk-...",
  "chat_base_url": "https://api.openai.com/v1",
  "chat_model": "gpt-4",
  "embedding_api_key": "sk-...",
  "embedding_base_url": "https://api.openai.com/v1",
  "embedding_model": "text-embedding-3-small"
}
```

Test LLM provider connectivity.

**Response:**
```json
{
  "chat": {
    "success": true,
    "latency_ms": 150
  },
  "embedding": {
    "success": true,
    "latency_ms": 80
  }
}
```

### Projects

#### List Projects

```http
GET /api/projects
```

Get all projects for the current organization.

**Response:**
```json
{
  "projects": [
    {
      "id": "proj_123",
      "name": "Conveyor System",
      "status": "active",
      "created_at": "2026-05-26T10:00:00Z",
      "updated_at": "2026-05-26T11:00:00Z"
    }
  ]
}
```

#### Create Project

```http
POST /api/projects
Content-Type: application/json

{
  "name": "Conveyor System",
  "description": "3-motor conveyor line"
}
```

**Response:**
```json
{
  "id": "proj_123",
  "name": "Conveyor System",
  "status": "draft",
  "created_at": "2026-05-26T10:00:00Z"
}
```

#### Get Project

```http
GET /api/projects/{id}
```

Get project details.

**Response:**
```json
{
  "id": "proj_123",
  "name": "Conveyor System",
  "status": "active",
  "requirements": { ... },
  "created_at": "2026-05-26T10:00:00Z"
}
```

#### Delete Project

```http
DELETE /api/projects/{id}
```

Delete a project and all associated data.

**Response:**
```json
{
  "message": "Project deleted successfully"
}
```

#### Search Projects

```http
GET /api/projects/search?q=conveyor
```

Search projects by name or description.

**Response:**
```json
{
  "projects": [
    {
      "id": "proj_123",
      "name": "Conveyor System",
      "status": "active"
    }
  ]
}
```

### Analysis

#### Run Analysis (v1 - Legacy)

```http
POST /api/projects/{id}/analyze
Content-Type: application/json

{
  "requirement_text": "Design a conveyor system with 3 motors..."
}
```

Run v1 serial analysis (legacy).

**Response:**
```json
{
  "analysis_id": "analysis_123",
  "status": "running"
}
```

#### Run Analysis (v2 - LangGraph)

```http
POST /api/projects/{id}/analyze-v2
Content-Type: application/json

{
  "requirement_text": "Design a conveyor system with 3 motors..."
}
```

Run LangGraph multi-agent analysis (recommended).

**Response:**
```json
{
  "thread_id": "proj_123",
  "status": "running"
}
```

#### Quick Chat

```http
POST /api/projects/{id}/chat
Content-Type: application/json

{
  "message": "How do I add a safety relay?"
}
```

Quick chat without full analysis.

**Response:**
```json
{
  "response": "To add a safety relay...",
  "sources": [...]
}
```

### Topology

#### Get Topology

```http
GET /api/projects/{id}/topology
```

Get latest topology draft.

**Response:**
```json
{
  "version": 1,
  "status": "draft",
  "nodes": [
    {
      "id": "node_1",
      "type": "PLC",
      "data": { ... }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "type": "power"
    }
  ]
}
```

#### Save Topology

```http
POST /api/projects/{id}/topology
Content-Type: application/json

{
  "nodes": [...],
  "edges": [...]
}
```

Save a new topology draft.

**Response:**
```json
{
  "version": 2,
  "status": "draft",
  "created_at": "2026-05-26T12:00:00Z"
}
```

#### Confirm Topology

```http
POST /api/projects/{id}/topology/confirm
```

Confirm topology as source of truth and regenerate deliverables.

**Response:**
```json
{
  "version": 2,
  "status": "confirmed",
  "confirmed_at": "2026-05-26T12:00:00Z"
}
```

### Knowledge Base

#### List Documents

```http
GET /api/knowledge/docs
```

List all knowledge base documents.

**Response:**
```json
{
  "docs": [
    {
      "id": "doc_123",
      "filename": "siemens_plc_catalog.pdf",
      "status": "ready",
      "chunk_count": 150,
      "uploaded_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

#### Upload Documents

```http
POST /api/knowledge/docs
Content-Type: multipart/form-data

files: [file1.pdf, file2.pdf]
```

Upload documents for processing.

**Response:**
```json
{
  "ids": ["doc_123", "doc_124"],
  "status": "processing"
}
```

#### Delete Documents

```http
DELETE /api/knowledge/docs
Content-Type: application/json

{
  "ids": ["doc_123", "doc_124"]
}
```

Batch delete documents.

**Response:**
```json
{
  "deleted_count": 2
}
```

#### Retry Document

```http
POST /api/knowledge/docs/{id}/retry
```

Retry processing a failed document.

**Response:**
```json
{
  "id": "doc_123",
  "status": "processing"
}
```

#### Import URL

```http
POST /api/knowledge/urls
Content-Type: application/json

{
  "url": "https://example.com/datasheet.pdf"
}
```

Import a web page.

**Response:**
```json
{
  "id": "doc_125",
  "status": "processing"
}
```

#### Search Knowledge Base

```http
POST /api/knowledge/search
Content-Type: application/json

{
  "query": "Siemens S7-1200",
  "limit": 10
}
```

Search knowledge base.

**Response:**
```json
{
  "results": [
    {
      "chunk_id": "chunk_123",
      "text": "Siemens S7-1200 is a compact PLC...",
      "score": 0.95,
      "source_doc": "doc_123"
    }
  ]
}
```

### BOM

#### Get BOM

```http
GET /api/projects/{id}/bom
```

Get Bill of Materials.

**Response:**
```json
{
  "items": [
    {
      "id": "item_1",
      "name": "PLC CPU",
      "manufacturer": "Siemens",
      "model": "6ES7 1214C-1/...",
      "quantity": 1,
      "specifications": "...",
      "confidence": "high",
      "source_chunk_id": "chunk_123"
    }
  ]
}
```

#### Update BOM Item

```http
PUT /api/projects/{id}/bom/{item_id}
Content-Type: application/json

{
  "manufacturer": "Siemens",
  "model": "6ES7 1215C-1/...",
  "quantity": 1
}
```

Update a BOM item.

**Response:**
```json
{
  "id": "item_1",
  "manufacturer": "Siemens",
  "model": "6ES7 1215C-1/...",
  "updated_at": "2026-05-26T12:00:00Z"
}
```

### Schematic

#### Generate Schematic

```http
POST /api/projects/{id}/schematic
```

Generate electrical schematic.

**Response:**
```json
{
  "mermaid_code": "graph TD\n  PLC[PLC] --> Power[Power Supply]",
  "svg_data": "..."
}
```

### Code Generation

#### Generate ST Code

```http
POST /api/projects/{id}/codegen
```

Generate PLC structured text code.

**Response:**
```json
{
  "modules": [
    {
      "name": "MAIN_OB",
      "type": "OB",
      "code": "ORGANIZATION_BLOCK MAIN\n..."
    }
  ]
}
```

### Messages

#### Get Messages

```http
GET /api/projects/{id}/messages
```

Get conversation history.

**Response:**
```json
{
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Design a conveyor system",
      "created_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

#### Add Message

```http
POST /api/projects/{id}/messages
Content-Type: application/json

{
  "role": "user",
  "content": "Add a safety relay"
}
```

Add message to conversation.

**Response:**
```json
{
  "id": "msg_2",
  "role": "user",
  "content": "Add a safety relay",
  "created_at": "2026-05-26T10:05:00Z"
}
```

### Feedback

#### Submit Feedback

```http
POST /api/feedback/{type}
Content-Type: application/json

{
  "type": "thumbs_down",
  "project_id": "proj_123",
  "item_id": "item_1",
  "reason": "Wrong manufacturer"
}
```

Submit feedback on AI selections.

**Response:**
```json
{
  "id": "feedback_123",
  "status": "recorded"
}
```

### Memory

#### Get Episodes

```http
GET /api/episodes?limit=10
```

Get episodic memories.

**Response:**
```json
{
  "episodes": [
    {
      "id": "ep_1",
      "summary": "Conveyor system with 3 motors",
      "decisions": [...],
      "created_at": "2026-05-26T10:00:00Z"
    }
  ]
}
```

#### Get Memory Sources

```http
GET /api/memory-sources?item_id=item_1
```

Trace selection sources.

**Response:**
```json
{
  "sources": [
    {
      "type": "rag_chunk",
      "chunk_id": "chunk_123",
      "score": 0.95
    },
    {
      "type": "graph_neighbor",
      "node_id": "node_456",
      "relation": "COMPATIBLE_WITH"
    }
  ]
}
```

### Organization

#### Get Organization

```http
GET /api/orgs/me
```

Get current organization details.

**Response:**
```json
{
  "id": "org_123",
  "name": "Acme Engineering",
  "code": "acme",
  "created_at": "2026-05-01T10:00:00Z"
}
```

#### Get Preferences

```http
GET /api/orgs/me/preferences
```

Get organization preferences.

**Response:**
```json
{
  "preferences": [
    {
      "key": "default_plc_family",
      "value": "Siemens S7-1200",
      "confidence": 0.9,
      "source": "admin"
    }
  ]
}
```

#### Update Preferences

```http
PUT /api/orgs/me/preferences
Content-Type: application/json

{
  "preferences": [
    {
      "key": "default_plc_family",
      "value": "Siemens S7-1500"
    }
  ]
}
```

Update organization preferences.

**Response:**
```json
{
  "updated_count": 1
}
```

## WebSocket Endpoints

### Project Analysis Progress

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/projects/{id}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.stage: 'requirements' | 'mapping' | 'safety' | ...
  // data.progress: 0-100
  // data.message: status message
};
```

### Knowledge Base Progress

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/knowledge/docs/{id}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.status: 'uploading' | 'chunking' | 'embedding' | 'graph_extracting' | 'ready' | 'error'
  // data.progress: 0-100
  // data.error: error message if failed
};
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- 100 requests per minute per organization
- 10 analysis runs per hour per organization
- 1000 knowledge base uploads per day per organization

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1620000000
```

## SDK Examples

### Python

```python
import httpx

client = httpx.AsyncClient(
    base_url="http://localhost:8000",
    headers={"X-Org-Token": "your-token"}
)

# Create project
response = await client.post("/api/projects", json={"name": "My Project"})
project = response.json()

# Run analysis
response = await client.post(f"/api/projects/{project['id']}/analyze-v2", json={
    "requirement_text": "Design a conveyor system"
})
```

### JavaScript

```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'X-Org-Token': 'your-token' }
});

// Create project
const project = await client.post('/api/projects', { name: 'My Project' });

// Run analysis
const analysis = await client.post(`/api/projects/${project.data.id}/analyze-v2`, {
  requirement_text: 'Design a conveyor system'
});
```

## OpenAPI Specification

The full OpenAPI specification is available at:

```
http://localhost:8000/openapi.json
```

Interactive API documentation (Swagger UI):

```
http://localhost:8000/docs
```

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for API version history.
