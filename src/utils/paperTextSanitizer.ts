// Academic Paper Text Sanitizer for MUGEN YOMU
// Handles de-hyphenation, ligature restoration, line unwrap, and whitespace cleanup

export interface CleanPaperOptions {
  dehyphenate?: boolean;
  restoreLigatures?: boolean;
  unwrapLines?: boolean;
  normalizeWhitespace?: boolean;
}

/**
 * 學術論文與通用英語高頻詞庫（用於精確判定 hyphenated word 是否為單一完整單字）
 */
const COMMON_ACADEMIC_WORDS = new Set<string>([
  'system', 'systems', 'distributed', 'distribution', 'distributions',
  'observation', 'observations', 'environment', 'environments',
  'radical', 'radically', 'service', 'services', 'hundred', 'hundreds',
  'thousand', 'thousands', 'million', 'millions', 'different', 'difference',
  'differences', 'differently', 'effort', 'efforts', 'effective', 'effectively',
  'performance', 'performances', 'performing', 'performed',
  'application', 'applications', 'hardware', 'commodity', 'departure',
  'traditional', 'traditionally', 'assumption', 'assumptions',
  'explore', 'explored', 'exploring', 'deployment', 'deployed',
  'platform', 'platforms', 'generation', 'processing', 'processed',
  'processor', 'processors', 'extension', 'extensions', 'measurement',
  'measurements', 'architecture', 'architectures', 'architectural',
  'attention', 'network', 'networks', 'networking', 'layer', 'layers',
  'representation', 'representations', 'algorithm', 'algorithms',
  'algorithmic', 'computation', 'computations', 'computational',
  'memory', 'memories', 'execution', 'gradient', 'gradients',
  'vector', 'vectors', 'matrix', 'matrices', 'function', 'functions',
  'parameter', 'parameters', 'parametric', 'optimization', 'optimizations',
  'residual', 'residuals', 'convolution', 'convolutions', 'convolutional',
  'transformer', 'transformers', 'mechanism', 'mechanisms', 'probability',
  'probabilities', 'probabilistic', 'evaluation', 'evaluations',
  'accuracy', 'precision', 'validation', 'experiment', 'experiments',
  'experimental', 'information', 'classification', 'classifications',
  'regression', 'regressions', 'supervised', 'unsupervised', 'reinforcement',
  'inference', 'inferences', 'embedding', 'embeddings', 'dimension',
  'dimensions', 'dimensional', 'dimensionality', 'hyperparameter',
  'hyperparameters', 'component', 'components', 'benchmark', 'benchmarks',
  'benchmarking', 'throughput', 'latency', 'bandwidth', 'scalability',
  'scalable', 'robustness', 'fault', 'tolerance', 'concurrent', 'concurrently',
  'concurrency', 'client', 'clients', 'server', 'servers', 'storage',
  'cluster', 'clusters', 'interface', 'interfaces', 'implementation',
  'implementations', 'implement', 'implemented', 'design', 'designs',
  'designed', 'propose', 'proposed', 'proposing', 'framework', 'frameworks',
  'technique', 'techniques', 'method', 'methods', 'methodology',
  'methodologies', 'analysis', 'analyses', 'analytic', 'analytical',
  'paradigm', 'paradigms', 'structure', 'structures', 'structural',
  'theoretical', 'empiric', 'empirical', 'empirically', 'demonstrate',
  'demonstrated', 'demonstrates', 'indicate', 'indicated', 'indicates',
  'reveal', 'revealed', 'reveals', 'require', 'required', 'requires',
  'requirement', 'requirements', 'provide', 'provided', 'provides',
  'deliver', 'delivered', 'delivers', 'previous', 'previously',
  'anticipated', 'departure', 'reexamine', 'reexamined', 'reexamining',
  'successful', 'successfully', 'storage', 'dataset', 'datasets'
]);

/**
 * 已知非單字之音節斷詞後綴片段（行尾或連字號右側出現時，必然是斷詞而非複合詞）
 */
const HYPHEN_SUFFIX_FRAGMENTS = new Set<string>([
  'tem', 'tems', 'tributed', 'vations', 'vation', 'ronment', 'ronments',
  'ically', 'dreds', 'dred', 'vice', 'vices', 'tion', 'tions', 'sion',
  'sions', 'ment', 'ments', 'ance', 'ances', 'ence', 'ences', 'ible',
  'ibly', 'able', 'ably', 'ities', 'ity', 'ness', 'nesses', 'fully',
  'lessly', 'tive', 'tively', 'sive', 'sively', 'ous', 'ously', 'ture',
  'tures', 'ising', 'izing', 'isation', 'ization', 'ised', 'ized',
  'icate', 'icated', 'ication', 'ications', 'al', 'ally', 'ic', 'ical'
]);

/**
 * 已知非單字之音節斷詞前綴片段（連字號左側出現時，必然是斷詞）
 */
const HYPHEN_PREFIX_FRAGMENTS = new Set<string>([
  'obser', 'envi', 'sys', 'dis', 'rad', 'ser', 'hun', 'tra', 'app',
  'per', 'con', 'com', 'pro', 'in', 'im', 'de'
]);

