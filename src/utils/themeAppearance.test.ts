import { describe, expect, it, vi } from 'vitest';
import { applyThemeAppearance, normalizeTheme, THEME_APPEARANCE } from './themeAppearance';

describe('theme appearance', () => {
  it('normalizes persisted values to a supported theme', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('system')).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
  });

  it.each(['light', 'dark'] as const)('synchronizes the %s page and status bar', theme => {
    const setRootAttribute = vi.fn();
    const setMetaAttribute = vi.fn();
    const rootStyle = { colorScheme: '', backgroundColor: '' };
    const bodyStyle = { backgroundColor: '' };
    const target = {
      documentElement: { setAttribute: setRootAttribute, style: rootStyle },
      body: { style: bodyStyle },
      querySelector: vi.fn(() => ({ setAttribute: setMetaAttribute })),
    };

    applyThemeAppearance(theme, target);

    expect(setRootAttribute).toHaveBeenCalledWith('data-theme', theme);
    expect(rootStyle).toEqual({
      colorScheme: theme,
      backgroundColor: THEME_APPEARANCE[theme].themeColor,
    });
    expect(bodyStyle.backgroundColor).toBe(THEME_APPEARANCE[theme].themeColor);
    expect(target.querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    expect(setMetaAttribute).toHaveBeenCalledWith('content', THEME_APPEARANCE[theme].themeColor);
  });

  it('updates safely before the body is available', () => {
    const target = {
      documentElement: {
        setAttribute: vi.fn(),
        style: { colorScheme: '', backgroundColor: '' },
      },
      body: null,
      querySelector: vi.fn(() => null),
    };

    expect(() => applyThemeAppearance('dark', target)).not.toThrow();
    expect(target.documentElement.style.backgroundColor).toBe(THEME_APPEARANCE.dark.themeColor);
  });
});
