import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LanguageIcon from '@mui/icons-material/Language';

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
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: '2.5rem',
        height: 72,
        flexShrink: 0,
        justifyContent: 'center',
        px: 3,
      }}
    >
      <Toolbar disableGutters sx={{ minHeight: 'auto !important', height: '100%' }}>
        {/* Left: Brand */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'primary.main',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 6px -1px rgba(79,70,229,0.2)',
            }}
          >
            <Typography
              sx={{
                color: 'primary.contrastText',
                fontWeight: 700,
                letterSpacing: '-0.05em',
                fontSize: '0.875rem',
                lineHeight: 1,
              }}
            >
              V
            </Typography>
          </Box>
          <Typography
            variant="h6"
            fontWeight={700}
            letterSpacing="-0.025em"
            textTransform="uppercase"
            sx={{ color: 'text.primary' }}
          >
            {tr.app.name}
          </Typography>
        </Box>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Center: Nav tabs */}
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_, val) => {
            if (val !== null) setActiveTab(val);
          }}
          size="small"
          sx={{
            bgcolor: 'background.default',
            border: 1,
            borderColor: 'divider',
            borderRadius: '999px',
            px: 0.5,
            py: 0.25,
            gap: 0.5,
            height: 52,
            '& .MuiToggleButton-root': {
              border: 'none',
              borderRadius: '999px',
              px: 3,
              py: 0,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.875rem',
              color: 'text.disabled',
              height: '100%',
              '&.Mui-selected': {
                bgcolor: 'surfaceContainerHigh',
                color: 'text.primary',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                '&:hover': { bgcolor: 'surfaceContainerHigh' },
              },
              '&:hover': {
                color: 'text.primary',
                bgcolor: 'action.hover',
              },
            },
          }}
        >
          {tabs.map(([id, label]) => (
            <ToggleButton key={id} value={id} aria-label={label}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: { xs: 'none', lg: 'flex' },
              alignItems: 'center',
              px: 2,
              py: 0.75,
              bgcolor: 'action.hover',
              borderRadius: '999px',
              border: 1,
              borderColor: 'primary.main',
              borderOpacity: 0.2,
            }}
          >
            <Typography
              variant="caption"
              fontWeight={700}
              textTransform="uppercase"
              letterSpacing="0.1em"
              sx={{ color: 'primary.main', fontSize: '0.65rem' }}
            >
              {tr.header.version}
            </Typography>
          </Box>

          <IconButton
            onClick={toggleLanguage}
            size="small"
            title={language === 'zh' ? 'Switch to English' : '切换到中文'}
            sx={{
              width: 40,
              height: 40,
              border: 1,
              borderColor: 'divider',
              borderRadius: '50%',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <LanguageIcon sx={{ fontSize: 16 }} />
            <Typography
              component="span"
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                ml: 0.25,
                color: 'inherit',
              }}
            >
              {language === 'zh' ? 'EN' : '中'}
            </Typography>
          </IconButton>

          <IconButton
            onClick={toggleTheme}
            size="small"
            title={`Switch to ${theme === 'light' ? 'dark' : theme === 'dark' ? 'engineering' : 'light'} mode`}
            sx={{
              width: 40,
              height: 40,
              border: 1,
              borderColor: 'divider',
              borderRadius: '50%',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            {theme === 'light' ? (
              <DarkModeIcon sx={{ fontSize: 16 }} />
            ) : (
              <LightModeIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>

          <IconButton
            onClick={onOpenSettings}
            size="small"
            sx={{
              width: 40,
              height: 40,
              border: 1,
              borderColor: 'divider',
              borderRadius: '50%',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <SettingsIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
