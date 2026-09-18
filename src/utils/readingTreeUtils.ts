/**
 * @file readingTreeUtils.ts
 * @description 論文多層章節遞迴樹深度處理、閱讀進度狀態更新與 LocalStorage 映射工具
 */

import type { ChapterSection } from '../stores/documentStore';
import { flattenSections } from '../stores/readingStore';

/**
 * 遞迴更新特定章節節點的狀態 (isRead, progress, dwellSeconds 等)
 */
export function updateSectionStateRecursive(
  sections: ChapterSection[],
  sectionId: string,
  updates: Partial<{ isRead: boolean; progress: number; dwellSeconds: number }>
): ChapterSection[] {
  return sections.map(s => {
    if (s.id === sectionId) {
      const newIsRead = updates.isRead !== undefined ? updates.isRead : s.isRead;
      const newProgress = updates.progress !== undefined ? updates.progress : (newIsRead ? 100 : s.progress);
      return {
        ...s,
        isRead: newIsRead,
        progress: newProgress
      };
    }
    if (s.children && s.children.length > 0) {
      return { ...s, children: updateSectionStateRecursive(s.children, sectionId, updates) };
    }
    return s;
  });
}

/**
 * 連帶切換目標章節及其所屬子章節之已讀/未讀狀態
 */
export function toggleSubsectionsRecursive(
  sections: ChapterSection[],
  target: ChapterSection,
  nextRead: boolean
): ChapterSection[] {
  const prefixMatch = (target.title || '').trim().match(/^([0-9]+)\.?\s+/);
  const mainNum = prefixMatch ? prefixMatch[1] : null;

  return sections.map(s => {
    let matches = s.id === target.id;
    if (target.children && target.children.length > 0) {
      if (target.children.some((c: ChapterSection) => c.id === s.id)) matches = true;
    } else if (mainNum && s.title.trim().startsWith(`${mainNum}.`)) {
      matches = true;
    }

    if (matches) {
      return {
        ...s,
        isRead: nextRead,
        progress: nextRead ? 100 : 0,
        children: s.children ? toggleSubsectionsRecursive(s.children, target, nextRead) : undefined
      };
    }

    return {
      ...s,
      children: s.children ? toggleSubsectionsRecursive(s.children, target, nextRead) : undefined
    };
  });
}

/**
 * 全部重設章節為未讀與 0% 進度
 */
export function resetSectionsProgress(sections: ChapterSection[]): ChapterSection[] {
  return sections.map(s => ({
    ...s,
    isRead: false,
    progress: 0,
    readParaIndices: [],
    children: s.children ? resetSectionsProgress(s.children) : undefined
  }));
}

/**
 * 依據閱讀之細部小段落索引集合，遞迴更新章節的 readParaIndices、progress 與 isRead
 */
export function updateSectionsParagraphsRead(
  sections: ChapterSection[],
  paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }>
): { updatedSections: ChapterSection[]; hasChange: boolean } {
  // 依 sectionId 分組收集小段落索引
  const grouped: Record<string, number[]> = {};
  for (const p of paragraphs) {
    if (!grouped[p.sectionId]) grouped[p.sectionId] = [];
    if (!grouped[p.sectionId].includes(p.paraIndex)) {
      grouped[p.sectionId].push(p.paraIndex);
    }
  }

  let hasChange = false;

  function traverse(secs: ChapterSection[]): ChapterSection[] {
    return secs.map(s => {
      let readIndices = [...(s.readParaIndices || [])];
      let changed = false;

      if (grouped[s.id]) {
        for (const idx of grouped[s.id]) {
          if (!readIndices.includes(idx)) {
            readIndices.push(idx);
            changed = true;
            hasChange = true;
          }
        }
      }

      let progress = s.progress;
      let isRead = s.isRead;
      const totalParas = s.paragraphs?.length || 0;

      if (changed && totalParas > 0) {
        progress = Math.min(100, Math.round((readIndices.length / totalParas) * 100));
        if (progress >= 100) {
          isRead = true;
        }
      }

      return {
        ...s,
        readParaIndices: readIndices,
        progress,
        isRead,
        children: s.children ? traverse(s.children) : undefined
      };
    });
  }

  const updatedSections = traverse(sections);
  return { updatedSections, hasChange };
}

/**
 * 當使用者滾動滑過前面的章節時，批次標記已讀過之章節為 100% 精讀
 */
export function updateSectionsPassed(
  sections: ChapterSection[],
  readSectionIds: string[]
): { updatedSections: ChapterSection[]; hasChange: boolean } {
  let hasChange = false;

  function traverse(secs: ChapterSection[]): ChapterSection[] {
    return secs.map(s => {
      let isRead = s.isRead;
      let progress = s.progress;
      if (readSectionIds.includes(s.id) && !s.isRead) {
        isRead = true;
        progress = 100;
        hasChange = true;
      }
      return {
        ...s,
        isRead,
        progress,
        children: s.children ? traverse(s.children) : undefined
      };
    });
  }

  const updatedSections = traverse(sections);
  return { updatedSections, hasChange };
}

/**
 * 文末觸底時，將所有章節標記為已讀與 100% 進度
 */
export function markAllSectionsRead(sections: ChapterSection[]): ChapterSection[] {
  return sections.map(s => ({
    ...s,
    isRead: true,
    progress: 100,
    children: s.children ? markAllSectionsRead(s.children) : undefined
  }));
}

/**
 * 將章節階層展開並組裝為 LocalStorage 持久化狀態物件
 */
export function buildReadingStateMap(sections: ChapterSection[]): Record<string, any> {
  const flattened = flattenSections(sections);
  const stateMap: Record<string, any> = {};
  for (const item of flattened) {
    stateMap[item.id] = {
      isRead: item.isRead,
      progress: item.progress,
      readParaIndices: item.readParaIndices || [],
      lastUpdated: Date.now()
    };
  }
  return stateMap;
}
