import { useState, useEffect } from 'react';
import { X, Cpu, Database, Eye, EyeOff, Key, Link, Box, Hash, Thermometer, Ruler, Zap, CheckCircle, XCircle } from 'lucide-react';
import { useStore, type AppSettings } from '../../models/store';
import { t } from '../../services/i18n';
import { api } from '../../services/api';

type Props = { isOpen: boolean; onClose: () => void };

export function SettingsModal({ isOpen, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [chatApiKey, setChatApiKey] = useState(settings.chat.apiKey);
  const [chatBaseUrl, setChatBaseUrl] = useState(settings.chat.baseUrl);
  const [chatModel, setChatModel] = useState(settings.chat.model);
  const [chatMaxTokens, setChatMaxTokens] = useState(settings.chat.maxTokens ?? 4096);
  const [chatTemperature, setChatTemperature] = useState(settings.chat.temperature ?? 0.1);
  const [showChatKey, setShowChatKey] = useState(false);

  const [embApiKey, setEmbApiKey] = useState(settings.embedding.apiKey);
  const [embBaseUrl, setEmbBaseUrl] = useState(settings.embedding.baseUrl);
  const [embModel, setEmbModel] = useState(settings.embedding.model);
  const [embDimension, setEmbDimension] = useState(settings.embedding.dimension ?? 4096);
  const [showEmbKey, setShowEmbKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { chat: any; embedding: any }>(null);

  useEffect(() => {
    setChatApiKey(settings.chat.apiKey);
    setChatBaseUrl(settings.chat.baseUrl);
    setChatModel(settings.chat.model);
    setChatMaxTokens(settings.chat.maxTokens ?? 4096);
    setChatTemperature(settings.chat.temperature ?? 0.1);
    setEmbApiKey(settings.embedding.apiKey);
    setEmbBaseUrl(settings.embedding.baseUrl);
    setEmbModel(settings.embedding.model);
    setEmbDimension(settings.embedding.dimension ?? 4096);
  }, [settings, isOpen]);

  const handleSave = () => {
    const next: AppSettings = {
      chat: { apiKey: chatApiKey, baseUrl: chatBaseUrl, model: chatModel, maxTokens: chatMaxTokens, temperature: chatTemperature },
      embedding: { apiKey: embApiKey, baseUrl: embBaseUrl, model: embModel, dimension: embDimension },
    };
    updateSettings(next);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnectivity(
        { api_key: chatApiKey, base_url: chatBaseUrl, model: chatModel },
        { api_key: embApiKey, base_url: embBaseUrl, model: embModel, dimension: embDimension }
      );
      setTestResult(result);
    } catch {
      setTestResult({ chat: { ok: false, error: 'Request failed' }, embedding: { ok: false, error: 'Request failed' } });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-neutral-950 border border-neutral-800 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-neutral-600';

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
          <h2 className="text-xl font-bold text-white tracking-tight">{tr.settings.title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white bg-neutral-800 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
          {/* ===== Chat Model ===== */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">{tr.settings.chatModel}</h3>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="chat-api-key" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Key className="w-3 h-3" /> {tr.settings.apiKey}
              </label>
              <div className="relative">
                <input
                  id="chat-api-key"
                  name="chat-api-key"
                  type={showChatKey ? 'text' : 'password'}
                  value={chatApiKey}
                  onChange={(e) => setChatApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowChatKey(!showChatKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  {showChatKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="chat-base-url" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Link className="w-3 h-3" /> {tr.settings.baseUrl}
              </label>
              <input
                id="chat-base-url"
                name="chat-base-url"
                type="text"
                value={chatBaseUrl}
                onChange={(e) => setChatBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="chat-model" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <Box className="w-3 h-3" /> {tr.settings.modelName}
                </label>
                <input
                  id="chat-model"
                  name="chat-model"
                  type="text"
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  placeholder="gpt-4o"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="chat-max-tokens" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <Hash className="w-3 h-3" /> {tr.settings.maxTokens}
                </label>
                <input
                  id="chat-max-tokens"
                  name="chat-max-tokens"
                  type="number"
                  min={256}
                  max={32768}
                  step={256}
                  value={chatMaxTokens}
                  onChange={(e) => setChatMaxTokens(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="chat-temp" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Thermometer className="w-3 h-3" /> {tr.settings.temperature}
                <span className="ml-auto text-indigo-400">{chatTemperature.toFixed(1)}</span>
              </label>
              <input
                id="chat-temp"
                name="chat-temp"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={chatTemperature}
                onChange={(e) => setChatTemperature(Number(e.target.value))}
                className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-neutral-600">
                <span>0 · 精确</span>
                <span>1 · 平衡</span>
                <span>2 · 创造</span>
              </div>
            </div>
            <p className="text-xs text-neutral-500 font-medium">{tr.settings.chatDesc}</p>
          </section>

          <div className="border-t border-neutral-800" />

          {/* ===== Embedding Model ===== */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">{tr.settings.embeddingModel}</h3>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="emb-api-key" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Key className="w-3 h-3" /> {tr.settings.apiKey}
              </label>
              <div className="relative">
                <input
                  id="emb-api-key"
                  name="emb-api-key"
                  type={showEmbKey ? 'text' : 'password'}
                  value={embApiKey}
                  onChange={(e) => setEmbApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowEmbKey(!showEmbKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  {showEmbKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="emb-base-url" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <Link className="w-3 h-3" /> {tr.settings.baseUrl}
                </label>
                <input
                  id="emb-base-url"
                  name="emb-base-url"
                  type="text"
                  value={embBaseUrl}
                  onChange={(e) => setEmbBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="emb-dimension" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <Ruler className="w-3 h-3" /> {tr.settings.dimension}
                </label>
                <input
                  id="emb-dimension"
                  name="emb-dimension"
                  type="number"
                  min={128}
                  max={8192}
                  step={128}
                  value={embDimension}
                  onChange={(e) => setEmbDimension(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="emb-model" className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Box className="w-3 h-3" /> {tr.settings.modelName}
              </label>
              <input
                id="emb-model"
                name="emb-model"
                type="text"
                value={embModel}
                onChange={(e) => setEmbModel(e.target.value)}
                placeholder="text-embedding-3-small"
                className={inputClass}
              />
            </div>
            <p className="text-xs text-neutral-500 font-medium">{tr.settings.embedDesc}</p>
          </section>
        </div>

        {/* Test results */}
        {testResult && (
          <div className="px-6 pt-2 border-t border-neutral-800 shrink-0 space-y-1.5">
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${testResult.chat.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {testResult.chat.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span className="font-medium">Chat</span>
              <span className="ml-auto">{testResult.chat.ok ? `${tr.settings.testOk} · ${testResult.chat.model || ''}` : `${tr.settings.testFail} · ${testResult.chat.error}`}</span>
            </div>
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${testResult.embedding.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {testResult.embedding.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span className="font-medium">Embedding</span>
              <span className="ml-auto">{testResult.embedding.ok ? `${tr.settings.testOk} · ${testResult.embedding.dimension}d` : `${tr.settings.testFail} · ${testResult.embedding.error}`}</span>
            </div>
          </div>
        )}

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/50 shrink-0 flex gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Zap className={`w-4 h-4 ${testing ? 'animate-pulse text-yellow-400' : ''}`} />
            {testing ? tr.settings.testing : tr.settings.testConn}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-bold rounded-xl transition-colors"
          >
            {tr.settings.cancel}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {tr.settings.save}
          </button>
        </div>
      </div>
    </div>
  );
}
