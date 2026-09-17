import type { ChatMessage } from './llm/types';
import { callProviderChatWithResilience } from './llm/client';
import { getCachedCompletion, setCachedCompletion, generateCacheKey } from './cacheService';

/**
 * 安全擷取並剖析來自 LLM 的 JSON 輸出，自動剝離 Markdown 標籤與修復括號邊界
 */
export function safeParseJsonFromLLM<T>(rawText: string, fallback: T): T {
  if (!rawText || typeof rawText !== 'string') return fallback;
  let cleaned = rawText.trim();

  // 1. 剝離 Markdown 程式碼區塊標記 (```json ... ``` 或 ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 2. 優先嘗試直接解析
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 3. 容錯：尋找首尾 JSON 括號切片
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {}
    }

    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {}
    }
  }

  console.warn('[cognitiveService] safeParseJsonFromLLM 解析失敗，採用本機範本備援。原始字串:', rawText.slice(0, 120));
  return fallback;
}

export interface ScientificIntuitionResult {
  title: string;
  tag: string;
  content: string[];
  cached?: boolean;
}

export interface SyntaxTreeResult {
  line: string;
  snippet: string;
  svo: { role: string; text: string; zh: string; color: string }[];
  cached?: boolean;
}

export interface TerminologyItem {
  term: string; // 英文原文術語
  zh?: string; // 台灣正體/繁體中文對照名稱
  explanation: string; // 核心學術白話釋義
  color: string;
}

export interface TerminologyResult {
  terms: TerminologyItem[];
  cached?: boolean;
}

function getFallbackIntuition(sectionTitle: string): ScientificIntuitionResult {
  return {
    title: `深入理解「${sectionTitle}」的設計哲學`,
    tag: 'Cognitive Insight',
    content: [
      `在「${sectionTitle}」中，作者著眼於突破既有架構的運算吞吐量與表徵瓶頸，以更緊湊的數學結構表達特徵相依性。`,
      '其核心直覺在於透過特徵子空間的正交線性投影與數值歸一化，消除冗餘計算並提升正向傳播的學習信號穩定度。'
    ]
  };
}

/**
 * 1. 生成白話科學直覺 (Scientific Intuition)
 */
export async function generateScientificIntuition(
  sectionTitle: string,
  paragraphs: string[],
  provider: string = 'groq',
  apiKey: string = '',
  model: string = 'llama-3.3-70b-versatile',
  ollamaUrl?: string
): Promise<ScientificIntuitionResult> {
  const contextSnippet = paragraphs.slice(0, 4).join('\n\n').trim();
  const cacheKey = generateCacheKey(
    provider || 'cache',
    model || 'intuition',
    `intuition:${sectionTitle}:${contextSnippet.slice(0, 240)}`
  );

  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    const parsed = safeParseJsonFromLLM<ScientificIntuitionResult | null>(cached.reply, null);
    if (parsed && parsed.title && parsed.content) {
      return { ...parsed, cached: true };
    }
  }

  if ((apiKey && apiKey.trim().length > 5) || provider === 'ollama') {
    const systemPrompt = `你是專精於頂尖科學與資訊工程領域的大師級學者兼伴讀導師。
你的任務是為讀者剖析論文特定章節背後的「白話科研直覺 (Scientific Intuition)」。
請務必嚴格遵守以下規範：
1. 嚴格採用台灣正體/繁體中文（Traditional Chinese），專有名詞遵循台灣標準規範（如：記憶體、矩陣、向量、演算法、執行緒）。
2. 解釋「為什麼作者要提出該架構/推導？傳統作法面臨何種瓶頸？其物理、幾何或工程直覺本質是什麼？」，以生動通俗且高度精準的譬喻論證，不要死板翻譯或陳腔濫調。
3. 嚴格一律只輸出合法 JSON 物件，格式如下，禁止添加前後引言或 Markdown 外的額外說明：
{
  "title": "直覺探討標題（例如：為什麼注意力點積必須除以 √d_k？）",
  "tag": "核心領域或概念標籤（例如：數值梯度穩定度 / 計算拓撲）",
  "content": [
    "第一段：點出傳統設計瓶頸與問題痛點...",
    "第二段：說明本節設計在數學或工程幾何上的直覺本質與好處..."
  ]
}`;

    const userPrompt = `【章節標題】: ${sectionTitle}\n\n【章節內容節錄】:\n${contextSnippet.slice(0, 1400)}\n\n請輸出該節的「白話科學直覺」JSON。`;

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      const res = await callProviderChatWithResilience(provider, messages, apiKey, model, ollamaUrl);
      const parsed = safeParseJsonFromLLM<ScientificIntuitionResult>(
        res.reply,
        getFallbackIntuition(sectionTitle)
      );

      await setCachedCompletion(cacheKey, JSON.stringify(parsed), model, provider, res.latencyMs);
      return { ...parsed, cached: false };
    } catch (err) {
      console.warn('[cognitiveService] 直覺生成連線異常，啟動本機備援:', err);
    }
  }

  const fallback = getFallbackIntuition(sectionTitle);
  await setCachedCompletion(cacheKey, JSON.stringify(fallback), 'local-scholar', 'local', 10);
  return { ...fallback, cached: true };
}

