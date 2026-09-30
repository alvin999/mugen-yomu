/**
 * @file hybridEmbeddingService.ts
 * @description 混合向量嵌入與語意檢索調度核心
 * 優先走雲端 BYOK API (Gemini / OpenAI)，無金鑰或使用者手動指定時無縫切換為端側純離線 ONNX
 */

import type {
  EmbeddingEnginePreference,
  ActiveEmbeddingProvider,
  ParagraphChunk,
  IndexedEmbeddingRecord,
  SemanticSearchResult,
  EmbeddingEngineStatus
} from './embeddingTypes';

export type {
  EmbeddingEnginePreference,
  ActiveEmbeddingProvider,
  ParagraphChunk,
  IndexedEmbeddingRecord,
  SemanticSearchResult,
  EmbeddingEngineStatus
};
import {
  saveEmbeddingsForPaper,
  getEmbeddingsForPaper,
  deleteEmbeddingsForPaper,
  simpleHash
} from './vectorStorageService';
import {
  fetchGeminiEmbedding,
  fetchGeminiBatchEmbeddings,
  fetchOpenAIEmbedding,
  fetchOpenAIBatchEmbeddings
} from './apiEmbeddingService';
import {
  fetchLocalEmbedding,
  fetchLocalBatchEmbeddings,
  cosineSimilarity
} from './localEmbeddingService';

const PREFERENCE_KEY = 'mugen_embedding_pref';

/**
 * 取得使用者的向量引擎偏好 (全面固定為端側 ONNX，開箱即用免金鑰)
 */
export function getEmbeddingPreference(): EmbeddingEnginePreference {
  return 'local-only';
}

/**
 * 設定向量引擎偏好
 */
export function setEmbeddingPreference(_pref: EmbeddingEnginePreference): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFERENCE_KEY, 'local-only');
  }
}

import { getStoredApiKeySync } from '../crypto/keyVaultService';

/**
 * 讀取本機儲存的 API Key (支援安全庫與歷史明文)
 */
function getSavedKey(provider: 'google' | 'openai'): string {
  if (typeof window === 'undefined') return '';
  const provKey = provider === 'google' ? 'gemini' : provider;
  const vaultKey = getStoredApiKeySync(provKey);
  if (vaultKey) return vaultKey;
  return (
    localStorage.getItem(`mugen_key_${provider}`) ||
    localStorage.getItem(`mugen_api_key_${provider}`) ||
    localStorage.getItem(`mugen_key_${provKey}`) ||
    localStorage.getItem(`mugen_api_key_${provKey}`) ||
    ''
  ).trim();
}

/**
 * 智慧解析當前作用中之向量提供者與維度 (固定為端側本機 ONNX 384-dim)
 */
export function resolveActiveProvider(): {
  provider: ActiveEmbeddingProvider;
  dimension: number;
  modelName: string;
  apiKey?: string;
} {
  return {
    provider: 'onnx',
    dimension: 384,
    modelName: 'all-MiniLM-L6-v2 (ONNX)'
  };
}

/**
 * 為整篇文獻的段落建立向量索引 (具備 IndexedDB 增量快取保護與自動降級)
 */
