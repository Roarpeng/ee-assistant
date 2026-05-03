/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'app-bg-primary': 'var(--color-bg-primary)',
        'app-bg-secondary': 'var(--color-bg-secondary)',
        'app-bg-tertiary': 'var(--color-bg-tertiary)',
        'app-text-primary': 'var(--color-text-primary)',
        'app-text-secondary': 'var(--color-text-secondary)',
        'app-text-tertiary': 'var(--color-text-tertiary)',
        'app-border': 'var(--color-border)',
        'app-border-light': 'var(--color-border-light)',
        'app-accent': 'var(--color-accent)',
        'app-accent-hover': 'var(--color-accent-hover)',
        'app-accent-light': 'var(--color-accent-light)',
        'app-success': 'var(--color-success)',
        'app-success-light': 'var(--color-success-light)',
        'app-warning': 'var(--color-warning)',
        'app-warning-light': 'var(--color-warning-light)',
        'app-error': 'var(--color-error)',
        'app-error-light': 'var(--color-error-light)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'app-sm': 'var(--radius-sm)',
        'app-md': 'var(--radius-md)',
        'app-lg': 'var(--radius-lg)',
      },
      boxShadow: {
        'app-sm': 'var(--shadow-sm)',
        'app-md': 'var(--shadow-md)',
        'app-lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
