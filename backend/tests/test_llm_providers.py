"""Unit tests for the LLM provider registry.

Pure-Python; no live network and no FastAPI app boot.
"""
import os

import pytest

from app.core.llm_providers import (
    PROVIDERS,
    detect_provider,
    get_provider,
    provider_to_dict,
)


def test_get_provider_dashscope_returns_expected_preset():
    preset = get_provider("dashscope")
    assert preset is not None
    assert preset.id == "dashscope"
    assert preset.default_chat_base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert preset.default_embed_base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert "qwen-plus" in preset.recommended_chat_models
    assert "text-embedding-v3" in preset.recommended_embed_models
    assert preset.embed_supports_dimensions is True
    assert preset.embed_native_dim == 1024
    assert "DASHSCOPE_API_KEY" in preset.api_key_env_aliases
    assert "BAILIAN_API_KEY" in preset.api_key_env_aliases


def test_get_provider_volcengine_returns_expected_preset():
    preset = get_provider("volcengine")
    assert preset is not None
    assert preset.id == "volcengine"
    assert preset.default_chat_base_url == "https://ark.cn-beijing.volces.com/api/v3"
    assert preset.embed_supports_dimensions is False
    assert preset.embed_native_dim == 2560
    assert "ARK_API_KEY" in preset.api_key_env_aliases
    assert "VOLCANO_API_KEY" in preset.api_key_env_aliases


def test_get_provider_unknown_returns_none():
    assert get_provider("unknown") is None
    assert get_provider("") is None
    assert get_provider(None) is None


@pytest.mark.parametrize(
    "url, expected_id",
    [
        ("https://dashscope.aliyuncs.com/compatible-mode/v1", "dashscope"),
        ("https://DASHSCOPE.aliyuncs.com/compatible-mode/v1", "dashscope"),
        ("https://ark.cn-beijing.volces.com/api/v3", "volcengine"),
        ("https://ark.cn-beijing.volces.com/api/v3/", "volcengine"),
        ("https://api.openai.com/v1", "openai"),
        ("https://api.deepseek.com", "deepseek"),
        ("https://api.siliconflow.cn/v1", "siliconflow"),
        ("https://api.anthropic.com", "anthropic"),
        ("http://localhost:11434/v1", "ollama"),
        ("http://127.0.0.1:11434/v1", "ollama"),
    ],
)
def test_detect_provider_known_urls(url, expected_id):
    preset = detect_provider(url)
    assert preset is not None, f"detect_provider({url!r}) returned None"
    assert preset.id == expected_id


def test_detect_provider_empty_or_none_returns_none():
    assert detect_provider("") is None
    assert detect_provider(None) is None


def test_detect_provider_unknown_url_returns_none():
    assert detect_provider("https://example.com/v1") is None
    assert detect_provider("https://api.unknown-vendor.io") is None


def test_volcano_does_not_support_dimensions():
    """Regression guard: this is the bug-class the registry exists to fix.

    If somebody flips this flag without also updating rag_engine.embed() the
    Volcano embedding probe will start sending `dimensions=` and 400."""
    preset = get_provider("volcengine")
    assert preset is not None
    assert preset.embed_supports_dimensions is False


def test_dashscope_supports_dimensions_with_native_dim_1024():
    preset = get_provider("dashscope")
    assert preset is not None
    assert preset.embed_supports_dimensions is True
    assert preset.embed_native_dim == 1024


def test_provider_to_dict_strips_env_aliases():
    """Public payload must not leak env-var names to the browser."""
    preset = get_provider("dashscope")
    assert preset is not None
    payload = provider_to_dict(preset)
    assert payload["id"] == "dashscope"
    assert payload["embed_supports_dimensions"] is True
    assert payload["embed_native_dim"] == 1024
    assert "qwen-plus" in payload["recommended_chat_models"]
    assert "api_key_env_aliases" not in payload


def test_registry_contains_all_required_ids():
    """All eight canonical provider ids must be present."""
    expected = {
        "openai",
        "anthropic",
        "deepseek",
        "siliconflow",
        "dashscope",
        "volcengine",
        "ollama",
        "custom",
    }
    assert expected.issubset(set(PROVIDERS.keys()))


def test_settings_chat_api_key_falls_back_to_dashscope_env(monkeypatch):
    """Setting DASHSCOPE_API_KEY in env should be picked up by a freshly
    constructed Settings (verifies the AliasChoices wiring + the new
    effective_chat_api_key() priority chain)."""
    # Make sure no higher-priority key wins.
    monkeypatch.delenv("CHAT_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    monkeypatch.delenv("VOLCANO_API_KEY", raising=False)
    monkeypatch.delenv("BAILIAN_API_KEY", raising=False)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "ds-test-key")

    # Re-import inside the test so a fresh Settings instance is built — we
    # explicitly do NOT mutate the module-level ``settings`` singleton, since
    # that would leak into other tests in the suite.
    from app.config import Settings

    s = Settings()
    assert s.dashscope_api_key == "ds-test-key"
    assert s.effective_chat_api_key() == "ds-test-key"
    # And the auto-derived base URL should land on the dashscope endpoint.
    assert s.effective_chat_base_url() == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert s.effective_embed_api_key() == "ds-test-key"
    assert s.effective_embed_base_url() == "https://dashscope.aliyuncs.com/compatible-mode/v1"


def test_settings_chat_api_key_falls_back_to_volcano_env(monkeypatch):
    """VOLCANO_API_KEY (alias of ARK_API_KEY) should also be picked up."""
    monkeypatch.delenv("CHAT_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("BAILIAN_API_KEY", raising=False)
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    monkeypatch.setenv("VOLCANO_API_KEY", "ark-test-key")

    from app.config import Settings

    s = Settings()
    assert s.ark_api_key == "ark-test-key"
    assert s.effective_chat_api_key() == "ark-test-key"
    assert s.effective_chat_base_url() == "https://ark.cn-beijing.volces.com/api/v3"
