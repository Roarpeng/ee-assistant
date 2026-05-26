import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import SettingsIcon from '@mui/icons-material/Settings';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import TranslateIcon from '@mui/icons-material/Translate';
import EngineeringIcon from '@mui/icons-material/Engineering';
import { ChatPanel } from './ChatPanel';
import { TopologyPanel } from './TopologyPanel';
import { BOMPanel } from './BOMPanel';
import { SCLPanel } from './SCLPanel';
import { SettingsModal } from './SettingsModal';
import { KnowledgePanel } from './KnowledgePanel';
import { ConversationSidebar } from './ConversationSidebar';
import { InfoPanel } from './InfoPanel';
import { WiringPanel } from './WiringPanel';
import { GuidePanel } from './GuidePanel';
import { CabinetPanel } from './CabinetPanel';

export function AppLayout({ initialTab }: { initialTab?: 'chat' | 'knowledge' }) {
  const project = useStore((s) => s.project);
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const language = useStore((s) => s.language);
  const tr = t(language);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const toggleLanguage = useStore((s) => s.toggleLanguage);

  const unreadChatCount = useStore((s) => s.unreadChatCount);
  const resetUnread = useStore((s) => s.resetUnread);

  const [centerTab, setCenterTab] = useState<'chat' | 'knowledge'>(initialTab || 'chat');
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('volta-chat-width');
      return saved ? Number(saved) : 380;
    } catch {
      return 380;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isDragging = useRef(false);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const sidebarWidth = 280; // sidebar ~256px + padding
      const minCanvasWidth = 350; // leave at least 350px for canvas
      const minChatWidth = 250;
      const maxChatWidth = window.innerWidth - sidebarWidth - minCanvasWidth;
      const newWidth = e.clientX - sidebarWidth;
      if (newWidth > minChatWidth && newWidth < maxChatWidth) {
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
        try { localStorage.setItem('volta-chat-width', String(chatWidthRef.current)); } catch {}
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const canvasTabs: [string, string][] = [
    ['info', tr.header.info],
    ['topology', tr.header.topology],
    ['wiring', tr.header.wiring],
    ['bom', tr.header.bom],
    ['code', tr.header.code],
    ['cabinet', tr.header.cabinet],
    ['guide', tr.header.guide],
  ];

  const handleCenterTabChange = (_: React.SyntheticEvent, value: string) => {
    setCenterTab(value as 'chat' | 'knowledge');
    if (value === 'chat') resetUnread();
  };

  const handleCanvasTabChange = (_: React.SyntheticEvent, value: string) => {
    setActiveCanvasTab(
      value as 'info' | 'topology' | 'wiring' | 'bom' | 'code' | 'guide' | 'cabinet',
    );
  };

  const themeToggleIcon = theme === 'light' ? (
    <DarkModeIcon sx={{ fontSize: 14 }} />
  ) : theme === 'dark' ? (
    <EngineeringIcon sx={{ fontSize: 14 }} />
  ) : (
    <LightModeIcon sx={{ fontSize: 14 }} />
  );

  const themeToggleTitle =
    theme === 'light'
      ? 'Switch to dark mode'
      : theme === 'dark'
        ? 'Switch to engineering mode'
        : 'Switch to light mode';

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        p: 2,
        gap: 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left: Conversation Sidebar */}
      <ConversationSidebar />

      {/* Chat / Knowledge panel (fixed width, resizable) */}
      <Box
        sx={{
          width: chatWidth,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            borderRadius: '12px',
            bgcolor: 'surfaceContainer',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          }}
        >
          {/* Chat header: brand + controls */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 3,
              pt: 2.5,
              pb: 0,
              borderBottom: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'primary.main',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.2), 0 4px 6px -4px rgba(79, 70, 229, 0.2)',
                }}
              >
                <Typography
                  sx={{ color: 'primary.contrastText', fontWeight: 700, letterSpacing: '-0.05em', fontSize: '0.75rem' }}
                >
                  V
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.025em', textTransform: 'uppercase' }}>
                {tr.app.name}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Language toggle */}
              <IconButton
                onClick={toggleLanguage}
                size="small"
                title={language === 'zh' ? 'Switch to English' : '切换到中文'}
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'surfaceContainer',
                  color: 'text.secondary',
                  borderRadius: '50%',
                  '&:hover': { bgcolor: 'surfaceContainerHigh', color: 'text.primary' },
                }}
              >
                <TranslateIcon sx={{ fontSize: 14 }} />
                <Typography
                  component="span"
                  sx={{ fontSize: '9px', fontWeight: 700, ml: 0.25 }}
                >
                  {language === 'zh' ? 'EN' : '中'}
                </Typography>
              </IconButton>

              {/* Theme toggle */}
              <IconButton
                onClick={toggleTheme}
                size="small"
                title={themeToggleTitle}
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'surfaceContainer',
                  color: 'text.secondary',
                  borderRadius: '50%',
                  '&:hover': { bgcolor: 'surfaceContainerHigh', color: 'text.primary' },
                }}
              >
                {themeToggleIcon}
              </IconButton>

              {/* Settings */}
              <IconButton
                onClick={() => setIsSettingsOpen(true)}
                size="small"
                title="Settings"
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'surfaceContainer',
                  color: 'text.secondary',
                  borderRadius: '50%',
                  '&:hover': { bgcolor: 'surfaceContainerHigh', color: 'text.primary' },
                }}
              >
                <SettingsIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Chat / Knowledge tab */}
          <Tabs
            value={centerTab}
            onChange={handleCenterTabChange}
            sx={{
              px: 3,
              pt: 0.75,
              minHeight: 'auto',
              borderBottom: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
              '& .MuiTabs-indicator': {
                height: 3,
                bgcolor: 'primary.main',
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.875rem',
                letterSpacing: '0.05em',
                minWidth: 'auto',
                minHeight: 'auto',
                px: 2,
                pb: 1.5,
                pt: 1,
                color: 'text.disabled',
                '&.Mui-selected': {
                  color: 'primary.main',
                },
                '&:hover': {
                  color: 'text.secondary',
                },
              },
            }}
          >
            <Tab
              value="chat"
              label={
                <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  {tr.chat.tab}
                  {unreadChatCount > 0 && centerTab !== 'chat' && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -4,
                        right: -8,
                        width: 10,
                        height: 10,
                        bgcolor: 'error.main',
                        borderRadius: '50%',
                        border: '2px solid',
                        borderColor: 'surfaceContainer',
                      }}
                    />
                  )}
                </Box>
              }
            />
            <Tab value="knowledge" label={tr.chat.knowledge} />
          </Tabs>

          {/* Chat/Knowledge content */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {centerTab === 'chat' ? <ChatPanel /> : <KnowledgePanel />}
          </Box>
        </Paper>
      </Box>

      {/* Resizer */}
      <Box
        sx={{
          width: 12,
          position: 'relative',
          mx: -1,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'col-resize',
          '&:hover > div': {
            bgcolor: 'primary.main',
          },
          '&:active > div': {
            bgcolor: 'primary.dark',
          },
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.classList.add('select-none');
        }}
      >
        <Box
          sx={{
            width: 4,
            height: 48,
            bgcolor: 'surfaceContainerHighest',
            opacity: 0.5,
            borderRadius: '9999px',
            transition: 'background-color 0.2s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        />
      </Box>

      {/* Right: Canvas Workspace (flex-1, takes remaining space) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Canvas header with tabs */}
        <Box
          sx={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            bgcolor: 'surfaceContainer',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '12px',
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          {/* Version badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                bgcolor: 'primary.main',
                borderRadius: '50%',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {tr.header.version}
            </Typography>
          </Box>

          {/* Canvas tab navigation */}
          <Tabs
            value={activeCanvasTab}
            onChange={handleCanvasTabChange}
            sx={{
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '9999px',
              px: 1,
              minHeight: 36,
              '& .MuiTabs-scroller': {
                overflow: 'visible !important',
              },
              '& .MuiTabs-flexContainer': {
                gap: 0.5,
                overflow: 'visible',
              },
              '& .MuiTabs-indicator': { display: 'none' },
              '& .MuiTab-root': {
                minHeight: 28,
                minWidth: 'auto',
                py: 0,
                px: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.7rem',
                letterSpacing: '0.025em',
                color: 'text.disabled',
                borderRadius: '9999px',
                transition: 'all 0.15s',
                '&.Mui-selected': {
                  color: 'text.primary',
                  bgcolor: 'surfaceContainerHigh',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                },
                '&:hover': {
                  color: 'text.primary',
                  bgcolor: 'surfaceContainerHigh',
                },
              },
            }}
          >
            {canvasTabs.map(([id, label]) => (
              <Tab key={id} value={id} label={label} />
            ))}
          </Tabs>

          {/* Spacer to balance the header */}
          <Box sx={{ width: 72 }} />
        </Box>

        {/* Canvas content area */}
        <Box
          sx={{
            flex: 1,
            mt: 2,
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '12px',
            bgcolor: 'surfaceContainer',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          }}
        >
          <Box sx={{ height: '100%', display: activeCanvasTab === 'info' ? 'block' : 'none' }}>
            <InfoPanelMount />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'topology' ? 'block' : 'none' }}>
            <TopologyPanel />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'wiring' ? 'block' : 'none' }}>
            <WiringPanelMount />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'bom' ? 'block' : 'none' }}>
            <BOMPanel />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'code' ? 'block' : 'none' }}>
            <SCLPanel />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'cabinet' ? 'block' : 'none' }}>
            <CabinetPanelMount />
          </Box>
          <Box sx={{ height: '100%', display: activeCanvasTab === 'guide' ? 'block' : 'none' }}>
            <GuidePanelMount />
          </Box>
        </Box>
      </Box>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </Box>
  );
}

