import { type ReactNode, useLayoutEffect, useState } from 'react';
import { applyThemeAppearance, normalizeTheme } from '../utils/themeAppearance';
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
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    // Safari samples the page background for its top bar during the input event.
    applyThemeAppearance(nextTheme);
    setTheme(nextTheme);
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
