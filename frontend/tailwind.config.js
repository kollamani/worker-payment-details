/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Class-based dark mode: the <html> element gets/loses the `dark` class by
  // the ThemeContext (and by the inline bootstrap script in index.html, which
  // prevents a flash of the wrong theme on refresh).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        // Semantic, CSS-variable driven tokens (defined in src/index.css under
        // `:root` for light and `.dark` for dark). Using these instead of raw
        // slate/white utilities keeps every surface, text and border color
        // automatically in sync with the active theme while preserving WCAG
        // AA+ contrast in both modes.
        //   Usage examples: bg-canvas bg-surface bg-subtle
        //                   text-ink text-ink-soft text-ink-muted text-ink-faint
        //                   border-line border-line-strong
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
        },
      },
      keyframes: {
        'fade-slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-pop': {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(12px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-timer': {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
        // Dialog entrance: fade + slight scale-up / slide-up (Linear / Notion style).
        'modal-pop': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // Overlay entrance: opacity only, so a full-screen backdrop never slides.
        'modal-backdrop': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Primary-action rune glow: a slow breathing backlight on the royal-blue
        // "Add Task" button (subtle sparkle, never distracting).
        'rune-glow': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.08)' },
        },
      },
      animation: {
        'fade-slide-down': 'fade-slide-down 0.3s ease-out both',
        'fade-in': 'fade-in 0.28s ease-out both',
        'toast-pop': 'toast-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-timer': 'toast-timer 3s linear forwards',
        'modal-pop': 'modal-pop 0.24s cubic-bezier(0.16, 1, 0.3, 1) both',
        'modal-backdrop': 'modal-backdrop 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
