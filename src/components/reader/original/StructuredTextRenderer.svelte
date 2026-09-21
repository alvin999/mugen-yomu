<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../../types/document';
  import { normalizeParagraphs } from '../../../utils/paragraphUtils';
  import { renderMath } from '../../../utils/katexUtils';

  export let paper: PaperDocument | null = null;
  export let allSections: ChapterSection[] = [];
  export let activeSectionId: string = '';
  export let mode: 'split' | 'drawer' = 'split';
  export let isPdf: boolean = false;
  export let paperTheme: 'parchment' | 'dark' = 'parchment';

  const dispatch = createEventDispatcher<{
    sectionClick: { sectionId: string };
    openLightbox: { url: string; caption?: string };
    retryPdf: void;
  }>();

  let paperFontSize: 'normal' | 'large' = 'normal';

  function formatParagraphWithMath(text: string): string {
    if (!text) return '';
    if (!text.includes('$')) return text;

    const parts: string[] = [];
    let lastIndex = 0;
    const regex = /\$([^$\n]+?)\$/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const math = match[1].trim();
      const rendered = renderMath(math, false);
      parts.push(`<span class="inline-math px-0.5 align-baseline">${rendered}</span>`);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.join('');
  }
</script>

<div class="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center select-text font-serif">
  <!-- Structured Reader View Control Header -->
  <div class="w-full max-w-5xl px-4 py-2 border-b border-[#3c3836] flex flex-wrap items-center justify-between gap-2 font-mono text-xs bg-[#181a1b] shrink-0 sticky top-0 z-10">
    <div class="flex items-center gap-2">
      <span class="font-bold text-[#fabd2f] flex items-center gap-1">
        <span class="material-symbols-outlined text-[15px]">menu_book</span>
        學術擬真排版模式 (Academic Structured Edition)
      </span>
      <span class="text-[11px] text-[#a89984]">
        {allSections.length} 章節 · 完整圖表與 KaTeX 公式
      </span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Paper Sheet Theme Switcher -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 text-[11px]">
        <button
          class="px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer {paperTheme === 'parchment' ? 'bg-[#fcfbf9] text-[#1d2021] font-bold shadow-xs' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => paperTheme = 'parchment'}
          title="經典米白論文紙張"
        >
          <span>📜</span>
          <span>紙本</span>
        </button>
        <button
          class="px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer {paperTheme === 'dark' ? 'bg-[#fe8019] text-[#1d2021] font-bold shadow-xs' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => paperTheme = 'dark'}
          title="深邃學者夜間模式"
        >
          <span>🌙</span>
          <span>夜間</span>
        </button>
      </div>

      <!-- Font Size Toggle -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 text-[11px]">
        <button
          class="px-1.5 py-0.5 rounded transition-colors cursor-pointer {paperFontSize === 'normal' ? 'bg-[#3c3836] text-[#ebdbb2] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => paperFontSize = 'normal'}
          title="標準字體"
        >A</button>
        <button
          class="px-1.5 py-0.5 rounded transition-colors cursor-pointer {paperFontSize === 'large' ? 'bg-[#3c3836] text-[#ebdbb2] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => paperFontSize = 'large'}
          title="放大字體"
        >A+</button>
      </div>

      {#if isPdf}
        <button
          class="text-[#fabd2f] hover:underline cursor-pointer flex items-center gap-0.5 text-[11px] ml-1"
          on:click={() => dispatch('retryPdf')}
          title="嘗試載入 PDF 向量畫布"
        >
          <span class="material-symbols-outlined text-[13px]">brush</span>
          <span>畫布</span>
        </button>
      {/if}
    </div>
  </div>

  {#if paper}
    <!-- Physical Paper Sheet Canvas Container -->
    <article
      class="w-full {mode === 'split' ? 'max-w-none' : 'max-w-[840px]'} my-2 transition-all duration-300 rounded-sm shadow-2xl p-6 sm:p-12 mb-20 {
        paperTheme === 'parchment'
          ? 'bg-[#fcfbf9] text-[#1c1b1a] border border-[#e2ded6]'
          : 'bg-[#1d2021] text-[#ebdbb2] border border-[#3c3836]'
      }"
    >
      <!-- 1. Academic Journal Masthead & Header Lines -->
      <header class="mb-6">
        <div class="border-t-[3px] border-b border-current pt-1.5 pb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] {paperTheme === 'parchment' ? 'text-[#3c3836]' : 'text-[#a89984]'}">
          <div class="flex items-center gap-2 font-bold">
            <span class="text-[#fe8019] tracking-wider uppercase">{paper.venue || 'Academic Journal'}</span>
            <span>·</span>
            <span class="font-medium">{paper.arxivId || 'Open Access Scientific Report'}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="bg-[#2ea043]/15 text-[#2ea043] border border-[#2ea043]/40 font-bold px-1.5 py-0.2 rounded text-[10px] uppercase tracking-wider">
              OPEN ACCESS
            </span>
            {#if paper.sourceUrl}
              <a
                href={paper.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:underline flex items-center gap-0.5 {paperTheme === 'parchment' ? 'text-[#0969da]' : 'text-[#8ec07c]'}"
                title="官方刊載 DOI / 來源網址"
              >
                <span>DOI / 原文</span>
                <span class="material-symbols-outlined text-[12px]">open_in_new</span>
              </a>
            {/if}
          </div>
        </div>

        <!-- Article Type Banner -->
        <div class="mt-4 mb-2 font-mono text-[10px] font-bold tracking-widest uppercase {paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'}">
          Research Article · Peer-Reviewed Academic Publication
        </div>

        <!-- Paper Main Title -->
        <h1 class="font-serif text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-4 {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'}">
          {paper.title}
        </h1>

        <!-- Publication Meta -->
        <div class="text-xs font-serif italic mb-6 pb-4 border-b border-current/20 flex flex-wrap items-center gap-x-4 gap-y-1 {paperTheme === 'parchment' ? 'text-[#57606a]' : 'text-[#a89984]'}">
          <span>Published online by MUGEN YOMU Academic Reader</span>
          <span>·</span>
          <span>Comprehensive Structured Edition</span>
        </div>
      </header>

      <!-- 2. Structured Sections Flow -->
      <div class="flex flex-col gap-6">
        {#each allSections as sec, sIndex (sec.id)}
          {@const isFocused = sec.id === activeSectionId}
          <section
            id={`text-sec-${sec.id}`}
            class="flex flex-col transition-all duration-300 rounded p-3 -mx-3 border {
              isFocused
                ? (paperTheme === 'parchment' ? 'bg-[#f0ebe0] border-[#fe8019]/80 shadow-xs' : 'bg-[#282828] border-[#fe8019]/80 shadow-xs')
                : 'border-transparent hover:border-current/10'
            }"
          >
            <!-- Section Heading -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="flex items-baseline justify-between gap-2 border-b border-current/20 pb-1.5 mb-3 cursor-pointer group/sec-header"
              on:click={() => dispatch('sectionClick', { sectionId: sec.id })}
              title="點擊定位章節"
            >
              <h2 class="font-serif text-base sm:text-lg font-bold flex items-baseline gap-2 {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'} group-hover/sec-header:text-[#fe8019] transition-colors">
                <span class="font-mono text-sm {paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fe8019]'}">
                  § {sec.id}
                </span>
                <span>{sec.title.replace(/^[0-9.]+\s*/, '')}</span>
              </h2>
              {#if sec.page}
                <span class="font-mono text-[11px] {paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'} shrink-0">
                  p.{sec.page}
                </span>
              {/if}
            </div>

            <!-- Paragraphs & Inline Figures / Math -->
            <div class="flex flex-col gap-3">
              {#each normalizeParagraphs(sec.paragraphs) as item, itemIdx}
                {#if item.type === 'subheading'}
                  <div class="mt-3 mb-1 pt-1 pb-1 border-b border-current/20 flex items-center gap-1.5">
                    <span class="w-1 h-3 bg-[#fe8019] rounded-xs shrink-0"></span>
                    <h3 class="font-serif font-bold text-sm sm:text-base {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'}">
                      {item.text}
                    </h3>
                  </div>
                {:else if item.type === 'image' && item.url}
                  <figure class="my-4 p-4 rounded-lg flex flex-col items-center gap-2 border {
                    paperTheme === 'parchment'
                      ? 'bg-[#f4efe6] border-[#ded7ca]'
                      : 'bg-[#141617] border-[#3c3836]'
                  }">
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                    <div
                      class="w-full flex items-center justify-center p-2 rounded cursor-zoom-in group"
                      on:click|stopPropagation={() => dispatch('openLightbox', { url: item.url || '', caption: item.alt })}
                    >
                      <img
                        src={item.url}
                        alt={item.alt || ''}
                        referrerpolicy="no-referrer"
                        class="max-h-[380px] max-w-full rounded object-contain shadow-xs transition-transform group-hover:scale-[1.01]"
                        loading="lazy"
                      />
                    </div>
                    <figcaption class="text-xs font-serif text-center max-w-[92%] leading-relaxed mt-1 {
                      paperTheme === 'parchment' ? 'text-[#57606a]' : 'text-[#a89984]'
                    }">
                      <strong class="font-mono {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#ebdbb2]'}">
                        Figure {sIndex + 1}.{itemIdx + 1}
                      </strong>
                      <span class="ml-1">{item.alt || '學術圖表'}</span>
                    </figcaption>
                  </figure>
                {:else if item.type === 'formula' && item.latex}
                  <div class="my-3 py-2 px-4 rounded flex items-center justify-between border {
                    paperTheme === 'parchment'
                      ? 'bg-[#f7f4ed] border-[#e2ded6]'
                      : 'bg-[#141617] border-[#3c3836]'
                  }">
                    <div class="overflow-x-auto text-center py-1 max-w-full mx-auto">
                      {@html renderMath(item.latex, true)}
                    </div>
                    {#if item.number}
                      <span class="font-mono text-xs font-semibold shrink-0 pl-3 {paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fabd2f]'}">
                        {item.number}
                      </span>
                    {/if}
                  </div>
                {:else if item.type === 'text' && item.text}
                  <p class="font-serif leading-[1.85] text-justify tracking-normal {
                    paperFontSize === 'large' ? 'text-[16.5px]' : 'text-[14.5px]'
                  } {
                    paperTheme === 'parchment' ? 'text-[#24292f]' : 'text-[#d5c4a1]'
                  }">
                    {@html formatParagraphWithMath(item.text)}
                  </p>
                {/if}
              {/each}
            </div>

            <!-- Formulas Listing -->
            {#if sec.formulas && sec.formulas.length > 0}
              <div class="flex flex-col gap-2 mt-3 pt-3 border-t border-current/15">
                {#each sec.formulas as formula}
                  <div class="p-3 rounded flex flex-col gap-1 border {
                    paperTheme === 'parchment' ? 'bg-[#f7f4ed] border-[#e2ded6]' : 'bg-[#141617] border-[#3c3836]'
                  }">
                    <div class="flex items-center justify-between text-[11px] font-mono {
                      paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fabd2f]'
                    }">
                      <span>{formula.name || '方程式'}</span>
                      <span class="font-bold">{formula.number || ''}</span>
                    </div>
                    <div class="overflow-x-auto py-1 text-center">
                      {@html renderMath(formula.latexText, true)}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>

      <!-- Paper Sheet Footer -->
      <footer class="mt-12 pt-4 border-t-[3px] border-b border-current font-mono text-[10px] flex items-center justify-between {
        paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'
      }">
        <span>MUGEN YOMU ACADEMIC REPRINT</span>
        <span>END OF DOCUMENT</span>
      </footer>
    </article>
  {:else}
    <div class="text-center py-16 text-[#a89984] text-xs font-mono">
      尚未選定文獻章節內容
    </div>
  {/if}
</div>