/**
 * 需嚴格保留連字號的常見學術複合詞集合 (Compound Words Whitelist)
 */
const COMPOUND_WORDS_PRESERVE = new Set<string>([
  'data-intensive', 'micro-benchmarks', 'micro-benchmark',
  'state-of-the-art', 'fault-tolerant', 'fault-tolerance',
  'cost-effective', 'large-scale', 'high-performance',
  'self-attention', 'cross-attention', 'multi-head',
  'feed-forward', 'trade-off', 'trade-offs',
  'end-to-end', 'open-source', 'well-known',
  'fine-tuning', 'fine-tuned', 'zero-shot', 'few-shot',
  'pre-trained', 'real-time', 'real-world', 'cross-entropy',
  'peer-to-peer', 'off-the-shelf', 'cut-off', 'user-friendly',
  'low-latency', 'high-throughput', 'in-memory', 'out-of-memory'
]);

/**
 * 1. 修復 PDF 連字字形分離 (Ligature Restoration)
 * 將抽取的分離字元如 "di ff erent" -> "different", "e ff orts" -> "efforts", "speci fi c" -> "specific"
 */
export function cleanLigatures(text: string): string {
  if (!text) return '';

  return text
    // 1. 連字在中間：左字 + 空白 + 獨立連字 (ff|fi|fl|ffi|ffl) + 空白 + 右字
    // 例如 "di ff erent" -> "different", "e ff orts" -> "efforts", "speci fi c" -> "specific", "in fl uence" -> "influence"
    .replace(/\b([a-zA-Z]+)\s+(ff|fi|fl|ffi|ffl)\s+([a-zA-Z]+)\b/g, '$1$2$3')
    // 2. 連字在開頭：獨立 (ff|fi|fl|ffi|ffl) + 空白 + 後續音節 (例如 "fi rst" -> "first", "fl ow" -> "flow")
    .replace(/\b(ff|fi|fl|ffi|ffl)\s+([a-zA-Z]{2,})\b/g, '$1$2')
    // 3. 連字在結尾：前導音節 + 空白 + 獨立 (ff|fi|fl|ffi|ffl) (例如 "cli ff" -> "cliff", "sti ff" -> "stiff", "o ff" -> "off")
    .replace(/\b([a-zA-Z]{2,})\s+(ff|fi|fl|ffi|ffl)\b/g, '$1$2');
}

/**
 * 判定一個連字候選是否應消除連字號（De-hyphenate）或保留（Compound word）
 */
function shouldDehyphenate(left: string, right: string): boolean {
  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();
  const combined = leftLower + rightLower;
  const hyphenated = `${leftLower}-${rightLower}`;

  // 1. 若明確在複合詞保留名單中，絕對保留
  if (COMPOUND_WORDS_PRESERVE.has(hyphenated)) {
    return false;
  }

  // 2. 若拼接後在學術高頻單字庫中，絕對消除連字號（例如 system, distributed, observations, environment）
  if (COMMON_ACADEMIC_WORDS.has(combined)) {
    return true;
  }

  // 3. 若右側為已知的斷詞音節後綴（如 tem, tributed, vations, ronment, ically, dreds），消除連字號
  if (HYPHEN_SUFFIX_FRAGMENTS.has(rightLower)) {
    return true;
  }

  // 4. 若左側為已知斷詞音節前綴（如 obser, envi, sys, dis, rad, ser, hun），消除連字號
  if (HYPHEN_PREFIX_FRAGMENTS.has(leftLower)) {
    return true;
  }

  // 5. 若右側片段短小 (<= 3 字元) 且非標準短單字，極大概率為斷字
  if (rightLower.length <= 3 && !['in', 'on', 'to', 'off', 'up', 'out', 'key', 'low', 'end', 'set'].includes(rightLower)) {
    return true;
  }

  return false;
}

/**
 * 2. 修復斷詞連字號 (De-hyphenation)
 * 同時處理：
 * A. 跨行斷詞：word-\nbreak -> wordbreak (或保留複合詞如 data-\nintensive -> data-intensive)
 * B. 行內殘留斷詞：Sys-tem -> System, dis-tributed -> distributed
 */
export function cleanHyphenation(text: string): string {
  if (!text) return '';

  // Step A: 跨行斷詞接合
  let processed = text.replace(/([a-zA-Z]+)-\s*\r?\n\s*([a-zA-Z]+)/g, (match, left, right) => {
    if (shouldDehyphenate(left, right)) {
      // 依左側大小寫決定合併方式
      return left + right;
    } else {
      // 保留合法複合詞連字號
      return `${left}-${right}`;
    }
  });

  // Step B: 行內殘留斷詞接合 (針對如 Sys-tem, dis-tributed, obser-vations, envi-ronment, rad-ically, ser-vice, hun-dreds)
  processed = processed.replace(/\b([a-zA-Z]{2,})-([a-zA-Z]{2,})\b/g, (match, left, right) => {
    if (shouldDehyphenate(left, right)) {
      return left + right;
    }
    return match;
  });

  return processed;
}

/**
 * 3. 冗餘空白與標點間距清理 (Whitespace & Punctuation Cleanup)
 */
