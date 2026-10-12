import {
  vimConfigStore,
  vimCursorState,
  updateCursorPosition,
  setVimHelpOpen,
  setVimMode,
  type CursorRect
} from '../../../stores/vimCursorStore';
import { countWords, countPreciseWords } from '../../../stores/flowStore';
import { getNextWordOffset, getPrevWordOffset, getWordEndOffset } from '../../../utils/wordNavigator';
import {
  pushJumpPoint,
  setPreviousJumpPoint,
  jumpStackStore,
  toggleJumpMenu,
  closeJumpMenu,
  setJumpMenuSelectedIndex,
  type JumpPoint
} from '../../../stores/jumpStackStore';
import { get } from 'svelte/store';

export interface CursorReadingPos {
  secId: string;
  pIndex: number;
  charIndex: number;
  timestamp: number;
  textSnippet: string;
}

export interface CharMetric {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
}

export interface RenderedPara {
  el: HTMLElement;
  key: string;
  secId: string;
  pIndex: number;
  text: string;
}

export function isTypingContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
}

export function getTextElement(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('.para-main-text') || el.querySelector<HTMLElement>('p') || el;
}

export function getParagraphVisualLines(
  el: HTMLElement,
  containerRect: DOMRect,
  scrollLeft: number,
  scrollTop: number
): CharMetric[][] {
  const textRoot = getTextElement(el);
  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  const allChars: CharMetric[] = [];
  let charCount = 0;

  while ((node = walker.nextNode() as Text)) {
    const val = node.nodeValue || '';
    const len = val.length;
    for (let i = 0; i < len; i++) {
      const range = document.createRange();
      try {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const left = r.left;
          const top = r.top;
          allChars.push({
            index: charCount + i,
            left,
            top,
            width: r.width,
            height: r.height,
            centerX: left + r.width / 2
          });
        }
      } catch (e) {}
    }
    charCount += len;
  }

  if (allChars.length === 0) {
    const pRect = textRoot.getBoundingClientRect();
    let fallbackH = 22;
    let fallbackW = 10;
    if (typeof window !== 'undefined') {
      try {
        const cs = window.getComputedStyle(textRoot);
        const fs = parseFloat(cs.fontSize) || 17;
        const lh = parseFloat(cs.lineHeight) || (fs * 1.5);
        fallbackH = lh;
        fallbackW = Math.round(fs * 0.55);
      } catch (e) {}
    }
    const fallback: CharMetric = {
      index: 0,
      left: pRect.left,
      top: pRect.top,
      width: fallbackW,
      height: fallbackH,
      centerX: pRect.left + fallbackW / 2
    };
    return [[fallback]];
  }

  // 依據字元高度動態計算視覺行分群閾值（避免字體調大或有數學符號時同行被誤切分）
  let totalH = 0;
  for (const c of allChars) totalH += c.height;
  const avgHeight = allChars.length > 0 ? totalH / allChars.length : 20;
  const lineThreshold = Math.max(8, avgHeight * 0.45);

  const lines: CharMetric[][] = [];
  let currentLine: CharMetric[] = [];
  let curLineTop = allChars[0].top;

  for (const c of allChars) {
    if (currentLine.length === 0 || Math.abs(c.top - curLineTop) < lineThreshold) {
      currentLine.push(c);
      curLineTop = (curLineTop * (currentLine.length - 1) + c.top) / currentLine.length;
    } else {
      lines.push(currentLine);
      currentLine = [c];
      curLineTop = c.top;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export function getParagraphVisibleCharIndices(el: HTMLElement): number[] {
  const textRoot = getTextElement(el);
  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  const indices: number[] = [];
  let charCount = 0;

  while ((node = walker.nextNode() as Text)) {
    const val = node.nodeValue || '';
    const len = val.length;
    for (let i = 0; i < len; i++) {
      const range = document.createRange();
      try {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          indices.push(charCount + i);
        }
      } catch (e) {}
    }
    charCount += len;
  }
  return indices;
}

export function getAllRenderedParas(scrollContainer: HTMLElement | null, fallbackSecId: string = ''): RenderedPara[] {
  if (!scrollContainer) return [];
  const elements = Array.from(scrollContainer.querySelectorAll<HTMLElement>('[data-para-key]'));
  return elements.map(el => {
    const key = el.getAttribute('data-para-key') || '';
    const secId = el.getAttribute('data-sec-id') || fallbackSecId;
    const text = el.getAttribute('data-para-text') || '';
    const pIndex = parseInt(key.split('_').pop() || '0', 10);
    return { el, key, secId, pIndex, text };
  });
}

/**
 * 依據游標所在字元位置，萃取前後約 25~30 個字元的鄰近上下文摘要
 * 讓讀者能清晰辨識游標當下停留在句中的哪一句話或公式旁
 */
export function extractContextSnippetAroundChar(fullText: string, charIndex: number, radius = 28): string {
  if (!fullText) return '';
  const clean = fullText.replace(/\s+/g, ' ').trim();
  if (clean.length <= radius * 2) return clean;

  const validCharIdx = Math.max(0, Math.min(clean.length - 1, charIndex));
  const start = Math.max(0, validCharIdx - radius);
  const end = Math.min(clean.length, validCharIdx + radius);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';

  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

/**
 * 依據文字偏移範圍在段落元素中建立原生 DOM 選取範圍 (Selection)
 */
export function createDomSelectionForRange(
  el: HTMLElement,
  startCharIdx: number,
  endCharIdx: number
): string {
  if (typeof window === 'undefined') return '';
  const textRoot = getTextElement(el);
  const minIdx = Math.min(startCharIdx, endCharIdx);
  const maxIdx = Math.max(startCharIdx, endCharIdx);

  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  let accumulated = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  while ((node = walker.nextNode() as Text)) {
    const len = (node.nodeValue || '').length;
    if (!startNode && accumulated + len >= minIdx) {
      startNode = node;
      startOffset = Math.max(0, minIdx - accumulated);
    }
    if (accumulated + len >= maxIdx + 1) {
      endNode = node;
      endOffset = Math.min(len, maxIdx + 1 - accumulated);
      break;
    }
    accumulated += len;
  }

  if (startNode) {
    if (!endNode) {
      endNode = startNode;
      endOffset = (startNode.nodeValue || '').length;
    }
    const range = document.createRange();
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
        return sel.toString();
      }
    } catch (e) {}
  }
  return '';
}

export function clearDomSelection() {
  if (typeof window !== 'undefined') {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }
}

