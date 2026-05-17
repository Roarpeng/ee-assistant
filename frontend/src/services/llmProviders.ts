/**
 * Client-side LLM provider registry.
 *
 * Mirrors the backend `app/core/llm_providers.py` registry surfaced via
 * `GET /api/llm-providers`. The fetch result is cached for the lifetime of
 * the page so the SettingsModal can render its dropdown synchronously after
 * the first open.
 *
 * `FALLBACK_PROVIDERS` keeps the modal usable when the backend is offline
 * (e.g. configuring credentials *before* the service can start). The data
 * intentionally favours conservative, well-tested model ids — fancier
 * model lists are returned by the live API.
 */

import { authedFetch } from './orgClient';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'siliconflow'
  | 'dashscope'
  | 'volcengine'
  | 'ollama'
  | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  label_en: string;
  default_chat_base_url: string;
  default_embed_base_url: string;
  recommended_chat_models: string[];
  recommended_embed_models: string[];
  embed_supports_dimensions: boolean;
  embed_native_dim: number;
  supports_multimodal_embed?: boolean;
  multimodal_embed_models?: string[];
  docs_url?: string;
  notes?: string;
}

export const FALLBACK_PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    label_en: 'OpenAI',
    default_chat_base_url: 'https://api.openai.com/v1',
    default_embed_base_url: 'https://api.openai.com/v1',
    recommended_chat_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    recommended_embed_models: ['text-embedding-3-small', 'text-embedding-3-large'],
    embed_supports_dimensions: true,
    embed_native_dim: 1536,
    docs_url: 'https://platform.openai.com/docs',
    notes: 'text-embedding-3-* supports the dimensions kwarg.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    label_en: 'Anthropic',
    default_chat_base_url: 'https://api.anthropic.com',
    default_embed_base_url: '',
    recommended_chat_models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    recommended_embed_models: [],
    embed_supports_dimensions: false,
    embed_native_dim: 0,
    docs_url: 'https://docs.anthropic.com',
    notes: 'No first-party embedding API. Use a separate provider for embeddings.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    label_en: 'DeepSeek',
    default_chat_base_url: 'https://api.deepseek.com',
    default_embed_base_url: '',
    recommended_chat_models: ['deepseek-chat', 'deepseek-reasoner'],
    recommended_embed_models: [],
    embed_supports_dimensions: false,
    embed_native_dim: 0,
    docs_url: 'https://api-docs.deepseek.com',
    notes: 'No embedding endpoint; pair with a separate embedding provider.',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    label_en: 'SiliconFlow',
    default_chat_base_url: 'https://api.siliconflow.cn/v1',
    default_embed_base_url: 'https://api.siliconflow.cn/v1',
    recommended_chat_models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    recommended_embed_models: ['BAAI/bge-large-zh-v1.5', 'BAAI/bge-m3'],
    embed_supports_dimensions: false,
    embed_native_dim: 1024,
    docs_url: 'https://docs.siliconflow.cn',
    notes: 'Embeddings do NOT accept the dimensions kwarg.',
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 (DashScope)',
    label_en: 'Alibaba Cloud DashScope (Bailian)',
    default_chat_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_embed_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    recommended_chat_models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-coder-plus'],
    recommended_embed_models: ['text-embedding-v3', 'text-embedding-v2'],
    embed_supports_dimensions: true,
    embed_native_dim: 1024,
    supports_multimodal_embed: true,
    multimodal_embed_models: ['qwen3-vl-embedding', 'tongyi-embedding-vision-plus', 'multimodal-embedding-v1'],
    docs_url:
      'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    notes:
      'OpenAI-compatible. text-embedding-v3 supports dimensions up to 1024 (values >1024 will 400). Multimodal embedding available via native SDK.',
  },
  {
    id: 'volcengine',
    label: '火山方舟 (Volcengine Ark)',
    label_en: 'Volcengine Ark (Doubao)',
    default_chat_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_embed_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    recommended_chat_models: [
      'doubao-1-5-pro-32k-250115',
      'doubao-pro-32k',
      'ep-xxxxxxxx (your endpoint id)',
    ],
    recommended_embed_models: ['doubao-embedding-text-240715'],
    embed_supports_dimensions: false,
    embed_native_dim: 2560,
    docs_url: 'https://www.volcengine.com/docs/82379',
    notes:
      'OpenAI-compatible. Model id is usually an endpoint id (ep-XXXXXXXX). Embeddings reject the dimensions kwarg.',
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    label_en: 'Ollama (local)',
    default_chat_base_url: 'http://localhost:11434/v1',
    default_embed_base_url: 'http://localhost:11434/v1',
    recommended_chat_models: ['qwen2.5:14b', 'llama3.1:8b'],
    recommended_embed_models: ['nomic-embed-text', 'mxbai-embed-large'],
    embed_supports_dimensions: false,
    embed_native_dim: 768,
    docs_url: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    notes: 'Air-gapped / 国产化 deployments. Any non-empty key is accepted.',
  },
  {
    id: 'custom',
    label: '自定义 (OpenAI-compatible)',
    label_en: 'Custom (OpenAI-compatible)',
    default_chat_base_url: '',
    default_embed_base_url: '',
    recommended_chat_models: [],
    recommended_embed_models: [],
    embed_supports_dimensions: false,
    embed_native_dim: 0,
    docs_url: '',
    notes: 'Manually configured endpoint. Toggle dimensions support per provider docs.',
  },
];

