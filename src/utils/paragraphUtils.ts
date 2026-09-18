import { extractImageInfo } from './academicImageUtils';
import { cleanPaperText } from './paperTextSanitizer';

export interface NormalizedParagraphItem {
  type: 'subheading' | 'formula' | 'image' | 'text';
  text?: string;
  level?: number;
  latex?: string;
  number?: string;
  url?: string;
  alt?: string;
  originalIndex: number;
}

/**
 * 將原始章節段落清單正規化為結構化渲染項目（子標題、公式卡、圖片視圖、正文段落）
 */
export function normalizeParagraphs(paragraphs: string[]): NormalizedParagraphItem[] {
  if (!paragraphs || paragraphs.length === 0) return [];
  const items: NormalizedParagraphItem[] = [];
  let i = 0;

  while (i < paragraphs.length) {
    const raw = paragraphs[i];
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. 檢測子標題 (如 #### 2.8.1. ... 或 ### ...)
    const headingMatch = trimmed.match(/^(#{2,6})\s+(.*)$/);
    if (headingMatch) {
      items.push({
        type: 'subheading',
        text: headingMatch[2].trim(),
        level: headingMatch[1].length,
        originalIndex: i
      });
      i++;
      continue;
    }

    // 2. 檢測圖片
    const imgInfo = extractImageInfo(trimmed);
    if (imgInfo) {
      items.push({
        type: 'image',
        url: imgInfo.url,
        alt: imgInfo.alt,
        originalIndex: i
      });
      i++;
      continue;
    }

    // 3. 檢測跨行 / 連續段落區塊公式
    // 情況 A：單一段落包含完整 $$ ... $$ [可帶公式編號]
    const singleBlockMatch = trimmed.match(/^\$\$([\s\S]*?)\$\$(?:\s*(\([0-9a-zA-Z]+\)))?$/);
    if (singleBlockMatch && singleBlockMatch[1].trim()) {
      let latex = singleBlockMatch[1].trim();
      let formulaNum = singleBlockMatch[2] || '';
      let lookAhead = i + 1;
      while (lookAhead < paragraphs.length && !paragraphs[lookAhead].trim()) {
        lookAhead++;
      }
      if (!formulaNum && lookAhead < paragraphs.length) {
        const nextP = paragraphs[lookAhead].trim();
        const numMatch = nextP.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i) || nextP.match(/^Equation\s*\(([0-9]+)\)/i);
        if (numMatch) {
          formulaNum = `(${numMatch[1]})`;
          i = lookAhead;
        }
      }
      items.push({
        type: 'formula',
        latex,
        number: formulaNum,
        originalIndex: i
      });
      i++;
      continue;
    }

    // 情況 B：多行段落切分形式的公式（如 $$ 獨佔一行、公式內容在下一行、$$ 獨佔一行、(1) 獨佔一行）
    if (trimmed === '$$' || trimmed.startsWith('$$')) {
      let latexParts: string[] = [];
      let foundEnd = false;
      let formulaNum = '';
      const startIndex = i;

      if (trimmed.length > 2) {
        latexParts.push(trimmed.slice(2).trim());
      }

      let j = i + 1;
      while (j < paragraphs.length) {
        const nextP = paragraphs[j].trim();
        if (!nextP) {
          j++;
          continue;
        }
        if (nextP === '$$' || nextP.endsWith('$$')) {
          if (nextP.length > 2) {
            latexParts.push(nextP.slice(0, -2).trim());
          }
          foundEnd = true;
          j++;
          break;
        } else {
          latexParts.push(nextP);
          j++;
        }
      }

      if (foundEnd) {
        let lookNum = j;
        while (lookNum < paragraphs.length && !paragraphs[lookNum].trim()) {
          lookNum++;
        }
        if (lookNum < paragraphs.length) {
          const numCandidate = paragraphs[lookNum].trim();
          const numMatch = numCandidate.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i) || numCandidate.match(/^Equation\s*\(([0-9]+)\)/i);
          if (numMatch) {
            formulaNum = `(${numMatch[1]})`;
            j = lookNum + 1;
          }
        }

        items.push({
          type: 'formula',
          latex: latexParts.join(' ').trim(),
          number: formulaNum,
          originalIndex: startIndex
        });
        i = j;
        continue;
      }
    }

    // 4. 孤立公式編號行如 (1)，若前一項剛好是公式，自動合併
    const standaloneNumMatch = trimmed.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i);
    if (standaloneNumMatch && items.length > 0 && items[items.length - 1].type === 'formula') {
      const prev = items[items.length - 1];
      if (!prev.number) {
        prev.number = `(${standaloneNumMatch[1]})`;
      }
      i++;
      continue;
    }

    // 5. 一般文字段落
    items.push({
      type: 'text',
      text: cleanPaperText(trimmed, { unwrapLines: false }),
      originalIndex: i
    });
    i++;
  }

  return items;
}
