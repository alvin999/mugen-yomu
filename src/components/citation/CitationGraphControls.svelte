<script lang="ts">
  import type { CitationCategory } from '../../services/citationService';
  import type { CitationAnalysisStatus } from '../../services/citationAnalysisService';
  import { t } from '../../stores/localeStore';

  interface Props {
    paperTitle?: string;
    visibleNodesCount?: number;
    visibleEdgesCount?: number;
    layoutMode?: 'galaxy' | 'timeline';
    filterCategory?: 'all' | CitationCategory;
    searchQuery?: string;
    zoom?: number;
    isAnalyzing?: boolean;
    isAnalyzed?: boolean;
    analysisStatus?: CitationAnalysisStatus | null;
    onbackToWorkspace?: () => void;
    onswitchLayout?: (mode: 'galaxy' | 'timeline') => void;
    onstartAnalysis?: (data: { forceRefresh: boolean }) => void;
    onzoomIn?: () => void;
    onzoomOut?: () => void;
    onresetViewport?: () => void;
  }

  let {
    paperTitle = 'Attention Is All You Need',
    visibleNodesCount = 0,
    visibleEdgesCount = 0,
    layoutMode = $bindable('galaxy'),
    filterCategory = $bindable('all'),
    searchQuery = $bindable(''),
    zoom = 1.0,
    isAnalyzing = false,
    isAnalyzed = false,
    analysisStatus = null,
    onbackToWorkspace,
    onswitchLayout,
    onstartAnalysis,
    onzoomIn,
    onzoomOut,
    onresetViewport
  }: Props = $props();
</script>

