import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        border:   'var(--border)',
        text:     'var(--text)',
        'text-dim': 'var(--text-dim)',
        accent:   'var(--accent)',
        accent2:  'var(--accent2)',
        green:    'var(--green)',
        blue:     'var(--blue)',
        bridge:   'var(--bridge)',
        g1: 'var(--g1)',
        g2: 'var(--g2)',
        g3: 'var(--g3)',
        g4: 'var(--g4)',
        g5: 'var(--g5)',
        g6: 'var(--g6)',
      },
      fontFamily: {
        brush:  ['"Ma Shan Zheng"', 'cursive'],
        serif:  ['"Noto Serif SC"', 'serif'],
        sans:   ['"Noto Sans SC"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
