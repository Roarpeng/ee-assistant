import { useEffect, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { AppLayout } from './views/components/AppLayout';
import { HeroLanding } from './views/components/HeroLanding';
import { useStore } from './models/store';
import { lightTheme, darkTheme } from './theme/md3';

const EXAMPLES = [
  '恒温水箱 PLC 控制系统, 需 PLd 安全等级',
  '3 轴伺服定位平台, EtherCAT 总线',
  '传送带 VFD 调速 + 急停 + 接触器互锁',
  '注塑机温度多段 PID, 8 路热电偶',
  '立体仓库穿梭车, 安全光幕 + STO',
];

export default function App() {
  const project = useStore((s) => s.project);
  const newProject = useStore((s) => s.newProject);
  const loadChatHistory = useStore((s) => s.loadChatHistory);
  const themeMode = useStore((s) => s.theme);

  // When true, show AppLayout directly with knowledge tab (no project needed)
  const [forceKnowledge, setForceKnowledge] = useState(false);

  useEffect(() => {
    void useStore.getState().bootstrapOrg();
  }, []);

  useEffect(() => {
    if (!project) void loadChatHistory();
  }, [project, loadChatHistory]);

  // Direct entry to knowledge base — no project required
  if (forceKnowledge) {
    return (
      <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
        <AppLayout initialTab="knowledge" />
      </ThemeProvider>
    );
  }

  if (!project) {
    return (
      <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
        <HeroLanding
          examples={EXAMPLES}
          onSubmit={(prompt) => {
            void newProject({ preserveCanvas: false, seedPrompt: prompt });
          }}
          onOpenKnowledge={() => setForceKnowledge(true)}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
      <AppLayout />
    </ThemeProvider>
  );
}
