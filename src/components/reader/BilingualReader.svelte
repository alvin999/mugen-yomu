<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../stores/documentStore';
  import { flattenSections } from '../../stores/readingStore';
  import { translateAcademicText } from '../../services/aiService';
  import katex from 'katex';

  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let readingMode: 'bilingual' | 'zen' | 'figures' = 'bilingual';
  export let isAbstractCollapsed: boolean = false;

  const dispatch = createEventDispatcher();

  let selectedAuthorInfo: string | null = null;
  let scrollContainer: HTMLElement | null = null;

  // Paragraph Translation States
  let paragraphTranslations: Record<string, string> = {};
  let showTranslationMap: Record<string, boolean> = {};
  let translatingMap: Record<string, boolean> = {};
  let translationSourceMap: Record<string, string> = {};
  let translationNoticeMap: Record<string, string> = {};
  let isTypingMap: Record<string, boolean> = {};
  let isSectionTranslating: boolean = false;

  // Image Lightbox State
  let activeLightboxImg: string | null = null;
  let activeLightboxCaption: string = '';
  let lightboxZoom: number = 1;

  function openLightbox(imgUrl: string, caption?: string) {
    if (!imgUrl) return;
    activeLightboxImg = imgUrl;
    activeLightboxCaption = caption || '學術圖表預覽';
    lightboxZoom = 1;
  }

  function closeLightbox() {
    activeLightboxImg = null;
  }

  function extractImageInfo(text: string): { url: string; alt: string } | null {
    if (!text) return null;
    const match = text.trim().match(/^!\[(.*?)\]\((https?:\/\/.*?)\)$/);
    if (match) {
      return { alt: match[1] || '學術圖表', url: match[2] };
    }
    const urlMatch = text.trim().match(/^(https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp)(?:\?.*)?)$/i);
    if (urlMatch) {
      return { alt: '學術圖表', url: urlMatch[1] };
    }
    return null;
  }

  function renderMath(latex: string, displayMode: boolean = false): string {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false
      });
    } catch (err) {
      console.warn('KaTeX rendering error:', err);
      return `<span class="text-[#fb4934] font-mono">${latex}</span>`;
    }
  }

  function triggerAction(actionName: string, payload?: any) {
    dispatch('readerAction', { action: actionName, payload });
  }

  function toggleAbstract() {
    isAbstractCollapsed = !isAbstractCollapsed;
  }

  function handleSectionClick(id: string) {
    activeSectionId = id;
    dispatch('selectSection', { id });
  }

  function handleAuthorClick(author: string) {
    selectedAuthorInfo = selectedAuthorInfo === author ? null : author;
  }

  let isProgrammaticScrolling: boolean = false;
  let scrollTimeout: any = null;
  let lastScrollCheck: number = 0;

  export function scrollToTarget(targetId: string) {
    if (typeof document === 'undefined') return;
    const cleanId = targetId.startsWith('sec-') || targetId.startsWith('eq-') || targetId.startsWith('fig-')
      ? targetId
      : `sec-${targetId}`;
    const el = document.getElementById(cleanId);
    if (el) {
      isProgrammaticScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isProgrammaticScrolling = false;
      }, 750);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function handleContainerScroll() {
    if (isProgrammaticScrolling || !scrollContainer) return;
    const now = Date.now();
    if (now - lastScrollCheck < 120) return;
    lastScrollCheck = now;

    const containerRect = scrollContainer.getBoundingClientRect();
    const focalPointY = containerRect.top + 160;

    const sectionElements = scrollContainer.querySelectorAll<HTMLElement>('section[id^="sec-"]');
    let candidateId: string | null = null;

    for (let i = 0; i < sectionElements.length; i++) {
      const el = sectionElements[i];
      const rect = el.getBoundingClientRect();
      if (rect.top <= focalPointY && rect.bottom >= containerRect.top + 60) {
        candidateId = el.id.replace(/^sec-/, '');
      }
    }

    if (candidateId && candidateId !== activeSectionId) {
      activeSectionId = candidateId;
      dispatch('selectSection', { id: candidateId });
    }
  }

  async function toggleParagraphTranslation(secId: string, pIndex: number, text: string) {
    const key = `${secId}_${pIndex}`;
    
    // 若正在打字機生成中，點擊可立即跳過打字動畫 (Instant Complete)
    if (isTypingMap[key]) {
      isTypingMap[key] = false;
      isTypingMap = { ...isTypingMap };
      return;
    }

    if (showTranslationMap[key]) {
      showTranslationMap[key] = false;
      showTranslationMap = { ...showTranslationMap };
      return;
    }
    if (paragraphTranslations[key]) {
      showTranslationMap[key] = true;
      showTranslationMap = { ...showTranslationMap };
      return;
    }

    // 即刻展開卡片進入打字機串流模式，消除讀者空等感
    translatingMap[key] = true;
    isTypingMap[key] = true;
    showTranslationMap[key] = true;
    paragraphTranslations[key] = '';
    translatingMap = { ...translatingMap };
    isTypingMap = { ...isTypingMap };
    showTranslationMap = { ...showTranslationMap };
    paragraphTranslations = { ...paragraphTranslations };

    const provider = typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') || 'groq' : 'groq';
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem(`mugen_key_${provider}`) || '' : '';
    const model = typeof window !== 'undefined' ? localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile' : 'llama-3.3-70b-versatile';
    const ollamaUrl = typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434' : 'http://localhost:11434';

    try {
      const res = await translateAcademicText(
        text,
        provider,
        apiKey,
        model,
        ollamaUrl,
        (currentStreamText) => {
          if (showTranslationMap[key]) {
            paragraphTranslations[key] = currentStreamText;
            paragraphTranslations = { ...paragraphTranslations };
          }
        }
      );
      paragraphTranslations[key] = res.translation;
      translationSourceMap[key] = res.cached ? '本機快取 · 8ms' : `${provider.toUpperCase()} · ${res.latencyMs}ms`;
      if (res.fallbackNotice) {
        translationNoticeMap[key] = res.fallbackNotice;
      }
      dispatch('readerAction', { action: 'translationCompleted' });
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isRateLimit = errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('rate') || errMsg.includes('limit') || errMsg.includes('TPM') || errMsg.includes('quota');
      if (isRateLimit) {
        paragraphTranslations[key] = `⚠️ 已達模型速率限制（Rate Limit）：免費額度每分鐘請求或 Token 已滿載。系統已嘗試自動退避重試，建議稍候 10 秒再試，或在頂部切換為 Llama 3.1 8B 等高頻寬模型。`;
      } else {
        paragraphTranslations[key] = `翻譯連線異常：${errMsg || '請檢查 API 金鑰與網路連線'}`;
      }
    } finally {
      isTypingMap[key] = false;
      translatingMap[key] = false;
      isTypingMap = { ...isTypingMap };
      translatingMap = { ...translatingMap };
      paragraphTranslations = { ...paragraphTranslations };
      showTranslationMap = { ...showTranslationMap };
      translationNoticeMap = { ...translationNoticeMap };
    }
  }

  async function translateEntireSection(sec: ChapterSection) {
    if (!sec.paragraphs || isSectionTranslating) return;
    isSectionTranslating = true;
    try {
      for (let i = 0; i < sec.paragraphs.length; i++) {
        await toggleParagraphTranslation(sec.id, i, sec.paragraphs[i]);
        // Throttled pacing: wait 600ms between requests to stay safely under 15 RPM / 6k TPM
        if (i < sec.paragraphs.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
    } finally {
      isSectionTranslating = false;
    }
  }

  // Flatten all sections to easily display and anchor
  $: allSections = paper ? flattenSections(paper.sections) : [];
  $: activeSection = allSections.find(s => s.id === activeSectionId) || (allSections[0] || null);
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && activeLightboxImg) closeLightbox(); }} />

