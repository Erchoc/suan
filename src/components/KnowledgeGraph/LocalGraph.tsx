import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { kpMap, bridgeMap } from '../../data/kpIndex';
import type { KPWithContext } from '../../data/kpIndex';
import { useTheme } from '../../contexts/theme';

interface LocalGraphProps {
  centerKP: KPWithContext;
  onNodeClick?: (kp: KPWithContext) => void;
}

const W = 168;
const H = 48;

export default function LocalGraph({ centerKP, onNodeClick }: LocalGraphProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const bgDotColor   = isDark ? '#2e2b4a' : '#d8d3c8';
  const edgeStroke   = isDark ? 'rgba(167,169,190,0.5)' : 'rgba(100,95,130,0.4)';

  const { nodes, edges } = useMemo(() => {
    // 直接前置（deps）
    const deps = centerKP.deps
      .map(id => kpMap.get(id))
      .filter(Boolean) as KPWithContext[];

    // 直接后继
    const dependents: KPWithContext[] = [];
    kpMap.forEach(kp => {
      if (kp.deps.includes(centerKP.id)) dependents.push(kp);
    });

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const nodeBase = {
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    // deps 在左列
    const depsCount = deps.length;
    const depYStart = -(depsCount - 1) * 60 / 2;
    deps.forEach((d, i) => {
      const isBridge = bridgeMap.has(d.id);
      nodes.push({
        id: d.id,
        position: { x: 0, y: depYStart + i * 60 },
        data: { label: d.name },
        ...nodeBase,
        style: {
          background: `${d.gradeColor}18`,
          border: isBridge ? '1.5px solid var(--bridge)' : `1px solid ${d.gradeColor}66`,
          borderRadius: 8,
          color: 'var(--text)',
          fontSize: 11,
          width: W,
          minHeight: H,
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
        },
      });
      edges.push({
        id: `${d.id}-center`,
        source: d.id,
        target: centerKP.id,
        style: { stroke: edgeStroke, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke },
      });
    });

    // 中心节点
    const isCenterBridge = bridgeMap.has(centerKP.id);
    nodes.push({
      id: centerKP.id,
      position: { x: W + 60, y: 0 },
      data: { label: centerKP.name },
      ...nodeBase,
      style: {
        background: `${centerKP.gradeColor}28`,
        border: isCenterBridge
          ? '2px solid var(--bridge)'
          : `2px solid ${centerKP.gradeColor}`,
        borderRadius: 10,
        color: 'var(--text)',
        fontSize: 12,
        fontWeight: 600,
        width: W + 20,
        minHeight: H + 8,
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px',
        boxShadow: `0 0 16px ${centerKP.gradeColor}44`,
      },
    });

    // 后继节点在右列
    const depCount = dependents.length;
    const rightYStart = -(depCount - 1) * 60 / 2;
    dependents.forEach((d, i) => {
      const isBridge = bridgeMap.has(d.id);
      nodes.push({
        id: d.id,
        position: { x: (W + 60) * 2 + 20, y: rightYStart + i * 60 },
        data: { label: d.name },
        ...nodeBase,
        style: {
          background: `${d.gradeColor}18`,
          border: isBridge ? '1.5px solid var(--bridge)' : `1px solid ${d.gradeColor}66`,
          borderRadius: 8,
          color: 'var(--text)',
          fontSize: 11,
          width: W,
          minHeight: H,
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
        },
      });
      edges.push({
        id: `center-${d.id}`,
        source: centerKP.id,
        target: d.id,
        style: { stroke: edgeStroke, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke },
      });
    });

    return { nodes, edges };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKP, isDark]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      minZoom={0.3}
      maxZoom={2}
      onNodeClick={(_e, node) => {
        const kp = kpMap.get(node.id);
        if (kp) onNodeClick?.(kp);
      }}
      style={{ background: 'var(--surface2)', borderRadius: 12 }}
    >
      <Background color={bgDotColor} gap={16} />
    </ReactFlow>
  );
}
