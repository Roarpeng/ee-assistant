# Contributing to Volta

Thank you for your interest in contributing to Volta! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@volta.dev](mailto:conduct@volta.dev).

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find that the bug has already been reported. When creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you expected and what actually happened**
- **Include screenshots if applicable**
- **Mention your environment**:
  - OS and version
  - Browser and version (if applicable)
  - Volta version or commit hash

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List some examples of how this enhancement would be used**
- **Include screenshots or mockups if applicable**

### Pull Requests

1. **Fork the repository** and create your branch from `master`
2. **Make your changes** following the coding standards below
3. **Add tests** for your changes if applicable
4. **Ensure all tests pass** (`cd backend && python -m pytest tests/ -q` and `cd frontend && npm run test`)
5. **Update documentation** if needed
6. **Commit your changes** with a clear commit message
7. **Push to your fork** and submit a pull request

#### Commit Message Convention

We follow the Conventional Commits specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example: `feat: add support for custom LLM providers`

## Development Setup

### Prerequisites

- Docker and Docker Compose
- Python 3.10+ (for local development)
- Node.js 18+ (for local development)
- OpenAI-compatible API keys (Chat + Embedding)

### Local Development

```bash
# Start dependencies
docker compose up -d postgres qdrant minio

# Backend
cd backend
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
cd backend
python -m pytest tests/ -q

# Frontend tests
cd frontend
npm run test

# Full test suite with coverage
cd backend && python -m pytest tests/ --cov=app --cov-report=html
```

## Coding Standards

### Python (Backend)

- Follow PEP 8 style guide
- Use type hints for all function signatures
- Write docstrings for all public functions and classes
- Maximum line length: 100 characters
- Use `ruff` for linting and `black` for formatting

### TypeScript (Frontend)

- Follow ESLint configuration
- Use functional components with hooks
- Write TypeScript types for all props and state
- Maximum line length: 100 characters
- Use Prettier for formatting

### Documentation

- Update relevant documentation when adding features
- Add docstrings to new functions and classes
- Update API documentation in OpenAPI spec
- Add comments for complex logic

## Project Structure

```
ele/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Core business logic
│   │   │   ├── graph/    # LangGraph agents
│   │   │   └── ...
│   │   └── db/           # Database models
│   ├── tests/            # Backend tests
│   └── alembic/          # Database migrations
├── frontend/
│   ├── src/
│   │   ├── models/       # Zustand stores and types
│   │   ├── services/     # API clients
│   │   └── views/        # React components
│   └── src/views/components/  # UI components
└── docs/                 # Documentation
```

## Areas Where We Need Help

We welcome contributions in the following areas:

- **Documentation**: Improving user guides, API docs, tutorials
- **Testing**: Adding test coverage, especially for LangGraph agents
- **UI/UX**: Improving the user interface and experience
- **Features**: Implementing new features from the roadmap
- **Bug fixes**: Fixing reported issues
- **Performance**: Optimizing LangGraph execution and RAG retrieval
- **Internationalization**: Adding support for more languages

## Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **Discussions**: For questions and general discussion
- **Documentation**: Check `docs/` directory for detailed guides

## License

By contributing to Volta, you agree that your contributions will be licensed under the MIT License.
