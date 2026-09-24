// Document Store for MUGEN YOMU (Paper & Web Article Reader)

// 1. 重新導出所有文獻與章節核心型別 (保持型別匯入完全向下相容)
export type {
  ChapterSection,
  FormulaItem,
  FigureItem,
  SectionCompanionData,
  PaperDocument
} from '../types/document';

import type { ChapterSection, PaperDocument } from '../types/document';

// 2. 重新導出所有經典內建文獻資料
export {
  userManualDocument,
  attentionPaper,
  resnetPaper,
  anthropicCircuitsWeb
} from '../data/mockPapers';

import {
  userManualDocument,
  attentionPaper,
  resnetPaper,
  anthropicCircuitsWeb
} from '../data/mockPapers';

// 3. 重新導出解析服務引擎
export {
  extractVariablesFromLatex,
  resolveUrl,
  parseMarkdownToDocument,
  fetchWebArticle,
  fetchArxivDocument
} from '../services/markdownParserService';

export {
  parseEpubToDocument
} from '../services/epubParserService';

export {
  toTraditionalTaiwan,
  convertDocumentToTraditional
} from '../services/traditionalChineseService';

export {
  detectOnlineBook,
  crawlEntireOnlineBook
} from '../services/bookCrawlerService';

// -------------------------------------------------------------
// 本地儲存與文獻庫管理函式 (LocalStorage + IndexedDB 雙軌超大容量持久化)
// -------------------------------------------------------------
const STORAGE_KEY_PAPERS = 'mugen_paper_library_v3';
const STORAGE_KEY_ACTIVE_ID = 'mugen_active_paper_id_v3';

const DB_NAME_PAPERS = 'mugen_yomu_library_db';
const DB_VERSION_PAPERS = 1;
const STORE_PAPERS = 'papers';

function openPapersDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in current environment'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME_PAPERS, DB_VERSION_PAPERS);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 從 IndexedDB 載入文獻庫（支援無上限儲存 EPUB 電子書與高解析圖檔）
 */
export async function loadLibraryFromIndexedDB(): Promise<PaperDocument[] | null> {
  try {
    const db = await openPapersDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PAPERS, 'readonly');
      const store = tx.objectStore(STORE_PAPERS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result;
        if (Array.isArray(list) && list.length > 0) {
          resolve(list.map(normalizePaper));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('載入 IndexedDB 文獻庫失敗:', e);
    return null;
  }
}

/**
 * 將完整文獻庫儲存至 IndexedDB
 */
export async function saveLibraryToIndexedDB(library: PaperDocument[]): Promise<void> {
  try {
    const db = await openPapersDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAPERS, 'readwrite');
      const store = tx.objectStore(STORE_PAPERS);
      store.clear().onsuccess = () => {
        for (const paper of library) {
          store.put(paper);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('寫入 IndexedDB 文獻庫失敗:', e);
  }
}

export function normalizePaper(p: any): PaperDocument {
  if (!p) return p;
  // 1. authors 規範化
  let authors: string[] = [];
  if (Array.isArray(p.authors)) {
    authors = p.authors.filter(Boolean);
  } else if (typeof p.authors === 'string' && p.authors.trim()) {
    authors = [p.authors.trim()];
  }
  if (authors.length === 0) {
    authors = ['未知作者'];
  }

  // 2. abstract 規範化
  let abstract = { english: '', chineseSummary: '' };
  if (p.abstract && typeof p.abstract === 'object') {
    abstract = {
      english: typeof p.abstract.english === 'string' ? p.abstract.english : '',
      chineseSummary: typeof p.abstract.chineseSummary === 'string' ? p.abstract.chineseSummary : ''
    };
  } else if (typeof p.abstract === 'string') {
    abstract = {
      english: p.abstract,
      chineseSummary: ''
    };
  }

  return {
    ...p,
    title: p.title || '無標題文獻',
    authors,
    abstract,
    sections: Array.isArray(p.sections) ? p.sections : [],
    companionData: p.companionData || {}
  };
}

export function getInitialLibrary(): PaperDocument[] {
  const defaults = [userManualDocument, attentionPaper, resnetPaper, anthropicCircuitsWeb];

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAPERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 標準化並自我修復所有文獻
        const normalizedList: PaperDocument[] = parsed.filter(Boolean).map(normalizePaper);

        // Ensure userManualDocument is present and always synced with the latest version
        const manualIdx = normalizedList.findIndex((p: any) => p.id === userManualDocument.id);
        if (manualIdx === -1) {
          const updated = [userManualDocument, ...normalizedList];
          saveLibraryToStorage(updated);
          return updated;
        } else {
          normalizedList[manualIdx] = userManualDocument;
          saveLibraryToStorage(normalizedList);
          return normalizedList;
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse paper library from localStorage', e);
  }

  saveLibraryToStorage(defaults);
  return defaults;
}

export function saveLibraryToStorage(library: PaperDocument[]): void {
  if (typeof window === 'undefined') return;

  // 1. 永遠優先非同步寫入無容量限制之 IndexedDB（可容納數百 MB 電子書與 Base64 圖表）
  saveLibraryToIndexedDB(library).catch(() => {});

  // 2. 備援寫入 LocalStorage（若資料超過 5MB 拋出 QuotaExceeded 則優雅忽略，保護主儲存）
  try {
    localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(library));
  } catch (e) {
    console.warn('[儲存防護] 文獻庫體積超出 LocalStorage 5MB 配額，已由 IndexedDB 安全接手完整持久化。');
  }
}

export function getActivePaperId(): string {
  if (typeof window === 'undefined') return userManualDocument.id;
  return localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || userManualDocument.id;
}

export function setActivePaperId(paperId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_ACTIVE_ID, paperId);
}
