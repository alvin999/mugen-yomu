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

// -------------------------------------------------------------
// 本地儲存與文獻庫管理函式 (LocalStorage / IndexedDB Ready)
// -------------------------------------------------------------
const STORAGE_KEY_PAPERS = 'mugen_paper_library_v3';
const STORAGE_KEY_ACTIVE_ID = 'mugen_active_paper_id_v3';

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
        // Ensure userManualDocument is present if missing from older storage
        const hasManual = parsed.some((p: any) => p.id === userManualDocument.id);
        if (!hasManual) {
          const updated = [userManualDocument, ...parsed];
          saveLibraryToStorage(updated);
          return updated;
        }
        return parsed;
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
  try {
    localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(library));
  } catch (e) {
    console.error('Failed to persist library to localStorage', e);
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
