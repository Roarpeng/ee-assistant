# Volta Engineering Memory Flywheel Design

**Date:** 2026-05-06  
**Status:** Draft for review  
**Scope:** Full product direction for natural-language/document-driven electrical design across pneumatic actuators, servo axes, conveyor lines, and integrated control cabinets.

## 1. Product Thesis

Volta should not be a generic chat-to-BOM tool. It should be an electrical engineering design workspace where:

1. Users describe requirements in natural language or upload requirement documents.
2. The backend extracts functional units and constraints.
3. Functional units are matched against an electrical design pattern library.
4. A topology is generated and becomes the canonical project source of truth.
5. Users edit the topology directly or discuss selected topology regions with the assistant.
6. BOM, IO lists, ST/SCL code, reports, and exports are derived from the confirmed topology.
7. Completed exports are committed into a long-term engineering memory flywheel.
8. Future designs retrieve and reuse past cases, user preferences, design patterns, component facts, standard rules, and validation lessons.

The key principle is:

```text
Topology is the source of truth.
BOM, IO, code, and export packages are derived artifacts.
LLMs orchestrate and explain, but engineering rules and persisted topology decide.
```

## 2. Current Project Fit

The repository already contains important building blocks:

- LangGraph workflow: requirements, category mapping, selection, validation, topology, code, final review.
- Qdrant + PostgreSQL component graph knowledge base.
- ReactFlow topology canvas with user editing and selected-region chat context.
- Project persistence for requirements, BOM, schematic, and ST modules.
- Chat history, conversation search, automatic titles, and a faster approval-gated chat path.

The main gaps are:

- No persisted project topology table.
- User-edited topology is not yet the backend source of truth.
- `TopologyPanel` sends topology to codegen, but backend codegen still derives from DB requirement/BOM and ignores the posted topology.
- Knowledge documents and requirement documents are not separated.
- The rule engine is too small for the desired engineering coverage.
- Exported projects are not stored as reusable memory cases.
- There is no memory commit/retrieval loop similar to OpenViking/Mem0/Zep/Letta patterns.

## 3. Reference Memory Architecture

Volta should borrow these ideas from current agent memory frameworks:

### OpenViking-style session commit

- Treat a session, topology confirmation, BOM confirmation, and export as commit points.
- At commit, extract memory candidates, deduplicate, merge, and index them.
- Store memories in typed, hierarchical categories instead of only raw vector chunks.

### Mem0-style discrete semantic memories

- Extract small, reusable facts:
  - "User prefers Siemens S7-1200 for small machines."
  - "A double magnetic-switch cylinder pattern needs 2 DI and 1 DO."
  - "Limit switches on servo axes should connect to IO/PLC, not be drawn as drive feedback only."

### Zep/Graphiti-style temporal graph

- Store when a memory was valid.
- Allow later projects or user corrections to supersede old assumptions.
- Keep relations between patterns, components, projects, standards, and validation outcomes.

### Letta/MemGPT-style tiered context

- L0: current user message, current canvas selection, current project state.
- L1: relevant project memories and recent conversation.
- L2: long-term design patterns, standards, component facts, and similar exported projects.

## 4. Memory Categories

Volta's memory is engineering memory, not only chat memory. Use seven first-class categories.

| Type | Purpose | Example |
|------|---------|---------|
| `user_preference` | User defaults and style choices | Siemens first, PROFINET preferred, TIA Portal SCL style |
| `project_case` | Completed/exported project summaries | Double-cylinder handling station with safety loop |
| `function_pattern` | Reusable electromechanical design patterns | Cylinder extend/retract detection; servo homing |
| `standard_rule` | Standards and validation rules | IEC 60204-1 emergency stop wiring constraints |
| `component_fact` | Structured component knowledge | SM1223 supports N DI/DO at 24VDC |
| `topology_revision` | Learned topology edits and diffs | User moved limit sensors under IO module |
| `validation_lesson` | Failed checks and accepted fixes | 24V PSU undersized; changed to 10A PSU |

Each memory item must include:

- `title`
- `content`
- `structured_data`
- `source_type`
- `source_id`
- `confidence`
- `quality_score`
- `valid_from`
- `valid_to`
- `tags`

## 5. Proposed Backend Data Model

### 5.1 Project topology as source of truth

Add:

