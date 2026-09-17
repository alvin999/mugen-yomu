<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { flowStore, type FlowTelemetry } from '../../stores/flowStore';

  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();

  let telemetry: FlowTelemetry;
  const unsubscribe = flowStore.subscribe(val => {
    telemetry = val;
  });

  onDestroy(() => {
    unsubscribe();
  });

  function close() {
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  function formatTime(seconds: number): string {
    if (seconds <= 0) return '0 秒';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} 秒`;
    if (m < 60) return `${m} 分 ${s > 0 ? s + ' 秒' : ''}`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h} 小時 ${remM > 0 ? remM + ' 分' : ''}`;
  }

  function handlePacerSlider(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      flowStore.setTargetPacing(val);
    }
  }

  function setPresetPacing(wpm: number) {
    flowStore.setTargetPacing(wpm);
  }

  function togglePacer() {
    flowStore.togglePacer();
  }

  function resetStats() {
    if (confirm('確定要重設本篇論文的閱讀心流速率與專注時長統計嗎？')) {
      flowStore.resetSessionStats();
    }
  }

  // 計算指針在光譜條的位置 (0 ~ 100%)
  $: spectrumPercent = (() => {
    if (!telemetry) return 50;
    const wpm = telemetry.currentWpm;
    if (wpm <= 40) return 4;
    if (wpm >= 450) return 96;
    return Math.min(96, Math.max(4, Math.round(((wpm - 40) / (450 - 40)) * 100)));
  })();
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
    on:click|self={close}
  >
    <div
      class="w-full max-w-xl bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in select-none text-[#ebdbb2]"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 py-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#32302f] border border-[#504945] flex items-center justify-center text-[#fabd2f] shadow-inner">
            <span class="material-symbols-outlined text-[19px] animate-pulse text-[#fe8019]">speed</span>
          </div>
          <div>
            <h2 class="text-base font-semibold text-[#ebdbb2] flex items-center gap-2">
              閱讀心流遙測儀表板
              <span class="text-[10px] font-mono text-[#fabd2f] bg-[#32302f] px-2 py-0.5 rounded border border-[#504945]">
                Saccadic Flow Telemetry
              </span>
            </h2>
            <p class="text-[11px] text-[#a89984]">
              實時認知負載、眼動速率與智能節奏引導監測
            </p>
          </div>
        </div>
        <button
          type="button"
          class="p-1.5 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-lg transition-colors cursor-pointer"
          on:click={close}
          title="關閉 (Esc)"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <!-- Main Body -->
      <div class="p-6 overflow-y-auto space-y-6">
        <!-- 1. Live Gauge Hero Card -->
        <div class="p-5 rounded-xl bg-[#1d2021] border border-[#3c3836] flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden">
          <div class="flex items-center gap-4">
            <div class="relative flex items-center justify-center w-20 h-20 rounded-full bg-[#282828] border-2 border-[#504945] shadow-inner">
              <span class="text-3xl font-bold font-mono text-[#ebdbb2] tracking-tight">
                {telemetry.currentWpm}
              </span>
              <span class="absolute -bottom-2 text-[9px] font-mono uppercase bg-[#32302f] px-2 py-0.2 rounded border border-[#504945] text-[#a89984]">
                wpm
              </span>
            </div>
            <div class="space-y-1 text-left">
              <div class="flex items-center gap-2">
                <span
                  class="px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border shadow-xs"
                  style="background-color: {telemetry.stateColor}18; color: {telemetry.stateColor}; border-color: {telemetry.stateColor}40;"
                >
                  {telemetry.stateLabel}
                </span>
                {#if telemetry.isPaused}
                  <span class="text-[11px] text-[#fe8019] bg-[#fe8019]/10 border border-[#fe8019]/30 px-1.5 py-0.2 rounded">
                    閒置暫停
                  </span>
                {/if}
              </div>
              <p class="text-xs text-[#d5c4a1] max-w-xs leading-relaxed">
                {telemetry.stateDescription}
              </p>
            </div>
          </div>

          <!-- Focus Score Capsule -->
          <div class="flex flex-col items-center justify-center px-4 py-3 bg-[#282828] border border-[#3c3836] rounded-xl text-center shrink-0 min-w-[110px]">
            <span class="text-[10px] text-[#a89984] font-mono uppercase tracking-wider">心流專注指數</span>
            <span class="text-2xl font-mono font-bold text-[#fabd2f] mt-0.5">
              {telemetry.focusScore}<span class="text-xs text-[#a89984] font-normal">/100</span>
            </span>
            <span class="text-[10px] text-[#8ec07c] mt-0.5 flex items-center gap-0.5">
              <span class="material-symbols-outlined text-[12px]">verified</span>
              {telemetry.focusScore >= 90 ? '極致專注' : telemetry.focusScore >= 75 ? '平穩吸收' : '低頻沉思'}
            </span>
          </div>
        </div>

        <!-- 2. Four-Level Cognitive Flow Spectrum -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-mono text-[#a89984]">
            <span class="text-[#ebdbb2] font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px] text-[#fe8019]">tune</span>
              認知心流光譜分佈 (Flow Spectrum)
            </span>
            <span>即時座標: {telemetry.currentWpm} WPM</span>
          </div>

          <!-- Spectrum Bar Container -->
          <div class="relative pt-3 pb-1">
            <!-- Spectrum Multi-tone track -->
            <div class="h-3.5 w-full rounded-full flex overflow-hidden border border-[#504945] p-0.5 bg-[#1d2021] gap-0.5">
              <div class="flex-1 bg-[#a89984]/30 rounded-l-full" title="視線停頓 (<60 wpm)"></div>
              <div class="flex-2 bg-[#83a598]/40" title="深度思辨 (60~190 wpm)"></div>
              <div class="flex-3 bg-[#fe8019]/60 relative" title="沉浸心流 (190~320 wpm - 黃金區間)">
                <span class="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#ebdbb2] uppercase tracking-wider opacity-80">
                  Sweet Spot
                </span>
              </div>
              <div class="flex-2 bg-[#8ec07c]/40 rounded-r-full" title="飛速掃讀 (>320 wpm)"></div>
            </div>

            <!-- Position Pointer Indicator -->
            <div
              class="absolute top-0 transform -translate-x-1/2 transition-all duration-300 pointer-events-none flex flex-col items-center"
              style="left: {spectrumPercent}%;"
            >
              <div class="w-3 h-3 rotate-45 bg-[#fabd2f] border-2 border-[#1d2021] shadow-md"></div>
            </div>

            <!-- Spectrum Labels -->
            <div class="flex justify-between items-center text-[10px] font-mono text-[#a89984] pt-2 px-1">
              <span>⏸️ 停頓 (&lt;60)</span>
              <span>🧠 深度思辨 (60-190)</span>
              <span class="text-[#fabd2f] font-semibold">⚡ 沉浸心流 (190-320)</span>
              <span>🚀 飛速掃讀 (&gt;320)</span>
            </div>
          </div>
        </div>

        <!-- 3. Metrics Quad Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- Average WPM -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">本次研讀均速</span>
            <span class="text-lg font-mono font-bold text-[#b8bb26] mt-1">
              {telemetry.averageWpm} <span class="text-[10px] text-[#a89984] font-normal">wpm</span>
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">基準預設: {telemetry.baselineWpm}</span>
          </div>

          <!-- Active Focus Time -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">有效專注時長</span>
            <span class="text-lg font-mono font-bold text-[#fabd2f] mt-1 truncate">
              {formatTime(telemetry.activeSeconds)}
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">自動排除閒置</span>
          </div>

          <!-- Est. Remaining Time -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">預估剩餘時間</span>
            <span class="text-lg font-mono font-bold text-[#fe8019] mt-1 truncate">
              {formatTime(telemetry.estimatedTimeRemainingSec)}
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">以當前均速推估</span>
          </div>

          <!-- Words Read -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">本次研讀詞數</span>
            <span class="text-lg font-mono font-bold text-[#8ec07c] mt-1">
              {telemetry.sessionWordsRead.toLocaleString()} <span class="text-[10px] text-[#a89984] font-normal">詞</span>
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">總字詞: ~{telemetry.totalPaperWords.toLocaleString()}</span>
          </div>
        </div>

        <!-- 4. Saccadic Flow Pacer (視線節奏導引) -->
        <div class="p-4 bg-[#1d2021] border border-[#3c3836] rounded-xl space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-[#fe8019]">auto_read_play</span>
              <div>
                <h4 class="text-xs font-semibold text-[#ebdbb2]">智能視線節奏導引 (Saccadic Flow Pacer)</h4>
                <p class="text-[10px] text-[#a89984]">在當前聚焦段落提供勻速前進的微光引導線，防止視線游移與跳行</p>
              </div>
            </div>
            <!-- Switch Button -->
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer {telemetry.isPacerActive ? 'bg-[#fe8019]/20 text-[#fe8019] border-[#fe8019]' : 'bg-[#282828] text-[#a89984] border-[#504945] hover:text-[#ebdbb2]'}"
              on:click={togglePacer}
            >
              <span class="w-2 h-2 rounded-full {telemetry.isPacerActive ? 'bg-[#fe8019] animate-ping' : 'bg-[#504945]'}"></span>
              <span>{telemetry.isPacerActive ? '導引進行中' : '已關閉'}</span>
            </button>
          </div>

          <!-- Target Pacing Slider -->
          <div class="space-y-2 pt-1">
            <div class="flex justify-between items-center text-[11px] font-mono">
              <span class="text-[#a89984]">設定目標巡航速率:</span>
              <span class="text-[#fabd2f] font-bold text-sm">{telemetry.targetPacingWpm} WPM</span>
            </div>
            <input
              type="range"
              min="140"
              max="450"
              step="10"
              value={telemetry.targetPacingWpm}
              on:input={handlePacerSlider}
              class="w-full h-1.5 bg-[#32302f] rounded-lg appearance-none cursor-pointer accent-[#fe8019]"
            />
            <!-- Quick Preset Buttons -->
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 180 ? 'border-[#83a598] text-[#83a598]' : ''}"
                on:click={() => setPresetPacing(180)}
              >
                180 慢速精讀
              </button>
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 260 ? 'border-[#fe8019] text-[#fe8019]' : ''}"
                on:click={() => setPresetPacing(260)}
              >
                260 標準心流
              </button>
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 360 ? 'border-[#8ec07c] text-[#8ec07c]' : ''}"
                on:click={() => setPresetPacing(360)}
              >
                360 飛速掃讀
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-3 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-between">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#a89984] hover:text-[#fb4934] hover:bg-[#32302f] rounded border border-transparent hover:border-[#504945] transition-colors cursor-pointer"
          on:click={resetStats}
          title="重設本篇心流時長與字數統計"
        >
          <span class="material-symbols-outlined text-[15px]">restart_alt</span>
          <span>重設計時統計</span>
        </button>

        <button
          type="button"
          class="px-4 py-1.5 text-xs font-medium text-[#282828] bg-[#fabd2f] hover:bg-[#fe8019] rounded-lg transition-colors cursor-pointer shadow-sm"
          on:click={close}
        >
          完成並返回閱讀
        </button>
      </div>
    </div>
  </div>
{/if}
