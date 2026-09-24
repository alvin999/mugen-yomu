/**
 * @file pdfStorageService.ts
 * @description 利用 IndexedDB 持久化保存本機上傳的 PDF 二進制資料 (ArrayBuffer)
 * 解決瀏覽器重新整理 (F5) 後 Blob URL 失效導致 Canvas 無法載入的問題
 */

const DB_NAME = 'mugen_yomu_pdf_storage_v1';
const DB_VERSION = 1;
const STORE_PDFS = 'pdf_binaries';

function openPdfStorageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('當前環境不支援 IndexedDB'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: 'paperId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 儲存本機 PDF 的 ArrayBuffer 至 IndexedDB
 */
export async function saveLocalPdfBinary(paperId: string, arrayBuffer: ArrayBuffer, fileName?: string): Promise<void> {
  if (!paperId || !arrayBuffer || arrayBuffer.byteLength === 0) return;
  try {
    const db = await openPdfStorageDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PDFS, 'readwrite');
      const store = tx.objectStore(STORE_PDFS);
      let buf = arrayBuffer;
      try {
        buf = arrayBuffer.slice(0);
      } catch {
        buf = arrayBuffer;
      }
      const data = {
        paperId,
        buffer: buf,
        fileName: fileName || '',
        updatedAt: Date.now()
      };
      const req = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[pdfStorageService] 儲存本機 PDF 二進制失敗:', err);
  }
}

/**
 * 從 IndexedDB 讀取本機 PDF 的 ArrayBuffer
 */
export async function getLocalPdfBinary(paperId: string): Promise<ArrayBuffer | null> {
  if (!paperId) return null;
  try {
    const db = await openPdfStorageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PDFS, 'readonly');
      const store = tx.objectStore(STORE_PDFS);
      const req = store.get(paperId);
      req.onsuccess = () => {
        const result = req.result;
        if (result && result.buffer) {
          resolve(result.buffer as ArrayBuffer);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[pdfStorageService] 讀取本機 PDF 二進制失敗:', err);
    return null;
  }
}

/**
 * 刪除文獻時連帶清理本機 PDF 快取
 */
export async function deleteLocalPdfBinary(paperId: string): Promise<void> {
  if (!paperId) return;
  try {
    const db = await openPdfStorageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PDFS, 'readwrite');
      const store = tx.objectStore(STORE_PDFS);
      const req = store.delete(paperId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[pdfStorageService] 刪除本機 PDF 二進制失敗:', err);
  }
}
