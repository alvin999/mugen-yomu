import type { ProviderModelItem } from './types';

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