export function computeCharRect(el: HTMLElement, charIdx: number, scrollContainer: HTMLElement | null): CursorRect | null {
  if (!scrollContainer) return null;
  const textRoot = getTextElement(el);

  const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  let accumulated = 0;
  let targetRange: Range | null = null;
  let lastValidNode: Text | null = null;
  let lastValidLen = 0;

  while ((node = walker.nextNode() as Text)) {
    const val = node.nodeValue || '';
    const len = val.length;
    if (len > 0) {
      lastValidNode = node;
      lastValidLen = len;
    }

    if (accumulated + len > charIdx) {
      const offset = Math.max(0, Math.min(len - 1, charIdx - accumulated));
      const r = document.createRange();
      try {
        r.setStart(node, offset);
        r.setEnd(node, Math.min(len, offset + 1));
        targetRange = r;
        break;
      } catch (e) {}
    }
    accumulated += len;
  }

  // 若 charIdx 位於段落最末或超出長度，定位在最後一個文字節點的最後一個字元
  if (!targetRange && lastValidNode && lastValidLen > 0) {
    const r = document.createRange();
    try {
      r.setStart(lastValidNode, lastValidLen - 1);
      r.setEnd(lastValidNode, lastValidLen);
      targetRange = r;
    } catch (e) {}
  }

  if (targetRange) {
    const r = targetRange.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      };
    }

    const rects = targetRange.getClientRects();
    if (rects.length > 0 && rects[0].height > 0) {
      return {
        left: rects[0].left,
        top: rects[0].top,
        width: rects[0].width > 0 ? rects[0].width : Math.max(8, rects[0].height * 0.45),
        height: rects[0].height
      };
    }

    if (charIdx > 0) {
      const prevRange = document.createRange();
      for (let back = 1; back <= Math.min(3, charIdx); back++) {
        const testIdx = charIdx - back;
        let testAcc = 0;
        const testWalker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
        let testNode: Text | null = null;
        while ((testNode = testWalker.nextNode() as Text)) {
          const tLen = (testNode.nodeValue || '').length;
          if (testAcc + tLen > testIdx) {
            const tOff = Math.max(0, testIdx - testAcc);
            try {
              prevRange.setStart(testNode, tOff);
              prevRange.setEnd(testNode, Math.min(tLen, tOff + 1));
              const prevR = prevRange.getBoundingClientRect();
              if (prevR.width > 0 && prevR.height > 0) {
                return {
                  left: prevR.left + prevR.width,
                  top: prevR.top,
                  width: Math.max(8, prevR.height * 0.45),
                  height: prevR.height
                };
              }
            } catch (e) {}
            break;
          }
          testAcc += tLen;
        }
      }
    }
  }

  const pRect = textRoot.getBoundingClientRect();
  let fallbackH = 22;
  let fallbackW = 10;
  if (typeof window !== 'undefined') {
    try {
      const cs = window.getComputedStyle(textRoot);
      const fs = parseFloat(cs.fontSize) || 17;
      const lh = parseFloat(cs.lineHeight) || (fs * 1.5);
      fallbackH = lh;
      fallbackW = Math.round(fs * 0.55);
    } catch (e) {}
  }
  return {
    left: pRect.left,
    top: pRect.top,
    width: fallbackW,
    height: fallbackH
  };
}

/** 捲軸式平滑滾動動畫器狀態與控制 */
let activeScrollRafId: number | null = null;

export function animateScrollTo(
  container: HTMLElement,
  targetTop: number,
  duration = 420
) {
  if (typeof window === 'undefined') {
    container.scrollTop = targetTop;
    return;
  }

  if (activeScrollRafId !== null) {
    cancelAnimationFrame(activeScrollRafId);
    activeScrollRafId = null;
  }

  const startTop = container.scrollTop;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const clampedTarget = Math.max(0, Math.min(maxScroll, targetTop));
  const distance = clampedTarget - startTop;

  // 若距離極小 (< 3px)，直接就位
  if (Math.abs(distance) < 3) {
    container.scrollTop = clampedTarget;
    return;
  }

  const startTime = performance.now();

  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Ease-Out Cubic: 具有物理慣性、減速緩停的古籍卷軸質感
    const ease = 1 - Math.pow(1 - progress, 3);
    container.scrollTop = startTop + distance * ease;

    if (progress < 1) {
      activeScrollRafId = requestAnimationFrame(step);
    } else {
      container.scrollTop = clampedTarget;
      activeScrollRafId = null;
    }
  }

  activeScrollRafId = requestAnimationFrame(step);
}

export function ensureCursorInComfortView(
  rect: CursorRect,
  scrollContainer: HTMLElement | null,
  options?: {
    isCrossParagraph?: boolean;
    isSmoothScrollEnabled?: boolean;
    zoomLevel?: number;
  }
) {
  if (!scrollContainer) return;
  const isSmooth = options?.isSmoothScrollEnabled ?? true;
  const isCross = options?.isCrossParagraph ?? false;
  const viewHeight = scrollContainer.clientHeight;
  const containerRect = scrollContainer.getBoundingClientRect();

  // 自適應計算容器當前的有效 zoom 縮放係數
  const z = options?.zoomLevel
    ? Math.max(0.1, options.zoomLevel / 100)
    : (containerRect.width > 0 && scrollContainer.clientWidth > 0
        ? containerRect.width / scrollContainer.clientWidth
        : 1);

  // 將視口物理像素換算為容器內部的真實 CSS 滾動像素
  const curTopInContainerCss = (rect.top - containerRect.top) / z;
  const curBottomInContainerCss = (rect.top + rect.height - containerRect.top) / z;

  // 跨段落移動（Cross-paragraph）：如紙卷/捲軸展開般連貫平滑向下開展新段落
  if (isCross) {
    if (isSmooth) {
      // 目標閱讀視線設定於視野高度的 26%~28%（黃金閱讀區）
      const desiredLine = viewHeight * 0.28;
      const targetScroll = Math.max(0, scrollContainer.scrollTop + curTopInContainerCss - desiredLine);
      const diff = Math.abs(targetScroll - scrollContainer.scrollTop);

      // 只要與理想視線有顯著落差，立即以 Ease-Out Cubic 啟動捲軸式平滑滑動
      if (diff > 25) {
        animateScrollTo(scrollContainer, targetScroll, 420);
        return;
      }
    } else {
      // 關閉平滑捲動：採用經典 Vim 即時瞬切到位
      const targetScroll = Math.max(0, scrollContainer.scrollTop + curTopInContainerCss - viewHeight * 0.28);
      scrollContainer.scrollTop = targetScroll;
      return;
    }
  }

  // 同段落內（Intra-paragraph）的微調跟隨
  if (isSmooth) {
    // 在同段落向下閱讀越過視窗 58%（中線偏下）時，捲軸平滑跟進一截，保持在視野中上方
    if (curBottomInContainerCss > viewHeight * 0.58) {
      const targetScroll = scrollContainer.scrollTop + curBottomInContainerCss - viewHeight * 0.45;
      animateScrollTo(scrollContainer, targetScroll, 360);
      return;
    } else if (curTopInContainerCss < viewHeight * 0.18) {
      const targetScroll = Math.max(0, scrollContainer.scrollTop + curTopInContainerCss - viewHeight * 0.28);
      animateScrollTo(scrollContainer, targetScroll, 360);
      return;
    }
  } else {
    // 關閉平滑時的邊界即時瞬切
    if (curTopInContainerCss < viewHeight * 0.18) {
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop + curTopInContainerCss - viewHeight * 0.28);
    } else if (curBottomInContainerCss > viewHeight * 0.72) {
      scrollContainer.scrollTop = scrollContainer.scrollTop + curBottomInContainerCss - viewHeight * 0.65;
    }
  }
}

