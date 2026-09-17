<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PaperDocument, ChapterSection, FormulaItem } from '../../types/document';
  import { flattenSections } from '../../stores/readingStore';
  import { flowStore, countWords } from '../../stores/flowStore';
  import { translateAcademicText } from '../../services/aiService';
  import { normalizeParagraphs } from '../../utils/paragraphUtils';
  import { renderMath, copyLatexToClipboard } from '../../utils/katexUtils';
  import AuthorInfoModal from './bilingual/AuthorInfoModal.svelte';
  import CognitiveActionToolbar from './bilingual/CognitiveActionToolbar.svelte';
  import BilingualParagraphItem from './bilingual/BilingualParagraphItem.svelte';
  import SectionFormulaChips from './bilingual/SectionFormulaChips.svelte';
  import ImageLightboxModal from '../common/ImageLightboxModal.svelte';

  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isAbstractCollapsed: boolean = false;

  const dispatch = createEventDispatcher();

  let selectedAuthorInfo: string | null = null;
  let scrollContainer: HTMLElement | null = null;

  // 已讀小段落追蹤（以最小翻譯單位感應進度與心流速率）
  let currentPaperId: string = '';
  let passedParaKeys = new Set<string>();

  $: if (paper && paper.id !== currentPaperId) {
    currentPaperId = paper.id;
    passedParaKeys = new Set<string>();
    if (paper.sections) {
      const allSecs = flattenSections(paper.sections);
      for (const s of allSecs) {
        if (s.readParaIndices && s.readParaIndices.length > 0) {
          for (const idx of s.readParaIndices) {
            passedParaKeys.add(`${s.id}_${idx}`);
          }
        }
      }
    }
  }

  // 研讀焦點段落與文字選取狀態 (Paragraph Focus & Text Selection)
  export let focusedParagraphKey: string = '';
  export let focusedParagraphText: string = '';
  export let selectedText: string = '';

  // Paragraph Translation States
  let paragraphTranslations: Record<string, string> = {};
  let showTranslationMap: Record<string, boolean> = {};
  let translatingMap: Record<string, boolean> = {};
  let translationSourceMap: Record<string, string> = {};
  let translationNoticeMap: Record<string, string> = {};
  let isTypingMap: Record<string, boolean> = {};
  let isSectionTranslating: boolean = false;

  // 認知核心動作載入狀態 (按章節 ID 標記)
  export let loadingIntuitionId: string | null = null;
  export let loadingSyntaxId: string | null = null;
  export let loadingTerminologyId: string | null = null;

  // Image Lightbox State
  let activeLightboxImg: string | null = null;
  let activeLightboxCaption: string = '';

  function openLightbox(imgUrl: string, caption?: string) {
    if (!imgUrl) return;
    activeLightboxImg = imgUrl;
    activeLightboxCaption = caption || '學術圖表預覽';
  }

  function closeLightbox() {
    activeLightboxImg = null;
  }

  let copyToastText: string | null = null;
  let copyToastTimeout: any = null;

  function showToast(text: string) {
    copyToastText = text;
    if (copyToastTimeout) clearTimeout(copyToastTimeout);
    copyToastTimeout = setTimeout(() => copyToastText = null, 2200);
  }

  function copyLatex(latex: string) {
    copyLatexToClipboard(latex);
    showToast('已複製 LaTeX 方程式碼');
  }

  function copyTranslationText(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('繁體譯文已複製！');
    }
  }

  $: allSections = flattenSections(paper?.sections || []);

  let lastScrollCheck = 0;
  let scrollTimeout: any = null;
  let isProgrammaticScrolling = false;

  // 過濾與去重章節內的結構化公式
  function getDeduplicatedFormulas(sec: ChapterSection): FormulaItem[] {
    if (!sec.formulas || sec.formulas.length === 0) return [];

    const hasMathInSec = sec.paragraphs && sec.paragraphs.some(p => p && p.includes('$$'));
    const seenLatex = new Set<string>();
    const seenNames = new Set<string>();
    const result: FormulaItem[] = [];

    const bodyFormulas = new Set<string>();
    const bodyFormulaNums = new Set<string>();
    if (sec.paragraphs) {
      for (const p of sec.paragraphs) {
        if (p && p.includes('$$')) {
          const match = p.match(/\$\$([\s\S]*?)\$\$/);
          if (match && match[1]) {
            bodyFormulas.add(match[1].trim().replace(/\s+/g, ''));
          }
          const numMatch = p.match(/\$\$[\s\S]*?\$\$(?:\s*(\([0-9a-zA-Z.-]+\)))?/);
          if (numMatch && numMatch[1]) {
            bodyFormulaNums.add(numMatch[1].replace(/[^0-9a-zA-Z]/g, ''));
          }
        }
      }
    }

    const isMLPaper = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '');

    for (const f of sec.formulas) {
      if (!f || !f.latexText) continue;
      const normalizedLatex = f.latexText.trim().replace(/\s+/g, '');

      if (f.sectionId && f.sectionId !== sec.id && !hasMathInSec) {
        continue;
      }
      if (f.sectionTitle && !f.sectionTitle.includes(sec.title) && !sec.title.includes(f.sectionTitle) && !hasMathInSec) {
        continue;
      }

      const combinedInfo = `${f.latexText} ${f.name || ''} ${JSON.stringify(f.variables || [])}`;
      const isFabricatedML = /\\min[\s_{]|\\mathcal\{L\}|\\mathbb\{E\}|\\Omega\s*\(|\\ell\s*\(|f_\\theta/i.test(combinedInfo);
      if (isFabricatedML && !isMLPaper) {
        continue;
      }

      if (bodyFormulas.has(normalizedLatex)) continue;
      if (f.number) {
        const cleanFNum = f.number.replace(/[^0-9a-zA-Z]/g, '');
        if (cleanFNum && bodyFormulaNums.has(cleanFNum)) {
          continue;
        }
      }

      if (seenLatex.has(normalizedLatex) || (f.name && seenNames.has(f.name))) {
        continue;
      }
      seenLatex.add(normalizedLatex);
      if (f.name) seenNames.add(f.name);

      result.push(f);
    }
    return result;
  }

  function jumpToFormulaLocation(formula: FormulaItem, sec: ChapterSection) {
    if (typeof document === 'undefined') return;

    let realSecId = formula.sectionId;
    if (paper?.sections) {
      const flat = flattenSections(paper.sections);
      if (!realSecId || realSecId === sec.id) {
        if (formula.sectionTitle) {
          const matchedByTitle = flat.find(s => 
            formula.sectionTitle?.includes(s.title) || 
            s.title.includes(formula.sectionTitle || '') ||
            (formula.sectionTitle.includes('2.8') && s.title.includes('2.8'))
          );
          if (matchedByTitle) realSecId = matchedByTitle.id;
        }

        if (!realSecId || realSecId === sec.id) {
          const matchedByContent = flat.find(s => 
            s.paragraphs && s.paragraphs.some(p => p.includes('$$') || (formula.number && p.includes(formula.number)))
          );
          if (matchedByContent) realSecId = matchedByContent.id;
        }
      }
    }

    const finalSecId = realSecId || sec.id;

    if (finalSecId && finalSecId !== activeSectionId) {
      activeSectionId = finalSecId;
      dispatch('selectSection', { sectionId: finalSecId });
    }

    setTimeout(() => {
      scrollToFormulaInPage(formula, finalSecId);
    }, 150);
  }

  function scrollToFormulaInPage(formula: FormulaItem, targetSecId?: string) {
    if (typeof document === 'undefined') return;

    const findAndHighlight = () => {
      if (targetSecId) {
        const secEl = document.getElementById('sec-' + targetSecId);
        if (secEl) {
          const inlineCards = secEl.querySelectorAll('.group\\/display-math');
          for (const card of inlineCards) {
            if (formula.number && card.textContent && card.textContent.includes(formula.number)) {
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              card.classList.add('formula-target-highlight');
              setTimeout(() => card.classList.remove('formula-target-highlight'), 3200);
              showToast(`🎯 已定位 ${formula.number} 方程式`);
              return true;
            }
          }

          const mathParas = secEl.querySelectorAll('[id^="para-"]');
          for (const p of mathParas) {
            if (p.textContent && p.textContent.includes('$$')) {
              p.scrollIntoView({ behavior: 'smooth', block: 'center' });
              p.classList.add('formula-target-highlight');
              setTimeout(() => p.classList.remove('formula-target-highlight'), 3200);
              showToast(`🎯 已定位至公式段落`);
              return true;
            }
          }

          if (inlineCards.length > 0) {
            const firstCard = inlineCards[0] as HTMLElement;
            firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstCard.classList.add('formula-target-highlight');
            setTimeout(() => firstCard.classList.remove('formula-target-highlight'), 3200);
            showToast(`🎯 已定位至該節核心方程式`);
            return true;
          }

          secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          secEl.classList.add('formula-target-highlight');
          setTimeout(() => secEl.classList.remove('formula-target-highlight'), 3200);
          showToast(`🎯 已定位至章節標題`);
          return true;
        }
      }

      const allInlineCards = document.querySelectorAll('.group\\/display-math');
      for (const card of allInlineCards) {
        if (formula.number && card.textContent && card.textContent.includes(formula.number)) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('formula-target-highlight');
          setTimeout(() => card.classList.remove('formula-target-highlight'), 3200);
          showToast(`🎯 已定位至方程式 ${formula.number}`);
          return true;
        }
      }
      return false;
    };

    if (!findAndHighlight()) {
      setTimeout(findAndHighlight, 200);
    }
  }

  export function highlightAndScrollToParagraph(paragraphKey: string) {
    if (typeof document === 'undefined') return;
    focusedParagraphKey = paragraphKey;
    const cleanKey = paragraphKey.startsWith('para-') ? paragraphKey : `para-${paragraphKey}`;
    const el = document.getElementById(cleanKey);
    if (el) {
      isProgrammaticScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isProgrammaticScrolling = false;
      }, 500);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('para-pulse-highlight');
      setTimeout(() => {
        el.classList.remove('para-pulse-highlight');
      }, 3200);
    }
  }

  function markParagraphAsRead(secId: string, pIndex: number, text: string) {
    const key = `${secId}_${pIndex}`;
    if (!passedParaKeys.has(key)) {
      passedParaKeys.add(key);
      const words = countWords(text);
      flowStore.recordReadingActivity(Math.max(15, words), 'skim');
      dispatch('paragraphsRead', {
        paragraphs: [{ sectionId: secId, paraIndex: pIndex, words }]
      });
    }
  }

  function handleParagraphClick(secId: string, pIndex: number, text: string) {
    const key = `${secId}_${pIndex}`;
    focusedParagraphKey = key;
    focusedParagraphText = text;
    activeSectionId = secId;

    markParagraphAsRead(secId, pIndex, text);

    flowStore.touchActivity();
    const pWords = countWords(text);
    flowStore.recordReadingActivity(Math.min(20, Math.round(pWords * 0.2)), 'skim');

    dispatch('paragraphFocused', {
      sectionId: secId,
      paragraphIndex: pIndex,
      paragraphKey: key,
      text,
      selectedText
    });
  }

  function askCompanionAboutParagraph(sec: ChapterSection, pIndex: number, text: string) {
    flowStore.recordReadingActivity(25, 'interact');
    markParagraphAsRead(sec.id, pIndex, text);
    handleParagraphClick(sec.id, pIndex, text);
    dispatch('readerAction', {
      action: 'focusCompanion',
      section: sec,
      paragraphIndex: pIndex,
      text
    });
  }

  function handleContainerClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const probeBtn = target.closest('.cite-probe-btn') as HTMLElement | null;
    if (probeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cite = probeBtn.getAttribute('data-citation') || '';
      const paraEl = probeBtn.closest('[data-para-key]') as HTMLElement | null;
      const paraText = paraEl?.getAttribute('data-para-text') || '';
      const secId = paraEl?.getAttribute('data-sec-id') || activeSectionId;
      dispatch('probeCitation', {
        citation: cite,
        sectionId: secId,
        paragraphText: paraText
      });
    }
  }

  function handleMouseUp() {
    if (typeof window !== 'undefined') {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';
      if (text && text.length > 0) {
        selectedText = text;
        flowStore.touchActivity();
        flowStore.recordReadingActivity(Math.max(5, countWords(text)), 'skim');
        dispatch('textSelected', { text });
      }
    }
  }

  function handleContainerScroll() {
    flowStore.touchActivity();
    if (isProgrammaticScrolling || !scrollContainer) return;
    const now = Date.now();
    if (now - lastScrollCheck < 60) return;
    lastScrollCheck = now;

    const viewportHeight = scrollContainer.clientHeight;
    const viewportTop = scrollContainer.scrollTop;
    const viewportBottom = viewportTop + viewportHeight;

    const paraElements = scrollContainer.querySelectorAll<HTMLElement>('[data-para-key]');
    const newlyReadParas: Array<{ sectionId: string; paraIndex: number; words: number }> = [];

    paraElements.forEach((pEl) => {
      const pKey = pEl.getAttribute('data-para-key');
      if (!pKey || passedParaKeys.has(pKey)) return;

      const pTop = pEl.offsetTop;
      const pBottom = pTop + pEl.clientHeight;

      if (pTop < viewportBottom - 80 && pBottom > viewportTop) {
        passedParaKeys.add(pKey);
        const pText = pEl.getAttribute('data-para-text') || '';
        const secId = pEl.getAttribute('data-sec-id') || activeSectionId;
        const pIndex = parseInt(pKey.split('_').pop() || '0', 10);
        const words = countWords(pText);
        newlyReadParas.push({ sectionId: secId, paraIndex: pIndex, words });
      }
    });

    if (newlyReadParas.length > 0) {
      const totalWords = newlyReadParas.reduce((acc, p) => acc + p.words, 0);
      flowStore.recordReadingActivity(totalWords, 'scroll');
      dispatch('paragraphsRead', { paragraphs: newlyReadParas });
    }

    // 章節自動感應錨定
    const sectionHeaders = scrollContainer.querySelectorAll<HTMLElement>('section[id^="sec-"], header[id^="sec-"]');
    let currentInViewId = activeSectionId;
    let closestDistance = Infinity;

    sectionHeaders.forEach((el) => {
      const elTop = el.offsetTop - viewportTop;
      if (elTop <= 160 && Math.abs(elTop) < closestDistance) {
        closestDistance = Math.abs(elTop);
        const id = el.id.replace(/^sec-/, '');
        currentInViewId = id;
      }
    });

    if (currentInViewId && currentInViewId !== activeSectionId) {
      activeSectionId = currentInViewId;
      dispatch('sectionChanged', { sectionId: currentInViewId });
    }
  }

  async function toggleParagraphTranslation(secId: string, pIndex: number, text: string, forceRetry: boolean = false) {
    flowStore.recordReadingActivity(25, 'interact');
    markParagraphAsRead(secId, pIndex, text);
    const key = `${secId}_${pIndex}`;
    
    if (isTypingMap[key]) {
      isTypingMap[key] = false;
      return;
    }

    if (showTranslationMap[key] && !forceRetry) {
      showTranslationMap[key] = false;
      return;
    }

    showTranslationMap[key] = true;

    if (paragraphTranslations[key] && !forceRetry) {
      return;
    }

    translatingMap[key] = true;
    isTypingMap[key] = true;
    paragraphTranslations[key] = '';
    translationSourceMap[key] = '';
    translationNoticeMap[key] = '';

    try {
      const p = (typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') : null) || 'groq';
      const k = (typeof window !== 'undefined' ? localStorage.getItem(`mugen_api_key_${p}`) : null) || '';
      const m = (typeof window !== 'undefined' ? localStorage.getItem('mugen_model') : null) || 'llama-3.3-70b-versatile';
      const o = (typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') : null) || 'http://localhost:11434';

      const streamResult = await translateAcademicText(
        text,
        p,
        k,
        m,
        o,
        (currentText) => {
          if (isTypingMap[key]) {
            paragraphTranslations[key] = currentText;
          }
        },
        paper?.title
      );

      paragraphTranslations[key] = streamResult.text;
      translationSourceMap[key] = streamResult.source || 'AI 伴讀專屬模型';
      if (streamResult.isOfflineFallback) {
        translationNoticeMap[key] = '目前處於本機離線快取/智慧備援模式。設定 API 金鑰可獲得最頂級之文脈理解。';
      }
    } catch (err: any) {
      paragraphTranslations[key] = `[翻譯暫時無法完成: ${err.message || '連線逾時'}]`;
    } finally {
      translatingMap[key] = false;
      setTimeout(() => {
        isTypingMap[key] = false;
      }, 500);
    }
  }

  async function translateEntireSection(sec: ChapterSection) {
    if (!sec.paragraphs || isSectionTranslating) return;
    isSectionTranslating = true;
    try {
      for (let i = 0; i < sec.paragraphs.length; i++) {
        await toggleParagraphTranslation(sec.id, i, sec.paragraphs[i]);
        await new Promise(r => setTimeout(r, 120));
      }
    } finally {
      isSectionTranslating = false;
    }
  }

  function triggerCognitiveAction(action: string, sec: ChapterSection) {
    dispatch('readerAction', { action, section: sec });
  }

  function triggerAction(action: string, payload?: any) {
    dispatch('readerAction', { action, ...payload });
  }

  function handleSectionClick(secId: string) {
    activeSectionId = secId;
    dispatch('selectSection', { sectionId: secId });
  }

  function handleAuthorClick(author: string) {
    selectedAuthorInfo = selectedAuthorInfo === author ? null : author;
  }

  function toggleAbstract() {
    isAbstractCollapsed = !isAbstractCollapsed;
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && activeLightboxImg) closeLightbox(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<main
  bind:this={scrollContainer}
  on:scroll={handleContainerScroll}
  on:click={handleContainerClick}
  on:mouseup={handleMouseUp}
  class="h-full w-full overflow-y-auto overflow-x-hidden {readingMode === 'split' ? 'px-3 sm:px-5' : 'px-4 sm:px-8'} py-6 flex justify-center items-start bg-[#282828]"
>
  <div class="w-full {readingMode === 'split' ? 'max-w-none' : (readingMode === 'zen' ? 'max-w-[980px]' : 'max-w-[880px] xl:max-w-[940px]')} flex flex-col gap-6 pb-28 transition-[max-width] duration-300 mx-auto">

    {#if paper}
      <!-- Paper Academic Header -->
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
          on:selectAuthor={(e) => handleAuthorClick(e.detail.author)}
          on:closeAuthorInfo={() => selectedAuthorInfo = null}
        />

        <!-- Abstract Collapsible Card -->
        <div class="mt-1 bg-[#282828] border border-[#3c3836] p-3.5 rounded-lg flex flex-col gap-2 shadow-inner">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#fabd2f] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-[#fe8019]">auto_stories</span> 雙語論文核心摘要 (Bilingual Abstract Core)
            </span>
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 transition-colors cursor-pointer"
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
        {#each allSections as sec (sec.id)}
          {@const isFocused = sec.id === activeSectionId}
          {@const hasRead = sec.isRead || (sec.progress && sec.progress > 0)}
          {@const normalizedParas = normalizeParagraphs(sec.paragraphs)}
          {@const textParas = normalizedParas.filter(p => p.type === 'text' && p.text && p.text.trim().length > 0)}
          {@const totalTextParas = textParas.length}
          {@const hasDirectContent = totalTextParas > 0 || (sec.figures && sec.figures.length > 0) || (sec.formulas && sec.formulas.length > 0) || (sec.svoSentence && readingMode !== 'zen')}
          {@const isPureHeading = !hasDirectContent}

          {#if isPureHeading}
            <!-- PURE SECTION / CHAPTER HEADING DIVIDER -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <header
              id={`sec-${sec.id}`}
              class="mt-8 mb-2 pt-6 pb-4 border-b-2 border-[#fe8019]/40 flex flex-col gap-2 relative transition-all duration-300 cursor-pointer group/chapter {
                isFocused
                  ? 'bg-[#32302f]/50 -mx-3 sm:-mx-4 px-3 sm:px-4 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                  : 'hover:border-[#fe8019]/70'
              }"
              on:click={() => handleSectionClick(sec.id)}
            >
              <div class="absolute -left-1 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full transition-opacity duration-300 {isFocused ? 'focus-lens-bar opacity-100' : 'opacity-0 pointer-events-none'}"></div>

              <div class="flex items-center justify-between gap-3">
                <div class="flex items-baseline gap-3 min-w-0">
                  <span class="font-mono {sec.level === 1 ? 'text-base font-bold bg-[#fe8019] text-[#1d2021] px-2.5 py-0.5 rounded shadow-sm' : 'text-sm font-bold text-[#fabd2f] bg-[#282828] border border-[#504945] px-2 py-0.5 rounded'} shrink-0">
                    § {sec.title.split(' ')[0] || sec.id}
                  </span>
                  <h2 class="{sec.level === 1 ? 'text-2xl sm:text-[26px] font-serif font-bold text-[#ebdbb2]' : 'text-lg sm:text-xl font-bold text-[#ebdbb2]'} tracking-tight truncate group-hover/chapter:text-[#fe8019] transition-colors">
                    {sec.title.replace(/^[0-9.]+\s*/, '')}
                  </h2>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  {#if sec.page || paper?.pdfUrl || paper?.arxivId || paper?.type === 'web'}
                    <button
                      class="flex items-center gap-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2.5 py-1 rounded text-xs font-mono text-[#fabd2f] transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                      on:click|stopPropagation={() => triggerAction('openOriginalToPage', { page: sec.page || 1, sectionId: sec.id })}
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
                    {sec.children.map((c: any) => (c.title || '').split(' ')[0]).filter(Boolean).join(', ')}
                  </span>
                </div>
              {/if}
            </header>
          {:else}
            <!-- REGULAR CONTENT SECTION CARD -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <section
              id={`sec-${sec.id}`}
              class="flex flex-col gap-3 transition-[background-color,border-color,box-shadow,opacity] duration-300 rounded-xl p-4 sm:p-5 relative {
                isFocused
                  ? 'bg-[#32302f] border border-[#fe8019]/60 shadow-[0_4px_24px_rgba(0,0,0,0.4)] opacity-100'
                  : hasRead
                    ? 'bg-[#282828]/45 hover:bg-[#282828] border border-[#3c3836]/40 opacity-75 hover:opacity-95'
                    : 'bg-[#1d2021]/30 hover:bg-[#282828]/30 border border-[#3c3836]/20 opacity-35 hover:opacity-65'
              }"
              on:click={() => handleSectionClick(sec.id)}
            >
              <div class="absolute -left-1 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full transition-opacity duration-300 {isFocused ? 'focus-lens-bar opacity-100' : 'opacity-0 pointer-events-none'}"></div>

              <div class="flex items-center justify-between gap-2 pb-2 mb-0.5 border-b border-[#3c3836]/60">
                <div class="flex items-baseline gap-2.5 min-w-0">
                  <span class="font-mono text-sm font-bold {sec.level === 1 ? 'text-[#fe8019]' : 'text-[#fabd2f] bg-[#282828] border border-[#504945]/70 px-2 py-0.5 rounded'} shrink-0">
                    {sec.title.split(' ')[0] || sec.id}
                  </span>
                  <h3 class="{sec.level === 1 ? 'text-2xl font-serif text-[#ebdbb2]' : 'text-lg sm:text-[19px] font-serif font-bold text-[#fbf1c7]'} tracking-tight truncate">
                    {sec.title.replace(/^[0-9.]+\s*/, '')}
                  </h3>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  {#if sec.page || paper?.pdfUrl || paper?.arxivId || paper?.type === 'web'}
                    <button
                      class="flex items-center gap-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2 py-0.5 rounded text-[11px] font-mono text-[#fabd2f] transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                      on:click|stopPropagation={() => triggerAction('openOriginalToPage', { page: sec.page || 1, sectionId: sec.id })}
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
                      <span class="font-mono text-[9px] font-semibold uppercase hidden sm:inline">Focus Lens Active</span>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Paragraphs with Inline Bilingual Translation & Figures -->
              <div class="flex flex-col gap-5">
                {#each normalizeParagraphs(sec.paragraphs) as item, itemIdx}
                  {@const pIndex = item.originalIndex}
                  {@const key = `${sec.id}_${pIndex}`}
                  <BilingualParagraphItem
                    {item}
                    {sec}
                    {totalTextParas}
                    {readingMode}
                    isParaFocused={focusedParagraphKey === key}
                    isPacerActive={$flowStore.isPacerActive}
                    targetPacingWpm={$flowStore.targetPacingWpm}
                    showTranslation={Boolean(showTranslationMap[key])}
                    isTranslating={Boolean(translatingMap[key])}
                    isTyping={Boolean(isTypingMap[key])}
                    translationText={paragraphTranslations[key] || ''}
                    translationSource={translationSourceMap[key] || ''}
                    translationNotice={translationNoticeMap[key] || ''}
                    {copyToastText}
                    on:paragraphClick={(e) => handleParagraphClick(e.detail.secId, e.detail.pIndex, e.detail.text)}
                    on:askCompanion={(e) => askCompanionAboutParagraph(e.detail.sec, e.detail.pIndex, e.detail.text)}
                    on:toggleTranslation={(e) => toggleParagraphTranslation(e.detail.secId, e.detail.pIndex, e.detail.text)}
                    on:retranslate={(e) => toggleParagraphTranslation(e.detail.secId, e.detail.pIndex, e.detail.text, true)}
                    on:openLightbox={(e) => openLightbox(e.detail.url, e.detail.caption)}
                    on:copyLatex={(e) => copyLatex(e.detail.latex)}
                    on:copyTranslation={(e) => copyTranslationText(e.detail.text)}
                    on:saveNote={(e) => dispatch('saveNote', e.detail)}
                    on:skipTyping={() => { isTypingMap[key] = false; }}
                  />
                {/each}
              </div>

              <!-- Section Structured Mathematical Formula Cards -->
              <SectionFormulaChips
                {sec}
                formulas={getDeduplicatedFormulas(sec)}
                on:jumpToFormulaStudio={(e) => dispatch('readerAction', { action: 'jumpToFormulaStudio', formula: e.detail.formula, section: sec })}
                on:locateFormula={(e) => jumpToFormulaLocation(e.detail.formulaId as any, sec)}
              />

              <!-- Inline Semantic Action Toolbar -->
              {#if totalTextParas > 0}
                <CognitiveActionToolbar
                  {sec}
                  {readingMode}
                  {isFocused}
                  {loadingIntuitionId}
                  {loadingSyntaxId}
                  {loadingTerminologyId}
                  {isSectionTranslating}
                  on:showIntuition={(e) => triggerCognitiveAction('showIntuition', e.detail.sec)}
                  on:showSyntax={(e) => triggerCognitiveAction('showSyntax', e.detail.sec)}
                  on:showTerminology={(e) => triggerCognitiveAction('showTerminology', e.detail.sec)}
                  on:translateSection={(e) => translateEntireSection(e.detail.sec)}
                  on:addNote={(e) => triggerAction('addNote', { title: e.detail.title })}
                />
              {/if}
            </section>
          {/if}
        {/each}
      </div>
    {/if}

  </div>
</main>

<!-- High-Resolution Image Lightbox Modal (共用燈箱元件) -->
<ImageLightboxModal
  isOpen={Boolean(activeLightboxImg)}
  imageUrl={activeLightboxImg || ''}
  title={activeLightboxCaption}
  on:close={closeLightbox}
/>
