import { describe, it, expect } from 'vitest';
import {
  FALLBACK_PROVIDERS,
  detectProviderFromBaseUrl,
  type ProviderId,
} from './llmProviders';

describe('FALLBACK_PROVIDERS', () => {
  it('contains exactly 8 entries', () => {
    expect(FALLBACK_PROVIDERS).toHaveLength(8);
  });

  it('exposes the canonical 8 provider ids', () => {
    const ids = FALLBACK_PROVIDERS.map((p) => p.id).sort();
    const expected: ProviderId[] = [
      'anthropic',
      'custom',
      'dashscope',
      'deepseek',
      'ollama',
      'openai',
      'siliconflow',
      'volcengine',
    ];
    expect(ids).toEqual(expected);
  });

  it('marks dashscope and openai as supporting custom embedding dimensions', () => {
    const dash = FALLBACK_PROVIDERS.find((p) => p.id === 'dashscope')!;
    const oai = FALLBACK_PROVIDERS.find((p) => p.id === 'openai')!;
    expect(dash.embed_supports_dimensions).toBe(true);
    expect(dash.embed_native_dim).toBe(1024);
    expect(oai.embed_supports_dimensions).toBe(true);
    expect(oai.embed_native_dim).toBe(1536);
  });

  it('marks volcengine + siliconflow + ollama as fixed-dimension providers', () => {
    for (const id of ['volcengine', 'siliconflow', 'ollama'] as const) {
      const p = FALLBACK_PROVIDERS.find((x) => x.id === id)!;
      expect(p.embed_supports_dimensions).toBe(false);
      expect(p.embed_native_dim).toBeGreaterThan(0);
    }
  });

  it('leaves anthropic and deepseek without an embedding model list', () => {
    for (const id of ['anthropic', 'deepseek'] as const) {
      const p = FALLBACK_PROVIDERS.find((x) => x.id === id)!;
      expect(p.recommended_embed_models).toEqual([]);
      expect(p.embed_native_dim).toBe(0);
    }
  });
});

describe('detectProviderFromBaseUrl', () => {
  it('detects DashScope (百炼) from the compatible-mode endpoint', () => {
    const out = detectProviderFromBaseUrl(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
      FALLBACK_PROVIDERS,
    );
    expect(out).toBe('dashscope');
  });

  it('detects Volcengine Ark from the ark.cn-beijing.volces.com host', () => {
    const out = detectProviderFromBaseUrl(
      'https://ark.cn-beijing.volces.com/api/v3',
      FALLBACK_PROVIDERS,
    );
    expect(out).toBe('volcengine');
  });

  it('detects OpenAI from api.openai.com regardless of trailing path', () => {
    expect(
      detectProviderFromBaseUrl('https://api.openai.com/v1', FALLBACK_PROVIDERS),
    ).toBe('openai');
    expect(
      detectProviderFromBaseUrl(
        'https://api.openai.com/v1/chat/completions',
        FALLBACK_PROVIDERS,
      ),
    ).toBe('openai');
  });

  it('returns null for empty and obviously custom base URLs', () => {
    expect(detectProviderFromBaseUrl('', FALLBACK_PROVIDERS)).toBeNull();
    expect(
      detectProviderFromBaseUrl(
        'https://my-private-llm.example.internal/v1',
        FALLBACK_PROVIDERS,
      ),
    ).toBeNull();
  });

  it('is case-insensitive (URL host casing must not break detection)', () => {
    expect(
      detectProviderFromBaseUrl(
        'HTTPS://API.OPENAI.COM/v1',
        FALLBACK_PROVIDERS,
      ),
    ).toBe('openai');
  });

  it('does not return a provider id when that preset has been filtered out', () => {
    const subset = FALLBACK_PROVIDERS.filter((p) => p.id !== 'openai');
    expect(detectProviderFromBaseUrl('https://api.openai.com/v1', subset)).toBeNull();
  });

  it('detects Ollama from localhost:11434 and 127.0.0.1:11434', () => {
    expect(
      detectProviderFromBaseUrl('http://localhost:11434/v1', FALLBACK_PROVIDERS),
    ).toBe('ollama');
    expect(
      detectProviderFromBaseUrl('http://127.0.0.1:11434/v1', FALLBACK_PROVIDERS),
    ).toBe('ollama');
  });
});
