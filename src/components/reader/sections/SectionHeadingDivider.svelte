<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection, PaperDocument } from '../../../types/document';
  import { getSectionTitleParts } from '../controllers/readerScrollManager';

  export let sec: ChapterSection;
  export let isFocused: boolean = false;
  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher<{
    sectionClick: { secId: string };
    openOriginalToPage: { page: number; sectionId: string };
  }>();

  $: titleInfo = getSectionTitleParts(sec.title, sec.id);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<header
  id={`sec-${sec.id}`}
  class="mt-8 mb-2 pt-6 pb-4 border-b-2 border-[#fe8019]/40 flex flex-col gap-2 relative transition-all duration-300 cursor-pointer group/chapter {
    isFocused
      ? 'bg-[#32302f]/50 -mx-3 sm:-mx-4 px-3 sm:px-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
      : 'hover:border-[#fe8019]/70'
  }"
  on:click={() => dispatch('sectionClick', { secId: sec.id })}
>
  <div class="absolute -left-1 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full transition-opacity duration-300 {isFocused ? 'focus-lens-bar opacity-100' : 'opacity-0 pointer-events-none'}"></div>

  <div class="flex items-center justify-between gap-3">
    <div class="flex items-baseline gap-3 min-w-0">
      <span class="font-mono {sec.level === 1 ? 'text-base font-bold bg-[#fe8019] text-[#1d2021] px-2.5 py-0.5 rounded shadow-sm' : 'text-sm font-bold text-[#fabd2f] bg-[#282828] border border-[#504945] px-2 py-0.5 rounded'} shrink-0">
        {titleInfo.prefix === '§' ? '§' : `§ ${titleInfo.prefix}`}
      </span>
      <h2 class="{sec.level === 1 ? 'text-2xl sm:text-[26px] font-serif font-bold text-[#ebdbb2]' : 'text-lg sm:text-xl font-bold text-[#ebdbb2]'} tracking-tight truncate group-hover/chapter:text-[#fe8019] transition-colors">
        {titleInfo.mainTitle}
      </h2>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if sec.page || paper?.pdfUrl || paper?.arxivId || paper?.type === 'web'}
        <button
          class="flex items-center gap-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2.5 py-1 rounded text-xs font-mono text-[#fabd2f] transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          on:click|stopPropagation={() => dispatch('openOriginalToPage', { page: sec.page || 1, sectionId: sec.id })}
          title={paper?.type === 'web'
            ? (paper.pdfUrl ? `在原始抽屜開啟（第 ${sec.page || 1} 頁 / 章節）` : '在原始抽屜開啟原文網頁')
            : `在原始 PDF 檢視第 ${sec.page || 1} 頁`}
        >
          <span class="material-symbols-outlined text-[13px] text-[#fe8019]">
            {paper?.type === 'web' ? 'dock_to_left' : 'find_in_page'}
          </span>
          <span>
            {paper?.type === 'web'
              ? (paper.pdfUrl ? `原 p.${sec.page || 1}` : '原文抽屜')
              : `PDF p.${sec.page || 1}`} ↗
          </span>
        </button>
      {/if}

      {#if isFocused}
        <div class="flex items-center gap-1 bg-[#fe8019]/15 border border-[#fe8019]/50 px-2 py-0.5 rounded-full text-[#fe8019]">
          <span class="material-symbols-outlined text-[13px]">center_focus_strong</span>
          <span class="font-mono text-[9px] font-semibold uppercase hidden sm:inline">Chapter Active</span>
        </div>
      {/if}
    </div>
  </div>

  {#if sec.children && sec.children.length > 0}
    <div class="flex items-center gap-2 text-xs text-[#a89984] font-mono mt-0.5 pl-1">
      <span class="flex items-center gap-1 text-[#fabd2f]">
        <span class="material-symbols-outlined text-[13px]">subdirectory_arrow_right</span>
        <span>包含 {sec.children.length} 個子章節</span>
      </span>
      <span class="text-[#504945]">·</span>
      <span class="text-[#d5c4a1] truncate">
        {sec.children.map((c) => (c.title || '').split(' ')[0]).filter(Boolean).join(', ')}
      </span>
    </div>
  {/if}
</header>
