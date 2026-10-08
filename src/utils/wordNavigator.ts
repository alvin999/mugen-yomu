/**
 * 原生 CJK (中日韓) 與多語系智慧分詞導航演算法 (Intl.Segmenter)
 * 支援 Vim 正統動力學：w (Word Forward), b (Word Backward), e (Word End)
 */

let segmenterInstance: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenterInstance) return segmenterInstance;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      segmenterInstance = new Intl.Segmenter(['zh-TW', 'en', 'ja'], { granularity: 'word' });
    } catch {
      segmenterInstance = new Intl.Segmenter(undefined, { granularity: 'word' });
    }
  }
  return segmenterInstance;
}

/**
 * 計算下一個單字/詞彙的起始位置 (w)
 */
export function getNextWordOffset(text: string, currentOffset: number): number {
  const len = text.length;
  if (currentOffset >= len) return len;

  const segmenter = getSegmenter();
  if (segmenter) {
    const segments = Array.from(segmenter.segment(text));
    for (const seg of segments) {
      if (seg.index > currentOffset) {
        if (seg.isWordLike || seg.segment.trim().length > 0) {
          return seg.index;
        }
      }
    }
    return len;
  }

  // 後備正則表達式斷詞
  const sub = text.slice(currentOffset);
  const match = sub.match(/\s+\S/);
  if (match && typeof match.index === 'number') {
    return currentOffset + match.index + match[0].length - 1;
  }
  return len;
}

/**
 * 計算當前或前一個單字/詞彙的起始位置 (b)
 */
export function getPrevWordOffset(text: string, currentOffset: number): number {
  if (currentOffset <= 0) return 0;

  const segmenter = getSegmenter();
  if (segmenter) {
    const segments = Array.from(segmenter.segment(text));
    let lastIndex = 0;
    for (const seg of segments) {
      if (seg.index < currentOffset) {
        if (seg.isWordLike || seg.segment.trim().length > 0) {
          lastIndex = seg.index;
        }
      } else {
        break;
      }
    }
    return lastIndex;
  }

  // 後備正則表達式前退
  let idx = currentOffset - 1;
  while (idx > 0 && /\s/.test(text[idx])) {
    idx--;
  }
  while (idx > 0 && !/\s/.test(text[idx - 1])) {
    idx--;
  }
  return Math.max(0, idx);
}

/**
 * 計算當前或下一個單字/詞彙的結尾位置 (e)
 */
export function getWordEndOffset(text: string, currentOffset: number): number {
  const len = text.length;
  if (currentOffset >= len - 1) return len;

  const segmenter = getSegmenter();
  if (segmenter) {
    const segments = Array.from(segmenter.segment(text));
    for (const seg of segments) {
      const segEnd = seg.index + seg.segment.length - 1;
      if (segEnd > currentOffset && (seg.isWordLike || seg.segment.trim().length > 0)) {
        return segEnd;
      }
    }
    return Math.max(0, len - 1);
  }

  let idx = currentOffset + 1;
  while (idx < len && !/\s/.test(text[idx])) {
    idx++;
  }
  return Math.max(0, idx - 1);
}
