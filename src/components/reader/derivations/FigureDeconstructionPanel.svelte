<script lang="ts">
  import type { PaperDocument, FigureItem } from '../../../types/document';
  import type { FigureDeconstructionData } from '../../../types/derivation';
  import type { ExtractedFigureItem } from '../../../utils/derivationExtractor';
  import { renderMath } from '../../../utils/katexUtils';
  import { normalizeAcademicImageUrl } from '../../../utils/academicImageUtils';
  import { getDomainAdaptedFigurePipeline } from '../../../services/derivationService';
  import { t, currentLocale } from '../../../stores/localeStore';

  interface Props {
    paper?: PaperDocument | null;
    dynamicFigures?: ExtractedFigureItem[];
    selectedFigureIndex?: number;
    activeFigureTab?: 'fig1' | 'fig2';
    currentFigureDeconstruction?: FigureDeconstructionData | null;
    isAnalyzingFigure?: boolean;
    isScanningHeuristically?: boolean;
    onselectFigure?: (detail: { index: number }) => void;
    onselectFallbackTab?: (detail: { tab: 'fig1' | 'fig2' }) => void;
    onanalyzeFigure?: (detail: { figure: FigureItem }) => void;
    onheuristicScan?: () => void;
    oncaptureToNotes?: () => void;
    onopenLightbox?: (detail: { url: string; title: string }) => void;
    onjumpToSection?: (detail: { sectionId: string }) => void;
    onswitchRightMode?: (detail: { mode: 'derivation' | 'scratchpad' }) => void;
  }

  let {
    paper = null,
    dynamicFigures = [],
    selectedFigureIndex = 0,
    activeFigureTab = 'fig1',
    currentFigureDeconstruction = null,
    isAnalyzingFigure = false,
    isScanningHeuristically = false,
    onselectFigure,
    onselectFallbackTab,
    onanalyzeFigure,
    onheuristicScan,
    oncaptureToNotes,
    onopenLightbox,
    onjumpToSection,
    onswitchRightMode
  }: Props = $props();

  let brokenImageUrls = $state<Record<string, boolean>>({});
  let figureCanvasViewMode = $state<'auto' | 'topology' | 'image'>('auto');


  let activeItem = $derived(dynamicFigures[selectedFigureIndex]);
  let rawImg = $derived(activeItem?.figure?.imageUrl?.trim() || '');
  let isBroken = $derived(Boolean(rawImg && brokenImageUrls[rawImg]));
  let hasImg = $derived(Boolean(rawImg && !isBroken));
  let showTopology = $derived(figureCanvasViewMode === 'topology' || (!hasImg && figureCanvasViewMode !== 'image'));

  let isML = $derived(/transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || ''));
  let adaptedTopology = $derived(getDomainAdaptedFigurePipeline(paper?.title || '', activeItem?.figure?.name || '', $currentLocale));

  let topologySteps = $derived((() => {
    const rawSteps = currentFigureDeconstruction?.dataFlowSteps && currentFigureDeconstruction.dataFlowSteps.length > 0
      ? currentFigureDeconstruction.dataFlowSteps.slice(0, 3)
      : adaptedTopology.dataFlowSteps;
    return rawSteps.map((s, idx) => {
      if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
        return adaptedTopology.dataFlowSteps[idx] || s;
      }
      return s;
    });
  })());

  let displaySteps = $derived((() => {
    if (!currentFigureDeconstruction) return [];
    const adapted = getDomainAdaptedFigurePipeline(paper?.title || '', currentFigureDeconstruction.name, $currentLocale);
    return currentFigureDeconstruction.dataFlowSteps.map((s, idx) => {
      if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
        return adapted.dataFlowSteps[idx] || s;
      }
      return s;
    });
  })());
</script>

