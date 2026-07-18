import type { Theme } from '../contexts/theme';

export const THEME_APPEARANCE = {
  light: { themeColor: '#faf8f3' },
  dark: { themeColor: '#0f0e17' },
} as const satisfies Record<Theme, { themeColor: string }>;

export function normalizeTheme(value: string | null): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

interface ThemeDocument {
  documentElement: {
    setAttribute(name: string, value: string): void;
    style: {
      colorScheme: string;
      backgroundColor: string;
    };
  };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

export function applyThemeAppearance(
  theme: Theme,
  target: ThemeDocument = document,
): void {
  const { themeColor } = THEME_APPEARANCE[theme];
  target.documentElement.setAttribute('data-theme', theme);
  target.documentElement.style.colorScheme = theme;
  target.documentElement.style.backgroundColor = themeColor;
  target.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}
