import { kpMap } from '../data/kpIndex';
import type { KPWithContext } from '../data/kpIndex';

/**
 * BFS 获取从 startId 开始可达的所有后续知识点（正向遍历）
 */
export function getReachable(startId: string): KPWithContext[] {
  const visited = new Set<string>();
  const queue = [startId];
  const result: KPWithContext[] = [];

  // 构建反向索引：dep → 依赖它的 kp 列表
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
 * 找出两个知识点之间的学习路径（最短路径，BFS）
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

    // 反向索引：当前节点的后继（依赖当前节点的知识点）
    kpMap.forEach(kp => {
      if (kp.deps.includes(id) && !visited.has(kp.id)) {
        queue.push({ id: kp.id, path: [...path, kp.id] });
      }
    });
  }

  return [];
}