```text
project_topologies
  id
  project_id
  version
  status: draft | confirmed | exported
  source: ai | user | imported | memory
  snapshot JSON
  created_at
  confirmed_at

topology_nodes
  id
  topology_id
  node_type
  label
  function_role
  component_category
  selected_bom_item_id
  properties JSON
  position JSON
  validation_status

topology_edges
  id
  topology_id
  source_node_id
  target_node_id
  relation
  protocol
  properties JSON
  validation_status
```

Recommended edge relation vocabulary:

```text
POWER_AC
POWER_24VDC
SIGNAL_DI
SIGNAL_DO
SIGNAL_AI
SIGNAL_AO
PROFINET
ETHERCAT
ETHERNET
SAFETY_CHAIN
CONTROL_COMMAND
FEEDBACK_SIGNAL
MECHANICAL_RELATION
PNEUMATIC_SUPPLY
```

### 5.2 Functional units

Add:

```text
functional_units
  id
  project_id
  topology_id
  unit_type
  name
  description
  pattern_id
  requirement_atoms JSON
  required_io JSON
  required_nodes JSON
  validation_status
  confidence
```

A functional unit is the bridge between natural language and topology. Examples:

- `pneumatic_cylinder_extend_retract`
- `pneumatic_position_force_control`
- `servo_axis_homing`
- `conveyor_vfd_speed_control`
- `safety_emergency_stop_loop`
- `control_cabinet_base`

### 5.3 Design patterns

Add:

```text
design_patterns
  id
  code
  name
  domain
  description
  trigger_conditions JSON
  required_nodes JSON
  required_edges JSON
  required_io JSON
  bom_constraints JSON
  validation_rules JSON
  code_template_hints JSON
  standard_refs JSON
  examples JSON
  enabled
```

These are seedable engineering assets. They should be versioned and editable by maintainers.

### 5.4 Requirement documents

Separate requirement documents from knowledge documents:

```text
requirement_docs
  id
  project_id
  filename
  file_type: pdf | docx | xlsx | csv | txt
  status
  extracted_text
  extracted_tables JSON
  extracted_requirements JSON
  uploaded_at
```

Knowledge docs remain for manuals, standards, and catalogs. Requirement docs are project inputs.

### 5.5 Export packages

Add:

```text
export_packages
  id
  project_id
  topology_id
  version
  package_url
  report_url
  topology_snapshot JSON
  bom_snapshot JSON
  io_snapshot JSON
  code_snapshot JSON
  requirement_snapshot JSON
  memory_committed_at
  created_at
```

Exporting a project is the highest-quality memory commit trigger because it represents user-approved work.

### 5.6 Memory tables

Add:

```text
memory_items
  id
  memory_type
  title
  content
  structured_data JSON
  source_type
  source_id
  confidence
  quality_score
  valid_from
  valid_to
  tags JSON
  created_at
  updated_at

memory_links
  id
  source_memory_id
  target_memory_id
  relation
  confidence
  properties JSON

memory_embeddings
  id
  memory_id
  chunk_index
  content
  vector_id
  metadata JSON
```

Use Qdrant for memory embeddings initially; keep structured memory in PostgreSQL.

## 6. Backend Module Design

Create:

```text
backend/app/core/memory/
  __init__.py
  schemas.py
  extractor.py
  retriever.py
  merger.py
  scorer.py
  flywheel.py
  prompts.py
```

### `extractor.py`

Extract memory candidates from:

- Chat transcripts
- Confirmed topology snapshots
- BOM snapshots
- Validation results
- Export packages
- User corrections

Output:

```json
{
  "memories": [
    {
      "memory_type": "function_pattern",
      "title": "Cylinder extend/retract detection",
      "content": "...",
      "structured_data": {},
      "confidence": 0.86,
      "tags": ["pneumatic", "cylinder", "DI", "DO"]
    }
  ]
}
```

### `retriever.py`

Retrieve relevant memories using:

1. Type and tag filters.
2. Vector recall from Qdrant.
3. PostgreSQL graph links.
4. Quality and recency reranking.
5. Context budget packing into L0/L1/L2 tiers.

### `merger.py`

Deduplicate and merge:

- Same project case version: update.
- Same function pattern with higher confidence: merge examples.
- Superseded user preference: close old `valid_to` and create new.
- Validation lesson duplicate: increment usage count.

### `scorer.py`

Score memory quality:

