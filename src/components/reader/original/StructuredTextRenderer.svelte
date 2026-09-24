<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../../types/document';
  import { normalizeParagraphs } from '../../../utils/paragraphUtils';
  import { renderMath } from '../../../utils/katexUtils';
  import { pdfViewerStore } from '../../../stores/pdfViewerStore';
  import ThemeCodeBlock from '../../common/ThemeCodeBlock.svelte';
  import { marked } from 'marked';

  export let paper: PaperDocument | null = null;
  export let allSections: ChapterSection[] = [];
  export let activeSectionId: string = '';
  export let mode: 'split' | 'drawer' = 'split';
  export let isPdf: boolean = false;
  export let paperTheme: 'parchment' | 'dark' = 'parchment';

  const dispatch = createEventDispatcher<{
    sectionClick: { sectionId: string };
    sectionScroll: { sectionId: string };
    openLightbox: { url: string; caption?: string };
    retryPdf: void;
  }>();

  let containerElement: HTMLDivElement | null = null;
  let paperFontSize: 'normal' | 'large' = 'normal';

  let lastTargetSectionId = '';
  let isProgrammaticScroll = false;
  let programmaticScrollTimeout: any = null;
  let scrollThrottleTimer: any = null;

  // 監聽閱讀器端傳入的 activeSectionId，自動平滑捲動至該章節
  $: if (activeSectionId && activeSectionId !== lastTargetSectionId && containerElement) {
    lastTargetSectionId = activeSectionId;
    scrollToSection(activeSectionId);
  }

  function scrollToSection(secId: string) {
    if (!containerElement) return;
    const targetEl = containerElement.querySelector(`#text-sec-${secId}`) as HTMLElement | null;
    if (!targetEl) return;

    isProgrammaticScroll = true;
    clearTimeout(programmaticScrollTimeout);

    const containerRect = containerElement.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top + containerElement.scrollTop;
    const finalScrollTop = Math.max(0, relativeTop - 30);

    containerElement.scrollTo({
      top: finalScrollTop,
      behavior: 'smooth'
    });

    programmaticScrollTimeout = setTimeout(() => {
      isProgrammaticScroll = false;
    }, 450);
  }

  function handleScroll() {
    if (!containerElement) return;
    const currentScrollTop = containerElement.scrollTop;
    const scrollHeight = containerElement.scrollHeight - containerElement.clientHeight;
    const percent = scrollHeight > 0 ? (currentScrollTop / scrollHeight) * 100 : 0;

    // 即時同步至 Store，供抽屜或雙軌對照無縫復原
    pdfViewerStore.setWebScroll(currentScrollTop, percent, paper?.id);

    // 若為外部觸發的程式自動捲動，不反向觸發事件
    if (isProgrammaticScroll) return;

    if (scrollThrottleTimer) return;
    scrollThrottleTimer = setTimeout(() => {
      scrollThrottleTimer = null;
      detectInViewSection();
    }, 60);
  }

  function detectInViewSection() {
    if (!containerElement || allSections.length === 0) return;
    const containerRect = containerElement.getBoundingClientRect();
    const sectionElements = containerElement.querySelectorAll('section[id^="text-sec-"]');

    const READING_LINE_OFFSET = 120; // 視線讀取基準線
    let currentInViewId = '';

    for (const el of sectionElements) {
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - containerRect.top;
      if (elTop <= READING_LINE_OFFSET) {
        currentInViewId = el.id.replace(/^text-sec-/, '');
      } else {
        break;
      }
    }

    if (!currentInViewId && sectionElements.length > 0) {
      currentInViewId = (sectionElements[0] as HTMLElement).id.replace(/^text-sec-/, '');
    }

    if (currentInViewId && currentInViewId !== activeSectionId) {
      lastTargetSectionId = currentInViewId;
      pdfViewerStore.setActiveWebSection(currentInViewId);
      dispatch('sectionScroll', { sectionId: currentInViewId });
    }
  }

  async function restoreScrollPosition() {
    await tick();
    if (!containerElement) return;
    const saved = $pdfViewerStore.webScrollTop;
    if (saved > 0) {
      containerElement.scrollTop = saved;
    } else if (activeSectionId) {
      scrollToSection(activeSectionId);
    }
  }

  onMount(() => {
    restoreScrollPosition();
  });

  // 當文獻切換時，自動還原該篇滾動進度
  let lastPaperId = '';
  $: if (paper?.id && paper.id !== lastPaperId) {
    lastPaperId = paper.id;
    restoreScrollPosition();
  }

  function renderRichParagraph(text: string): string {
    if (!text) return '';

    // 1. 先萃取或替換 KaTeX 公式，避免 marked 將公式內的底線 _ 或星號 * 誤判為 Markdown 斜體或粗體
    const mathTokens: { token: string; html: string }[] = [];
    let counter = 0;
    const textWithMathPlaceholders = text.replace(/\$([^$\n]+?)\$/g, (_match, math) => {
      const placeholder = `%%MATH_TOKEN_${counter++}%%`;
      const rendered = renderMath(math.trim(), false);
      mathTokens.push({
        token: placeholder,
        html: `<span class="inline-math px-0.5 align-baseline">${rendered}</span>`
      });
      return placeholder;
    });

    // 2. 利用 marked.parseInline 將 Markdown 語法（[鏈結](url), `行內代碼`, **粗體** 等）轉為 HTML
    let parsedHtml = '';
    try {
      parsedHtml = marked.parseInline(textWithMathPlaceholders, { breaks: true, gfm: true }) as string;
    } catch {
      parsedHtml = textWithMathPlaceholders;
    }

    // 3. 還原 KaTeX 公式 HTML
    for (const { token, html } of mathTokens) {
      parsedHtml = parsedHtml.replace(token, html);
    }

    // 4. 美化產生的 <a> 標籤，增加 target="_blank" 與外部鏈結樣式
    parsedHtml = parsedHtml.replace(
      /<a\s+(?:[^>]*?\s+)?href=["'](.*?)["']/gi,
      (_m, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="rich-link"`
    );

    return parsedHtml;
  }
</script>

<div
  bind:this={containerElement}
  on:scroll={handleScroll}
  class="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center select-text font-serif scroll-smooth"
>
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
                {:else if item.type === 'code' && item.code}
                  <ThemeCodeBlock
                    code={item.code}
                    language={item.language}
                    {paperTheme}
                    dataParaKey={`${sec.id}_${item.originalIndex}`}
                    dataSecId={sec.id}
                  />
                {:else if item.type === 'text' && item.text}
                  <p
                    data-para-key={`${sec.id}_${item.originalIndex}`}
                    data-sec-id={sec.id}
                    class="structured-para font-serif leading-[1.85] text-justify tracking-normal {
                    paperFontSize === 'large' ? 'text-[16.5px]' : 'text-[14.5px]'
                  } {
                    paperTheme === 'parchment' ? 'text-[#24292f]' : 'text-[#d5c4a1]'
                  }">
                    {@html renderRichParagraph(item.text)}
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

<style>
  :global(.rich-link) {
    color: #0969da;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-weight: 500;
    transition: opacity 0.15s ease;
  }
  :global(.rich-link:hover) {
    opacity: 0.8;
  }

  /* 行內程式碼標籤樣式 (Inline code) */
  :global(.structured-para code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.88em;
    padding: 0.15em 0.35em;
    border-radius: 4px;
  }

  /* 紙本模式 (Parchment) */
  article.bg-\[\#fcfbf9\] :global(.rich-link) {
    color: #0969da;
  }
  article.bg-\[\#fcfbf9\] :global(.structured-para code) {
    background-color: #f0ebe0;
    color: #af3a03;
    border: 1px solid #e0d7c7;
  }

  /* 夜間模式 (Dark) */
  article.bg-\[\#1d2021\] :global(.rich-link) {
    color: #8ec07c;
  }
  article.bg-\[\#1d2021\] :global(.structured-para code) {
    background-color: #282828;
    color: #fabd2f;
    border: 1px solid #3c3836;
  }
</style>