<main
  bind:this={scrollContainer}
  on:scroll={handleContainerScroll}
  class="h-full overflow-y-auto px-6 py-6 flex justify-center bg-[#282828] scroll-smooth"
>
  <div class="w-full max-w-[760px] flex flex-col gap-6 pb-28">

    {#if paper}
      <!-- Paper Academic Header -->
      <header class="flex flex-col gap-3 pb-5 bg-[#32302f] border border-[#3c3836] p-5 rounded-xl relative overflow-hidden shadow-md">
        <div class="flex flex-wrap items-center gap-2">
          {#if paper.type === 'web'}
            <span class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined text-[12px]">language</span> 網頁專文 · Web Article
            </span>
          {:else}
            <span class="font-mono text-[10px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-2 py-0.5 rounded font-semibold">
              {paper.venue}
            </span>
          {/if}

          {#if paper.arxivId}
            <span class="font-mono text-[10px] text-[#a89984]">{paper.arxivId}</span>
          {/if}

          {#if paper.citations}
            <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-2 py-0.5 rounded font-medium">
              Citations: {paper.citations}
            </span>
          {/if}

          {#if paper.sourceUrl}
            <a
              href={paper.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 ml-auto"
            >
              <span>查看原文</span>
              <span class="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          {/if}
        </div>

        <h1 class="text-3xl text-[#ebdbb2] tracking-tight font-serif leading-tight font-bold">
          {paper.title}
        </h1>

        <div class="text-xs text-[#a89984] flex flex-wrap items-center gap-x-1.5 gap-y-1 relative">
          {#each paper.authors as author, i}
            <button
              class="text-[#d5c4a1] font-medium hover:text-[#fe8019] cursor-pointer transition-colors bg-transparent border-0 p-0 text-left"
              on:click={() => handleAuthorClick(author)}
              title="點擊查看作者貢獻度標記"
            >
              {author}{i < paper.authors.length - 1 ? ',' : ''}
            </button>
          {/each}
          {#if selectedAuthorInfo}
            <div class="w-full mt-1 p-2 rounded-lg bg-[#1d2021] border border-[#fe8019]/40 text-[#ebdbb2] text-[11px] font-mono flex items-center justify-between shadow-lg">
              <span>{selectedAuthorInfo} · 共同第一作者 / 核心演算法架構設計與實驗驗證 (* Equal contribution)</span>
              <button class="text-[#a89984] hover:text-[#ebdbb2] ml-2 font-bold" on:click={() => selectedAuthorInfo = null}>✕</button>
            </div>
          {/if}
        </div>

        <!-- Abstract Collapsible Card -->
        <div class="mt-1 bg-[#282828] border border-[#3c3836] p-3.5 rounded-lg flex flex-col gap-2 shadow-inner">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#fabd2f] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-[#fe8019]">auto_stories</span> 白話科學摘要 (Bilingual Abstract Core)
            </span>
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 transition-colors"
              on:click={toggleAbstract}
            >
              <span>{isAbstractCollapsed ? '展開' : '收起'}</span>
              <span class="material-symbols-outlined text-[13px]">{isAbstractCollapsed ? 'expand_more' : 'expand_less'}</span>
            </button>
          </div>

          {#if !isAbstractCollapsed}
            <div class="flex flex-col gap-2 text-xs">
              <p class="text-[#d5c4a1] leading-relaxed text-justify">
                {paper.abstract.chineseSummary}
              </p>
              <p class="font-serif text-[#a89984] italic leading-relaxed border-t border-[#3c3836] pt-2 text-[13px]">
                "{paper.abstract.english}"
              </p>
            </div>
          {/if}
        </div>
      </header>

      <!-- Sections Stream -->
      <div class="flex flex-col gap-6">
        {#each allSections as sec}
          {@const isFocused = sec.id === activeSectionId}

          <!-- SECTION WRAPPER -->
          <section
            id={`sec-${sec.id}`}
            class="flex flex-col gap-3 transition-all duration-300 rounded-xl {isFocused ? 'relative bg-[#32302f] border border-[#504945] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)]' : 'opacity-85 hover:opacity-100 p-2'}"
            on:click={() => handleSectionClick(sec.id)}
          >
            <!-- Focus Lens Indicator Bar & Badge -->
            {#if isFocused}
              <div class="absolute -left-2 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full focus-lens-bar"></div>
            {/if}

            <div class="flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-2.5 min-w-0">
                <span class="font-mono text-[#fe8019] font-bold {sec.level === 1 ? 'text-lg' : 'text-sm'} shrink-0">
                  {sec.title.split(' ')[0] || sec.id}
                </span>
                <h2 class="{sec.level === 1 ? 'text-xl' : 'text-base'} text-[#ebdbb2] tracking-tight font-bold {sec.level === 1 ? 'font-serif' : 'font-sans'} truncate">
                  {sec.title.replace(/^[0-9.]+\s*/, '')}
                </h2>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <!-- Direct jump to original PDF page button -->
                {#if sec.page || paper?.pdfUrl || paper?.arxivId}
                  <button
                    class="flex items-center gap-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2 py-0.5 rounded text-[11px] font-mono text-[#fabd2f] transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                    on:click|stopPropagation={() => triggerAction('openOriginalToPage', { page: sec.page || 1, sectionId: sec.id })}
                    title="在原檔 PDF 檢視器跳至第 {sec.page || 1} 頁對照"
                  >
                    <span class="material-symbols-outlined text-[13px] text-[#fe8019]">find_in_page</span>
                    <span>PDF p.{sec.page || 1} ➜</span>
                  </button>
                {/if}

                {#if isFocused}
                  <div class="flex items-center gap-1 bg-[#fe8019]/15 border border-[#fe8019]/50 px-2 py-0.5 rounded-full text-[#fe8019]">
                    <span class="material-symbols-outlined text-[13px]">center_focus_strong</span>
                    <span class="font-mono text-[9px] font-semibold uppercase hidden sm:inline">Focus Lens Active</span>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Paragraphs with Inline Bilingual Translation & Figures -->
            <div class="flex flex-col gap-5">
              {#each sec.paragraphs as para, pIndex}
                {@const key = `${sec.id}_${pIndex}`}
                {@const imgInfo = extractImageInfo(para)}

                {#if imgInfo}
                  <!-- Inline Markdown Image Figure Card -->
                  <figure class="my-2 p-4 bg-[#1d2021] border border-[#504945] rounded-xl flex flex-col items-center gap-3 shadow-md group/img">
                    <div class="w-full flex items-center justify-between text-xs font-mono text-[#fabd2f] border-b border-[#3c3836] pb-2">
                      <span class="flex items-center gap-1.5 font-bold">
                        <span class="material-symbols-outlined text-[15px] text-[#fe8019]">image</span>
                        {imgInfo.alt || '論文架構與實驗分析圖表'}
                      </span>
                      <div class="flex items-center gap-2 text-[#a89984]">
                        <button
                          class="hover:text-[#fe8019] flex items-center gap-1 text-[11px] cursor-pointer"
                          on:click|stopPropagation={() => openLightbox(imgInfo.url, imgInfo.alt)}
                          title="全螢幕放大檢視"
                        >
                          <span class="material-symbols-outlined text-[13px]">fullscreen</span>
                          <span>放大燈箱</span>
                        </button>
                        <a
                          href={imgInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="hover:text-[#ebdbb2] flex items-center gap-0.5 text-[11px]"
                          title="在新分頁開啟"
                        >
                          <span class="material-symbols-outlined text-[13px]">open_in_new</span>
                        </a>
                      </div>
                    </div>

                    <div
                      class="w-full flex items-center justify-center p-2 rounded bg-[#141617] border border-[#3c3836] overflow-hidden cursor-zoom-in"
                      on:click|stopPropagation={() => openLightbox(imgInfo.url, imgInfo.alt)}
                    >
                      <img
                        src={imgInfo.url}
                        alt={imgInfo.alt}
                        class="max-h-[380px] max-w-full object-contain rounded transition-transform group-hover/img:scale-[1.01]"
                        loading="lazy"
                      />
                    </div>

                    {#if imgInfo.alt}
                      <figcaption class="text-xs text-[#a89984] font-serif italic text-center max-w-[90%] leading-relaxed">
                        {imgInfo.alt}
                      </figcaption>
                    {/if}
                  </figure>
                {:else}
                  <div class="flex flex-col gap-2 group/para relative">
                    <!-- English paragraph: 100% full width, no side-button squeezing -->
                    <p class="font-serif text-[17px] text-[#ebdbb2]/95 leading-[33px] text-justify w-full tracking-[0.01em]">
                      {para}
                    </p>


                  <!-- Inline Translated Card with Enhanced Typography & Typewriter Stream -->
                  {#if showTranslationMap[key]}
                    <div
                      class="mt-1 p-4 bg-[#1d2021] border-l-4 border-[#fabd2f] rounded-r-xl flex flex-col gap-2 shadow-lg text-[#ebdbb2] animate-fade-in cursor-default"
                      on:click={() => { if (isTypingMap[key]) isTypingMap[key] = false; }}
                      title={isTypingMap[key] ? "點擊卡片可立即跳過打字機動畫完整顯現" : ""}
                    >
                      <div class="flex items-center justify-between text-[11px] font-mono text-[#a89984] border-b border-[#3c3836]/60 pb-2">
                        <span class="flex items-center gap-1.5 text-[#fabd2f] font-semibold">
                          {#if isTypingMap[key]}
                            <span class="material-symbols-outlined text-[15px] animate-spin text-[#fe8019]">sync</span>
                            <span>繁體中文精讀對照 · 實時生成中...</span>
                          {:else}
                            <span class="material-symbols-outlined text-[15px]">translate</span>
                            <span>繁體中文精讀對照</span>
                          {/if}
                        </span>
                        <div class="flex items-center gap-2">
                          {#if translationNoticeMap[key]}
                            <span class="text-[#fabd2f] bg-[#fabd2f]/10 border border-[#fabd2f]/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-sans">
                              <span class="material-symbols-outlined text-[12px] text-[#fabd2f]">bolt</span>
                              <span>{translationNoticeMap[key]}</span>
                            </span>
                          {/if}
                          {#if translationSourceMap[key]}
                            <span class="text-[#b8bb26] bg-[#282828] px-2 py-0.5 rounded border border-[#3c3836] text-[10px]">
                              {translationSourceMap[key]}
                            </span>
                          {/if}
                          <button
                            class="hover:text-[#fe8019] text-[#a89984] text-[11px] cursor-pointer flex items-center gap-0.5 transition-colors"
                            on:click|stopPropagation={() => showTranslationMap[key] = false}
                            title="收起雙語對照"
                          >
                            <span class="material-symbols-outlined text-[13px]">expand_less</span>
                            <span>收起</span>
                          </button>
                        </div>
                      </div>

                      <!-- Paragraph Content with Blinking Typewriter Cursor -->
                      <p class="pt-1 select-text text-justify font-sans text-[15px] text-[#ebdbb2]/95 leading-[1.95] tracking-[0.035em] font-normal min-h-[32px]">
                        {#if !paragraphTranslations[key] && isTypingMap[key]}
                          <span class="text-[#a89984] italic font-mono text-xs flex items-center gap-2 py-1">
                            <span class="material-symbols-outlined text-[15px] animate-spin text-[#fe8019]">hourglass_top</span>
                            <span>正在連線模型解析學術語意與術語對齊，即將逐字生成...</span>
                          </span>
                        {:else}
                          {paragraphTranslations[key]}
                        {/if}
                        {#if isTypingMap[key]}
                          <span class="inline-block w-2 h-4 bg-[#fabd2f] ml-1 animate-pulse align-middle select-none shadow-[0_0_8px_#fabd2f]"></span>
                        {/if}
                      </p>
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
            </div>

            <!-- SVO Sentence Highlight (If present) -->
            {#if sec.svoSentence && isFocused}
              <div class="my-2 p-3 bg-[#282828] border-l-4 border-[#8ec07c] rounded-r-lg flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] bg-[#8ec07c] text-[#1d2021] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                    <span class="material-symbols-outlined text-[11px]">account_tree</span>
                    {sec.svoSentence.svoBadge}
                  </span>
                  <span class="font-mono text-[10px] text-[#a89984]">學術長難句精準拆解</span>
                </div>

                <p class="font-serif text-[#ebdbb2] text-[15px] italic">
                  "{sec.svoSentence.sentence}"
                </p>

                <div class="grid grid-cols-1 gap-1.5 pt-1 text-xs">
                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#fe8019] font-bold shrink-0">{sec.svoSentence.subjectVerbObject.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.subjectVerbObject.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.subjectVerbObject.zh}</span>
                    </div>
                  </div>

                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#fabd2f] font-bold shrink-0">{sec.svoSentence.modifier.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.modifier.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.modifier.zh}</span>
                    </div>
                  </div>

                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#8ec07c] font-bold shrink-0">{sec.svoSentence.purpose.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.purpose.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.purpose.zh}</span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Figures Sandbox (If present on section) -->
            {#if sec.figures && sec.figures.length > 0}
              <div class="flex flex-col gap-4 my-2">
                {#each sec.figures as fig}
                  <figure class="bg-[#1d2021] border border-[#504945] rounded-xl p-4 flex flex-col items-center gap-3 shadow-md group/fig">
                    <div class="w-full flex items-center justify-between text-xs font-mono text-[#fabd2f] border-b border-[#3c3836] pb-2">
                      <span class="flex items-center gap-1.5 font-bold">
                        <span class="material-symbols-outlined text-[15px] text-[#fe8019]">schema</span>
                        {fig.figureNumber ? `${fig.figureNumber}: ` : ''}{fig.name}
                      </span>
                      <div class="flex items-center gap-2 text-[#a89984]">
                        <button
                          class="hover:text-[#fe8019] flex items-center gap-1 text-[11px] cursor-pointer"
                          on:click|stopPropagation={() => openLightbox(fig.imageUrl || '', fig.caption || fig.name)}
                          title="全螢幕放大檢視"
                        >
                          <span class="material-symbols-outlined text-[13px]">fullscreen</span>
                          <span>放大燈箱</span>
                        </button>
                        {#if fig.imageUrl}
                          <a
                            href={fig.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="hover:text-[#ebdbb2] flex items-center gap-0.5 text-[11px]"
                            title="在新分頁開啟"
                          >
                            <span class="material-symbols-outlined text-[13px]">open_in_new</span>
                          </a>
                        {/if}
                      </div>
                    </div>

                    {#if fig.imageUrl}
                      <div
                        class="w-full flex items-center justify-center p-2 rounded bg-[#141617] border border-[#3c3836] overflow-hidden cursor-zoom-in"
                        on:click|stopPropagation={() => openLightbox(fig.imageUrl || '', fig.caption || fig.name)}
                      >
                        <img
                          src={fig.imageUrl}
                          alt={fig.name}
                          class="max-h-[380px] max-w-full object-contain rounded transition-transform group-hover/fig:scale-[1.01]"
                          loading="lazy"
                        />
                      </div>
                    {/if}

                    {#if fig.caption}
                      <figcaption class="text-xs text-[#a89984] font-serif italic text-center max-w-[90%] leading-relaxed">
                        {fig.caption}
                      </figcaption>
                    {/if}
                  </figure>
                {/each}
              </div>
            {/if}

            <!-- Formulas Sandbox (If present) -->
            {#if sec.formulas && sec.formulas.length > 0}
              {#each sec.formulas as formula}
                <div id={`eq-${formula.id}`} class="my-5 bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col items-center justify-center relative shadow-inner">
                  <span class="absolute right-4 top-3 font-mono text-xs text-[#a89984] select-none">{formula.number}</span>
                  
                  <span class="font-mono text-xs text-[#fabd2f] font-semibold mb-2 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[14px]">functions</span>
                    {formula.name}
                  </span>

                  <!-- Formula Display Rendered via KaTeX -->
                  <div class="w-full flex items-center justify-center py-3 overflow-x-auto text-[#ebdbb2]">
                    <div class="katex-display-container text-[20px] text-[#ebdbb2] px-2 select-none">
                      {@html renderMath(formula.latexText, true)}
                    </div>
                  </div>

                  <!-- Variables Hover Explanations with KaTeX Symbols -->
                  <div class="flex flex-wrap items-center justify-center gap-2 mt-3 pt-3 border-t border-[#3c3836] w-full">
                    {#each formula.variables as v}
                      <span class="font-mono text-xs bg-[#282828] border border-[#3c3836] hover:border-[#504945] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm transition-colors">
                        <span class="inline-flex items-center text-sm" style="color: {v.color}">
                          {@html renderMath(v.symbol, false)}
                        </span>
                        <span class="text-[#a89984]">:</span>
                        <span class="text-[#d5c4a1]">{v.meaning}</span>
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            {/if}

            <!-- Inline Semantic Floating Action Toolbar (Only on Active Focus) -->
            {#if isFocused}
              <div class="mt-2 flex flex-wrap items-center gap-2 bg-[#282828] border border-[#3c3836] p-1.5 rounded-lg shadow-sm">
                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showIntuition')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">lightbulb</span>
                  <span>白話科學直覺</span>
                </button>

                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#8ec07c] border border-[#8ec07c]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showSyntax')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
                  <span>句構拆解</span>
                </button>

                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] border border-[#504945] px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showTerminology')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#fe8019]">menu_book</span>
                  <span>學術術語對齊</span>
                </button>

                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/40 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  disabled={isSectionTranslating}
                  on:click|stopPropagation={() => translateEntireSection(sec)}
                  title="依序佇列展開當前章節所有段落的繁體中文對照翻譯（防 429 節流保護）"
                >
                  {#if isSectionTranslating}
                    <span class="material-symbols-outlined text-[14px] text-[#fe8019] animate-spin">sync</span>
                    <span>佇列翻譯中...</span>
                  {:else}
                    <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">translate</span>
                    <span>本節雙語對照</span>
                  {/if}
                </button>

                <div class="h-4 w-px bg-[#504945] mx-0.5"></div>

                <button
                  class="flex items-center gap-1.5 hover:bg-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded text-xs transition-colors"
                  on:click|stopPropagation={() => triggerAction('addNote', sec.title)}
                >
                  <span class="material-symbols-outlined text-[14px]">push_pin</span>
                  <span>標註精讀筆記</span>
                </button>
              </div>
            {/if}

          </section>
        {/each}
      </div>
    {/if}

  </div>
</main>

<!-- High-Resolution Image Lightbox Modal -->
{#if activeLightboxImg}
  <div
    class="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 select-none animate-fade-in"
    on:click={closeLightbox}
  >
    <!-- Top Lightbox Toolbar -->
    <div
      class="w-full max-w-5xl flex items-center justify-between bg-[#1d2021]/90 border border-[#504945] px-4 py-2.5 rounded-xl text-xs font-mono text-[#ebdbb2] shadow-2xl"
      on:click|stopPropagation
    >
      <span class="text-[#fabd2f] font-semibold truncate max-w-[400px] flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[16px] text-[#fe8019]">zoom_in</span>
        {activeLightboxCaption}
      </span>
      <div class="flex items-center gap-2">
        <button
          class="w-7 h-7 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] rounded flex items-center justify-center font-bold"
          on:click={() => lightboxZoom = Math.max(0.5, lightboxZoom - 0.25)}
          title="縮小"
        >-</button>
        <span class="w-12 text-center text-[#fabd2f] font-semibold">{Math.round(lightboxZoom * 100)}%</span>
        <button
          class="w-7 h-7 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] rounded flex items-center justify-center font-bold"
          on:click={() => lightboxZoom = Math.min(4, lightboxZoom + 0.25)}
          title="放大"
        >+</button>
        <button
          class="px-2 py-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] rounded text-xs"
          on:click={() => lightboxZoom = 1}
          title="重設縮放"
        >100%</button>
        <div class="h-4 w-px bg-[#504945] mx-1"></div>
        <a
          href={activeLightboxImg}
          target="_blank"
          rel="noopener noreferrer"
          class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#8ec07c] hover:text-[#b8bb26] rounded flex items-center gap-1"
        >
          <span class="material-symbols-outlined text-[13px]">open_in_new</span>
          <span>在新分頁開啟</span>
        </a>
        <button
          class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
          on:click={closeLightbox}
        >
          ✕ 關閉
        </button>
      </div>
    </div>

    <!-- Image Viewport with Dynamic Scale -->
    <div
      class="flex-1 w-full flex items-center justify-center overflow-auto p-4 cursor-zoom-out"
      on:click={closeLightbox}
    >
      <img
        src={activeLightboxImg}
        alt={activeLightboxCaption}
        class="transition-transform duration-150 max-h-[82vh] max-w-[88vw] object-contain shadow-2xl rounded-lg border border-[#3c3836]"
        style="transform: scale({lightboxZoom});"
        on:click|stopPropagation
      />
    </div>

    <!-- Bottom Lightbox Prompt -->
    <div class="text-[#a89984] font-mono text-[11px] pb-1 bg-[#1d2021]/80 px-3 py-1 rounded-full border border-[#3c3836]">
      點擊背景或按 Esc 即可退出全螢幕燈箱
    </div>
  </div>
{/if}
