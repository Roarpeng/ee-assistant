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

    # Generic OpenAI-compatible Chat config (preferred — 任意支持 OpenAI SDK 协议的厂商)
    chat_api_key: str = ""
    chat_base_url: str = ""
    chat_model: str = ""

    # Generic OpenAI-compatible Embedding config (preferred)
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    embedding_dim: int = 4096

    # Vendor-specific aliases (fallback,向后兼容)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = ""

    embeddings_api_key: str = ""
    embeddings_base_url: str = ""
    embeddings_model: str = ""

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = ""
    llm_max_tokens: int = 4096

    model_config = {"extra": "ignore"}

    # ---------- Effective Chat config ----------
    # Priority: CHAT_* (generic) → DEEPSEEK_* → ANTHROPIC_/OPENAI_*
    def effective_chat_api_key(self) -> str:
        return (
            self.chat_api_key
            or self.deepseek_api_key
            or self.anthropic_api_key
            or self.openai_api_key
        )

    def effective_chat_base_url(self) -> str:
        return self.chat_base_url or self.deepseek_base_url

    def effective_chat_model(self) -> str:
        return self.chat_model or self.deepseek_model or self.llm_model or "gpt-4o-mini"

    # ---------- Effective Embedding config ----------
    # Priority: EMBEDDING_* (generic) → EMBEDDINGS_* → OPENAI_*
    def effective_embed_api_key(self) -> str:
        return (
            self.embedding_api_key
            or self.embeddings_api_key
            or self.openai_api_key
        )

    def effective_embed_base_url(self) -> str:
        return self.embedding_base_url or self.embeddings_base_url

    def effective_embed_model(self) -> str:
        return (
            self.embedding_model
            or self.embeddings_model
            or "text-embedding-3-small"
        )


settings = Settings()