<header class="h-14 bg-[#1d2021]/95 backdrop-blur-sm border-b border-[#3c3836] px-4 flex items-center justify-between z-30 shrink-0 shadow-md">
  <!-- Left: Navigation Back & Title Badge -->
  <div class="flex items-center gap-3">
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#282828] hover:bg-[#32302f] text-[#ebdbb2] border border-[#3c3836] hover:border-[#fe8019] text-xs font-medium transition-colors shadow-sm cursor-pointer"
      onclick={() => onbackToWorkspace?.()}
      title={$t('citation.backTooltip')}
    >
      <span class="material-symbols-outlined text-[16px] text-[#fe8019]">arrow_back</span>
      <span>{$t('citation.backToWorkspace')}</span>
    </button>

    <div class="h-4 w-px bg-[#3c3836]"></div>

    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
        <span class="material-symbols-outlined text-[15px]">hub</span>
      </div>
      <div class="flex flex-col">
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-bold text-[#ebdbb2] tracking-wide font-mono">
            {$t('citation.title')}
          </h2>
          <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.2 rounded">
            {visibleNodesCount} {$t('citation.papersCount')} · {visibleEdgesCount} {$t('citation.lineageCount')}
          </span>
        </div>
        <span class="text-[10px] text-[#a89984] truncate max-w-md">
          {$t('citation.targetLabel')}：{paperTitle}
        </span>
      </div>
    </div>
  </div>

  <!-- Center: Layout Switcher & Category Filter -->
  <div class="flex items-center gap-2">
    <!-- Layout Toggle: Galaxy vs. Timeline -->
    <div class="flex items-center bg-[#282828] border border-[#3c3836] p-0.5 rounded-lg">
      <button
        class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer {layoutMode === 'galaxy' ? 'bg-[#3c3836] text-[#fe8019] font-bold shadow-inner' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        onclick={() => onswitchLayout?.('galaxy')}
        title={$t('citation.galaxyTooltip')}
      >
        <span class="material-symbols-outlined text-[14px]">bubble_chart</span>
        <span>{$t('citation.galaxy')}</span>
      </button>
      <button
        class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer {layoutMode === 'timeline' ? 'bg-[#3c3836] text-[#fe8019] font-bold shadow-inner' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        onclick={() => onswitchLayout?.('timeline')}
        title={$t('citation.timelineTooltip')}
      >
        <span class="material-symbols-outlined text-[14px]">timeline</span>
        <span>{$t('citation.timeline')}</span>
      </button>
    </div>

    <!-- Category Filter Chips -->
    <div class="flex items-center gap-1">
      <button
        class="px-2 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer {filterCategory === 'all' ? 'bg-[#fe8019]/20 text-[#fe8019] border border-[#fe8019]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
        onclick={() => filterCategory = 'all'}
      >
        {$t('citation.filterAll')}
      </button>
      <button
        class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 cursor-pointer {filterCategory === 'foundational' ? 'bg-[#b8bb26]/20 text-[#b8bb26] border border-[#b8bb26]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
        onclick={() => filterCategory = 'foundational'}
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#b8bb26]"></span>
        {$t('citation.filterFoundational')}
      </button>
      <button
        class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 cursor-pointer {filterCategory === 'derivative' ? 'bg-[#83a598]/20 text-[#83a598] border border-[#83a598]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
        onclick={() => filterCategory = 'derivative'}
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#83a598]"></span>
        {$t('citation.filterDerivative')}
      </button>
      <button
        class="px-2 py-1 rounded font-mono text-[11px] transition-colors flex items-center gap-1 cursor-pointer {filterCategory === 'methodological' ? 'bg-[#d3869b]/20 text-[#d3869b] border border-[#d3869b]/50 font-semibold' : 'text-[#a89984] hover:bg-[#282828]'}"
        onclick={() => filterCategory = 'methodological'}
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#d3869b]"></span>
        {$t('citation.filterMethodological')}
      </button>
    </div>
  </div>

  <!-- Right: Search Input, AI Dynamic Analysis & Zoom Controls -->
  <div class="flex items-center gap-2">
    <!-- AI Topology Analysis Button -->
    {#if isAnalyzing}
      <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fabd2f]/15 border border-[#fabd2f]/50 text-[#fabd2f] text-xs font-mono shadow-sm animate-pulse">
        <span class="material-symbols-outlined text-[14px] animate-spin">sync</span>
        <span class="truncate max-w-[150px]">{analysisStatus?.message || $t('citation.analyzing')}</span>
      </div>
    {:else if isAnalyzed}
      <div class="flex items-center gap-1 bg-[#282828] border border-[#3c3836] p-0.5 rounded-lg">
        <span class="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#b8bb26] font-semibold">
          <span class="material-symbols-outlined text-[13px]">verified</span>
          <span>{$t('citation.aiAnalyzed')}</span>
        </span>
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-[#a89984] hover:text-[#fe8019] hover:bg-[#32302f] transition-colors cursor-pointer"
          onclick={() => onstartAnalysis?.({ forceRefresh: true })}
          title={$t('citation.rerunTooltip')}
        >
          <span class="material-symbols-outlined text-[13px]">refresh</span>
          <span>{$t('citation.rerun')}</span>
        </button>
      </div>
    {:else}
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fe8019] hover:bg-[#d65d0e] text-[#141617] font-bold text-xs font-mono transition-all shadow-md hover:shadow-lg cursor-pointer"
        onclick={() => onstartAnalysis?.({ forceRefresh: false })}
        title={$t('citation.controlsTooltip')}
      >
        <span class="material-symbols-outlined text-[15px]">psychology</span>
        <span>{$t('citation.aiAnalysis')}</span>
      </button>
    {/if}

    <div class="h-4 w-px bg-[#3c3836]"></div>

    <!-- Search Input -->
    <div class="relative">
      <span class="material-symbols-outlined absolute left-2 top-1.5 text-[15px] text-[#a89984]">search</span>
      <input
        class="w-36 focus:w-48 bg-[#282828] border border-[#3c3836] text-[#ebdbb2] pl-7 pr-2 py-1 rounded-lg text-xs font-mono focus:outline-none focus:border-[#fe8019] placeholder:text-[#a89984]/50 transition-all"
        type="text"
        placeholder={$t('citation.searchPlaceholder')}
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          class="absolute right-1.5 top-1.5 text-[#a89984] hover:text-[#ebdbb2] cursor-pointer"
          onclick={() => searchQuery = ''}
        >
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      {/if}
    </div>

    <!-- Zoom Stepper Controls -->
    <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg text-xs font-mono">
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-l transition-colors cursor-pointer"
        onclick={() => onzoomOut?.()}
        title={$t('citation.zoomOut')}
      >
        -
      </button>
      <span class="px-2 py-1 text-[#fabd2f] font-semibold">{Math.round(zoom * 100)}%</span>
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors cursor-pointer"
        onclick={() => onzoomIn?.()}
        title={$t('citation.zoomIn')}
      >
        +
      </button>
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-r border-l border-[#3c3836] transition-colors cursor-pointer"
        onclick={() => onresetViewport?.()}
        title={$t('citation.resetViewport')}
      >
        <span class="material-symbols-outlined text-[13px] mt-0.5">center_focus_strong</span>
      </button>
    </div>
  </div>
</header>