export function cleanWhitespaceAndPunctuation(text: string): string {
  if (!text) return '';

  return text
    // 移除控制字元與不可見字元
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B\uFEFF]/g, '')
    // 將不斷行空格替換為一般空格
    .replace(/\u00A0/g, ' ')
    // 壓縮同一行內的多重水平空白與 Tab
    .replace(/[^\S\r\n]+/g, ' ')
    // 清除標點符號前多餘空白（如 "word ," -> "word,", "word ." -> "word."）
    .replace(/\s+([,.:;!?])/g, '$1')
    // 括號內部兩端空白清理
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\[\s+/g, '[')
    .replace(/\s+\]/g, ']')
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')
    // 清理引號內部緊鄰空白
    .replace(/(["'“‘])\s+/g, '$1')
    .replace(/\s+(["'”’])/g, '$1')
    .trim();
}

/**
 * 4. 段落重流 (Unwrap Paragraph Lines)
 * 將文字中因 PDF 邊界強制折行之單一換行 (\n) 接合為單一空格，
 * 同時完整保留雙換行 (\n\n) 作為段落邊界，並保護 Markdown 標題、清單、公式與區塊引號。
 */
export function unwrapParagraphLines(text: string): string {
  if (!text) return '';

  // 先進行跨行斷詞修復
  let normalized = cleanHyphenation(text);

  // 以雙換行（或以上）切分為語意段落區塊
  const rawParagraphs = normalized.split(/\r?\n\s*\r?\n/);
  const unwrappedParagraphs: string[] = [];

  for (const block of rawParagraphs) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // 檢查是否包含代碼特徵（如 def, class, import, $, 4空格縮排）避免被當作 Markdown 標題或拍平
    const hasCodeCharacteristics =
      /^(?:\$|>|def\s+|class\s+|import\s+|from\s+|function\s+|const\s+|let\s+|var\s+|return\s+)/m.test(trimmedBlock) ||
      /(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+[:\(]|return\s+[a-zA-Z0-9_])/m.test(trimmedBlock);

    // 若區塊開頭為 Markdown 標題（可能緊跟正文而無雙換行，排除 Python/Shell 註解）
    if (/^#{1,6}\s+/.test(trimmedBlock) && !hasCodeCharacteristics) {
      const lines = trimmedBlock.split(/\r?\n/);
      let headingLine = '';
      const bodyLines: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (i === 0 && /^#{1,6}\s+/.test(l)) {
          headingLine = l;
        } else if (l) {
          bodyLines.push(l);
        }
      }
      if (headingLine) unwrappedParagraphs.push(headingLine);
      if (bodyLines.length > 0) {
        unwrappedParagraphs.push(bodyLines.join(' '));
      }
      continue;
    }

    // 檢查是否為特殊結構區塊（如 Display Math、代碼塊、表格、清單、引用、Shell 命令、程式碼片段）
    const isSpecialBlock =
      trimmedBlock.startsWith('$$') ||
      trimmedBlock.startsWith('```') ||
      trimmedBlock.startsWith('|') ||
      /^(?:[-*+]|\d+\.)\s/.test(trimmedBlock) ||
      trimmedBlock.startsWith('>') ||
      hasCodeCharacteristics;

    if (isSpecialBlock) {
      // 特殊結構保持行結構，完整保留換行與縮排，絕對不拍平！
      unwrappedParagraphs.push(block);
    } else {
      // 一般內文段落：將內部的單一換行接合為空格
      const singleLine = trimmedBlock
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .join(' ');
      unwrappedParagraphs.push(singleLine);
    }
  }

  return unwrappedParagraphs.join('\n\n');
}

/**
 * 5. 整合型論文文字清洗主函式 (Complete Paper Text Sanitizer)
 */
export function cleanPaperText(text: string, options: CleanPaperOptions = {}): string {
  if (!text) return '';

  const {
    dehyphenate = true,
    restoreLigatures = true,
    unwrapLines = true,
    normalizeWhitespace = true
  } = options;

  let result = text;

  // 1. 若啟用段落重流，先將硬換行接合，同時修復跨行斷詞
  if (unwrapLines) {
    result = unwrapParagraphLines(result);
  }

  // 2. 修復連字字形分離 (如 "di ff erent" -> "different", "e ff orts" -> "efforts")
  if (restoreLigatures) {
    result = cleanLigatures(result);
  }

  // 3. 修復行內殘留斷詞連字號 (如 "Sys-tem" -> "System", "dis-tributed" -> "distributed")
  if (dehyphenate) {
    result = cleanHyphenation(result);
  }

  // 4. 清理多餘空白、不可見字元與標點間距
  if (normalizeWhitespace) {
    result = cleanWhitespaceAndPunctuation(result);
  }

  return result;
}

/**
 * 批次清洗段落陣列
 */
export function cleanParagraphs(paragraphs: string[], options?: CleanPaperOptions): string[] {
  if (!paragraphs || paragraphs.length === 0) return [];
  return paragraphs
    .map(p => cleanPaperText(p, { unwrapLines: false, ...options }))
    .filter(p => p.length > 0);
}
