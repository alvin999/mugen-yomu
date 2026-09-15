// AI Service Layer for MUGEN YOMU (Groq LPU & Multi-Provider Support)
// Inspired by cafe-prism auto-fetch models architecture

export interface ProviderModelItem {
  id: string;
  name: string;
}

export const FALLBACK_MODELS: Record<string, ProviderModelItem[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (高品質推論 · 推薦)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (極致低延遲 700+ tps)' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (思維鏈推導)' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32k 長上下文)' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Google 開源)' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni 全能旗艦)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (極速輕量)' },
    { id: 'o1-mini', name: 'o1 Mini (數理推理專精)' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (學術理解頂峰)' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (輕量迅速)' }
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (百萬 Token 長上下文)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速回應)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (新世代架構)' }
  ],
  deepseek: [
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度推理思維鏈)' },
    { id: 'deepseek-chat', name: 'DeepSeek V3 (通用大模型)' }
  ],
  ollama: [
    { id: 'llama3.3:70b', name: 'Llama 3.3 70B (本機部署)' },
    { id: 'deepseek-r1:70b', name: 'DeepSeek R1 70B (本機思維鏈)' },
    { id: 'qwen2.5:72b', name: 'Qwen 2.5 72B (本機中文強項)' }
  ]
};

/**
 * 格式化模型名稱為簡潔之顯示標籤 (適用於頂部狀態橫條)
 */
export function formatModelDisplayName(provider: string, model: string): string {
  if (!provider && !model) return 'Groq (Llama 3.3 70B)';
  const p = (provider || 'groq').toLowerCase();
  const m = model || 'llama-3.3-70b-versatile';

  // 1. 優先比對 FALLBACK_MODELS 清單之友好標籤
  const found = FALLBACK_MODELS[p]?.find(item => item.id === m);
  if (found) {
    const cleanName = found.name.replace(/\s*\([^)]*\)$/, '').trim();
    if (p === 'groq') return cleanName.startsWith('Groq') ? cleanName : `Groq (${cleanName})`;
    if (p === 'openai') return cleanName.startsWith('OpenAI') ? cleanName : `OpenAI (${cleanName})`;
    if (p === 'anthropic') return cleanName.startsWith('Claude') ? cleanName : `Claude (${cleanName})`;
    if (p === 'google') return cleanName.startsWith('Gemini') ? cleanName : `Gemini (${cleanName})`;
    if (p === 'deepseek') return cleanName.startsWith('DeepSeek') ? cleanName : `DeepSeek (${cleanName})`;
    if (p === 'ollama') return cleanName.startsWith('Ollama') ? cleanName : `Ollama (${cleanName})`;
    return cleanName;
  }

  // 2. 動態拉取或自訂模型之退避精簡格式化
  if (p === 'groq') {
    return `Groq (${m.replace(/^llama-?/i, 'Llama-').slice(0, 16)})`;
  }
  if (p === 'google') {
    const clean = m.replace(/^models\//, '').replace(/^gemini-?/i, 'Gemini ');
    return clean.length > 18 ? clean.slice(0, 18) : clean;
  }
  if (p === 'anthropic') {
    if (m.includes('sonnet')) return 'Claude 3.5 Sonnet';
    if (m.includes('haiku')) return 'Claude 3.5 Haiku';
    return `Claude (${m.slice(0, 14)})`;
  }
  if (p === 'openai') {
    return `OpenAI (${m.slice(0, 14)})`;
  }
  if (p === 'deepseek') {
    return `DeepSeek (${m.slice(0, 14)})`;
  }
  if (p === 'ollama') {
    return `Ollama (${m.split(':')[0].slice(0, 14)})`;
  }
  return `${p.toUpperCase()} (${m.slice(0, 12)})`;
}

// -------------------------------------------------------------
// 1. 自動讀取模型函式 (Auto Fetch Models)
// -------------------------------------------------------------

export async function fetchGroqModels(apiKey: string): Promise<ProviderModelItem[]> {
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!r.ok) throw new Error(`Groq API 錯誤 (${r.status})`);
  const d = await r.json();
  return (d.data || [])
    .filter((m: any) => !m.id.includes('whisper') && !m.id.includes('vision') && !m.id.includes('audio'))
    .sort((a: any, b: any) => a.id.localeCompare(b.id))
    .map((m: any) => ({ id: m.id, name: m.id }));
}

export async function fetchOpenAIModels(apiKey: string): Promise<ProviderModelItem[]> {
  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!r.ok) throw new Error(`OpenAI API 錯誤 (${r.status})`);
  const d = await r.json();
  return (d.data || [])
    .filter((m: any) => (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')) &&
      !m.id.includes('instruct') && !m.id.includes('realtime') && !m.id.includes('audio'))
    .sort((a: any, b: any) => a.id.localeCompare(b.id))
    .map((m: any) => ({ id: m.id, name: m.id }));
}

