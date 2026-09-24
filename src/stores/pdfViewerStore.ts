import { writable, get } from 'svelte/store';
import type { PageTextEntry, MatchResult } from '../services/pdfService';

export interface PdfViewerState {
  // 本地 PDF 檔案與二進制資料
  localPdfFile: File | null;
  localPdfBlobUrl: string | null;
  localPdfArrayBuffer: ArrayBuffer | null;
  localPdfName: string | null;

  // 閱讀進度與狀態
  currentPage: number;
  totalPages: number;
  zoomLevel: number;
  viewerMode: 'canvas' | 'text' | 'native';
  paperTheme: 'parchment' | 'dark';
  isSyncEnabled: boolean;

  // 網頁排版滾動進度與焦點
  webScrollTop: number;
  webScrollPercent: number;
  activeWebSectionId: string;

  // 全文比對與錨定索引快取
  pageTextIndex: PageTextEntry[];
  matchResults: Record<string, MatchResult>;
  isStringMatchActive: boolean;
  isStringIndexing: boolean;
  stringIndexProgress: number;

  // 當前綁定之文獻 ID
  activePaperId: string | null;
}

const STORAGE_PAGE_PREFIX = 'mugen_pdf_page_';
const STORAGE_WEB_SCROLL_PREFIX = 'mugen_web_scroll_';

function getSavedPage(key: string): number {
  if (typeof window === 'undefined' || !key) return 1;
  try {
    const raw = localStorage.getItem(`${STORAGE_PAGE_PREFIX}${key}`);
    if (raw) {
      const p = parseInt(raw, 10);
      if (!isNaN(p) && p >= 1) return p;
    }
  } catch (err) {
    console.warn('[pdfViewerStore] 讀取儲存頁碼失敗:', err);
  }
  return 1;
}

function savePage(key: string, page: number): void {
  if (typeof window === 'undefined' || !key || page < 1) return;
  try {
    localStorage.setItem(`${STORAGE_PAGE_PREFIX}${key}`, String(page));
  } catch (err) {
    console.warn('[pdfViewerStore] 儲存閱讀頁碼失敗:', err);
  }
}

function getSavedWebScroll(key: string): number {
  if (typeof window === 'undefined' || !key) return 0;
  try {
    const raw = localStorage.getItem(`${STORAGE_WEB_SCROLL_PREFIX}${key}`);
    if (raw) {
      const s = parseFloat(raw);
      if (!isNaN(s) && s >= 0) return s;
    }
  } catch (err) {
    console.warn('[pdfViewerStore] 讀取儲存網頁滾動位置失敗:', err);
  }
  return 0;
}

function saveWebScroll(key: string, scrollTop: number): void {
  if (typeof window === 'undefined' || !key || scrollTop < 0) return;
  try {
    localStorage.setItem(`${STORAGE_WEB_SCROLL_PREFIX}${key}`, String(Math.round(scrollTop)));
  } catch (err) {
    console.warn('[pdfViewerStore] 儲存網頁滾動位置失敗:', err);
  }
}

const initialState: PdfViewerState = {
  localPdfFile: null,
  localPdfBlobUrl: null,
  localPdfArrayBuffer: null,
  localPdfName: null,
  currentPage: 1,
  totalPages: 1,
  zoomLevel: 1.0,
  viewerMode: 'canvas',
  paperTheme: 'parchment',
  isSyncEnabled: true,
  webScrollTop: 0,
  webScrollPercent: 0,
  activeWebSectionId: '',
  pageTextIndex: [],
  matchResults: {},
  isStringMatchActive: false,
  isStringIndexing: false,
  stringIndexProgress: 0,
  activePaperId: null
};

