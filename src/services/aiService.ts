// AI Service Layer for MUGEN YOMU (Groq LPU & Multi-Provider Support)
// Facade 整合入口：轉發 LLM 型別、模型列表、客戶端調度、學術翻譯與認知推論服務。

// 1. 導出核心型別
export type {
  ProviderModelItem,
  ChatMessage,
  ChatCompletionResult
} from './llm/types';

// 2. 導出模型列表與名稱格式化
export {
  FALLBACK_MODELS,
  formatModelDisplayName,
  fetchGroqModels,
  fetchOpenAIModels,
  fetchAnthropicModels,
  fetchGeminiModels,
  fetchOllamaModels,
  fetchProviderModels
} from './llm/models';

// 3. 導出打字機效果純函式
export { playTypewriter } from '../utils/typewriter';

// 4. 導出底層 LLM 呼叫與韌性容錯客戶端
export {
  SCHOLAR_SYSTEM_PROMPT,
  pruneChatMessages,
  callGroqChat,
  callOpenAIChat,
  callDeepSeekChat,
  callAnthropicChat,
  callGeminiChat,
  callOllamaChat,
  callProviderChat,
  PROVIDER_FALLBACK_MAP,
  splitTextIntoChunks,
  callProviderChatWithResilience
} from './llm/client';

// 5. 導出學術翻譯服務
export type { AcademicTranslationResult } from './academicTranslationService';
export {
  translateAcademicText,
  generateOfflineAcademicTranslation
} from './academicTranslationService';

// 6. 導出認知伴讀三大服務 (直覺、長難句拆解、術語對齊)
export type {
  ScientificIntuitionResult,
  SyntaxTreeResult,
  TerminologyItem,
  TerminologyResult
} from './cognitiveService';

export {
  safeParseJsonFromLLM,
  generateScientificIntuition,
  generateSentenceDeconstruction,
  generateTerminologyAlignment
} from './cognitiveService';

// 7. 導出論文核心雙語摘要服務
export type { AbstractCoreResult } from './abstractAiService';
export { generatePaperAbstractCore } from './abstractAiService';

// 8. 導出配置與金鑰存取工具
export type { AiClientConfig } from './cognitiveDispatcher';
export { getStoredApiKey, getStoredAiConfig } from './cognitiveDispatcher';
