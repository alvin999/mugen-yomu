/**
 * @file useSplitPane.ts
 * @description 雙軌分屏比例計算、滑鼠拖曳與邊界保護工具
 */

export interface SplitPaneOptions {
  minRatio?: number;
  maxRatio?: number;
  step?: number;
}

/**
 * 依據滑鼠 clientX 與容器 DOM 節點計算新的分割百分比
 */
export function calculateSplitRatio(
  clientX: number,
  container: HTMLElement | null,
  options: SplitPaneOptions = {}
): number {
  if (!container) return 50;
  const { minRatio = 20, maxRatio = 80 } = options;
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0) return 50;

  const offsetX = clientX - rect.left;
  const rawRatio = Math.round((offsetX / rect.width) * 100);
  return Math.max(minRatio, Math.min(maxRatio, rawRatio));
}

/**
 * 鍵盤左右鍵微調分割比例
 */
export function adjustSplitRatioByStep(
  currentRatio: number,
  direction: 'increase' | 'decrease',
  options: SplitPaneOptions = {}
): number {
  const { minRatio = 20, maxRatio = 80, step = 5 } = options;
  if (direction === 'increase') {
    return Math.min(maxRatio, currentRatio + step);
  } else {
    return Math.max(minRatio, currentRatio - step);
  }
}
