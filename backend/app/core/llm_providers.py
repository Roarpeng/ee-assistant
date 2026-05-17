"""Canonical LLM provider registry.

Centralises the per-vendor defaults (base URL, recommended models) and the
small set of behavioural quirks we have to honour at the API boundary. The
two quirks we care about today both live in the embedding path:

1.  **OpenAI text-embedding-v3 / DashScope text-embedding-v3** accept a
    ``dimensions=`` kwarg to truncate the returned vector. DashScope caps
    this at the native dim (1024) — anything larger 400s.
2.  **Volcengine (Doubao) embeddings** do **not** accept ``dimensions``. The
    server returns 400 if it is sent.

Historically ``rag_engine.embed()`` only branched on ``"text-embedding-3" in
model_name`` which silently broke as soon as a user pointed us at Volcano or
SiliconFlow. The registry below makes that decision explicit and
data-driven so the rest of the codebase (rag_engine, ``/api/test-connectivity``,
the future cost tracker) can share one source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

ProviderId = Literal[
    "openai",
    "anthropic",
    "deepseek",
    "siliconflow",
    "dashscope",
    "volcengine",
    "ollama",
    "custom",
]


@dataclass(frozen=True)
class ProviderPreset:
    """Static metadata for a single LLM vendor.

    All fields are intentionally simple types so the dataclass can be
    serialised as JSON for the frontend ``GET /api/llm-providers`` endpoint.
    """

    id: ProviderId
    label: str
    label_en: str
    default_chat_base_url: str
    default_embed_base_url: str
    recommended_chat_models: tuple[str, ...]
    recommended_embed_models: tuple[str, ...]
    embed_supports_dimensions: bool
    embed_native_dim: int
    supports_multimodal_embed: bool = False
    multimodal_embed_models: tuple[str, ...] = ()
    api_key_env_aliases: tuple[str, ...] = field(default_factory=tuple)
    docs_url: str = ""
    notes: str = ""


PROVIDERS: dict[str, ProviderPreset] = {
    "openai": ProviderPreset(
        id="openai",
        label="OpenAI",
        label_en="OpenAI",
        default_chat_base_url="https://api.openai.com/v1",
        default_embed_base_url="https://api.openai.com/v1",
        recommended_chat_models=("gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"),
        recommended_embed_models=("text-embedding-3-small", "text-embedding-3-large"),
        embed_supports_dimensions=True,
        embed_native_dim=1536,
        api_key_env_aliases=("OPENAI_API_KEY",),
        docs_url="https://platform.openai.com/docs",
        notes="text-embedding-3-* supports the dimensions kwarg.",
    ),
    "anthropic": ProviderPreset(
        id="anthropic",
        label="Anthropic Claude",
        label_en="Anthropic",
        default_chat_base_url="https://api.anthropic.com",
        default_embed_base_url="",
        recommended_chat_models=(
            "claude-3-5-sonnet-latest",
            "claude-3-5-haiku-latest",
            "claude-3-opus-latest",
        ),
        recommended_embed_models=(),
        embed_supports_dimensions=False,
        embed_native_dim=0,
        api_key_env_aliases=("ANTHROPIC_API_KEY",),
        docs_url="https://docs.anthropic.com",
        notes="No first-party embedding API. Use a separate provider for embeddings.",
    ),
    "deepseek": ProviderPreset(
        id="deepseek",
        label="DeepSeek",
        label_en="DeepSeek",
        default_chat_base_url="https://api.deepseek.com",
        default_embed_base_url="",
        recommended_chat_models=("deepseek-chat", "deepseek-reasoner"),
        recommended_embed_models=(),
        embed_supports_dimensions=False,
        embed_native_dim=0,
        api_key_env_aliases=("DEEPSEEK_API_KEY",),
        docs_url="https://api-docs.deepseek.com",
        notes="No embedding endpoint; pair with a separate embedding provider.",
    ),
    "siliconflow": ProviderPreset(
        id="siliconflow",
        label="硅基流动 SiliconFlow",
        label_en="SiliconFlow",
        default_chat_base_url="https://api.siliconflow.cn/v1",
        default_embed_base_url="https://api.siliconflow.cn/v1",
        recommended_chat_models=(
            "Qwen/Qwen2.5-72B-Instruct",
            "deepseek-ai/DeepSeek-V3",
            "Qwen/Qwen2.5-Coder-32B-Instruct",
        ),
        recommended_embed_models=(
            "BAAI/bge-m3",
            "BAAI/bge-large-zh-v1.5",
        ),
        embed_supports_dimensions=False,
        embed_native_dim=1024,
        api_key_env_aliases=("SILICONFLOW_API_KEY",),
        docs_url="https://docs.siliconflow.cn",
        notes="Embeddings do NOT accept the dimensions kwarg.",
    ),
    "dashscope": ProviderPreset(
        id="dashscope",
        label="阿里云百炼 (DashScope)",
        label_en="Alibaba Cloud DashScope (Bailian)",
        default_chat_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        default_embed_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        recommended_chat_models=(
            "qwen-plus",
            "qwen-max",
            "qwen-turbo",
            "qwen3-coder-plus",
        ),
        recommended_embed_models=(
            "text-embedding-v3",
            "text-embedding-v2",
            "text-embedding-v1",
        ),
        embed_supports_dimensions=True,
        embed_native_dim=1024,
        supports_multimodal_embed=True,
        multimodal_embed_models=(
            "qwen3-vl-embedding",
            "tongyi-embedding-vision-plus",
            "multimodal-embedding-v1",
        ),
        api_key_env_aliases=("DASHSCOPE_API_KEY", "BAILIAN_API_KEY"),
        docs_url="https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope",
        notes=(
            "OpenAI-compatible. text-embedding-v3 supports dimensions up to 1024 "
            "(values >1024 will 400). text-embedding-v1/v2 do NOT accept dimensions. "
            "Multimodal embedding (tongyi-embedding-vision-plus) available via native SDK."
        ),
    ),
    "volcengine": ProviderPreset(
        id="volcengine",
        label="火山方舟 (Volcengine Ark)",
        label_en="Volcengine Ark (Doubao)",
        default_chat_base_url="https://ark.cn-beijing.volces.com/api/v3",
        default_embed_base_url="https://ark.cn-beijing.volces.com/api/v3",
        recommended_chat_models=(
            "doubao-1-5-pro-32k-250115",
            "doubao-pro-32k",
            "doubao-pro-4k",
        ),
        recommended_embed_models=(
            "doubao-embedding-text-240715",
            "doubao-embedding-large-text-240915",
        ),
        embed_supports_dimensions=False,
        embed_native_dim=2560,
        api_key_env_aliases=("ARK_API_KEY", "VOLCANO_API_KEY"),
        docs_url="https://www.volcengine.com/docs/82379",
        notes=(
            "OpenAI-compatible. The model field is typically an endpoint id "
            "(ep-XXXXXXXX-xxxxx) for custom inference endpoints. Embeddings "
            "do NOT accept the dimensions kwarg — server returns 400 if sent."
        ),
    ),
    "ollama": ProviderPreset(
        id="ollama",
        label="Ollama (本地)",
        label_en="Ollama (local)",
        default_chat_base_url="http://localhost:11434/v1",
        default_embed_base_url="http://localhost:11434/v1",
        recommended_chat_models=("qwen2.5:7b", "llama3.2", "deepseek-r1:7b"),
        recommended_embed_models=("nomic-embed-text", "bge-m3"),
        embed_supports_dimensions=False,
        embed_native_dim=768,
        api_key_env_aliases=("OLLAMA_API_KEY",),
        docs_url="https://github.com/ollama/ollama/blob/main/docs/openai.md",
        notes="Air-gapped / 国产化 deployments. No real auth; any non-empty key works.",
    ),
    "custom": ProviderPreset(
        id="custom",
        label="自定义 (OpenAI-compatible)",
        label_en="Custom (OpenAI-compatible)",
        default_chat_base_url="",
        default_embed_base_url="",
        recommended_chat_models=(),
        recommended_embed_models=(),
        embed_supports_dimensions=False,
        embed_native_dim=0,
        api_key_env_aliases=(),
        docs_url="",
        notes="Manually configured endpoint. Toggle dimensions support per provider docs.",
    ),
}


def get_provider(provider_id: Optional[str]) -> Optional[ProviderPreset]:
    """Look up a preset by canonical id. Returns None for unknown / empty ids."""
    if not provider_id:
        return None
    return PROVIDERS.get(provider_id)


# Substring patterns we use to recover a provider id from a base URL when the
# caller did not pass an explicit ``provider`` field. Order matters only for
# disambiguation — the patterns here are non-overlapping.
_BASE_URL_PATTERNS: tuple[tuple[str, ProviderId], ...] = (
    ("dashscope.aliyuncs.com", "dashscope"),
    ("bailian.aliyuncs.com", "dashscope"),
    ("ark.cn-beijing.volces.com", "volcengine"),
    ("volces.com", "volcengine"),
    ("api.deepseek.com", "deepseek"),
    ("api.siliconflow.cn", "siliconflow"),
    ("api.openai.com", "openai"),
    ("api.anthropic.com", "anthropic"),
    ("localhost:11434", "ollama"),
    ("127.0.0.1:11434", "ollama"),
)


def detect_provider(base_url: Optional[str]) -> Optional[ProviderPreset]:
    """Best-effort provider lookup by base_url substring match.

    Returns ``None`` for empty / unknown URLs so the caller can fall back to
    its previous heuristic. Used so users who configure a custom ``base_url``
    by hand still pick up the right ``embed_supports_dimensions`` behaviour.
    """
    if not base_url:
        return None
    haystack = base_url.lower()
    for needle, pid in _BASE_URL_PATTERNS:
        if needle in haystack:
            return PROVIDERS.get(pid)
    return None


def provider_to_dict(preset: ProviderPreset) -> dict:
    """Serialise a preset for the public ``GET /api/llm-providers`` payload.

    We deliberately omit ``api_key_env_aliases`` because exposing the names
    of env vars to a browser context offers no value to the UI.
    """
    return {
        "id": preset.id,
        "label": preset.label,
        "label_en": preset.label_en,
        "default_chat_base_url": preset.default_chat_base_url,
        "default_embed_base_url": preset.default_embed_base_url,
        "recommended_chat_models": list(preset.recommended_chat_models),
        "recommended_embed_models": list(preset.recommended_embed_models),
        "embed_supports_dimensions": preset.embed_supports_dimensions,
        "embed_native_dim": preset.embed_native_dim,
        "supports_multimodal_embed": preset.supports_multimodal_embed,
        "multimodal_embed_models": list(preset.multimodal_embed_models),
        "docs_url": preset.docs_url,
        "notes": preset.notes,
    }
