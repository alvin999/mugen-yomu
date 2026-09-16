<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import {
    getCitationGraphForPaper,
    type CitationNode,
    type CitationEdge,
    type CitationGraphData,
    type CitationCategory
  } from '../../services/citationService';
  import type { PaperDocument } from '../../stores/documentStore';
  import { currentTheme, getCurrentThemeMeta } from '../../stores/themeStore';

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher();

  // Layout & View States
  let layoutMode: 'galaxy' | 'timeline' = 'galaxy';
  let filterCategory: 'all' | CitationCategory = 'all';
  let searchQuery: string = '';
  let selectedNodeId: string | null = null;
  let hoveredNodeId: string | null = null;

  // Viewport Transform States (Zoom & Pan)
  let zoom: number = 1.0;
  let panX: number = 0;
  let panY: number = 0;
  let isPanning: boolean = false;
  let panStartX: number = 0;
  let panStartY: number = 0;

  // Dragging Node State
  let draggingNodeId: string | null = null;
  let dragOffset = { x: 0, y: 0 };

  // Container & Simulation Dimensions
  let containerWidth: number = 900;
  let containerHeight: number = 650;
  let containerElement: HTMLDivElement | null = null;

  // Working nodes with simulation properties
  interface SimNode extends CitationNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx?: number | null;
    fy?: number | null;
    radius: number;
  }

  interface SimEdge extends CitationEdge {
    sourceNode?: SimNode;
    targetNode?: SimNode;
  }

  let simNodes: SimNode[] = [];
  let simEdges: SimEdge[] = [];
  let animationFrameId: number | null = null;
  let simAlpha: number = 1.0;

  // 當 paper 變更時重置圖譜資料
  $: rawGraph = getCitationGraphForPaper(paper || {});
  $: initGraphData(rawGraph);

  // 選中的節點物件
  $: selectedNode = simNodes.find(n => n.id === selectedNodeId) || simNodes.find(n => n.category === 'core') || simNodes[0] || null;

  // 搜尋與類別篩選器過濾
  $: visibleNodes = simNodes.filter(n => {
    const matchesCat = filterCategory === 'all' || n.category === filterCategory;
    const matchesSearch = !searchQuery.trim() ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.authors.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  $: visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  $: visibleEdges = simEdges.filter(e => {
    const sId = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
    const tId = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
    return visibleNodeIds.has(sId) && visibleNodeIds.has(tId);
  });

  // 顏色與樣式對應表 (隨當前主題動態切換)
  $: themeMeta = getCurrentThemeMeta($currentTheme);
  $: graphColors = themeMeta.graphColors || {
    core: '#fe8019',
    foundational: '#b8bb26',
    derivative: '#83a598',
    methodological: '#d3869b'
  };

  $: categoryMeta = {
    core: {
      name: '核心研讀主文',
      color: graphColors.core,
      bgBadge: `color-mix(in srgb, ${graphColors.core} 15%, transparent)`,
      borderBadge: `color-mix(in srgb, ${graphColors.core} 40%, transparent)`
    },
    foundational: {
      name: '奠基前置理論',
      color: graphColors.foundational,
      bgBadge: `color-mix(in srgb, ${graphColors.foundational} 15%, transparent)`,
      borderBadge: `color-mix(in srgb, ${graphColors.foundational} 40%, transparent)`
    },
    derivative: {
      name: '後續衍生突破',
      color: graphColors.derivative,
      bgBadge: `color-mix(in srgb, ${graphColors.derivative} 15%, transparent)`,
      borderBadge: `color-mix(in srgb, ${graphColors.derivative} 40%, transparent)`
    },
    methodological: {
      name: '架構組件親緣',
      color: graphColors.methodological,
      bgBadge: `color-mix(in srgb, ${graphColors.methodological} 15%, transparent)`,
      borderBadge: `color-mix(in srgb, ${graphColors.methodological} 40%, transparent)`
    }
  } as Record<CitationCategory, { name: string; color: string; bgBadge: string; borderBadge: string }>;

  function initGraphData(graph: CitationGraphData) {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return;

    const w = containerWidth || 900;
    const h = containerHeight || 650;
    const cx = w / 2;
    const cy = h / 2;

    // 初始化節點位置與半徑
    simNodes = graph.nodes.map((n, i) => {
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
    const nodeMap = new Map(simNodes.map(n => [n.id, n]));
    simEdges = graph.edges.map(e => ({
      ...e,
      sourceNode: nodeMap.get(e.source),
      targetNode: nodeMap.get(e.target)
    }));

    // 預設選中核心節點
    const core = simNodes.find(n => n.category === 'core');
    if (core) selectedNodeId = core.id;

    // 重置縮放與位置
    zoom = 1.0;
    panX = 0;
    panY = 0;

    startSimulation();
  }

  // -------------------------------------------------------------
  // 力導向物理模擬 (Force Simulation Engine)
  // -------------------------------------------------------------
  function startSimulation() {
    simAlpha = 1.0;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function tick() {
      if (layoutMode === 'galaxy') {
        runGalaxyPhysicsStep();
      } else {
        runTimelineStep();
      }

      simAlpha *= 0.985; // 阻尼能量衰減
      simNodes = [...simNodes]; // 觸發 Svelte 響應更新

      if (simAlpha > 0.005 || draggingNodeId !== null) {
        animationFrameId = requestAnimationFrame(tick);
      } else {
        animationFrameId = null;
      }
    }

    animationFrameId = requestAnimationFrame(tick);
  }

  function runGalaxyPhysicsStep() {
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;

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

  function runTimelineStep() {
    const w = containerWidth || 900;
    const h = containerHeight || 650;

    // 1. 提取所有不重複的出現年份並升冪排序 (Distinct Sorted Epochs)
    const distinctYears = Array.from(new Set(simNodes.map(n => n.year || 2017))).sort((a, b) => a - b);
    const numEpochs = distinctYears.length;

    // 每個年份縱列保證至少 220px 寬度，確保 150px 的標籤橫向絕不干擾重疊
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

    // 3. 縱向 (Y 軸) 排列：同一年份多篇文獻給予至少 130px 充足高度間距
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

  // -------------------------------------------------------------
  // 滑鼠互動：拖曳、縮放與平移 (Pan & Zoom & Drag)
  // -------------------------------------------------------------
  function handleMouseDownSvg(e: MouseEvent) {
    // 凡是未在節點上被攔截的點擊，皆視為背景平移（包含點擊網格 rect、連線或空白處）
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
    } else if (draggingNodeId) {
      const node = simNodes.find(n => n.id === draggingNodeId);
      if (node && containerElement) {
        const rect = containerElement.getBoundingClientRect();
        // 考量當前 zoom 與 pan 偏移量計算節點的世界座標
        const mouseWorldX = (e.clientX - rect.left - panX) / zoom;
        const mouseWorldY = (e.clientY - rect.top - panY) / zoom;
        node.x = mouseWorldX - dragOffset.x;
        node.y = mouseWorldY - dragOffset.y;
        node.vx = 0;
        node.vy = 0;
        simAlpha = 0.4; // 持續激發模擬
        if (!animationFrameId) startSimulation();
      }
    }
  }

  function handleMouseUp() {
    isPanning = false;
    draggingNodeId = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(2.5, Math.max(0.4, zoom * zoomFactor));

    if (containerElement) {
      const rect = containerElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // 以滑鼠指針為中心進行等比縮放
      panX = mouseX - (mouseX - panX) * (newZoom / zoom);
      panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    }
    zoom = newZoom;
  }

  function startDragNode(node: SimNode, e: MouseEvent) {
    e.stopPropagation();
    selectedNodeId = node.id;
    draggingNodeId = node.id;

    if (containerElement) {
      const rect = containerElement.getBoundingClientRect();
      const mouseWorldX = (e.clientX - rect.left - panX) / zoom;
      const mouseWorldY = (e.clientY - rect.top - panY) / zoom;
      dragOffset = {
        x: mouseWorldX - node.x,
        y: mouseWorldY - node.y
      };
    }
    simAlpha = 0.6;
    if (!animationFrameId) startSimulation();
  }

  function resetViewport() {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    startSimulation();
  }

  function switchLayout(mode: 'galaxy' | 'timeline') {
    layoutMode = mode;
    panX = 0;
    panY = 0;
    zoom = mode === 'timeline' ? 0.85 : 1.0;
    startSimulation();
  }

  // 關聯高亮判斷 (Focus Lens Graph Effect)
  function isNodeConnected(nodeId: string): boolean {
    if (!hoveredNodeId) return true;
    if (nodeId === hoveredNodeId) return true;
    return simEdges.some(e => {
      const sId = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
      const tId = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
      return (sId === hoveredNodeId && tId === nodeId) || (tId === hoveredNodeId && sId === nodeId);
    });
  }

  function isEdgeConnected(edge: SimEdge): boolean {
    if (!hoveredNodeId) return true;
    const sId = typeof edge.source === 'string' ? edge.source : (edge.source as any)?.id;
    const tId = typeof edge.target === 'string' ? edge.target : (edge.target as any)?.id;
    return sId === hoveredNodeId || tId === hoveredNodeId;
  }

  function handleLoadTargetPaper(paperId?: string) {
    if (!paperId) return;
    dispatch('loadPaper', { paperId });
  }

  onMount(() => {
    if (containerElement) {
      containerWidth = containerElement.clientWidth || 900;
      containerHeight = containerElement.clientHeight || 650;
      initGraphData(rawGraph);
    }
  });

  onDestroy(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="w-full h-full flex flex-col bg-[#141617] select-none overflow-hidden relative"
  bind:this={containerElement}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  role="region"
  aria-label="引用文獻關聯圖譜互動視圖"
>
  <!-- ==================== TOP CONTROL TOOLBAR ==================== -->
  <header class="h-14 bg-[#1d2021]/95 backdrop-blur-sm border-b border-[#3c3836] px-4 flex items-center justify-between z-30 shrink-0 shadow-md">
    <!-- Left: Navigation Back & Title Badge -->
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#282828] hover:bg-[#32302f] text-[#ebdbb2] border border-[#3c3836] hover:border-[#fe8019] text-xs font-medium transition-colors shadow-sm cursor-pointer"
        on:click={() => dispatch('backToWorkspace')}
        title="返回閱讀工作台 (Alt + ←)"
      >
        <span class="material-symbols-outlined text-[16px] text-[#fe8019]">arrow_back</span>
        <span>返回雙語研讀</span>
      </button>

      <div class="h-4 w-px bg-[#3c3836]"></div>

      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
          <span class="material-symbols-outlined text-[15px]">hub</span>
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <h2 class="text-xs font-bold text-[#ebdbb2] tracking-wide font-mono">
              Citation Topology & Intellectual Lineage
            </h2>
            <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.2 rounded">
              {visibleNodes.length} 篇關聯文獻 · {visibleEdges.length} 條引證傳承
            </span>
          </div>
          <span class="text-[10px] text-[#a89984] truncate max-w-md">
            當前研讀標的：{paper?.title || 'Attention Is All You Need'}
          </span>
        </div>
      </div>
    </div>

    <!-- Center: Layout Switcher & Category Filter -->
    <div class="flex items-center gap-2">
      <!-- Layout Toggle: Galaxy vs. Timeline -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] p-0.5 rounded-lg">
        <button
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors {layoutMode === 'galaxy' ? 'bg-[#3c3836] text-[#fe8019] font-bold shadow-inner' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => switchLayout('galaxy')}
          title="力導向星系圖：以核心論文為引力中心放射展開"
        >
          <span class="material-symbols-outlined text-[14px]">bubble_chart</span>
          <span>星系拓撲</span>
        </button>
        <button
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors {layoutMode === 'timeline' ? 'bg-[#3c3836] text-[#fe8019] font-bold shadow-inner' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => switchLayout('timeline')}
          title="時序演進譜系：依年代水平均勻展開學術傳承鏈"
        >
          <span class="material-symbols-outlined text-[14px]">timeline</span>
          <span>演進譜系</span>
        </button>
      </div>

      <!-- Category Filter Chips -->
      <div class="flex items-center gap-1">
        <button
          class="px-2 py-1 rounded font-mono text-[11px] transition-colors {filterCategory === 'all' ? 'bg-[#fe8019]/20 text-[#fe8019] border border-[#fe8019]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
          on:click={() => filterCategory = 'all'}
        >
          全部
        </button>
        <button
          class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 {filterCategory === 'foundational' ? 'bg-[#b8bb26]/20 text-[#b8bb26] border border-[#b8bb26]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
          on:click={() => filterCategory = 'foundational'}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#b8bb26]"></span>
          奠基基石
        </button>
        <button
          class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 {filterCategory === 'derivative' ? 'bg-[#83a598]/20 text-[#83a598] border border-[#83a598]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
          on:click={() => filterCategory = 'derivative'}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#83a598]"></span>
          衍生突破
        </button>
        <button
          class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 {filterCategory === 'methodological' ? 'bg-[#d3869b]/20 text-[#d3869b] border border-[#d3869b]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
          on:click={() => filterCategory = 'methodological'}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#d3869b]"></span>
          方法親緣
        </button>
      </div>
    </div>

    <!-- Right: Search Input & Zoom Controls -->
    <div class="flex items-center gap-2">
      <div class="relative">
        <span class="material-symbols-outlined absolute left-2 top-1.5 text-[15px] text-[#a89984]">search</span>
        <input
          class="w-36 focus:w-48 bg-[#282828] border border-[#3c3836] text-[#ebdbb2] pl-7 pr-2 py-1 rounded-lg text-xs font-mono focus:outline-none focus:border-[#fe8019] placeholder:text-[#a89984]/50 transition-all"
          type="text"
          placeholder="搜尋作者或標題..."
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button
            class="absolute right-1.5 top-1.5 text-[#a89984] hover:text-[#ebdbb2]"
            on:click={() => searchQuery = ''}
          >
            <span class="material-symbols-outlined text-[13px]">close</span>
          </button>
        {/if}
      </div>

      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg text-xs font-mono">
        <button
          class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-l transition-colors"
          on:click={() => zoom = Math.max(0.4, zoom - 0.15)}
          title="縮小"
        >
          -
        </button>
        <span class="px-2 py-1 text-[#fabd2f] font-semibold">{Math.round(zoom * 100)}%</span>
        <button
          class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          on:click={() => zoom = Math.min(2.5, zoom + 0.15)}
          title="放大"
        >
          +
        </button>
        <button
          class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-r border-l border-[#3c3836] transition-colors"
          on:click={resetViewport}
          title="重設視角與置中"
        >
          <span class="material-symbols-outlined text-[13px] mt-0.5">center_focus_strong</span>
        </button>
      </div>
    </div>
  </header>

  <!-- ==================== MAIN SVG CANVAS & DOSSIER SPLIT ==================== -->
  <div class="flex-1 relative overflow-hidden flex">
    
    <!-- SVG Interactive Graph Area -->
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
    <svg
      id="graph-bg"
      class="flex-1 w-full h-full cursor-grab active:cursor-grabbing {isPanning ? 'cursor-grabbing' : ''}"
      on:mousedown={handleMouseDownSvg}
      on:wheel={handleWheel}
      role="application"
      aria-label="引文關聯圖譜畫布"
    >
      <!-- Defs: Arrow Markers & Glow Filters -->
      <defs>
        <!-- Background Dot Grid Pattern -->
        <pattern id="gruvbox-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#32302f" opacity="0.8" />
        </pattern>

        <!-- Arrow Markers -->
        <marker id="arrow-default" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#504945" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#fe8019" />
        </marker>
        <marker id="arrow-foundation" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#b8bb26" />
        </marker>
        <marker id="arrow-derivative" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#83a598" />
        </marker>

        <!-- Node Glow Filters -->
        <filter id="glow-core" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="glow-selected" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Background Grid (點擊與拖曳平移) -->
      <rect
        width="100%"
        height="100%"
        fill="url(#gruvbox-grid)"
        class="cursor-grab active:cursor-grabbing {isPanning ? 'cursor-grabbing' : ''}"
      />

      <!-- Transformed World Space (Scale & Translate) -->
      <g transform="translate({panX}, {panY}) scale({zoom})">

        <!-- 1. Citation Edges (Lines & Curved Arcs) -->
        <g class="edges-layer">
          {#each visibleEdges as edge}
            {@const s = edge.sourceNode}
            {@const t = edge.targetNode}
            {#if s && t}
              {@const isConnected = isEdgeConnected(edge)}
              {@const isHoveredEdge = hoveredNodeId && (s.id === hoveredNodeId || t.id === hoveredNodeId)}
              {@const strokeColor = isHoveredEdge ? '#fe8019' : (edge.relationType === 'builds-on' ? '#b8bb26' : (edge.relationType === 'influences' ? '#83a598' : '#504945'))}
              {@const markerId = isHoveredEdge ? 'arrow-active' : (edge.relationType === 'builds-on' ? 'arrow-foundation' : (edge.relationType === 'influences' ? 'arrow-derivative' : 'arrow-default'))}
              {@const midX = (s.x + t.x) / 2}
              {@const midY = (s.y + t.y) / 2}

              <!-- Connecting Line -->
              <line
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={strokeColor}
                stroke-width={isHoveredEdge ? 2.5 : 1.5}
                stroke-dasharray={edge.relationType === 'architectural-cousin' ? '4,4' : 'none'}
                opacity={isConnected ? 0.85 : 0.12}
                marker-end="url(#{markerId})"
                class="transition-all duration-300"
              />

              <!-- Edge Relationship Badge (Visible when hovered or zoomed in) -->
              {#if edge.label && (zoom >= 1.25 || isHoveredEdge)}
                <g transform="translate({midX}, {midY})" opacity={isConnected ? 0.95 : 0.08} class="pointer-events-none transition-opacity">
                  <rect
                    x="-45"
                    y="-9"
                    width="90"
                    height="17"
                    rx="4"
                    fill="#1d2021"
                    stroke={strokeColor}
                    stroke-width="1"
                    opacity="0.9"
                  />
                  <text
                    x="0"
                    y="3"
                    text-anchor="middle"
                    fill="#ebdbb2"
                    font-size="9"
                    font-family="var(--font-mono)"
                    font-weight="500"
                  >
                    {edge.label}
                  </text>
                </g>
              {/if}
            {/if}
          {/each}
        </g>

        <!-- 2. Citation Nodes -->
        <g class="nodes-layer">
          {#each visibleNodes as node}
            {@const isSelected = selectedNodeId === node.id}
            {@const isHovered = hoveredNodeId === node.id}
            {@const isConnected = isNodeConnected(node.id)}
            {@const meta = categoryMeta[node.category]}
            {@const isCore = node.category === 'core'}

            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <g
              transform="translate({node.x}, {node.y})"
              class="cursor-pointer transition-opacity duration-200"
              opacity={isConnected ? 1 : 0.2}
              on:mousedown={(e) => startDragNode(node, e)}
              on:mouseenter={() => hoveredNodeId = node.id}
              on:mouseleave={() => hoveredNodeId = null}
              on:click={() => selectedNodeId = node.id}
            >
              <!-- Selected Aura Pulse -->
              {#if isSelected}
                <circle
                  r={node.radius + 12}
                  fill="none"
                  stroke="#fabd2f"
                  stroke-width="2"
                  stroke-dasharray="4,3"
                  opacity="0.75"
                  class="animate-spin"
                  style="animation-duration: 20s;"
                />
              {/if}

              <!-- Core Node Breathing Glow -->
              {#if isCore}
                <circle
                  r={node.radius + 8}
                  fill="#fe8019"
                  opacity="0.25"
                  filter="url(#glow-core)"
                />
              {/if}

              <!-- Node Body Circle -->
              <circle
                r={node.radius}
                fill={isCore ? '#fe8019' : (isSelected ? '#32302f' : '#282828')}
                stroke={meta.color}
                stroke-width={isSelected ? 3 : (isCore ? 2.5 : 2)}
                filter={isSelected ? 'url(#glow-selected)' : (isCore ? 'url(#glow-core)' : 'none')}
                class="transition-all duration-200 hover:scale-105"
              />

              <!-- Node Inner Icon or Monogram -->
              {#if isCore}
                <text
                  text-anchor="middle"
                  dy="5"
                  fill="#141617"
                  font-size="16"
                  font-weight="900"
                  font-family="var(--font-mono)"
                >
                  ★
                </text>
              {:else}
                <text
                  text-anchor="middle"
                  dy="4"
                  fill={meta.color}
                  font-size="11"
                  font-weight="700"
                  font-family="var(--font-mono)"
                >
                  {node.year}
                </text>
              {/if}

              <!-- Node Label Below (Title & Author) -->
              <g transform="translate(0, {node.radius + 14})">
                <rect
                  x="-75"
                  y="-8"
                  width="150"
                  height="26"
                  rx="4"
                  fill="#1d2021"
                  stroke={isSelected ? meta.color : '#3c3836'}
                  stroke-width={isSelected ? 1.5 : 1}
                  opacity="0.95"
                />
                <text
                  text-anchor="middle"
                  y="2"
                  fill="#ebdbb2"
                  font-size="10"
                  font-weight="bold"
                  font-family="var(--font-sans)"
                >
                  {node.title.length > 20 ? node.title.slice(0, 19) + '…' : node.title}
                </text>
                <text
                  text-anchor="middle"
                  y="12"
                  fill="#a89984"
                  font-size="8"
                  font-family="var(--font-mono)"
                >
                  {node.authors[0] || 'Unknown'} · {node.citations || 'Cited'}
                </text>
              </g>
            </g>
          {/each}
        </g>

      </g>
    </svg>

    <!-- Floating Interaction Guide Capsule -->
    <div class="absolute left-4 bottom-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1d2021]/90 backdrop-blur-md border border-[#3c3836] text-[11px] font-mono text-[#a89984] shadow-lg pointer-events-none select-none">
      <span class="material-symbols-outlined text-[15px] text-[#fe8019]">touch_app</span>
      <span class="text-[#ebdbb2] font-medium">按住空白處拖曳平移</span>
      <span class="text-[#504945]">·</span>
      <span>拖曳節點自訂佈局</span>
      <span class="text-[#504945]">·</span>
      <span>滾輪縮放視野</span>
    </div>

    <!-- ==================== RIGHT SCHOLAR CITATION DOSSIER ==================== -->
    {#if selectedNode}
      {@const meta = categoryMeta[selectedNode.category]}
      <aside class="w-96 bg-[#1d2021] border-l border-[#3c3836] flex flex-col h-full z-20 shadow-2xl overflow-y-auto animate-fade-in shrink-0">
        <!-- Dossier Header -->
        <div class="p-4 border-b border-[#3c3836] bg-[#141617]/60 flex items-start justify-between">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span
                class="font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
                style="background: {meta.bgBadge}; color: {meta.color}; border: 1px solid {meta.borderBadge};"
              >
                {meta.name}
              </span>
              <span class="font-mono text-[11px] text-[#fabd2f] font-semibold">
                {selectedNode.year}
              </span>
            </div>
            <h3 class="text-sm font-serif font-bold text-[#ebdbb2] leading-snug pt-1">
              {selectedNode.title}
            </h3>
          </div>
          <button
            class="text-[#a89984] hover:text-[#ebdbb2] p-1 rounded hover:bg-[#282828] transition-colors"
            on:click={() => selectedNodeId = null}
            title="收合卷宗"
          >
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <!-- Dossier Content Body -->
        <div class="p-4 flex flex-col gap-4 text-xs">

          <!-- Authors & Venue Card -->
          <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-xl flex flex-col gap-2 shadow-inner">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-[#a89984] font-mono">發表場域 / 會議</span>
              <span class="text-[#fabd2f] font-mono font-medium">{selectedNode.venue}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[#a89984] font-mono text-[10px]">作者群 (Authors)</span>
              <span class="text-[#d5c4a1] leading-relaxed">
                {selectedNode.authors.join(', ')}
              </span>
            </div>
            {#if selectedNode.citations}
              <div class="pt-2 border-t border-[#3c3836] flex items-center justify-between">
                <span class="text-[#a89984] font-mono text-[10px]">總引用數 (Citations)</span>
                <span class="text-[#8ec07c] font-mono font-bold bg-[#8ec07c]/10 px-2 py-0.5 rounded border border-[#8ec07c]/30">
                  {selectedNode.citations}
                </span>
              </div>
            {/if}
          </div>

          <!-- Highlight: Lineage & Intellectual Heritage Connection -->
          <div class="bg-[#282828] border-l-4 p-3.5 rounded-r-xl flex flex-col gap-1.5 shadow-md" style="border-left-color: {meta.color};">
            <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold" style="color: {meta.color};">
              <span class="material-symbols-outlined text-[16px]">account_tree</span>
              <span>與研讀主文之學術承接關係</span>
            </div>
            <p class="text-[#ebdbb2] leading-relaxed text-[12px] bg-[#1d2021]/80 p-2.5 rounded-lg border border-[#3c3836]">
              {selectedNode.connectionSnippet}
            </p>
          </div>

          <!-- Core Insight & Breakthrough -->
          {#if selectedNode.coreInsight}
            <div class="flex flex-col gap-1.5">
              <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">lightbulb</span>
                核心理論突破與貢獻 (Core Insight)
              </span>
              <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-lg text-[#d5c4a1] leading-relaxed text-[11px]">
                {selectedNode.coreInsight}
              </div>
            </div>
          {/if}

          <!-- External Academic Links (arXiv / DOI) -->
          <div class="flex items-center gap-2 pt-1">
            {#if selectedNode.arxivId}
              <a
                href="https://arxiv.org/abs/{selectedNode.arxivId.replace(/^arxiv:/i, '')}"
                target="_blank"
                rel="noreferrer"
                class="flex-1 py-2 px-3 rounded-lg bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
              >
                <span class="material-symbols-outlined text-[14px] text-[#fe8019]">open_in_new</span>
                <span>arXiv:{selectedNode.arxivId}</span>
              </a>
            {/if}

            {#if selectedNode.doi}
              <a
                href="https://doi.org/{selectedNode.doi}"
                target="_blank"
                rel="noreferrer"
                class="flex-1 py-2 px-3 rounded-lg bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#8ec07c] text-[#ebdbb2] text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
              >
                <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">link</span>
                <span>DOI 官方索引</span>
              </a>
            {/if}
          </div>

          <!-- Action: One-Click Load Into Reading Workspace -->
          {#if selectedNode.targetPaperId}
            <button
              class="mt-2 w-full py-2.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#141617] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer text-xs"
              on:click={() => handleLoadTargetPaper(selectedNode.targetPaperId)}
            >
              <span class="material-symbols-outlined text-[17px]">auto_stories</span>
              <span>載入此論文並進入雙語伴讀</span>
            </button>
          {/if}

        </div>

        <!-- Dossier Footer Note -->
        <div class="mt-auto p-3 border-t border-[#3c3836] bg-[#141617]/50 text-center text-[#a89984] font-mono text-[10px]">
          MUGEN YOMU Scholar Citation Graph · BETA
        </div>
      </aside>
    {/if}

  </div>
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.25s ease-out forwards;
  }
</style>
