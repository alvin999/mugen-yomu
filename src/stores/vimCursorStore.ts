import { writable } from 'svelte/store';

export interface CursorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VimConfig {
  isVimEnabled: boolean;
  isBlinkEnabled: boolean;
  bounceStrength: number; // 彈跳強度：0 (關閉/無彈跳) ~ 100 (最大彈性)，預設 60
  cursorColor: string;
}

const CONFIG_STORAGE_KEY = 'mugen_vim_cursor_config';

const defaultConfig: VimConfig = {
  isVimEnabled: true,
  isBlinkEnabled: true,
  bounceStrength: 60,
  cursorColor: '#fe8019' // Gruvbox 經典亮橘
};

function loadStoredConfig(): VimConfig {
  if (typeof window === 'undefined') return defaultConfig;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultConfig,
        ...parsed,
        bounceStrength: typeof parsed.bounceStrength === 'number' ? parsed.bounceStrength : 60
      };
    }
  } catch (err) {
    console.warn('[VimCursorStore] 讀取設定失敗，使用預設值', err);
  }
  return defaultConfig;
}

function saveConfigToStorage(cfg: VimConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.warn('[VimCursorStore] 儲存設定失敗', err);
  }
}

export const vimConfigStore = writable<VimConfig>(loadStoredConfig());

export function updateVimConfig(partial: Partial<VimConfig>) {
  vimConfigStore.update((curr) => {
    const updated = { ...curr, ...partial };
    saveConfigToStorage(updated);
    return updated;
  });
}

export interface VimCursorState {
  active: boolean;
  rect: CursorRect | null;
  prevRect: CursorRect | null;
  mode: 'NORMAL' | 'VISUAL';
  sectionId: string;
  paraIndex: number;
  charIndex: number;
  isMoving: boolean;
  isHelpOpen: boolean;
  statusMessage: string;
}

const initialCursorState: VimCursorState = {
  active: false,
  rect: null,
  prevRect: null,
  mode: 'NORMAL',
  sectionId: '',
  paraIndex: 0,
  charIndex: 0,
  isMoving: false,
  isHelpOpen: false,
  statusMessage: '-- NORMAL --'
};

export const vimCursorState = writable<VimCursorState>(initialCursorState);

let moveTimer: any = null;

export function updateCursorPosition(
  rect: CursorRect,
  secId: string,
  pIndex: number,
  cIndex: number = 0,
  triggerAnimation: boolean = true
) {
  vimCursorState.update((state) => {
    const prev = triggerAnimation ? (state.rect ? { ...state.rect } : null) : null;
    return {
      ...state,
      active: true,
      prevRect: prev,
      rect,
      sectionId: secId,
      paraIndex: pIndex,
      charIndex: cIndex,
      isMoving: true
    };
  });

  // 移動時保持游標常亮，靜止 400ms 後恢復閃爍
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    vimCursorState.update((s) => ({ ...s, isMoving: false }));
  }, 400);
}

export function setVimHelpOpen(isOpen: boolean) {
  vimCursorState.update((s) => ({ ...s, isHelpOpen: isOpen }));
}

export function setVimStatusMessage(msg: string) {
  vimCursorState.update((s) => ({ ...s, statusMessage: msg }));
}

/**
 * 捲動追蹤：輕量調整游標 rect.top，不重新計算文字節點，不觸發彈跳動畫，不影響閃爍狀態
 * @param deltaScrollTop scrollTop 的變化量（向下捲動為正值，文字向上移動）
 */
export function adjustCursorForScroll(deltaScrollTop: number) {
  vimCursorState.update((state) => {
    if (!state.rect) return state;
    return {
      ...state,
      rect: { ...state.rect, top: state.rect.top - deltaScrollTop },
      prevRect: null // 瞬移定位，不觸發彈跳動畫
    };
  });
}