function getFallbackSyntaxTree(snippet: string, sectionTitle: string): SyntaxTreeResult {
  const sentence = snippet.length > 30 ? snippet.split('.')[0] + '.' : 'By decomposing complex representations, the architecture guarantees efficient training without computational overhead.';
  return {
    line: `§ ${sectionTitle}`,
    snippet: sentence,
    svo: [
      { role: '[主幹 S-V-O]', text: 'the architecture guarantees efficient training', zh: '該架構確保了高效並行訓練動態', color: 'text-[#fe8019]' },
      { role: '[方式與條件]', text: 'By decomposing complex representations', zh: '透過將複雜表徵拆解為正交成分', color: 'text-[#fabd2f]' },
      { role: '[目的與結果]', text: 'without computational overhead', zh: '且不致引入額外的運算複雜度', color: 'text-[#8ec07c]' }
    ]
  };
}

/**
 * 2. 生成長難句語法 SVO 拆解 (Sentence Deconstruction / Syntax Tree)
 */
export async function generateSentenceDeconstruction(
  targetText: string,
  sectionTitle: string,
  provider: string = 'groq',
  apiKey: string = '',
  model: string = 'llama-3.3-70b-versatile',
  ollamaUrl?: string
): Promise<SyntaxTreeResult> {
  const cleanSnippet = targetText.trim();
  const cacheKey = generateCacheKey(
    provider || 'cache',
    model || 'syntax',
    `syntax:${sectionTitle}:${cleanSnippet.slice(0, 200)}`
  );

  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    const parsed = safeParseJsonFromLLM<SyntaxTreeResult | null>(cached.reply, null);
    if (parsed && parsed.snippet && parsed.svo && parsed.svo.length > 0) {
      return { ...parsed, cached: true };
    }
  }

  if ((apiKey && apiKey.trim().length > 5) || provider === 'ollama') {
    const systemPrompt = `你是專精於英文學術文獻結構化拆解的長難句語法分析導師。
你的任務是針對使用者提供之英文句子（或章節代表性長難句），進行結構清晰的主幹與修飾成分層次化拆解（SVO Deconstruction）。
請嚴格遵守以下規範：
1. 一律使用台灣正體/繁體中文（Traditional Chinese）註解說明。
2. 拆解為 2 至 4 個核心語法邏輯塊，標籤角色建議如下：
   - "[主幹 S-V-O]" (核心主詞-動詞-受詞，color 指派 "text-[#fe8019]")
   - "[方式與條件]" 或 "[平行修飾]" (分詞片語、介系詞短語、先行詞子句，color 指派 "text-[#fabd2f]")
   - "[目的與結果]" (不定詞、結果副詞子句、預期效應，color 指派 "text-[#8ec07c]")
3. 每個成分提供原文字串 (text) 以及簡練通順的台灣繁體中文意涵 (zh)。
4. 嚴格一律只輸出合法 JSON 物件，格式如下：
{
  "line": "§ ${sectionTitle}",
  "snippet": "拆解的完整原句英文內容",
  "svo": [
    {
      "role": "[主幹 S-V-O]",
      "text": "the cognitive parser enables researchers to swiftly assimilate...",
      "zh": "認知解析引擎使研究人員能迅速吸收核心論點",
      "color": "text-[#fe8019]"
    },
    {
      "role": "[方式與條件]",
      "text": "By decomposing syntactically intricate sentences...",
      "zh": "透過將複雜句式拆解為主謂賓核心結構",
      "color": "text-[#fabd2f]"
    },
    {
      "role": "[目的與結果]",
      "text": "without succumbing to cognitive overload",
      "zh": "從而避免大腦陷入資訊過載疲乏",
      "color": "text-[#8ec07c]"
    }
  ]
}`;

    const userPrompt = `【所屬章節】: ${sectionTitle}\n【目標分析文句/段落】:\n${cleanSnippet}\n\n若未指定單一句子，請自動從上述內容中挑選最值得精讀的代表性學術長難句進行 SVO 拆解並輸出 JSON。`;

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      const res = await callProviderChatWithResilience(provider, messages, apiKey, model, ollamaUrl);
      const parsed = safeParseJsonFromLLM<SyntaxTreeResult>(
        res.reply,
        getFallbackSyntaxTree(cleanSnippet, sectionTitle)
      );

      await setCachedCompletion(cacheKey, JSON.stringify(parsed), model, provider, res.latencyMs);
      return { ...parsed, cached: false };
    } catch (err) {
      console.warn('[cognitiveService] 句構拆解連線異常，啟動本機備援:', err);
    }
  }

  const fallback = getFallbackSyntaxTree(cleanSnippet, sectionTitle);
  await setCachedCompletion(cacheKey, JSON.stringify(fallback), 'local-scholar', 'local', 10);
  return { ...fallback, cached: true };
}