export async function indexPaperChunks(
  paperId: string,
  chunks: ParagraphChunk[],
  onProgress?: (indexed: number, total: number) => void
): Promise<IndexedEmbeddingRecord[]> {
  if (!paperId || !chunks || chunks.length === 0) return [];

  // 1. 取得現有快取
  const existing = await getEmbeddingsForPaper(paperId);
  const existingMap = new Map<string, IndexedEmbeddingRecord>();
  for (const item of existing) {
    existingMap.set(item.id, item);
  }

  // 2. 判斷需要補算向量的段落
  let active = resolveActiveProvider();
  const chunksToCompute: ParagraphChunk[] = [];
  const validRecords: IndexedEmbeddingRecord[] = [];

  for (const chunk of chunks) {
    const chunkHash = chunk.hash || simpleHash(chunk.text);
    const cached = existingMap.get(chunk.id);

    // 若快取存在、雜湊相符且模型提供者維度一致，則沿用
    if (cached && cached.hash === chunkHash && cached.dimension === active.dimension) {
      validRecords.push(cached);
    } else {
      chunksToCompute.push({ ...chunk, hash: chunkHash });
    }
  }

  // 若全部都已有現成快取，直接回報並完成
  if (chunksToCompute.length === 0) {
    if (onProgress) onProgress(chunks.length, chunks.length);
    return validRecords;
  }

  // 3. 呼叫對應引擎批次生成向量 (若 API 失敗則自動無縫平滑降級為端側 ONNX)
  const texts = chunksToCompute.map((c) => c.text);
  let computedEmbeddings: number[][] = [];

  try {
    if (active.provider === 'gemini' && active.apiKey) {
      computedEmbeddings = await fetchGeminiBatchEmbeddings(texts, active.apiKey, (done, total) => {
        if (onProgress) onProgress(validRecords.length + done, chunks.length);
      });
    } else if (active.provider === 'openai' && active.apiKey) {
      computedEmbeddings = await fetchOpenAIBatchEmbeddings(texts, active.apiKey, (done, total) => {
        if (onProgress) onProgress(validRecords.length + done, chunks.length);
      });
    } else {
      computedEmbeddings = await fetchLocalBatchEmbeddings(texts, (done, total) => {
        if (onProgress) onProgress(validRecords.length + done, chunks.length);
      });
    }
  } catch (apiErr) {
    console.warn('[hybridEmbeddingService] API 向量化失敗，自動無感平滑降級為端側純本機 ONNX (384-dim):', apiErr);
    active = {
      provider: 'onnx',
      dimension: 384,
      modelName: 'all-MiniLM-L6-v2 (端側純離線)'
    };
    computedEmbeddings = await fetchLocalBatchEmbeddings(texts, (done, total) => {
      if (onProgress) onProgress(validRecords.length + done, chunks.length);
    });
  }

  // 4. 組裝新記錄並寫入 IndexedDB
  const newRecords: IndexedEmbeddingRecord[] = chunksToCompute.map((chunk, idx) => ({
    id: chunk.id,
    paperId,
    sectionId: chunk.sectionId,
    sectionTitle: chunk.sectionTitle,
    paragraphIndex: chunk.paragraphIndex,
    text: chunk.text,
    hash: chunk.hash || simpleHash(chunk.text),
    embedding: computedEmbeddings[idx] || [],
    dimension: computedEmbeddings[idx]?.length || active.dimension,
    provider: active.provider,
    model: active.modelName,
    createdAt: Date.now()
  }));

  await saveEmbeddingsForPaper(paperId, newRecords);

  const allRecords = [...validRecords, ...newRecords];
  if (onProgress) onProgress(allRecords.length, chunks.length);
  return allRecords;
}

/**
 * 清除特定文獻的舊向量快取，並完整重新建立索引 (Re-index)
 */
export async function reindexPaperChunks(
  paperId: string,
  chunks: ParagraphChunk[],
  onProgress?: (indexed: number, total: number) => void
): Promise<IndexedEmbeddingRecord[]> {
  if (!paperId || !chunks || chunks.length === 0) return [];
  await deleteEmbeddingsForPaper(paperId);
  return await indexPaperChunks(paperId, chunks, onProgress);
}

/**
 * 語意級向量檢索 (Semantic Search)
 */