- Exported project memory: high.
- Confirmed topology: high.
- User correction accepted: high.
- Raw chat suggestion: medium/low.
- LLM-only inference: lower unless later validated.

### `flywheel.py`

Commit pipeline:

```text
collect_source_context
  → extract_candidates
  → retrieve_similar_existing
  → decide create / merge / skip / supersede
  → persist structured memory
  → index memory chunks
  → link to project/pattern/component/standard
```

## 7. Agent Workflow

Add memory and topology-first nodes around the existing LangGraph workflow:

```text
InputRouterAgent
  ├── chat
  ├── natural_language_requirement
  ├── requirement_document
  ├── topology_edit
  └── export_request

MemoryRetrieverAgent
  → retrieves user preferences, patterns, similar projects, standards, component facts

DocumentParserAgent
  → PDF/DOCX/XLSX/CSV to text, tables, requirement candidates

RequirementNormalizerAgent
  → standard requirement atoms and constraints

FunctionPatternMatcherAgent
  → ABCD design patterns and functional units

TopologyPlannerAgent
  → topology draft from functional units

TopologyDiffAgent
  → compares user-edited topology to prior version

BOMResolverAgent
  → topology to BOM and alternatives

RuleValidatorAgent
  → electrical/safety/standards checks

CodePlannerAgent
  → topology + IO + validated BOM to ST/SCL framework

ApprovalAgent
  → final output check before user-visible results

MemoryCommitAgent
  → commit when topology/BOM/export is confirmed
```

The current LangGraph can evolve toward this by inserting `MemoryRetrieverAgent` before requirements analysis and `MemoryCommitAgent` after export/confirmation.

## 8. ABCD Design Pattern Library

### A. Pneumatic actuator patterns

Seed patterns:

1. `pneumatic_cylinder_extend_retract`
   - Trigger: cylinder + two magnetic sensors.
   - Capability: detect extended and retracted states.
   - Required IO: 1 DO for solenoid valve, 2 DI for sensors.
   - Required nodes: PLC, IO module, valve/valve island, cylinder, extend sensor, retract sensor, 24VDC PSU.

2. `pneumatic_cylinder_extend_only`
   - Trigger: cylinder + one position sensor.
   - Capability: detect extended/end position only.
   - Required IO: 1 DO, 1 DI.

3. `pneumatic_position_force_control`
   - Trigger: cylinder + position sensor + electronic pressure regulator.
   - Capability: control position and force/pressure with analog command/feedback.
   - Required IO: AO for regulator command, AI for pressure/position feedback, DI/DO for enable/fault if needed.

4. `pneumatic_valve_island_control`
   - Trigger: multiple cylinders or valve island.
   - Capability: centralized pneumatic control via fieldbus or multi-DO.
   - Required nodes: valve island, IO or communication module, pneumatic supply, sensors.

Validation rules:

- Sensor voltage must match IO input voltage.
- Valve coil voltage must match DO output or relay interface.
- If pressure control is requested, pressure feedback is required.
- If only one sensor is present, do not claim full extend/retract state knowledge.

### B. Servo axis patterns

Seed patterns:

1. `servo_relative_encoder_homing`
   - Trigger: servo motor with relative encoder + two limit sensors.
   - Capability: establish travel range and origin through homing routine.
   - Required IO: positive limit DI, negative limit DI, servo enable DO, alarm/reset DI/DO as needed.
   - Required nodes: PLC/motion controller, servo drive, servo motor, positive limit, negative limit, home sensor if specified, safety chain.

2. `servo_absolute_encoder_positioning`
   - Trigger: absolute encoder servo.
   - Capability: retain position after power cycle.
   - Required nodes: PLC/motion controller, servo drive, motor, safety STO, communication bus.

3. `servo_axis_safety_sto`
   - Trigger: servo + safety requirement.
   - Capability: safe torque off.
   - Required nodes: safety relay/safety PLC, STO inputs, E-stop, contact feedback.

Validation rules:

- Relative encoder requires homing reference.
- Limit sensors must be represented as safety/feedback inputs.
- Motion bus must match PLC capability.
- STO must exist for safety-rated axes.

### C. Conveyor line patterns

Seed patterns:

1. `single_conveyor_vfd`
   - Trigger: conveyor motor + speed control.
   - Required nodes: PLC, VFD, motor, breaker, contactor or safety cutoff, speed/proximity sensor, HMI if speed setting is requested.

