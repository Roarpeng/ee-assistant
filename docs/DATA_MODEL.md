# Volta Data Model

This document describes the database schema and data models used in Volta.

## Database Overview

Volta uses PostgreSQL 16 with the pgvector extension for vector similarity search.

## Schema Diagram

```
┌─────────────────┐       ┌─────────────────┐
│   organizations │       │ org_preferences│
├─────────────────┤       ├─────────────────┤
│ id (PK)         │───────│ org_id (FK)     │
│ name            │       │ key (PK)        │
│ code            │       │ value           │
│ token_hash      │       │ confidence      │
│ created_at      │       │ source          │
└─────────────────┘       └─────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│    projects     │───────│  requirements   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ org_id (FK)     │       │ project_id (FK) │
│ name            │       │ machine_type    │
│ status          │       │ safety_level    │
│ title           │       │ environment     │
│ topic_tags      │       │ plc_family      │
│ created_at      │       │ raw_text        │
│ updated_at      │       └─────────────────┘
└─────────────────┘
         │
         │
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  io_items       │ │ logic_rules │ │  bom_items      │
├─────────────────┤ ├─────────────┤ ├─────────────────┤
│ id (PK)         │ │ id (PK)     │ │ id (PK)         │
│ requirement_id  │ │ requirement │ │ project_id (FK) │
│ (FK)            │ │ _id (FK)    │ │ category        │
│ tag             │ │ description │ │ manufacturer    │
│ io_type         │ └─────────────┘ │ model           │
│ description     │                 │ qty             │
└─────────────────┘                 │ specifications  │
                                    │ confidence      │
┌─────────────────┐                 │ source_chunk_id │
│ project_        │                 │ alternatives    │
│ topologies      │                 └─────────────────┘
├─────────────────┘
│ id (PK)         │       ┌─────────────────┐
│ project_id (FK) │───────│ schematics      │
│ version         │       ├─────────────────┤
│ status          │       │ id (PK)         │
│ source          │       │ project_id (FK) │
│ snapshot (JSON) │       │ mermaid_code    │
│ created_at      │       │ svg_data        │
│ confirmed_at    │       └─────────────────┘
└─────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│  st_modules     │       │ chat_messages   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ project_id (FK) │───────│ project_id (FK) │
│ name            │       │ role            │
│ module_type     │       │ content         │
│ code            │       │ options (JSON)  │
│ sort_order      │       │ sequence        │
└─────────────────┘       │ created_at      │
                          └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│ knowledge_docs  │───────│component_nodes  │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ filename        │       │ name            │
│ manufacturer    │       │ component_type  │
│ category_tags   │       │ properties (JSON)│
│ chunk_count     │       │ community       │
│ status          │       │ source_doc_id   │
│ source_type     │       │ (FK)            │
│ source_url      │       └─────────────────┘
│ uploaded_at     │              │
└─────────────────┘              │
         │                        │
         │                        ▼
         │              ┌─────────────────┐
         │              │component_edges  │
         │              ├─────────────────┤
         │              │ id (PK)         │
         │              │ source_id (FK)  │
         │              │ target_id (FK)  │
         │              │ relation        │
         │              │ properties (JSON)│
         │              │ confidence      │
         │              │ source_doc_id   │
         │              │ (FK)            │
         │              └─────────────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│   decisions     │───────│ run_history     │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ type            │       │ project_id (FK) │
│ project_id (FK) │       │ nodes_executed  │
│ item_id         │       │ (JSON)         │
│ before_value    │       │ errors (JSON)   │
│ after_value     │       │ final_stage     │
│ reason          │       │ created_at      │
│ created_at      │       └─────────────────┘
└─────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│selection_weights│───────│episodic_memories│
├─────────────────┤       ├─────────────────┤
│ org_id (FK)     │       │ id (PK)         │
│ category        │       │ org_id (FK)     │
│ manufacturer    │       │ summary         │
│ model           │       │ key_decisions   │
│ weight          │       │ (JSON)          │
│ updated_at      │       │ requirement_snap │
└─────────────────┘       │ (JSON)          │
                          │ bom_snap (JSON) │
                          │ created_at      │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │weekly_memory_   │
                          │reports         │
                          ├─────────────────┤
                          │ id (PK)         │
                          │ org_id (FK)     │
                          │ week_start      │
                          │ new_rules (JSON)│
                          │ revisions (JSON)│
                          │ gaps (JSON)     │
                          │ metrics (JSON)  │
                          └─────────────────┘
```

