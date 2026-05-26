# Security Policy

## Supported Versions

Currently, only the latest version of Volta is supported with security updates.

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

### How to Report

**Do NOT** open a public issue for security vulnerabilities.

Instead, please send an email to [security@volta.dev](mailto:security@volta.dev) with:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested mitigation or fix (if known)

### What to Expect

- You will receive an acknowledgment within 48 hours
- We will provide a detailed response within 7 days
- We will work with you to understand and fix the issue
- We will coordinate the release of the fix with you

### Security Best Practices

When reporting vulnerabilities:

- Provide as much detail as possible
- Include proof-of-concept code if applicable
- Allow us reasonable time to address the issue
- Do not exploit the vulnerability for any purpose
- Do not disclose the vulnerability publicly until we have fixed it

## Security Features

Volta includes several security features:

- **Environment variable validation**: All required environment variables are validated on startup
- **Input validation**: All user inputs are validated using Pydantic models
- **SQL injection protection**: SQLAlchemy ORM prevents SQL injection
- **CORS configuration**: Cross-Origin Resource Sharing is properly configured
- **Secrets management**: API keys and secrets are stored in environment variables
- **Dependency scanning**: GitHub Dependabot automatically scans for vulnerable dependencies

## Security Audits

We conduct regular security audits of the codebase and dependencies. Major releases may include third-party security audits.

## Disclosure Policy

We follow a coordinated disclosure process:

1. Vulnerability is reported privately
2. We investigate and develop a fix
3. We prepare a security advisory
4. We release the fix and publish the advisory
5. We credit the reporter (if desired)

## Security Updates

Security updates will be:

- Released as patch version updates (e.g., 0.1.1 → 0.1.2)
- Announced in the release notes
- Tagged with the `security` label in GitHub releases
- Published as security advisories on GitHub

## Recommended Security Practices for Users

### For Self-Hosted Deployments

1. **Keep dependencies updated**: Regularly update Docker images and dependencies
2. **Use strong passwords**: For database, MinIO, and other services
3. **Enable HTTPS**: Use reverse proxy with SSL/TLS in production
4. **Restrict network access**: Use firewalls to restrict access to services
5. **Regular backups**: Backup PostgreSQL, Qdrant, and MinIO data regularly
6. **Monitor logs**: Review application logs for suspicious activity
7. **Use environment variables**: Never commit secrets to version control

### API Key Management

1. **Rotate keys regularly**: Change API keys periodically
2. **Use separate keys**: Use different keys for development and production
3. **Limit permissions**: Use API keys with minimal required permissions
4. **Monitor usage**: Track API usage for unusual patterns
5. **Revoke compromised keys**: Immediately revoke any compromised keys

## Contact

For security-related questions that are not vulnerability reports, please open a GitHub discussion with the `security` label.