export async function searchSemantic(
  paperId: string,
  query: string,
  topK: number = 5
): Promise<SemanticSearchResult[]> {
  const cleanQuery = query.trim();
  if (!paperId || !cleanQuery) return [];

  // 1. 取得文獻的所有段落向量
  const records = await getEmbeddingsForPaper(paperId);
  if (records.length === 0) return [];

  const targetDimension = records[0].dimension;
  const targetProvider = records[0].provider;

  // 2. 依據該文獻儲存向量的相同模型生成 query 向量
  let queryEmbedding: number[] = [];

  try {
    if (targetProvider === 'gemini') {
      const key = getSavedKey('google');
      if (key) {
        const res = await fetchGeminiEmbedding(cleanQuery, key);
        queryEmbedding = res.embedding;
      }
    } else if (targetProvider === 'openai') {
      const key = getSavedKey('openai');
      if (key) {
        const res = await fetchOpenAIEmbedding(cleanQuery, key);
        queryEmbedding = res.embedding;
      }
    }
  } catch (queryErr) {
    console.warn('[searchSemantic] API 向量計算失敗，降級為端側本機推論:', queryErr);
  }

  // 若 API 失敗或本機 ONNX 模式，則使用端側模型
  if (queryEmbedding.length === 0 || queryEmbedding.length !== targetDimension) {
    try {
      const res = await fetchLocalEmbedding(cleanQuery);
      queryEmbedding = res.embedding;
    } catch (localErr) {
      console.warn('[searchSemantic] 本地向量計算失敗:', localErr);
      return [];
    }
  }

  if (queryEmbedding.length === 0) return [];

  // 3. 計算餘弦相似度並排序
  const results: SemanticSearchResult[] = records
    .map((rec) => {
      const sim = cosineSimilarity(queryEmbedding, rec.embedding);
      return {
        id: rec.id,
        paperId: rec.paperId,
        sectionId: rec.sectionId,
        sectionTitle: rec.sectionTitle,
        paragraphIndex: rec.paragraphIndex,
        text: rec.text,
        similarity: sim,
        scorePercent: Math.round(Math.max(0, sim) * 100)
      };
    })
    .filter((item) => item.similarity >= 0.20)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}

/**
 * 從 ChapterSection 樹狀結構或陣列中提取段落 Chunks
 */
export function extractChunksFromSections(
  paperId: string,
  sections: any[]
): ParagraphChunk[] {
  const chunks: ParagraphChunk[] = [];
  if (!paperId || !sections || !Array.isArray(sections)) return chunks;

  function traverse(list: any[]) {
    for (const sec of list) {
      if (sec.paragraphs && Array.isArray(sec.paragraphs)) {
        sec.paragraphs.forEach((pText: string, pIdx: number) => {
          if (pText && pText.trim()) {
            chunks.push({
              id: `${paperId}-sec-${sec.id}-p-${pIdx}`,
              paperId,
              sectionId: sec.id,
              sectionTitle: sec.title,
              paragraphIndex: pIdx,
              text: pText.trim()
            });
          }
        });
      }
      if (sec.children && Array.isArray(sec.children)) {
        traverse(sec.children);
      }
    }
  }

  traverse(sections);
  return chunks;
}

/**
 * 供 AI 伴讀引擎調用：自動根據使用者提問檢索最相關之文獻片段 (Local RAG)
 */
export async function retrieveRelevantContextForAI(
  paperId: string,
  userQuestion: string,
  topK: number = 3
): Promise<string> {
  try {
    const results = await searchSemantic(paperId, userQuestion, topK);
    if (!results || results.length === 0) return '';

    // 篩選相關度高於 50% 的核心段落
    const relevant = results.filter((r) => r.scorePercent >= 45);
    if (relevant.length === 0) return '';

    const lines = [
      '### 【本機語意檢索之文獻核心證據片段 (Local RAG Evidence)】',
      '以下為與讀者提問高度吻合之論文原文段落，請優先作為回答依據：'
    ];

    relevant.forEach((item, idx) => {
      const secInfo = item.sectionTitle ? ` · 章節: ${item.sectionTitle}` : '';
      lines.push(
        `\n> **[證據片段 ${idx + 1}] (相關度: ${item.scorePercent}%${secInfo})**`
      );
      lines.push(`> 「${item.text.replace(/\n+/g, ' ')}」`);
    });

    return lines.join('\n');
  } catch (err) {
    console.warn('[hybridEmbeddingService] AI 檢索相關脈絡失敗，跳過 RAG 注入:', err);
    return '';
  }
}

/**
 * 取得當前向量系統狀態
 */
export async function getEngineStatus(paperId?: string): Promise<EmbeddingEngineStatus> {
  const pref = getEmbeddingPreference();
  const active = resolveActiveProvider();
  let indexedCount = 0;

  if (paperId) {
    const records = await getEmbeddingsForPaper(paperId);
    indexedCount = records.length;
  }

  return {
    preference: pref,
    activeProvider: active.provider,
    dimension: active.dimension,
    modelName: active.modelName,
    isModelReady: true,
    isIndexing: false,
    indexedCount,
    totalCount: indexedCount
  };
}
