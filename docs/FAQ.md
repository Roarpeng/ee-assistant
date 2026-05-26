# Frequently Asked Questions

## General

### What is Volta?

Volta is an AI-powered electrical engineering design assistant that uses LangGraph multi-agent systems to automate the design of industrial control systems. It takes natural language requirements and generates topology, BOM, schematics, PLC code, wiring tables, and commissioning guides.

### Is Volta free?

Yes, Volta is open-source under the MIT License. However, you'll need to provide your own LLM API keys (Chat and Embedding models), which may incur costs from your LLM provider.

### What LLM providers are supported?

Volta supports any OpenAI-compatible API, including:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- DeepSeek
- SiliconFlow
- Azure OpenAI
- And many others

See [LLM Provider Recommendations](llm-providers-and-industrial-recommendations.md) for details.

### What are the system requirements?

- Docker and Docker Compose
- 8GB RAM minimum (16GB recommended)
- 20GB disk space
- Internet connection for LLM API calls

## Installation and Setup

### How do I install Volta?

```bash
git clone https://github.com/Roarpeng/ee-assistant.git
cd ee-assistant
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
```

See [README](../README.md) for detailed instructions.

### Can I run Volta without Docker?

Yes, for local development:

```bash
docker compose up -d postgres qdrant minio
cd backend && pip install -r requirements.txt && PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm install && npm run dev
```

### How do I update Volta?

```bash
git pull origin master
docker compose up -d --build
docker exec ele-backend-1 alembic upgrade head
```

### Port conflicts?

Volta uses these ports by default:
- 8090: Frontend
- 8000: Backend API
- 5432: PostgreSQL
- 6335: Qdrant
- 9002: MinIO API
- 9003: MinIO Console

Change ports in `docker-compose.yml` if needed.

## Usage

### How do I start a new project?

1. Click "New Project" in the sidebar
2. Enter project name
3. Click "Create"

### What should I include in my requirements?

Be specific about:
- Machine type and application
- Number and type of motors/actuators
- Safety requirements (SIL level)
- I/O requirements
- PLC family preference
- Communication protocol
- Environmental conditions

Example:
```
Design a conveyor system with 3 motors (0.75kW each), E-stop buttons,
photoelectric sensors, SIL 1 safety, Siemens S7-1200, PROFINET,
24V DC control, 0-40°C ambient.
```

### How long does analysis take?

Typically 2-5 minutes depending on:
- Complexity of requirements
- LLM provider response time
- Knowledge base size
- Number of components

### Can I edit the generated topology?

Yes! The topology editor is fully interactive:
- Drag to move nodes
- Right-click to add components
- Click and drag to create connections
- Double-click to edit properties
- Delete with Delete key

### How do I confirm topology?

Click "确认拓扑" (Confirm Topology) button. This:
- Saves a new topology version
- Regenerates all deliverables
- Sets topology as single source of truth

### What deliverables are generated?

- **BOM**: Bill of Materials with components
- **Schematic**: Mermaid electrical diagram
- **ST Code**: PLC structured text code
- **Wiring Table**: Terminal wiring list
- **Commissioning Guide**: Step-by-step instructions

## Knowledge Base

### What file formats are supported?

PDF, TXT, MD, HTML, DOCX, and URLs (web pages)

### How do I upload documents?

1. Navigate to "知识库" tab
2. Click "上传文档"
3. Select files
4. Documents are processed asynchronously

### What happens during document processing?

1. **Uploading**: File stored in MinIO
2. **Chunking**: Text split into chunks
3. **Embedding**: Chunks converted to vectors
4. **Graph Extraction**: Entities and relationships extracted
5. **Ready**: Available for search

### How do I import a web page?

1. Click "URL 导入"
2. Enter URL
3. Volta fetches and processes the page

### What is a knowledge bundle?

A knowledge bundle packages your entire knowledge base (Qdrant vectors, PostgreSQL graph, MinIO documents) for easy backup and sharing across deployments.

See [Knowledge Bundle Guide](knowledge-bundle.md) for details.

## LLM Configuration

### Do I need both Chat and Embedding API keys?

Yes. Chat models are used for analysis and generation. Embedding models are used for semantic search in the knowledge base.

### What if I don't have API keys?

Volta won't function without API keys. You'll need to sign up with an LLM provider and obtain API keys.

### Can I use local LLMs?

Yes, if you have a local OpenAI-compatible API (e.g., Ollama, LocalAI), configure it in Settings with the appropriate base URL.

### How much will LLM API calls cost?

Costs vary by provider and model. A typical analysis might cost $0.10-$0.50 depending on complexity. Monitor your LLM provider's billing dashboard.

## Troubleshooting

### Analysis fails or shows errors

- Verify API keys are configured in Settings
- Test connectivity in Settings
- Check backend logs: `docker compose logs backend`
- Ensure knowledge base has documents

### No results generated

- Check knowledge base has relevant documents
- Verify LLM model is supported
- Try with simpler requirements
- Check backend logs for errors

### WebSocket connection fails

- Check no proxy/firewall blocking WebSocket
- Verify nginx configuration
- Check browser console for errors
- Restart services: `docker compose restart`

### Docker containers won't start

- Check Docker is running: `docker ps`
- Check port conflicts
- Rebuild: `docker compose up -d --build`
- Check logs: `docker compose logs`

### Slow performance

- Check LLM provider response times
- Reduce knowledge base size if too large
- Use faster LLM model
- Check system resources (CPU, RAM)

## Privacy and Security

### Is my data private?

Yes, all data is stored locally in your Docker containers. LLM API calls send only the necessary context to your chosen LLM provider.

### Can Volta work offline?

Volta requires internet for:
- LLM API calls
- Initial Docker image download
- URL imports

Otherwise, it can work offline once set up.

### Are my API keys secure?

API keys are stored in environment variables and never committed to git. Use environment-specific keys for development and production.

## Commercial Use

### Can I use Volta for commercial projects?

Yes, Volta is MIT-licensed for commercial use.

### Do I need to attribute Volta?

The MIT License requires preserving the copyright notice, but you don't need to publicly attribute Volta in your products.

### Can I modify Volta?

Yes, you can modify Volta for your needs. If you distribute your modifications, you must include the original MIT License and copyright notice.

### Is there enterprise support?

Contact [support@volta.dev](mailto:support@volta.dev) for enterprise support options.

## Contributing

### How can I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Where can I report bugs?

Use the [bug report template](https://github.com/Roarpeng/ee-assistant/issues/new?template=bug_report.md).

### How do I request features?

Use the [feature request template](https://github.com/Roarpeng/ee-assistant/issues/new?template=feature_request.md).

## Additional Resources

- [User Guide](USER_GUIDE.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
- [API Documentation](API_DOCUMENTATION.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- [Security](mailto:security@volta.dev)
