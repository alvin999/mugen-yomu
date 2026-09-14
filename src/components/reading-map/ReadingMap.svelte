<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection } from '../../stores/documentStore';
  import { calculateReadingStats } from '../../stores/readingStore';

  export let sections: ChapterSection[] = [];
  export let activeSectionId: string = '3.2.1';
  export let arxivId: string | undefined = undefined;
  export let sourceUrl: string | undefined = undefined;

  const dispatch = createEventDispatcher();

  let searchQuery: string = '';

  $: readingStats = calculateReadingStats(sections);
  $: deepCoveragePercent = readingStats.deepCoveragePercent;
  $: skimCoveragePercent = readingStats.skimCoveragePercent;
  $: deepWords = readingStats.deepWords;
  $: totalWords = readingStats.totalWords;

  // Filter sections recursively based on search query
  $: filteredSections = filterSections(sections, searchQuery.toLowerCase().trim());

  function filterSections(secs: ChapterSection[], query: string): ChapterSection[] {
    if (!query) return secs;
    const result: ChapterSection[] = [];

    for (const sec of secs) {
      const titleMatch = sec.title.toLowerCase().includes(query);
      const contentMatch = (sec.paragraphs || []).some(p => p.toLowerCase().includes(query));
      const childMatches = sec.children ? filterSections(sec.children, query) : [];

      if (titleMatch || contentMatch || childMatches.length > 0) {
        result.push({
          ...sec,
          children: childMatches.length > 0 ? childMatches : sec.children
        });
      }
    }
    return result;
  }

  function selectSection(id: string) {
    activeSectionId = id;
    dispatch('selectSection', { id, source: 'outline' });
  }

  function toggleSectionRead(id: string, e: MouseEvent) {
    e.stopPropagation();
    dispatch('toggleSectionRead', { id });
  }

  function resetProgress() {
    if (confirm('確定要重設本篇論文的閱讀進度嗎？')) {
      dispatch('resetProgress');
    }
  }

  function selectFigure(figId: string) {
    dispatch('selectFigure', { figId });
  }

  function selectEquation(eqId: string) {
    dispatch('selectEquation', { eqId });
  }

  let collapsedSections: Record<string, boolean> = {};

  function toggleSectionCollapse(id: string, e: MouseEvent) {
    e.stopPropagation();
    collapsedSections[id] = !collapsedSections[id];
    collapsedSections = { ...collapsedSections };
  }
</script>

