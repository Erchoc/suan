import { describe, expect, it } from 'vitest';
import { calculateSelectPlacement } from './selectPlacement';

const viewport = { top: 0, bottom: 802, left: 0, right: 1144 };
const boundary = { top: 247, bottom: 596.5 };

describe('calculateSelectPlacement', () => {
  it('keeps a downward menu inside the dialog body', () => {
    const placement = calculateSelectPlacement({
      trigger: { top: 300, bottom: 340, left: 337, width: 470 },
      viewport,
      boundary,
      estimatedHeight: 192,
    });

    expect(placement).toEqual({
      top: 346,
      left: 337,
      width: 470,
      maxHeight: 242.5,
      openUpwards: false,
    });
    expect(placement.top + Math.min(192, placement.maxHeight)).toBeLessThanOrEqual(
      boundary.bottom - 8,
    );
  });

  it('flips upward before colliding with the dialog footer', () => {
    const placement = calculateSelectPlacement({
      trigger: { top: 470, bottom: 510, left: 580, width: 227 },
      viewport,
      boundary,
      estimatedHeight: 192,
    });

    expect(placement.openUpwards).toBe(true);
    expect(placement.top).toBe(272);
    expect(placement.top).toBeGreaterThanOrEqual(boundary.top + 8);
    expect(placement.top + 192).toBeLessThan(470);
  });

  it('clamps a wide menu to the visual viewport', () => {
    const placement = calculateSelectPlacement({
      trigger: { top: 220, bottom: 260, left: -5, width: 420 },
      viewport: { top: 0, bottom: 667, left: 10, right: 390 },
      boundary: { top: 125.5, bottom: 583 },
      estimatedHeight: 320,
    });

    expect(placement.left).toBe(22);
    expect(placement.width).toBe(356);
    expect(placement.left + placement.width).toBe(378);
  });
});
