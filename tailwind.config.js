/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        deep: 'var(--bg-deep)',
        surface: 'var(--bg-card)',
        'surface-hover': 'var(--bg-card-hover)',
        raised: 'var(--bg-raised)',
        subtle: 'var(--border-subtle)',
        'border-focus': 'var(--border-focus)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        obsidian: {
          bg: '#0A0A0A',
          card: '#141413',
          cardHover: '#1A1A18',
          elevated: '#1F1F1D',
          border: '#262624',
          borderFocus: '#3D3D39',
          text: '#F2F0EC',
          muted: '#8C8984',
          subtle: '#52504C'
        },
        emerald: {
          DEFAULT: '#10B981',
          dark: '#059669',
          light: '#34D399',
          dim: 'rgba(16, 185, 129, 0.12)'
        },
        gold: {
          DEFAULT: '#C5A059',
          muted: '#A38446',
          light: '#DEC17D',
          dim: 'rgba(197, 160, 89, 0.12)'
        },
        amber: {
          DEFAULT: '#D97706',
          dark: '#B45309',
          light: '#F59E0B',
          dim: 'rgba(217, 119, 6, 0.12)'
        },
        fin: {
          income: '#22C55E',
          incomeDim: 'rgba(34, 197, 94, 0.12)',
          expense: '#EF4444',
          expenseDim: 'rgba(239, 68, 68, 0.12)',
          pending: '#F59E0B',
          pendingDim: 'rgba(245, 158, 11, 0.12)',
          transfer: '#8C8984',
          transferDim: 'rgba(140, 137, 132, 0.12)'
        }
      },
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Geist Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '14px'
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.08)',
        elevated: '0 4px 16px -2px rgba(0, 0, 0, 0.25)',
        modal: '0 16px 32px -4px rgba(0, 0, 0, 0.45)'
      }
    },
  },
  plugins: [],
};
