import { createTheme, type ThemeOptions } from '@mui/material/styles';

// Material Design 3 color tokens — dynamic color generation mimics
// Android 12+ wallpaper-based theming. Primary = indigo (engineering tool).
const md3Light: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#4F46E5', // indigo-600
      light: '#818CF8', // indigo-400
      dark: '#3730A3',  // indigo-800
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#7C3AED', // violet-600
      light: '#A78BFA',
      dark: '#5B21B6',
      contrastText: '#FFFFFF',
    },
    tertiary: {
      main: '#0891B2', // cyan-600
      light: '#22D3EE',
      dark: '#155E75',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#DC2626', // red-600
    },
    background: {
      default: '#F8FAFC', // surface
      paper: '#FFFFFF',
    },
    surfaceContainer: '#F1F5F9',
    surfaceContainerLow: '#F8FAFC',
    surfaceContainerHigh: '#E2E8F0',
    surfaceContainerHighest: '#CBD5E1',
    text: {
      primary: '#1E293B',
      secondary: '#475569',
      disabled: '#94A3B8',
    },
    divider: '#E2E8F0',
  },
  typography: {
    fontFamily: '"Inter", "Noto Sans SC", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.025em' },
    h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35 },
    h5: { fontSize: '1.125rem', fontWeight: 500, lineHeight: 1.4 },
    h6: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
    subtitle1: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5, letterSpacing: '0.009em' },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.43, letterSpacing: '0.007em' },
    body1: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.5, letterSpacing: '0.009em' },
    body2: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.43, letterSpacing: '0.007em' },
    button: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.75, textTransform: 'none' },
    caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.33 },
    overline: { fontSize: '0.6875rem', fontWeight: 500, lineHeight: 1.45, textTransform: 'uppercase', letterSpacing: '0.08em' },
  },
  shape: {
    borderRadius: 16, // MD3 rounded corners
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 20, // fully rounded MD3 pills
          padding: '10px 24px',
          fontWeight: 500,
          fontSize: '0.875rem',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          border: '1px solid',
          borderColor: 'divider',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500 },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 16,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 28 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
    MuiIconButton: {
      defaultProps: { disableRipple: false },
    },
  },
};

// Dark theme uses same type scale, inverted surfaces
const md3Dark: ThemeOptions = {
  ...md3Light,
  palette: {
    mode: 'dark',
    primary: {
      main: '#818CF8', // indigo-400
      light: '#A5B4FC',
      dark: '#4F46E5',
      contrastText: '#1E1B4B',
    },
    secondary: {
      main: '#A78BFA',
      light: '#C4B5FD',
      dark: '#7C3AED',
      contrastText: '#1E1B4B',
    },
    tertiary: {
      main: '#22D3EE',
      light: '#67E8F9',
      dark: '#0891B2',
      contrastText: '#1E1B4B',
    },
    error: {
      main: '#FCA5A5',
    },
    background: {
      default: '#0F172A', // slate-900
      paper: '#1E293B',   // slate-800
    },
    surfaceContainer: '#1E293B',
    surfaceContainerLow: '#0F172A',
    surfaceContainerHigh: '#334155',
    surfaceContainerHighest: '#475569',
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      disabled: '#64748B',
    },
    divider: '#334155',
  },
};

export const lightTheme = createTheme(md3Light);
export const darkTheme = createTheme(md3Dark);