## Core Tables

### organizations

Organization (multi-tenant) management.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Organization name |
| code | VARCHAR(50) UNIQUE | Organization code |
| token_hash | VARCHAR(255) UNIQUE | SHA256 hash of auth token |
| created_at | TIMESTAMP | Creation timestamp |

**Indexes:**
- `idx_organizations_code` on `code`

### org_preferences

Organization-level default preferences.

| Column | Type | Description |
|--------|------|-------------|
| org_id | UUID FK | Reference to organizations |
| key | VARCHAR(100) | Preference key |
| value | JSONB | Preference value |
| confidence | FLOAT | Confidence score (0-1) |
| source | VARCHAR(50) | Source (admin/clarify/inferred) |

**Primary Key:** (org_id, key)
**Foreign Keys:** org_id → organizations(id) ON DELETE CASCADE

### projects

Main project table.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID FK | Reference to organizations |
| name | VARCHAR(255) | Project name |
| status | VARCHAR(50) | Project status (draft/active/archived) |
| title | VARCHAR(255) | AI-generated title |
| topic_tags | JSONB | AI-generated topic tags |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Foreign Keys:** org_id → organizations(id) ON DELETE CASCADE
**Indexes:**
- `idx_projects_org_id` on `org_id`
- `idx_projects_status` on `status`

### requirements

Structured requirements for a project.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| machine_type | VARCHAR(100) | Type of machine/system |
| safety_level | VARCHAR(50) | Safety level (SIL 0-3) |
| environment | JSONB | Environmental conditions |
| plc_family | VARCHAR(100) | Preferred PLC family |
| raw_text | TEXT | Original requirement text |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Relationship:** One-to-one with projects

### io_items

Input/Output items list.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| requirement_id | UUID FK | Reference to requirements |
| tag | VARCHAR(100) | Signal tag |
| io_type | VARCHAR(10) | IO type (DI/DO/AI/AO) |
| description | TEXT | Signal description |

**Foreign Keys:** requirement_id → requirements(id) ON DELETE CASCADE

### logic_rules

Control logic descriptions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| requirement_id | UUID FK | Reference to requirements |
| description | TEXT | Logic description |

**Foreign Keys:** requirement_id → requirements(id) ON DELETE CASCADE

### bom_items

Bill of Materials items.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| category | VARCHAR(100) | Component category |
| manufacturer | VARCHAR(255) | Manufacturer name |
| model | VARCHAR(255) | Model/part number |
| qty | INTEGER | Quantity |
| specifications | TEXT | Technical specifications |
| confidence | VARCHAR(20) | Selection confidence (rag/llm/mixed) |
| source_chunk_id | VARCHAR(100) | Source RAG chunk ID |
| alternatives | JSONB | Alternative components |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Indexes:**
- `idx_bom_items_project_id` on `project_id`

### project_topologies

Topology snapshots (single source of truth).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| version | INTEGER | Version number |
| status | VARCHAR(20) | Status (draft/confirmed) |
| source | VARCHAR(20) | Source (user/ai/imported/memory) |
| snapshot | JSONB | Topology data (nodes/edges) |
| created_at | TIMESTAMP | Creation timestamp |
| confirmed_at | TIMESTAMP | Confirmation timestamp |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Indexes:**
- `idx_topologies_project_id` on `project_id`
- `idx_topologies_version` on `(project_id, version)`

### schematics

Electrical schematics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| mermaid_code | TEXT | Mermaid diagram code |
| svg_data | TEXT | SVG rendering |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Relationship:** One-to-one with projects

### st_modules

PLC Structured Text code modules.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| name | VARCHAR(255) | Module name |
| module_type | VARCHAR(10) | Type (OB/FC/FB/DB) |
| code | TEXT | ST code |
| sort_order | INTEGER | Display order |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Indexes:**
- `idx_st_modules_project_id` on `project_id`

### chat_messages

