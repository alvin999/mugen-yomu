export interface ProviderModelItem {
  id: string;
  name: string;
}

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
