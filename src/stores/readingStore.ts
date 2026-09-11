// Svelte 5 / TS compatible state store for MUGEN YOMU
export interface SectionItem {
  id: string;
  title: string;
  level: number;
  progress: number;
  isRead: boolean;
  children?: SectionItem[];
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
  for (const s of sections) {
    result.push(s);
    if (s.children && s.children.length > 0) {
      result = result.concat(flattenSections(s.children));
    }
  }
  return result;
}

export function calculateReadingStats(sections: any[]): { coveragePercent: number; readWords: number; totalWords: number } {
  const flattened = flattenSections(sections);
  if (flattened.length === 0) return { coveragePercent: 0, readWords: 0, totalWords: 1000 };

  let totalChars = 0;
  let readChars = 0;

  for (const s of flattened) {
    const textLen = (s.paragraphs || []).join(' ').length || 300;
    totalChars += textLen;
    if (s.isRead) {
      readChars += textLen;
    } else if (s.progress > 0) {
      readChars += Math.round(textLen * (s.progress / 100));
    }
  }

  const totalWords = Math.max(500, Math.round(totalChars / 5));
  const readWords = Math.round(readChars / 5);
  const coveragePercent = Math.min(100, Math.round((readWords / totalWords) * 100));

  return { coveragePercent, readWords, totalWords };
}

