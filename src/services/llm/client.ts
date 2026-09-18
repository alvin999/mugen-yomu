import type { ChatMessage, ChatCompletionResult } from './types';
import { getCachedCompletion, setCachedCompletion, generateCacheKey } from '../cacheService';
import { playTypewriter } from '../../utils/typewriter';

export const SCHOLAR_SYSTEM_PROMPT = `你是 MUGEN YOMU (無限閱讀) 內建的頂尖學術伴讀導師。
你的核心使命是「輔助讀者親自讀完並透徹理解文獻」，在閱讀第一現場即時掃除理解阻力與批判性質疑。
請務必恪守以下學術伴讀準則：
1. 【語系與術語規範】：一律使用正體/繁體中文（Traditional Chinese），採用台灣繁體技術術語（例如：記憶體、演算法、執行緒、矩陣、粉餅、流速、壓實、通道效應）。
2. 【證據鏈優先原則 (Evidence-First Grounding)】：
   - 當讀者針對當前段落的實驗設定、條件變因、數據、控制組或論點提問時，你必須【第一時間引述原文關鍵句】作答。
   - 引用原文時請採用獨立引言區塊：> 「原文：...」（附繁體中文精確語意），明確向讀者指出內文「有正面記載」或「未記載/未受控（were not reported）」。
   - 嚴格切分【原文明確記載的事實】與【基於領域知識的外推機制推論】，絕不含糊泛論，切忌無中生有。
3. 【引文動機與批判拆解 (Citation Deconstruction)】：
   - 當段落中出現文獻引註（如 [N]、[22, 23] 等）時，主動剖析作者在此處引用該文獻的目的（例如：指出前人實驗的反常現象、點出方法學缺陷、作為對照基準、或借鑑微觀流動假說）。
4. 【直截了當的科學與工程直覺】：
   - 解釋本質機制（例如變壓引發粉餅孔隙結構改變與水流非均勻性），避免空洞教科書廢話。
   - 若涉及公式，標註關鍵變數意涵與物理直覺。
5. 【風格與語氣】：嚴謹沉靜、具學術批判思維，循循善誘，適時引導讀者發現論文論證的邊界與實驗限制。`;

/**
 * 通用 SSE (Server-Sent Events) 串流解析器
 */
async function streamOpenAICompatible(
  response: Response,
  onChunk?: (accumulatedText: string) => void
): Promise<string> {
  if (!response.body) {
    const json = await response.json();
    const text = json.choices?.[0]?.message?.content || '';
    if (onChunk) onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') break;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              if (onChunk) onChunk(accumulated);
            }
          } catch {
            // 忽略未成形的不完整 JSON
          }
        }
      }
    }
  } catch (err) {
    console.warn('Stream reading exception:', err);
  }

  if (onChunk && accumulated) onChunk(accumulated);
  return accumulated;
}

/**
 * 智慧上下文修剪與滑動窗口保護器 (Token Guard)
 */
export function pruneChatMessages(messages: ChatMessage[], maxTotalChars: number = 2200): ChatMessage[] {
  if (!messages || messages.length === 0) return [];
  const last = messages[messages.length - 1];
  let budget = maxTotalChars - last.content.length;
  if (budget <= 150) {
    return [{
      role: last.role,
      content: last.content.slice(0, Math.max(100, maxTotalChars - 50)) + '... (已自動精簡長度)'
    }];
  }

  const preserved: ChatMessage[] = [last];
  for (let i = messages.length - 2; i >= 0; i--) {
    const msg = messages[i];
    if (budget <= 150) break;
    if (msg.content.length <= budget) {
      preserved.unshift(msg);
      budget -= msg.content.length;
    } else {
      preserved.unshift({
        role: msg.role,
        content: msg.content.slice(0, budget) + '... (對話歷史已精簡)'
      });
      break;
    }
  }
  return preserved;
}

