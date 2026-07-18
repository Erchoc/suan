import type { KnowledgePoint } from '../types';
import graphData from './knowledge-graph.json';

export interface KPWithContext extends KnowledgePoint {
  gradeId: string;
  gradeName: string;
  gradeColor: string;
  domainId: string;
  domainName: string;
  domainIcon: string;
  unitId: string;
  unitName: string;
  unitSemester: '上' | '下';
  gradeNum: number;
}

// Build the primary index.
export const kpMap = new Map<string, KPWithContext>();

graphData.grades.forEach((grade, gi) => {
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => {
        kpMap.set(kp.id, {
          ...kp,
          gradeId: grade.id,
          gradeName: grade.name,
          gradeColor: grade.color,
          domainId: domain.id,
          domainName: domain.name,
          domainIcon: domain.icon,
          unitId: unit.id,
          unitName: unit.name,
          unitSemester: unit.semester as '上' | '下',
          gradeNum: gi + 1,
        });
      });
    });
  });
});

// Map each bridge knowledge point ID to its BridgeGroup label.
export const bridgeMap = new Map<string, string>();
graphData.meta.bridgePoints.groups.forEach(group => {
  group.kpIds.forEach(id => bridgeMap.set(id, group.label));
});

// Return the full dependency chain by traversing prerequisites with BFS.
export function getFullDepsChain(kpId: string): KPWithContext[] {
  const visited = new Set<string>();
  const queue = [kpId];
  const result: KPWithContext[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const kp = kpMap.get(id);
    if (!kp) continue;
    if (id !== kpId) {
      result.push(kp);
    }
    kp.deps.forEach(dep => queue.push(dep));
  }
  return result;
}

// Return every knowledge point that directly depends on the given point.
export function getDependents(kpId: string): KPWithContext[] {
  const result: KPWithContext[] = [];
  kpMap.forEach(kp => {
    if (kp.deps.includes(kpId)) {
      result.push(kp);
    }
  });
  return result;
}

// Return all knowledge points through a grade and semester, including prior grades.
export function getKPsUpTo(gradeNum: number, semester: '上' | '下'): KPWithContext[] {
  const result: KPWithContext[] = [];
  kpMap.forEach(kp => {
    if (kp.gradeNum < gradeNum) {
      result.push(kp);
    } else if (kp.gradeNum === gradeNum) {
      if (semester === '下' || kp.unitSemester === '上') {
        result.push(kp);
      }
    }
  });
  return result;
}

export { graphData };
