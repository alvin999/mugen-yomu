import type { ChapterSection, FormulaItem, PaperDocument } from '../../../types/document';
import { flattenSections } from '../../../stores/readingStore';

/**
 * 過濾與去重章節內的結構化公式
 */
export function getDeduplicatedFormulas(sec: ChapterSection): FormulaItem[] {
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

/**
 * 智慧解析章節標題之編號與主文字，避免非數字標題（如 ABSTRACT、論文主標題）重複顯示
 */
export function getSectionTitleParts(title: string, fallbackId: string): { prefix: string; mainTitle: string } {
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

/**
 * 在頁面中尋找並高亮特定公式
 */
export function scrollToFormulaInPage(
  formula: FormulaItem,
  targetSecId?: string,
  onShowToast?: (text: string) => void
) {
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
            onShowToast?.(`🎯 已定位 ${formula.number} 方程式`);
            return true;
          }
        }

        const mathParas = secEl.querySelectorAll('[id^="para-"]');
        for (const p of mathParas) {
          if (p.textContent && p.textContent.includes('$$')) {
            p.scrollIntoView({ behavior: 'smooth', block: 'center' });
            p.classList.add('formula-target-highlight');
            setTimeout(() => p.classList.remove('formula-target-highlight'), 3200);
            onShowToast?.(`🎯 已定位至公式段落`);
            return true;
          }
        }

        if (inlineCards.length > 0) {
          const firstCard = inlineCards[0] as HTMLElement;
          firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstCard.classList.add('formula-target-highlight');
          setTimeout(() => firstCard.classList.remove('formula-target-highlight'), 3200);
          onShowToast?.(`🎯 已定位至該節核心方程式`);
          return true;
        }

        secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        secEl.classList.add('formula-target-highlight');
        setTimeout(() => secEl.classList.remove('formula-target-highlight'), 3200);
        onShowToast?.(`🎯 已定位至章節標題`);
        return true;
      }
    }

    const allInlineCards = document.querySelectorAll('.group\\/display-math');
    for (const card of allInlineCards) {
      if (formula.number && card.textContent && card.textContent.includes(formula.number)) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('formula-target-highlight');
        setTimeout(() => card.classList.remove('formula-target-highlight'), 3200);
        onShowToast?.(`🎯 已定位至方程式 ${formula.number}`);
        return true;
      }
    }
    return false;
  };

  if (!findAndHighlight()) {
    setTimeout(findAndHighlight, 200);
  }
}

/**
 * 智慧匹配公式真實章節並觸發捲動
 */
export function jumpToFormulaLocation(
  formula: FormulaItem,
  sec: ChapterSection,
  paper: PaperDocument | null,
  activeSectionId: string,
  onSelectSection: (secId: string) => void,
  onShowToast: (text: string) => void
) {
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
    onSelectSection(finalSecId);
  }

  setTimeout(() => {
    scrollToFormulaInPage(formula, finalSecId, onShowToast);
  }, 150);
}

/**
 * 捲動至指定標的（章節、公式、段落），並高亮標的
 */
export function scrollToTarget(
  targetId: string,
  scrollContainer: HTMLElement | null,
  options?: {
    sectionId?: string;
    formulaNumber?: string;
    activeSectionId?: string;
    onSetProgrammaticScrolling?: (isScrolling: boolean) => void;
    onFocusSectionFirstPara?: (secId: string) => void;
  }
) {
  if (typeof document === 'undefined') return;

  const {
    sectionId,
    formulaNumber,
    activeSectionId = '',
    onSetProgrammaticScrolling,
    onFocusSectionFirstPara
  } = options || {};

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
      onSetProgrammaticScrolling?.(true);

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

      // 若為章節導航（非單一公式定位），游標位置跟著移動到新章節第一段
      const isFormula = targetId.startsWith('eq-') || targetId.includes('formula') || Boolean(formulaNumber);
      if (!isFormula && onFocusSectionFirstPara) {
        const secIdToFocus = sectionId || (targetId.startsWith('sec-') ? targetId.replace(/^sec-/, '') : targetId);
        onFocusSectionFirstPara(secIdToFocus);
      }

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

/**
 * 高亮並平滑捲動至指定段落
 */
export function highlightAndScrollToParagraph(
  paragraphKey: string,
  onSetProgrammaticScrolling?: (isScrolling: boolean) => void
) {
  if (typeof document === 'undefined') return;
  const cleanKey = paragraphKey.startsWith('para-') ? paragraphKey : `para-${paragraphKey}`;
  const el = document.getElementById(cleanKey);
  if (el) {
    onSetProgrammaticScrolling?.(true);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('para-pulse-highlight');
    setTimeout(() => {
      el.classList.remove('para-pulse-highlight');
    }, 3200);
  }
}
