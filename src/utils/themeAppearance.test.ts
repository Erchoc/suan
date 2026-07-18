import { describe, expect, it, vi } from 'vitest';
import {
  applyThemeAppearance,
  getNextTheme,
  normalizeTheme,
  shouldPreviewThemeOnPointer,
  THEME_APPEARANCE,
} from './themeAppearance';

describe('theme appearance', () => {
  it('normalizes persisted values to a supported theme', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('system')).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
  });

  it('returns the opposite theme', () => {
    expect(getNextTheme('light')).toBe('dark');
    expect(getNextTheme('dark')).toBe('light');
  });

  it('previews only primary touch activation', () => {
    expect(shouldPreviewThemeOnPointer({ pointerType: 'touch', isPrimary: true, button: 0 })).toBe(
      true,
    );
    expect(shouldPreviewThemeOnPointer({ pointerType: 'mouse', isPrimary: true, button: 0 })).toBe(
      false,
    );
    expect(shouldPreviewThemeOnPointer({ pointerType: 'touch', isPrimary: false, button: 0 })).toBe(
      false,
    );
    expect(shouldPreviewThemeOnPointer({ pointerType: 'touch', isPrimary: true, button: 1 })).toBe(
      false,
    );
  });

  it.each(['light', 'dark'] as const)('synchronizes the %s page and status bar', theme => {
    const setRootAttribute = vi.fn();
    const setThemeColorAttribute = vi.fn();
    const setColorSchemeAttribute = vi.fn();
    const setSurfaceAttribute = vi.fn();
    const rootStyle = { colorScheme: '', backgroundColor: '' };
    const bodyStyle = { backgroundColor: '' };
    const surfaceStyle = { backgroundColor: '' };
    const target = {
      documentElement: { setAttribute: setRootAttribute, style: rootStyle },
      body: { style: bodyStyle },
      querySelector: vi.fn((selector: string) => {
        if (selector === 'meta[name="theme-color"]') {
          return { setAttribute: setThemeColorAttribute };
        }
        if (selector === 'meta[name="color-scheme"]') {
          return { setAttribute: setColorSchemeAttribute };
        }
        return { setAttribute: setSurfaceAttribute, style: surfaceStyle };
      }),
    };

    applyThemeAppearance(theme, target);

    expect(setRootAttribute).toHaveBeenCalledWith('data-theme', theme);
    expect(rootStyle).toEqual({
      colorScheme: theme,
      backgroundColor: THEME_APPEARANCE[theme].themeColor,
    });
    expect(bodyStyle.backgroundColor).toBe(THEME_APPEARANCE[theme].themeColor);
    expect(target.querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    expect(setThemeColorAttribute).toHaveBeenCalledWith(
      'content',
      THEME_APPEARANCE[theme].themeColor,
    );
    expect(target.querySelector).toHaveBeenCalledWith('meta[name="color-scheme"]');
    expect(setColorSchemeAttribute).toHaveBeenCalledWith('content', theme);
    expect(target.querySelector).toHaveBeenCalledWith('[data-theme-surface="top"]');
    expect(setSurfaceAttribute).toHaveBeenCalledWith('data-theme', theme);
    expect(surfaceStyle.backgroundColor).toBe(THEME_APPEARANCE[theme].themeColor);
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