Conversation history.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| role | VARCHAR(20) | Role (user/assistant/system) |
| content | TEXT | Message content |
| options | JSONB | Message options |
| sequence | INTEGER | Message sequence |
| created_at | TIMESTAMP | Creation timestamp |

**Foreign Keys:** project_id → projects(id) ON DELETE CASCADE
**Indexes:**
- `idx_chat_messages_project_id` on `project_id`
- `idx_chat_messages_sequence` on `(project_id, sequence)`

## Knowledge Base Tables

### knowledge_docs

Knowledge base documents.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| filename | VARCHAR(255) | Original filename |
| manufacturer | VARCHAR(255) | Manufacturer (if applicable) |
| category_tags | JSONB | Category tags |
| chunk_count | INTEGER | Number of chunks |
| status | VARCHAR(30) | Processing status |
| source_type | VARCHAR(20) | Source type (pdf/txt/md/html/docx/url) |
| source_url | TEXT | Source URL (if applicable) |
| uploaded_at | TIMESTAMP | Upload timestamp |
| error_message | TEXT | Error message (if failed) |

**Indexes:**
- `idx_knowledge_docs_status` on `status`
- `idx_knowledge_docs_manufacturer` on `manufacturer`

### component_nodes

Knowledge graph component nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Component name |
| component_type | VARCHAR(100) | Component type |
| properties | JSONB | Component properties |
| community | INTEGER | Louvain community ID |
| source_doc_id | UUID FK | Source document |

**Foreign Keys:** source_doc_id → knowledge_docs(id) ON DELETE SET NULL
**Indexes:**
- `idx_component_nodes_type` on `component_type`
- `idx_component_nodes_community` on `community`

### component_edges

Knowledge graph component relationships.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| source_id | UUID FK | Source component node |
| target_id | UUID FK | Target component node |
| relation | VARCHAR(50) | Relationship type |
| properties | JSONB | Edge properties |
| confidence | FLOAT | Confidence score (0-1) |
| source_doc_id | UUID FK | Source document |

**Foreign Keys:**
- source_id → component_nodes(id) ON DELETE CASCADE
- target_id → component_nodes(id) ON DELETE CASCADE
- source_doc_id → knowledge_docs(id) ON DELETE SET NULL

**Relationship Types:**
- REQUIRES_POWER
- OUTPUTS_SIGNAL
- USES_PROTOCOL
- COMPATIBLE_WITH
- ALTERNATIVE_TO
- MOUNTS_ON
- CONTROLS

## Memory System Tables

### decisions

User decision tracking (M2).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| type | VARCHAR(50) | Decision type |
| project_id | UUID FK | Reference to projects |
| item_id | VARCHAR(100) | Related item ID |
| before_value | JSONB | Value before decision |
| after_value | JSONB | Value after decision |
| reason | TEXT | User reason |
| created_at | TIMESTAMP | Decision timestamp |

**Decision Types:**
- manual_select
- bom_edit
- wiring_edit
- topology_edit
- thumbs_down
- clarify

### run_history

Analysis run telemetry (M2).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID FK | Reference to projects |
| nodes_executed | JSONB | Execution time per node (ms) |
| errors | JSONB | Error details |
| final_stage | VARCHAR(50) | Final stage reached |
| created_at | TIMESTAMP | Run timestamp |

### selection_weights

Component selection bias weights (M2).

| Column | Type | Description |
|--------|------|-------------|
| org_id | UUID FK | Reference to organizations |
| category | VARCHAR(100) | Component category |
| manufacturer | VARCHAR(255) | Manufacturer |
| model | VARCHAR(255) | Model |
| weight | FLOAT | Accumulated weight |
| updated_at | TIMESTAMP | Last update |

**Primary Key:** (org_id, category, manufacturer, model)
**Foreign Keys:** org_id → organizations(id) ON DELETE CASCADE

### episodic_memories

Episodic memories (M3).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID FK | Reference to organizations |
| summary | TEXT | One-sentence summary |
| key_decisions | JSONB | Key decisions made |
| requirement_snap | JSONB | Requirement snapshot |
| bom_snap | JSONB | BOM snapshot |
| created_at | TIMESTAMP | Creation timestamp |

**Foreign Keys:** org_id → organizations(id) ON DELETE CASCADE
**Indexes:**
- `idx_episodic_memories_org_id` on `org_id`
- `idx_episodic_memories_created_at` on `created_at`

