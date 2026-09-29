/**
 * @file textSearchMatcher.ts
 * @description 語意檢索目標字詞精確定位器 (Character Offset Matcher)
 * 負責在命中的段落原文中找出最相關的字詞起始位置，驅動 Vim 方塊游標精準降落
 */

export interface MatchCharResult {
  charIndex: number;
  matchLength: number;
  matchedText: string;
  isDirectMatch: boolean;
}

/**
 * 在段落原文中精準比對使用者搜尋字詞的字元位移 (Character Offset)
 * 嚴格依照搜尋詞實際是否存在於段落內，若無字面出現則回傳 charIndex: -1，絕不強行指定首字
 */
export function findBestMatchCharIndex(
  paragraphText: string,
  query: string
): MatchCharResult {
  if (!paragraphText || !paragraphText.trim()) {
    return { charIndex: -1, matchLength: 0, matchedText: '', isDirectMatch: false };
  }

  const pLower = paragraphText.toLowerCase();
  const qClean = (query || '').trim().toLowerCase();

  if (!qClean) {
    return { charIndex: -1, matchLength: 0, matchedText: '', isDirectMatch: false };
  }

  // 1. 完整字串精確比對
  const exactIdx = pLower.indexOf(qClean);
  if (exactIdx >= 0) {
    return {
      charIndex: exactIdx,
      matchLength: qClean.length,
      matchedText: paragraphText.slice(exactIdx, exactIdx + qClean.length),
      isDirectMatch: true
    };
  }

  // 2. 獨立提取 query 內包含的實質英文單詞 (長度 >= 3)
  const englishTokens = qClean.match(/[a-z]{3,}/g) || [];
  englishTokens.sort((a, b) => b.length - a.length);
  for (const enToken of englishTokens) {
    const enTokenIdx = pLower.indexOf(enToken);
    if (enTokenIdx >= 0) {
      return {
        charIndex: enTokenIdx,
        matchLength: enToken.length,
        matchedText: paragraphText.slice(enTokenIdx, enTokenIdx + enToken.length),
        isDirectMatch: true
      };
    }
  }

  // 3. 拆分中英子詞組比對
  const queryTokens = qClean
    .split(/[\s,，、。.!！?？:：;；"“”'‘’()（）\[\]]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  queryTokens.sort((a, b) => b.length - a.length);
  for (const token of queryTokens) {
    const tokenIdx = pLower.indexOf(token);
    if (tokenIdx >= 0) {
      return {
        charIndex: tokenIdx,
        matchLength: token.length,
        matchedText: paragraphText.slice(tokenIdx, tokenIdx + token.length),
        isDirectMatch: true
      };
    }
  }

  // 4. 若段落中確實未包含搜尋字詞，誠實回傳未命中 (charIndex: -1)，絕不偽造首字命中
  return {
    charIndex: -1,
    matchLength: 0,
    matchedText: '',
    isDirectMatch: false
  };
}

/**
 * 將命中關鍵字詞在段落摘要中轉換為安全之 HTML 高亮標籤
 */
export function formatSearchHighlight(
  text: string,
  match: MatchCharResult
): string {
  if (!text) return '';
  if (!match || match.charIndex < 0 || match.matchLength <= 0) {
    return escapeHtml(text);
  }

  const start = match.charIndex;
  const end = Math.min(text.length, start + match.matchLength);

  const before = escapeHtml(text.slice(0, start));
  const target = escapeHtml(text.slice(start, end));
  const after = escapeHtml(text.slice(end));

  return `${before}<mark class="bg-[#fabd2f]/30 text-[#fabd2f] font-semibold px-1 py-0.5 rounded border border-[#fabd2f]/50">${target}</mark>${after}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
