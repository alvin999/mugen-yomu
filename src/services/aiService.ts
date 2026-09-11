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
// 2. LLM 推論呼叫服務 (Groq LPU & General Chat)
// -------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  reply: string;
  latencyMs: number;
  model: string;
  provider: string;
}

const SCHOLAR_SYSTEM_PROMPT = `你是 MUGEN YOMU (無限閱讀) 內建的頂尖學術伴讀導師。
你的任務是輔助讀者精讀專業科學文獻與前沿技術報告。
請務必遵守以下規範：
1. 一律使用正體/繁體中文（Traditional Chinese），採用台灣繁體技術術語（例如：記憶體、演算法、執行緒、矩陣、向量）。
2. 針對使用者的理論疑問、數學推導或長難句，以直截了當、富有物理或工程直覺的語言解析本質，避免空洞冗詞。
3. 若涉及公式，使用簡明格式標註關鍵變數意涵。
4. 語氣嚴謹沉靜、循循善誘，適時指出論證背後的限制或設計權衡。`;

export async function callGroqChat(
  messages: ChatMessage[],
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile'
): Promise<ChatCompletionResult> {
  const startTime = performance.now();

  const conversation = [
    { role: 'system', content: SCHOLAR_SYSTEM_PROMPT },
    ...messages
  ];

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
      max_tokens: 1200
    })
  });

  const latencyMs = Math.round(performance.now() - startTime);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API 請求失敗 (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const reply = json.choices?.[0]?.message?.content || '未獲得模型有效回覆。';

  return {
    reply,
    latencyMs,
    model: model || 'llama-3.3-70b-versatile',
    provider: 'groq'
  };
}