export async function callGroqChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile',
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const pruned = pruneChatMessages(messages, 2200);
  const conversation = [{ role: 'system', content: SCHOLAR_SYSTEM_PROMPT }, ...pruned];

  const is70B = (model || '').includes('70b');
  const maxTokens = is70B ? 550 : 800;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      messages: conversation,
      temperature: 0.3,
      max_tokens: maxTokens,
      stream: !!onChunk
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API 請求失敗 (${response.status}): ${errorText}`);
  }

  let reply = '';
  if (onChunk && response.body) {
    reply = await streamOpenAICompatible(response, onChunk);
  } else {
    const json = await response.json();
    reply = json.choices?.[0]?.message?.content || '未獲得模型有效回覆。';
  }

  return { reply, latencyMs, model: model || 'llama-3.3-70b-versatile', provider: 'groq' };
}

export async function callOpenAIChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'gpt-4o',
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const conversation = [{ role: 'system', content: SCHOLAR_SYSTEM_PROMPT }, ...messages];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: conversation,
      temperature: 0.3,
      stream: !!onChunk
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API 請求失敗 (${response.status}): ${errText}`);
  }

  let reply = '';
  if (onChunk && response.body) {
    reply = await streamOpenAICompatible(response, onChunk);
  } else {
    const json = await response.json();
    reply = json.choices?.[0]?.message?.content || '未獲得模型有效回覆。';
  }

  return { reply, latencyMs, model: model || 'gpt-4o', provider: 'openai' };
}

export async function callDeepSeekChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'deepseek-chat',
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const conversation = [{ role: 'system', content: SCHOLAR_SYSTEM_PROMPT }, ...messages];

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: conversation,
      temperature: 0.3,
      stream: !!onChunk
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 請求失敗 (${response.status}): ${errText}`);
  }

  let reply = '';
  if (onChunk && response.body) {
    reply = await streamOpenAICompatible(response, onChunk);
  } else {
    const json = await response.json();
    reply = json.choices?.[0]?.message?.content || '未獲得模型有效回覆。';
  }

  return { reply, latencyMs, model: model || 'deepseek-chat', provider: 'deepseek' };
}

export async function callAnthropicChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'claude-3-5-sonnet-20241022'
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const promptMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      system: SCHOLAR_SYSTEM_PROMPT,
      messages: promptMessages,
      max_tokens: 1500,
      temperature: 0.3
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API 請求失敗 (${response.status}): ${errText}`);
  }
  const json = await response.json();
  const reply = json.content?.[0]?.text || '未獲得模型有效回覆。';

  return { reply, latencyMs, model: model || 'claude-3-5-sonnet-20241022', provider: 'anthropic' };
}

export async function callGeminiChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'gemini-1.5-flash'
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const targetModel = (model || 'gemini-1.5-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey.trim()}`;

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SCHOLAR_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 請求失敗 (${response.status}): ${errText}`);
  }
  const json = await response.json();
  const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || '未獲得模型有效回覆。';

  return { reply, latencyMs, model: targetModel, provider: 'google' };
}

export async function callOllamaChat(
  messages: ChatMessage[],
  ollamaUrl: string = 'http://localhost:11434',
  model: string = 'llama3.3:70b'
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const endpoint = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3.3:70b',
      messages: [{ role: 'system', content: SCHOLAR_SYSTEM_PROMPT }, ...messages],
      stream: false
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API 請求失敗 (${response.status}): ${errText}`);
  }
  const json = await response.json();
  const reply = json.message?.content || '未獲得模型有效回覆。';

  return { reply, latencyMs, model: model || 'llama3.3:70b', provider: 'ollama' };
}

