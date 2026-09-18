<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';

  export let paper: PaperDocument;
  export let isActive: boolean = false;
  export let progressPercent: number = 0;
  export let notesCount: number = 0;

  const dispatch = createEventDispatcher<{
    select: { paper: PaperDocument };
    viewCitation: { paper: PaperDocument };
    viewNotes: { paper: PaperDocument };
    preview: { paper: PaperDocument };
    delete: { id: string };
  }>();

  // 計算圖表與公式數量
  $: formulaCount = paper.sections?.reduce((sum, s) => sum + (s.formulas?.length || 0), 0) || 0;
  $: figureCount = paper.sections?.reduce((sum, s) => sum + (s.figures?.length || 0), 0) || 0;
  $: sectionCount = paper.sections?.length || 0;
</script>

<div
  class="bg-[#282828] border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all duration-200 hover:shadow-lg group relative {isActive ? 'border-[#fe8019] shadow-[0_0_15px_rgba(254,128,25,0.15)] bg-[#2c2826]' : 'border-[#3c3836] hover:border-[#504945]'}"
>
  <!-- Card Header: Badges & Active/Delete -->
  <div class="flex items-start justify-between gap-2">
    <div class="flex flex-wrap items-center gap-1.5">
      {#if paper.type === 'web'}
        <span class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-[11px]">language</span> 網頁專文
        </span>
      {:else}
        <span class="font-mono text-[10px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-2 py-0.5 rounded font-semibold uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-[11px]">description</span> 學術論文
        </span>
      {/if}

      <span class="font-mono text-[11px] text-[#a89984] bg-[#1d2021] border border-[#3c3836] px-1.5 py-0.5 rounded truncate max-w-[140px]">
        {paper.venue || '學術專刊'}
      </span>

      {#if paper.arxivId}
        <span class="font-mono text-[10px] text-[#fabd2f] bg-[#fabd2f]/10 border border-[#fabd2f]/30 px-1.5 py-0.5 rounded">
          {paper.arxivId}
        </span>
      {/if}
    </div>

    <!-- Active Indicator or Delete Button -->
    <div class="flex items-center gap-1 shrink-0">
      {#if isActive}
        <span class="font-mono text-[11px] text-[#fe8019] bg-[#fe8019]/10 border border-[#fe8019]/40 px-2 py-0.5 rounded-full flex items-center gap-1.5 font-semibold">
          <span class="h-1.5 w-1.5 rounded-full bg-[#fe8019] animate-pulse"></span>
          研讀中
        </span>
      {:else}
        <button
          class="w-6 h-6 rounded flex items-center justify-center text-[#7c6f64] hover:text-[#fb4934] hover:bg-[#1d2021] transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
          title="自文獻庫移除"
          on:click={() => dispatch('delete', { id: paper.id })}
        >
          <span class="material-symbols-outlined text-[15px]">delete</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Title and Authors -->
  <div class="flex flex-col gap-1.5 flex-1 min-w-0">
    <h3
      class="text-sm font-bold text-[#ebdbb2] group-hover:text-[#fe8019] transition-colors line-clamp-2 leading-snug cursor-pointer select-text"
      on:click={() => dispatch('select', { paper })}
      title={paper.title}
    >
      {paper.title}
    </h3>

    <span class="text-xs text-[#a89984] truncate select-text">
      {paper.authors.join(', ')}
    </span>

    <!-- Abstract Snippet (if available) -->
    {#if paper.abstract}
      <p class="text-[11px] text-[#7c6f64] line-clamp-2 leading-relaxed mt-1 select-text">
        {paper.abstract}
      </p>
    {/if}
  </div>

  <!-- Reading Progress Bar -->
  <div class="flex flex-col gap-1 pt-1 border-t border-[#3c3836]/60">
    <div class="flex items-center justify-between text-[11px] font-mono">
      <span class="text-[#a89984]">精讀掌握度</span>
      <span class={progressPercent >= 100 ? 'text-[#b8bb26] font-semibold' : 'text-[#fabd2f]'}>
        {progressPercent}%
      </span>
    </div>
    <div class="w-full bg-[#1d2021] h-1.5 rounded-full overflow-hidden">
      <div
        class="h-full transition-all duration-500 {progressPercent >= 100 ? 'bg-[#b8bb26]' : 'bg-[#fabd2f]'}"
        style="width: {Math.max(2, Math.min(100, progressPercent))}%"
      ></div>
    </div>
  </div>

  <!-- Footer Stats: Sections, Formulas, Figures, Notes -->
  <div class="grid grid-cols-4 gap-1 py-1.5 px-2 bg-[#1d2021]/80 rounded-lg text-center font-mono text-[10px] text-[#a89984] border border-[#32302f]">
    <div title="章節數量">
      <span class="text-[#ebdbb2] font-semibold block">{sectionCount}</span>
      <span>章節</span>
    </div>
    <div title="LaTeX 公式數量">
      <span class="text-[#fabd2f] font-semibold block">{formulaCount}</span>
      <span>公式</span>
    </div>
    <div title="學術圖表數量">
      <span class="text-[#8ec07c] font-semibold block">{figureCount}</span>
      <span>圖表</span>
    </div>
    <div title="精讀筆記數量">
      <span class="text-[#fe8019] font-semibold block">{notesCount}</span>
      <span>筆記</span>
    </div>
  </div>

  <!-- Bottom Action Buttons -->
  <div class="flex items-center gap-1.5 pt-1">
    <button
      class="flex-1 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold text-xs rounded-lg flex items-center justify-center gap-1 transition-colors shadow-sm cursor-pointer"
      on:click={() => dispatch('select', { paper })}
      title="進入閱讀工作台開始研讀"
    >
      <span class="material-symbols-outlined text-[15px]">menu_book</span>
      <span>進入研讀</span>
    </button>

    <button
      class="px-2.5 py-1.5 bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#83a598] text-[#a89984] hover:text-[#83a598] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
      on:click={() => dispatch('viewCitation', { paper })}
      title="查看引文星系圖譜"
    >
      <span class="material-symbols-outlined text-[15px]">hub</span>
    </button>

    <button
      class="px-2.5 py-1.5 bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fabd2f] text-[#a89984] hover:text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
      on:click={() => dispatch('viewNotes', { paper })}
      title="查閱本篇精讀筆記"
    >
      <span class="material-symbols-outlined text-[15px]">draw</span>
    </button>

    <button
      class="px-2.5 py-1.5 bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#a89984] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
      on:click={() => dispatch('preview', { paper })}
      title="預覽大綱與摘要"
    >
      <span class="material-symbols-outlined text-[15px]">visibility</span>
    </button>
  </div>
</div>