export async function fetchAnthropicModels(apiKey: string): Promise<ProviderModelItem[]> {
  const r = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }
  });
  if (!r.ok) throw new Error(`Anthropic API 錯誤 (${r.status})`);
  const d = await r.json();
  return (d.data || []).map((m: any) => ({ id: m.id, name: m.display_name || m.id }));
}

export async function fetchGeminiModels(apiKey: string): Promise<ProviderModelItem[]> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!r.ok) throw new Error(`Gemini API 錯誤 (${r.status})`);
  const d = await r.json();
  return (d.models || [])
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
    .map((m: any) => {
      const id = m.name.replace(/^models\//, '');
      return { id, name: m.displayName || id };
    });
}

export async function fetchOllamaModels(ollamaUrl: string = 'http://localhost:11434'): Promise<ProviderModelItem[]> {
  const endpoint = `${ollamaUrl.replace(/\/$/, '')}/api/tags`;
  const r = await fetch(endpoint);
  if (!r.ok) throw new Error('無法連線至本地 Ollama 實例');
  const d = await r.json();
  return (d.models || []).map((m: any) => ({ id: m.name, name: m.name }));
}

export async function fetchProviderModels(
  provider: string,
  apiKey: string,
  ollamaUrl?: string
): Promise<ProviderModelItem[]> {
  if (provider === 'ollama') {
    return fetchOllamaModels(ollamaUrl);
  }
  if (!apiKey || apiKey.trim().length < 5) {
    return FALLBACK_MODELS[provider] || [];
  }

  switch (provider) {
    case 'groq':
      return fetchGroqModels(apiKey.trim());
    case 'openai':
      return fetchOpenAIModels(apiKey.trim());
    case 'anthropic':
      return fetchAnthropicModels(apiKey.trim());
    case 'google':
      return fetchGeminiModels(apiKey.trim());
    default:
      return FALLBACK_MODELS[provider] || [];
  }
}

// -------------------------------------------------------------
// 2. LLM 推論呼叫服務 (Multi-Provider Chat & IndexedDB Cache)
// -------------------------------------------------------------

import { getCachedCompletion, setCachedCompletion, generateCacheKey } from './cacheService';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  reply: string;
  latencyMs: number;
  model: string;
  provider: string;
  cached?: boolean;
}

export const SCHOLAR_SYSTEM_PROMPT = `你是 MUGEN YOMU (無限閱讀) 內建的頂尖學術伴讀導師。
你的任務是輔助讀者精讀專業科學文獻與前沿技術報告。
請務必遵守以下規範：
1. 一律使用正體/繁體中文（Traditional Chinese），採用台灣繁體技術術語（例如：記憶體、演算法、執行緒、矩陣、向量）。
2. 針對使用者的理論疑問、數學推導或長難句，以直截了當、富有物理或工程直覺的語言解析本質，避免空洞冗詞。
3. 若涉及公式，使用簡明格式標註關鍵變數意涵。
4. 語氣嚴謹沉靜、循循善誘，適時指出論證背後的限制或設計權衡。`;

/**
 * 通用 SSE (Server-Sent Events) 串流解析器
 * 適用於 Groq, OpenAI, DeepSeek 等相容 OpenAI 格式之端點
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
 * 平滑打字機產生器
 * 針對快取、離線 fallback 或非串流端點，以自然擬真的節奏逐字輸出
 */
export async function playTypewriter(
  fullText: string,
  onChunk: (currentText: string) => void,
  speedMs: number = 12
): Promise<void> {
  const chars = Array.from(fullText);
  let current = '';
  const step = chars.length > 250 ? 3 : (chars.length > 100 ? 2 : 1);
  for (let i = 0; i < chars.length; i += step) {
    current += chars.slice(i, i + step).join('');
    onChunk(current);
    await new Promise(r => setTimeout(r, speedMs));
  }
  onChunk(fullText);
}

export async function callGroqChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile',
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult> {
  const startTime = performance.now();
  const conversation = [{ role: 'system', content: SCHOLAR_SYSTEM_PROMPT }, ...messages];

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
      max_tokens: 1200,
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

  // 1. Check IndexedDB cache first
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

  // 2. Call live API based on provider
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

  // 3. Write back to IndexedDB cache
  await setCachedCompletion(cacheKey, result.reply, result.model, result.provider, result.latencyMs);

  return result;
}

// -------------------------------------------------------------
// 3. 模型同源降級映射與智慧長文本分塊 (Fallback Map & Smart Chunking)
// -------------------------------------------------------------

