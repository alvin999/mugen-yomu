<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { PaperDocument, ChapterSection, FormulaItem } from '../../types/document';
  import {
    flattenSections,
    loadLastReadingPosition,
    saveLastReadingPosition,
    type ReadingPositionRecord
  } from '../../stores/readingStore';
  import { flowStore, countWords } from '../../stores/flowStore';
  import {
    translateAcademicText,
    generatePaperAbstractCore,
    FALLBACK_MODELS,
    getStoredApiKey
  } from '../../services/aiService';
  import { normalizeParagraphs } from '../../utils/paragraphUtils';
  import { copyLatexToClipboard } from '../../utils/katexUtils';
  import {
    vimConfigStore,
    vimCursorState,
    adjustCursorForScroll
  } from '../../stores/vimCursorStore';

  // Subcomponents
  import MugenPaperHeader from './header/MugenPaperHeader.svelte';
  import SectionHeadingDivider from './sections/SectionHeadingDivider.svelte';
  import SectionCard from './sections/SectionCard.svelte';
  import ImageLightboxModal from '../common/ImageLightboxModal.svelte';
  import VimCursorOverlay from './VimCursorOverlay.svelte';
  import VimStatusBar from './VimStatusBar.svelte';

  // Controllers & Utilities
  import {
    ReaderVimController,
    getAllRenderedParas
  } from './controllers/readerVimController';
  import {
    getDeduplicatedFormulas,
    jumpToFormulaLocation,
    scrollToTarget as helperScrollToTarget,
    highlightAndScrollToParagraph as helperHighlightPara
  } from './controllers/readerScrollManager';

  // Props
  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isAbstractCollapsed: boolean = false;

  export let focusedParagraphKey: string = '';
  export let focusedParagraphText: string = '';
  export let selectedText: string = '';

  export let loadingIntuitionId: string | null = null;
  export let loadingSyntaxId: string | null = null;
  export let loadingTerminologyId: string | null = null;

  const dispatch = createEventDispatcher<{
    selectSection: { id?: string; sectionId: string };
    sectionChanged: { sectionId: string };
    paragraphFocused: {
      sectionId: string;
      paragraphIndex: number;
      paragraphKey: string;
      text: string;
      selectedText: string;
    };
    textSelected: { text: string };
    probeCitation: { citation: string; sectionId: string; paragraphText: string };
    readerAction: { action: string; [key: string]: any };
    sectionDwell: { id: string; dwellSeconds: number };
    sectionSkimmed: { id: string };
    sectionInteracted: { id: string; action: string };
    sectionsPassed: { readSectionIds: string[]; currentSectionId: string };
    paragraphsRead: { paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }> };
    reachedBottom: void;
    updatePaper: { paper: PaperDocument };
    saveNote: any;
  }>();

  let scrollContainer: HTMLElement | null = null;
  let vimController = new ReaderVimController(null);

  let selectedAuthorInfo: string | null = null;
  let currentPaperId: string = '';
  let passedParaKeys = new Set<string>();

  // Toast State
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

  // Lightbox State
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

  // Scroll Sync State
  let lastScrollCheck = 0;
  let scrollTimeout: any = null;
  let isProgrammaticScrolling = false;
  let scrollSyncRafId: number | null = null;
  let lastScrollTop = 0;
  let sectionJumpTimer: any = null;
  let scrollDebounceTimer: any = null;

  // Paragraph Translation State
  let paragraphTranslations: Record<string, string> = {};
  let showTranslationMap: Record<string, boolean> = {};
  let translatingMap: Record<string, boolean> = {};
  let translationSourceMap: Record<string, string> = {};
  let translationNoticeMap: Record<string, string> = {};
  let isTypingMap: Record<string, boolean> = {};
  let isSectionTranslating: boolean = false;

  // Abstract Generation State
  let isGeneratingAbstract: boolean = false;
  let abstractGenError: string = '';

  $: allSections = flattenSections(paper?.sections || []);
  $: isCursorModeActive = Boolean($vimConfigStore.isVimEnabled && $vimCursorState.active);
  $: {
    flowStore.setCalculationMode(isCursorModeActive ? 'cursor' : 'page');
  }

  let prevVimActive = false;
  // 當游標由非活躍恢復為活躍（例如關閉 Modal）時，自動重新吸附就位
  $: {
    const curVimActive = Boolean($vimConfigStore.isVimEnabled && $vimCursorState.active);
    if (curVimActive && !prevVimActive) {
      if ($vimCursorState.sectionId && $vimCursorState.paraIndex !== undefined) {
        requestAnimationFrame(() => {
          if (scrollContainer) lastScrollTop = scrollContainer.scrollTop;
          vimController.syncCursor(
            $vimCursorState.sectionId,
            $vimCursorState.paraIndex,
            vimController.currentCharIndex || 0,
            false,
            true
          );
        });
      }
    }
    prevVimActive = curVimActive;
  }

  // --- 閱讀進度保留 (有游標以游標為主，無游標以段落為主) ---
  let savePositionTimer: any = null;

  function persistReadingPosition(forcedType?: 'cursor' | 'paragraph') {
    if (!paper || !paper.id) return;

    const isCursorActive = $vimConfigStore.isVimEnabled && $vimCursorState.active;
    const targetType = forcedType || (isCursorActive ? 'cursor' : 'paragraph');

    if (targetType === 'cursor' && isCursorActive && $vimCursorState.sectionId) {
      const cursorPos = vimController.getCurrentCursorReadingPos();
      const secId = cursorPos?.secId || $vimCursorState.sectionId;
      const pIndex = cursorPos !== null ? cursorPos.pIndex : $vimCursorState.paraIndex;
      const charIndex = cursorPos !== null ? cursorPos.charIndex : $vimCursorState.charIndex;
      const pKey = `${secId}_${pIndex}`;

      const record: ReadingPositionRecord = {
        paperId: paper.id,
        type: 'cursor',
        sectionId: secId,
        paraIndex: pIndex,
        paragraphKey: pKey,
        charIndex,
        timestamp: Date.now()
      };
      saveLastReadingPosition(paper.id, record);
      return;
    }

    // 沒有游標或以段落為主
    let secId = activeSectionId;
    let pIndex = 0;
    let pKey = focusedParagraphKey;

    if (pKey) {
      const parts = pKey.split('_');
      pIndex = parseInt(parts.pop() || '0', 10);
      secId = parts.join('_') || secId;
    } else if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const paraElements = scrollContainer.querySelectorAll<HTMLElement>('[data-para-key]');
      const targetLine = containerRect.top + 160;
      let bestDist = Infinity;

      for (const pEl of paraElements) {
        const rect = pEl.getBoundingClientRect();
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          const dist = Math.abs(rect.top - targetLine);
          if (dist < bestDist) {
            bestDist = dist;
            pKey = pEl.getAttribute('data-para-key') || '';
            secId = pEl.getAttribute('data-sec-id') || secId;
            pIndex = parseInt(pKey.split('_').pop() || '0', 10);
          }
        }
      }
    }

    if (secId) {
      const record: ReadingPositionRecord = {
        paperId: paper.id,
        type: 'paragraph',
        sectionId: secId,
        paraIndex: pIndex,
        paragraphKey: pKey || `${secId}_${pIndex}`,
        timestamp: Date.now()
      };
      saveLastReadingPosition(paper.id, record);
    }
  }

  function schedulePersistPosition(delay: number = 350, forcedType?: 'cursor' | 'paragraph') {
    if (savePositionTimer) clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(() => {
      persistReadingPosition(forcedType);
    }, delay);
  }

  function restoreLastReadingPosition() {
    if (!paper || !paper.id) return;
    const lastPos = loadLastReadingPosition(paper.id);
    if (!lastPos) {
      // 若無歷史進度，執行原預設：捲動至焦點章節並在 Vim 啟用時選第一段
      if (activeSectionId) {
        isProgrammaticScrolling = true;
        setTimeout(() => {
          scrollToTarget('sec-' + activeSectionId);
          setTimeout(() => { isProgrammaticScrolling = false; }, 500);
        }, 100);
      }
      setTimeout(() => {
        if ($vimConfigStore.isVimEnabled && !$vimCursorState.active) {
          const paras = getAllRenderedParas(scrollContainer, activeSectionId);
          if (paras.length > 0) {
            const first = paras[0];
            focusedParagraphKey = first.key;
            focusedParagraphText = first.text;
            vimController.syncCursor(first.secId, first.pIndex, 0, false);
          }
        }
      }, 400);
      return;
    }

    // 依據「有游標以游標為主，無游標以段落為主」復原
    setTimeout(() => {
      const targetKey = lastPos.paragraphKey || `${lastPos.sectionId}_${lastPos.paraIndex}`;
      const targetEl = document.getElementById(`para-${targetKey}`) ||
                       scrollContainer?.querySelector<HTMLElement>(`[data-para-key="${targetKey}"]`);

      // 情況一：有游標記錄 且 Vim 開啟 -> 以游標為主
      if (lastPos.type === 'cursor' && $vimConfigStore.isVimEnabled) {
        if (targetEl) {
          focusedParagraphKey = targetKey;
          focusedParagraphText = targetEl.getAttribute('data-para-text') || '';
          activeSectionId = lastPos.sectionId;
          const charIdx = typeof lastPos.charIndex === 'number' ? lastPos.charIndex : 0;
          
          isProgrammaticScrolling = true;
          vimController.syncCursor(lastPos.sectionId, lastPos.paraIndex, charIdx, false, false);
          setTimeout(() => { isProgrammaticScrolling = false; }, 600);
          return;
        }
      }

      // 情況二：沒有游標記錄（或 Vim 未開啟）-> 以段落為主
      if (targetEl) {
        focusedParagraphKey = targetKey;
        focusedParagraphText = targetEl.getAttribute('data-para-text') || '';
        activeSectionId = lastPos.sectionId;

        // 平滑捲動至視線居中位置
        isProgrammaticScrolling = true;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { isProgrammaticScrolling = false; }, 600);
      } else if (lastPos.sectionId) {
        // 若找不到特定段落，降級捲動至章節
        scrollToTarget('sec-' + lastPos.sectionId);
      }
    }, 280);
  }

  const handleBeforeUnload = () => {
    persistReadingPosition();
  };

  $: if (paper) {
    const isNewPaper = paper.id !== currentPaperId;
    if (isNewPaper) {
      if (currentPaperId) {
        persistReadingPosition();
      }
      currentPaperId = paper.id;
      passedParaKeys = new Set<string>();
      restoreLastReadingPosition();
    }
    const allSecs = paper.sections ? flattenSections(paper.sections) : [];
    const totalReadCount = allSecs.reduce((sum, s) => sum + (s.readParaIndices?.length || 0), 0);
    if (totalReadCount === 0 && passedParaKeys.size > 0) {
      passedParaKeys = new Set<string>();
    }
    // 同步歷史已讀段落到 passedParaKeys
    for (const s of allSecs) {
      if (s.readParaIndices && s.readParaIndices.length > 0) {
        for (const idx of s.readParaIndices) {
          passedParaKeys.add(`${s.id}_${idx}`);
        }
      }
    }
  }

  onMount(() => {
    vimController.setScrollContainer(scrollContainer);
    if (scrollContainer) lastScrollTop = scrollContainer.scrollTop;

    // 設定 hook：游標移動觸發自動捲動前，標記為 programmatic scroll
    // 這樣可避免 scroll handler 以視線重新計算覆蓋 vim 游標帶來的 focus 狀態
    vimController.setBeforeScrollHook(() => {
      isProgrammaticScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isProgrammaticScrolling = false; }, 650);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // 啟動最後閱讀位置復原
    restoreLastReadingPosition();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    persistReadingPosition();
    if (savePositionTimer) clearTimeout(savePositionTimer);
    if (scrollSyncRafId !== null) cancelAnimationFrame(scrollSyncRafId);
    if (sectionJumpTimer) clearTimeout(sectionJumpTimer);
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    if (scrollTimeout) clearTimeout(scrollTimeout);
  });

  // --- Paragraph Progress & Click Handlers ---
  function markParagraphAsRead(secId: string, pIndex: number, text: string) {
    const key = `${secId}_${pIndex}`;
    if (!passedParaKeys.has(key)) {
      passedParaKeys.add(key);
      const words = countWords(text);
      if (!isCursorModeActive) {
        flowStore.recordReadingActivity(Math.max(15, words), 'skim');
      }
      dispatch('paragraphsRead', {
        paragraphs: [{ sectionId: secId, paraIndex: pIndex, words }]
      });
    }
  }

  function handleParagraphClick(secId: string, pIndex: number, text: string, clickCharIdx?: number) {
    const key = `${secId}_${pIndex}`;
    focusedParagraphKey = key;
    focusedParagraphText = text;
    activeSectionId = secId;

    if (clickCharIdx !== undefined) {
      vimController.currentCharIndex = clickCharIdx;
    }
    vimController.preferredColLeft = null;

    markParagraphAsRead(secId, pIndex, text);

    flowStore.touchActivity();

    if ($vimConfigStore.isVimEnabled) {
      vimController.recordPositionChange(
        secId,
        pIndex,
        vimController.currentCharIndex,
        text,
        (deltaWords, moveType, elapsedMs) => {
          flowStore.recordCursorProgress(deltaWords, moveType, elapsedMs);
        }
      );
    } else {
      const pWords = countWords(text);
      flowStore.recordReadingActivity(Math.min(20, Math.round(pWords * 0.2)), 'skim');
    }

    vimController.syncCursor(secId, pIndex, vimController.currentCharIndex, true);

    dispatch('paragraphFocused', {
      sectionId: secId,
      paragraphIndex: pIndex,
      paragraphKey: key,
      text,
      selectedText
    });

    if ($vimConfigStore.isVimEnabled) {
      schedulePersistPosition(300, 'cursor');
    } else {
      schedulePersistPosition(300, 'paragraph');
    }
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

  // --- Exported Methods for Parent / External Orchestration ---
  export function scrollToTarget(targetId: string, sectionId?: string, formulaNumber?: string) {
    helperScrollToTarget(targetId, scrollContainer, {
      sectionId,
      formulaNumber,
      activeSectionId,
      onSetProgrammaticScrolling: (isScrolling) => {
        isProgrammaticScrolling = isScrolling;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => { isProgrammaticScrolling = false; }, 650);
      },
      onFocusSectionFirstPara: (secId) => {
        focusSectionFirstParagraph(secId, { syncImmediately: false });
      }
    });
  }

  export function focusSectionFirstParagraph(
    targetSecId: string,
    options: { syncImmediately?: boolean } = {}
  ): boolean {
    if (typeof document === 'undefined' || !targetSecId) return false;

    const cleanSecId = targetSecId.replace(/^sec-/, '');
    const secEl = document.getElementById('sec-' + cleanSecId);

    let targetParaEl: HTMLElement | null = null;
    if (secEl) {
      targetParaEl = secEl.querySelector<HTMLElement>('[data-para-key]');
    }

    if (!targetParaEl) {
      const allParas = getAllRenderedParas(scrollContainer, activeSectionId);
      const matched = allParas.find(
        p => p.secId === cleanSecId || p.secId.startsWith(cleanSecId + '.') || p.secId.startsWith(cleanSecId + '_')
      );
      if (matched) {
        targetParaEl = matched.el;
      }
    }

    if (!targetParaEl) return false;

    const pKey = targetParaEl.getAttribute('data-para-key') || '';
    const pText = targetParaEl.getAttribute('data-para-text') || '';
    const pSecId = targetParaEl.getAttribute('data-sec-id') || cleanSecId;
    const pIndex = parseInt(pKey.split('_').pop() || '0', 10);

    focusedParagraphKey = pKey;
    focusedParagraphText = pText;
    activeSectionId = pSecId;
    vimController.currentCharIndex = 0;
    vimController.preferredColLeft = null;

    markParagraphAsRead(pSecId, pIndex, pText);

    dispatch('paragraphFocused', {
      sectionId: pSecId,
      paragraphIndex: pIndex,
      paragraphKey: pKey,
      text: pText,
      selectedText: ''
    });

    const performSync = () => {
      if (scrollContainer) lastScrollTop = scrollContainer.scrollTop;
      vimController.syncCursor(pSecId, pIndex, 0, false, true);
    };

    // 1. 先行瞬移就位，讓游標與新段落焦點即時同步，並平滑跟隨捲動
    performSync();

    // 2. 若有平滑捲動，在捲動中途與結束時進行重校防護
    if (!options.syncImmediately) {
      if (sectionJumpTimer) clearTimeout(sectionJumpTimer);
      sectionJumpTimer = setTimeout(performSync, 450);

      if (scrollContainer && 'onscrollend' in window) {
        const onEnd = () => {
          scrollContainer?.removeEventListener('scrollend', onEnd);
          if (sectionJumpTimer) clearTimeout(sectionJumpTimer);
          performSync();
        };
        scrollContainer.addEventListener('scrollend', onEnd, { once: true });
      }
    }

    return true;
  }

  export function resetScrollAndProgress() {
    passedParaKeys = new Set<string>();
    if (scrollContainer) {
      isProgrammaticScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isProgrammaticScrolling = false;
      }, 500);
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  export function highlightAndScrollToParagraph(paragraphKey: string) {
    focusedParagraphKey = paragraphKey;
    helperHighlightPara(paragraphKey, (isScrolling) => {
      isProgrammaticScrolling = isScrolling;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isProgrammaticScrolling = false; }, 500);
    });

    // 同步更新游標至目標段落
    const cleanKey = paragraphKey.startsWith('para-') ? paragraphKey.replace(/^para-/, '') : paragraphKey;
    const parts = cleanKey.split('_');
    const pIndex = parseInt(parts.pop() || '0', 10);
    const secId = parts.join('_');
    vimController.currentCharIndex = 0;
    vimController.preferredColLeft = null;
    if (scrollContainer) lastScrollTop = scrollContainer.scrollTop;
    vimController.syncCursor(secId, pIndex, 0, false, true);
  }

  // --- Translation Controller Handlers ---
  async function toggleParagraphTranslation(
    secId: string,
    pIndex: number,
    text: string,
    forceRetry: boolean = false,
    ensureOpen: boolean = false
  ) {
    flowStore.recordReadingActivity(25, 'interact');
    markParagraphAsRead(secId, pIndex, text);
    const key = `${secId}_${pIndex}`;

    if (isTypingMap[key]) {
      isTypingMap[key] = false;
      return;
    }

    if (showTranslationMap[key] && !forceRetry && !ensureOpen) {
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
      const k = getStoredApiKey(p);
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
        forceRetry
      );

      paragraphTranslations[key] = streamResult.translation;
      translationSourceMap[key] = streamResult.cached
        ? 'IndexedDB 本機快取'
        : (p === 'groq' ? 'Groq LPU 極速推論' : 'AI 伴讀專屬模型');

      if (!k && p !== 'ollama') {
        translationNoticeMap[key] = `尚未設定 ${p.toUpperCase()} 金鑰。請於右上方設定自備金鑰 (BYOK) 以連線官方端點即時翻譯。`;
      } else if (streamResult.fallbackNotice) {
        translationNoticeMap[key] = `目前狀態（${streamResult.fallbackNotice}）。`;
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
        const pText = sec.paragraphs[i];
        if (!pText || pText.trim().length === 0) continue;
        const key = `${sec.id}_${i}`;
        const alreadyHasTranslation = Boolean(paragraphTranslations[key]);

        await toggleParagraphTranslation(sec.id, i, pText, false, true);

        if (!alreadyHasTranslation) {
          await new Promise(r => setTimeout(r, 120));
        }
      }
    } finally {
      isSectionTranslating = false;
    }
  }

  // --- Abstract Generator Handlers ---
  async function handleGenerateAbstract() {
    if (!paper || isGeneratingAbstract) return;
    isGeneratingAbstract = true;
    abstractGenError = '';

    try {
      const activeProvider = localStorage.getItem('mugen_provider') || 'groq';
      const apiKey = getStoredApiKey(activeProvider);
      const activeModel = localStorage.getItem('mugen_model') || (FALLBACK_MODELS[activeProvider]?.[0]?.id) || '';
      const ollamaUrl = localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434';

      if (!apiKey && activeProvider !== 'ollama') {
        throw new Error(`請先在右側伴讀欄或設定中配置 ${activeProvider.toUpperCase()} API Key`);
      }

      const res = await generatePaperAbstractCore(paper, activeProvider, apiKey, activeModel, ollamaUrl);

      paper.abstract = {
        chineseSummary: res.chineseSummary,
        english: res.english
      };

      isAbstractCollapsed = false;
      dispatch('updatePaper', { paper });
    } catch (err: any) {
      console.error('生成核心摘要失敗:', err);
      const msg = String(err?.message || '');
      if (msg.includes('unexpected EOF') || msg.includes('stream reading')) {
        abstractGenError = 'Groq 雲端連線不穩定，請重新點擊重試（系統已啟用 8B-Instant 自動修復）。';
      } else {
        abstractGenError = err.message || '生成失敗，請檢查 API Key 或網路狀態';
      }
    } finally {
      isGeneratingAbstract = false;
    }
  }

  // --- Container Event Handlers ---
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
    if (!scrollContainer) return;

    // --- 游標視覺同步（永遠執行，不受 isProgrammaticScrolling 影響）---
    // vim 游標觸發的 comfort scroll 也需要這段來更新 overlay 位置
    if ($vimConfigStore.isVimEnabled && $vimCursorState.active) {
      if (scrollSyncRafId !== null) cancelAnimationFrame(scrollSyncRafId);
      scrollSyncRafId = requestAnimationFrame(() => {
        if (!scrollContainer) { scrollSyncRafId = null; return; }
        const newScrollTop = scrollContainer.scrollTop;
        const delta = newScrollTop - lastScrollTop;
        if (delta !== 0) {
          adjustCursorForScroll(delta);
          lastScrollTop = newScrollTop;
        }
        scrollSyncRafId = null;
      });

      // ── 捲動結束防手震自動重校（Debounced Re-sync）──
      // 當平滑捲動或手動捲動停止（80ms 無新捲動事件）時，
      // 以靜止 DOM 重新量測並精確吸附，徹底防止游標漂移或落入螢幕外
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(() => {
        if (!scrollContainer) return;
        lastScrollTop = scrollContainer.scrollTop;
        if ($vimConfigStore.isVimEnabled && $vimCursorState.active) {
          if ($vimCursorState.sectionId !== undefined && $vimCursorState.paraIndex !== undefined) {
            vimController.syncCursor($vimCursorState.sectionId, $vimCursorState.paraIndex, vimController.currentCharIndex, false, true);
          }
        }
        schedulePersistPosition(300);
      }, 80);
    } else {
      lastScrollTop = scrollContainer.scrollTop;
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(() => {
        schedulePersistPosition(350, 'paragraph');
      }, 250);
    }

    // --- 以下為 section 視線追蹤 / 閱讀進度，vim 自動捲動期間跳過 ---
    if (isProgrammaticScrolling) return;

    const now = Date.now();
    if (now - lastScrollCheck < 60) return;
    lastScrollCheck = now;

    const containerRect = scrollContainer.getBoundingClientRect();
    const isAtBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 35;
    const paraElements = scrollContainer.querySelectorAll<HTMLElement>('[data-para-key]');
    const newlyReadParas: Array<{ sectionId: string; paraIndex: number; words: number }> = [];

    paraElements.forEach((pEl) => {
      const pKey = pEl.getAttribute('data-para-key');
      if (!pKey || passedParaKeys.has(pKey)) return;

      const pRect = pEl.getBoundingClientRect();
      const pTopRel = pRect.top - containerRect.top;
      const pBottomRel = pRect.bottom - containerRect.top;

      const isInNormalReadingView = pTopRel < containerRect.height * 0.7 && pBottomRel > 30;
      const isInBottomView = isAtBottom && pTopRel < containerRect.height && pBottomRel > 0;

      if (isInNormalReadingView || isInBottomView) {
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
      if (!isCursorModeActive) {
        flowStore.recordReadingActivity(totalWords, 'scroll');
      }
      dispatch('paragraphsRead', { paragraphs: newlyReadParas });
    }

    if (isAtBottom) {
      dispatch('reachedBottom');
    }

    const sectionElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>('section[id^="sec-"], header[id^="sec-"]')
    );

    const READING_LINE_OFFSET = 140;
    let currentInViewId: string | null = null;

    for (const el of sectionElements) {
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - containerRect.top;

      if (elTop <= READING_LINE_OFFSET) {
        currentInViewId = el.id.replace(/^sec-/, '');
      } else {
        break;
      }
    }

    if (isAtBottom && sectionElements.length > 0) {
      currentInViewId = sectionElements[sectionElements.length - 1].id.replace(/^sec-/, '');
    }

    if (!currentInViewId && sectionElements.length > 0) {
      currentInViewId = sectionElements[0].id.replace(/^sec-/, '');
    }

    if (currentInViewId && currentInViewId !== activeSectionId) {
      activeSectionId = currentInViewId;
      dispatch('sectionChanged', { sectionId: currentInViewId });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    vimController.handleKeydown(e, {
      focusedParagraphKey,
      activeSectionId,
      onParagraphClick: (secId, pIndex, text, clickCharIdx) => {
        handleParagraphClick(secId, pIndex, text, clickCharIdx);
      },
      onSyncFocus: (secId, pIndex, text) => {
        const key = `${secId}_${pIndex}`;
        focusedParagraphKey = key;
        focusedParagraphText = text;
        dispatch('paragraphFocused', {
          sectionId: secId,
          paragraphIndex: pIndex,
          paragraphKey: key,
          text,
          selectedText
        });
      },
      onToggleTranslation: (secId, pIndex, text) => {
        toggleParagraphTranslation(secId, pIndex, text);
      },
      onAskCompanion: (secId, pIndex, text) => {
        const sec = allSections.find(s => s.id === secId) || { id: secId, title: secId };
        askCompanionAboutParagraph(sec as ChapterSection, pIndex, text);
      },
      onShowToast: (text) => showToast(text),
      onRecordActivity: (words, type) => flowStore.recordReadingActivity(words, type),
      onCursorProgress: (deltaWords, moveType, elapsedMs) => {
        flowStore.recordCursorProgress(deltaWords, moveType, elapsedMs);
      },
      onCloseLightbox: closeLightbox,
      isLightboxOpen: Boolean(activeLightboxImg)
    });

    if ($vimConfigStore.isVimEnabled) {
      schedulePersistPosition(300, 'cursor');
    }
  }

  function handleSectionClick(secId: string) {
    activeSectionId = secId;
    scrollToTarget('sec-' + secId);
    dispatch('selectSection', { id: secId, sectionId: secId });
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<main
  bind:this={scrollContainer}
  on:scroll={handleContainerScroll}
  on:click={handleContainerClick}
  on:mouseup={handleMouseUp}
  class="relative h-full w-full overflow-y-auto overflow-x-hidden {readingMode === 'split' ? 'px-3 sm:px-5' : 'px-4 sm:px-8'} py-6 flex justify-center items-start bg-[#282828]"
>
  <div class="w-full {readingMode === 'split' ? 'max-w-none' : (readingMode === 'zen' ? 'max-w-[980px]' : 'max-w-[880px] xl:max-w-[940px]')} flex flex-col gap-6 pb-[65vh] transition-[max-width] duration-300 mx-auto">

    {#if paper}
      <!-- Paper Academic Header with Bilingual Abstract Core -->
      <MugenPaperHeader
        {paper}
        {selectedAuthorInfo}
        {isAbstractCollapsed}
        {isGeneratingAbstract}
        {abstractGenError}
        on:selectAuthor={(e) => selectedAuthorInfo = selectedAuthorInfo === e.detail.author ? null : e.detail.author}
        on:closeAuthorInfo={() => selectedAuthorInfo = null}
        on:generateAbstract={handleGenerateAbstract}
        on:toggleAbstract={() => isAbstractCollapsed = !isAbstractCollapsed}
      />

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
            <!-- Pure Section / Chapter Heading Divider -->
            <SectionHeadingDivider
              {sec}
              {isFocused}
              {paper}
              on:sectionClick={(e) => handleSectionClick(e.detail.secId)}
              on:openOriginalToPage={(e) => dispatch('readerAction', { action: 'openOriginalToPage', ...e.detail })}
            />
          {:else}
            <!-- Regular Content Section Card -->
            <SectionCard
              {sec}
              {isFocused}
              {hasRead}
              {paper}
              {readingMode}
              {focusedParagraphKey}
              {showTranslationMap}
              {translatingMap}
              {isTypingMap}
              {paragraphTranslations}
              {translationSourceMap}
              {translationNoticeMap}
              {copyToastText}
              {loadingIntuitionId}
              {loadingSyntaxId}
              {loadingTerminologyId}
              {isSectionTranslating}
              deduplicatedFormulas={getDeduplicatedFormulas(sec)}
              on:sectionClick={(e) => handleSectionClick(e.detail.secId)}
              on:openOriginalToPage={(e) => dispatch('readerAction', { action: 'openOriginalToPage', ...e.detail })}
              on:paragraphClick={(e) => handleParagraphClick(e.detail.secId, e.detail.pIndex, e.detail.text, e.detail.clickCharIdx)}
              on:askCompanion={(e) => askCompanionAboutParagraph(e.detail.sec, e.detail.pIndex, e.detail.text)}
              on:toggleTranslation={(e) => toggleParagraphTranslation(e.detail.secId, e.detail.pIndex, e.detail.text)}
              on:retranslate={(e) => toggleParagraphTranslation(e.detail.secId, e.detail.pIndex, e.detail.text, true)}
              on:openLightbox={(e) => openLightbox(e.detail.url, e.detail.caption)}
              on:copyLatex={(e) => copyLatex(e.detail.latex)}
              on:copyTranslation={(e) => copyTranslationText(e.detail.text)}
              on:saveNote={(e) => dispatch('saveNote', e.detail)}
              on:skipTyping={(e) => { isTypingMap[e.detail.key] = false; }}
              on:openSettings={() => dispatch('readerAction', { action: 'openSettings' })}
              on:jumpToFormulaStudio={(e) => dispatch('readerAction', { action: 'jumpToFormulaStudio', ...e.detail })}
              on:locateFormula={(e) => jumpToFormulaLocation(e.detail.formula, e.detail.section, paper, activeSectionId, (sId) => { activeSectionId = sId; dispatch('selectSection', { sectionId: sId }); }, showToast)}
              on:cognitiveAction={(e) => dispatch('readerAction', { action: e.detail.action, section: e.detail.sec })}
              on:translateSection={(e) => translateEntireSection(e.detail.sec)}
              on:addNote={(e) => dispatch('readerAction', { action: 'addNote', title: e.detail.title })}
            />
          {/if}
        {/each}

        <!-- Document End Milestone & Breathing Room Spacer -->
        <div class="mt-16 pt-10 pb-8 border-t border-[#3c3836]/60 flex flex-col items-center justify-center text-center gap-4 text-[#a89984] select-none">
          <div class="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-[#7c6f64]">
            <span class="w-12 h-px bg-[#504945]/60"></span>
            <span class="flex items-center gap-1.5 text-[#fabd2f]">
              <span class="material-symbols-outlined text-sm">verified</span>
              <span>End of Document · 全文研讀完成</span>
            </span>
            <span class="w-12 h-px bg-[#504945]/60"></span>
          </div>

          <p class="text-xs text-[#928374] max-w-md font-mono leading-relaxed">
            您已研讀至文獻末尾。本篇所有認知節點與段落已完整錨定至本機知識庫。
          </p>

          <div class="flex items-center gap-3 mt-1">
            <button
              class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] text-xs font-mono text-[#ebdbb2] hover:text-[#fe8019] transition-all cursor-pointer shadow-xs active:scale-95"
              on:click={() => {
                if (scrollContainer) {
                  scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
              <span>回到論文頂端</span>
            </button>
            <button
              class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#8ec07c] text-xs font-mono text-[#8ec07c] transition-all cursor-pointer shadow-xs active:scale-95"
              on:click={() => dispatch('readerAction', { action: 'exportNotes' })}
            >
              <span class="material-symbols-outlined text-[14px]">psychology</span>
              <span>檢視本篇認知筆記</span>
            </button>
          </div>
        </div>
      </div>
    {/if}

  </div>

  <!-- Vim 物理動態與閃爍方塊游標層 -->
  <VimCursorOverlay />
</main>

<!-- High-Resolution Image Lightbox Modal -->
<ImageLightboxModal
  isOpen={Boolean(activeLightboxImg)}
  imageUrl={activeLightboxImg || ''}
  caption={activeLightboxCaption}
  on:close={closeLightbox}
/>

<!-- Neovim 閱讀狀態列與快捷鍵浮動指示器 -->
<VimStatusBar {readingMode} />

<style>
  /* 核心目標函數、章節跳轉與公式高亮脈衝動畫 */
  :global(.formula-target-highlight) {
    animation: formulaGlowPulse 2.8s cubic-bezier(0.4, 0, 0.2, 1) !important;
    border-color: #fe8019 !important;
    box-shadow: 0 0 35px rgba(254, 128, 25, 0.85), inset 0 0 15px rgba(254, 128, 25, 0.25) !important;
    outline: 2px solid #fe8019 !important;
    z-index: 30;
  }

  @keyframes formulaGlowPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(254, 128, 25, 0);
    }
    15% {
      transform: scale(1.02);
      box-shadow: 0 0 40px rgba(254, 128, 25, 0.95), inset 0 0 20px rgba(254, 128, 25, 0.35);
    }
    35% {
      transform: scale(1);
      box-shadow: 0 0 28px rgba(254, 128, 25, 0.75);
    }
    65% {
      box-shadow: 0 0 20px rgba(254, 128, 25, 0.5);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(254, 128, 25, 0);
    }
  }
</style>
