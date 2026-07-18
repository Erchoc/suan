import { describe, expect, it } from 'vitest';
import { getDependents, getFullDepsChain, getKPsUpTo, kpMap } from './kpIndex';

describe('knowledge point index', () => {
  it('returns a unique transitive dependency chain and handles unknown IDs', () => {
    const targetId = '1-14';
    const target = kpMap.get(targetId);
    const chain = getFullDepsChain(targetId);
    const chainIds = chain.map(kp => kp.id);
    const chainIdSet = new Set(chainIds);

    expect(target).toBeDefined();
    expect(chainIds).not.toContain(targetId);
    expect(chainIdSet.size).toBe(chainIds.length);
    for (const directDependencyId of target?.deps ?? []) {
      expect(chainIdSet).toContain(directDependencyId);
    }
    for (const dependency of chain) {
      expect(kpMap.get(dependency.id)).toBe(dependency);
      for (const nestedDependencyId of dependency.deps) {
        expect(chainIdSet).toContain(nestedDependencyId);
      }
    }
    expect(getFullDepsChain('unknown-kp')).toEqual([]);
  });

  it('returns only direct dependents of a knowledge point', () => {
    const sourceId = '1-4';
    const dependents = getDependents(sourceId);

    expect(dependents.length).toBeGreaterThan(1);
    expect(dependents.map(kp => kp.id)).toContain('1-5');
    expect(dependents.every(kp => kp.deps.includes(sourceId))).toBe(true);
    expect(getDependents('unknown-kp')).toEqual([]);
  });

  it('includes prior grades while respecting the current semester boundary', () => {
    const gradeTwoUpper = getKPsUpTo(2, '上');
    const gradeTwoLower = getKPsUpTo(2, '下');

    expect(gradeTwoUpper.some(kp => kp.gradeNum === 1 && kp.unitSemester === '下')).toBe(true);
    expect(gradeTwoUpper.some(kp => kp.gradeNum === 2 && kp.unitSemester === '上')).toBe(true);
    expect(gradeTwoUpper.some(kp => kp.gradeNum === 2 && kp.unitSemester === '下')).toBe(false);
    expect(
      gradeTwoUpper.every(kp => kp.gradeNum < 2 || (kp.gradeNum === 2 && kp.unitSemester === '上')),
    ).toBe(true);

    expect(gradeTwoLower.length).toBeGreaterThan(gradeTwoUpper.length);
    expect(gradeTwoLower.some(kp => kp.gradeNum === 2 && kp.unitSemester === '下')).toBe(true);
    expect(gradeTwoLower.every(kp => kp.gradeNum <= 2)).toBe(true);
    expect(getKPsUpTo(1, '上').every(kp => kp.gradeNum === 1 && kp.unitSemester === '上')).toBe(
      true,
    );
    expect(getKPsUpTo(6, '下')).toHaveLength(kpMap.size);
  });
});
