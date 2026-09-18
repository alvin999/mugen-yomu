/**
 * @file citationPhysicsEngine.ts
 * @description 學術引文關聯圖譜物理力導向模擬引擎 (Force-Directed Physics & Timeline Engine)
 * 負責星系模式之庫倫斥力、彈簧引力、向心場與時序演進譜系之防重疊碰撞佈局計算。
 */

import type { CitationNode, CitationEdge, CitationGraphData } from '../citationService';

export interface SimNode extends CitationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
}

export interface SimEdge extends CitationEdge {
  sourceNode?: SimNode;
  targetNode?: SimNode;
}

/**
 * 依據畫布維度與圖譜原始節點，初始化具有座標、半徑與速度之模擬節點與邊緣
 */
export function initSimulationNodes(
  graph: CitationGraphData | null,
  width: number,
  height: number
): { simNodes: SimNode[]; simEdges: SimEdge[]; initialSelectedNodeId: string | null } {
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return { simNodes: [], simEdges: [], initialSelectedNodeId: null };
  }

  const cx = width / 2;
  const cy = height / 2;

  // 初始化節點位置與半徑
  const simNodes: SimNode[] = graph.nodes.map((n, i) => {
    const isCore = n.category === 'core';
    const angle = (i / (graph.nodes.length || 1)) * Math.PI * 2;
    const dist = isCore ? 0 : (n.category === 'foundational' ? 140 : (n.category === 'derivative' ? 220 : 180));

    const x = cx + Math.cos(angle) * dist + (Math.random() - 0.5) * 20;
    const y = cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 20;

    return {
      ...n,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: isCore ? 34 : (n.category === 'derivative' ? 28 : 26)
    };
  });

  // 建立 Edges 節點引用
  const nodeMap = new Map<string, SimNode>(simNodes.map(n => [n.id, n]));
  const simEdges: SimEdge[] = graph.edges.map(e => ({
    ...e,
    sourceNode: nodeMap.get(e.source),
    targetNode: nodeMap.get(e.target)
  }));

  const core = simNodes.find(n => n.category === 'core');
  const initialSelectedNodeId = core ? core.id : (simNodes[0]?.id || null);

  return { simNodes, simEdges, initialSelectedNodeId };
}

/**
 * 星系引力場物理步進迭代 (Galaxy Force Physics Step)
 * 包含：節點間庫倫斥力、彈簧引力、核心向心引力與速度阻尼
 */
export function runGalaxyPhysicsStep(
  simNodes: SimNode[],
  simEdges: SimEdge[],
  width: number,
  height: number,
  simAlpha: number,
  draggingNodeId: string | null
): void {
  const cx = width / 2;
  const cy = height / 2;

  // 1. 節點間庫倫斥力 (Repulsion)
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i];
      const b = simNodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy || 1;
      const dist = Math.sqrt(distSq);

      // 避免重疊過近，給予文字標籤充足空間
      const minDist = a.radius + b.radius + 75;
      if (dist < minDist) {
        const force = ((minDist - dist) / minDist) * 12.0 * simAlpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.id !== draggingNodeId) { a.vx -= fx; a.vy -= fy; }
        if (b.id !== draggingNodeId) { b.vx += fx; b.vy += fy; }
      } else {
        const force = (1800 / distSq) * simAlpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.id !== draggingNodeId) { a.vx -= fx; a.vy -= fy; }
        if (b.id !== draggingNodeId) { b.vx += fx; b.vy += fy; }
      }
    }
  }

  // 2. 連線彈簧引力 (Spring Attraction)
  const targetEdgeLen = 190;
  for (const edge of simEdges) {
    const s = edge.sourceNode;
    const t = edge.targetNode;
    if (!s || !t) continue;

    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - targetEdgeLen) * 0.045 * simAlpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (s.id !== draggingNodeId) { s.vx += fx; s.vy += fy; }
    if (t.id !== draggingNodeId) { t.vx -= fx; t.vy -= fy; }
  }

  // 3. 核心節點與全域向心引力 (Centering Gravity)
  for (const n of simNodes) {
    if (n.id === draggingNodeId) continue;

    if (n.category === 'core') {
      n.vx += (cx - n.x) * 0.08 * simAlpha;
      n.vy += (cy - n.y) * 0.08 * simAlpha;
    } else {
      n.vx += (cx - n.x) * 0.012 * simAlpha;
      n.vy += (cy - n.y) * 0.012 * simAlpha;
    }

    // 速度阻尼
    n.vx *= 0.85;
    n.vy *= 0.85;

    n.x += n.vx;
    n.y += n.vy;
  }
}

