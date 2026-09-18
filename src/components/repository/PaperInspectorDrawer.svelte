<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';

  export let paper: PaperDocument | null = null;
  export let isOpen: boolean = false;
  export let progressPercent: number = 0;
  export let notesCount: number = 0;

  const dispatch = createEventDispatcher<{
    close: void;
    select: { paper: PaperDocument };
    viewCitation: { paper: PaperDocument };
    viewNotes: { paper: PaperDocument };
  }>();

  function close() {
    isOpen = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && paper}
  <!-- Backdrop for inspector drawer -->
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity"
    on:click={close}
    role="button"
    tabindex="-1"
    aria-label="點擊關閉預覽抽屜"
  ></div>

  <!-- Inspector Side Panel -->
  <div
    class="fixed right-0 top-16 bottom-0 w-full max-w-md bg-[#1d2021] border-l border-[#3c3836] shadow-2xl z-50 flex flex-col animate-slide-left select-none"
  >
    <!-- Header -->
    <div class="p-4 bg-[#141617] border-b border-[#3c3836] flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-[#fe8019]">manage_search</span>
        <span class="font-bold text-xs text-[#ebdbb2]">文獻卷宗大綱預覽</span>
      </div>
      <button
        class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors"
        on:click={close}
        title="關閉 (ESC)"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 select-text">
      <!-- Title & Badges -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          {#if paper.type === 'web'}
            <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-1.5 py-0.2 rounded font-semibold uppercase">
              網頁文章
            </span>
          {:else}
            <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1.5 py-0.2 rounded font-semibold uppercase">
              學術論文
            </span>
          {/if}
          <span class="font-mono text-[10px] text-[#a89984] bg-[#282828] px-1.5 py-0.5 rounded">
            {paper.venue}
          </span>
          {#if paper.arxivId}
            <span class="font-mono text-[10px] text-[#fabd2f] bg-[#fabd2f]/10 px-1.5 py-0.5 rounded">
              {paper.arxivId}
            </span>
          {/if}
        </div>

        <h2 class="text-sm font-bold text-[#ebdbb2] leading-snug">
          {paper.title}
        </h2>

        <span class="text-xs text-[#a89984]">
          {paper.authors.join(', ')}
        </span>
      </div>

      <!-- Quick Metrics Bar -->
      <div class="grid grid-cols-3 gap-2 bg-[#282828] border border-[#3c3836] rounded-xl p-2.5 text-center font-mono text-xs">
        <div>
          <span class="text-[10px] text-[#7c6f64] block">閱讀進度</span>
          <span class="text-[#fabd2f] font-bold">{progressPercent}%</span>
        </div>
        <div>
          <span class="text-[10px] text-[#7c6f64] block">章節總數</span>
          <span class="text-[#ebdbb2] font-bold">{paper.sections?.length || 0} 章</span>
        </div>
        <div>
          <span class="text-[10px] text-[#7c6f64] block">精讀筆記</span>
          <span class="text-[#fe8019] font-bold">{notesCount} 則</span>
        </div>
      </div>

      <!-- Abstract Section -->
      {#if paper.abstract}
        <div class="flex flex-col gap-1.5 bg-[#282828] border border-[#3c3836] rounded-xl p-3">
          <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px] text-[#fe8019]">auto_stories</span>
            文獻白話核心摘要
          </span>
          <p class="text-xs text-[#d5c4a1] leading-relaxed">
            {paper.abstract}
          </p>
        </div>
      {/if}

      <!-- Chapter Outline TOC -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">format_list_bulleted</span>
            章節目錄大綱樹 ({paper.sections?.length || 0})
          </span>
        </div>

        <div class="flex flex-col gap-1 bg-[#282828] border border-[#3c3836] rounded-xl p-2 max-h-60 overflow-y-auto">
          {#each paper.sections || [] as sec, idx}
            <div class="flex items-center justify-between py-1.5 px-2 hover:bg-[#32302f] rounded text-xs transition-colors">
              <span class="truncate text-[#ebdbb2] flex-1 min-w-0" title={sec.title}>
                {sec.title}
              </span>
              <div class="flex items-center gap-1.5 shrink-0 ml-2 font-mono text-[10px]">
                {#if sec.isRead}
                  <span class="text-[#b8bb26] flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[12px]">check_circle</span> 100%
                  </span>
                {:else if sec.progress && sec.progress > 0}
                  <span class="text-[#fabd2f]">{sec.progress}%</span>
                {:else}
                  <span class="text-[#7c6f64]">未讀</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Drawer Footer Actions -->
    <div class="p-3 bg-[#141617] border-t border-[#3c3836] flex items-center gap-2 shrink-0 select-none">
      <button
        class="flex-1 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        on:click={() => { dispatch('select', { paper }); close(); }}
      >
        <span class="material-symbols-outlined text-[16px]">menu_book</span>
        <span>立即進入研讀工作台</span>
      </button>

      <button
        class="px-3 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#83a598] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
        on:click={() => { dispatch('viewCitation', { paper }); close(); }}
        title="查看文獻引文圖譜"
      >
        <span class="material-symbols-outlined text-[16px]">hub</span>
      </button>

      <button
        class="px-3 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
        on:click={() => { dispatch('viewNotes', { paper }); close(); }}
        title="查看精讀筆記"
      >
        <span class="material-symbols-outlined text-[16px]">draw</span>
      </button>
    </div>
  </div>
{/if}