<div class="h-full flex flex-col bg-[#1d2021]/70 overflow-hidden">
  <!-- Dynamic Tabs for Document Figures -->
  {#if dynamicFigures.length > 0}
    <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
      <div class="flex items-center gap-1.5 overflow-x-auto w-full">
        {#each dynamicFigures as item, idx}
          <button
            class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {selectedFigureIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            onclick={() => onselectFigure?.({ index: idx })}
          >
            <span class="material-symbols-outlined text-[13px]">image</span>
            <span>{item.figure.figureNumber || $t('derivations.figureTab', { num: idx + 1 })}</span>
          </button>
        {/each}
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
          onclick={() => onselectFallbackTab?.({ tab: 'fig1' })}
        >
          <span class="material-symbols-outlined text-[14px]">account_tree</span>
          <span>{$t('derivations.fallbackFig1')}</span>
        </button>
        <button
          class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => onselectFallbackTab?.({ tab: 'fig2' })}
        >
          <span class="material-symbols-outlined text-[14px]">device_hub</span>
          <span>{$t('derivations.fallbackFig2')}</span>
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
            <span class="font-bold">{$t('derivations.previewMode')}</span>
            <span class="text-[11px] text-[#d5c4a1]">{$t('derivations.noFiguresExtracted')}</span>
          </div>
        </div>
        <button
          class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shrink-0 transition-colors shadow-sm"
          onclick={() => onheuristicScan?.()}
          disabled={isScanningHeuristically}
        >
          {#if isScanningHeuristically}
            <span class="inline-block w-2.5 h-2.5 border-2 border-[#1d2021] border-t-transparent rounded-full animate-spin"></span>
            <span>{$t('derivations.extractingFigures')}</span>
          {:else}
            <span class="material-symbols-outlined text-[13px]">auto_fix_high</span>
            <span>{$t('derivations.extractFiguresBtn')}</span>
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
                {$t('derivations.systemDataflow')}
              </span>
            {:else}
              <span class="font-mono text-[9px] bg-[#8ec07c]/15 border border-[#8ec07c]/40 text-[#8ec07c] px-1.5 py-0.5 rounded font-semibold shrink-0">
                {$t('derivations.paperOriginalFigure')}
              </span>
            {/if}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <!-- 視圖模式切換按鈕 -->
            {#if hasImg}
              <div class="flex items-center bg-[#1d2021] border border-[#3c3836] rounded p-0.5 text-[10px] font-mono">
                <button
                  class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode !== 'topology' ? 'bg-[#3c3836] text-[#fabd2f] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                  onclick={() => figureCanvasViewMode = 'image'}
                  title={$t('derivations.showOriginalFigureTooltip')}
                >
                  {$t('derivations.originalFigure')}
                </button>
                <button
                  class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode === 'topology' ? 'bg-[#3c3836] text-[#fe8019] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                  onclick={() => figureCanvasViewMode = 'topology'}
                  title={$t('derivations.dataflowTopology')}
                >
                  {$t('derivations.dataflowTopology')}
                </button>
              </div>
            {/if}

            {#if !showTopology && hasImg}
              <button
                class="font-mono text-[10px] bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] text-[#ebdbb2] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                onclick={() => activeItem && onopenLightbox?.({ url: normalizeAcademicImageUrl(rawImg), title: activeItem.figure.name })}
              >
                <span class="material-symbols-outlined text-[12px]">fullscreen</span>
                <span>{$t('derivations.fullscreen')}</span>
              </button>
            {/if}

            {#if activeItem.sectionId}
              <button
                class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                onclick={() => onjumpToSection?.({ sectionId: activeItem.sectionId || '' })}
              >
                <span>{$t('derivations.jumpSection')}</span>
                <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- Canvas Area: 圖片或互動式 SVG 資料流拓撲圖 -->
        {#if showTopology}
          <div class="w-full bg-[#141617] border border-[#3c3836] rounded-xl p-4 flex flex-col min-h-[300px] overflow-hidden relative select-none shadow-xl" style="background-image: radial-gradient(rgba(80, 73, 69, 0.4) 1px, transparent 1px); background-size: 16px 16px;">
            <!-- 頂部拓撲說明列 (科技感標題與狀態指示) -->
            <div class="w-full flex items-center justify-between pb-2.5 mb-3 border-b border-[#282828] text-xs font-mono">
              <div class="flex items-center gap-2 text-[#fe8019]">
                <span class="flex h-2 w-2 relative">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fe8019] opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-[#fe8019]"></span>
                </span>
                <span class="font-bold text-[11px] tracking-wider uppercase">{$t('derivations.pipelineTitle')}</span>
                <span class="px-1.5 py-0.2 bg-[#282828] text-[9px] text-[#a89984] rounded border border-[#3c3836]">TOPOLOGY HUD v2.5</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-[#8ec07c] font-mono flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#8ec07c]"></span>
                  ONLINE
                </span>
                <span class="text-[10px] text-[#a89984]">
                  {$t('derivations.stagesCount', { count: currentFigureDeconstruction?.dataFlowSteps?.length || 3 })}
                </span>
              </div>
            </div>

            <!-- 現代 HTML5 + HUD 藍圖彈性流式拓撲管線 -->
            <div class="w-full flex-1 flex flex-col justify-center py-2 relative">
              <div class="w-full grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-2.5 relative z-10">
                <!-- 節點 1: Input Stage -->
                <div
                  class="group relative flex flex-col bg-gradient-to-b from-[#1d2021]/95 to-[#282828]/95 backdrop-blur-sm border border-[#504945] rounded-xl overflow-hidden shadow-md transition-all duration-300 ease-out hover:border-[#fabd2f] hover:shadow-[0_8px_24px_rgba(250,189,47,0.25)] hover:-translate-y-1.5"
                >
                  <!-- HUD 角隅裝飾 -->
                  <span class="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#fabd2f]/70 rounded-tl pointer-events-none transition-colors group-hover:border-[#fabd2f]"></span>
                  <span class="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#fabd2f]/70 rounded-tr pointer-events-none transition-colors group-hover:border-[#fabd2f]"></span>
                  <span class="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#fabd2f]/70 rounded-bl pointer-events-none transition-colors group-hover:border-[#fabd2f]"></span>
                  <span class="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#fabd2f]/70 rounded-br pointer-events-none transition-colors group-hover:border-[#fabd2f]"></span>

                  <!-- 頂部標題列 (自然換行，字數不受限，帶有微晶片端口標記) -->
                  <div class="px-3 py-2.5 bg-[#141617]/80 border-b border-[#3c3836] flex items-start gap-2">
                    <span class="w-5 h-5 rounded bg-[#fabd2f] text-[#1d2021] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      01
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="text-[9px] font-mono uppercase tracking-wider text-[#a89984] mb-0.5">INPUT PORT</div>
                      <h5 class="font-mono text-xs font-bold text-[#fabd2f] leading-snug break-words">
                        {topologySteps[0]?.component || $t('derivations.inputControlVar')}
                      </h5>
                    </div>
                  </div>
                  <!-- 卡片主體說明 -->
                  <div class="p-3 flex-1 flex flex-col justify-between gap-2.5 bg-[#1d2021]/50">
                    <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                      {topologySteps[0]?.action || $t('derivations.inputFeatureAction')}
                    </p>
                    <div class="px-2.5 py-2 bg-[#141617] border border-[#3c3836] rounded-lg text-center text-[13.5px] leading-normal text-[#8ec07c] shadow-inner select-text font-mono flex items-center justify-center overflow-x-auto">
                      {@html renderMath(topologySteps[0]?.tensorTransformation || '(B, S, D_{in})', false)}
                    </div>
                  </div>
                </div>

                <!-- 連接動態電路導軌 1 -> 2 (向量導軌與流動光粒子) -->
                <div class="flex flex-col items-center justify-center text-[#fe8019] px-0.5 relative">
                  <div class="flex items-center justify-center">
                    <svg class="w-8 h-8 shrink-0 text-[#fe8019] drop-shadow-[0_0_8px_rgba(254,128,25,0.6)]" viewBox="0 0 32 32" fill="none">
                      <!-- 基礎電路軌道 -->
                      <line x1="2" y1="16" x2="24" y2="16" stroke="#504945" stroke-width="2" />
                      <!-- 流動雷射光脈衝 -->
                      <line x1="2" y1="16" x2="24" y2="16" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 14">
                        <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                      </line>
                      <!-- 箭頭端點 -->
                      <polygon points="21,11 29,16 21,21" fill="currentColor" />
                    </svg>
                  </div>
                  <span class="text-[8px] font-mono text-[#a89984] mt-1 tracking-widest">FLOW</span>
                </div>

                <!-- 節點 2: Core Processing Stage (主運算核心高亮) -->
                <div
                  class="group relative flex flex-col bg-gradient-to-b from-[#282828]/95 to-[#32302f]/95 backdrop-blur-sm border border-[#fe8019]/80 rounded-xl overflow-hidden shadow-lg transition-all duration-300 ease-out hover:border-[#fe8019] hover:shadow-[0_8px_28px_rgba(254,128,25,0.4)] hover:-translate-y-2"
                >
                  <!-- HUD 角隅裝飾 -->
                  <span class="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#fe8019] rounded-tl pointer-events-none"></span>
                  <span class="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#fe8019] rounded-tr pointer-events-none"></span>
                  <span class="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#fe8019] rounded-bl pointer-events-none"></span>
                  <span class="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#fe8019] rounded-br pointer-events-none"></span>

                  <!-- 頂部標題列 -->
                  <div class="px-3 py-2.5 bg-[#1d2021]/90 border-b border-[#fe8019]/50 flex items-start gap-2">
                    <span class="w-5 h-5 rounded bg-[#fe8019] text-[#1d2021] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      02
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="text-[9px] font-mono uppercase tracking-wider text-[#fe8019] mb-0.5 flex items-center gap-1">
                        <span>CORE ENGINE</span>
                        <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#fe8019] animate-pulse"></span>
                      </div>
                      <h5 class="font-mono text-xs font-bold text-[#fe8019] leading-snug break-words">
                        {topologySteps[1]?.component || $t('derivations.coreRepresentation')}
                      </h5>
                    </div>
                  </div>
                  <!-- 卡片主體說明 -->
                  <div class="p-3 flex-1 flex flex-col justify-between gap-2.5 bg-[#282828]/50">
                    <p class="text-[11px] text-[#ebdbb2] leading-relaxed">
                      {topologySteps[1]?.action || $t('derivations.coreDynamicAction')}
                    </p>
                    <div class="px-2.5 py-2 bg-[#1d2021] border border-[#fe8019]/70 rounded-lg text-center text-[13.5px] leading-normal text-[#fe8019] font-bold shadow-sm select-text font-mono flex items-center justify-center overflow-x-auto">
                      {@html renderMath(topologySteps[1]?.tensorTransformation || '(B, S, D_{hidden})', false)}
                    </div>
                  </div>
                </div>

                <!-- 連接動態電路導軌 2 -> 3 -->
                <div class="flex flex-col items-center justify-center text-[#fe8019] px-0.5 relative">
                  <div class="flex items-center justify-center">
                    <svg class="w-8 h-8 shrink-0 text-[#fe8019] drop-shadow-[0_0_8px_rgba(254,128,25,0.6)]" viewBox="0 0 32 32" fill="none">
                      <line x1="2" y1="16" x2="24" y2="16" stroke="#504945" stroke-width="2" />
                      <line x1="2" y1="16" x2="24" y2="16" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 14">
                        <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                      </line>
                      <polygon points="21,11 29,16 21,21" fill="currentColor" />
                    </svg>
                  </div>
                  <span class="text-[8px] font-mono text-[#a89984] mt-1 tracking-widest">FLOW</span>
                </div>

                <!-- 節點 3: Output Stage -->
                <div
                  class="group relative flex flex-col bg-gradient-to-b from-[#1d2021]/95 to-[#282828]/95 backdrop-blur-sm border border-[#504945] rounded-xl overflow-hidden shadow-md transition-all duration-300 ease-out hover:border-[#8ec07c] hover:shadow-[0_8px_24px_rgba(142,192,124,0.25)] hover:-translate-y-1.5"
                >
                  <!-- HUD 角隅裝飾 -->
                  <span class="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#8ec07c]/70 rounded-tl pointer-events-none transition-colors group-hover:border-[#8ec07c]"></span>
                  <span class="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#8ec07c]/70 rounded-tr pointer-events-none transition-colors group-hover:border-[#8ec07c]"></span>
                  <span class="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#8ec07c]/70 rounded-bl pointer-events-none transition-colors group-hover:border-[#8ec07c]"></span>
                  <span class="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#8ec07c]/70 rounded-br pointer-events-none transition-colors group-hover:border-[#8ec07c]"></span>

                  <!-- 頂部標題列 -->
                  <div class="px-3 py-2.5 bg-[#141617]/80 border-b border-[#3c3836] flex items-start gap-2">
                    <span class="w-5 h-5 rounded bg-[#8ec07c] text-[#1d2021] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      03
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="text-[9px] font-mono uppercase tracking-wider text-[#a89984] mb-0.5">OUTPUT PORT</div>
                      <h5 class="font-mono text-xs font-bold text-[#8ec07c] leading-snug break-words">
                        {topologySteps[2]?.component || $t('derivations.outputPredict')}
                      </h5>
                    </div>
                  </div>
                  <!-- 卡片主體說明 -->
                  <div class="p-3 flex-1 flex flex-col justify-between gap-2.5 bg-[#1d2021]/50">
                    <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                      {topologySteps[2]?.action || $t('derivations.targetResponseAction')}
                    </p>
                    <div class="px-2.5 py-2 bg-[#141617] border border-[#3c3836] rounded-lg text-center text-[13.5px] leading-normal text-[#8ec07c] shadow-inner select-text font-mono flex items-center justify-center overflow-x-auto">
                      {@html renderMath(topologySteps[2]?.tensorTransformation || '(B, S, D_{out})', false)}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 底部全域資料流標註 -->
              <div class="w-full text-center pt-3 text-[10px] font-mono text-[#a89984] tracking-wider select-none flex items-center justify-center gap-2">
                <span class="h-px w-8 bg-[#3c3836]"></span>
                <span>{$t('derivations.systemEvolution')}</span>
                <span class="h-px w-8 bg-[#3c3836]"></span>
              </div>
            </div>
          </div>
        {:else}
          <!-- 原始論文圖片視圖 -->
          <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 flex items-center justify-center overflow-auto min-h-[260px] max-h-[420px]">
            <button
              type="button"
              class="max-h-[360px] max-w-full flex items-center justify-center p-0 bg-transparent border-0 cursor-zoom-in focus:outline-none"
              onclick={() => activeItem && onopenLightbox?.({ url: normalizeAcademicImageUrl(rawImg), title: activeItem.figure.name })}
              aria-label={activeItem?.figure?.name || 'Academic Figure'}
            >
              <img
                src={normalizeAcademicImageUrl(rawImg)}
                alt={activeItem?.figure?.name || 'Academic Figure'}
                referrerpolicy="no-referrer"
                class="max-h-[360px] max-w-full object-contain rounded"
                onerror={() => {
                  if (rawImg) brokenImageUrls[rawImg] = true;
                }}
                loading="lazy"
              />
            </button>
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
            {activeFigureTab === 'fig1' ? $t('derivations.fallbackFig1') : $t('derivations.fallbackFig2')}
          </span>
          <span class="font-mono text-[10px] text-[#8ec07c]">{$t('derivations.classicArchitecture')}</span>
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
              <text x="235" y="115" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm</text>
              <rect x="185" y="130" width="100" height="26" rx="4" fill="#282828" stroke="#504945" />
              <text x="235" y="146" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">Feed Forward (2048)</text>
              <rect x="185" y="165" width="100" height="22" rx="4" fill="#282828" stroke="#504945" />
              <text x="235" y="180" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm</text>

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
            <h3 class="font-mono text-xs font-bold text-[#fe8019]">{$t('derivations.deconstructionTitle')}</h3>
          </div>
          <div class="flex items-center gap-2">
            {#if activeItem}
              <button
                class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                onclick={() => activeItem && onanalyzeFigure?.({ figure: activeItem.figure })}
                disabled={isAnalyzingFigure}
              >
                {#if isAnalyzingFigure}
                  <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
                  <span>{$t('derivations.deconstructing')}</span>
                {:else}
                  <span class="material-symbols-outlined text-[12px]">psychology</span>
                  <span>{$t('derivations.aiDeconstructBtn')}</span>
                {/if}
              </button>
            {/if}
            <button
              class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
              onclick={() => oncaptureToNotes?.()}
              title={$t('derivations.saveToNotesTooltip')}
            >
              <span class="material-symbols-outlined text-[12px]">edit_note</span>
              <span>{$t('derivations.saveToNotes')}</span>
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
            {$t('derivations.dataflowPipeline')}
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
              {$t('derivations.designDecisions')}
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
                {$t('derivations.relatedFormula')}<strong class="text-[#fabd2f]">{currentFigureDeconstruction.relatedFormulaId}</strong>
              </span>
            </div>
            <button
              class="font-mono text-[10px] text-[#fabd2f] hover:underline flex items-center gap-0.5 cursor-pointer"
              onclick={() => onswitchRightMode?.({ mode: 'derivation' })}
            >
              <span>{$t('derivations.viewRelatedDerivation')}</span>
              <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
            </button>
          </div>
        {/if}

        <!-- Key Takeaway -->
        <div class="border-t border-[#3c3836] pt-2 text-[11px] text-[#a89984] italic">
          {$t('derivations.keyTakeaway')}{currentFigureDeconstruction.keyTakeaway}
        </div>
      </div>
    {/if}
  </div>
</div>
