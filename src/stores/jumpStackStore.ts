import { writable } from 'svelte/store';

/**
 * Vim 心流導航跳躍點 (Jump Point)
 * 記錄讀者在進行較大跨度導航、向量語意檢索或文首/文末跳轉前的歷史錨點。
 */
export interface JumpPoint {
  id: string;
  sectionId: string;
  sectionTitle?: string;
  paraIndex: number;
  charIndex: number;
  textSnippet: string; // 段落摘要（前 50 字元）
  progressPercent: number; // 全文閱讀進度百分比 (0 ~ 100)
  timestamp: number;
  source: 'semantic' | 'jump' | 'manual' | 'scroll';
}

export interface JumpStackState {
  stack: JumpPoint[]; // 最近跳躍歷史，索引 0 為最新跳躍點
  previousPoint: JumpPoint | null; // 前一個跳躍點（專供 '' 與 `` 往返瞬移切換）
  isMenuOpen: boolean; // Neovim Jump Menu HUD 開關狀態
  selectedIndex: number; // HUD 內部當前鍵盤選中項索引 (0 ~ 8)
}

const MAX_JUMP_STACK_SIZE = 20;

const initialJumpStackState: JumpStackState = {
  stack: [],
  previousPoint: null,
  isMenuOpen: false,
  selectedIndex: 0
};

export const jumpStackStore = writable<JumpStackState>(initialJumpStackState);

/**
 * 推入新的跳躍錨點
 * 說明：在執行語意搜尋跳段、gg/G 瞬移或長距跳躍前調用，將當前位置推入堆疊。
 * 具有去重防抖機制，若與頂部錨點處於相同段落且字元位移極近，則不重複推入。
 */
export function pushJumpPoint(point: Omit<JumpPoint, 'id' | 'timestamp'>) {
  jumpStackStore.update((state) => {
    const top = state.stack[0];
    if (
      top &&
      top.sectionId === point.sectionId &&
      top.paraIndex === point.paraIndex &&
      Math.abs(top.charIndex - point.charIndex) < 4
    ) {
      // 相同段落且位置極近，更新前次位置後返回
      return {
        ...state,
        previousPoint: top
      };
    }

    const newPoint: JumpPoint = {
      ...point,
      id: `jump_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now()
    };

    const newStack = [newPoint, ...state.stack].slice(0, MAX_JUMP_STACK_SIZE);
    return {
      ...state,
      stack: newStack,
      previousPoint: newPoint,
      selectedIndex: 0
    };
  });
}

/**
 * 更新前次跳躍點（用於 '' 與 `` 雙向往返切換）
 */
export function setPreviousJumpPoint(point: JumpPoint | null) {
  jumpStackStore.update((s) => ({ ...s, previousPoint: point }));
}

/**
 * 切換 Neovim Jump Menu HUD 顯示狀態
 */
export function toggleJumpMenu(open?: boolean) {
  jumpStackStore.update((s) => ({
    ...s,
    isMenuOpen: typeof open === 'boolean' ? open : !s.isMenuOpen,
    selectedIndex: 0
  }));
}

/**
 * 關閉 Neovim Jump Menu HUD
 */
export function closeJumpMenu() {
  toggleJumpMenu(false);
}

/**
 * 設定 HUD 當前鍵盤反白項目
 */
export function setJumpMenuSelectedIndex(idx: number) {
  jumpStackStore.update((s) => ({
    ...s,
    selectedIndex: Math.max(0, Math.min(s.stack.length - 1, idx))
  }));
}

/**
 * 清空所有跳躍歷史記錄
 */
export function clearJumpStack() {
  jumpStackStore.set(initialJumpStackState);
}
