# Volta Deployment Guide

This guide covers deploying Volta in production environments.

## Table of Contents

- [Deployment Options](#deployment-options)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Configuration](#configuration)
- [Security](#security)
- [Monitoring](#monitoring)
- [Backup and Restore](#backup-and-restore)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

## Deployment Options

Volta can be deployed in several ways:

1. **Docker Compose** - Simplest, suitable for single-server deployments
2. **Kubernetes** - Recommended for production, supports scaling and HA
3. **Cloud Platforms** - AWS, GCP, Azure with managed services
4. **Bare Metal** - Direct deployment on Linux servers

## Docker Compose Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 8GB RAM minimum (16GB recommended)
- 50GB disk space

### Quick Start

```bash
git clone https://github.com/Roarpeng/ee-assistant.git
cd ee-assistant

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Deploy
docker compose up -d --build

# Run migrations
docker exec ele-backend-1 alembic upgrade head

# Verify
curl http://localhost:8090/api/health
```

### Production Configuration

Create `docker-compose.prod.yml`:

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    ports:
      - "443:443"
    environment:
      - NODE_ENV=production
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - ENVIRONMENT=production
      - DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/volta
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - qdrant
      - minio
      - redis

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant_data:/qdrant/storage

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  qdrant_data:
  minio_data:
  redis_data:
```

Deploy:

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Required variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/volta
DB_USER=voltadb
DB_PASSWORD=secure_password
DB_NAME=volta

# Qdrant
QDRANT_URL=http://qdrant:6333

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# LLM
CHAT_API_KEY=sk-...
CHAT_BASE_URL=https://api.openai.com/v1
CHAT_MODEL=gpt-4
EMBEDDING_API_KEY=sk-...
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small

# Security
SECRET_KEY=your-secret-key-here
ORG_TOKEN_SALT=your-salt-here

# CORS
ALLOWED_ORIGINS=https://yourdomain.com
```

### SSL/TLS Configuration

Use nginx reverse proxy with SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name volta.yourdomain.com;

    ssl_certificate /etc/ssl/certs/volta.crt;
    ssl_certificate_key /etc/ssl/private/volta.key;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.24+
- kubectl configured
- Helm 3.x (optional)
- Persistent storage provisioner

### Using Helm

Create `values.yaml`:

```yaml
replicaCount: 2

image:
  repository: ghcr.io/roarpeng/volta-backend
  tag: "0.1.0"
  pullPolicy: IfNotPresent

frontend:
  image:
    repository: ghcr.io/roarpeng/volta-frontend
    tag: "0.1.0"

postgres:
  enabled: true
  auth:
    postgresPassword: secure-password
    database: volta

qdrant:
  enabled: true
  persistence:
    size: 20Gi

minio:
  enabled: true
  persistence:
    size: 50Gi

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

Install:

```bash
helm repo add volta https://charts.volta.dev
helm install volta volta/volta -f values.yaml
```

### Manual Kubernetes Manifests

Create namespace:

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: volta
```

Deploy PostgreSQL:

```yaml
# postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: volta
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: pgvector/pgvector:pg16
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_USER
          value: volta
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: POSTGRES_DB
          value: volta
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi
```

Deploy backend:

```yaml
# backend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: volta
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: ghcr.io/roarpeng/volta-backend:0.1.0
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: volta-secret
              key: database-url
        - name: QDRANT_URL
          value: http://qdrant:6333
        resources:
          limits:
            cpu: 2000m
            memory: 4Gi
          requests:
            cpu: 500m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /api/health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: volta
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

Apply manifests:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f postgres.yaml
kubectl apply -f qdrant.yaml
kubectl apply -f minio.yaml
kubectl apply -f backend.yaml
kubectl apply -f frontend.yaml
kubectl apply -f ingress.yaml
```

## Cloud Deployment

### AWS Deployment

#### Using ECS

1. Create ECR repositories
2. Build and push images
3. Create ECS cluster
4. Deploy using ECS task definitions
5. Configure Application Load Balancer
6. Set up RDS PostgreSQL
7. Use ElastiCache for Redis (optional)

#### Using EKS

Follow Kubernetes deployment guide with AWS-specific:
- Use EKS for Kubernetes cluster
- Use RDS for PostgreSQL
- Use S3 for MinIO storage
- Use CloudWatch for monitoring

### GCP Deployment

#### Using GKE

1. Create GKE cluster
2. Use Cloud SQL for PostgreSQL
3. Use Cloud Storage for MinIO
4. Deploy using Kubernetes manifests
5. Configure Cloud Load Balancing
6. Use Cloud Monitoring

### Azure Deployment

#### Using AKS

1. Create AKS cluster
2. Use Azure Database for PostgreSQL
3. Use Azure Blob Storage for MinIO
4. Deploy using Kubernetes manifests
5. Configure Azure Application Gateway
6. Use Azure Monitor

## Configuration

### Production Checklist

- [ ] Set strong passwords for all services
- [ ] Configure SSL/TLS certificates
- [ ] Set up CORS for allowed domains
- [ ] Configure rate limiting
- [ ] Enable audit logging
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Test disaster recovery
- [ ] Review security settings
- [ ] Configure environment-specific settings

### Environment-Specific Configs

Development (`.env.dev`):
```bash
DEBUG=true
LOG_LEVEL=DEBUG
DATABASE_URL=postgresql+asyncpg://dev:dev@localhost:5432/volta_dev
```

Staging (`.env.staging`):
```bash
DEBUG=false
LOG_LEVEL=INFO
DATABASE_URL=postgresql+asyncpg://staging:pass@postgres-staging:5432/volta_staging
```

Production (`.env.prod`):
```bash
DEBUG=false
LOG_LEVEL=WARNING
DATABASE_URL=postgresql+asyncpg://prod:secure-pass@postgres-prod:5432/volta_prod
```

## Security

### Network Security

- Use private networks for internal services
- Configure firewall rules
- Use VPN for admin access
- Disable unused ports

### Application Security

- Enable HTTPS only
- Use strong secret keys
- Rotate API keys regularly
- Implement rate limiting
- Validate all inputs
- Keep dependencies updated

### Secrets Management

Use Kubernetes secrets or AWS Secrets Manager:

```bash
kubectl create secret generic volta-secret \
  --from-literal=database-url='postgresql+asyncpg://...' \
  --from-literal=secret-key='...' \
  --from-literal=chat-api-key='...'
```

## Monitoring

### Health Checks

```bash
# API health
curl https://volta.yourdomain.com/api/health

# Database health
docker exec ele-postgres-1 pg_isready

# Qdrant health
curl http://localhost:6333/health
```

### Metrics

Volta exposes Prometheus metrics at `/metrics`:

- Request latency
- Error rates
- LLM API call counts
- Database query times
- Memory usage
- CPU usage

### Logging

Structured JSON logs:

```json
{
  "timestamp": "2026-05-26T10:00:00Z",
  "level": "INFO",
  "service": "backend",
  "message": "Analysis started",
  "project_id": "proj_123",
  "user_id": "user_456"
}
```

Log aggregation:
- Use ELK Stack (Elasticsearch, Logstash, Kibana)
- Use CloudWatch Logs (AWS)
- Use Cloud Logging (GCP)
- Use Azure Monitor Logs

### Alerting

Set up alerts for:
- High error rates (>5%)
- High latency (>2s p95)
- Low availability (<99%)
- Disk space >80%
- Memory usage >90%
- LLM API failures

## Backup and Restore

### Database Backup

```bash
# Backup
docker exec ele-postgres-1 pg_dump -U volta volta > backup.sql

# Restore
docker exec -i ele-postgres-1 psql -U volta volta < backup.sql
```

### Qdrant Backup

```bash
# Create snapshot
curl -X POST http://localhost:6333/collections/volta/snapshots

# Download snapshot
curl -O http://localhost:6333/collections/volta/snapshots/snapshot-id

# Restore
curl -X PUT -H "Content-Type: application/octet-stream" \
  --data-binary @snapshot \
  http://localhost:6333/collections/volta/snapshots/upload
```

### MinIO Backup

```bash
# Using mc client
mc alias set minio http://localhost:9002 minioadmin minioadmin
mc mirror minio/volta ./backup/volta

# Restore
mc mirror ./backup/volta minio/volta
```

### Knowledge Bundle Backup

```bash
# Export
./scripts/backup_knowledge.sh

# Import
./scripts/restore_knowledge.sh knowledge-bundle-20260526.tgz
```

### Automated Backups

Cron job for daily backups:

```bash
# /etc/cron.d/volta-backup
0 2 * * * root /path/to/backup-script.sh
```

## Scaling

### Horizontal Scaling

Backend:

```yaml
# docker-compose.yml
backend:
  deploy:
    replicas: 3
```

Kubernetes HPA:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
```

### Vertical Scaling

Increase resource limits:

```yaml
resources:
  limits:
    cpu: 4000m
    memory: 8Gi
  requests:
    cpu: 1000m
    memory: 2Gi
```

### Database Scaling

- Read replicas for PostgreSQL
- Connection pooling (PgBouncer)
- Query optimization
- Index optimization

### Caching

Add Redis for caching:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

## Troubleshooting

### Common Issues

#### Container won't start

```bash
# Check logs
docker compose logs backend

# Check resource usage
docker stats

# Restart
docker compose restart backend
```

#### Database connection failed

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check connection
docker exec ele-backend-1 python -c "from app.db.repository import engine; print(engine.connect())"

# Check logs
docker compose logs postgres
```

#### High memory usage

```bash
# Check memory
docker stats

# Restart services
docker compose restart

# Increase limits in docker-compose.yml
```

#### Slow performance

```bash
# Check database queries
docker exec ele-postgres-1 psql -U volta -c "SELECT * FROM pg_stat_activity;"

# Check LLM API latency
# Monitor in application logs

# Add caching
# Optimize database queries
```

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=DEBUG
docker compose restart backend
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

echo "Checking Volta health..."

# API health
curl -f http://localhost:8090/api/health || exit 1

# Database health
docker exec ele-postgres-1 pg_isready || exit 1

# Qdrant health
curl -f http://localhost:6333/health || exit 1

# MinIO health
curl -f http://localhost:9002/minio/health/live || exit 1

echo "All systems healthy"
```

## Performance Tuning

### Database

```sql
-- Add indexes
CREATE INDEX idx_projects_org_id ON projects(org_id);
CREATE INDEX idx_bom_items_project_id ON bom_items(project_id);

-- Analyze
ANALYZE;

-- Vacuum
VACUUM ANALYZE;
```

### Qdrant

```bash
# Optimize collection
curl -X POST http://localhost:6333/collections/volta/optimize
```

### Application

- Use connection pooling
- Enable query caching
- Optimize LLM prompts
- Batch operations where possible

## Maintenance

### Regular Tasks

- Daily: Check logs and alerts
- Weekly: Review performance metrics
- Monthly: Update dependencies
- Quarterly: Review security settings
- Annually: Disaster recovery test

### Dependency Updates

```bash
# Backend
cd backend
pip list --outdated
pip install --upgrade package-name

# Frontend
cd frontend
npm outdated
npm update package-name
```

### Security Updates

```bash
# Scan for vulnerabilities
docker scan volta-backend:latest
npm audit
pip-audit
```

## Support

For deployment issues:
- 📖 [Documentation](../docs/)
- 💬 [GitHub Discussions](https://github.com/Roarpeng/ee-assistant/discussions)
- 🐛 [Bug Reports](https://github.com/Roarpeng/ee-assistant/issues)
- 📧 [Support](mailto:support@volta.dev)
