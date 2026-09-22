<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PaperDocument, ChapterSection, FormulaItem } from '../../types/document';
  import { flattenSections } from '../../stores/readingStore';
  import { flowStore, countWords } from '../../stores/flowStore';
  import { translateAcademicText, generatePaperAbstractCore, FALLBACK_MODELS, getStoredApiKey } from '../../services/aiService';
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

  $: if (paper) {
    const isNewPaper = paper.id !== currentPaperId;
    if (isNewPaper) {
      currentPaperId = paper.id;
      passedParaKeys = new Set<string>();
    }
    const allSecs = paper.sections ? flattenSections(paper.sections) : [];
    const totalReadCount = allSecs.reduce((sum, s) => sum + (s.readParaIndices?.length || 0), 0);
    const anySectionRead = allSecs.some(s => s.isRead || (s.progress && s.progress > 0));

    if (!anySectionRead && totalReadCount === 0) {
      passedParaKeys = new Set<string>();
    } else if (isNewPaper) {
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

    for (const f of sec.formulas) {
      if (!f || !f.latexText) continue;
      const normalizedLatex = f.latexText.trim().replace(/\s+/g, '');

      if (f.sectionId && f.sectionId !== sec.id && !hasMathInSec) {
        continue;
      }
      if (f.sectionTitle && !f.sectionTitle.includes(sec.title) && !sec.title.includes(f.sectionTitle) && !hasMathInSec) {
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
          const secTitle = formula.sectionTitle;
          const matchedByTitle = flat.find(s => 
            secTitle.includes(s.title) || 
            s.title.includes(secTitle) ||
            (secTitle.includes('2.8') && s.title.includes('2.8'))
          );
          if (matchedByTitle) realSecId = matchedByTitle.id;
        }

        if (!realSecId || realSecId === sec.id) {
          const matchedByContent = flat.find(s => 
            s.paragraphs && s.paragraphs.some((p: string) => p.includes('$$') || (Boolean(formula.number) && p.includes(formula.number!)))
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

  // 智慧解析章節標題之編號與主文字，避免非數字標題（如 ABSTRACT、論文主標題）重複顯示
  function getSectionTitleParts(title: string, fallbackId: string) {
    if (!title) return { prefix: '§', mainTitle: fallbackId || '章節' };
    const trimmed = title.trim();
    const numMatch = trimmed.match(/^([0-9IVXLCDMA-Za-z]+(?:\.[0-9A-Za-z]+)*\.?)\s+(.*)$/);
    if (numMatch && /^(?:[0-9]+(?:\.[0-9]+)*|[IVXLCDM]+)\.?$/i.test(numMatch[1])) {
      return {
        prefix: numMatch[1].replace(/\.$/, ''),
        mainTitle: numMatch[2] || trimmed
      };
    }
    return {
      prefix: '§',
      mainTitle: trimmed
    };
  }

  export function scrollToTarget(targetId: string, sectionId?: string, formulaNumber?: string) {
    if (typeof document === 'undefined') return;

    const findElement = (): HTMLElement | null => {
      // 1. 若提供方程式編號 (例如 "(1)" 或 "1")，優先精準搜尋該編號之卡片
      const cleanNum = formulaNumber ? formulaNumber.replace(/[^0-9a-zA-Z]/g, '') : '';
      const secIdToSearch = sectionId || (targetId.startsWith('sec-') ? targetId.replace(/^sec-/, '') : activeSectionId);

      if (cleanNum && secIdToSearch) {
        const secEl = document.getElementById('sec-' + secIdToSearch);
        if (secEl) {
          const matchByNum = secEl.querySelector(`[data-equation-number="${cleanNum}"]`) ||
                             secEl.querySelector(`[data-raw-number="${formulaNumber}"]`);
          if (matchByNum) return matchByNum as HTMLElement;

          // 模糊比對包含該編號之卡片
          const inlineCards = secEl.querySelectorAll('.group\\/display-math');
          for (const card of inlineCards) {
            if (card.textContent && card.textContent.includes(`(${cleanNum})`)) {
              return card as HTMLElement;
            }
          }
        }
      }

      // 2. 完全符合 ID
      let el = document.getElementById(targetId);
      if (el) return el;

      // 3. 若指定了章節 sectionId，優先在該章節內搜尋公式或卡片
      const isFormulaTarget = targetId.startsWith('eq-') || targetId.includes('formula') || targetId.includes('eq');
      if (secIdToSearch) {
        const secEl = document.getElementById('sec-' + secIdToSearch);
        if (secEl) {
          const childMatch = secEl.querySelector(`[id="${targetId}"]`) ||
                             secEl.querySelector(`[id="eq-${targetId}"]`) ||
                             secEl.querySelector(`[data-formula-id="${targetId}"]`);
          if (childMatch) return childMatch as HTMLElement;

          if (isFormulaTarget) {
            const inlineFormula = secEl.querySelector('.group\\/display-math') ||
                                  secEl.querySelector('[id^="eq-"]') ||
                                  secEl.querySelector('.katex-display');
            if (inlineFormula) return inlineFormula as HTMLElement;
          } else {
            return secEl;
          }
        }
      }

      // 4. 作為備援跳轉，全域搜尋公式編號
      if (cleanNum) {
        const globalMatch = document.querySelector(`[data-equation-number="${cleanNum}"]`);
        if (globalMatch) return globalMatch as HTMLElement;
      }

      // 5. 作為備援跳轉但目標章節有公式：尋找章節內第一個正常包含公式之卡片
      if (isFormulaTarget) {
        const globalFormula = document.querySelector('.group\\/display-math') ||
                              document.querySelector('.katex-display');
        if (globalFormula) return globalFormula as HTMLElement;
      }

      // 6. 嘗試字綴變形
      const cleanId = targetId.startsWith('sec-') || targetId.startsWith('eq-') || targetId.startsWith('fig-')
        ? targetId
        : `sec-${targetId}`;
      el = document.getElementById(cleanId);
      if (el) return el;

      const rawId = targetId.replace(/^(?:eq|sec|fig)-/, '');
      el = document.getElementById(rawId) ||
           document.getElementById('eq-' + rawId) ||
           document.getElementById('sec-' + rawId);
      if (el) return el;

      // 7. 最終模糊搜尋
      return (document.querySelector(`[id*="${rawId}"]`) as HTMLElement) || null;
    };

    const doScrollAndHighlight = (): boolean => {
      const el = findElement();
      if (el) {
        isProgrammaticScrolling = true;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          isProgrammaticScrolling = false;
        }, 650);

        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const currentScroll = scrollContainer.scrollTop;
          const isFormula = targetId.startsWith('eq-') || targetId.includes('formula');
          const targetScroll = isFormula
            ? currentScroll + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
            : currentScroll + (elRect.top - containerRect.top) - 24;

          scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        el.classList.add('formula-target-highlight');
        setTimeout(() => {
          el.classList.remove('formula-target-highlight');
        }, 3200);
        return true;
      }
      return false;
    };

    if (!doScrollAndHighlight()) {
      setTimeout(() => {
        if (!doScrollAndHighlight()) {
          setTimeout(doScrollAndHighlight, 250);
        }
      }, 100);
    }
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

      // 嚴格判定段落是否處於閱讀視野：
      // 1. 段落頂部進入視野範圍（相對於容器頂部小於 70% 容器高度）且尚未完全移出上方（大於 30px）
      // 2. 或若使用者已滾動到達文末觸底（isAtBottom），且段落正在視窗中
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
      flowStore.recordReadingActivity(totalWords, 'scroll');
      dispatch('paragraphsRead', { paragraphs: newlyReadParas });
    }

    if (isAtBottom) {
      dispatch('reachedBottom');
    }

    // 章節自動感應錨定 (以視窗幾何閱讀基準線判定，避免上方章節標題搶焦)
    const sectionElements = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>('section[id^="sec-"], header[id^="sec-"]')
    );

    // 閱讀錨定基準線：距閱讀容器頂部 140px（考慮內距與章節頭部）
    const READING_LINE_OFFSET = 140;
    let currentInViewId: string | null = null;

    for (const el of sectionElements) {
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - containerRect.top;

      // 只要該章節頂部已到達或穿過閱讀基準線，便暫定為當前研讀章節
      if (elTop <= READING_LINE_OFFSET) {
        currentInViewId = el.id.replace(/^sec-/, '');
      } else {
        // 後續章節頂部尚未抵達基準線，結束搜尋
        break;
      }
    }

    // 若在文章最底部，確保鎖定至最後一個章節
    if (isAtBottom && sectionElements.length > 0) {
      currentInViewId = sectionElements[sectionElements.length - 1].id.replace(/^sec-/, '');
    }

    // 若在文章最頂部且尚未觸及第一章，預設為第一章
    if (!currentInViewId && sectionElements.length > 0) {
      currentInViewId = sectionElements[0].id.replace(/^sec-/, '');
    }

    if (currentInViewId && currentInViewId !== activeSectionId) {
      activeSectionId = currentInViewId;
      dispatch('sectionChanged', { sectionId: currentInViewId });
    }
  }

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

    // 若非 ensureOpen 模式且已展開，代表使用者主動點擊按鈕想要收起翻譯
    if (showTranslationMap[key] && !forceRetry && !ensureOpen) {
      showTranslationMap[key] = false;
      return;
    }

    // 確保展開
    showTranslationMap[key] = true;

    // 若已經有翻譯且不需重試，則已展開成功直接返回
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

        // 傳入 ensureOpen: true，保證一律展開，絕不反向收合先前已展開的段落
        await toggleParagraphTranslation(sec.id, i, pText, false, true);

        // 若本段原本就已有翻譯，立即展開無需延遲；若是新請求，保留間隔避免 API 頻率超標
        if (!alreadyHasTranslation) {
          await new Promise(r => setTimeout(r, 120));
        }
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
    scrollToTarget('sec-' + secId);
    dispatch('selectSection', { id: secId, sectionId: secId });
  }

  function handleAuthorClick(author: string) {
    selectedAuthorInfo = selectedAuthorInfo === author ? null : author;
  }

  function toggleAbstract() {
    isAbstractCollapsed = !isAbstractCollapsed;
  }

  // 摘要狀態與防呆判定 (嚴格考量免費 AI 額度)
  let isGeneratingAbstract: boolean = false;
  let abstractGenError: string = '';

  $: hasValidChineseSummary = Boolean(
    paper?.abstract?.chineseSummary &&
    paper.abstract.chineseSummary.trim().length > 0 &&
    !paper.abstract.chineseSummary.includes('此文獻已由 MUGEN YOMU')
  );

  $: rawEnglishAbstract = (paper?.abstract?.english || '').trim();
  $: isEnglishJinaNoise = rawEnglishAbstract.startsWith('Title:') || rawEnglishAbstract.startsWith('URL Source:');
  $: cleanEnglishAbstract = isEnglishJinaNoise ? '' : rawEnglishAbstract;
  $: hasValidEnglishSummary = Boolean(cleanEnglishAbstract.length > 0);

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
      abstractGenError = err.message || '生成失敗，請檢查 API Key 或網路狀態';
    } finally {
      isGeneratingAbstract = false;
    }
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && activeLightboxImg) closeLightbox(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<main
  bind:this={scrollContainer}
  on:scroll={handleContainerScroll}
  on:click={handleContainerClick}
  on:mouseup={handleMouseUp}
  class="h-full w-full overflow-y-auto overflow-x-hidden {readingMode === 'split' ? 'px-3 sm:px-5' : 'px-4 sm:px-8'} py-6 flex justify-center items-start bg-[#282828]"
>
  <div class="w-full {readingMode === 'split' ? 'max-w-none' : (readingMode === 'zen' ? 'max-w-[980px]' : 'max-w-[880px] xl:max-w-[940px]')} flex flex-col gap-6 pb-[65vh] transition-[max-width] duration-300 mx-auto">

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
                  on:click={handleGenerateAbstract}
                  title="由 AI 提煉論文核心導讀"
                >
                  <span class="material-symbols-outlined text-[12px]">auto_awesome</span>
                  <span>生成導讀</span>
                </button>
              {:else}
                <button
                  class="font-mono text-[10px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5 transition-colors cursor-pointer"
                  on:click={handleGenerateAbstract}
                  title="重新調用 AI 精煉核心導讀"
                >
                  <span class="material-symbols-outlined text-[12px]">refresh</span>
                  <span>重刷</span>
                </button>
              {/if}

              <button
                class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 transition-colors cursor-pointer ml-1"
                on:click={toggleAbstract}
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
                    on:click={handleGenerateAbstract}
                  >
                    重試
                  </button>
                </div>
              {/if}

              {#if hasValidChineseSummary}
                <!-- 正體中文核心提煉導讀 -->
                <p class="text-[#d5c4a1] leading-relaxed text-justify">
                  {paper.abstract.chineseSummary}
                </p>
                {#if cleanEnglishAbstract}
                  <p class="font-serif text-[#a89984] italic leading-relaxed border-t border-[#3c3836] pt-2 text-[13px]">
                    "{cleanEnglishAbstract}"
                  </p>
                {/if}
              {:else}
                <!-- 尚未生成中文導讀時的引導區塊 -->
                <div class="bg-[#32302f] border border-[#504945]/50 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-[#d5c4a1] text-[11px]">
                    <span class="material-symbols-outlined text-[#fe8019] text-[17px] shrink-0">psychology</span>
                    <span>尚未建立繁體中文核心導讀。點擊按鈕由 AI 提煉論文核心精華。</span>
                  </div>
                  <button
                    class="font-mono text-[11px] bg-[#fe8019] hover:bg-[#fabd2f] text-[#1d2021] font-medium px-3 py-1 rounded flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                    disabled={isGeneratingAbstract}
                    on:click={handleGenerateAbstract}
                  >
                    <span class="material-symbols-outlined text-[14px]">{isGeneratingAbstract ? 'progress_activity' : 'auto_awesome'}</span>
                    <span>{isGeneratingAbstract ? '提煉中...' : '✨ 提煉雙語導讀'}</span>
                  </button>
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
          {@const titleInfo = getSectionTitleParts(sec.title, sec.id)}

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
            <section
              id={`sec-${sec.id}`}
              class="flex flex-col gap-3 transition-[background-color,border-color,box-shadow,opacity] duration-300 rounded-xl p-4 sm:p-5 relative {
                isFocused
                  ? 'bg-[#32302f] border border-[#fe8019]/60 shadow-[0_4px_24px_rgba(0,0,0,0.4)] opacity-100'
                  : hasRead
                    ? 'bg-[#282828]/45 hover:bg-[#282828] border border-[#3c3836]/40 opacity-75 hover:opacity-95'
                    : 'bg-[#1d2021]/30 hover:bg-[#282828]/30 border border-[#3c3836]/20 opacity-35 hover:opacity-65'
              }"
            >
              <div class="absolute -left-1 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full transition-opacity duration-300 {isFocused ? 'focus-lens-bar opacity-100' : 'opacity-0 pointer-events-none'}"></div>

              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="flex items-center justify-between gap-2 pb-2 mb-0.5 border-b border-[#3c3836]/60 cursor-pointer group/sec-header"
                on:click={() => handleSectionClick(sec.id)}
                title="點擊定位至此章節頂部"
              >
                <div class="flex items-baseline gap-2.5 min-w-0">
                  <span class="font-mono text-sm font-bold {sec.level === 1 ? 'text-[#fe8019]' : 'text-[#fabd2f] bg-[#282828] border border-[#504945]/70 px-2 py-0.5 rounded'} shrink-0">
                    {titleInfo.prefix}
                  </span>
                  <h3 class="{sec.level === 1 ? 'text-2xl font-serif text-[#ebdbb2]' : 'text-lg sm:text-[19px] font-serif font-bold text-[#fbf1c7]'} tracking-tight truncate group-hover/sec-header:text-[#fe8019] transition-colors">
                    {titleInfo.mainTitle}
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
                    on:openSettings={() => triggerAction('openSettings')}
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
</main>

<!-- High-Resolution Image Lightbox Modal (共用燈箱元件) -->
<ImageLightboxModal
  isOpen={Boolean(activeLightboxImg)}
  imageUrl={activeLightboxImg || ''}
  caption={activeLightboxCaption}
  on:close={closeLightbox}
/>

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