/**
 * 時序演進譜系步進迭代 (Chronological Timeline Step)
 * 包含：年份分組 X 軸橫向等距標尺、縱向垂直置中排列與全域碰撞箱保護
 */
export function runTimelineStep(
  simNodes: SimNode[],
  width: number,
  height: number,
  simAlpha: number,
  draggingNodeId: string | null
): void {
  const w = width || 900;
  const h = height || 650;

  // 1. 提取所有不重複的出現年份並升冪排序 (Distinct Sorted Epochs)
  const distinctYears = Array.from(new Set(simNodes.map(n => n.year || 2017))).sort((a, b) => a - b);
  const numEpochs = distinctYears.length;

  // 每個年份縱列保證至少 230px 寬度，確保 150px 的標籤橫向絕不干擾重疊
  const minColumnWidth = 230;
  const totalIdealWidth = (numEpochs - 1) * minColumnWidth;
  const startX = Math.max(140, (w - totalIdealWidth) / 2);

  // 建立年份對應的 X 座標映射表
  const yearToXMap = new Map<number, number>();
  distinctYears.forEach((yr, idx) => {
    if (numEpochs <= 1) {
      yearToXMap.set(yr, w / 2);
    } else {
      const xPos = startX + idx * minColumnWidth;
      yearToXMap.set(yr, xPos);
    }
  });

  // 2. 依年份分組
  const yearGroups: Record<number, SimNode[]> = {};
  simNodes.forEach(n => {
    const y = n.year || 2017;
    if (!yearGroups[y]) yearGroups[y] = [];
    yearGroups[y].push(n);
  });

  // 3. 縱向 (Y 軸) 排列：同一年份多篇文獻給予至少 135px 充足高度間距
  for (const [yrStr, group] of Object.entries(yearGroups)) {
    const yr = Number(yrStr);
    const targetX = yearToXMap.get(yr) ?? w / 2;
    const count = group.length;
    const verticalGap = 135;
    const totalColHeight = (count - 1) * verticalGap;
    const startY = (h - totalColHeight) / 2;

    // 排序使核心主文置於中央偏好位置
    group.sort((a, b) => {
      if (a.category === 'core') return -1;
      if (b.category === 'core') return 1;
      return a.id.localeCompare(b.id);
    });

    group.forEach((node, idx) => {
      if (node.id === draggingNodeId) return;

      const targetY = startY + idx * verticalGap;

      // 平滑導向目標座標
      node.vx += (targetX - node.x) * 0.16 * simAlpha;
      node.vy += (targetY - node.y) * 0.16 * simAlpha;

      node.vx *= 0.78;
      node.vy *= 0.78;

      node.x += node.vx;
      node.y += node.vy;
    });
  }

  // 4. 全局防重疊碰撞箱保護 (Anti-Overlap Collision Box)
  // 依標籤寬度 160px、高度 95px 設定最小隔離包圍盒
  const minDx = 160;
  const minDy = 95;
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i];
      const b = simNodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;

      if (Math.abs(dx) < minDx && Math.abs(dy) < minDy) {
        const overlapX = minDx - Math.abs(dx);
        const overlapY = minDy - Math.abs(dy);
        const pushX = (dx >= 0 ? 1 : -1) * (overlapX * 0.12) * simAlpha;
        const pushY = (dy >= 0 ? 1 : -1) * (overlapY * 0.12) * simAlpha;

        if (a.id !== draggingNodeId) { a.x -= pushX; a.y -= pushY; }
        if (b.id !== draggingNodeId) { b.x += pushX; b.y += pushY; }
      }
    }
  }
}