2. `multi_conveyor_sequence`
   - Trigger: multiple conveyor motors with start/stop sequence.
   - Required logic: downstream-first start or process-specific sequencing; upstream-first stop as configured.

3. `conveyor_jam_detection`
   - Trigger: jam/blockage/堵料 detection.
   - Required sensors: photoelectric/proximity/speed sensor.

4. `conveyor_estop_interlock`
   - Trigger: E-stop or safety door.
   - Required safety nodes: E-stop, safety relay or safety PLC, contactor/drive STO, feedback loop.

Validation rules:

- VFD motor power must match motor rating.
- Breaker/contactor/thermal overload must match load current.
- E-stop must remove torque/power through rated safety path.
- Mixed fieldbus protocols must be flagged.

### D. Integrated control cabinet patterns

Seed patterns:

1. `control_cabinet_base`
   - Required nodes: main disconnect, breaker/fuse, 24VDC PSU, PLC CPU, IO modules, terminal blocks, grounding, cabinet power distribution.

2. `plc_hmi_profinet`
   - Required nodes: PLC, HMI, switch if more than point-to-point, Ethernet/PROFINET edges.

3. `safety_relay_estop_loop`
   - Required nodes: E-stop, safety relay/safety PLC, contactor feedback, reset button where required.

4. `io_expansion_for_sensors_actuators`
   - Required IO count sizing by DI/DO/AI/AO plus spare margin.

5. `dc_power_capacity`
   - Rule: sum estimated 24VDC load + margin; choose PSU current and protection accordingly.

Validation rules:

- 24VDC PSU capacity must exceed load plus margin.
- IO module channel count must cover assigned points plus configured spare ratio.
- Safety loop must include feedback where applicable.
- Cabinet base components cannot be omitted in exported designs.

## 9. Requirement Document Pipeline

Supported inputs:

- Natural language chat.
- PDF requirement documents.
- DOCX technical agreements.
- XLSX/CSV IO tables, equipment lists, preliminary BOM.

Pipeline:

```text
upload requirement document
  → detect file type
  → extract text and tables
  → classify sections
  → extract requirement atoms
  → normalize units and terminology
  → link atoms to functional units
  → ask user for missing critical constraints
```

File parsing recommendations:

- PDF: current PyMuPDF path, plus table-aware extraction later.
- DOCX: `python-docx`.
- XLSX: `openpyxl` already exists in requirements.
- CSV: Python standard `csv`.
- Scanned PDF/image: defer OCR until after text-based flows are stable.

## 10. Topology Confirmation Flow

Do not regenerate downstream artifacts on every drag. Use explicit confirmation.

```text
AI generates topology draft
  → user edits topology
  → user selects/box-selects regions and chats to optimize
  → user clicks "Confirm topology"
  → backend saves topology version
  → BOM diff is generated
  → user confirms BOM
  → IO list and code are generated
  → validation report is generated
  → export package is produced
  → memory commit runs
```

Frontend actions:

- `Save topology draft`
- `Confirm topology`
- `Generate BOM from topology`
- `Confirm BOM`
- `Generate code`
- `Export project`
- `Mark as reusable case`

## 11. API Design

All endpoints should return version identifiers for artifacts that can be used in export and memory commit. Artifact-generating endpoints should accept `llm_config` and `embedding_config` only where model calls are required; pure persistence and validation endpoints should not require model credentials.

### Requirement documents

```text
POST /api/projects/{project_id}/requirement-docs
GET  /api/projects/{project_id}/requirement-docs
GET  /api/projects/{project_id}/requirement-docs/{doc_id}
POST /api/projects/{project_id}/requirement-docs/{doc_id}/extract
```

### Topology

```text
GET  /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology
POST /api/projects/{project_id}/topology/confirm
POST /api/projects/{project_id}/topology/diff
POST /api/projects/{project_id}/topology/generate-bom
```

### BOM/code from topology

```text
POST /api/projects/{project_id}/bom/from-topology
POST /api/projects/{project_id}/codegen/from-topology
```

### Export

```text
POST /api/projects/{project_id}/exports
GET  /api/projects/{project_id}/exports
GET  /api/projects/{project_id}/exports/{export_id}
```

### Memory

```text
POST /api/projects/{project_id}/memory/commit
GET  /api/memory/search
GET  /api/memory/items/{memory_id}
POST /api/memory/items/{memory_id}/feedback
```

