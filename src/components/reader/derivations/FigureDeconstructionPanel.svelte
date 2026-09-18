<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, FigureItem } from '../../../types/document';
  import type { FigureDeconstructionData } from '../../../types/derivation';
  import type { ExtractedFigureItem } from '../../../utils/derivationExtractor';
  import { renderMath } from '../../../utils/katexUtils';
  import { normalizeAcademicImageUrl } from '../../../utils/academicImageUtils';
  import { getDomainAdaptedFigurePipeline } from '../../../services/derivationService';

  export let paper: PaperDocument | null = null;
  export let dynamicFigures: ExtractedFigureItem[] = [];
  export let selectedFigureIndex: number = 0;
  export let activeFigureTab: 'fig1' | 'fig2' = 'fig1';
  export let currentFigureDeconstruction: FigureDeconstructionData | null = null;
  export let isAnalyzingFigure: boolean = false;
  export let isScanningHeuristically: boolean = false;

  const dispatch = createEventDispatcher<{
    selectFigure: { index: number };
    selectFallbackTab: { tab: 'fig1' | 'fig2' };
    analyzeFigure: { figure: FigureItem };
    heuristicScan: void;
    captureToNotes: void;
    openLightbox: { url: string; title: string };
    jumpToSection: { sectionId: string };
    switchRightMode: { mode: 'derivation' | 'scratchpad' };
  }>();

  let figureZoom: number = 100;
  let brokenImageUrls: Record<string, boolean> = {};
  let figureCanvasViewMode: 'auto' | 'topology' | 'image' = 'auto';

  $: activeItem = dynamicFigures[selectedFigureIndex];
  $: rawImg = activeItem?.figure?.imageUrl?.trim() || '';
  $: isBroken = Boolean(rawImg && brokenImageUrls[rawImg]);
  $: hasImg = Boolean(rawImg && !isBroken);
  $: showTopology = figureCanvasViewMode === 'topology' || (!hasImg && figureCanvasViewMode !== 'image');

  $: isML = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '');
  $: adaptedTopology = getDomainAdaptedFigurePipeline(paper?.title || '', activeItem?.figure?.name || '');

  $: topologySteps = (() => {
    const rawSteps = currentFigureDeconstruction?.dataFlowSteps && currentFigureDeconstruction.dataFlowSteps.length > 0
      ? currentFigureDeconstruction.dataFlowSteps.slice(0, 3)
      : adaptedTopology.dataFlowSteps;
    return rawSteps.map((s, idx) => {
      if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
        return adaptedTopology.dataFlowSteps[idx] || s;
      }
      return s;
    });
  })();

  $: displaySteps = (() => {
    if (!currentFigureDeconstruction) return [];
    const adapted = getDomainAdaptedFigurePipeline(paper?.title || '', currentFigureDeconstruction.name);
    return currentFigureDeconstruction.dataFlowSteps.map((s, idx) => {
      if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
        return adapted.dataFlowSteps[idx] || s;
      }
      return s;
    });
  })();
</script>

