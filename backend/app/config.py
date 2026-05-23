from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

from app.core.llm_providers import get_provider


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

    # Multimodal embedding model (DashScope native SDK — tongyi-embedding-vision-plus)
    multimodal_embed_model: str = ""

    # Vendor-specific aliases (fallback,向后兼容)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = ""

    # 阿里云百炼 (DashScope) — OpenAI 兼容模式
    dashscope_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("dashscope_api_key", "DASHSCOPE_API_KEY", "BAILIAN_API_KEY"),
    )

    # 火山方舟 (Volcengine Ark) — OpenAI 兼容模式
    ark_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ark_api_key", "ARK_API_KEY", "VOLCANO_API_KEY"),
    )

    embeddings_api_key: str = ""
    embeddings_base_url: str = ""
    embeddings_model: str = ""

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = ""
    llm_max_tokens: int = 4096

    model_config = {"extra": "ignore", "populate_by_name": True, "env_file": ".env"}

    # ---------- Effective Chat config ----------
    # Priority: CHAT_* (generic) → DASHSCOPE → ARK → DEEPSEEK → ANTHROPIC → OPENAI
    def effective_chat_api_key(self) -> str:
        return (
            self.chat_api_key
            or self.dashscope_api_key
            or self.ark_api_key
            or self.deepseek_api_key
            or self.anthropic_api_key
            or self.openai_api_key
        )

    def effective_chat_base_url(self) -> str:
        if self.chat_base_url:
            return self.chat_base_url
        # Auto-derive base URL from the first vendor key that is set, so ops
        # who only export DASHSCOPE_API_KEY / ARK_API_KEY get the right
        # OpenAI-compatible endpoint without having to also set chat_base_url.
        if self.dashscope_api_key:
            ds = get_provider("dashscope")
            if ds:
                return ds.default_chat_base_url
        if self.ark_api_key:
            ark = get_provider("volcengine")
            if ark:
                return ark.default_chat_base_url
        return self.deepseek_base_url

    def effective_chat_model(self) -> str:
        return self.chat_model or self.deepseek_model or self.llm_model or "gpt-4o-mini"

    # ---------- Effective Embedding config ----------
    # Priority: EMBEDDING_* (generic) → DASHSCOPE → ARK → EMBEDDINGS_* → OPENAI
    def effective_embed_api_key(self) -> str:
        return (
            self.embedding_api_key
            or self.dashscope_api_key
            or self.ark_api_key
            or self.embeddings_api_key
            or self.openai_api_key
        )

    def effective_embed_base_url(self) -> str:
        if self.embedding_base_url:
            return self.embedding_base_url
        if self.embeddings_base_url:
            return self.embeddings_base_url
        if self.dashscope_api_key:
            ds = get_provider("dashscope")
            if ds:
                return ds.default_embed_base_url
        if self.ark_api_key:
            ark = get_provider("volcengine")
            if ark:
                return ark.default_embed_base_url
        return ""

    def effective_embed_model(self) -> str:
        return (
            self.embedding_model
            or self.embeddings_model
            or "text-embedding-3-small"
        )


settings = Settings()
