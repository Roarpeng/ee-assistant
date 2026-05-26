# Support

Getting help with Volta? Here are the best ways to find answers and get support.

## Documentation

Start with our comprehensive documentation:

- [README](README.md) - Quick start and overview
- [DEMO Guide](docs/DEMO.md) - 5-minute walkthrough
- [Project Overview](docs/PROJECT_OVERVIEW.md) - Detailed architecture and API documentation
- [Knowledge Bundle Guide](docs/knowledge-bundle.md) - Cross-environment knowledge base migration
- [LLM Provider Recommendations](docs/llm-providers-and-industrial-recommendations.md) - Recommended LLM providers

## Getting Help

### GitHub Issues

For bug reports and feature requests, please open a GitHub issue:

- **Bug Reports**: Use the bug report template
- **Feature Requests**: Use the feature request template
- **Questions**: Use the question template

Before opening an issue, please:

1. Search existing issues to avoid duplicates
2. Check the documentation for answers
3. Include as much detail as possible (environment, steps to reproduce, logs)

### GitHub Discussions

For general questions, discussions, and community support:

- Use [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- Tag your discussion with appropriate categories (e.g., `question`, `show-and-tell`, `ideas`)

### Community Channels

Join our community to connect with other users and contributors:

- **Discord**: [Join our Discord server](https://discord.gg/volta) (coming soon)
- **Twitter/X**: Follow [@VoltaEE](https://twitter.com/VoltaEE) for updates

## Common Issues

### Docker Issues

**Problem**: Container fails to start
- **Solution**: Check that Docker and Docker Compose are installed and running
- **Solution**: Ensure ports 8090, 8000, 5432, 6335, 9002, 9003 are not in use

**Problem**: Database migration fails
- **Solution**: Run `docker exec ele-backend-1 alembic upgrade head`
- **Solution**: Check PostgreSQL container logs: `docker compose logs postgres`

### LLM Configuration

**Problem**: Connectivity test fails
- **Solution**: Verify your API keys are correct
- **Solution**: Check that the API endpoint is accessible from your network
- **Solution**: Ensure you have both Chat and Embedding API keys configured

**Problem**: Analysis runs but produces no results
- **Solution**: Check that your knowledge base has documents uploaded
- **Solution**: Verify the LLM model is supported
- **Solution**: Check backend logs for errors: `docker compose logs backend`

### Frontend Issues

**Problem**: UI doesn't load or shows errors
- **Solution**: Clear browser cache and reload
- **Solution**: Check browser console for errors (F12)
- **Solution**: Verify backend is running: `curl http://localhost:8000/api/health`

**Problem**: WebSocket connection fails
- **Solution**: Check that no proxy/firewall is blocking WebSocket connections
- **Solution**: Verify nginx configuration in `frontend/nginx.conf`

### Performance Issues

**Problem**: Slow analysis or generation
- **Solution**: Check your LLM provider's response times
- **Solution**: Reduce knowledge base size if too large
- **Solution**: Use a faster LLM model if available

## Troubleshooting Steps

If you're experiencing issues, follow these steps:

1. **Check the logs**: `docker compose logs backend` and `docker compose logs frontend`
2. **Verify dependencies**: Ensure all services are running: `docker compose ps`
3. **Check environment variables**: Verify `.env` file is correctly configured
4. **Restart services**: `docker compose restart`
5. **Rebuild containers**: `docker compose up -d --build`
6. **Clean restart**: `docker compose down -v && docker compose up -d --build` (warning: this deletes data)

## Reporting Security Issues

For security vulnerabilities, please do NOT open a public issue. Instead, email [security@volta.dev](mailto:security@volta.dev). See [SECURITY.md](SECURITY.md) for details.

## Contributing

Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Professional Support

For enterprise support, custom integrations, or consulting services, please contact [support@volta.dev](mailto:support@volta.dev).

## License

Volta is open-source under the MIT License. See [LICENSE](LICENSE) for details.
