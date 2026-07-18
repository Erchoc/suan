import { describe, expect, it, vi } from 'vitest';
import { applyThemeAppearance, normalizeTheme, THEME_APPEARANCE } from './themeAppearance';

describe('theme appearance', () => {
  it('只接受受支持的持久化主题', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('system')).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
  });

  it.each(['light', 'dark'] as const)('稳定更新 %s 主题的页面和系统栏元数据', theme => {
    const setRootAttribute = vi.fn();
    const setMetaAttribute = vi.fn();
    const style = { colorScheme: '', backgroundColor: '' };
    const target = {
      documentElement: { setAttribute: setRootAttribute, style },
      querySelector: vi.fn(() => ({ setAttribute: setMetaAttribute })),
    };

    applyThemeAppearance(theme, target);

    expect(setRootAttribute).toHaveBeenCalledWith('data-theme', theme);
    expect(style).toEqual({
      colorScheme: theme,
      backgroundColor: THEME_APPEARANCE[theme].themeColor,
    });
    expect(target.querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    expect(setMetaAttribute).toHaveBeenCalledWith(
      'content',
      THEME_APPEARANCE[theme].themeColor,
    );
  });
});
