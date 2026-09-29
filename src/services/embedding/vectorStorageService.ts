/**
 * @file vectorStorageService.ts
 * @description 利用 IndexedDB 本機持久化保存各篇文獻的段落向量資料
 * 達成同一篇論文一次計算後「永久秒開、零重複運算」的高效體驗
 */

import type { IndexedEmbeddingRecord } from './embeddingTypes';

const DB_NAME = 'mugen_yomu_vectors_v1';
const DB_VERSION = 1;
const STORE_EMBEDDINGS = 'paper_embeddings';

function openVectorDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('當前環境不支援 IndexedDB'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_EMBEDDINGS)) {
        const store = db.createObjectStore(STORE_EMBEDDINGS, { keyPath: 'id' });
        store.createIndex('by_paperId', 'paperId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 簡易字串雜湊，用於比對段落是否有變更
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * 批次儲存或更新論文的段落向量
 */
export async function saveEmbeddingsForPaper(
  paperId: string,
  records: IndexedEmbeddingRecord[]
): Promise<void> {
  if (!paperId || !records || records.length === 0) return;
  try {
    const db = await openVectorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EMBEDDINGS, 'readwrite');
      const store = tx.objectStore(STORE_EMBEDDINGS);

      for (const rec of records) {
        store.put(rec);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[vectorStorageService] 儲存向量至 IndexedDB 失敗:', err);
  }
}

/**
 * 讀取特定論文的所有已儲存向量
 */
export async function getEmbeddingsForPaper(paperId: string): Promise<IndexedEmbeddingRecord[]> {
  if (!paperId) return [];
  try {
    const db = await openVectorDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_EMBEDDINGS, 'readonly');
      const store = tx.objectStore(STORE_EMBEDDINGS);
      const index = store.index('by_paperId');
      const req = index.getAll(paperId);

      req.onsuccess = () => {
        resolve((req.result as IndexedEmbeddingRecord[]) || []);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('[vectorStorageService] 讀取論文向量失敗:', err);
    return [];
  }
}

/**
 * 清除特定論文的所有段落向量
 */
export async function deleteEmbeddingsForPaper(paperId: string): Promise<void> {
  if (!paperId) return;
  try {
    const records = await getEmbeddingsForPaper(paperId);
    if (records.length === 0) return;

    const db = await openVectorDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_EMBEDDINGS, 'readwrite');
      const store = tx.objectStore(STORE_EMBEDDINGS);

      for (const rec of records) {
        store.delete(rec.id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[vectorStorageService] 刪除論文向量失敗:', err);
  }
}
