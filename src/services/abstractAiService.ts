import type { PaperDocument } from '../types/document';
import type { ChatMessage } from './llm/types';
import { callProviderChatWithResilience } from './llm/client';
import { getCachedCompletion, setCachedCompletion, generateCacheKey } from './cacheService';
import { safeParseJsonFromLLM } from './cognitiveService';

export interface AbstractCoreResult {
  chineseSummary: string;
  english: string;
  cached?: boolean;
  model?: string;
  provider?: string;
}

/**
 * 針對論文按需生成核心雙語摘要 (Bilingual Abstract Core)
 * 嚴格考量免費 AI 額度：
 * 1. 絕不自動呼叫，僅按需觸發
 * 2. 嚴格截取論文標題與前導內容（限 1200 字元），節省 Input Token
 * 3. 輸出限制 400 Output Tokens，產出精煉正體中文與對應英文
 * 4. 具備本機快取（Cache-First），重複調用 0 Token
 */
export async function generatePaperAbstractCore(
  paper: PaperDocument,
  provider: string = 'groq',
  apiKey: string = '',
  model: string = '',
  ollamaUrl?: string
): Promise<AbstractCoreResult> {
  if (!paper) {
    throw new Error('無效的文獻物件');
  }

  const cacheKey = generateCacheKey(provider, model || 'default', `abstract_core:${paper.id}:${paper.title}`);
  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached.reply);
      if (parsed.chineseSummary) {
        return {
          chineseSummary: parsed.chineseSummary,
          english: parsed.english || paper.abstract?.english || '',
          cached: true,
          model: cached.model,
          provider: cached.provider
        };
      }
    } catch {
      // 若快取格式非 JSON 則降級繼續
    }
  }

  // 1. 萃取精簡上下文 (避免整篇長文傳輸以極限節省 Token 額度)
  let contextSnippet = '';
  if (paper.abstract?.english && paper.abstract.english.trim().length > 30 && !paper.abstract.english.startsWith('Title:')) {
    contextSnippet = paper.abstract.english.slice(0, 1000);
  } else if (paper.sections && paper.sections.length > 0) {
    // 從第一章或第二章前段抓取前言文字
    const candidateTexts = paper.sections
      .flatMap(s => s.paragraphs || [])
      .filter(p => !p.startsWith('!') && !p.startsWith('$$') && !p.startsWith('Title:'));
    contextSnippet = candidateTexts.slice(0, 4).join('\n\n').slice(0, 1200);
  }

  const prompt = `你是一位頂尖學術導師。請根據以下論文資訊，為讀者提煉「雙語論文核心導讀」：
文獻標題: "${paper.title}"
${contextSnippet ? `內文摘要/前言片段:\n"""\n${contextSnippet}\n"""` : ''}

【輸出嚴格要求】：
1. 輸出正體/繁體中文（台灣學術術語標準，如：記憶體、演算法、執行緒、架構）。
2. chineseSummary：請用 120~180 字精煉概括：(1)欲解決的根本痛點、(2)核心設計創新點、(3)關鍵貢獻或性能突破。嚴禁空洞贅詞。
3. english：若已有清晰英文摘要則提煉保留（約 80~120 詞），若原本缺失則自動產出精練英文 Abstract。
4. 必須以 JSON 格式回應，格式如下：
{
  "chineseSummary": "...",
  "english": "..."
}`;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是頂尖學術文獻精讀導師，專精於提煉嚴謹清晰的繁體中文核心論文摘要。一律以純 JSON 物件回傳。'
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  // 若使用 Groq 提煉導讀，強制使用超輕量、零超載、配額充裕的 llama-3.1-8b-instant，徹底杜絕 70B 的 EOF 中斷
  const effectiveModel = (provider === 'groq' && (!model || model.includes('70b')))
    ? 'llama-3.1-8b-instant'
    : (model || 'llama-3.1-8b-instant');

  let response: any = null;
  try {
    response = await callProviderChatWithResilience(
      provider,
      messages,
      apiKey,
      effectiveModel,
      ollamaUrl
    );
  } catch (err: any) {
    console.warn('[abstractAiService] 雲端推論遭遇連線中斷，切換為本機架構摘要兜底:', err);
    const secTitles = (paper.sections || []).slice(0, 3).map(s => s.title).join('、');
    return {
      chineseSummary: `本書/論文圍繞「${paper.title}」展開深入探討，核心章節包含：${secTitles || '系統核心原理與工程設計'}。重點分析了其架構演進、痛點瓶頸與關鍵實踐方案。（雲端連線忙碌，已自動為您提煉本機導讀）`,
      english: paper.abstract?.english || `A comprehensive analysis of "${paper.title}", covering key architectural design, performance benchmarks, and practical applications.`,
      model: 'local-fallback',
      provider: 'local'
    };
  }

  const fallbackResult: AbstractCoreResult = {
    chineseSummary: '本文針對該領域核心瓶頸提出創新架構，顯著提升運算效率與理論邊界。',
    english: paper.abstract?.english || 'This work introduces a foundational framework addressing key architectural bottlenecks with empirical validation.'
  };

  const parsed = safeParseJsonFromLLM<{ chineseSummary?: string; english?: string }>(
    response.reply,
    fallbackResult
  );

  const finalResult: AbstractCoreResult = {
    chineseSummary: parsed.chineseSummary?.trim() || fallbackResult.chineseSummary,
    english: parsed.english?.trim() || paper.abstract?.english || fallbackResult.english,
    cached: response.cached,
    model: response.model,
    provider: response.provider
  };

  // 寫入快取，確保日後 0 Token 重複讀取
  try {
    await setCachedCompletion(
      cacheKey,
      JSON.stringify(finalResult),
      response.model || effectiveModel,
      response.provider || provider,
      response.latencyMs || 25
    );
  } catch (err) {
    console.warn('[abstractAiService] 快取寫入失敗:', err);
  }

  return finalResult;
}
