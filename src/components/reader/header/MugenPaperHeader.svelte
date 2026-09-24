<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../../types/document';
  import AuthorInfoModal from './AuthorInfoModal.svelte';

  export let paper: PaperDocument | null = null;
  export let selectedAuthorInfo: string | null = null;
  export let isAbstractCollapsed: boolean = false;
  export let isGeneratingAbstract: boolean = false;
  export let abstractGenError: string = '';

  const dispatch = createEventDispatcher<{
    selectAuthor: { author: string };
    closeAuthorInfo: void;
    generateAbstract: void;
    toggleAbstract: void;
  }>();

  $: hasValidChineseSummary = Boolean(
    paper?.abstract?.chineseSummary &&
    paper.abstract.chineseSummary.trim().length > 0 &&
    !paper.abstract.chineseSummary.includes('此文獻已由 MUGEN YOMU')
  );

  $: rawEnglishAbstract = (paper?.abstract?.english || '').trim();
  $: isEnglishJinaNoise = rawEnglishAbstract.startsWith('Title:') || rawEnglishAbstract.startsWith('URL Source:');
  $: cleanEnglishAbstract = isEnglishJinaNoise ? '' : rawEnglishAbstract;
</script>

{#if paper}
  <header class="flex flex-col gap-3.5 bg-[#32302f] border border-[#3c3836] p-5 sm:p-6 rounded-xl relative overflow-hidden shadow-md">
    <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#3c3836]/60 pb-3">
      <div class="flex flex-wrap items-center gap-2">
        {#if paper.type === 'web'}
          <span class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 shadow-xs">
            <span class="material-symbols-outlined text-[13px]">language</span>
            <span>網頁論文 Web Article</span>
          </span>
        {:else}
          <span class="font-mono text-[10px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-2.5 py-1 rounded-md font-semibold shadow-xs flex items-center">
            {paper.venue}
          </span>
        {/if}

        {#if paper.arxivId}
          <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#a89984] px-2 py-0.5 rounded">{paper.arxivId}</span>
        {/if}

        {#if paper.citations}
          <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-2 py-0.5 rounded font-medium">
            Citations: {paper.citations}
          </span>
        {/if}
      </div>

      {#if paper.sourceUrl}
        <a
          href={paper.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-[11px] text-[#8ec07c] hover:text-[#b8bb26] hover:underline flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-[#8ec07c]/10 cursor-pointer ml-auto"
        >
          <span>查看原文</span>
          <span class="material-symbols-outlined text-[13px]">open_in_new</span>
        </a>
      {/if}
    </div>

    <h1 class="text-3xl text-[#ebdbb2] tracking-tight font-serif leading-tight font-bold">
      {paper.title}
    </h1>

    <!-- Authors Row with Popover -->
    <AuthorInfoModal
      authors={paper.authors || []}
      {selectedAuthorInfo}
      on:selectAuthor={(e) => dispatch('selectAuthor', { author: e.detail.author })}
      on:closeAuthorInfo={() => dispatch('closeAuthorInfo')}
    />

    <!-- Abstract Collapsible Card -->
    <div class="mt-1 bg-[#282828] border border-[#3c3836] p-3.5 rounded-lg flex flex-col gap-2.5 shadow-inner">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[11px] text-[#fabd2f] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[15px] text-[#fe8019]">auto_stories</span> 雙語論文核心摘要 (Bilingual Abstract Core)
          </span>
          {#if hasValidChineseSummary}
            <span class="font-mono text-[9px] bg-[#8ec07c]/15 text-[#8ec07c] border border-[#8ec07c]/30 px-1.5 py-0.2 rounded font-medium">
              已提煉
            </span>
          {/if}
        </div>

        <div class="flex items-center gap-2 shrink-0 ml-auto">
          {#if isGeneratingAbstract}
            <span class="font-mono text-[10px] text-[#fe8019] flex items-center gap-1 animate-pulse">
              <span class="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
              <span>AI 提煉中...</span>
            </span>
          {:else if !hasValidChineseSummary}
            <button
              class="font-mono text-[10px] bg-[#fe8019]/20 hover:bg-[#fe8019]/30 border border-[#fe8019]/50 hover:border-[#fe8019] text-[#fabd2f] px-2.5 py-0.5 rounded flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
              on:click={() => dispatch('generateAbstract')}
              title="由 AI 提煉論文核心導讀"
            >
              <span class="material-symbols-outlined text-[12px]">auto_awesome</span>
              <span>生成導讀</span>
            </button>
          {:else}
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5 transition-colors cursor-pointer"
              on:click={() => dispatch('generateAbstract')}
              title="重新調用 AI 精煉核心導讀"
            >
              <span class="material-symbols-outlined text-[12px]">refresh</span>
              <span>重刷</span>
            </button>
          {/if}

          <button
            class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 transition-colors cursor-pointer ml-1"
            on:click={() => dispatch('toggleAbstract')}
          >
            <span>{isAbstractCollapsed ? '展開' : '收起'}</span>
            <span class="material-symbols-outlined text-[13px]">{isAbstractCollapsed ? 'expand_more' : 'expand_less'}</span>
          </button>
        </div>
      </div>

      {#if !isAbstractCollapsed}
        <div class="flex flex-col gap-2.5 text-xs pt-0.5">
          {#if abstractGenError}
            <div class="bg-[#cc241d]/15 border border-[#cc241d]/40 text-[#fb4934] p-2 rounded text-[11px] flex items-center justify-between gap-2">
              <span>{abstractGenError}</span>
              <button
                class="underline hover:text-[#ebdbb2] cursor-pointer text-[10px]"
                on:click={() => dispatch('generateAbstract')}
              >
                重試
              </button>
            </div>
          {/if}

          {#if hasValidChineseSummary}
            <p class="text-[#d5c4a1] leading-relaxed text-justify">
              {paper.abstract?.chineseSummary}
            </p>
            {#if cleanEnglishAbstract}
              <p class="font-serif text-[#a89984] italic leading-relaxed border-t border-[#3c3836] pt-2 text-[13px]">
                "{cleanEnglishAbstract}"
              </p>
            {/if}
          {:else}
            <div class="bg-[#32302f]/60 border border-[#504945]/40 rounded-lg p-2.5 flex items-center gap-2 text-[#a89984] text-[11px]">
              <span class="material-symbols-outlined text-[#fe8019] text-[16px] shrink-0">psychology</span>
              <span>尚未建立繁體中文核心導讀。可點擊右上角「生成導讀」由 AI 提煉論文核心精華。</span>
            </div>

            {#if cleanEnglishAbstract}
              <p class="font-serif text-[#a89984] italic leading-relaxed border-t border-[#3c3836] pt-2 text-[13px]">
                "{cleanEnglishAbstract}"
              </p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </header>
{/if}
