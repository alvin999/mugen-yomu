<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import {
    getCitationGraphForPaper,
    isPresetCitationPaper,
    hasCustomCitationGraph,
    type CitationGraphData,
    type CitationCategory
  } from '../../services/citationService';
  import {
    analyzePaperCitationsWithCache,
    type CitationAnalysisStatus
  } from '../../services/citationAnalysisService';
  import type { PaperDocument } from '../../stores/documentStore';
  import { currentTheme, getCurrentThemeMeta } from '../../stores/themeStore';
  import {
    initSimulationNodes,
    runGalaxyPhysicsStep,
    runTimelineStep,
    type SimNode,
    type SimEdge
  } from '../../services/citation/citationPhysicsEngine';
  import CitationGraphControls from './CitationGraphControls.svelte';
  import CitationDetailPanel from './CitationDetailPanel.svelte';

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher<{
    backToWorkspace: void;
    updateCitationGraph: { paperId: string; citationGraph: CitationGraphData };
    loadPaper: { paperId: string };
  }>();

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

  let simNodes: SimNode[] = [];
  let simEdges: SimEdge[] = [];
  let animationFrameId: number | null = null;
  let simAlpha: number = 1.0;

  // 動態引文分析狀態
  let isAnalyzing: boolean = false;
  let analysisStatus: CitationAnalysisStatus | null = null;
  let analysisError: string | null = null;
  let dismissedBanner: boolean = false;

  $: isPreset = isPresetCitationPaper(paper || {});
  $: isAnalyzed = hasCustomCitationGraph(paper || {});
  $: showUnanalyzedBanner = Boolean(paper && !isPreset && !isAnalyzed && !isAnalyzing && !dismissedBanner);

  // 當 paper 變更時重置圖譜資料
  $: rawGraph = getCitationGraphForPaper(paper || {});
  $: initGraphData(rawGraph);

  async function handleStartAnalysis(forceRefresh: boolean = false) {
    if (!paper || isAnalyzing) return;
    isAnalyzing = true;
    analysisError = null;
    dismissedBanner = true;

    try {
      const newGraph = await analyzePaperCitationsWithCache(
        paper,
        (status) => {
          analysisStatus = status;
        },
        forceRefresh
      );

      paper.citationGraph = newGraph;
      initGraphData(newGraph);

      dispatch('updateCitationGraph', {
        paperId: paper.id,
        citationGraph: newGraph
      });
    } catch (err: any) {
      console.error('動態引文拓撲分析失敗:', err);
      analysisError = err?.message || '引文分析遭遇異常，請檢查網路連線或 API 金鑰設定';
    } finally {
      isAnalyzing = false;
    }
  }

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

    const result = initSimulationNodes(graph, w, h);
    simNodes = result.simNodes;
    simEdges = result.simEdges;
    if (result.initialSelectedNodeId) {
      selectedNodeId = result.initialSelectedNodeId;
    }

    // 重置縮放與位置
    zoom = 1.0;
    panX = 0;
    panY = 0;

    startSimulation();
  }

  // -------------------------------------------------------------
  // 力導向物理模擬迴圈 (Force Simulation Loop)
  // -------------------------------------------------------------
  function startSimulation() {
    simAlpha = 1.0;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function tick() {
      if (layoutMode === 'galaxy') {
        runGalaxyPhysicsStep(simNodes, simEdges, containerWidth, containerHeight, simAlpha, draggingNodeId);
      } else {
        runTimelineStep(simNodes, containerWidth, containerHeight, simAlpha, draggingNodeId);
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

  function handleLoadTargetPaper(event: CustomEvent<{ paperId: string }>) {
    dispatch('loadPaper', { paperId: event.detail.paperId });
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
  <CitationGraphControls
    paperTitle={paper?.title || 'Attention Is All You Need'}
    visibleNodesCount={visibleNodes.length}
    visibleEdgesCount={visibleEdges.length}
    bind:layoutMode
    bind:filterCategory
    bind:searchQuery
    {zoom}
    {isAnalyzing}
    {isAnalyzed}
    {analysisStatus}
    on:backToWorkspace={() => dispatch('backToWorkspace')}
    on:switchLayout={(e) => switchLayout(e.detail)}
    on:startAnalysis={(e) => handleStartAnalysis(e.detail.forceRefresh)}
    on:zoomIn={() => zoom = Math.min(2.5, zoom + 0.15)}
    on:zoomOut={() => zoom = Math.max(0.4, zoom - 0.15)}
    on:resetViewport={resetViewport}
  />

  <!-- ==================== MAIN SVG CANVAS & DOSSIER SPLIT ==================== -->
  <div class="flex-1 relative overflow-hidden flex">

    <!-- Unanalyzed Paper Guidance Hero Banner -->
    {#if showUnanalyzedBanner}
      <div class="absolute inset-x-0 top-5 z-20 flex justify-center pointer-events-none px-4">
        <div class="pointer-events-auto max-w-xl bg-[#1d2021]/95 backdrop-blur-md border border-[#fe8019]/40 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 animate-fade-in">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#fe8019]/20 border border-[#fe8019]/60 flex items-center justify-center text-[#fe8019] shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[20px]">hub</span>
              </div>
              <div class="flex flex-col">
                <h4 class="text-xs font-bold text-[#ebdbb2] font-mono leading-snug">
                  ✦ 探索《{paper?.title || '此篇文獻'}》真實學術星系圖譜
                </h4>
                <p class="text-[11px] text-[#a89984] leading-relaxed mt-1">
                  當前畫面為初始備援結構。啟動動態分析後，系統將自動向 <span class="text-[#fabd2f] font-semibold">OpenAlex 學術庫</span> 檢索前置文獻與引用數據，並由 <span class="text-[#fe8019] font-semibold">AI 伴讀引擎</span> 為您精準剖析各篇論文的理論承接關係與核心突破。
                </p>
              </div>
            </div>
            <button
              class="text-[#a89984] hover:text-[#ebdbb2] p-1 rounded hover:bg-[#282828] transition-colors shrink-0"
              on:click={() => dismissedBanner = true}
              title="關閉提示"
            >
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#3c3836]">
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-mono text-[#a89984] hover:text-[#ebdbb2] transition-colors"
              on:click={() => dismissedBanner = true}
            >
              暫以預設備援瀏覽
            </button>
            <button
              class="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#fe8019] hover:bg-[#d65d0e] text-[#141617] text-xs font-bold font-mono transition-all shadow-md hover:shadow-lg cursor-pointer"
              on:click={() => handleStartAnalysis(false)}
            >
              <span class="material-symbols-outlined text-[15px]">psychology</span>
              <span>⚡ 立即啟動 AI 深度引文分析</span>
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Dynamic Analysis Loading Floating HUD -->
    {#if isAnalyzing}
      <div class="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#1d2021]/95 backdrop-blur-md border border-[#fabd2f]/60 shadow-2xl text-xs font-mono text-[#ebdbb2] animate-fade-in">
        <div class="w-5 h-5 border-2 border-[#fabd2f] border-t-transparent rounded-full animate-spin shrink-0"></div>
        <div class="flex flex-col">
          <span class="font-bold text-[#fabd2f] text-xs">{analysisStatus?.message || '正在進行學術引文拓撲分析...'}</span>
          {#if analysisStatus?.details}
            <span class="text-[10px] text-[#a89984] mt-0.5">{analysisStatus.details}</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Analysis Error Banner -->
    {#if analysisError}
      <div class="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#282828] border border-[#cc241d] text-xs text-[#ebdbb2] shadow-2xl animate-fade-in">
        <span class="material-symbols-outlined text-[17px] text-[#fb4934]">error</span>
        <span class="text-[11px] font-mono">{analysisError}</span>
        <button class="ml-2 px-2 py-0.5 rounded bg-[#3c3836] text-[10px] text-[#ebdbb2] hover:bg-[#504945]" on:click={() => analysisError = null}>關閉</button>
      </div>
    {/if}
    
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
    <CitationDetailPanel
      {selectedNode}
      {categoryMeta}
      on:close={() => selectedNodeId = null}
      on:loadPaper={handleLoadTargetPaper}
    />

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
