import { useStore } from '../../models/store';

const NEXT_LABEL: Record<'light' | 'dark' | 'engineering', string> = {
  light: 'dark',
  dark: 'engineering',
  engineering: 'light',
};

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-app-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
      title={`Switch to ${NEXT_LABEL[theme]} theme`}
      aria-label="Toggle theme"
    >
      {theme === 'light' && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5a6.5 6.5 0 1 0 4.6 1.9 6.5 6.5 0 0 0-4.6-1.9zM8 3v10a4 4 0 1 0 0-8z" />
        </svg>
      )}
      {theme === 'dark' && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          {/* PenTool-like glyph: signals "engineering / blueprint" next */}
          <path d="M3 13l3-3 4 4-3 3-4-4z" />
          <path d="M10 6L14 2" />
          <path d="M12 8l2-2" />
        </svg>
      )}
      {theme === 'engineering' && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3.5" />
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
        </svg>
      )}
    </button>
  );
}
