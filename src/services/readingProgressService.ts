/**
 * @file readingProgressService.ts
 * @description 閱讀進度狀態機服務：封裝章節進度遞迴計算、小段落研讀感應、LocalStorage 持久化與心流遙測
 */

import type { PaperDocument } from '../types/document';
import {
  flattenSections,
  calculateReadingStats,
  synchronizeHeadingProgress,
  savePaperReadingState
} from '../stores/readingStore';
import { flowStore } from '../stores/flowStore';
import {
  updateSectionStateRecursive,
  toggleSubsectionsRecursive,
  resetSectionsProgress,
  updateSectionsParagraphsRead,
  updateSectionsPassed,
  markAllSectionsRead,
  buildReadingStateMap
} from '../utils/readingTreeUtils';

/**
 * 內部通用：更新特定章節狀態並同步父子階層與存檔
 */
export function updateSectionState(
  paper: PaperDocument,
  sectionId: string,
  updates: Partial<{ isRead: boolean; progress: number; dwellSeconds: number }>
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections) return { updatedPaper: paper, hasChange: false };

  const updatedSections = updateSectionStateRecursive(paper.sections, sectionId, updates);
  const syncedSections = synchronizeHeadingProgress(updatedSections);
  const updatedPaper: PaperDocument = { ...paper, sections: syncedSections };

  savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));
  return { updatedPaper, hasChange: true };
}

/**
 * 1. 視線停留累積精讀
 */
export function applySectionDwell(
  paper: PaperDocument,
  sectionId: string,
  dwellSeconds: number
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections) return { updatedPaper: paper, hasChange: false };

  const allSecs = flattenSections(paper.sections);
  const target = allSecs.find(s => s.id === sectionId);
  if (!target || target.isRead) return { updatedPaper: paper, hasChange: false };

  const currentProgress = target.progress || 0;
  const addedProgress = Math.min(100, Math.max(currentProgress, Math.round((dwellSeconds / 7) * 100)));
  const isNowRead = addedProgress >= 100;

  return updateSectionState(paper, sectionId, {
    progress: addedProgress,
    isRead: isNowRead,
    dwellSeconds
  });
}

/**
 * 2. 視線路過掃讀（保底 30% 進度）
 */
export function applySectionSkimmed(
  paper: PaperDocument,
  sectionId: string
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections) return { updatedPaper: paper, hasChange: false };

  const allSecs = flattenSections(paper.sections);
  const target = allSecs.find(s => s.id === sectionId);
  if (target && !target.isRead && (!target.progress || target.progress < 30)) {
    return updateSectionState(paper, sectionId, { progress: 30 });
  }

  return { updatedPaper: paper, hasChange: false };
}

/**
 * 3. 深度互動（展開翻譯、查看直覺、標註筆記）直接判定 100% 精讀
 */
export function applySectionInteracted(
  paper: PaperDocument,
  sectionId: string
): { updatedPaper: PaperDocument; hasChange: boolean } {
  return updateSectionState(paper, sectionId, { isRead: true, progress: 100 });
}

/**
 * 4. 使用者在目錄樹手動切換已讀/未讀（遞迴影響子章節）
 */
export function toggleSectionReadState(
  paper: PaperDocument,
  sectionId: string
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections) return { updatedPaper: paper, hasChange: false };

  const allSecs = flattenSections(paper.sections);
  const target = allSecs.find(s => s.id === sectionId);
  if (!target) return { updatedPaper: paper, hasChange: false };

  const nextRead = !target.isRead;
  const toggled = toggleSubsectionsRecursive(paper.sections, target, nextRead);
  const synced = synchronizeHeadingProgress(toggled);
  const updatedPaper: PaperDocument = { ...paper, sections: synced };

  savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));
  return { updatedPaper, hasChange: true };
}

/**
 * 5. 重設本篇閱讀進度至 0%
 */
export function resetPaperReadingProgress(paper: PaperDocument): { updatedPaper: PaperDocument } {
  const resetSections = resetSectionsProgress(paper.sections || []);
  const updatedPaper: PaperDocument = { ...paper, sections: resetSections };

  savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));

  // 重設計時與心流遙測
  const stats = calculateReadingStats(updatedPaper.sections);
  flowStore.initForPaper(updatedPaper.id, stats.totalWords, updatedPaper.readingSpeedWpm || 260);

  return { updatedPaper };
}

/**
 * 6. 小段落已讀更新與進度百分比計算
 */
export function applyParagraphsRead(
  paper: PaperDocument,
  paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }>
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections || !paragraphs || paragraphs.length === 0) {
    return { updatedPaper: paper, hasChange: false };
  }

  const { updatedSections, hasChange } = updateSectionsParagraphsRead(paper.sections, paragraphs);
  if (hasChange) {
    const synced = synchronizeHeadingProgress(updatedSections);
    const updatedPaper: PaperDocument = { ...paper, sections: synced };
    savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));
    return { updatedPaper, hasChange: true };
  }

  return { updatedPaper: paper, hasChange: false };
}

/**
 * 7. 滾動滑過前面的章節時，自動將已讀過的章節標記為已研讀
 */
export function applySectionsPassed(
  paper: PaperDocument,
  readSectionIds: string[]
): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections || !readSectionIds || readSectionIds.length === 0) {
    return { updatedPaper: paper, hasChange: false };
  }

  const { updatedSections, hasChange } = updateSectionsPassed(paper.sections, readSectionIds);
  if (hasChange) {
    const synced = synchronizeHeadingProgress(updatedSections);
    const updatedPaper: PaperDocument = { ...paper, sections: synced };
    savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));
    return { updatedPaper, hasChange: true };
  }

  return { updatedPaper: paper, hasChange: false };
}

/**
 * 8. 當使用者自然滾動到達文末時，整篇論文自動完成 100% 精讀
 */
export function markPaperAllRead(paper: PaperDocument): { updatedPaper: PaperDocument; hasChange: boolean } {
  if (!paper || !paper.sections) return { updatedPaper: paper, hasChange: false };

  const allSecs = flattenSections(paper.sections);
  const allAlreadyRead = allSecs.every(s => s.isRead);
  if (allAlreadyRead) return { updatedPaper: paper, hasChange: false };

  const readSections = markAllSectionsRead(paper.sections);
  const updatedPaper: PaperDocument = { ...paper, sections: readSections };
  savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));
  return { updatedPaper, hasChange: true };
}
