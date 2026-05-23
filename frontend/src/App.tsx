import { useEffect, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { AppLayout } from './views/components/AppLayout';
import { useStore } from './models/store';
import { lightTheme, darkTheme } from './theme/md3';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export default function App() {
  const project = useStore((s) => s.project);
  const newProject = useStore((s) => s.newProject);
  const loadChatHistory = useStore((s) => s.loadChatHistory);
  const themeMode = useStore((s) => s.theme);

  const [isInitializing, setIsInitializing] = useState(true);
  const [forceKnowledge, setForceKnowledge] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await useStore.getState().bootstrapOrg();
        await loadChatHistory();
        const currentProject = useStore.getState().project;
        if (!currentProject) {
          // 静默新建一个项目以直接进入对话
          await newProject({ preserveCanvas: false });
        }
      } catch (err) {
        console.error('Failed to initialize app', err);
      } finally {
        setIsInitializing(false);
      }
    };
    void init();
  }, [loadChatHistory, newProject]);

  // Direct entry to knowledge base — no project required
  if (forceKnowledge) {
    return (
      <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
        <AppLayout initialTab="knowledge" />
      </ThemeProvider>
    );
  }

  if (isInitializing) {
    return (
      <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
        <Box sx={{ display: 'flex', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
          <CircularProgress color="primary" />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={themeMode === 'dark' || themeMode === 'engineering' ? darkTheme : lightTheme}>
      <AppLayout />
    </ThemeProvider>
  );
}

