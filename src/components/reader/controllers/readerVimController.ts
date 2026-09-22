import type { CursorRect } from '../../../stores/vimCursorStore';
import {
  vimConfigStore,
  vimCursorState,
  updateCursorPosition,
  setVimHelpOpen
} from '../../../stores/vimCursorStore';
import { get } from 'svelte/store';

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
    const fallback: CharMetric = {
      index: 0,
      left: pRect.left,
      top: pRect.top,
      width: 10,
      height: 22,
      centerX: pRect.left + 5
    };
    return [[fallback]];
  }

  // 依據字元 top 座標分群為視覺行 (閾值 8px)
  const lines: CharMetric[][] = [];
  let currentLine: CharMetric[] = [];
  let curLineTop = allChars[0].top;

  for (const c of allChars) {
    if (currentLine.length === 0 || Math.abs(c.top - curLineTop) < 8) {
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
        width: Math.max(9, rects[0].width),
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
                  width: 9,
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
  return {
    left: pRect.left,
    top: pRect.top,
    width: 10,
    height: 22
  };
}

export function ensureCursorInComfortView(rect: CursorRect, scrollContainer: HTMLElement | null) {
  if (!scrollContainer) return;
  const viewHeight = scrollContainer.clientHeight;
  const containerRect = scrollContainer.getBoundingClientRect();

  const curTopInContainer = rect.top - containerRect.top;
  const curBottomInContainer = rect.top + rect.height - containerRect.top;

  if (curTopInContainer < viewHeight * 0.18) {
    scrollContainer.scrollTo({
      top: Math.max(0, scrollContainer.scrollTop + curTopInContainer - viewHeight * 0.28),
      behavior: 'smooth'
    });
  } else if (curBottomInContainer > viewHeight * 0.72) {
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + curBottomInContainer - viewHeight * 0.65,
      behavior: 'smooth'
    });
  }
}

/**
 * Vim 導航狀態控制器類別
 */
export class ReaderVimController {
  private scrollContainer: HTMLElement | null = null;
  public currentCharIndex: number = 0;
  public preferredColLeft: number | null = null;
  private lastGPressTime: number = 0;

  constructor(scrollContainer?: HTMLElement | null) {
    this.scrollContainer = scrollContainer || null;
  }

  public setScrollContainer(container: HTMLElement | null) {
    this.scrollContainer = container;
  }

  public syncCursor(
    secId: string,
    pIndex: number,
    charIdx: number,
    triggerAnimation: boolean = true,
    skipComfortScroll: boolean = false
  ): CursorRect | null {
    const key = `${secId}_${pIndex}`;
    const el = document.getElementById(`para-${key}`);
    if (!el || !this.scrollContainer) return null;

    const rect = computeCharRect(el, charIdx, this.scrollContainer);
    if (rect) {
      updateCursorPosition(rect, secId, pIndex, charIdx, triggerAnimation);
      if (!skipComfortScroll) {
        ensureCursorInComfortView(rect, this.scrollContainer);
      }
    }
    return rect;
  }