/**
 * Vim 導航狀態控制器類別
 */
export class ReaderVimController {
  private scrollContainer: HTMLElement | null = null;
  private zoomLevel: number = 100;
  public currentCharIndex: number = 0;
  public preferredColLeft: number | null = null;
  /** 追蹤目前游標所在段落的 key（`${secId}_${pIndex}`），避免依賴 Svelte reactivity 時序 */
  public currentParaKey: string = '';
  /** 在 ensureCursorInComfortView 捲動前呼叫，用於設定 isProgrammaticScrolling 旗標 */
  private onBeforeComfortScroll: (() => void) | null = null;
  public lastGPressTime: number = 0;
  public lastQuotePressTime: number = 0;
  public lastBacktickPressTime: number = 0;
  public lastReadingPos: CursorReadingPos | null = null;
  private lastHLTime: number = 0;
  /** 追蹤讀者停留在某處靜止閱讀的出發錨點 (停留 > 600ms 自動註冊) */
  public lastRestPosition: { secId: string; pIndex: number; charIndex: number; text: string; time: number } | null = null;
  private restAnchorTimer: any = null;

  // VISUAL 模式狀態
  public visualMode: boolean = false;
  public visualAnchorCharIdx: number | null = null;
  public visualSelectedText: string = '';

  constructor(scrollContainer?: HTMLElement | null) {
    this.scrollContainer = scrollContainer || null;
  }

  public syncVisualSelection(el: HTMLElement, text: string, callbacks?: any) {
    if (this.visualAnchorCharIdx === null) {
      this.visualAnchorCharIdx = this.currentCharIndex;
    }
    const minIdx = Math.min(this.visualAnchorCharIdx, this.currentCharIndex);
    const maxIdx = Math.max(this.visualAnchorCharIdx, this.currentCharIndex);
    const selStr = createDomSelectionForRange(el, minIdx, maxIdx);
    this.visualSelectedText = selStr || text.slice(minIdx, maxIdx + 1);
    callbacks?.onTextSelected?.(this.visualSelectedText);
  }

  public exitVisualMode(callbacks?: any) {
    this.visualMode = false;
    this.visualAnchorCharIdx = null;
    this.visualSelectedText = '';
    clearDomSelection();
    setVimMode('NORMAL');
    callbacks?.onClearSelection?.();
  }

  public performJumpReturnPublic(paras: RenderedPara[], curIdx: number, callbacks: any, toStart: boolean) {
    this.performJumpReturn(paras, curIdx, callbacks, toStart);
  }

  /**
   * 游標在某處就位後啟動靜止計時，260ms 後自動登記為出發錨點並留存至跳轉堆疊
   */
  public noteCursorSettled(secId: string, pIndex: number, charIndex: number, text: string) {
    if (this.restAnchorTimer) clearTimeout(this.restAnchorTimer);
    this.restAnchorTimer = setTimeout(() => {
      this.lastRestPosition = { secId, pIndex, charIndex, text, time: Date.now() };
      // 讀者停留閱讀超過 260ms 即自動留存出發錨點（pushJumpPoint 具備 4 字元位移去重防抖）
      this.recordCurrentJumpPoint('nav', { secId, pIndex, charIndex, text });
    }, 260);
  }

  /**
   * 記錄當前游標閱讀位置至跳轉堆疊 (Jump Stack)
   * 支援外部提供出發點段落資訊（例如滑鼠跨段落點擊前留存前次段落）
   */
  public recordCurrentJumpPoint(
    source: JumpPoint['source'] = 'jump',
    explicitPos?: { secId: string; pIndex: number; charIndex?: number; text?: string }
  ) {
    if (!this.scrollContainer) return;
    let secId = explicitPos?.secId;
    let pIndex = explicitPos?.pIndex;
    let charIndex = explicitPos?.charIndex ?? this.currentCharIndex;
    let paraKey = (secId && pIndex !== undefined) ? `${secId}_${pIndex}` : '';

    if (!paraKey) {
      const pos = this.getCurrentCursorReadingPos();
      if (!pos) return;
      secId = pos.secId;
      pIndex = pos.pIndex;
      charIndex = pos.charIndex;
      paraKey = pos.key;
    }

    if (!secId || pIndex === undefined) return;

    const allParas = getAllRenderedParas(this.scrollContainer);
    // 依據段落 key 比對（RenderedPara 欄位為 key）
    const curIdx = allParas.findIndex(p => p.key === paraKey);
    const fullText = explicitPos?.text || (curIdx >= 0 ? allParas[curIdx].text : '');
    // 以當前游標所在字元為中心，萃取前後鄰近字元預覽，讓讀者能精確判斷停留上下文
    const snippet = extractContextSnippetAroundChar(fullText, charIndex, 28);
    const progress = allParas.length > 0 && curIdx >= 0 ? Math.round(((curIdx + 1) / allParas.length) * 100) : 0;

    // 精確計算當前字元所屬的視覺行號 (lineIndex) 與該行行首字元 (lineStartCharIndex)
    let lineIndex: number | undefined;
    let lineStartCharIndex: number | undefined;
    if (curIdx >= 0 && this.scrollContainer) {
      try {
        const containerRect = this.scrollContainer.getBoundingClientRect();
        const visualLines = getParagraphVisualLines(
          allParas[curIdx].el,
          containerRect,
          this.scrollContainer.scrollLeft,
          this.scrollContainer.scrollTop
        );
        if (visualLines.length > 0) {
          let minDiff = Infinity;
          let bestLine = 0;
          for (let l = 0; l < visualLines.length; l++) {
            for (const c of visualLines[l]) {
              const diff = Math.abs(c.index - charIndex);
              if (diff < minDiff) {
                minDiff = diff;
                bestLine = l;
              }
            }
          }
          lineIndex = bestLine;
          lineStartCharIndex = visualLines[bestLine][0]?.index ?? 0;
        }
      } catch (e) {}
    }

    pushJumpPoint({
      sectionId: secId,
      paraIndex: pIndex,
      charIndex,
      lineIndex,
      lineStartCharIndex,
      textSnippet: snippet,
      progressPercent: progress,
      source
    });
  }

