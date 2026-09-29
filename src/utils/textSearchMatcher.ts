/**
 * @file textSearchMatcher.ts
 * @description 語意檢索目標字詞精確定位器 (Character Offset Matcher)
 * 負責在命中的段落原文中找出最相關的字詞起始位置，驅動 Vim 方塊游標精準降落
 */

// 常見中英學術核心概念對照映射表，輔助跨語言搜尋時精確定位目標詞彙
const ACADEMIC_TERM_PAIRS: Record<string, string[]> = {
  '退化': ['degradation', 'degrade', 'degenerate', 'vanishing'],
  '殘差': ['residual', 'shortcut', 'skip connection', 'identity mapping'],
  '瓶頸': ['bottleneck', 'dimension reduction'],
  '注意力': ['attention', 'self-attention', 'multi-head', 'scaled dot-product'],
  '複雜度': ['complexity', 'computational', 'cost', 'flops', 'overhead'],
  '計算': ['compute', 'computation', 'flops', 'complexity'],
  '深度': ['depth', 'deeper', 'deep', 'layers'],
  '層': ['layer', 'layers', 'block', 'blocks'],
  '架構': ['architecture', 'structure', 'framework', 'network'],
  '模型': ['model', 'network', 'networks'],
  '訓練': ['train', 'training', 'trained', 'epoch', 'iterations'],
  '收斂': ['converge', 'convergence', 'converging'],
  '最佳化': ['optimization', 'optimizer', 'optimize'],
  '優化': ['optimization', 'optimizer', 'optimize'],
  '梯度': ['gradient', 'vanishing', 'exploding', 'backpropagation'],
  '表現': ['performance', 'accuracy', 'error', 'benchmark'],
  '準確率': ['accuracy', 'error rate', 'top-1', 'top-5'],
  '特徵': ['feature', 'features', 'representation', 'maps'],
  '卷積': ['convolution', 'convolutional', 'conv', 'receptive field'],
  '歸一化': ['normalization', 'batchnorm', 'layernorm', 'batch normalization'],
  '正規化': ['normalization', 'regularization', 'weight decay'],
  '位置編碼': ['positional encoding', 'position-wise'],
  '權重': ['weight', 'weights', 'parameter', 'parameters'],
  '矩陣': ['matrix', 'matrices', 'dimension'],
  '損失': ['loss', 'cross-entropy', 'objective function'],
  '活化': ['activation', 'relu', 'gelu', 'non-linear'],
  '激活': ['activation', 'relu', 'gelu', 'non-linear'],
  '評估': ['evaluation', 'experiment', 'experiments', 'benchmark'],
  '基準': ['baseline', 'benchmark', 'comparison'],
  '流速': ['flow rate', 'flow rates'],
  '壓力': ['pressure', 'bar', 'bars'],
  '粉餅': ['puck', 'coffee puck', 'compaction'],
  '通道': ['channeling', 'channels', 'channel']
};

export interface MatchCharResult {
  charIndex: number;
  matchLength: number;
  matchedText: string;
  isDirectMatch: boolean;
  conceptLabel?: string;
}

/**
 * 在段落原文中計算搜尋字詞的最契合字符位移 (Character Offset)
 */
export function findBestMatchCharIndex(
  paragraphText: string,
  query: string
): MatchCharResult {
  if (!paragraphText || !paragraphText.trim()) {
    return { charIndex: 0, matchLength: 0, matchedText: '', isDirectMatch: false };
  }

  const pLower = paragraphText.toLowerCase();
  const qClean = (query || '').trim().toLowerCase();

  if (!qClean) {
    return { charIndex: 0, matchLength: 0, matchedText: '', isDirectMatch: false };
  }

  // 1. 優先嘗試整句精確匹配
  const exactIdx = pLower.indexOf(qClean);
  if (exactIdx >= 0) {
    return {
      charIndex: exactIdx,
      matchLength: qClean.length,
      matchedText: paragraphText.slice(exactIdx, exactIdx + qClean.length),
      isDirectMatch: true
    };
  }

  // 2. 獨立提取 query 內包含的所有英文單詞（長度 >= 3，如 "resnet", "attention", "transformer"）
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

  // 3. 跨語言學術概念對齊匹配 (例如讀者搜尋中文「退化」，在英文段落精準命中 "degradation")
  for (const [zhTerm, enTerms] of Object.entries(ACADEMIC_TERM_PAIRS)) {
    if (qClean.includes(zhTerm)) {
      for (const en of enTerms) {
        const enIdx = pLower.indexOf(en);
        if (enIdx >= 0) {
          return {
            charIndex: enIdx,
            matchLength: en.length,
            matchedText: paragraphText.slice(enIdx, enIdx + en.length),
            isDirectMatch: true,
            conceptLabel: `${zhTerm} ⇄ ${en}`
          };
        }
      }
    }
  }

  // 4. 嘗試拆分中英子單詞 (以標點或空白切分)
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

  // 5. 若純抽象語意比對無字面重疊，避開開頭虛詞 (In this paper, We, The)，定位至段落首個實質核心詞
  const meaningfulMatch = paragraphText.match(/\b(propose|present|show|introduce|network|model|residual|attention|layer|training|deeper|accuracy|result|experiment|feature|framework)\b/i);
  if (meaningfulMatch && meaningfulMatch.index !== undefined) {
    return {
      charIndex: meaningfulMatch.index,
      matchLength: meaningfulMatch[0].length,
      matchedText: meaningfulMatch[0],
      isDirectMatch: false,
      conceptLabel: '核心主題詞'
    };
  }

  const firstCharMatch = paragraphText.search(/[A-Za-z0-9\u4e00-\u9fa5]/);
  const fallbackIndex = firstCharMatch >= 0 ? firstCharMatch : 0;

  return {
    charIndex: fallbackIndex,
    matchLength: 1,
    matchedText: paragraphText.charAt(fallbackIndex),
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