function createPdfViewerStore() {
  const { subscribe, set, update } = writable<PdfViewerState>(initialState);

  return {
    subscribe,

    /**
     * 載入本機選取或拖入的 PDF 檔案
     */
    async loadLocalPdf(file: File, paperId?: string) {
      const current = get({ subscribe });
      if (current.localPdfBlobUrl) {
        URL.revokeObjectURL(current.localPdfBlobUrl);
      }

      const blobUrl = URL.createObjectURL(file);
      const arrayBuffer = await file.arrayBuffer();
      const savedPage = paperId ? getSavedPage(paperId) : getSavedPage(file.name);

      update(state => ({
        ...state,
        localPdfFile: file,
        localPdfBlobUrl: blobUrl,
        localPdfArrayBuffer: arrayBuffer,
        localPdfName: file.name,
        activePaperId: paperId || state.activePaperId,
        currentPage: savedPage,
        viewerMode: 'canvas',
        matchResults: {},
        pageTextIndex: [],
        isStringMatchActive: false
      }));
    },

    /**
     * 從 IndexedDB 或記憶體 ArrayBuffer 直接載入 PDF（重新整理後還原）
     */
    loadLocalPdfBuffer(buffer: ArrayBuffer, name: string, paperId?: string) {
      const current = get({ subscribe });
      if (current.localPdfBlobUrl) {
        URL.revokeObjectURL(current.localPdfBlobUrl);
      }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const savedPage = paperId ? getSavedPage(paperId) : getSavedPage(name);

      update(state => ({
        ...state,
        localPdfFile: null,
        localPdfBlobUrl: blobUrl,
        localPdfArrayBuffer: buffer,
        localPdfName: name,
        activePaperId: paperId || state.activePaperId,
        currentPage: savedPage,
        viewerMode: 'canvas',
        matchResults: {},
        pageTextIndex: [],
        isStringMatchActive: false
      }));
    },

    /**
     * 清除本機選取之 PDF，恢復預設原版/文獻
     */
    clearLocalPdf() {
      const current = get({ subscribe });
      if (current.localPdfBlobUrl) {
        URL.revokeObjectURL(current.localPdfBlobUrl);
      }

      update(state => {
        const fallbackPage = state.activePaperId ? getSavedPage(state.activePaperId) : 1;
        return {
          ...state,
          localPdfFile: null,
          localPdfBlobUrl: null,
          localPdfArrayBuffer: null,
          localPdfName: null,
          currentPage: fallbackPage,
          matchResults: {},
          pageTextIndex: [],
          isStringMatchActive: false
        };
      });
    },

    /**
     * 設定當前閱讀頁碼並自動持久化保存
     */
    setCurrentPage(page: number, paperIdOrKey?: string) {
      const validPage = Math.max(1, Math.round(Number(page) || 1));
      update(state => {
        const targetPage = state.totalPages > 1 ? Math.min(state.totalPages, validPage) : validPage;
        const key = state.localPdfName || paperIdOrKey || state.activePaperId;
        if (key) {
          savePage(key, targetPage);
        }
        return {
          ...state,
          currentPage: targetPage
        };
      });
    },

    /**
     * 更新總頁數，若目前頁碼超出則自動約束
     */
    setTotalPages(totalPages: number) {
      const validTotal = Math.max(1, totalPages);
      update(state => {
        const validCurrent = Math.min(validTotal, state.currentPage);
        return {
          ...state,
          totalPages: validTotal,
          currentPage: validCurrent
        };
      });
    },

    /**
     * 切換當前活動論文 ID，自動載入該文獻的上次閱讀頁碼與網頁滾動高度
     */
    setActivePaperId(paperId: string | null) {
      update(state => {
        if (!paperId || state.activePaperId === paperId) {
          return { ...state, activePaperId: paperId };
        }

        // 若無本機自訂 PDF，載入該文獻上次記錄的頁碼
        const savedPage = !state.localPdfArrayBuffer ? getSavedPage(paperId) : state.currentPage;
        const savedScroll = getSavedWebScroll(paperId);

        return {
          ...state,
          activePaperId: paperId,
          currentPage: savedPage,
          webScrollTop: savedScroll,
          // 若換了 paper，若非本機 PDF 則重置比對
          matchResults: state.localPdfArrayBuffer ? state.matchResults : {},
          pageTextIndex: state.localPdfArrayBuffer ? state.pageTextIndex : [],
          isStringMatchActive: state.localPdfArrayBuffer ? state.isStringMatchActive : false
        };
      });
    },

    /**
     * 更新網頁排版視圖滾動位置與比例，並自動持久化保存
     */
    setWebScroll(scrollTop: number, scrollPercent: number = 0, paperIdOrKey?: string) {
      update(state => {
        const key = paperIdOrKey || state.activePaperId;
        if (key && scrollTop >= 0) {
          saveWebScroll(key, scrollTop);
        }
        return {
          ...state,
          webScrollTop: Math.max(0, scrollTop),
          webScrollPercent: Math.max(0, Math.min(100, scrollPercent))
        };
      });
    },

    /**
     * 設定目前在網頁排版視圖中的焦點章節
     */
    setActiveWebSection(sectionId: string) {
      update(state => ({ ...state, activeWebSectionId: sectionId }));
    },

    setZoomLevel(zoom: number) {
      const zoomLevel = Math.max(0.6, Math.min(3.0, Number(zoom.toFixed(2))));
      update(state => ({ ...state, zoomLevel }));
    },

    setViewerMode(mode: 'canvas' | 'text' | 'native') {
      update(state => ({ ...state, viewerMode: mode }));
    },

    setPaperTheme(theme: 'parchment' | 'dark') {
      update(state => ({ ...state, paperTheme: theme }));
    },

    setSyncEnabled(enabled: boolean) {
      update(state => ({ ...state, isSyncEnabled: enabled }));
    },

    setMatchResults(matchResults: Record<string, MatchResult>, pageTextIndex?: PageTextEntry[]) {
      update(state => ({
        ...state,
        matchResults,
        pageTextIndex: pageTextIndex || state.pageTextIndex,
        isStringMatchActive: Object.keys(matchResults).length > 0
      }));
    },

    setStringIndexingState(isStringIndexing: boolean, stringIndexProgress: number = 0) {
      update(state => ({
        ...state,
        isStringIndexing,
        stringIndexProgress
      }));
    },

    reset() {
      set(initialState);
    }
  };
}

export const pdfViewerStore = createPdfViewerStore();