  /**
   * 執行 Vim '' 與 `` 跳轉回溯
   * toStart === true ('): 跳轉至該行的行首 (lineStartCharIndex)
   * toStart === false (`): 精確跳轉至該字元 (charIndex)
   */
  private performJumpReturn(
    paras: RenderedPara[],
    curIdx: number,
    callbacks: any,
    toStart: boolean
  ) {
    const curPara = paras[curIdx];
    const curPoint: JumpPoint = {
      id: `jump_${Date.now()}`,
      sectionId: curPara.secId,
      paraIndex: curPara.pIndex,
      charIndex: this.currentCharIndex,
      textSnippet: extractContextSnippetAroundChar(curPara.text, this.currentCharIndex, 28),
      progressPercent: paras.length > 0 ? Math.round(((curIdx + 1) / paras.length) * 100) : 0,
      timestamp: Date.now(),
      source: 'jump'
    };

    const jumpState = get(jumpStackStore);
    // 優先使用 previousPoint，若無或為當前位置則尋找 stack 中首個不同段落者
    let target = jumpState.previousPoint;
    if (!target || (target.sectionId === curPara.secId && target.paraIndex === curPara.pIndex)) {
      target = jumpState.stack.find(p => !(p.sectionId === curPara.secId && p.paraIndex === curPara.pIndex)) || null;
    }

    if (!target) {
      callbacks.onShowToast('尚無先前的跳躍錨點記錄');
      return;
    }

    // 將當前點設為新的 previousPoint，實現 '' / `` 雙向雙向瞬移切換
    setPreviousJumpPoint(curPoint);

    // 尋找目標段落
    const targetIdx = paras.findIndex(p => p.secId === target!.sectionId && p.pIndex === target!.paraIndex);
    const targetPara = targetIdx >= 0 ? paras[targetIdx] : paras.find(p => p.secId === target!.sectionId);

    if (targetPara) {
      // 復刻 Vim 原生語義：
      // ' (toStart = true): 跳轉至該行的行首 (target.lineStartCharIndex ?? 0)
      // ` (toStart = false): 精確跳轉至字元位置 (target.charIndex)
      const targetCharIdx = toStart
        ? Math.max(0, Math.min(targetPara.text.length - 1, target.lineStartCharIndex ?? 0))
        : Math.max(0, Math.min(targetPara.text.length - 1, target.charIndex ?? 0));

      this.currentCharIndex = targetCharIdx;
      this.preferredColLeft = null;
      this.recordPositionChange(targetPara.secId, targetPara.pIndex, targetCharIdx, targetPara.text, callbacks.onCursorProgress, 'jump');
      callbacks.onParagraphClick(targetPara.secId, targetPara.pIndex, targetPara.text, targetCharIdx);

      const lineDesc = target.lineIndex !== undefined ? `第 ${target.lineIndex + 1} 行` : '行首';
      if (toStart) {
        callbacks.onShowToast(`已跳回前次錨點（§ ${target.sectionTitle || target.sectionId} · ${lineDesc} 行首）`);
      } else {
        callbacks.onShowToast(`已跳回前次錨點（§ ${target.sectionTitle || target.sectionId} · 精確第 ${targetCharIdx} 字）`);
      }
    } else {
      callbacks.onShowToast(`跳轉目標章節 ${target.sectionId} 未在畫面上渲染`);
    }
  }

  public setScrollContainer(container: HTMLElement | null) {
    this.scrollContainer = container;
  }

  /** 同步外部縮放比例（來自父容器的 CSS zoom），確保 comfort scroll 使用精確 zoom 換算 */
  public setZoomLevel(level: number) {
    this.zoomLevel = Math.max(10, level);
  }

  /** 設定在投入换行捲動前的鐘彾（一次設定即永久生效） */
  public setBeforeScrollHook(hook: () => void) {
    this.onBeforeComfortScroll = hook;
  }

  /**
   * 計算並回報游標行進差分（字數、推進/回跳/跳躍、時間差）
   */
  public recordPositionChange(
    secId: string,
    pIndex: number,
    charIdx: number,
    text: string,
    onCursorProgress?: (deltaWords: number, moveType: 'forward' | 'regression' | 'jump', elapsedMs?: number) => void,
    forcedType?: 'jump' | 'regression' | 'forward'
  ) {
    const now = Date.now();
    if (!this.lastReadingPos) {
      this.lastReadingPos = {
        secId,
        pIndex,
        charIndex: charIdx,
        timestamp: now,
        textSnippet: text
      };
      onCursorProgress?.(0, 'jump', 0);
      return;
    }

    const prev = this.lastReadingPos;
    const elapsedMs = Math.max(1, now - prev.timestamp);

    if (forcedType === 'jump') {
      this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
      onCursorProgress?.(0, 'jump', elapsedMs);
      return;
    }

    if (forcedType === 'regression') {
      this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
      onCursorProgress?.(0, 'regression', elapsedMs);
      return;
    }

    // 若同一段落內移動
    if (prev.secId === secId && prev.pIndex === pIndex) {
      if (charIdx > prev.charIndex) {
        // 正向推進（以真實字元長度計算等效單詞，不再粗暴強制保底 1 詞）
        const slice = text.slice(prev.charIndex, charIdx);
        const words = countPreciseWords(slice);
        this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
        onCursorProgress?.(words, 'forward', elapsedMs);
      } else if (charIdx < prev.charIndex) {
        // 回跳複讀
        this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
        onCursorProgress?.(0, 'regression', elapsedMs);
      }
      return;
    }

    // 跨段落移動
    const paras = getAllRenderedParas(this.scrollContainer, secId);
    const prevIdx = paras.findIndex(p => p.secId === prev.secId && p.pIndex === prev.pIndex);
    const curIdx = paras.findIndex(p => p.secId === secId && p.pIndex === pIndex);

    if (prevIdx !== -1 && curIdx !== -1) {
      if (curIdx === prevIdx + 1) {
        // 正向下移到緊接的下一段
        const prevRemaining = prev.textSnippet.slice(prev.charIndex);
        const curHead = text.slice(0, charIdx);
        const words = countPreciseWords(prevRemaining) + countPreciseWords(curHead);
        this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
        if (words > 80) {
          onCursorProgress?.(0, 'jump', elapsedMs);
        } else {
          onCursorProgress?.(words, 'forward', elapsedMs);
        }
        return;
      } else if (curIdx < prevIdx) {
        // 回跳到前面的段落
        this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
        onCursorProgress?.(0, 'regression', elapsedMs);
        return;
      }
    }

    // 大跨度跳躍或未知順序
    this.lastReadingPos = { secId, pIndex, charIndex: charIdx, timestamp: now, textSnippet: text };
    onCursorProgress?.(0, 'jump', elapsedMs);
  }

