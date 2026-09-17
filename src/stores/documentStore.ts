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

/**
 * 清洗文獻資料：自動過濾歷史遺留或捏造之非本篇主題機器學習損失函數 (Self-Healing)
 */
export function sanitizePaperData(paper: PaperDocument): boolean {
  if (!paper || !paper.sections) return false;
  const isMLPaper = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper.title || '');
  let modified = false;

  const isFabricatedML = (latexText: string, name?: string, vars?: any[]): boolean => {
    if (isMLPaper) return false;
    const combined = `${latexText} ${name || ''} ${JSON.stringify(vars || [])}`;
    // 檢測機器學習損失函數與目標函數特徵
    const mlPatterns = [
      /\\min[\s_{]/,
      /\\mathcal\{L\}/,
      /\\mathbb\{E\}/,
      /\\Omega\s*\(/,
      /\\ell\s*\(/,
      /f_\\theta/,
      /綜合損失/,
      /正則化懲罰/,
      /模型參數權重/
    ];
    return mlPatterns.some(p => p.test(combined));
  };

  const cleanSection = (sec: ChapterSection) => {
    if (sec.formulas && sec.formulas.length > 0) {
      const originalLen = sec.formulas.length;
      sec.formulas = sec.formulas.filter(f => {
        if (!f || !f.latexText) return false;
        if (isFabricatedML(f.latexText, f.name, f.variables)) {
          return false;
        }
        return true;
      });
      if (sec.formulas.length !== originalLen) {
        modified = true;
      }
    }
    if (sec.children && sec.children.length > 0) {
      for (const child of sec.children) {
        cleanSection(child);
      }
    }
  };

  for (const sec of paper.sections) {
    cleanSection(sec);
  }

  return modified;
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
        let hasSanitized = false;
        for (const p of parsed) {
          if (sanitizePaperData(p)) {
            hasSanitized = true;
          }
        }
        // Ensure userManualDocument is present if missing from older storage
        const hasManual = parsed.some((p: any) => p.id === userManualDocument.id);
        if (!hasManual || hasSanitized) {
          const updated = hasManual ? parsed : [userManualDocument, ...parsed];
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
