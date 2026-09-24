// Svelte / TS compatible state store for MUGEN YOMU
export interface SectionItem {
  id: string;
  title: string;
  level: number;
  page?: number;
  progress: number;
  isRead: boolean;
  children?: SectionItem[];
}

export interface SectionProgressState {
  progress: number;       // 0 ~ 100
  isRead: boolean;        // 是否精讀完成
  isSkimmed?: boolean;    // 是否已掃讀路過
  dwellSeconds?: number;  // 視線停留秒數
  readParaIndices?: number[]; // 本章節已研讀之小段落索引列表 (例如 [0, 1, 2])
  lastUpdated?: number;   // 最後更新時間戳
}

export interface ReadingTelemetry {
  wpm: number;
  depthLevel: string;
  focusTrack: string;
  coveragePercent: number;
  readWords: number;
  totalWords: number;
  alignedTermsCount: number;
  localEmbeddingDim: number;
}

export interface ByokState {
  model: string;
  provider: string;
  isCacheActive: boolean;
  cachedQueries: number;
  costSavedUsd: number;
  savingsPercent: number;
  memoryBankMb: number;
}

export interface ReadingStatsResult {
  coveragePercent: number;     // 綜合/精讀覆蓋率 (0 ~ 100%)
  deepCoveragePercent: number; // 精讀掌握百分比 (0 ~ 100%)
  skimCoveragePercent: number; // 瀏覽掃讀百分比 (0 ~ 100%)
  readWords: number;           // 精讀字數 (相容欄位)
  deepWords: number;           // 精讀字數
  skimWords: number;           // 掃讀字數
  totalWords: number;          // 總字數
}

export const initialSections: SectionItem[] = [
  { id: '1', title: '1. Overview & Architectural Philosophy', level: 1, progress: 100, isRead: true },
  { id: '2', title: '2. The Triad Reading Space Architecture', level: 1, progress: 100, isRead: true },
  {
    id: '3',
    title: '3. Cognitive Reading Mechanics & The Focus Lens',
    level: 1,
    progress: 60,
    isRead: false,
    children: [
      { id: '3.1', title: '3.1 Reading Flow & Saccadic Tracking', level: 2, progress: 100, isRead: true },
      { id: '3.2', title: '3.2 Complex Sentence Deconstruction (The SVO Engine)', level: 2, progress: 80, isRead: false },
      { id: '3.3', title: '3.3 Interactive Formula Sandbox & Notation System', level: 2, progress: 0, isRead: false }
    ]
  },
  { id: '4', title: '4. The Quad-Layer AI Companion', level: 1, progress: 0, isRead: false },
  { id: '5', title: '5. Privacy-First BYOK & Local Caching Paradigm', level: 1, progress: 0, isRead: false },
  { id: '6', title: '6. Workflow Mastery & Keyboard Shortcuts', level: 1, progress: 0, isRead: false }
];

export function flattenSections(sections: any[]): any[] {
  let result: any[] = [];
  if (!sections || !Array.isArray(sections)) return result;
  for (const s of sections) {
    result.push(s);
    if (s.children && s.children.length > 0) {
      result = result.concat(flattenSections(s.children));
    }
  }
  return result;
}

/**
 * 自動同調章節標題與子章節之進度與已讀狀態 (支援巢狀 children 與平面編號結構)
 */
