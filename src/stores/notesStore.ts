/**
 * @file notesStore.ts
 * @description 集中式精讀筆記狀態管理：封裝 LocalStorage 讀寫、快速摘錄、星號釘選與跨視圖資料同步
 */

import { writable } from 'svelte/store';
import type { PaperDocument } from '../types/document';

export interface NoteEntry {
  id: string;
  title: string;
  text: string;
  time: string;
  paperId: string;
  paperTitle: string;
  sectionId?: string;
  sectionTitle?: string;
  isPinned?: boolean;
}

const STORAGE_PREFIX = 'mugen_notes_';

/**
 * 從 LocalStorage 載入指定論文的筆記列表
 */
export function loadNotesForPaper(paperId: string): NoteEntry[] {
  if (typeof window === 'undefined' || !paperId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${paperId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`[notesStore] Failed to load notes for ${paperId}:`, e);
    return [];
  }
}

/**
 * 儲存特定論文的筆記至 LocalStorage
 */
export function saveNotesForPaper(paperId: string, notes: NoteEntry[]): void {
  if (typeof window === 'undefined' || !paperId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${paperId}`, JSON.stringify(notes));
    notesStore.notifyChange(paperId);
  } catch (e) {
    console.warn(`[notesStore] Failed to save notes for ${paperId}:`, e);
  }
}

/**
 * 新增一則筆記
 */
export function addNoteToPaper(
  note: Omit<NoteEntry, 'id' | 'time'> & { id?: string; time?: string }
): NoteEntry {
  const finalNote: NoteEntry = {
    id: note.id || `${note.paperId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: note.time || new Date().toLocaleTimeString(),
    ...note
  };

  const existing = loadNotesForPaper(note.paperId);
  const updated = [finalNote, ...existing];
  saveNotesForPaper(note.paperId, updated);
  return finalNote;
}

/**
 * 載入整個文獻庫的所有筆記（供 CognitiveNotesView 使用）
 */
export function loadAllNotesFromLibrary(paperLibrary: PaperDocument[]): {
  allNotes: NoteEntry[];
  countMap: Record<string, number>;
} {
  const loaded: NoteEntry[] = [];
  const countMap: Record<string, number> = {};

  if (typeof window === 'undefined') return { allNotes: loaded, countMap };

  paperLibrary.forEach(p => {
    const paperNotes = loadNotesForPaper(p.id);
    countMap[p.id] = paperNotes.length;
    paperNotes.forEach(n => {
      loaded.push({
        id: n.id || `${p.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: n.title || '精讀速記',
        text: n.text || '',
        time: n.time || new Date().toLocaleTimeString(),
        paperId: p.id,
        paperTitle: p.title || '',
        sectionId: n.sectionId || '',
        sectionTitle: n.sectionTitle || '',
        isPinned: Boolean(n.isPinned)
      });
    });
  });

  return { allNotes: loaded, countMap };
}

/**
 * 響應式 Store 觸發器（用於跨組件通知筆記已更新）
 */
function createNotesStore() {
  const { subscribe, set, update } = writable<number>(Date.now());

  return {
    subscribe,
    notifyChange: (paperId?: string) => {
      set(Date.now());
    }
  };
}

export const notesStore = createNotesStore();
