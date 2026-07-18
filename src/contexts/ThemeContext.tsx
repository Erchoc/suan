import { useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './theme';
import { applyThemeAppearance, normalizeTheme } from '../utils/themeAppearance';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return normalizeTheme(localStorage.getItem('theme'));
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    applyThemeAppearance(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // 存储不可用时仍保持当前会话的主题与系统栏同步。
    }
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
