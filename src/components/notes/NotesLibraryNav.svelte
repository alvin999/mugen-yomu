<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';

  export let paperLibrary: PaperDocument[] = [];
  export let activePaperFilterId: string = 'all'; // 'all' or paper.id
  export let paperNotesCountMap: Record<string, number> = {};
  export let totalNotesCount: number = 0;
  export let isStarredFilter: boolean = false;

  const dispatch = createEventDispatcher<{
    selectFilter: { paperId: string };
    toggleStarred: { isStarred: boolean };
    backToWorkspace: void;
  }>();

  function handleSelect(paperId: string) {
    activePaperFilterId = paperId;
    dispatch('selectFilter', { paperId });
  }

  function handleToggleStarred() {
    isStarredFilter = !isStarredFilter;
    dispatch('toggleStarred', { isStarred: isStarredFilter });
  }
</script>

<aside class="w-64 bg-[#1d2021] border-r border-[#3c3836] flex flex-col justify-between p-3 select-none shrink-0 h-full">
  <!-- Top: Navigation Header & Paper Groups -->
  <div class="flex flex-col gap-2 overflow-hidden flex-1">
    <!-- Header -->
    <div class="flex items-center justify-between px-2 py-1.5 border-b border-[#3c3836]/70">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-[#fabd2f]">menu_book</span>
        <span class="font-bold text-xs text-[#ebdbb2]">文獻筆記庫</span>
      </div>
      <span class="font-mono text-[10px] bg-[#282828] text-[#a89984] px-1.5 py-0.5 rounded border border-[#3c3836]">
        {paperLibrary.length} 篇文獻
      </span>
    </div>

    <!-- Quick Global Filters -->
    <div class="flex flex-col gap-1 pt-1">
      <button
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {activePaperFilterId === 'all' && !isStarredFilter ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
        on:click={() => { isStarredFilter = false; handleSelect('all'); }}
      >
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">folder_copy</span>
          <span>全部精讀筆記</span>
        </div>
        <span class="font-mono text-[10px] bg-[#141617] text-[#fabd2f] px-1.5 py-0.2 rounded border border-[#3c3836]">
          {totalNotesCount}
        </span>
      </button>

      <button
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {isStarredFilter ? 'bg-[#3c3836] text-[#fabd2f] font-bold border-l-2 border-[#fabd2f]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
        on:click={handleToggleStarred}
      >
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">star</span>
          <span>重要標註與釘選</span>
        </div>
        <span class="font-mono text-[10px] text-[#7c6f64]">★</span>
      </button>
    </div>

    <div class="h-px bg-[#3c3836] my-1"></div>

    <!-- Per-Paper List -->
    <div class="flex flex-col gap-1 overflow-y-auto flex-1 pr-1">
      <span class="font-mono text-[10px] uppercase tracking-wider text-[#7c6f64] px-2 py-0.5">依論文分組</span>

      {#each paperLibrary as paper (paper.id)}
        {@const count = paperNotesCountMap[paper.id] || 0}
        {@const isSelected = activePaperFilterId === paper.id && !isStarredFilter}
        <button
          class="w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer group {isSelected ? 'bg-[#282828] border border-[#fe8019]/60 shadow-sm' : 'hover:bg-[#282828] border border-transparent'}"
          on:click={() => { isStarredFilter = false; handleSelect(paper.id); }}
          title={paper.title}
        >
          <div class="flex flex-col min-w-0 flex-1 pr-1.5">
            <span class="text-xs font-medium truncate {isSelected ? 'text-[#fe8019]' : 'text-[#ebdbb2] group-hover:text-[#fe8019]'}">
              {paper.title}
            </span>
            <span class="font-mono text-[10px] text-[#7c6f64] truncate">
              {paper.venue || '文獻庫'}
            </span>
          </div>

          <span class="font-mono text-[10px] px-1.5 py-0.2 rounded shrink-0 {count > 0 ? (isSelected ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'bg-[#141617] text-[#fabd2f] border border-[#3c3836]') : 'text-[#504945]'}">
            {count}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Bottom: Summary & Return to Reader -->
  <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
    <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-1">
      <div class="flex items-center justify-between text-[#a89984] text-[10px] font-mono">
        <span>本機儲存</span>
        <span class="text-[#b8bb26] flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-[#b8bb26]"></span>
          即時同步
        </span>
      </div>
      <span class="text-[11px] text-[#ebdbb2] font-semibold">
        共 {totalNotesCount} 則深度研讀思維觀點
      </span>
    </div>

    <button
      class="w-full py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
      on:click={() => dispatch('backToWorkspace')}
    >
      <span class="material-symbols-outlined text-[15px]">arrow_back</span>
      <span>返回閱讀工作台</span>
    </button>
  </div>
</aside>
