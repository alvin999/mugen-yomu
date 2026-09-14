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
 * 計算精讀與掃讀雙軌閱讀數據指標
 */
export function calculateReadingStats(sections: any[]): ReadingStatsResult {
  const flattened = flattenSections(sections);
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

  // 取得所有具有實質內文的節點（避免純目錄/容器節點重複計算虛擬字數）
  const contentNodes = flattened.filter(s => {
    const hasChildren = s.children && s.children.length > 0;
    const hasParas = s.paragraphs && s.paragraphs.length > 0;
    return !hasChildren || hasParas;
  });

  const targetList = contentNodes.length > 0 ? contentNodes : flattened;

  let totalChars = 0;
  let deepChars = 0;
  let skimChars = 0;

  for (const s of targetList) {
    const textLen = (s.paragraphs || []).join(' ').length || (s.children && s.children.length > 0 ? 0 : 250);
    if (textLen === 0) continue;
    totalChars += textLen;

    if (s.isRead || s.progress >= 100) {
      deepChars += textLen;
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
  if (!progressMap || Object.keys(progressMap).length === 0) return sections;

  return sections.map(sec => {
    const saved = progressMap[sec.id];
    const isRead = saved ? saved.isRead : sec.isRead;
    const progress = saved ? saved.progress : (sec.progress || 0);

    const updated: any = {
      ...sec,
      isRead: !!isRead,
      progress: progress !== undefined ? progress : (isRead ? 100 : 0)
    };

    if (sec.children && sec.children.length > 0) {
      updated.children = applyProgressToSections(sec.children, progressMap);
    }
    return updated;
  });
}