<aside class="h-full flex flex-col bg-[#1d2021] border-r border-[#3c3836] overflow-hidden select-none">
  <!-- Search Bar with Live Filter -->
  <div class="p-2 bg-[#1d2021] shrink-0 border-b border-[#3c3836]">
    <div class="relative flex items-center">
      <span class="material-symbols-outlined absolute left-2 text-[15px] text-[#a89984]">search</span>
      <input
        class="w-full bg-[#282828] border border-[#3c3836] text-[#ebdbb2] placeholder:text-[#a89984]/70 text-xs pl-7 pr-7 py-1.5 rounded-lg focus:outline-none focus:border-[#fe8019] focus:bg-[#32302f] transition-colors"
        placeholder="搜尋段落、定理、公式或名詞..."
        type="text"
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          class="absolute right-2 text-[#a89984] hover:text-[#ebdbb2]"
          on:click={() => searchQuery = ''}
        >
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-3">
    <!-- Progress Heatmap Badge -->
    <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
      <div class="flex items-center justify-between text-[#a89984]">
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[10px] uppercase tracking-wider text-[#ebdbb2] font-semibold">精讀覆蓋率</span>
          <span class="text-[10px] font-mono text-[#b8bb26] font-bold" title="已精讀研讀比例">{deepCoveragePercent}%</span>
          {#if skimCoveragePercent > 0}
            <span class="text-[9px] font-mono text-[#fabd2f]/90" title="已瀏覽掃讀比例">(+{skimCoveragePercent}% 掃讀)</span>
          {/if}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[11px] text-[#fabd2f] font-semibold">
            {deepWords.toLocaleString()} / {totalWords.toLocaleString()} 字
          </span>
          <button
            class="text-[#a89984] hover:text-[#fe8019] transition-colors p-0.5 rounded cursor-pointer"
            on:click={resetProgress}
            title="重設此篇閱讀進度"
          >
            <span class="material-symbols-outlined text-[13px]">restart_alt</span>
          </button>
        </div>
      </div>
      <!-- Dual-Track Real Progress Bar -->
      <div class="w-full h-2 bg-[#141617] rounded-full overflow-hidden flex border border-[#3c3836]/80" title="綠色: 精讀掌握度 {deepCoveragePercent}% / 黃色: 瀏覽掃讀度 {skimCoveragePercent}%">
        <div class="bg-[#b8bb26] h-full transition-all duration-300" style="width: {deepCoveragePercent}%"></div>
        <div class="bg-[#fabd2f]/50 h-full transition-all duration-300" style="width: {skimCoveragePercent}%"></div>
      </div>
      <div class="flex items-center justify-between font-mono text-[10px] text-[#a89984] leading-tight">
        <span>視線停留於 <strong class="text-[#fe8019]">§{activeSectionId}</strong></span>
        <span class="text-[#b8bb26] flex items-center gap-0.5">
          <span class="h-1.5 w-1.5 rounded-full bg-[#b8bb26] inline-block animate-pulse"></span>
          即時動態追蹤
        </span>
      </div>
    </div>

    <!-- Outline Structure Tree -->
    <div class="flex flex-col gap-0.5">
      <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] px-2 mb-1 flex items-center justify-between">
        <span>目錄樹 (Structure)</span>
        {#if searchQuery}
          <span class="text-[#fabd2f]">過濾中</span>
        {/if}
      </span>

      {#if filteredSections.length === 0}
        <div class="p-3 text-center text-[#a89984] text-xs font-mono">
          未找到匹配「{searchQuery}」之章節
        </div>
      {/if}

      {#each filteredSections as section}
        <!-- Level 1 Section -->
        <div class="flex flex-col">
          <div
            class="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors {activeSectionId === section.id ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          >
            <!-- Toggle Checkmark / Icon -->
            <button
              class="flex items-center gap-2 min-w-0 flex-1 text-left bg-transparent border-0 p-0 text-inherit cursor-pointer group/check"
              on:click={() => selectSection(section.id)}
            >
              <span
                class="hover:scale-125 transition-transform flex items-center shrink-0 cursor-pointer"
                on:click={(e) => toggleSectionRead(section.id, e)}
                title={section.isRead ? "點擊標記為未讀" : "點擊標記為已讀"}
              >
                {#if section.isRead}
                  <span class="material-symbols-outlined text-[16px] text-[#b8bb26]">check_circle</span>
                {:else if section.progress >= 70}
                  <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">timelapse</span>
                {:else if activeSectionId === section.id}
                  <span class="material-symbols-outlined text-[16px] text-[#fe8019] animate-pulse">center_focus_strong</span>
                {:else if section.progress > 0}
                  <span class="material-symbols-outlined text-[16px] text-[#fabd2f]/70">radio_button_checked</span>
                {:else}
                  <span class="material-symbols-outlined text-[16px] text-[#665c54] group-hover/check:text-[#a89984]">radio_button_unchecked</span>
                {/if}
              </span>
              <span class="text-xs truncate">{section.title}</span>
            </button>

            <div class="flex items-center gap-1 shrink-0">
              {#if section.isRead}
                <span class="font-mono text-[10px] text-[#b8bb26] font-semibold">100%</span>
              {:else if section.progress > 0}
                <span class="font-mono text-[10px] text-[#fabd2f]">{section.progress}%</span>
              {/if}

              {#if section.children && section.children.length > 0}
                <button
                  class="w-5 h-5 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#504945]/40 transition-colors"
                  on:click={(e) => toggleSectionCollapse(section.id, e)}
                  title={collapsedSections[section.id] ? "展開子章節" : "收合子章節"}
                >
                  <span class="material-symbols-outlined text-[16px]">
                    {collapsedSections[section.id] ? 'chevron_right' : 'expand_more'}
                  </span>
                </button>
              {/if}
            </div>
          </div>

          <!-- Level 2 Children -->
          {#if section.children && section.children.length > 0 && !collapsedSections[section.id]}
            <div class="ml-2.5 pl-2.5 flex flex-col gap-0.5 mt-0.5 border-l border-[#504945]">
              {#each section.children as sub}
                <div
                  class="w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors {activeSectionId === sub.id ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]'}"
                >
                  <button
                    class="flex-1 text-left truncate text-xs bg-transparent border-0 p-0 text-inherit cursor-pointer flex items-center gap-1.5"
                    on:click={() => selectSection(sub.id)}
                  >
                    <span
                      class="hover:scale-125 transition-transform flex items-center shrink-0 cursor-pointer"
                      on:click={(e) => toggleSectionRead(sub.id, e)}
                      title={sub.isRead ? "點擊標記為未讀" : "點擊標記為已讀"}
                    >
                      {#if sub.isRead}
                        <span class="material-symbols-outlined text-[13px] text-[#b8bb26]">check_circle</span>
                      {:else if sub.progress > 0}
                        <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">timelapse</span>
                      {:else}
                        <span class="material-symbols-outlined text-[13px] text-[#665c54]">radio_button_unchecked</span>
                      {/if}
                    </span>
                    <span class="truncate">{sub.title}</span>
                  </button>

                  <div class="flex items-center gap-1 shrink-0">
                    {#if activeSectionId === sub.id}
                      <span class="h-1.5 w-1.5 rounded-full bg-[#fe8019] animate-ping mr-1"></span>
                    {/if}

                    {#if sub.children && sub.children.length > 0}
                      <button
                        class="w-4 h-4 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2]"
                        on:click={(e) => toggleSectionCollapse(sub.id, e)}
                      >
                        <span class="material-symbols-outlined text-[14px]">
                          {collapsedSections[sub.id] ? 'chevron_right' : 'expand_more'}
                        </span>
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Level 3 Children -->
                {#if sub.children && sub.children.length > 0 && !collapsedSections[sub.id]}
                  <div class="ml-2 pl-2 border-l border-[#504945]/70 flex flex-col gap-0.5 py-0.5">
                    {#each sub.children as subsub}
                      <button
                        class="w-full text-left px-1.5 py-0.5 font-mono text-[10px] rounded transition-colors flex items-center gap-1 {activeSectionId === subsub.id ? 'bg-[#32302f] text-[#fabd2f] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
                        on:click={() => selectSection(subsub.id)}
                      >
                        <span class="material-symbols-outlined text-[11px] {activeSectionId === subsub.id ? 'text-[#fe8019]' : 'text-[#665c54]'}">arrow_right</span>
                        <span class="truncate">{subsub.title}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Figures & Equations Quick-Deck -->
    <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
      <div class="flex items-center justify-between px-1">
        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984]">關鍵圖表與推導索引</span>
        <span class="font-mono text-[10px] text-[#fabd2f] hover:underline cursor-pointer">All</span>
      </div>

      <!-- Mini Figure Card -->
      <div
        class="bg-[#282828] border border-[#3c3836] p-2 rounded-lg hover:bg-[#32302f] hover:border-[#504945] transition-colors cursor-pointer flex gap-2 group"
        on:click={() => selectFigure('fig1')}
        role="button"
        tabindex="0"
      >
        <div class="w-12 h-14 bg-[#1d2021] border border-[#3c3836] rounded shrink-0 overflow-hidden relative flex items-center justify-center p-1">
          <svg class="w-full h-full text-[#fabd2f] opacity-80 group-hover:opacity-100 transition-opacity" viewBox="0 0 40 50">
            <rect fill="currentColor" fill-opacity="0.2" height="8" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="4"></rect>
            <rect fill="currentColor" fill-opacity="0.4" height="12" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="16"></rect>
            <rect fill="currentColor" fill-opacity="0.2" height="14" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="32"></rect>
            <path d="M 20 12 L 20 16 M 20 28 L 20 32" stroke="currentColor" stroke-width="1.2"></path>
          </svg>
          <span class="absolute bottom-0.5 right-0.5 font-mono text-[8px] bg-[#1d2021] border border-[#504945] px-0.5 rounded text-[#a89984]">Fig 1</span>
        </div>
        <div class="flex flex-col justify-center min-w-0">
          <span class="text-xs text-[#ebdbb2] font-medium truncate">The Triad Workspace</span>
          <span class="font-mono text-[10px] text-[#a89984] truncate">三欄工作台架構與推導</span>
        </div>
      </div>

      <!-- Mini Equation Card -->
      <div
        class="bg-[#282828] border border-[#3c3836] border-l-4 border-l-[#fabd2f] p-2 rounded-lg hover:bg-[#32302f] transition-colors cursor-pointer flex flex-col gap-1"
        on:click={() => selectEquation('eq_efficiency')}
        role="button"
        tabindex="0"
      >
        <div class="flex items-center justify-between text-[#a89984]">
          <span class="font-mono text-[10px] text-[#fabd2f] font-semibold">Eq. (1)</span>
          <span class="font-mono text-[10px]">Efficiency Model</span>
        </div>
        <div class="font-mono text-[#ebdbb2] bg-[#1d2021] border border-[#3c3836] px-1.5 py-1 rounded tracking-tight text-[10px] truncate">
          η = (C · (1 + γ)) / (ln(τ + 1) · √Ω)
        </div>
      </div>
    </div>
  </div>

  <!-- Left Bottom System Pill -->
  <div class="p-2 bg-[#141617] border-t border-[#3c3836] shrink-0">
    <div class="flex items-center justify-between text-[#a89984] font-mono text-[10px]">
      <span class="flex items-center gap-1.5 truncate max-w-[180px]">
        <span class="h-1.5 w-1.5 rounded-full bg-[#b8bb26] shrink-0"></span>
        {#if arxivId}
          {arxivId}
        {:else if sourceUrl}
          {new URL(sourceUrl).hostname}
        {:else}
          LOCAL ARCHIVE
        {/if}
      </span>
      <span class="font-mono text-[#d5c4a1] shrink-0">MUGEN v2.4</span>
    </div>
  </div>
</aside>