export function synchronizeHeadingProgress(sections: any[]): any[] {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return [];

  // 1. 若具有巢狀 children 樹狀結構
  const hasTree = sections.some(s => s.children && s.children.length > 0);
  if (hasTree) {
    return sections.map(sec => {
      let updated = { ...sec };
      if (updated.children && updated.children.length > 0) {
        updated.children = synchronizeHeadingProgress(updated.children);
        const allChildrenRead = updated.children.every((c: any) => c.isRead || (c.progress && c.progress >= 100));
        const avgProgress = Math.round(
          updated.children.reduce((sum: number, c: any) => sum + (c.isRead ? 100 : (c.progress || 0)), 0) /
            updated.children.length
        );

        if (allChildrenRead) {
          updated.isRead = true;
          updated.progress = 100;
        } else {
          updated.progress = Math.max(updated.progress || 0, avgProgress);
          if (updated.progress >= 100) updated.isRead = true;
        }
      }
      return updated;
    });
  }

  // 2. 若為平面列表結構 (如 Markdown / PDF 導入的 flat sections)
  const result = sections.map(s => ({ ...s }));

  for (let i = 0; i < result.length; i++) {
    const curr = result[i];
    const paras = curr.paragraphs || [];
    const hasParas = paras.some((p: string) => p && p.trim().length > 0);
    const hasMedia = (curr.figures && curr.figures.length > 0) || (curr.formulas && curr.formulas.length > 0);
    const isPureHeading = !hasParas && !hasMedia;

    // 取得當前標題的編號前綴，例如 "3. Results & Discussion" -> "3"
    const prefixMatch = (curr.title || '').trim().match(/^([0-9]+)\.?\s+/);
    const mainNum = prefixMatch ? prefixMatch[1] : null;

    // 尋找屬於該章節的子小節 (例如以 "3.1", "3.2" 開頭，或 level 更深者)
    const subSections: any[] = [];
    if (mainNum) {
      for (let j = i + 1; j < result.length; j++) {
        const next = result[j];
        const nextTitle = (next.title || '').trim();
        const nextMatch = nextTitle.match(/^([0-9]+)(?:\.([0-9]+))*\.?\s+/);
        // 如果遇到下一個大章節 (例如 "4. Conclusions")，結束子章節搜尋
        if (nextMatch && nextMatch[1] !== mainNum && !nextTitle.startsWith(`${mainNum}.`)) {
          break;
        }
        // 如果次級編號屬於當前大章節 (例如 "3.1")
        if (nextTitle.startsWith(`${mainNum}.`) || (next.level && curr.level && next.level > curr.level)) {
          subSections.push(next);
        }
      }
    } else if (isPureHeading && curr.level) {
      // 若無明確數字編號，但為純標題且具備 level，收集後續 level 更深的章節直到同級或更高等級
      for (let j = i + 1; j < result.length; j++) {
        const next = result[j];
        if (next.level && next.level <= curr.level) break;
        subSections.push(next);
      }
    }

    // 若找到所屬子章節
    if (subSections.length > 0) {
      const allSubRead = subSections.every(s => s.isRead || (s.progress && s.progress >= 100));
      const avgProgress = Math.round(
        subSections.reduce((sum, s) => sum + (s.isRead ? 100 : (s.progress || 0)), 0) / subSections.length
      );

      if (allSubRead) {
        curr.isRead = true;
        curr.progress = 100;
      } else if (avgProgress > 0) {
        curr.progress = Math.max(curr.progress || 0, avgProgress);
        if (curr.progress >= 100) curr.isRead = true;
      }
    }
  }

  return result;
}

/**
 * 計算精讀與掃讀雙軌閱讀數據指標
 */
export function calculateReadingStats(sections: any[]): ReadingStatsResult {
  // 先自動同步標題與子章節進度
  const syncedSections = synchronizeHeadingProgress(sections);
  const flattened = flattenSections(syncedSections);
  if (flattened.length === 0) {
    return {
      coveragePercent: 0,
      deepCoveragePercent: 0,
      skimCoveragePercent: 0,
      readWords: 0,
      deepWords: 0,
      skimWords: 0,
      totalWords: 1000
    };
  }

  // 取得具有實質內文/媒體的內容節點（純標題不計入字數分母）
  const contentNodes = flattened.filter(s => {
    const hasChildren = s.children && s.children.length > 0;
    const paras = s.paragraphs || [];
    const hasParas = paras.some((p: string) => p && p.trim().length > 0);
    const hasMedia = (s.figures && s.figures.length > 0) || (s.formulas && s.formulas.length > 0);
    return !hasChildren && (hasParas || hasMedia);
  });

  const targetList = contentNodes.length > 0 ? contentNodes : flattened;

  let totalChars = 0;
  let deepChars = 0;
  let skimChars = 0;

  for (const s of targetList) {
    const paras = (s.paragraphs || []).filter((p: string) => p && p.trim().length > 0);
    let textLen = paras.join(' ').length;
    if (textLen === 0) {
      const figCount = (s.figures || []).length;
      const eqCount = (s.formulas || []).length;
      if (figCount > 0 || eqCount > 0) {
        textLen = figCount * 300 + eqCount * 200;
      }
    }
    if (textLen === 0) continue;
    totalChars += textLen;

    if (s.isRead || s.progress >= 100) {
      deepChars += textLen;
    } else if (s.readParaIndices && s.readParaIndices.length > 0 && paras.length > 0) {
      // 基於小段落精確累計已讀字元
      let paraDeepChars = 0;
      for (const idx of s.readParaIndices) {
        if (paras[idx]) {
          paraDeepChars += paras[idx].trim().length;
        }
      }
      deepChars += Math.min(textLen, paraDeepChars);
    } else if (s.progress > 0) {
      const progressFraction = Math.min(1, s.progress / 100);
      if (progressFraction >= 0.7) {
        deepChars += Math.round(textLen * progressFraction);
      } else {
        skimChars += Math.round(textLen * progressFraction);
      }
    }
  }

  if (totalChars === 0) totalChars = 1000;

  // 若所有實質內容節點皆已讀或進度達標，百分比精確達到 100%
  const allRead = targetList.every(s => s.isRead || (s.progress && s.progress >= 100));

  const totalWords = Math.max(100, Math.round(totalChars / 5));
  let deepWords = Math.min(totalWords, Math.round(deepChars / 5));
  let skimWords = Math.min(totalWords - deepWords, Math.round(skimChars / 5));

  let deepCoveragePercent = allRead ? 100 : Math.min(100, Math.round((deepWords / totalWords) * 100));
  if (allRead) {
    deepWords = totalWords;
    skimWords = 0;
  }

  let skimCoveragePercent = allRead ? 0 : Math.min(100 - deepCoveragePercent, Math.round((skimWords / totalWords) * 100));

  return {
    coveragePercent: deepCoveragePercent,
    deepCoveragePercent,
    skimCoveragePercent,
    readWords: deepWords,
    deepWords,
    skimWords,
    totalWords
  };
}