// ---------- Adapters: pull from the global store, hand off to pure panels ----

function InfoPanelMount() {
  const project = useStore((s) => s.project);
  const nodes = useStore((s) => s.topology.nodes);
  const edges = useStore((s) => s.topology.edges);
  const bom = useStore((s) => s.bom);
  const ioItems = useStore((s) => s.ioItems);
  const sclCode = useStore((s) => s.sclCode);
  const mermaidCode = useStore((s) => s.mermaidCode);
  const commissioningSteps = useStore((s) => s.commissioningSteps);
  const bomCost = useStore((s) => s.bomCost);
  const safetyLevel = useStore((s) => s.safetyLevel);
  const [exportBusy, setExportBusy] = useState(false);
  const components = nodes.map((n) => ({ id: n.id, label: n.label, type: n.type }));

  const canExport =
    bom.length > 0 ||
    ioItems.length > 0 ||
    Boolean(sclCode.trim()) ||
    nodes.length > 0;

  async function handleExportPackage() {
    if (!canExport) return;
    setExportBusy(true);
    try {
      const { downloadProjectZip } = await import('../../services/exportPackage');
      await downloadProjectZip({
        projectName: project?.name ?? 'volta-project',
        bom,
        ioItems,
        sclCode,
        mermaidCode,
        topology: { nodes, edges },
        commissioningSteps,
        safetyLevel,
        bomCost,
      });
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <InfoPanel
      projectName={project?.name ?? ''}
      safetyLevel={safetyLevel}
      bomCost={bomCost}
      components={components}
      nodes={nodes}
      canExport={canExport}
      exportBusy={exportBusy}
      onExportPackage={handleExportPackage}
    />
  );
}

function WiringPanelMount() {
  const ioItems = useStore((s) => s.ioItems);
  return <WiringPanel ioItems={ioItems} />;
}

function GuidePanelMount() {
  const steps = useStore((s) => s.commissioningSteps);
  return <GuidePanel steps={steps} />;
}

function CabinetPanelMount() {
  const nodes = useStore((s) => s.topology.nodes);
  const components = nodes.map((n) => ({ id: n.id, type: n.type, label: n.label }));
  return <CabinetPanel components={components} />;
}
