import graphData from './knowledge-graph.json';
import type { KnowledgePoint } from '../types';

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

// 构建主索引
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

// 桥头堡集合：kp id → BridgeGroup label
export const bridgeMap = new Map<string, string>();
graphData.meta.bridgePoints.groups.forEach(group => {
  group.kpIds.forEach(id => bridgeMap.set(id, group.label));
});

// 工具函数：获取某知识点的完整依赖链（BFS，从当前节点往前追溯所有前置）
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

// 工具函数：获取哪些知识点依赖了某知识点（反向查找）
export function getDependents(kpId: string): KPWithContext[] {
  const result: KPWithContext[] = [];
  kpMap.forEach(kp => {
    if (kp.deps.includes(kpId)) {
      result.push(kp);
    }
  });
  return result;
}

// 工具函数：获取某年级+学期范围内的所有知识点（含历史年级）
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
