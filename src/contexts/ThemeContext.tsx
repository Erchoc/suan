import { useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored ?? 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    // 动态更新 theme-color：删除旧 meta 再创建新的，强制 iOS Safari 重新读取
    const themeColor = theme === 'dark' ? '#0f0e17' : '#faf8f3';
    const oldMeta = document.querySelector('meta[name="theme-color"]');
    if (oldMeta) oldMeta.remove();
    const newMeta = document.createElement('meta');
    newMeta.setAttribute('name', 'theme-color');
    newMeta.setAttribute('content', themeColor);
    document.head.appendChild(newMeta);
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