// Substring patterns we use to recover a provider id from a base URL when
// the user (or stored settings) did not pin an explicit provider. Order is
// not significant — the patterns are non-overlapping.
const BASE_URL_PATTERNS: ReadonlyArray<{ needle: string; id: ProviderId }> = [
  { needle: 'dashscope.aliyuncs.com', id: 'dashscope' },
  { needle: 'bailian.aliyuncs.com', id: 'dashscope' },
  { needle: 'ark.cn-beijing.volces.com', id: 'volcengine' },
  { needle: 'volces.com', id: 'volcengine' },
  { needle: 'api.deepseek.com', id: 'deepseek' },
  { needle: 'api.siliconflow.cn', id: 'siliconflow' },
  { needle: 'api.openai.com', id: 'openai' },
  { needle: 'api.anthropic.com', id: 'anthropic' },
  { needle: 'localhost:11434', id: 'ollama' },
  { needle: '127.0.0.1:11434', id: 'ollama' },
];

/**
 * Best-effort detection of the provider id from a base URL.
 *
 * Returns `null` for empty / unrecognised URLs so callers can fall back to
 * the previously-stored value (or surface the Custom option in the UI).
 */
export function detectProviderFromBaseUrl(
  url: string,
  presets: ProviderPreset[],
): ProviderId | null {
  if (!url) return null;
  const haystack = url.toLowerCase();
  for (const { needle, id } of BASE_URL_PATTERNS) {
    if (haystack.includes(needle) && presets.some((p) => p.id === id)) {
      return id;
    }
  }
  return null;
}

let cache: ProviderPreset[] | null = null;
let inflight: Promise<ProviderPreset[]> | null = null;

/**
 * Fetch the canonical provider list from the backend, caching the result
 * for subsequent calls. Falls back to {@link FALLBACK_PROVIDERS} if the
 * server is unreachable or returns a non-2xx status.
 */
export async function fetchProviders(): Promise<ProviderPreset[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await authedFetch('/api/llm-providers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProviderPreset[];
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('empty provider list');
      }
      cache = data;
      return data;
    } catch {
      cache = FALLBACK_PROVIDERS;
      return FALLBACK_PROVIDERS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test helper: drop the cached provider list. */
export function _resetProviderCacheForTests(): void {
  cache = null;
  inflight = null;
}