### weekly_memory_reports

Weekly memory consolidation reports (M3).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID FK | Reference to organizations |
| week_start | DATE | Week start date |
| new_rules | JSONB | Discovered rules |
| revisions | JSONB | Pattern revisions |
| gaps | JSONB | Knowledge gaps |
| metrics | JSONB | Usage metrics |

**Foreign Keys:** org_id → organizations(id) ON DELETE CASCADE
**Indexes:**
- `idx_weekly_reports_org_week` on `(org_id, week_start)`

## LangGraph Checkpoint Table

### langgraph_checkpoints

Automatically created by LangGraph AsyncPostgresSaver.

| Column | Type | Description |
|--------|------|-------------|
| thread_id | VARCHAR | Thread identifier |
| checkpoint_ns | VARCHAR | Checkpoint namespace |
| checkpoint_id | VARCHAR | Checkpoint ID |
| parent_checkpoint_id | VARCHAR | Parent checkpoint ID |
| type | VARCHAR | Checkpoint type |
| checkpoint | JSONB | Checkpoint data |
| metadata | JSONB | Checkpoint metadata |

**Indexes:**
- Primary key on (thread_id, checkpoint_ns, checkpoint_id)

## JSONB Schemas

### project_topologies.snapshot

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "PLC",
      "position": {"x": 100, "y": 100},
      "data": {
        "name": "S7-1200",
        "manufacturer": "Siemens",
        "model": "6ES7 1214C-1/..."
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "type": "power",
      "data": {
        "voltage": "24V",
        "current": "10A"
      }
    }
  ]
}
```

### component_nodes.properties

```json
{
  "voltage_rating": "24V DC",
  "current_rating": "10A",
  "power_rating": "240W",
  "mounting": "DIN rail",
  "protection": "IP20"
}
```

### org_preferences.value

```json
{
  "default_plc_family": "Siemens S7-1200",
  "default_protocol": "PROFINET",
  "default_voltage": "24V DC",
  "safety_level": "SIL 1"
}
```

## Database Migrations

Migrations are managed with Alembic:

```bash
# Create migration
cd backend
alembic revision --autogenerate -m "Description"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

Migration history:
- `001_initial_tables`: Core tables (projects, requirements, io_items, etc.)
- `002_add_component_graph_tables`: Knowledge graph tables
- `002_add_knowledge_status_and_fk_ondelete`: Knowledge base improvements
- `002_langgraph_checkpoint`: LangGraph checkpoint table
- `003_add_knowledge_source_type_and_url`: URL import support
- `003_chat_messages`: Chat history
- `004_organizations`: Multi-tenant support
- `005_projects_org_fk`: Organization foreign key
- `006_decisions_runhistory_weights`: Memory M2
- `007_episodic_memories_and_reports`: Memory M3

## Performance Considerations

### Indexes

All frequently queried columns are indexed:
- Foreign keys
- Status columns
- Timestamp columns
- Composite indexes for common query patterns

### JSONB

JSONB columns use GIN indexes for efficient querying:
```sql
CREATE INDEX idx_bom_alternatives ON bom_items USING GIN (alternatives);
CREATE INDEX idx_org_preferences_value ON org_preferences USING GIN (value);
```

### Partitioning

For large deployments, consider partitioning:
- `chat_messages` by `created_at`
- `decisions` by `created_at`
- `run_history` by `created_at`

## Backup Strategy

### Logical Backup

```bash
pg_dump -U volta volta > backup.sql
```

### Physical Backup

```bash
pg_basebackup -D /backup/volta -Ft -z -P
```

### Point-in-Time Recovery

Configure WAL archiving for PITR:
```bash
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal/%f'
```

## Security

### Row-Level Security

Enable RLS for multi-tenant isolation:
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON projects
  FOR ALL TO authenticated
  USING (org_id = current_org_id());
```

### Encryption

- Use TLS for database connections
- Encrypt sensitive fields at rest (application-level)
- Use pgcrypto for column encryption if needed

## Monitoring

### Query Performance

Monitor slow queries:
```sql
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Table Sizes

Monitor table growth:
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Connection Pooling

Use PgBouncer for connection pooling in production.
