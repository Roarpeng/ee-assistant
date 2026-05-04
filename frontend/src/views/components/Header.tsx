import { Settings, Sun, Moon, Languages } from 'lucide-react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

export function Header({
  activeTab,
  setActiveTab,
  onOpenSettings,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  onOpenSettings: () => void;
}) {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const language = useStore((s) => s.language);
  const toggleLanguage = useStore((s) => s.toggleLanguage);
  const tr = t(language);

  const tabs: [string, string][] = [
    ['topology', tr.header.topology],
    ['bom', tr.header.bom],
    ['code', tr.header.code],
  ];

  return (
    <header className="h-[72px] flex items-center justify-between px-8 bg-neutral-900 border border-neutral-800 rounded-[2.5rem] shrink-0 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <span className="text-white font-bold tracking-tighter text-sm">V</span>
        </div>
        <span className="text-xl font-bold tracking-tight uppercase">{tr.app.name}</span>
      </div>

      <nav className="flex bg-neutral-950 border border-neutral-800 rounded-full px-2 py-1.5 gap-2 text-sm font-bold text-neutral-500 h-[52px]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-6 h-full flex items-center rounded-full transition-all tracking-wide ${
              activeTab === id
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'hover:text-white hover:bg-neutral-800/50'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <div className="px-4 py-2 bg-neutral-800/50 rounded-full text-xs font-bold text-indigo-400 border border-indigo-500/20 uppercase tracking-widest hidden lg:block">
          {tr.header.version}
        </div>
        <button
          onClick={toggleLanguage}
          className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          title={language === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Languages className="w-4 h-4" />
          <span className="text-[10px] font-bold ml-0.5">{language === 'zh' ? 'EN' : '中'}</span>
        </button>
        <button
          onClick={toggleTheme}
          className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
