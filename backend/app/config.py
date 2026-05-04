from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database / Storage
    database_url: str = "postgresql+asyncpg://ele:ele@localhost:5432/ele"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "ee_knowledge"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "knowledge-docs"

    # Chat LLM (DeepSeek / OpenAI-compatible)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-pro"

    # Embedding (SiliconFlow / OpenAI-compatible)
    embeddings_api_key: str = ""
    embeddings_base_url: str = "https://api.siliconflow.cn/v1"
    embeddings_model: str = "Qwen/Qwen3-VL-Embedding-8B"

    # Legacy aliases (still used by frontend settings & some code paths)
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 4096
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096

    model_config = {"extra": "ignore"}

    @property
    def chat_api_key(self) -> str:
        return self.deepseek_api_key or self.anthropic_api_key or self.openai_api_key

    @property
    def chat_base_url(self) -> str:
        return self.deepseek_base_url

    @property
    def chat_model(self) -> str:
        return self.deepseek_model or self.llm_model

    @property
    def embed_api_key(self) -> str:
        return self.embeddings_api_key or self.openai_api_key

    @property
    def embed_base_url(self) -> str:
        return self.embeddings_base_url

    @property
    def embed_model(self) -> str:
        return self.embeddings_model or self.embedding_model


settings = Settings()
