import { describe, expect, it } from 'vitest';
import { kpMap } from '../data/kpIndex';
import { findPath, getReachable } from './graphTraversal';

describe('getReachable', () => {
  it('returns downstream knowledge points without the starting point or duplicates', () => {
    const reachable = getReachable('1-4');
    const ids = reachable.map(kp => kp.id);

    expect(ids).toEqual(expect.arrayContaining(['1-5', '1-6', '1-7']));
    expect(ids).not.toContain('1-4');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty list for an unknown knowledge point', () => {
    expect(getReachable('missing-kp')).toEqual([]);
  });
});

describe('findPath', () => {
  it('finds a shortest downstream learning path', () => {
    const path = findPath('1-4', '1-7');

    expect(path.map(kp => kp.id)).toHaveLength(3);
    expect(path[0]?.id).toBe('1-4');
    expect(path.at(-1)?.id).toBe('1-7');
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]?.deps).toContain(path[index - 1]?.id);
    }
  });

  it('returns the point itself when both endpoints match', () => {
    expect(findPath('1-4', '1-4')).toEqual([kpMap.get('1-4')]);
  });

  it('does not traverse dependencies in reverse', () => {
    expect(findPath('1-7', '1-4')).toEqual([]);
  });

  it('returns an empty list when either endpoint cannot be reached', () => {
    expect(findPath('missing-kp', '1-4')).toEqual([]);
    expect(findPath('1-4', 'missing-kp')).toEqual([]);
  });
});