export const PROVIDER_FALLBACK_MAP: Record<string, string> = {
  // Groq 70B (6k TPM) -> 8B Instant (20k TPM, 700+ tps)
  'llama-3.3-70b-versatile': 'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b': 'llama-3.1-8b-instant',
  // OpenAI 旗艦 -> mini
  'gpt-4o': 'gpt-4o-mini',
  'o1-mini': 'gpt-4o-mini',
  // Claude Sonnet -> Haiku
  'claude-3-5-sonnet-20241022': 'claude-3-5-haiku-20241022',
  // Gemini Pro -> Flash
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

/**
 * 智慧語意斷句分塊器
 * 將長篇大段依據句點、換行自然切分為 <= maxWords 的子區塊，避免單句硬生生截斷
 */
export function splitTextIntoChunks(text: string, maxWords: number = 450): string[] {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) {
    return [trimmed];
  }

  // 依據句點、驚嘆號、問號或段落換行自然拆分
  const sentences = trimmed.match(/[^.!?\n]+[.!?\n]+/g) || [trimmed];
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;
    if (currentWordCount + sentenceWords > maxWords && currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentWordCount = sentenceWords;
    } else {
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence.trim();
      currentWordCount += sentenceWords;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * 帶有指數退避與自動同源模型降級的韌性呼叫器
 */
export async function callProviderChatWithResilience(
  provider: string,
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  ollamaUrl?: string,
  onChunk?: (text: string) => void
): Promise<ChatCompletionResult & { fallbackNotice?: string }> {
  try {
    return await callProviderChat(provider, messages, apiKey, model, ollamaUrl, onChunk);
  } catch (err: any) {
    if (isRateLimitError(err)) {
      console.warn(`[AI 韌性防護] ${model} 觸發速率或負載限制 (429/503)，啟動 1.5 秒退避緩衝...`);
      await delay(1500);
      try {
        return await callProviderChat(provider, messages, apiKey, model, ollamaUrl, onChunk);
      } catch (retryErr: any) {
        console.warn(`[AI 韌性防護] 重試未果，檢查同源輕量降級模型...`);
      }

      // 同源降級嘗試（如 70B 降級至 8B）
      const fallbackModel = PROVIDER_FALLBACK_MAP[model];
      if (fallbackModel && fallbackModel !== model) {
        console.warn(`[AI 韌性防護] 自動由 ${model} 降級切換至高頻寬模型 ${fallbackModel}...`);
        const fallbackRes = await callProviderChat(provider, messages, apiKey, fallbackModel, ollamaUrl, onChunk);
        return {
          ...fallbackRes,
          fallbackNotice: `因 ${model.includes('70b') ? '70B' : model} 頻率限制，已自動切換 ${fallbackModel.includes('8b') ? '8B-Instant' : fallbackModel} 應急`
        };
      }
    }
    throw err;
  }
}

// -------------------------------------------------------------
// 4. 學術論文專業繁體中文翻譯服務 (Academic Translation Service)
// -------------------------------------------------------------

export interface AcademicTranslationResult {
  translation: string;
  cached: boolean;
  latencyMs: number;
  fallbackNotice?: string;
  chunkCount?: number;
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
        // 寫入本機快取
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

// -------------------------------------------------------------
// 5. 認知伴讀三大核心服務: 白話直覺、長難句拆解、學術術語對齊
// -------------------------------------------------------------

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

  console.warn('[aiService] safeParseJsonFromLLM 解析失敗，採用本機範本備援。原始字串:', rawText.slice(0, 120));
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

  // 檢查本機快取
  const cached = await getCachedCompletion(cacheKey);
  if (cached) {
    const parsed = safeParseJsonFromLLM<ScientificIntuitionResult | null>(cached.reply, null);
    if (parsed && parsed.title && parsed.content) {
      return { ...parsed, cached: true };
    }
  }

  // 若具備 Key 或本機 Ollama 則發起 AI 請求
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

      // 存入本機快取
      await setCachedCompletion(cacheKey, JSON.stringify(parsed), model, provider, res.latencyMs);
      return { ...parsed, cached: false };
    } catch (err) {
      console.warn('[aiService] 直覺生成連線異常，啟動本機備援:', err);
    }
  }

  // 本地離線備援
  const fallback = getFallbackIntuition(sectionTitle);
  await setCachedCompletion(cacheKey, JSON.stringify(fallback), 'local-scholar', 'local', 10);
  return { ...fallback, cached: true };
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

  // 檢查快取
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
      console.warn('[aiService] 句構拆解連線異常，啟動本機備援:', err);
    }
  }

  const fallback = getFallbackSyntaxTree(cleanSnippet, sectionTitle);
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
      console.warn('[aiService] 術語對齊連線異常，啟動本機備援:', err);
    }
  }

  const fallback = getFallbackTerminology(sectionTitle);
  await setCachedCompletion(cacheKey, JSON.stringify(fallback), 'local-scholar', 'local', 10);
  return { terms: fallback, cached: true };
}

function getFallbackTerminology(sectionTitle: string): TerminologyItem[] {
  const baseTerm = sectionTitle.split(' ').slice(0, 2).join(' ') || 'Core Concept';
  return [
    { term: baseTerm, zh: '核心概念', explanation: '本章節核心技術概念與推論立論基礎', color: '#fabd2f' },
    { term: 'Orthogonal Projection', zh: '正交投影', explanation: '消除維度間相關冗餘，穩定特徵表徵空間', color: '#8ec07c' },
    { term: 'Numerical Stability', zh: '數值穩定性', explanation: '防止反向傳播時數值上溢或梯度擴散', color: '#fe8019' }
  ];
}
