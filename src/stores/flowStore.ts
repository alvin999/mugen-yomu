import { writable, derived, get } from 'svelte/store';

export type FlowState = 'skimming' | 'flow' | 'deep_rigor' | 'paused';

export interface FlowTelemetry {
  paperId: string;
  currentWpm: number;           // 即時動態 WPM (EMA 平滑)
  averageWpm: number;           // 本次 Session 平均 WPM
  baselineWpm: number;          // 基準/論文預設 WPM
  flowState: FlowState;         // 當前認知心流狀態
  stateLabel: string;           // 繁中標籤
  stateColor: string;           // 狀態代表色
  stateDescription: string;     // 狀態說明
  activeSeconds: number;        // 本篇累計有效專注秒數
  sessionWordsRead: number;     // 本次已讀字詞數
  totalPaperWords: number;      // 本篇總字詞數
  estimatedTimeRemainingSec: number; // 預估剩餘研讀時間（秒）
  focusScore: number;           // 專注度評分 (0 ~ 100)
  isPacerActive: boolean;       // 視線節奏導引光標是否啟用
  targetPacingWpm: number;      // 目標節奏 WPM (預設 260)
  isPaused: boolean;            // 是否處於閒置/暫停狀態
  recentWpmHistory: { time: number; wpm: number }[]; // 近期心流趨勢數據
}

const STORAGE_PREFIX = 'mugen_flow_state_';
const PACER_PREF_KEY = 'mugen_pacer_pref';

