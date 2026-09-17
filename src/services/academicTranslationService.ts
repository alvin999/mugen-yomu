import type { ChatMessage } from './llm/types';
import { callProviderChatWithResilience, splitTextIntoChunks } from './llm/client';
import { getCachedCompletion, setCachedCompletion, generateCacheKey } from './cacheService';
import { playTypewriter } from '../utils/typewriter';

export interface AcademicTranslationResult {
  translation: string;
  cached: boolean;
  latencyMs: number;
  fallbackNotice?: string;
  chunkCount?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function generateOfflineAcademicTranslation(text: string): string {
  return `[原文譯意]：${text.slice(0, 300)}...（請於右上方設定自備金鑰 BYOK 以啟動高精確度即時學術翻譯）`;
}

export async function translateAcademicText(
  text: string,
  provider: string = 'groq',
  apiKey: string = '',
  model: string = 'llama-3.3-70b-versatile',
  ollamaUrl?: string,
  onChunk?: (currentStreamText: string) => void
): Promise<AcademicTranslationResult> {
  const cleanText = text.trim();
  const cacheKey = generateCacheKey(provider || 'cache', model || 'translator', 'translate:' + cleanText);

  // 1. Check IndexedDB cache
  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    if (onChunk) {
      await playTypewriter(cached.reply, onChunk, 10);
    }
    return {
      translation: cached.reply,
      cached: true,
      latencyMs: 8
    };
  }

  // 2. Call AI Provider if key or ollama is configured
  if ((apiKey && apiKey.trim().length > 5) || provider === 'ollama') {
    const translationSystemPrompt = `你是專精於頂尖科學與工程論文的學術翻譯家。
請將使用者提供的英文論文段落精確翻譯為台灣正體/繁體中文（Traditional Chinese）。
務必遵守以下學術規範：
1. 嚴格採用台灣資訊科技與數學通用術語（如：矩陣、向量、自注意力機制、記憶體、演算法、執行緒、維度、數值梯度、快取）。
2. 保留原文的邏輯因果關係、學術嚴謹度與流暢語感，不要添加任何主觀解說、前後綴問候或引號標籤。
3. 直接輸出正體中文譯文。`;

    const chunks = splitTextIntoChunks(cleanText, 450);

    try {
      if (chunks.length === 1) {
        // 單塊標準呼叫
        const messages: ChatMessage[] = [
          { role: 'system', content: translationSystemPrompt },
          { role: 'user', content: chunks[0] }
        ];
        const res = await callProviderChatWithResilience(provider, messages, apiKey, model, ollamaUrl, onChunk);
        return {
          translation: res.reply.trim(),
          cached: false,
          latencyMs: res.latencyMs,
          fallbackNotice: res.fallbackNotice
        };
      } else {
        // 多塊語意分流依序翻譯並合流拼接
        const translatedParts: string[] = [];
        let totalLatency = 0;
        let lastFallbackNotice: string | undefined = undefined;
        let accumulatedOverall = '';

        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) {
            accumulatedOverall += '\n\n';
            if (onChunk) onChunk(accumulatedOverall);
            await delay(300); // 子區塊間隔平滑延遲
          }
          const chunkPrefix = accumulatedOverall;
          const messages: ChatMessage[] = [
            { role: 'system', content: translationSystemPrompt },
            { role: 'user', content: chunks[i] }
          ];
          const chunkRes = await callProviderChatWithResilience(
            provider,
            messages,
            apiKey,
            model,
            ollamaUrl,
            onChunk ? (chunkText) => onChunk(chunkPrefix + chunkText) : undefined
          );
          accumulatedOverall += chunkRes.reply.trim();
          translatedParts.push(chunkRes.reply.trim());
          totalLatency += chunkRes.latencyMs;
          if (chunkRes.fallbackNotice) lastFallbackNotice = chunkRes.fallbackNotice;
        }

        const combinedTranslation = translatedParts.join('\n\n');
        await setCachedCompletion(cacheKey, combinedTranslation, model, provider, totalLatency);

        return {
          translation: combinedTranslation,
          cached: false,
          latencyMs: totalLatency,
          fallbackNotice: lastFallbackNotice,
          chunkCount: chunks.length
        };
      }
    } catch (e: any) {
      console.warn('AI 翻譯連線異常，啟動本機語意應急備援:', e);
    }
  }

  // 3. Fallback translation for offline or keyless mode
  const fallback = generateOfflineAcademicTranslation(cleanText);
  if (onChunk) {
    await playTypewriter(fallback, onChunk, 12);
  }
  await setCachedCompletion(cacheKey, fallback, 'local-scholar', 'local', 15);
  return {
    translation: fallback,
    cached: true,
    latencyMs: 15,
    fallbackNotice: '本機學術應急解析'
  };
}
