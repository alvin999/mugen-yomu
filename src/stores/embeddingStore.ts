/**
 * @file embeddingStore.ts
 * @description 語意向量引擎響應式狀態 Store
 * 以資料庫已存向量 (Source of Truth) 與記憶體狀態做決策，不依賴脆弱的 localStorage
 */

import { writable } from 'svelte/store';
import type { ActiveEmbeddingProvider } from '../services/embedding/embeddingTypes';
import { getEmbeddingsForPaper } from '../services/embedding/vectorStorageService';

export interface EmbeddingState {
  paperId: string;
  isReady: boolean;
  isIndexing: boolean;
  indexedCount: number;
  totalCount: number;
  activeProvider: ActiveEmbeddingProvider;
  dimension: number;
  modelName: string;
  sourceType: 'local-onnx' | 'cloud-api' | 'unindexed';
  statusLabel: string;
  detailDescription: string;
}

const initialState: EmbeddingState = {
  paperId: '',
  isReady: false,
  isIndexing: false,
  indexedCount: 0,
  totalCount: 0,
  activeProvider: 'onnx',
  dimension: 384,
  modelName: 'all-MiniLM-L6-v2',
  sourceType: 'unindexed',
  statusLabel: '未建立索引 (預設本地 ONNX)',
  detailDescription: '尚未為當前論文建立段落向量，搜尋時將以純瀏覽器端 ONNX 即時運算。'
};

export const embeddingStore = writable<EmbeddingState>(initialState);

/**
 * 直接自資料庫 (IndexedDB) 讀取真實儲存的向量狀態，絕不靠 localStorage 盲目猜測
 */
export async function refreshPaperEmbeddingStatus(paperId: string, totalChunksCount: number = 0): Promise<EmbeddingState> {
  if (!paperId) {
    const defaultState: EmbeddingState = { ...initialState };
    embeddingStore.set(defaultState);
    return defaultState;
  }

  try {
    const records = await getEmbeddingsForPaper(paperId);

    if (records && records.length > 0) {
      const first = records[0];
      const isLocal = first.provider === 'onnx';
      const state: EmbeddingState = {
        paperId,
        isReady: true,
        isIndexing: false,
        indexedCount: records.length,
        totalCount: totalChunksCount || records.length,
        activeProvider: first.provider,
        dimension: first.dimension || 384,
        modelName: first.model || (isLocal ? 'all-MiniLM-L6-v2' : 'cloud-embedding'),
        sourceType: isLocal ? 'local-onnx' : 'cloud-api',
        statusLabel: isLocal ? '本地 ONNX (384-dim)' : `${first.provider.toUpperCase()} (${first.dimension}-dim)`,
        detailDescription: isLocal
          ? `純瀏覽器端 ONNX 運算 (all-MiniLM-L6-v2, 384 維) · 已就緒 ${records.length} 個段落 · 零 API 消耗與絕對隱私`
          : `雲端 ${first.provider.toUpperCase()} API (維度 ${first.dimension}) · 已就緒 ${records.length} 個段落`
      };
      embeddingStore.set(state);
      return state;
    } else {
      const state: EmbeddingState = {
        paperId,
        isReady: false,
        isIndexing: false,
        indexedCount: 0,
        totalCount: totalChunksCount,
        activeProvider: 'onnx',
        dimension: 384,
        modelName: 'all-MiniLM-L6-v2',
        sourceType: 'unindexed',
        statusLabel: '未建立索引 (預設本地 ONNX)',
        detailDescription: '當前論文尚未建立向量索引。點擊檢索時將自動以純端側 ONNX 在本地極速建立，零網路依賴。'
      };
      embeddingStore.set(state);
      return state;
    }
  } catch (err) {
    console.warn('[embeddingStore] 讀取向量狀態失敗，使用安全端側狀態:', err);
    const safeState: EmbeddingState = {
      ...initialState,
      paperId,
      detailDescription: '本機端側 ONNX 離線推論中。'
    };
    embeddingStore.set(safeState);
    return safeState;
  }
}