  public syncCursor(
    secId: string,
    pIndex: number,
    charIdx: number,
    triggerAnimation: boolean = true,
    skipComfortScroll: boolean = false,
    forcedCrossParagraph?: boolean
  ): CursorRect | null {
    const key = `${secId}_${pIndex}`;
    const el = document.getElementById(`para-${key}`);
    if (!el || !this.scrollContainer) return null;

    const isCross = forcedCrossParagraph !== undefined
      ? forcedCrossParagraph
      : (this.currentParaKey !== '' && this.currentParaKey !== key);

    const rect = computeCharRect(el, charIdx, this.scrollContainer);
    if (rect) {
      this.currentParaKey = key; // 同步記錄當前段落，避免 Svelte 時序問題
      this.currentCharIndex = charIdx;
      updateCursorPosition(rect, secId, pIndex, charIdx, triggerAnimation);
      if (!skipComfortScroll) {
        this.onBeforeComfortScroll?.(); // 通知外部設定 isProgrammaticScrolling
        const config = get(vimConfigStore);
        ensureCursorInComfortView(rect, this.scrollContainer, {
          isCrossParagraph: isCross,
          isSmoothScrollEnabled: config.isSmoothScrollEnabled ?? true,
          zoomLevel: this.zoomLevel
        });
      }
    }
    return rect;
  }

  public getCurrentCursorReadingPos(): { secId: string; pIndex: number; charIndex: number; key: string } | null {
    if (!this.currentParaKey) return null;
    const parts = this.currentParaKey.split('_');
    const pIndexStr = parts.pop() || '0';
    const secId = parts.join('_');
    return {
      secId,
      pIndex: parseInt(pIndexStr, 10),
      charIndex: this.currentCharIndex,
      key: this.currentParaKey
    };
  }

  /**
   * 解析當前游標在渲染段落陣列中的索引位置
   */
  public resolveCurrentParagraphIndex(paras: RenderedPara[], fallbackKey?: string): number {
    if (paras.length === 0) return -1;
    if (this.currentParaKey) {
      const idx = paras.findIndex(p => p.key === this.currentParaKey);
      if (idx !== -1) return idx;
    }
    const cursorState = get(vimCursorState);
    if (cursorState.active) {
      const stateKey = `${cursorState.sectionId}_${cursorState.paraIndex}`;
      const idx = paras.findIndex(p => p.key === stateKey);
      if (idx !== -1) return idx;
    }
    if (fallbackKey) {
      const idx = paras.findIndex(p => p.key === fallbackKey);
      if (idx !== -1) return idx;
    }
    return 0;
  }

  public handleKeydown(
    e: KeyboardEvent,
    callbacks: {
      focusedParagraphKey: string;
      activeSectionId: string;
      onParagraphClick: (secId: string, pIndex: number, text: string, clickCharIdx?: number) => void;
      /** 游標在同段落內移動時，同步更新 focus 段落（不觸發滾動） */
      onSyncFocus: (secId: string, pIndex: number, text: string) => void;
      onToggleTranslation: (secId: string, pIndex: number, text: string) => void;
      onAskCompanion: (secId: string, pIndex: number, text: string) => void;
      onShowToast: (text: string) => void;
      onRecordActivity: (words: number, type: 'skim' | 'interact' | 'scroll') => void;
      onCursorProgress?: (deltaWords: number, moveType: 'forward' | 'regression' | 'jump', elapsedMs?: number) => void;
      onCloseLightbox?: () => void;
      isLightboxOpen?: boolean;
      onTranslateSelection?: (selectedText: string, secId: string, pIndex: number) => void;
      onTextSelected?: (selectedText: string) => void;
      onClearSelection?: () => void;
    }
  ) {
    if (isTypingContext(e.target)) return;

    const activeJumpState = get(jumpStackStore);
    if (activeJumpState.isMenuOpen) {
      // HUD 開啟狀態：完全接管所有鍵盤導航，正文游標絕不跟隨移動！
      if (e.key === 'Escape') {
        e.preventDefault();
        closeJumpMenu();
        return;
      }
      const isQuote = (e.key === "'" || e.code === 'Quote');
      const isBacktick = (e.key === '`' || e.code === 'Backquote');
      if (isQuote || isBacktick) {
        e.preventDefault();
        closeJumpMenu();
        const paras = getAllRenderedParas(this.scrollContainer);
        if (paras.length > 0) {
          const curIdx = this.resolveCurrentParagraphIndex(paras, callbacks.focusedParagraphKey);
          if (curIdx >= 0) {
            this.performJumpReturn(paras, curIdx, callbacks, isQuote);
          }
        }
        return;
      }
      const isDown = e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J' || e.code === 'KeyJ' || e.code === 'ArrowDown';
      const isUp = e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K' || e.code === 'KeyK' || e.code === 'ArrowUp';

      if (isDown) {
        e.preventDefault();
        const curState = get(jumpStackStore);
        const total = Math.min(9, curState.stack.length);
        if (total > 0) {
          const nextIdx = (curState.selectedIndex + 1) % total;
          setJumpMenuSelectedIndex(nextIdx);
        }
        return;
      }
      if (isUp) {
        e.preventDefault();
        const curState = get(jumpStackStore);
        const total = Math.min(9, curState.stack.length);
        if (total > 0) {
          const prevIdx = (curState.selectedIndex - 1 + total) % total;
          setJumpMenuSelectedIndex(prevIdx);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const curState = get(jumpStackStore);
        const target = curState.stack[curState.selectedIndex];
        if (target) {
          closeJumpMenu();
          callbacks.onParagraphClick(target.sectionId, target.paraIndex, target.textSnippet, target.charIndex);
          callbacks.onShowToast(`已跳至 § ${target.sectionTitle || target.sectionId} · 第 ${target.charIndex} 字`);
        }
        return;
      }
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const curState = get(jumpStackStore);
        const target = curState.stack[num - 1];
        if (target) {
          e.preventDefault();
          closeJumpMenu();
          callbacks.onParagraphClick(target.sectionId, target.paraIndex, target.textSnippet, target.charIndex);
          callbacks.onShowToast(`已跳至 § ${target.sectionTitle || target.sectionId} · 第 ${target.charIndex} 字`);
        }
        return;
      }
      // 攔截其他任何按鍵，防止滲透到正文游標
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape') {
      if (this.visualMode) {
        this.exitVisualMode(callbacks);
        return;
      }
      if (callbacks.isLightboxOpen && callbacks.onCloseLightbox) {
        callbacks.onCloseLightbox();
        return;
      }
      const state = get(vimCursorState);
      if (state.isHelpOpen) {
        setVimHelpOpen(false);
        return;
      }
      closeJumpMenu();
      return;
    }

    // Ctrl+j / Ctrl+o: 開啟 Neovim Jump Menu HUD (即便帶有 Ctrl 鍵也優先響應)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J' || e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      toggleJumpMenu();
      return;
    }

