import type { KPWithContext } from '../data/kpIndex';
import { kpMap } from '../data/kpIndex';

/**
 * Returns every downstream knowledge point reachable from startId using BFS.
 */
export function getReachable(startId: string): KPWithContext[] {
  const visited = new Set<string>();
  const queue = [startId];
  const result: KPWithContext[] = [];

  // Build a reverse index from each dependency to the knowledge points that depend on it.
  const reverseMap = new Map<string, string[]>();
  kpMap.forEach(kp => {
    kp.deps.forEach(dep => {
      const list = reverseMap.get(dep) ?? [];
      list.push(kp.id);
      reverseMap.set(dep, list);
    });
  });

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const kp = kpMap.get(id);
    if (kp && id !== startId) result.push(kp);
    const dependents = reverseMap.get(id) ?? [];
    dependents.forEach(d => queue.push(d));
  }

  return result;
}

/**
 * Finds the shortest learning path between two knowledge points using BFS.
 */
export function findPath(fromId: string, toId: string): KPWithContext[] {
  const visited = new Set<string>();
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    if (id === toId) {
      return path.map(pid => kpMap.get(pid)!).filter(Boolean);
    }

    // Find successors that list the current node as a dependency.
    kpMap.forEach(kp => {
      if (kp.deps.includes(id) && !visited.has(kp.id)) {
        queue.push({ id: kp.id, path: [...path, kp.id] });
      }
    });
  }

  return [];
}