  public handleKeydown(
    e: KeyboardEvent,
    callbacks: {
      focusedParagraphKey: string;
      activeSectionId: string;
      onParagraphClick: (secId: string, pIndex: number, text: string, clickCharIdx?: number) => void;
      onToggleTranslation: (secId: string, pIndex: number, text: string) => void;
      onAskCompanion: (secId: string, pIndex: number, text: string) => void;
      onShowToast: (text: string) => void;
      onRecordActivity: (words: number, type: 'skim' | 'interact' | 'scroll') => void;
      onCloseLightbox?: () => void;
      isLightboxOpen?: boolean;
    }
  ) {
    if (e.key === 'Escape') {
      if (callbacks.isLightboxOpen && callbacks.onCloseLightbox) {
        callbacks.onCloseLightbox();
        return;
      }
      const state = get(vimCursorState);
      if (state.isHelpOpen) {
        setVimHelpOpen(false);
        return;
      }
    }

    const config = get(vimConfigStore);
    if (!config.isVimEnabled) return;
    if (isTypingContext(e.target)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const paras = getAllRenderedParas(this.scrollContainer, callbacks.activeSectionId);
    if (paras.length === 0) return;

    const cursorState = get(vimCursorState);
    let curIdx = paras.findIndex(p => p.key === callbacks.focusedParagraphKey);
    if (curIdx === -1 && cursorState.active) {
      const stateKey = `${cursorState.sectionId}_${cursorState.paraIndex}`;
      curIdx = paras.findIndex(p => p.key === stateKey);
    }
    if (curIdx === -1) {
      curIdx = 0;
    }
    const curPara = paras[curIdx];
    const key = e.key;

    // 快捷鍵指南切換
    if (key === '?') {
      e.preventDefault();
      setVimHelpOpen(!cursorState.isHelpOpen);
      return;
    }

    // t: 切換當前段落繁中譯文展開/收合
    if (key === 't' || key === 'T') {
      e.preventDefault();
      callbacks.onToggleTranslation(curPara.secId, curPara.pIndex, curPara.text);
      return;
    }

    // a: 喚醒 AI 伴讀助理
    if (key === 'a' || key === 'A') {
      e.preventDefault();
      callbacks.onAskCompanion(curPara.secId, curPara.pIndex, curPara.text);
      return;
    }

    // y: 複製當前段落原文
    if (key === 'y' || key === 'Y') {
      e.preventDefault();
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
        const first = paras[0];
        this.currentCharIndex = 0;
        this.preferredColLeft = null;
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
      const last = paras[paras.length - 1];
      this.currentCharIndex = Math.max(0, last.text.length - 1);
      this.preferredColLeft = null;
      callbacks.onParagraphClick(last.secId, last.pIndex, last.text, this.currentCharIndex);
      return;
    }

    // 0: 跳至段首
    if (key === '0') {
      e.preventDefault();
      this.currentCharIndex = 0;
      this.preferredColLeft = null;
      this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
      return;
    }

    // $: 跳至段末
    if (key === '$') {
      e.preventDefault();
      this.currentCharIndex = Math.max(0, curPara.text.length - 1);
      this.preferredColLeft = null;
      this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
      return;
    }

    // w: 跳至下一詞
    if (key === 'w') {
      e.preventDefault();
      this.preferredColLeft = null;
      const after = curPara.text.slice(this.currentCharIndex);
      const match = after.match(/\s+\S/);
      if (match && match.index !== undefined) {
        this.currentCharIndex += match.index + match[0].length - 1;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
      } else if (curIdx < paras.length - 1) {
        const next = paras[curIdx + 1];
        this.currentCharIndex = 0;
        callbacks.onParagraphClick(next.secId, next.pIndex, next.text, 0);
      }
      return;
    }

    // b: 跳至上一詞
    if (key === 'b') {
      e.preventDefault();
      this.preferredColLeft = null;
      const before = curPara.text.slice(0, this.currentCharIndex);
      const match = before.match(/\S+\s*$/);
      if (match && match.index !== undefined && match.index < this.currentCharIndex) {
        this.currentCharIndex = match.index;
        this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
      } else if (this.currentCharIndex > 0) {
        this.currentCharIndex = 0;
        this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
      } else if (curIdx > 0) {
        const prev = paras[curIdx - 1];
        this.currentCharIndex = Math.max(0, prev.text.length - 1);
        callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
      }
      return;
    }

    // l: 向右移動至下一個可見字元
    if (key === 'l' || key === 'L') {
      e.preventDefault();
      this.preferredColLeft = null;
      const visibleIndices = getParagraphVisibleCharIndices(curPara.el);
      if (visibleIndices.length > 0) {
        const nextIdx = visibleIndices.find(idx => idx > this.currentCharIndex);
        if (nextIdx !== undefined) {
          this.currentCharIndex = nextIdx;
          this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        } else if (curIdx < paras.length - 1) {
          const next = paras[curIdx + 1];
          const nextVis = getParagraphVisibleCharIndices(next.el);
          this.currentCharIndex = nextVis.length > 0 ? nextVis[0] : 0;
          callbacks.onParagraphClick(next.secId, next.pIndex, next.text, this.currentCharIndex);
        }
      } else if (curIdx < paras.length - 1) {
        const next = paras[curIdx + 1];
        this.currentCharIndex = 0;
        callbacks.onParagraphClick(next.secId, next.pIndex, next.text, 0);
      }
      return;
    }

    // h: 向左移動至上一個可見字元
    if (key === 'h' || key === 'H') {
      e.preventDefault();
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
        } else if (curIdx > 0) {
          const prev = paras[curIdx - 1];
          const prevVis = getParagraphVisibleCharIndices(prev.el);
          this.currentCharIndex = prevVis.length > 0 ? prevVis[prevVis.length - 1] : 0;
          callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
        }
      } else if (curIdx > 0) {
        const prev = paras[curIdx - 1];
        this.currentCharIndex = Math.max(0, prev.text.length - 1);
        callbacks.onParagraphClick(prev.secId, prev.pIndex, prev.text, this.currentCharIndex);
      }
      return;
    }

    // j: 垂直下移一行
    if (key === 'j' || key === 'J') {
      e.preventDefault();
      callbacks.onRecordActivity(15, 'skim');
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
          callbacks.onParagraphClick(nextPara.secId, nextPara.pIndex, nextPara.text, this.currentCharIndex);
        } else {
          const lastLine = lines[lines.length - 1];
          this.currentCharIndex = lastLine[lastLine.length - 1].index;
          this.syncCursor(curPara.secId, curPara.pIndex, this.currentCharIndex, true);
        }
      }
      return;
    }

    // k: 垂直上移一行
    if (key === 'k' || key === 'K') {
      e.preventDefault();
      callbacks.onRecordActivity(15, 'skim');
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
          callbacks.onParagraphClick(prevPara.secId, prevPara.pIndex, prevPara.text, this.currentCharIndex);
        } else {
          this.currentCharIndex = 0;
          this.syncCursor(curPara.secId, curPara.pIndex, 0, true);
        }
      }
      return;
    }
  }
}
