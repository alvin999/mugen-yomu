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

import { cleanPaperText } from '../utils/paperTextSanitizer';

export async function translateAcademicText(
  text: string,
  provider: string = 'groq',
  apiKey: string = '',
  model: string = 'llama-3.3-70b-versatile',
  ollamaUrl?: string,
  onChunk?: (currentStreamText: string) => void,
  bypassCache: boolean = false
): Promise<AcademicTranslationResult> {
  const cleanText = cleanPaperText(text.trim());
  const cacheKey = generateCacheKey(provider || 'cache', model || 'translator', 'translate:' + cleanText);

  // 1. Check IndexedDB cache (若未要求繞過快取)
  if (!bypassCache) {
    const cached = await getCachedCompletion(cacheKey);
    // 檢查快取品質：若快取中是離線備援假譯文、失敗報錯或模型無回覆，則作廢該快取
    const isInvalidFallback = cached && (
      !cached.reply ||
      cached.reply.trim() === '' ||
      cached.reply.startsWith('Error:') ||
      cached.reply.includes('unexpected EOF') ||
      cached.reply.includes('stream reading error') ||
      cached.reply.includes('The model is currently unreachable') ||
      cached.reply.includes('請於右上方設定自備金鑰') ||
      cached.reply.includes('[原文譯意]') ||
      cached.reply.includes('本機學術應急解析') ||
      cached.reply.includes('[翻譯服務連線異常]') ||
      cached.reply.includes('未獲得模型有效回覆')
    );

    if (cached && !isInvalidFallback) {
      if (onChunk) {
        await playTypewriter(cached.reply, onChunk, 10);
      }
      return {
        translation: cached.reply,
        cached: true,
        latencyMs: 8
      };
    }
  }

  const cleanKey = (apiKey || '').trim();
  const hasValidKey = (cleanKey.length > 5) || provider === 'ollama';

  console.info(`[AcademicTranslation] 準備翻譯. Provider: ${provider}, Model: ${model}, 有效金鑰: ${hasValidKey} (Key 長度: ${cleanKey.length}), BypassCache: ${bypassCache}`);

  // 2. Call AI Provider if key or ollama is configured
  if ((apiKey && apiKey.trim().length > 5) || provider === 'ollama') {
    const translationSystemPrompt = `你是專精於頂尖科學與工程論文的學術翻譯家。
請將使用者提供的英文論文段落精確翻譯為台灣正體/繁體中文（Traditional Chinese）。
務必遵守以下學術規範：
1. 嚴格採用台灣資訊科技與數學通用術語（如：矩陣、向量、自注意力機制、記憶體、演算法、執行緒、維度、數值梯度、快取）。
2. 保留原文的邏輯因果關係、學術嚴謹度與流暢語感，不要添加任何主觀解說、前後綴問候或引號標籤。
3. 直接輸出正體中文譯文。`;

    const chunks = splitTextIntoChunks(cleanText, 300);

    let errorNotice: string | null = null;
    try {
      if (chunks.length === 1) {
        // 單塊標準呼叫
        const messages: ChatMessage[] = [
          { role: 'system', content: translationSystemPrompt },
          { role: 'user', content: chunks[0] }
        ];
        const res = await callProviderChatWithResilience(provider, messages, apiKey, model, ollamaUrl, onChunk, bypassCache);
        if (res.reply && !res.reply.includes('未獲得模型有效回覆') && !res.reply.includes('[翻譯服務連線異常]')) {
          await setCachedCompletion(cacheKey, res.reply.trim(), model, provider, res.latencyMs);
        }
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
            onChunk ? (chunkText) => onChunk(chunkPrefix + chunkText) : undefined,
            bypassCache
          );
          accumulatedOverall += chunkRes.reply.trim();
          translatedParts.push(chunkRes.reply.trim());
          totalLatency += chunkRes.latencyMs;
          if (chunkRes.fallbackNotice) lastFallbackNotice = chunkRes.fallbackNotice;
        }

        const combinedTranslation = translatedParts.join('\n\n');
        if (combinedTranslation && !combinedTranslation.includes('未獲得模型有效回覆') && !combinedTranslation.includes('[翻譯服務連線異常]')) {
          await setCachedCompletion(cacheKey, combinedTranslation, model, provider, totalLatency);
        }

        return {
          translation: combinedTranslation,
          cached: false,
          latencyMs: totalLatency,
          fallbackNotice: lastFallbackNotice,
          chunkCount: chunks.length
        };
      }
    } catch (e: any) {
      console.warn('AI 翻譯連線異常:', e);
      errorNotice = e?.message || '連線逾時或端點無回應';
    }

    if (errorNotice) {
      const displayErr = `[翻譯服務連線異常]：${errorNotice}。請檢查網路或於右上角重新確認金鑰與模型設定。`;
      if (onChunk) {
        await playTypewriter(displayErr, onChunk, 12);
      }
      return {
        translation: displayErr,
        cached: false,
        latencyMs: 30,
        fallbackNotice: `連線失敗: ${errorNotice.slice(0, 35)}`
      };
    }
  }

  // 3. Fallback translation for offline or keyless mode
  const fallback = generateOfflineAcademicTranslation(cleanText);
  if (onChunk) {
    await playTypewriter(fallback, onChunk, 12);
  }
  return {
    translation: fallback,
    cached: false,
    latencyMs: 15,
    fallbackNotice: '尚未設定 API 金鑰，此為本機應急導讀'
  };
}
