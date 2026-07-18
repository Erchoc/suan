import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { useTheme } from '../../contexts/theme';
import type { KPWithContext } from '../../data/kpIndex';
import { bridgeMap, kpMap } from '../../data/kpIndex';

interface KnowledgeGraphProps {
  filter?: {
    gradeNums?: number[];
    domainNames?: string[];
    onlyBridge?: boolean;
    search?: string;
  };
  onNodeClick?: (kp: KPWithContext) => void;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;

function buildLayout(kps: KPWithContext[], highlightIds?: Set<string>, isDark = false) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 60 });

  kps.forEach(kp => {
    g.setNode(kp.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  const kpIds = new Set(kps.map(k => k.id));
  kps.forEach(kp => {
    kp.deps.forEach(dep => {
      if (kpIds.has(dep)) {
        g.setEdge(dep, kp.id);
      }
    });
  });

  dagre.layout(g);

  const dimmedBg = isDark ? '#1a1830' : '#f3f0e8';
  const dimmedText = isDark ? 'rgba(167,169,190,0.4)' : 'rgba(122,120,146,0.5)';
  const dimmedBorder = isDark ? '#2e2b4a' : '#e4dfd4';
  const dimmedEdge = isDark ? '#2e2b4a' : '#d0cbc0';
  const activeEdge = isDark ? 'rgba(167,169,190,0.27)' : 'rgba(100,95,130,0.3)';

  const nodes: Node[] = kps.map(kp => {
    const pos = g.node(kp.id);
    const isBridge = bridgeMap.has(kp.id);
    const isDimmed = highlightIds ? !highlightIds.has(kp.id) : false;

    return {
      id: kp.id,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { label: kp.name, kp, isBridge },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: isDimmed ? dimmedBg : `${kp.gradeColor}18`,
        border: isBridge
          ? `2px solid var(--bridge)`
          : `1px solid ${isDimmed ? dimmedBorder : kp.gradeColor}66`,
        borderRadius: 10,
        color: isDimmed ? dimmedText : 'var(--text)',
        fontSize: 11,
        padding: '6px 10px',
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        opacity: isDimmed ? 0.35 : 1,
        transition: 'opacity 0.2s',
      },
    };
  });

  const edges: Edge[] = [];
  kps.forEach(kp => {
    kp.deps.forEach(dep => {
      if (kpIds.has(dep)) {
        const isDimmed = highlightIds ? !highlightIds.has(dep) || !highlightIds.has(kp.id) : false;
        const strokeColor = isDimmed ? dimmedEdge : activeEdge;
        edges.push({
          id: `${dep}-${kp.id}`,
          source: dep,
          target: kp.id,
          style: { stroke: strokeColor, strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
        });
      }
    });
  });

  return { nodes, edges };
}

export default function KnowledgeGraph({ filter, onNodeClick }: KnowledgeGraphProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const allKPs = useMemo(() => Array.from(kpMap.values()), []);

  const filteredKPs = useMemo(() => {
    let kps = allKPs;
    if (filter?.gradeNums?.length) {
      kps = kps.filter(k => filter.gradeNums!.includes(k.gradeNum));
    }
    if (filter?.domainNames?.length) {
      kps = kps.filter(k => filter.domainNames!.includes(k.domainName));
    }
    if (filter?.onlyBridge) {
      kps = kps.filter(k => bridgeMap.has(k.id));
    }
    return kps;
  }, [allKPs, filter]);

  const searchHighlight = useMemo(() => {
    if (!filter?.search?.trim()) return undefined;
    const q = filter.search.trim().toLowerCase();
    return new Set(
      filteredKPs.filter(k => k.name.toLowerCase().includes(q) || k.id.includes(q)).map(k => k.id),
    );
  }, [filteredKPs, filter?.search]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildLayout(filteredKPs, searchHighlight, isDark),
    [filteredKPs, searchHighlight, isDark],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const kp = kpMap.get(node.id);
      if (kp) onNodeClick?.(kp);
    },
    [onNodeClick],
  );

  const bgDotColor = isDark ? '#2e2b4a' : '#d8d3c8';
  const minimapBg = isDark ? '#1a1830' : '#f3f0e8';
  const minimapBorder = isDark ? '#2e2b4a' : '#e4dfd4';

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      fitView
      minZoom={0.1}
      maxZoom={2}
      style={{ background: 'var(--bg)' }}
    >
      <Background color={bgDotColor} gap={20} />
      <Controls
        style={{
          background: 'var(--surface)',
          border: `1px solid var(--border)`,
          color: 'var(--text)',
        }}
      />
      <MiniMap
        style={{ background: minimapBg, border: `1px solid ${minimapBorder}` }}
        nodeColor={node => {
          const kp = kpMap.get(node.id);
          return kp ? kp.gradeColor : minimapBorder;
        }}
      />
    </ReactFlow>
  );
}
