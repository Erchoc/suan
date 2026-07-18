import { type ReactNode, useLayoutEffect, useState } from 'react';
import { applyThemeAppearance, getNextTheme, normalizeTheme } from '../utils/themeAppearance';
import { type Theme, ThemeContext } from './theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return normalizeTheme(localStorage.getItem('theme'));
    } catch {
      return 'light';
    }
  });

  useLayoutEffect(() => {
    applyThemeAppearance(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Keep the in-memory theme synchronized when storage is unavailable.
    }
  }, [theme]);

  const toggle = () => {
    const nextTheme = getNextTheme(theme);

    // Synchronize browser chrome before React commits the new theme.
    applyThemeAppearance(nextTheme);
    setTheme(nextTheme);
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