export async function callProviderChat(
  provider: string,
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  ollamaUrl?: string,
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult> {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const cacheKey = generateCacheKey(provider, model, lastUserMsg);

  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    if (onChunk) {
      await playTypewriter(cached.reply, onChunk, 10);
    }
    return {
      reply: cached.reply,
      latencyMs: 12,
      model: cached.model,
      provider: cached.provider,
      cached: true
    };
  }

  let result: ChatCompletionResult;
  switch (provider) {
    case 'openai':
      result = await callOpenAIChat(messages, apiKey, model, onChunk);
      break;
    case 'anthropic':
      result = await callAnthropicChat(messages, apiKey, model);
      if (onChunk) await playTypewriter(result.reply, onChunk, 12);
      break;
    case 'google':
      result = await callGeminiChat(messages, apiKey, model);
      if (onChunk) await playTypewriter(result.reply, onChunk, 12);
      break;
    case 'deepseek':
      result = await callDeepSeekChat(messages, apiKey, model, onChunk);
      break;
    case 'ollama':
      result = await callOllamaChat(messages, ollamaUrl, model);
      if (onChunk) await playTypewriter(result.reply, onChunk, 12);
      break;
    case 'groq':
    default:
      result = await callGroqChat(messages, apiKey, model, onChunk);
      break;
  }

  await setCachedCompletion(cacheKey, result.reply, result.model, result.provider, result.latencyMs);

  return result;
}

export const PROVIDER_FALLBACK_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b': 'llama-3.1-8b-instant',
  'gpt-4o': 'gpt-4o-mini',
  'o1-mini': 'gpt-4o-mini',
  'claude-3-5-sonnet-20241022': 'claude-3-5-haiku-20241022',
  'gemini-1.5-pro': 'gemini-1.5-flash',
  'gemini-2.0-flash': 'gemini-1.5-flash'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRateLimitError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const status = err?.status || 0;
  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('tokens per minute') ||
    msg.includes('tpm') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('server busy')
  );
}

function isModelNotFoundError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('model_not_found') ||
    msg.includes('does not exist') ||
    msg.includes('do not have access') ||
    msg.includes('model not found') ||
    msg.includes('404')
  );
}

export function splitTextIntoChunks(text: string, maxWords: number = 450): string[] {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let count = 0;

  for (const w of words) {
    currentChunk.push(w);
    count++;
    if (count >= maxWords && (w.endsWith('.') || w.endsWith('!') || w.endsWith('?'))) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
      count = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * 帶有指數退避與自動同源模型降級的韌性呼叫器 (Resilient Chat Invoker)
 */
export async function callProviderChatWithResilience(
  provider: string,
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  ollamaUrl?: string,
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult & { fallbackNotice?: string }> {
  const safeMessages = pruneChatMessages(messages, provider === 'groq' ? 2200 : 4000);

  try {
    return await callProviderChat(provider, safeMessages, apiKey, model, ollamaUrl, onChunk);
  } catch (err: any) {
    const isRateLimit = isRateLimitError(err);
    const isNotFound = isModelNotFoundError(err);

    if (isRateLimit || isNotFound) {
      const reason = isNotFound ? '模型不存在或無權限 (404)' : '頻率/負載限制 (429/503)';
      console.warn(`[AI 韌性防護] ${model} 遭遇 ${reason}，啟動同源降級與備援機制...`);

      const fallbackModel = PROVIDER_FALLBACK_MAP[model] || (provider === 'groq' ? 'llama-3.1-8b-instant' : (provider === 'google' ? 'gemini-1.5-flash' : ''));
      if (fallbackModel && fallbackModel !== model) {
        try {
          await delay(600);
          const fallbackRes = await callProviderChat(provider, safeMessages, apiKey, fallbackModel, ollamaUrl, onChunk);
          return {
            ...fallbackRes,
            fallbackNotice: `因 ${model.includes('70b') ? '70B (6k TPM)' : model} 頻率限制，已自動降級為 ${fallbackModel.includes('8b') ? '8B-Instant (20k TPM)' : fallbackModel} 應急推論`
          };
        } catch (fbErr: any) {
          console.warn(`[AI 韌性防護] 降級模型 ${fallbackModel} 亦失敗:`, fbErr);
        }
      }

      try {
        await delay(1200);
        return await callProviderChat(provider, safeMessages, apiKey, fallbackModel || model, ollamaUrl, onChunk);
      } catch (retryErr: any) {
        console.warn(`[AI 韌性防護] 重試未果:`, retryErr);
      }
    }
    throw err;
  }
}