// ------------------------------------------------------------------
// LocalStorage Persistence & Section Telemetry Helpers
// ------------------------------------------------------------------

const STORAGE_PREFIX = 'mugen_reading_state_';

export function loadPaperReadingState(paperId: string): Record<string, SectionProgressState> | null {
  if (typeof window === 'undefined' || !paperId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${paperId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[readingStore] Failed to load reading state:', err);
    return null;
  }
}

export function savePaperReadingState(paperId: string, state: Record<string, SectionProgressState>): void {
  if (typeof window === 'undefined' || !paperId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${paperId}`, JSON.stringify(state));
  } catch (err) {
    console.warn('[readingStore] Failed to save reading state:', err);
  }
}

export function clearPaperReadingState(paperId: string): void {
  if (typeof window === 'undefined' || !paperId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${paperId}`);
  } catch (err) {
    console.warn('[readingStore] Failed to clear reading state:', err);
  }
}

/**
 * 將保存的章節閱讀進度套用至章節樹
 */
export function applyProgressToSections(
  sections: any[],
  progressMap: Record<string, SectionProgressState>
): any[] {
  if (!sections || !Array.isArray(sections)) return [];
  if (!progressMap || Object.keys(progressMap).length === 0) {
    return synchronizeHeadingProgress(sections);
  }

  const updated = sections.map(sec => {
    const saved = progressMap[sec.id];
    const isRead = saved ? saved.isRead : sec.isRead;
    const progress = saved ? saved.progress : (sec.progress || 0);

    const s: any = {
      ...sec,
      isRead: !!isRead,
      progress: progress !== undefined ? progress : (isRead ? 100 : 0),
      readParaIndices: saved?.readParaIndices || sec.readParaIndices || []
    };

    if (sec.children && sec.children.length > 0) {
      s.children = applyProgressToSections(sec.children, progressMap);
    }
    return s;
  });

  return synchronizeHeadingProgress(updated);
}

// ------------------------------------------------------------------
// Last Reading Position (Cursor & Paragraph Bookmarks)
// ------------------------------------------------------------------

export interface ReadingPositionRecord {
  paperId: string;
  type: 'cursor' | 'paragraph';
  sectionId: string;
  paraIndex: number;
  paragraphKey: string;
  charIndex?: number;
  timestamp: number;
}

const POSITION_STORAGE_PREFIX = 'mugen_last_pos_';

export function loadLastReadingPosition(paperId: string): ReadingPositionRecord | null {
  if (typeof window === 'undefined' || !paperId) return null;
  try {
    const raw = localStorage.getItem(`${POSITION_STORAGE_PREFIX}${paperId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[readingStore] Failed to load last reading position:', err);
    return null;
  }
}

export function saveLastReadingPosition(paperId: string, record: ReadingPositionRecord): void {
  if (typeof window === 'undefined' || !paperId || !record) return;
  try {
    localStorage.setItem(`${POSITION_STORAGE_PREFIX}${paperId}`, JSON.stringify(record));
  } catch (err) {
    console.warn('[readingStore] Failed to save last reading position:', err);
  }
}

export function clearLastReadingPosition(paperId: string): void {
  if (typeof window === 'undefined' || !paperId) return;
  try {
    localStorage.removeItem(`${POSITION_STORAGE_PREFIX}${paperId}`);
  } catch (err) {
    console.warn('[readingStore] Failed to clear last reading position:', err);
  }
}

