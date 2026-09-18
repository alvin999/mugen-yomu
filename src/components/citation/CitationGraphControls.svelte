<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CitationCategory } from '../../services/citationService';
  import type { CitationAnalysisStatus } from '../../services/citationAnalysisService';

  export let paperTitle: string = 'Attention Is All You Need';
  export let visibleNodesCount: number = 0;
  export let visibleEdgesCount: number = 0;
  export let layoutMode: 'galaxy' | 'timeline' = 'galaxy';
  export let filterCategory: 'all' | CitationCategory = 'all';
  export let searchQuery: string = '';
  export let zoom: number = 1.0;
  export let isAnalyzing: boolean = false;
  export let isAnalyzed: boolean = false;
  export let analysisStatus: CitationAnalysisStatus | null = null;

  const dispatch = createEventDispatcher<{
    backToWorkspace: void;
    switchLayout: 'galaxy' | 'timeline';
    startAnalysis: { forceRefresh: boolean };
    zoomIn: void;
    zoomOut: void;
    resetViewport: void;
  }>();
</script>

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
            {visibleNodesCount} 篇關聯文獻 · {visibleEdgesCount} 條引證傳承
          </span>
        </div>
        <span class="text-[10px] text-[#a89984] truncate max-w-md">
          當前研讀標的：{paperTitle}
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
        on:click={() => dispatch('switchLayout', 'galaxy')}
        title="力導向星系圖：以核心論文為引力中心放射展開"
      >
        <span class="material-symbols-outlined text-[14px]">bubble_chart</span>
        <span>星系拓撲</span>
      </button>
      <button
        class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors {layoutMode === 'timeline' ? 'bg-[#3c3836] text-[#fe8019] font-bold shadow-inner' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        on:click={() => dispatch('switchLayout', 'timeline')}
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

  <!-- Right: Search Input, AI Dynamic Analysis & Zoom Controls -->
  <div class="flex items-center gap-2">
    <!-- AI Topology Analysis Button -->
    {#if isAnalyzing}
      <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fabd2f]/15 border border-[#fabd2f]/50 text-[#fabd2f] text-xs font-mono shadow-sm animate-pulse">
        <span class="material-symbols-outlined text-[14px] animate-spin">sync</span>
        <span class="truncate max-w-[150px]">{analysisStatus?.message || 'AI 拓撲剖析中...'}</span>
      </div>
    {:else if isAnalyzed}
      <div class="flex items-center gap-1 bg-[#282828] border border-[#3c3836] p-0.5 rounded-lg">
        <span class="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#b8bb26] font-semibold">
          <span class="material-symbols-outlined text-[13px]">verified</span>
          <span>已由 AI 深度分析</span>
        </span>
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-[#a89984] hover:text-[#fe8019] hover:bg-[#32302f] transition-colors cursor-pointer"
          on:click={() => dispatch('startAnalysis', { forceRefresh: true })}
          title="重新調用 OpenAlex 與 AI 伴讀推導最新拓撲"
        >
          <span class="material-symbols-outlined text-[13px]">refresh</span>
          <span>重跑</span>
        </button>
      </div>
    {:else}
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fe8019] hover:bg-[#d65d0e] text-[#141617] font-bold text-xs font-mono transition-all shadow-md hover:shadow-lg cursor-pointer"
        on:click={() => dispatch('startAnalysis', { forceRefresh: false })}
        title="透過 OpenAlex 學術檢索與 AI 伴讀推導真實星系圖譜"
      >
        <span class="material-symbols-outlined text-[15px]">psychology</span>
        <span>⚡ AI 引文動態剖析</span>
      </button>
    {/if}

    <div class="h-4 w-px bg-[#3c3836]"></div>

    <!-- Search Input -->
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

    <!-- Zoom Stepper Controls -->
    <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg text-xs font-mono">
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-l transition-colors"
        on:click={() => dispatch('zoomOut')}
        title="縮小"
      >
        -
      </button>
      <span class="px-2 py-1 text-[#fabd2f] font-semibold">{Math.round(zoom * 100)}%</span>
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
        on:click={() => dispatch('zoomIn')}
        title="放大"
      >
        +
      </button>
      <button
        class="px-2 py-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-r border-l border-[#3c3836] transition-colors"
        on:click={() => dispatch('resetViewport')}
        title="重設視角與置中"
      >
        <span class="material-symbols-outlined text-[13px] mt-0.5">center_focus_strong</span>
      </button>
    </div>
  </div>
</header>
