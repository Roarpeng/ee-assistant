import { useState, useEffect } from 'react';
import { X, Cpu, Database, Eye, EyeOff, Key, Link, Box } from 'lucide-react';
import { useStore, type AppSettings } from '../../models/store';
import { t } from '../../services/i18n';

type Props = { isOpen: boolean; onClose: () => void };

export function SettingsModal({ isOpen, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [chatApiKey, setChatApiKey] = useState(settings.chat.apiKey);
  const [chatBaseUrl, setChatBaseUrl] = useState(settings.chat.baseUrl);
  const [chatModel, setChatModel] = useState(settings.chat.model);
  const [showChatKey, setShowChatKey] = useState(false);

  const [embApiKey, setEmbApiKey] = useState(settings.embedding.apiKey);
  const [embBaseUrl, setEmbBaseUrl] = useState(settings.embedding.baseUrl);
  const [embModel, setEmbModel] = useState(settings.embedding.model);
  const [showEmbKey, setShowEmbKey] = useState(false);

  useEffect(() => {
    setChatApiKey(settings.chat.apiKey);
    setChatBaseUrl(settings.chat.baseUrl);
    setChatModel(settings.chat.model);
    setEmbApiKey(settings.embedding.apiKey);
    setEmbBaseUrl(settings.embedding.baseUrl);
    setEmbModel(settings.embedding.model);
  }, [settings, isOpen]);

  const handleSave = () => {
    const next: AppSettings = {
      chat: { apiKey: chatApiKey, baseUrl: chatBaseUrl, model: chatModel },
      embedding: { apiKey: embApiKey, baseUrl: embBaseUrl, model: embModel },
    };
    updateSettings(next);
    onClose();
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
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">{tr.settings.chatModel}</h3>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Key className="w-3 h-3" /> {tr.settings.apiKey}
              </label>
              <div className="relative">
                <input
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
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Link className="w-3 h-3" /> {tr.settings.baseUrl}
              </label>
              <input
                type="text"
                value={chatBaseUrl}
                onChange={(e) => setChatBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Box className="w-3 h-3" /> {tr.settings.modelName}
              </label>
              <input
                type="text"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                placeholder="gpt-4o"
                className={inputClass}
              />
            </div>
            <p className="text-xs text-neutral-500 font-medium">{tr.settings.chatDesc}</p>
          </section>

          <div className="border-t border-neutral-800" />

          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">{tr.settings.embeddingModel}</h3>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Key className="w-3 h-3" /> {tr.settings.apiKey}
              </label>
              <div className="relative">
                <input
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

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Link className="w-3 h-3" /> {tr.settings.baseUrl}
              </label>
              <input
                type="text"
                value={embBaseUrl}
                onChange={(e) => setEmbBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <Box className="w-3 h-3" /> {tr.settings.modelName}
              </label>
              <input
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

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/50 shrink-0 flex gap-3">
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
