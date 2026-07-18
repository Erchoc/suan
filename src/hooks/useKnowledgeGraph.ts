import { useMemo } from 'react';
import type { KPWithContext } from '../data/kpIndex';
import { bridgeMap, getDependents, getFullDepsChain, kpMap } from '../data/kpIndex';

export function useKnowledgeGraph() {
  const allKPs = useMemo(() => Array.from(kpMap.values()), []);

  const search = (query: string): KPWithContext[] => {
    const q = query.toLowerCase().trim();
    if (!q) return allKPs;
    return allKPs.filter(kp => kp.name.toLowerCase().includes(q) || kp.id.includes(q));
  };

  const getByGrade = (gradeNum: number) => allKPs.filter(kp => kp.gradeNum === gradeNum);

  const getByDomain = (domainName: string) => allKPs.filter(kp => kp.domainName === domainName);

  const getBridgePoints = () => allKPs.filter(kp => bridgeMap.has(kp.id));

  return {
    allKPs,
    kpMap,
    bridgeMap,
    search,
    getByGrade,
    getByDomain,
    getBridgePoints,
    getFullDepsChain,
    getDependents,
  };
}
