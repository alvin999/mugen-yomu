/**
 * @file embeddingTypes.ts
 * @description MUGEN YOMU 混合向量嵌入與語意檢索系統型別定義
 */

export type EmbeddingEnginePreference = 'auto' | 'api-first' | 'local-only';

export type ActiveEmbeddingProvider = 'gemini' | 'openai' | 'onnx';

export interface ParagraphChunk {
  id: string;               // 唯一段落標識，例如 'sec-1-p-0'
  paperId: string;          // 文獻 ID
  sectionId?: string;       // 所屬章節 ID
  sectionTitle?: string;    // 所屬章節標題
  paragraphIndex: number;   // 段落序號
  text: string;             // 段落原文內容
  hash?: string;            // 文字雜湊，用於快取異動比對
}

export interface IndexedEmbeddingRecord {
  id: string;
  paperId: string;
  sectionId?: string;
  sectionTitle?: string;
  paragraphIndex: number;
  text: string;
  hash: string;
  embedding: number[];      // 向量陣列 (如 384 或 768 維)
  dimension: number;        // 向量維度
  provider: ActiveEmbeddingProvider; // 產生此向量的提供者
  model: string;            // 模型名稱
  createdAt: number;        // 時間戳
}

export interface SemanticSearchResult {
  id: string;
  paperId: string;
  sectionId?: string;
  sectionTitle?: string;
  paragraphIndex: number;
  text: string;
  similarity: number;       // 餘弦相似度 -1.0 ~ 1.0 (通常 0.0 ~ 1.0)
  scorePercent: number;     // 相關度百分比 (0 ~ 100)
}

export interface EmbeddingEngineStatus {
  preference: EmbeddingEnginePreference;
  activeProvider: ActiveEmbeddingProvider;
  dimension: number;
  modelName: string;
  isModelReady: boolean;
  isIndexing: boolean;
  indexedCount: number;
  totalCount: number;
  lastError?: string;
}