    // ' 或 `: 按一下立即開啟跳轉歷史 HUD；若選單已開啟或 500ms 內連按兩次則回溯跳轉
    // 支援 e.key 與 e.code (Quote/Backquote) 避免輸入法或 Dead Key 干擾
    const isQuoteKey = (e.key === "'" || e.code === 'Quote') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    const isBacktickKey = (e.key === '`' || e.code === 'Backquote') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;

    if (isQuoteKey || isBacktickKey) {
      e.preventDefault();
      const now = Date.now();
      const lastPress = isQuoteKey ? this.lastQuotePressTime : this.lastBacktickPressTime;
      const isDouble = (now - lastPress < 500);

      if (isQuoteKey) this.lastQuotePressTime = now;
      if (isBacktickKey) this.lastBacktickPressTime = now;

      if (isDouble) {
        closeJumpMenu();
        const paras = getAllRenderedParas(this.scrollContainer);
        if (paras.length > 0) {
          const curIdx = this.resolveCurrentParagraphIndex(paras, callbacks.focusedParagraphKey);
          if (curIdx >= 0) {
            this.performJumpReturn(paras, curIdx, callbacks, isQuoteKey);
          }
        }
        return;
      }

      // 按一下：在彈出歷史選單前先記錄當前游標位置，確保選單中包含剛才的閱讀出發錨點
      this.recordCurrentJumpPoint('nav');
      toggleJumpMenu(true);
      return;
    }

    const config = get(vimConfigStore);
    if (!config.isVimEnabled) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const paras = getAllRenderedParas(this.scrollContainer, callbacks.activeSectionId);
    if (paras.length === 0) return;

    const cursorState = get(vimCursorState);
    const curIdx = this.resolveCurrentParagraphIndex(paras, callbacks.focusedParagraphKey);
    if (curIdx === -1) return;
    const curPara = paras[curIdx];
    const key = e.key;

    // 若正要執行導航移動，且先前有靜止停留位置，自動將出發點儲存為 Jump Point！
    const navKeys = ['j', 'J', 'k', 'K', 'h', 'H', 'l', 'L', 'w', 'W', 'b', 'B', 'e', 'E', '0', '$'];
    if (navKeys.includes(key) && this.lastRestPosition) {
      const rest = this.lastRestPosition;
      this.lastRestPosition = null;
      this.recordCurrentJumpPoint('nav', {
        secId: rest.secId,
        pIndex: rest.pIndex,
        charIndex: rest.charIndex,
        text: rest.text
      });
    }

    // 啟動當前位置靜止計時，500ms 後登記為潛在出發錨點
    this.noteCursorSettled(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text);

    // 快捷鍵指南切換
    if (key === '?') {
      e.preventDefault();
      setVimHelpOpen(!cursorState.isHelpOpen);
      return;
    }

    // v: 切換 VISUAL 視覺選取模式
    if (key === 'v' || key === 'V') {
      e.preventDefault();
      if (!this.visualMode) {
        this.visualMode = true;
        this.visualAnchorCharIdx = this.currentCharIndex;
        setVimMode('VISUAL');
        this.syncVisualSelection(curPara.el, curPara.text, callbacks);
        callbacks.onShowToast('進入 VISUAL 模式（可使用 hjkl/wbe/$ 擴展選取範圍）');
      } else {
        this.exitVisualMode(callbacks);
        callbacks.onShowToast('已退出 VISUAL 模式');
      }
      return;
    }

    // t: 切換譯文 (NORMAL) 或即時翻譯選取子句 (VISUAL)
    if (key === 't' || key === 'T') {
      e.preventDefault();
      if (this.visualMode && this.visualSelectedText) {
        callbacks.onTranslateSelection?.(this.visualSelectedText, curPara.secId, curPara.pIndex);
        return;
      }
      callbacks.onToggleTranslation(curPara.secId, curPara.pIndex, curPara.text);
      return;
    }

    // a: 喚醒 AI 伴讀助理 (VISUAL 模式傳送選取片段，NORMAL 模式傳送段落全文)
    if (key === 'a' || key === 'A') {
      e.preventDefault();
      const textToAsk = (this.visualMode && this.visualSelectedText) ? this.visualSelectedText : curPara.text;
      callbacks.onAskCompanion(curPara.secId, curPara.pIndex, textToAsk);
      if (this.visualMode) {
        callbacks.onShowToast('已將選取片段傳送至 AI 伴讀助理');
      }
      return;
    }