## 12. Export Package

The project export should be a structured package:

```text
project-{id}-v{version}.zip
  requirements.md
  requirement_sources/
  topology.json
  topology.png
  bom.xlsx
  io_list.xlsx
  validation_report.md
  st_code/
    OB1.scl
    FB_Safety.scl
    FC_Cylinder_01.scl
    FC_ServoAxis_01.scl
  report.pdf
  metadata.json
```

`metadata.json` should include:

- Project id/version.
- Requirement summary.
- Functional units.
- Topology version.
- BOM version.
- Code module list.
- Standards referenced.
- Validation result.
- Memory commit id.

## 13. Memory Retrieval in Generation

Every generation run should start with:

```text
retrieve_user_preferences
retrieve_similar_project_cases
retrieve_relevant_function_patterns
retrieve_component_facts
retrieve_standard_rules
retrieve_validation_lessons
```

Context packing:

- L0: active canvas selection and current user request.
- L1: current project requirements, topology, BOM, code preview.
- L2: top ranked memories grouped by type.

The prompt should tell the model which memories are authoritative:

- `standard_rule` and validated `function_pattern`: high authority.
- `project_case`: reusable example, not blindly copied.
- `user_preference`: default unless user overrides.
- `component_fact`: must cite source when used for selection.
- LLM-only memory: low authority until validated.

## 14. Validation and Approval

Validation should move from five generic rules to layered validation:

1. Topology completeness.
2. IO count and channel assignment.
3. Voltage and signal matching.
4. Load/current/capacity sizing.
5. Fieldbus compatibility.
6. Safety loop completeness.
7. Pattern-specific rules.
8. Export readiness.

Output should include:

```json
{
  "status": "pass | warning | error",
  "violations": [],
  "missing_information": [],
  "recommended_fixes": [],
  "standards_referenced": []
}
```

Generation should not silently mark projects as complete when validation has unresolved `error` items.

## 15. MVP Implementation Order

The order below deliberately starts with persistence and deterministic derivation. Memory quality depends on confirmed topology, BOM, code, and export snapshots; building memory before these artifacts are stable would create low-value chat summaries instead of reusable engineering knowledge.

### Milestone 1: Topology source of truth

1. Add topology tables and schemas.
2. Persist ReactFlow/Yjs snapshots to backend.
3. Add topology confirm endpoint.
4. Fix codegen contract by adding `/codegen/from-topology`.
5. Add topology-to-BOM endpoint.

### Milestone 2: Seed ABCD pattern library

1. Add `design_patterns` table.
2. Seed first pneumatic, servo, conveyor, and cabinet patterns.
3. Add pattern matcher service.
4. Generate functional units from natural language.
5. Generate topology draft from functional units.

### Milestone 3: Requirement document ingestion

1. Add requirement doc table and upload endpoint.
2. Support TXT/PDF first.
3. Add DOCX.
4. Add XLSX/CSV table extraction.
5. Normalize extracted requirement atoms.

### Milestone 4: Export package

1. Generate topology JSON and image.
2. Generate BOM and IO XLSX.
3. Generate ST/SCL files.
4. Generate markdown report first, PDF later.
5. Store export package metadata.

### Milestone 5: Memory flywheel

1. Add memory tables.
2. Commit exported project as `project_case`.
3. Commit confirmed patterns and validation lessons.
4. Retrieve memories before generation.
5. Add feedback buttons for memory usefulness.

## 16. Non-goals for the first implementation wave

- Full EPLAN/AutoCAD export.
- Real PLC upload/download.
- Full OCR for scanned documents.
- Automatic legal compliance certification.
- Multi-user permission model.
- Full vendor catalog procurement workflow.

## 17. Open Questions

Resolved defaults for the first implementation wave:

1. Memory starts project-local and is promoted to global only after export approval or explicit "mark as reusable".
2. Seed IEC 60204-1 and common GB/T electrical design rules first; leave UL/vendor-internal profiles as later rule packs.
3. Prioritize machine-readable `zip` artifacts first, with a markdown report inside; PDF rendering can follow once the package content is stable.
4. User corrections become low-authority project-local memories automatically; they become reusable global memories only after export or explicit approval.
5. Siemens remains the first validation brand profile because the existing prompts, UI, and code generation already target S7-1200/S7-1500/TIA Portal.

