import { useStore } from '../../models/store';
import { IconButton } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import BuildIcon from '@mui/icons-material/Build';

const NEXT_LABEL: Record<'light' | 'dark' | 'engineering', string> = {
  light: 'dark',
  dark: 'engineering',
  engineering: 'light',
};

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  return (
    <IconButton
      onClick={toggleTheme}
      title={`Switch to ${NEXT_LABEL[theme]} theme`}
      aria-label="Toggle theme"
      size="small"
      sx={{
        color: 'text.secondary',
        '&:hover': { color: 'text.primary' },
      }}
    >
      {theme === 'light' && <LightModeIcon fontSize="small" />}
      {theme === 'dark' && <DarkModeIcon fontSize="small" />}
      {theme === 'engineering' && <BuildIcon fontSize="small" />}
    </IconButton>
  );
}
