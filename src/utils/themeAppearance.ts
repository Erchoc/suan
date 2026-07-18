import type { Theme } from '../contexts/theme';

export const THEME_APPEARANCE = {
  light: { themeColor: '#faf8f3' },
  dark: { themeColor: '#0f0e17' },
} as const satisfies Record<Theme, { themeColor: string }>;

export function normalizeTheme(value: string | null): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

export function getNextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light';
}

interface ThemePointerActivation {
  pointerType: string;
  isPrimary: boolean;
  button: number;
}

export function shouldPreviewThemeOnPointer(event: ThemePointerActivation): boolean {
  return event.pointerType === 'touch' && event.isPrimary && event.button === 0;
}

interface ThemeElement {
  setAttribute(name: string, value: string): void;
  style?: {
    backgroundColor: string;
  };
}

interface ThemeDocument {
  documentElement: {
    setAttribute(name: string, value: string): void;
    style: {
      colorScheme: string;
      backgroundColor: string;
    };
  };
  body: {
    style: {
      backgroundColor: string;
    };
  } | null;
  querySelector(selector: string): ThemeElement | null;
}

export function applyThemeAppearance(theme: Theme, target: ThemeDocument = document): void {
  const { themeColor } = THEME_APPEARANCE[theme];
  target.documentElement.setAttribute('data-theme', theme);
  target.documentElement.style.colorScheme = theme;
  target.documentElement.style.backgroundColor = themeColor;
  if (target.body) {
    target.body.style.backgroundColor = themeColor;
  }
  target.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  target.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);

  const topSurface = target.querySelector('[data-theme-surface="top"]');
  topSurface?.setAttribute('data-theme', theme);
  if (topSurface?.style) {
    topSurface.style.backgroundColor = themeColor;
  }
}