/**
 * 統計字詞數量：支援英文單詞與中文字元（中文字按 1.5 字換算為等效單詞）
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const clean = text.trim();
  if (!clean) return 0;

  // 提取英文單詞
  const enWords = clean.match(/[a-zA-Z0-9_\-]+/g) || [];
  // 提取 CJK 漢字
  const zhChars = clean.match(/[\u4e00-\u9fa5]/g) || [];

  const enCount = enWords.length;
  const zhEquivalent = Math.round(zhChars.length / 1.5);

  return Math.max(1, enCount + zhEquivalent);
}

// 內部滑動視窗記錄項
interface WindowEntry {
  timestamp: number;
  words: number;
}

let activePaperId = '';
let totalPaperWords = 1000;
let baselineWpm = 260;
let targetPacingWpm = 260;
let isPacerActive = false;

let activeSeconds = 0;
let sessionWordsRead = 0;
let currentWpm = 260;
let averageWpm = 260;
let lastActivityTime = Date.now();
let lastScrollActivityTime = 0;
let isPaused = false;

let windowHistory: WindowEntry[] = [];
let recentTrend: { time: number; wpm: number }[] = [];
let tickTimer: any = null;

// 讀取視線導引偏好
if (typeof window !== 'undefined') {
  try {
    const savedPref = localStorage.getItem(PACER_PREF_KEY);
    if (savedPref) {
      const parsed = JSON.parse(savedPref);
      if (parsed.targetPacingWpm) targetPacingWpm = parsed.targetPacingWpm;
      if (parsed.isPacerActive !== undefined) isPacerActive = parsed.isPacerActive;
    }
  } catch (err) {
    console.warn('[flowStore] Failed to load pacer preference:', err);
  }
}

function calculateFlowState(wpm: number, paused: boolean): { state: FlowState; label: string; color: string; desc: string } {
  if (paused) {
    return {
      state: 'paused',
      label: '視線停頓 ⏸️',
      color: '#a89984',
      desc: '長時間停留或深入思考中，計時已自動暫停'
    };
  }
  if (wpm > 320) {
    return {
      state: 'skimming',
      label: '飛速掃讀 🚀',
      color: '#8ec07c',
      desc: '快速概覽目錄與章節骨架，高效過濾脈絡'
    };
  }
  if (wpm >= 190) {
    return {
      state: 'flow',
      label: '沉浸心流 ⚡',
      color: '#fe8019',
      desc: '處於學術理解最佳黃金速率，專注吸收核心論證'
    };
  }
  return {
    state: 'deep_rigor',
    label: '深度思辨 🧠',
    color: '#83a598',
    desc: '長難句拆解、公式推導或向伴讀助理深度追問'
  };
}

function buildTelemetry(): FlowTelemetry {
  const { state, label, color, desc } = calculateFlowState(currentWpm, isPaused);
  const remainingWords = Math.max(0, totalPaperWords - sessionWordsRead);
  const effectiveSpeed = Math.max(80, isPaused ? averageWpm : currentWpm);
  const estimatedTimeRemainingSec = Math.round((remainingWords / effectiveSpeed) * 60);

  // 專注度指數演算：基於心流狀態與連貫閱讀時長
  let baseScore = 75;
  if (state === 'flow') baseScore = 95;
  else if (state === 'deep_rigor') baseScore = 90;
  else if (state === 'skimming') baseScore = 80;
  else if (state === 'paused') baseScore = 60;

  return {
    paperId: activePaperId,
    currentWpm,
    averageWpm,
    baselineWpm,
    flowState: state,
    stateLabel: label,
    stateColor: color,
    stateDescription: desc,
    activeSeconds,
    sessionWordsRead,
    totalPaperWords,
    estimatedTimeRemainingSec,
    focusScore: baseScore,
    isPacerActive,
    targetPacingWpm,
    isPaused,
    recentWpmHistory: [...recentTrend]
  };
}

const store = writable<FlowTelemetry>(buildTelemetry());

// 儲存狀態至 LocalStorage
function persistState() {
  if (typeof window === 'undefined' || !activePaperId) return;
  try {
    const payload = {
      activeSeconds,
      sessionWordsRead,
      averageWpm,
      currentWpm,
      lastSaved: Date.now()
    };
    localStorage.setItem(`${STORAGE_PREFIX}${activePaperId}`, JSON.stringify(payload));
  } catch (err) {
    console.warn('[flowStore] Save failed:', err);
  }
}

// 儲存節奏引導偏好
function persistPacerPrefs() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PACER_PREF_KEY, JSON.stringify({
      targetPacingWpm,
      isPacerActive
    }));
  } catch (err) {
    console.warn('[flowStore] Save pacer prefs failed:', err);
  }
}

// 核心定時器（每 1 秒更新一次）
function startTimer() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const now = Date.now();
    const idleSeconds = (now - lastActivityTime) / 1000;

    // 閒置判斷：超過 35 秒無任何閱讀互動則判定為暫停
    if (idleSeconds > 35) {
      if (!isPaused) {
        isPaused = true;
        store.set(buildTelemetry());
      }
      return;
    }

    if (isPaused) {
      isPaused = false;
    }

    // 累加有效閱讀秒數
    activeSeconds += 1;

    // 清理滑動視窗（由 25 秒縮短為 8 秒，確保高速滾動數據及時釋放，不再卡速）
    const windowCutoff = now - 8000;
    windowHistory = windowHistory.filter(e => e.timestamp >= windowCutoff);

    // 計算滑動視窗字數與速率
    const windowWords = windowHistory.reduce((acc, cur) => acc + cur.words, 0);
    const timeSinceLastScroll = now - lastScrollActivityTime;

    if (timeSinceLastScroll > 1200 && currentWpm > baselineWpm) {
      // 讀者停止滾動後，速率靈敏平滑回落至沉浸心流區間 (2~3 秒內自然下降)
      currentWpm = Math.round(currentWpm * 0.72 + baselineWpm * 0.28);
    } else if (windowWords > 0 && windowHistory.length >= 2) {
      const timeSpanSec = Math.max(3, (windowHistory[windowHistory.length - 1].timestamp - windowHistory[0].timestamp) / 1000);
      const rawWindowWpm = Math.round((windowWords / timeSpanSec) * 60);
      // EMA 指數移動平均平滑化 (alpha = 0.3)
      currentWpm = Math.round(currentWpm * 0.7 + rawWindowWpm * 0.3);
      currentWpm = Math.max(50, Math.min(500, currentWpm));
    } else if (windowWords > 0) {
      const elapsed = Math.max(2, (now - windowHistory[0].timestamp) / 1000);
      const singleWpm = Math.round((windowWords / elapsed) * 60);
      currentWpm = Math.round(currentWpm * 0.8 + Math.min(480, Math.max(120, singleWpm)) * 0.2);
    } else {
      // 無新字數時，自然回歸至基準/思辨速率
      currentWpm = Math.round(currentWpm * 0.88 + baselineWpm * 0.12);
    }

    // 更新本次 Session 平均 WPM
    if (activeSeconds >= 10 && sessionWordsRead > 20) {
      averageWpm = Math.round((sessionWordsRead / activeSeconds) * 60);
      averageWpm = Math.max(60, Math.min(600, averageWpm));
    }

    // 記錄趨勢（每 5 秒取樣一次，最多保留 20 筆）
    if (activeSeconds % 5 === 0) {
      recentTrend.push({ time: now, wpm: currentWpm });
      if (recentTrend.length > 20) recentTrend.shift();
    }

    // 每 15 秒自動持久化
    if (activeSeconds % 15 === 0) {
      persistState();
    }

    store.set(buildTelemetry());
  }, 1000);
}

// 匯出 Store API
export const flowStore = {
  subscribe: store.subscribe,

  /**
   * 初始化論文心流狀態
   */
  initForPaper(paperId: string, totalWords: number = 1000, baselineSpeed: number = 260) {
    if (!paperId) return;

    // 若同一篇論文且已初始化過，僅更新總字數
    if (activePaperId === paperId) {
      totalPaperWords = totalWords;
      store.set(buildTelemetry());
      return;
    }

    // 切換新論文，儲存舊論文狀態
    if (activePaperId) {
      persistState();
    }

    activePaperId = paperId;
    totalPaperWords = totalWords;
    baselineWpm = baselineSpeed || 260;
    currentWpm = baselineWpm;
    averageWpm = baselineWpm;
    lastActivityTime = Date.now();
    isPaused = false;
    windowHistory = [];
    recentTrend = [];

    // 嘗試讀取本篇在 LocalStorage 中的歷史紀錄
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${paperId}`);
        if (raw) {
          const saved = JSON.parse(raw);
          activeSeconds = saved.activeSeconds || 0;
          sessionWordsRead = saved.sessionWordsRead || 0;
          if (saved.averageWpm) averageWpm = saved.averageWpm;
          if (saved.currentWpm) currentWpm = saved.currentWpm;
        } else {
          activeSeconds = 0;
          sessionWordsRead = 0;
        }
      } catch {
        activeSeconds = 0;
        sessionWordsRead = 0;
      }
    }

    store.set(buildTelemetry());
    startTimer();
  },

  /**
   * 記錄使用者閱讀活動（段落停留、滾動滑過、展開翻譯等）
   */
  recordReadingActivity(words: number, type: 'dwell' | 'skim' | 'interact' | 'scroll' = 'dwell') {
    if (words <= 0) return;
    const now = Date.now();
    lastActivityTime = now;
    if (isPaused) {
      isPaused = false;
    }

    sessionWordsRead += words;
    windowHistory.push({ timestamp: now, words });

    // 若為滾動經過段落，根據近期段落字詞流速即時估算瞬時 WPM
    if (type === 'scroll') {
      lastScrollActivityTime = now;
      const recent = windowHistory.slice(-4);
      if (recent.length >= 2) {
        const timeDiffSec = Math.max(1, (now - recent[0].timestamp) / 1000);
        const wordsSum = recent.reduce((sum, r) => sum + r.words, 0);
        // 快速掃讀瞬時上限調優至 480~500，符合人眼極限，不再粗暴封頂於 650
        const instantWpm = Math.min(500, Math.max(140, Math.round((wordsSum / timeDiffSec) * 60)));
        currentWpm = Math.round(currentWpm * 0.65 + instantWpm * 0.35);
      } else {
        currentWpm = Math.max(currentWpm, 220);
      }
    } else if (type === 'dwell') {
      // 停留細讀時，平滑引導速率回歸沉浸心流區間 (180 ~ 240 wpm)
      currentWpm = Math.round(currentWpm * 0.78 + Math.min(260, Math.max(160, words * 12)) * 0.22);
    } else if (type === 'interact') {
      // 若為深度互動（翻譯、伴讀提問），瞬時權重偏向深度思辨
      currentWpm = Math.round(currentWpm * 0.7 + 140 * 0.3);
    }

    store.set(buildTelemetry());
  },

  /**
   * 標記使用者產生了任何互動（保持活耀狀態，防止閒置進入暫停）
   */
  touchActivity() {
    lastActivityTime = Date.now();
    if (isPaused) {
      isPaused = false;
      store.set(buildTelemetry());
    }
  },

  /**
   * 設定目標心流節奏
   */
  setTargetPacing(wpm: number) {
    targetPacingWpm = Math.max(120, Math.min(500, wpm));
    persistPacerPrefs();
    store.set(buildTelemetry());
  },

  /**
   * 切換視線節奏導引光標開關
   */
  togglePacer(enabled?: boolean) {
    isPacerActive = enabled !== undefined ? enabled : !isPacerActive;
    persistPacerPrefs();
    store.set(buildTelemetry());
  },

  /**
   * 重設本次閱讀 Session 統計
   */
  resetSessionStats() {
    activeSeconds = 0;
    sessionWordsRead = 0;
    currentWpm = baselineWpm;
    averageWpm = baselineWpm;
    windowHistory = [];
    recentTrend = [];
    lastActivityTime = Date.now();
    isPaused = false;

    if (typeof window !== 'undefined' && activePaperId) {
      localStorage.removeItem(`${STORAGE_PREFIX}${activePaperId}`);
    }

    store.set(buildTelemetry());
  }
};
