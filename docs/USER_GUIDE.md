# Volta User Guide

This comprehensive guide will help you get started with Volta and master its features for electrical engineering design.

## Table of Contents

- [Getting Started](#getting-started)
- [User Interface Overview](#user-interface-overview)
- [Creating a Project](#creating-a-project)
- [Configuring LLM Providers](#configuring-llm-providers)
- [Running Analysis](#running-analysis)
- [Working with Topology](#working-with-topology)
- [Managing BOM](#managing-bom)
- [Generating Deliverables](#generating-deliverables)
- [Knowledge Base](#knowledge-base)
- [Exporting Projects](#exporting-projects)
- [Advanced Features](#advanced-features)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Docker and Docker Compose installed
- OpenAI-compatible API keys for:
  - Chat model (e.g., GPT-4, Claude, DeepSeek)
  - Embedding model (e.g., text-embedding-3-small, bge-large-en)

### Installation

```bash
# Clone the repository
git clone https://github.com/Roarpeng/ee-assistant.git
cd ee-assistant

# Start all services
docker compose up -d --build

# Run database migrations
docker exec ele-backend-1 alembic upgrade head

# Access the application
open http://localhost:8090
```

## User Interface Overview

Volta's interface consists of three main panels:

### Left Panel - Project Navigation
- **Conversation History**: View and switch between different conversations
- **Project List**: Browse and manage your projects

### Center Panel - Canvas
- **Topology Editor**: Visual editor for electrical system topology
- **BOM Table**: Bill of Materials with component details
- **Wiring Table**: Terminal and I/O wiring list
- **Schematic**: Mermaid-based electrical schematic
- **ST Code**: PLC structured text code (Monaco editor)
- **Commissioning Guide**: Step-by-step commissioning instructions

### Right Panel - Chat
- **Chat Interface**: Natural language interaction with AI
- **Quick Actions**: Buttons for common operations
- **Settings**: Configure LLM providers and preferences

## Creating a Project

### New Project

1. Click "New Project" in the project sidebar
2. Enter a project name
3. Click "Create"

### Project Types

Volta supports various electrical engineering projects:

- **Conveyor Systems**: Material handling and transport
- **Motor Control**: Single and multi-motor control systems
- **Safety Systems**: E-stop, interlocks, SIL-rated systems
- **Process Control**: Automated process control systems
- **Custom**: Any custom electrical design

## Configuring LLM Providers

### Accessing Settings

1. Click the gear icon (⚙️) in the top-right corner
2. The Settings modal will open

### Chat Model Configuration

1. **Provider**: Select your LLM provider (OpenAI, Anthropic, DeepSeek, etc.)
2. **API Key**: Enter your API key
3. **Base URL**: Enter the API endpoint (default: https://api.openai.com/v1)
4. **Model**: Select the model (e.g., gpt-4, claude-3-opus)
5. Click "Test Connectivity" to verify
6. Click "Save" when successful

### Embedding Model Configuration

1. **Provider**: Select your embedding provider
2. **API Key**: Enter your API key
3. **Base URL**: Enter the API endpoint
4. **Model**: Select the embedding model
5. Click "Test Connectivity" to verify
6. Click "Save" when successful

### Recommended Providers

See [LLM Provider Recommendations](llm-providers-and-industrial-recommendations.md) for detailed recommendations.

## Running Analysis

### Full Engineering Run

1. Open a project
2. In the chat panel, click "完整工程生成" (Full Engineering Run)
3. Or type a natural language description, e.g.:
   ```
   Design a conveyor control system with 3 motors, E-stop, and interlock logic.
   Use Siemens S7-1200 and PROFINET.
   ```
4. The LangGraph pipeline will execute:
   - Requirements analysis
   - Category mapping
   - Safety assessment
   - Constraint extraction
   - Component selection
   - Rule validation
   - Schematic generation
   - Code generation
   - Wiring generation
   - Commissioning guide
   - Final review

### Quick Chat

For quick questions or modifications:
- Type your question in the chat
- Volta will provide context-aware responses based on your project

### Clarification Questions

If Volta needs more information:
- Clarification cards will appear
- Answer the questions to guide the analysis
- Your answers may be saved as organization preferences

## Working with Topology

### Topology Editor

The topology editor is the single source of truth for your design:

- **Nodes**: Represent electrical components (PLC, motors, sensors, etc.)
- **Edges**: Represent connections (power, signal, communication)

### Adding Components

1. Right-click on the canvas
2. Select component type from context menu
3. Configure component properties
4. Click to place on canvas

### Connecting Components

1. Click and drag from a node's output port
2. Release on another node's input port
3. Select connection type (power, signal, protocol)

### Editing Topology

- **Move**: Drag nodes to reposition
- **Delete**: Select node/edge and press Delete
- **Edit**: Double-click to edit properties
- **Copy/Paste**: Use Ctrl+C/Ctrl+V

### Confirming Topology

1. Click "确认拓扑" (Confirm Topology)
2. All deliverables will be regenerated based on confirmed topology
3. A new topology version is saved

## Managing BOM

### Viewing BOM

Navigate to the "BOM" tab to view the Bill of Materials.

### BOM Columns

- **序号**: Item number
- **元器件**: Component name
- **制造商**: Manufacturer
- **型号**: Part number
- **数量**: Quantity
- **规格**: Specifications
- **置信度**: Selection confidence (color-coded)

### Editing BOM

1. Click the edit button on a BOM item
2. Modify the component details
3. Click "Save"

### Providing Feedback

- **👍**: Approve the selection
- **👎**: Disapprove and provide feedback
- **Edit**: Manually correct the selection

Feedback helps Volta learn and improve future selections.

## Generating Deliverables

### Schematic

- Navigate to "原理图" tab
- View Mermaid-based electrical schematic
- Export as SVG or PNG
- Edit Mermaid code directly

### ST Code

- Navigate to "ST 代码" tab
- View PLC structured text code in Monaco editor
- Syntax highlighting and auto-completion
- Download as .scl file

### Wiring Table

- Navigate to "接线表" tab
- View terminal and I/O wiring list
- Export as Excel (.xlsx)

### Commissioning Guide

- Navigate to "调试手册" tab
- View step-by-step commissioning instructions
- Export as Markdown (.md)

## Knowledge Base

### Uploading Documents

1. Navigate to "知识库" tab
2. Click "上传文档" (Upload Documents)
3. Select files (PDF, TXT, MD, HTML, DOCX supported)
4. Documents are processed asynchronously:
   - Uploading → Chunking → Embedding → Graph Extraction → Ready

### Document Status

Documents show status badges:
- 🟢 Ready: Processed and searchable
- 🟡 Processing: Still being processed
- 🔴 Error: Processing failed (click retry)

### Searching Knowledge Base

1. Click "语义检索" (Semantic Search)
2. Enter search query
3. View relevant document chunks with similarity scores

### URL Import

Import web pages directly:
1. Click "URL 导入"
2. Enter URL
3. Volta will fetch and process the page

### Knowledge Bundle

Export and import knowledge bases across deployments:
```bash
# Export
./scripts/backup_knowledge.sh

# Import
./scripts/restore_knowledge.sh path/to/bundle.tgz
```

See [Knowledge Bundle Guide](knowledge-bundle.md) for details.

## Exporting Projects

### Export Package

1. Navigate to "概览" (Overview) tab
2. Click "导出工程包" (Export Package)
3. A ZIP file will be downloaded containing:
   - `bom.xlsx`: Bill of Materials
   - `wiring.xlsx`: Wiring table
   - `program.scl`: PLC code
   - `schematic.mmd`: Mermaid schematic
   - `topology.json`: Topology snapshot
   - `commissioning.md`: Commissioning guide
   - `project-meta.json`: Project metadata
   - `README.txt`: Package contents

### Individual Exports

- **BOM**: Export as Excel from BOM tab
- **Wiring**: Export as Excel from Wiring tab
- **Schematic**: Export as SVG/PNG from Schematic tab
- **Code**: Download as .scl from ST Code tab
- **Topology**: Export as JSON from Topology tab

## Advanced Features

### Organization Preferences

Set organization-level defaults:
1. Navigate to "组织设置" (Organization Settings)
2. Configure default values for:
   - PLC family
   - Safety level
   - Protocol preference
   - Voltage standard
3. These defaults are used in all projects

### Memory Tab

View and manage episodic memories:
1. Navigate to "记忆" (Memory) tab
2. View past project decisions
3. Run consolidation to extract patterns
4. View weekly reports

### Source Tracing

Trace component selection sources:
1. Click the source icon on a BOM item
2. View:
   - RAG chunks that influenced selection
   - Graph neighbors
   - Historical episodes
   - Rule validations

### IO Budget

Monitor IO utilization:
- View IO budget bar in topology panel
- Shows DI/DO/AI/AO usage
- Color-coded for capacity planning

## Troubleshooting

### Common Issues

#### Analysis Fails

**Symptoms**: Analysis stops or shows errors

**Solutions**:
- Check LLM API keys are configured
- Verify API connectivity in Settings
- Check backend logs: `docker compose logs backend`
- Ensure knowledge base has documents

#### No Results Generated

**Symptoms**: Analysis completes but no BOM/schematic

**Solutions**:
- Check knowledge base has relevant documents
- Verify LLM model is supported
- Try with a simpler requirement
- Check backend logs for errors

#### WebSocket Connection Fails

**Symptoms**: Progress updates not showing

**Solutions**:
- Check no proxy/firewall blocking WebSocket
- Verify nginx configuration
- Check browser console for errors
- Restart services: `docker compose restart`

#### Docker Container Issues

**Symptoms**: Containers won't start

**Solutions**:
- Check Docker is running: `docker ps`
- Check port conflicts (8090, 8000, 5432, 6335, 9002, 9003)
- Rebuild containers: `docker compose up -d --build`
- Check logs: `docker compose logs`

### Getting Help

- 📖 [Documentation](../docs/)
- 💬 [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- 🐛 [Bug Reports](https://github.com/Roarpeng/ee-assistant/issues/new?template=bug_report.md)
- 📧 [Support](mailto:support@volta.dev)

## Best Practices

### Effective Requirements

Be specific and include:
- Machine type and application
- Number and type of motors/actuators
- Safety requirements (SIL level)
- I/O requirements (approximate counts)
- PLC family preference
- Communication protocol preference
- Environmental conditions

### Knowledge Base Management

- Upload manufacturer datasheets
- Include application notes
- Add industry standards
- Regularly update with new components
- Use knowledge bundles for team sharing

### Topology Design

- Start with high-level architecture
- Add detail incrementally
- Use standard component types
- Follow electrical design best practices
- Confirm topology before final export

### Iterative Workflow

1. Start with natural language requirement
2. Review generated topology
3. Edit topology as needed
4. Confirm topology
5. Review deliverables
6. Provide feedback on selections
7. Iterate if needed

## Keyboard Shortcuts

- `Ctrl+S`: Save topology
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Delete`: Delete selected node/edge
- `Ctrl+C`: Copy
- `Ctrl+V`: Paste
- `Ctrl+A`: Select all
- `F11`: Fullscreen

## Next Steps

- Explore [Tutorials](TUTORIALS/) for specific use cases
- Read [API Documentation](API_DOCUMENTATION.md) for integration
- Check [Deployment Guide](DEPLOYMENT_GUIDE.md) for production setup
- Join [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions) for community support