    // y: 精準複製選取文字 (VISUAL) 或當前段落原文 (NORMAL)
    if (key === 'y' || key === 'Y') {
      e.preventDefault();
      if (this.visualMode && this.visualSelectedText) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(this.visualSelectedText);
          callbacks.onShowToast(`已複製選取文字 (${this.visualSelectedText.length} 字元)`);
        }
        this.exitVisualMode(callbacks);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(curPara.text);
        callbacks.onShowToast('已複製當前段落原文');
      }
      return;
    }

    // gg: 跳至文首
    if (key === 'g') {
      const now = Date.now();
      if (now - this.lastGPressTime < 450) {
        e.preventDefault();
        this.recordCurrentJumpPoint('jump');
        const first = paras[0];
        this.currentCharIndex = 0;
        this.preferredColLeft = null;
        this.recordPositionChange(first.secId, first.pIndex, 0, first.text, callbacks.onCursorProgress, 'jump');
        callbacks.onParagraphClick(first.secId, first.pIndex, first.text, 0);
        this.lastGPressTime = 0;
        return;
      }
      this.lastGPressTime = now;
      return;
    }

    // G: 跳至文末
    if (key === 'G') {
      e.preventDefault();
      this.recordCurrentJumpPoint('jump');
      const last = paras[paras.length - 1];
      this.currentCharIndex = Math.max(0, last.text.length - 1);
      this.preferredColLeft = null;
      this.recordPositionChange(last.secId, last.pIndex, this.currentCharIndex, last.text, callbacks.onCursorProgress, 'jump');
      callbacks.onParagraphClick(last.secId, last.pIndex, last.text, this.currentCharIndex);
      return;
    }

    // 0: 跳至段首
    if (key === '0') {
      e.preventDefault();
      this.currentCharIndex = 0;
      this.preferredColLeft = null;
      this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
      this.recordPositionChange(curPara.secId, curPara.pIndex, 0, curPara.text, callbacks.onCursorProgress, 'regression');
      callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
      if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      return;
    }

    // $: 跳至段末
    if (key === '$') {
      e.preventDefault();
      this.currentCharIndex = Math.max(0, curPara.text.length - 1);
      this.preferredColLeft = null;
      this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
      this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
      callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
      if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      return;
    }

    // w: 跳至下一詞（支援中英數 CJK 智慧分詞）
    if (key === 'w') {
      e.preventDefault();
      this.preferredColLeft = null;
      const nextOffset = getNextWordOffset(curPara.text, this.currentCharIndex);
      if (nextOffset < curPara.text.length && nextOffset > this.currentCharIndex) {
        this.currentCharIndex = nextOffset;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else if (curIdx < paras.length - 1) {
        const next = paras[curIdx + 1];
        this.currentCharIndex = 0;
        this.recordPositionChange(next.secId, next.pIndex, 0, next.text, callbacks.onCursorProgress);
        callbacks.onParagraphClick(next.secId, next.pIndex, next.text, 0);
      }
      return;
    }

    // b: 跳至上一詞（支援中英數 CJK 智慧分詞）
    if (key === 'b') {
      e.preventDefault();
      this.preferredColLeft = null;
      const prevOffset = getPrevWordOffset(curPara.text, this.currentCharIndex);
      if (prevOffset < this.currentCharIndex && prevOffset >= 0) {
        this.currentCharIndex = prevOffset;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress, 'regression');
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else if (this.currentCharIndex > 0) {
        this.currentCharIndex = 0;
        this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, 0, curPara.text, callbacks.onCursorProgress, 'regression');
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else if (curIdx > 0) {
        const prev = paras[curIdx - 1];
        this.currentCharIndex = Math.max(0, prev.text.length - 1);
        this.recordPositionChange(prev.secId, prev.pIndex, this.currentCharIndex, prev.text, callbacks.onCursorProgress, 'regression');
        callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
      }
      return;
    }

    // e: 跳至當前/下一詞末尾（支援中英數 CJK 智慧分詞）
    if (key === 'e') {
      e.preventDefault();
      this.preferredColLeft = null;
      const endOffset = getWordEndOffset(curPara.text, this.currentCharIndex);
      if (endOffset > this.currentCharIndex && endOffset < curPara.text.length) {
        this.currentCharIndex = endOffset;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else if (curIdx < paras.length - 1) {
        const next = paras[curIdx + 1];
        const nextEnd = getWordEndOffset(next.text, 0);
        this.currentCharIndex = nextEnd;
        this.recordPositionChange(next.secId, next.pIndex, nextEnd, next.text, callbacks.onCursorProgress);
        callbacks.onParagraphClick(next.secId, next.pIndex, next.text, nextEnd);
      }
      return;
    }

    // d: 向下滾動半頁 (Half Page Down)
    if (key === 'd') {
      e.preventDefault();
      if (!this.scrollContainer) return;
      this.recordCurrentJumpPoint('scroll');
      const viewH = this.scrollContainer.clientHeight;
      const targetScroll = this.scrollContainer.scrollTop + viewH * 0.45;
      animateScrollTo(this.scrollContainer, targetScroll, 260);

      const targetIdx = Math.min(paras.length - 1, curIdx + 3);
      if (targetIdx !== curIdx) {
        const targetPara = paras[targetIdx];
        this.currentCharIndex = 0;
        this.recordPositionChange(targetPara.secId, targetPara.pIndex, 0, targetPara.text, callbacks.onCursorProgress);
        callbacks.onParagraphClick(targetPara.secId, targetPara.pIndex, targetPara.text, 0);
      }
      return;
    }

    // u: 向上滾動半頁 (Half Page Up)
    if (key === 'u') {
      e.preventDefault();
      if (!this.scrollContainer) return;
      this.recordCurrentJumpPoint('scroll');
      const viewH = this.scrollContainer.clientHeight;
      const targetScroll = Math.max(0, this.scrollContainer.scrollTop - viewH * 0.45);
      animateScrollTo(this.scrollContainer, targetScroll, 260);

      const targetIdx = Math.max(0, curIdx - 3);
      if (targetIdx !== curIdx) {
        const targetPara = paras[targetIdx];
        this.currentCharIndex = 0;
        this.recordPositionChange(targetPara.secId, targetPara.pIndex, 0, targetPara.text, callbacks.onCursorProgress, 'regression');
        callbacks.onParagraphClick(targetPara.secId, targetPara.pIndex, targetPara.text, 0);
      }
      return;
    }

    // M: 開啟 Neovim Jump Menu HUD
    if (key === 'M') {
      e.preventDefault();
      toggleJumpMenu();
      return;
    }

    // l: 向右移動至下一個可見字元
    if (key === 'l' || key === 'L') {
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastHLTime < 40) return;
      this.lastHLTime = now;

      this.preferredColLeft = null;
      const visibleIndices = getParagraphVisibleCharIndices(curPara.el);
      if (visibleIndices.length > 0) {
        const nextIdx = visibleIndices.find(idx => idx > this.currentCharIndex);
        if (nextIdx !== undefined) {
          this.currentCharIndex = nextIdx;
          this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
          this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
          callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
          if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
        } else if (curIdx < paras.length - 1) {
          const next = paras[curIdx + 1];
          const nextVis = getParagraphVisibleCharIndices(next.el);
          this.currentCharIndex = nextVis.length > 0 ? nextVis[0] : 0;
          this.recordPositionChange(next.secId, next.pIndex, this.currentCharIndex, next.text, callbacks.onCursorProgress);
          callbacks.onParagraphClick(next.secId, next.pIndex, next.text, this.currentCharIndex);
        }
      } else if (curIdx < paras.length - 1) {
        const next = paras[curIdx + 1];
        this.currentCharIndex = 0;
        this.recordPositionChange(next.secId, next.pIndex, 0, next.text, callbacks.onCursorProgress);
        callbacks.onParagraphClick(next.secId, next.pIndex, next.text, 0);
      }
      return;
    }

    // h: 向左移動至上一個可見字元
    if (key === 'h' || key === 'H') {
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastHLTime < 40) return;
      this.lastHLTime = now;

      this.preferredColLeft = null;
      const visibleIndices = getParagraphVisibleCharIndices(curPara.el);
      if (visibleIndices.length > 0) {
        let prevIdx: number | undefined = undefined;
        for (let i = visibleIndices.length - 1; i >= 0; i--) {
          if (visibleIndices[i] < this.currentCharIndex) {
            prevIdx = visibleIndices[i];
            break;
          }
        }
        if (prevIdx !== undefined) {
          this.currentCharIndex = prevIdx;
          this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
          this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress, 'regression');
          callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
          if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
        } else if (curIdx > 0) {
          const prev = paras[curIdx - 1];
          const prevVis = getParagraphVisibleCharIndices(prev.el);
          this.currentCharIndex = prevVis.length > 0 ? prevVis[prevVis.length - 1] : 0;
          this.recordPositionChange(prev.secId, prev.pIndex, this.currentCharIndex, prev.text, callbacks.onCursorProgress, 'regression');
          callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
        }
      } else if (curIdx > 0) {
        const prev = paras[curIdx - 1];
        this.currentCharIndex = Math.max(0, prev.text.length - 1);
        this.recordPositionChange(prev.secId, prev.pIndex, this.currentCharIndex, prev.text, callbacks.onCursorProgress, 'regression');
        callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
      }
      return;
    }

    // j: 垂直下移一行
    if (key === 'j' || key === 'J') {
      e.preventDefault();
      if (!this.scrollContainer) return;

      const containerRect = this.scrollContainer.getBoundingClientRect();
      const lines = getParagraphVisualLines(curPara.el, containerRect, this.scrollContainer.scrollLeft, this.scrollContainer.scrollTop);

      let curLineIdx = 0;
      let minDiff = Infinity;
      for (let l = 0; l < lines.length; l++) {
        for (const c of lines[l]) {
          const diff = Math.abs(c.index - this.currentCharIndex);
          if (diff < minDiff) {
            minDiff = diff;
            curLineIdx = l;
          }
        }
      }

      if (this.preferredColLeft === null) {
        const curChar = lines[curLineIdx].find(c => c.index === this.currentCharIndex) || lines[curLineIdx][0];
        this.preferredColLeft = curChar.centerX;
      }

      if (curLineIdx < lines.length - 1) {
        const nextLine = lines[curLineIdx + 1];
        let bestChar = nextLine[0];
        let bestDist = Math.abs(bestChar.centerX - this.preferredColLeft);
        for (let i = 1; i < nextLine.length; i++) {
          const dist = Math.abs(nextLine[i].centerX - this.preferredColLeft);
          if (dist < bestDist) {
            bestDist = dist;
            bestChar = nextLine[i];
          }
        }
        this.currentCharIndex = bestChar.index;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else {
        if (curIdx < paras.length - 1) {
          const nextPara = paras[curIdx + 1];
          const nextLines = getParagraphVisualLines(nextPara.el, containerRect, this.scrollContainer.scrollLeft, this.scrollContainer.scrollTop);
          const targetLine = nextLines[0];
          let bestChar = targetLine[0];
          let bestDist = Math.abs(bestChar.centerX - this.preferredColLeft);
          for (let i = 1; i < targetLine.length; i++) {
            const dist = Math.abs(targetLine[i].centerX - this.preferredColLeft);
            if (dist < bestDist) {
              bestDist = dist;
              bestChar = targetLine[i];
            }
          }
          this.currentCharIndex = bestChar.index;
          this.recordPositionChange(nextPara.secId, nextPara.pIndex, this.currentCharIndex, nextPara.text, callbacks.onCursorProgress);
          callbacks.onParagraphClick(nextPara.secId, nextPara.pIndex, nextPara.text, this.currentCharIndex);
        } else {
          const lastLine = lines[lines.length - 1];
          this.currentCharIndex = lastLine[lastLine.length - 1].index;
          this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
          this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress);
          callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
          if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
        }
      }
      return;
    }

    // k: 垂直上移一行
    if (key === 'k' || key === 'K') {
      e.preventDefault();
      if (!this.scrollContainer) return;

      const containerRect = this.scrollContainer.getBoundingClientRect();
      const lines = getParagraphVisualLines(curPara.el, containerRect, this.scrollContainer.scrollLeft, this.scrollContainer.scrollTop);

      let curLineIdx = 0;
      let minDiff = Infinity;
      for (let l = 0; l < lines.length; l++) {
        for (const c of lines[l]) {
          const diff = Math.abs(c.index - this.currentCharIndex);
          if (diff < minDiff) {
            minDiff = diff;
            curLineIdx = l;
          }
        }
      }

      if (this.preferredColLeft === null) {
        const curChar = lines[curLineIdx].find(c => c.index === this.currentCharIndex) || lines[curLineIdx][0];
        this.preferredColLeft = curChar.centerX;
      }

      if (curLineIdx > 0) {
        const prevLine = lines[curLineIdx - 1];
        let bestChar = prevLine[0];
        let bestDist = Math.abs(bestChar.centerX - this.preferredColLeft);
        for (let i = 1; i < prevLine.length; i++) {
          const dist = Math.abs(prevLine[i].centerX - this.preferredColLeft);
          if (dist < bestDist) {
            bestDist = dist;
            bestChar = prevLine[i];
          }
        }
        this.currentCharIndex = bestChar.index;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        this.recordPositionChange(curPara.secId, curPara.pIndex, this.currentCharIndex, curPara.text, callbacks.onCursorProgress, 'regression');
        callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
        if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
      } else {
        if (curIdx > 0) {
          const prevPara = paras[curIdx - 1];
          const prevLines = getParagraphVisualLines(prevPara.el, containerRect, this.scrollContainer.scrollLeft, this.scrollContainer.scrollTop);
          const targetLine = prevLines[prevLines.length - 1];
          let bestChar = targetLine[0];
          let bestDist = Math.abs(bestChar.centerX - this.preferredColLeft);
          for (let i = 1; i < targetLine.length; i++) {
            const dist = Math.abs(targetLine[i].centerX - this.preferredColLeft);
            if (dist < bestDist) {
              bestDist = dist;
              bestChar = targetLine[i];
            }
          }
          this.currentCharIndex = bestChar.index;
          this.recordPositionChange(prevPara.secId, prevPara.pIndex, this.currentCharIndex, prevPara.text, callbacks.onCursorProgress, 'regression');
          callbacks.onParagraphClick(prevPara.secId, prevPara.pIndex, prevPara.text, this.currentCharIndex);
        } else {
          this.currentCharIndex = 0;
          this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
          this.recordPositionChange(curPara.secId, curPara.pIndex, 0, curPara.text, callbacks.onCursorProgress, 'regression');
          callbacks.onSyncFocus(curPara.secId, curPara.pIndex, curPara.text);
          if (this.visualMode) this.syncVisualSelection(curPara.el, curPara.text, callbacks);
        }
      }
      return;
    }
  }
}
