from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ele:ele@localhost:5432/ele"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "ee_knowledge"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "knowledge-docs"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096

    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