function getFallbackTerminology(sectionTitle: string): TerminologyItem[] {
  const baseTerm = sectionTitle.split(' ').slice(0, 2).join(' ') || 'Core Concept';
  return [
    { term: baseTerm, zh: '核心概念', explanation: '本章節核心技術概念與推論立論基礎', color: '#fabd2f' },
    { term: 'Orthogonal Projection', zh: '正交投影', explanation: '消除維度間相關冗餘，穩定特徵表徵空間', color: '#8ec07c' },
    { term: 'Numerical Stability', zh: '數值穩定性', explanation: '防止反向傳播時數值上溢或梯度擴散', color: '#fe8019' }
  ];
}

/**
 * 3. 生成學術術語對齊 (Academic Terminology Alignment)
 */
export async function generateTerminologyAlignment(
  sectionTitle: string,
  paragraphs: string[],
  provider: string = 'groq',
  apiKey: string = '',
  model: string = 'llama-3.3-70b-versatile',
  ollamaUrl?: string
): Promise<TerminologyResult> {
  const contextSnippet = paragraphs.slice(0, 3).join('\n\n').trim();
  const cacheKey = generateCacheKey(
    provider || 'cache',
    model || 'terms',
    `terms:${sectionTitle}:${contextSnippet.slice(0, 200)}`
  );

  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    const parsed = safeParseJsonFromLLM<TerminologyItem[] | null>(cached.reply, null);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return { terms: parsed, cached: true };
    }
  }

  if ((apiKey && apiKey.trim().length > 5) || provider === 'ollama') {
    const systemPrompt = `你是專精於前沿科學與資訊工程學術名詞對照的術語專家。
請掃描使用者提供的學術章節內容，精準萃取 3 到 5 個本節最關鍵的專業術語（Terminology），並嚴格提供「英文原文」與嚴格符合台灣繁體學術標準的「正體中文對照」，以及精準的學術白話釋義。
請嚴格遵守以下規範：
1. term: 必須為論文中的「英文原文術語」（例如：Scaled Dot-Product Attention、Multi-Head Attention、Residual Stream、Degradation Problem）。
2. zh: 必須為嚴格遵循台灣繁體資訊科技與數學標準規範的「中文術語名稱」（例如：縮放點積注意力、多頭自注意力機制、殘差流、退化問題）。
3. explanation: 言簡意賅（15~35 字內）說明該術語在該理論/架構中的技術本質、目的或運作功能。
4. 顏色 color 請從 Gruvbox 調色盤中精選指派（'#fabd2f', '#8ec07c', '#fe8019', '#83a598', '#d3869b'）。
5. 嚴格一律只輸出合法 JSON 陣列，格式如下：
[
  {
    "term": "Scaled Dot-Product Attention",
    "zh": "縮放點積注意力機制",
    "explanation": "藉由除以根號維度穩定方差，阻斷 Softmax 進入飽和區以避免梯度消失",
    "color": "#fabd2f"
  },
  {
    "term": "Subspace Projection",
    "zh": "子空間正交投影",
    "explanation": "將特徵映射至相互獨立的表徵空間，避免注意力過度平均化",
    "color": "#8ec07c"
  }
]`;

    const userPrompt = `【章節標題】: ${sectionTitle}\n【章節內容】:\n${contextSnippet.slice(0, 1200)}\n\n請萃取 3~5 個核心學術術語，包含英文原文 (term) 與繁中對照 (zh) 並輸出 JSON 陣列。`;

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      const res = await callProviderChatWithResilience(provider, messages, apiKey, model, ollamaUrl);
      const parsed = safeParseJsonFromLLM<TerminologyItem[]>(
        res.reply,
        getFallbackTerminology(sectionTitle)
      );

      await setCachedCompletion(cacheKey, JSON.stringify(parsed), model, provider, res.latencyMs);
      return { terms: parsed, cached: false };
    } catch (err) {
      console.warn('[cognitiveService] 術語對齊連線異常，啟動本機備援:', err);
    }
  }

  const fallback = getFallbackTerminology(sectionTitle);
  await setCachedCompletion(cacheKey, JSON.stringify(fallback), 'local-scholar', 'local', 10);
  return { terms: fallback, cached: true };
}
