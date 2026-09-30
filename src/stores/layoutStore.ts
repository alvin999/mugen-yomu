/**
 * @file layoutStore.ts
 * @description 全域版面與側邊欄狀態管理：封裝 LocalStorage 持久化、SSR 安全防護與響應式切換
 */

import { writable } from 'svelte/store';

const STORAGE_KEY_RAIL_COLLAPSED = 'mugen_rail_collapsed';

/**
 * 從 LocalStorage 載入側邊欄收合狀態（SSR 安全防護）
 */
function loadStoredRailCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_RAIL_COLLAPSED);
    return saved === 'true';
  } catch (err) {
    console.warn('[LayoutStore] 讀取側邊欄收合狀態失敗:', err);
    return false;
  }
}

/**
 * 儲存側邊欄收合狀態至 LocalStorage
 */
function saveRailCollapsedToStorage(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_RAIL_COLLAPSED, String(collapsed));
  } catch (err) {
    console.warn('[LayoutStore] 儲存側邊欄收合狀態至 LocalStorage 失敗:', err);
  }
}

/**
 * 主側邊導覽欄 (Navigation Rail) 收合狀態 Store
 * false: 展開 (寬度 240px)
 * true: 收合 (寬度 64px 緊湊圖示模式)
 */
export const isRailCollapsedStore = writable<boolean>(loadStoredRailCollapsed());

/**
 * 切換側邊欄收合/展開狀態，並自動寫入 LocalStorage 持久化記憶
 * @param forceState 若提供則強制設定為該布林值
 * @returns 更新後的狀態
 */
export function toggleRailCollapse(forceState?: boolean): boolean {
  let nextState: boolean = false;
  isRailCollapsedStore.update(curr => {
    nextState = typeof forceState === 'boolean' ? forceState : !curr;
    saveRailCollapsedToStorage(nextState);
    return nextState;
  });
  return nextState;
}

/**
 * 明確設定側邊欄收合狀態並持久化
 */
export function setRailCollapsed(collapsed: boolean): void {
  toggleRailCollapse(collapsed);
}