<div class="h-full flex flex-col bg-[#1d2021]/70 overflow-hidden">
  <!-- Dynamic Tabs for Document Figures -->
  {#if dynamicFigures.length > 0}
    <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
      <div class="flex items-center gap-1.5 overflow-x-auto max-w-[70%]">
        {#each dynamicFigures as item, idx}
          <button
            class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {selectedFigureIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => {
              dispatch('selectFigure', { index: idx });
              figureZoom = 100;
            }}
          >
            <span class="material-symbols-outlined text-[13px]">image</span>
            <span>{item.figure.figureNumber || `圖表 ${idx + 1}`}</span>
          </button>
        {/each}
      </div>

      <!-- Figure Zoom Controls -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-xs font-mono"
          on:click={() => figureZoom = Math.max(50, figureZoom - 20)}
          title="縮小圖片"
        >
          -
        </button>
        <span class="font-mono text-[10px] text-[#a89984] w-9 text-center">{figureZoom}%</span>
        <button
          class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-xs font-mono"
          on:click={() => figureZoom = Math.min(250, figureZoom + 20)}
          title="放大圖片"
        >
          +
        </button>
        <button
          class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#fe8019] text-xs"
          on:click={() => figureZoom = 100}
          title="重設縮放 (100%)"
        >
          <span class="material-symbols-outlined text-[13px]">restart_alt</span>
        </button>
      </div>
    </div>
  {:else}
    <!-- Fallback Tabs for Attention Paper SVGs with PREVIEW badge -->
    <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
      <div class="flex items-center gap-2">
        <span class="font-mono text-[10px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded font-bold">
          PREVIEW
        </span>
        <button
          class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => dispatch('selectFallbackTab', { tab: 'fig1' })}
        >
          <span class="material-symbols-outlined text-[14px]">account_tree</span>
          <span>Fig 1: Transformer 全景拓撲</span>
        </button>
        <button
          class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => dispatch('selectFallbackTab', { tab: 'fig2' })}
        >
          <span class="material-symbols-outlined text-[14px]">device_hub</span>
          <span>Fig 2: 點積注意力電路</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Left Figure Content & Deconstruction Cards -->
  <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
    {#if dynamicFigures.length === 0}
      <!-- Preview Banner for Figures -->
      <div class="bg-[#fabd2f]/10 border border-[#fabd2f]/40 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 text-[#fabd2f]">
          <span class="material-symbols-outlined text-[18px]">info</span>
          <div class="flex flex-col">
            <span class="font-bold">範例預覽 (Preview Mode)</span>
            <span class="text-[11px] text-[#d5c4a1]">當前論文尚未萃取出專屬圖表，此處為展示模板。點擊右側以程式初篩提煉。</span>
          </div>
        </div>
        <button
          class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shrink-0 transition-colors shadow-sm"
          on:click={() => dispatch('heuristicScan')}
          disabled={isScanningHeuristically}
        >
          {#if isScanningHeuristically}
            <span class="inline-block w-2.5 h-2.5 border-2 border-[#1d2021] border-t-transparent rounded-full animate-spin"></span>
            <span>提煉中...</span>
          {:else}
            <span class="material-symbols-outlined text-[13px]">auto_fix_high</span>
            <span>程式初篩 + 提煉圖表</span>
          {/if}
        </button>
      </div>
    {/if}

    <!-- Image & Topology Render Canvas -->
    {#if dynamicFigures.length > 0 && activeItem}
      <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[280px]">
              {activeItem.figure.figureNumber ? `${activeItem.figure.figureNumber}: ` : ''}{activeItem.figure.name}
            </span>
            {#if showTopology}
              <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1.5 py-0.5 rounded font-semibold shrink-0">
                系統資料流拓撲
              </span>
            {:else}
              <span class="font-mono text-[9px] bg-[#8ec07c]/15 border border-[#8ec07c]/40 text-[#8ec07c] px-1.5 py-0.5 rounded font-semibold shrink-0">
                論文原圖視圖
              </span>
            {/if}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <!-- 視圖模式切換按鈕 -->
            {#if hasImg}
              <div class="flex items-center bg-[#1d2021] border border-[#3c3836] rounded p-0.5 text-[10px] font-mono">
                <button
                  class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode !== 'topology' ? 'bg-[#3c3836] text-[#fabd2f] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                  on:click={() => figureCanvasViewMode = 'image'}
                  title="顯示論文原始圖片"
                >
                  原圖
                </button>
                <button
                  class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode === 'topology' ? 'bg-[#3c3836] text-[#fe8019] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                  on:click={() => figureCanvasViewMode = 'topology'}
                  title="切換為資料流拓撲向量視圖"
                >
                  拓撲
                </button>
              </div>
            {/if}

            {#if !showTopology && hasImg}
              <button
                class="font-mono text-[10px] bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] text-[#ebdbb2] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                on:click={() => dispatch('openLightbox', { url: normalizeAcademicImageUrl(rawImg), title: activeItem.figure.name })}
              >
                <span class="material-symbols-outlined text-[12px]">fullscreen</span>
                <span>全螢幕</span>
              </button>
            {/if}

            {#if activeItem.sectionId}
              <button
                class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                on:click={() => dispatch('jumpToSection', { sectionId: activeItem.sectionId || '' })}
              >
                <span>跳轉章節</span>
                <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- Canvas Area: 圖片或互動式 SVG 資料流拓撲圖 -->
        {#if showTopology}
          <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex flex-col items-center justify-center min-h-[280px] max-h-[440px] overflow-auto relative select-none">
            <!-- 頂部拓撲說明列 -->
            <div class="w-full flex items-center justify-between pb-2 mb-2 border-b border-[#282828] text-xs font-mono">
              <div class="flex items-center gap-1.5 text-[#fe8019]">
                <span class="material-symbols-outlined text-[15px]">account_tree</span>
                <span class="font-bold text-[11px]">方法論資料流拓撲管線 (Data Flow Architecture Pipeline)</span>
              </div>
              <span class="text-[10px] text-[#a89984]">
                {currentFigureDeconstruction?.dataFlowSteps?.length || 3} 個連續運算階段
              </span>
            </div>

            <!-- SVG 拓撲流程管線繪製 -->
            <svg class="w-full max-h-[300px]" viewBox="0 0 540 230" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="nodeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#1d2021" />
                  <stop offset="100%" stop-color="#282828" />
                </linearGradient>
                <linearGradient id="nodeGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#282828" />
                  <stop offset="100%" stop-color="#32302f" />
                </linearGradient>
                <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <polygon points="0 1, 7 4, 0 7" fill="#fe8019" />
                </marker>
              </defs>

              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#3c3836" opacity="0.3" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />

              <!-- 連接箭頭 1 -> 2 -->
              <path d="M 170 100 L 205 100" stroke="#fe8019" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#flowArrow)">
                <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.2s" repeatCount="indefinite" />
              </path>

              <!-- 連接箭頭 2 -> 3 -->
              <path d="M 350 100 L 385 100" stroke="#fe8019" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#flowArrow)">
                <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.2s" repeatCount="indefinite" />
              </path>

              <!-- 節點 1: Input Stage -->
              <g transform="translate(15, 35)">
                <rect width="155" height="135" rx="8" fill="url(#nodeGrad1)" stroke="#504945" stroke-width="1.2" />
                <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                <line x1="0" y1="28" x2="155" y2="28" stroke="#3c3836" stroke-width="1" />
                <circle cx="16" cy="14" r="7" fill="#fe8019" />
                <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">1</text>
                <text x="30" y="18" fill="#fabd2f" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                  {topologySteps[0]?.component || '輸入/控制變因'}
                </text>
                <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                  {(topologySteps[0]?.component || '輸入特徵層').slice(0, 10)}
                </text>
                <foreignObject x="10" y="58" width="135" height="42">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #a89984; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    {topologySteps[0]?.action || '特徵資料載入與正規化'}
                  </div>
                </foreignObject>
                <foreignObject x="8" y="104" width="139" height="24">
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    class="w-full h-full flex items-center justify-center px-1 bg-[#141617] border border-[#3c3836] rounded text-[10px] text-[#8ec07c] overflow-hidden whitespace-nowrap text-ellipsis shadow-inner"
                  >
                    {@html renderMath(topologySteps[0]?.tensorTransformation || '(B, S, D_{in})')}
                  </div>
                </foreignObject>
              </g>

              <!-- 節點 2: Core Processing Stage -->
              <g transform="translate(195, 30)">
                <rect width="155" height="145" rx="8" fill="url(#nodeGradActive)" stroke="#fe8019" stroke-width="1.8" />
                <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                <line x1="0" y1="28" x2="155" y2="28" stroke="#fe8019" stroke-width="1" />
                <circle cx="16" cy="14" r="7" fill="#fe8019" />
                <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">2</text>
                <text x="30" y="18" fill="#fe8019" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                  {topologySteps[1]?.component || '核心表徵轉換'}
                </text>
                <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                  {(topologySteps[1]?.component || '核心動力學層').slice(0, 10)}
                </text>
                <foreignObject x="10" y="58" width="135" height="46">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #d5c4a1; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    {topologySteps[1]?.action || '特徵提取與連續動力學演進'}
                  </div>
                </foreignObject>
                <foreignObject x="8" y="112" width="139" height="26">
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    class="w-full h-full flex items-center justify-center px-1 bg-[#1d2021] border border-[#fe8019]/80 rounded text-[10px] text-[#fe8019] font-bold overflow-hidden whitespace-nowrap text-ellipsis shadow-sm"
                  >
                    {@html renderMath(topologySteps[1]?.tensorTransformation || '(B, S, D_{hidden})')}
                  </div>
                </foreignObject>
              </g>

              <!-- 節點 3: Output Stage -->
              <g transform="translate(375, 35)">
                <rect width="155" height="135" rx="8" fill="url(#nodeGrad1)" stroke="#504945" stroke-width="1.2" />
                <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                <line x1="0" y1="28" x2="155" y2="28" stroke="#3c3836" stroke-width="1" />
                <circle cx="16" cy="14" r="7" fill="#8ec07c" />
                <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">3</text>
                <text x="30" y="18" fill="#8ec07c" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                  {topologySteps[2]?.component || '輸出/指標預測'}
                </text>
                <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                  {(topologySteps[2]?.component || '目標響應層').slice(0, 10)}
                </text>
                <foreignObject x="10" y="58" width="135" height="42">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #a89984; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    {topologySteps[2]?.action || '目標物理量評估與收斂驗證'}
                  </div>
                </foreignObject>
                <foreignObject x="8" y="104" width="139" height="24">
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    class="w-full h-full flex items-center justify-center px-1 bg-[#141617] border border-[#3c3836] rounded text-[10px] text-[#8ec07c] overflow-hidden whitespace-nowrap text-ellipsis shadow-inner"
                  >
                    {@html renderMath(topologySteps[2]?.tensorTransformation || '(B, S, D_{out})')}
                  </div>
                </foreignObject>
              </g>

              <!-- 底部全域資料流標註 -->
              <text x="270" y="205" fill="#a89984" font-family="JetBrains Mono" font-size="9" text-anchor="middle">
                ⟵ 系統狀態連續演進與邊界收斂管線 ⟶
              </text>
            </svg>
          </div>
        {:else}
          <!-- 原始論文圖片視圖 -->
          <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 flex items-center justify-center overflow-auto min-h-[260px] max-h-[420px]">
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
            <img
              src={normalizeAcademicImageUrl(rawImg)}
              alt={activeItem.figure.name}
              referrerpolicy="no-referrer"
              style="transform: scale({figureZoom / 100}); transform-origin: center center;"
              class="max-h-[360px] max-w-full object-contain rounded transition-transform duration-200 cursor-zoom-in"
              on:click={() => dispatch('openLightbox', { url: normalizeAcademicImageUrl(rawImg), title: activeItem.figure.name })}
              on:error={() => {
                if (rawImg) brokenImageUrls[rawImg] = true;
              }}
              loading="lazy"
            />
          </div>
        {/if}

        {#if activeItem.figure.caption}
          <p class="text-xs text-[#d5c4a1] font-serif leading-relaxed text-justify px-1 border-l-2 border-[#fe8019]/60 pl-2.5 my-1 bg-[#1d2021]/50 py-1 rounded-r">
            {activeItem.figure.caption}
          </p>
        {/if}
      </div>
    {:else}
      <!-- Demo Fallback Attention SVG Figures -->
      <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
          <span class="font-mono text-xs text-[#fabd2f] font-bold">
            {activeFigureTab === 'fig1' ? 'Figure 1: The Transformer Architecture (全景拓撲)' : 'Figure 2: Scaled Dot-Product Attention Circuit (運算電路)'}
          </span>
          <span class="font-mono text-[10px] text-[#8ec07c]">經典文獻架構模型</span>
        </div>

        <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
          {#if activeFigureTab === 'fig1'}
            <svg class="w-full max-h-[280px]" viewBox="0 0 460 260">
              <rect x="20" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#fe8019" stroke-width="1.5" />
              <text x="75" y="55" fill="#fe8019" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">1. INPUT STAGE</text>
              <line x1="30" y1="65" x2="120" y2="65" stroke="#3c3836" stroke-width="1" />
              <rect x="30" y="75" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="75" y="90" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">Token Embeddings</text>
              <rect x="30" y="105" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="75" y="120" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">+ Positional Encoding</text>
              <rect x="30" y="135" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="75" y="150" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">Multi-Head Attention</text>

              <path d="M 130 130 L 165 130" stroke="#fabd2f" stroke-width="2" stroke-dasharray="4,2" />

              <rect x="175" y="20" width="120" height="220" rx="8" fill="#1d2021" stroke="#fabd2f" stroke-width="1.5" />
              <text x="235" y="45" fill="#fabd2f" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">2. ENCODER BLOCK</text>
              <line x1="185" y1="55" x2="285" y2="55" stroke="#3c3836" stroke-width="1" />
              <rect x="185" y="65" width="100" height="26" rx="4" fill="#32302f" stroke="#fe8019" stroke-width="1.5" />
              <text x="235" y="81" fill="#fe8019" font-family="Geist" font-size="9" font-weight="bold" text-anchor="middle">Self-Attention</text>
              <rect x="185" y="100" width="100" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="235" y="115" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm (殘差)</text>
              <rect x="185" y="130" width="100" height="26" rx="4" fill="#282828" stroke="#504945" />
              <text x="235" y="146" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">Feed Forward (2048)</text>
              <rect x="185" y="165" width="100" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="235" y="180" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm (殘差)</text>

              <path d="M 295 130 L 325 130" stroke="#8ec07c" stroke-width="2" stroke-dasharray="4,2" />

              <rect x="335" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#8ec07c" stroke-width="1.5" />
              <text x="390" y="55" fill="#8ec07c" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">3. DECODER & OUTPUT</text>
              <line x1="345" y1="65" x2="435" y2="65" stroke="#3c3836" stroke-width="1" />
              <rect x="345" y="75" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="390" y="90" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">Masked Self-Attn</text>
              <rect x="345" y="105" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="390" y="120" fill="#83a598" font-family="Geist" font-size="9" text-anchor="middle">Cross-Attention</text>
              <rect x="345" y="135" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="390" y="150" fill="#d3869b" font-family="Geist" font-size="9" text-anchor="middle">Linear & Softmax</text>
            </svg>
          {:else}
            <svg class="w-full max-h-[280px]" viewBox="0 0 320 220">
              <rect x="50" y="180" width="40" height="24" rx="4" fill="#fe8019" />
              <text x="70" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">Q</text>
              <rect x="130" y="180" width="40" height="24" rx="4" fill="#fabd2f" />
              <text x="150" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">K</text>
              <rect x="230" y="180" width="40" height="24" rx="4" fill="#8ec07c" />
              <text x="250" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">V</text>

              <rect x="70" y="125" width="100" height="28" rx="6" fill="#282828" stroke="#fe8019" stroke-width="1.5" />
              <text x="120" y="143" fill="#ebdbb2" font-family="Geist" font-size="11" font-weight="bold" text-anchor="middle">MatMul (Q · K^T)</text>
              <line x1="70" y1="180" x2="100" y2="153" stroke="#fe8019" stroke-width="1.5" />
              <line x1="150" y1="180" x2="120" y2="153" stroke="#fabd2f" stroke-width="1.5" />

              <rect x="70" y="80" width="80" height="26" rx="6" fill="#32302f" stroke="#fabd2f" stroke-width="1.5" />
              <text x="110" y="97" fill="#fabd2f" font-family="JetBrains Mono" font-size="10" text-anchor="middle">Scale (÷ √d_k)</text>
              <line x1="110" y1="125" x2="110" y2="106" stroke="#ebdbb2" stroke-width="1.5" />

              <rect x="70" y="35" width="80" height="26" rx="6" fill="#3c3836" stroke="#b8bb26" stroke-width="1.5" />
              <text x="110" y="52" fill="#b8bb26" font-family="Geist" font-size="10" font-weight="bold" text-anchor="middle">Softmax</text>
              <line x1="110" y1="80" x2="110" y2="61" stroke="#ebdbb2" stroke-width="1.5" />

              <rect x="180" y="35" width="100" height="30" rx="6" fill="#282828" stroke="#83a598" stroke-width="1.5" />
              <text x="230" y="54" fill="#83a598" font-family="Geist" font-size="11" font-weight="bold" text-anchor="middle">MatMul with V</text>
              <line x1="150" y1="48" x2="180" y2="48" stroke="#b8bb26" stroke-width="1.5" />
              <line x1="250" y1="180" x2="250" y2="65" stroke="#8ec07c" stroke-width="1.5" />
            </svg>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Figure Architectural Deconstruction Card -->
    {#if currentFigureDeconstruction}
      <div class="bg-[#1d2021] border border-[#504945] rounded-xl p-4 flex flex-col gap-4 shadow-inner">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[#fe8019]">account_tree</span>
            <h3 class="font-mono text-xs font-bold text-[#fe8019]">圖表架構深度解構 (Architectural Deconstruction)</h3>
          </div>
          <div class="flex items-center gap-2">
            {#if activeItem}
              <button
                class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                on:click={() => dispatch('analyzeFigure', { figure: activeItem.figure })}
                disabled={isAnalyzingFigure}
              >
                {#if isAnalyzingFigure}
                  <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
                  <span>解構中...</span>
                {:else}
                  <span class="material-symbols-outlined text-[12px]">psychology</span>
                  <span>⚡ AI 圖表深層解構</span>
                {/if}
              </button>
            {/if}
            <button
              class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
              on:click={() => dispatch('captureToNotes')}
              title="將此圖表架構與資料流解構收錄至精讀筆記"
            >
              <span class="material-symbols-outlined text-[12px]">edit_note</span>
              <span>收錄至筆記</span>
            </button>
          </div>
        </div>

        <!-- Concept Overview -->
        <p class="text-xs text-[#ebdbb2] leading-relaxed text-justify">
          {currentFigureDeconstruction.conceptOverview}
        </p>

        <!-- Data Flow Pipeline Steps -->
        <div class="flex flex-col gap-2">
          <h4 class="font-mono text-[11px] font-bold text-[#fabd2f] flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px]">alt_route</span>
            資料流動與算子轉換路徑 (Data Flow Pipeline)
          </h4>
          <div class="flex flex-col gap-2">
            {#each displaySteps as step}
              <div class="bg-[#282828] border border-[#3c3836] rounded-lg p-2.5 flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[11px] text-[#8ec07c] font-semibold flex items-center gap-1">
                    <span class="w-4 h-4 rounded-full bg-[#8ec07c]/20 text-[#8ec07c] text-[10px] flex items-center justify-center font-bold">
                      {step.step}
                    </span>
                    {step.component}
                  </span>
                  {#if step.tensorTransformation}
                    <span class="font-mono text-[10px] text-[#fabd2f] bg-[#1d2021] px-2 py-0.5 rounded border border-[#504945]">
                      {@html renderMath(step.tensorTransformation, false)}
                    </span>
                  {/if}
                </div>
                <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                  {step.action}
                </p>
              </div>
            {/each}
          </div>
        </div>

        <!-- Engineering Design Decisions & Trade-offs -->
        {#if currentFigureDeconstruction.designDecisions && currentFigureDeconstruction.designDecisions.length > 0}
          <div class="flex flex-col gap-2">
            <h4 class="font-mono text-[11px] font-bold text-[#83a598] flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">lightbulb</span>
              關鍵工程設計決策與權衡 (Design Decisions & Trade-offs)
            </h4>
            <div class="flex flex-col gap-2">
              {#each currentFigureDeconstruction.designDecisions as item}
                <div class="bg-[#282828]/70 border border-[#3c3836] rounded-lg p-2.5 flex flex-col gap-1">
                  <span class="font-mono text-[11px] font-semibold text-[#fe8019]">
                    📌 {item.decision}
                  </span>
                  <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                    {item.rationale}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Cross-reference anchor to equations -->
        {#if currentFigureDeconstruction.relatedFormulaId}
          <div class="bg-[#282828] border border-[#fabd2f]/40 p-2.5 rounded-lg flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">sync_alt</span>
              <span class="font-mono text-[11px] text-[#ebdbb2]">
                此架構對應右側數學公式：<strong class="text-[#fabd2f]">{currentFigureDeconstruction.relatedFormulaId}</strong>
              </span>
            </div>
            <button
              class="font-mono text-[10px] text-[#fabd2f] hover:underline flex items-center gap-0.5 cursor-pointer"
              on:click={() => dispatch('switchRightMode', { mode: 'derivation' })}
            >
              <span>檢視對應推導</span>
              <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
            </button>
          </div>
        {/if}

        <!-- Key Takeaway -->
        <div class="border-t border-[#3c3836] pt-2 text-[11px] text-[#a89984] italic">
          💡 核心總結：{currentFigureDeconstruction.keyTakeaway}
        </div>
      </div>
    {/if}
  </div>
</div>
