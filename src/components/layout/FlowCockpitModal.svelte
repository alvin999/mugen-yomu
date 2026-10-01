<script lang="ts">
  import { onDestroy } from 'svelte';
  import { flowStore, type FlowTelemetry } from '../../stores/flowStore';
  import { t } from '../../stores/localeStore';

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  let {
    isOpen = false,
    onclose
  }: Props = $props();

  let telemetry: FlowTelemetry;
  const unsubscribe = flowStore.subscribe(val => {
    telemetry = val;
  });

  onDestroy(() => {
    unsubscribe();
  });

  function close() {
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  function formatTime(seconds: number): string {
    const sUnit = $t('flowCockpit.secondUnit');
    const mUnit = $t('flowCockpit.minuteUnit');
    const hUnit = $t('flowCockpit.hourUnit');
    if (seconds <= 0) return `0 ${sUnit}`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} ${sUnit}`;
    if (m < 60) return `${m} ${mUnit} ${s > 0 ? s + ' ' + sUnit : ''}`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h} ${hUnit} ${remM > 0 ? remM + ' ' + mUnit : ''}`;
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
    if (confirm($t('flowCockpit.resetConfirm'))) {
      flowStore.resetSessionStats();
    }
  }

  // 計算指針在光譜條的位置 (0 ~ 100%)
  let spectrumPercent = $derived.by(() => {
    if (!telemetry) return 50;
    const wpm = telemetry.currentWpm;
    if (wpm <= 40) return 4;
    if (wpm >= 450) return 96;
    return Math.min(96, Math.max(4, Math.round(((wpm - 40) / (450 - 40)) * 100)));
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
    role="dialog"
    aria-modal="true"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
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
              {$t('flowCockpit.title')}
              <span class="text-[10px] font-mono text-[#fabd2f] bg-[#32302f] px-2 py-0.5 rounded border border-[#504945]">
                Saccadic Flow Telemetry
              </span>
            </h2>
            <p class="text-[11px] text-[#a89984]">
              {$t('flowCockpit.subtitle')}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="p-1.5 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] rounded-lg transition-colors cursor-pointer"
          onclick={close}
          title={$t('flowCockpit.close')}
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
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border shadow-xs"
                  style="background-color: {telemetry.stateColor}18; color: {telemetry.stateColor}; border-color: {telemetry.stateColor}40;"
                >
                  {telemetry.state === 'paused' ? $t('flowCockpit.statePaused') :
                   telemetry.state === 'skimming' ? $t('flowCockpit.stateSkimming') :
                   telemetry.state === 'flow' ? $t('flowCockpit.stateFlow') :
                   telemetry.state === 'deep_rigor' ? $t('flowCockpit.stateDeepRigor') :
                   (telemetry.stateLabel || $t('flowCockpit.defaultFlowState'))}
                </span>
                {#if telemetry.calculationMode === 'cursor'}
                  <span class="text-[11px] text-[#fe8019] bg-[#fe8019]/15 border border-[#fe8019]/40 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                    <span class="material-symbols-outlined text-[12px]">ads_click</span>
                    {$t('flowCockpit.cursorPacing')}
                  </span>
                {:else}
                  <span class="text-[11px] text-[#8ec07c] bg-[#8ec07c]/15 border border-[#8ec07c]/40 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                    <span class="material-symbols-outlined text-[12px]">view_stream</span>
                    {$t('flowCockpit.scrollPacing')}
                  </span>
                {/if}
                {#if telemetry.isPaused}
                  <span class="text-[11px] text-[#fe8019] bg-[#fe8019]/10 border border-[#fe8019]/30 px-1.5 py-0.2 rounded">
                    {$t('flowCockpit.idlePaused')}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-[#d5c4a1] max-w-xs leading-relaxed">
                {telemetry.flowState === 'paused' ? $t('flowCockpit.stateDescPaused') :
                 telemetry.flowState === 'skimming' ? $t('flowCockpit.stateDescSkimming') :
                 telemetry.flowState === 'flow' ? $t('flowCockpit.stateDescFlow') :
                 telemetry.flowState === 'deep_rigor' ? $t('flowCockpit.stateDescDeepRigor') :
                 telemetry.stateDescription}
              </p>
            </div>
          </div>

          <!-- Focus Score Capsule -->
          <div class="flex flex-col items-center justify-center px-4 py-3 bg-[#282828] border border-[#3c3836] rounded-xl text-center shrink-0 min-w-[110px]">
            <span class="text-[10px] text-[#a89984] font-mono uppercase tracking-wider">{$t('flowCockpit.focusScore')}</span>
            <span class="text-2xl font-mono font-bold text-[#fabd2f] mt-0.5">
              {telemetry.focusScore}<span class="text-xs text-[#a89984] font-normal">/100</span>
            </span>
            <span class="text-[10px] text-[#8ec07c] mt-0.5 flex items-center gap-0.5">
              <span class="material-symbols-outlined text-[12px]">verified</span>
              {telemetry.focusScore >= 90 ? $t('flowCockpit.focusDeep') : telemetry.focusScore >= 75 ? $t('flowCockpit.focusSteady') : $t('flowCockpit.focusLight')}
            </span>
          </div>
        </div>

        <!-- 2. Four-Level Cognitive Flow Spectrum -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-mono text-[#a89984]">
            <span class="text-[#ebdbb2] font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px] text-[#fe8019]">tune</span>
              {$t('flowCockpit.spectrumTitle')}
            </span>
            <span>{$t('flowCockpit.currentCoord', { wpm: telemetry.currentWpm })}</span>
          </div>

          <!-- Spectrum Bar Container -->
          <div class="relative pt-3 pb-1">
            <!-- Spectrum Multi-tone track -->
            <div class="h-3.5 w-full rounded-full flex overflow-hidden border border-[#504945] p-0.5 bg-[#1d2021] gap-0.5">
              <div class="flex-1 bg-[#a89984]/30 rounded-l-full" title={$t('flowCockpit.spectrumPaused')}></div>
              <div class="flex-2 bg-[#83a598]/40" title={$t('flowCockpit.spectrumDeep')}></div>
              <div class="flex-3 bg-[#fe8019]/60 relative" title={$t('flowCockpit.spectrumFlow')}>
                <span class="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#ebdbb2] uppercase tracking-wider opacity-80">
                  Sweet Spot
                </span>
              </div>
              <div class="flex-2 bg-[#8ec07c]/40 rounded-r-full" title={$t('flowCockpit.spectrumSkim')}></div>
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
              <span>{$t('flowCockpit.pausedLabel')}</span>
              <span>{$t('flowCockpit.deepLabel')}</span>
              <span class="text-[#fabd2f] font-semibold">{$t('flowCockpit.flowLabel')}</span>
              <span>{$t('flowCockpit.skimLabel')}</span>
            </div>
          </div>
        </div>

        <!-- 3. Metrics Quad Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- Average WPM -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">{$t('flowCockpit.sessionAvgWpm')}</span>
            <span class="text-lg font-mono font-bold text-[#b8bb26] mt-1">
              {telemetry.averageWpm} <span class="text-[10px] text-[#a89984] font-normal">wpm</span>
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">{$t('flowCockpit.baselineDefault', { wpm: telemetry.baselineWpm })}</span>
          </div>

          <!-- Active Focus Time -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">{$t('flowCockpit.effectiveTime')}</span>
            <span class="text-lg font-mono font-bold text-[#fabd2f] mt-1 truncate">
              {formatTime(telemetry.activeSeconds)}
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">{$t('flowCockpit.autoExcludeIdle')}</span>
          </div>

          <!-- Est. Remaining Time -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">{$t('flowCockpit.estRemaining')}</span>
            <span class="text-lg font-mono font-bold text-[#fe8019] mt-1 truncate">
              {formatTime(telemetry.estimatedTimeRemainingSec)}
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">{$t('flowCockpit.estBasedOnAvg')}</span>
          </div>

          <!-- Words Read -->
          <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col">
            <span class="text-[10px] text-[#a89984] font-mono uppercase">{$t('flowCockpit.sessionWords')}</span>
            <span class="text-lg font-mono font-bold text-[#8ec07c] mt-1">
              {telemetry.sessionWordsRead.toLocaleString()} <span class="text-[10px] text-[#a89984] font-normal">{$t('flowCockpit.wordsUnit')}</span>
            </span>
            <span class="text-[10px] text-[#a89984] mt-0.5">{$t('flowCockpit.totalWords', { words: telemetry.totalPaperWords.toLocaleString() })}</span>
          </div>
        </div>

        <!-- 4. Saccadic Flow Pacer (視線節奏導引) -->
        <div class="p-4 bg-[#1d2021] border border-[#3c3836] rounded-xl space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-[#fe8019]">auto_read_play</span>
              <div>
                <h4 class="text-xs font-semibold text-[#ebdbb2]">{$t('flowCockpit.pacerTitle')}</h4>
                <p class="text-[10px] text-[#a89984]">{$t('flowCockpit.pacerDesc')}</p>
              </div>
            </div>
            <!-- Switch Button -->
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer {telemetry.isPacerActive ? 'bg-[#fe8019]/20 text-[#fe8019] border-[#fe8019]' : 'bg-[#282828] text-[#a89984] border-[#504945] hover:text-[#ebdbb2]'}"
              onclick={togglePacer}
            >
              <span class="w-2 h-2 rounded-full {telemetry.isPacerActive ? 'bg-[#fe8019] animate-ping' : 'bg-[#504945]'}"></span>
              <span>{telemetry.isPacerActive ? $t('flowCockpit.pacerActive') : $t('flowCockpit.pacerInactive')}</span>
            </button>
          </div>

          <!-- Target Pacing Slider -->
          <div class="space-y-2 pt-1">
            <div class="flex justify-between items-center text-[11px] font-mono">
              <span class="text-[#a89984]">{$t('flowCockpit.targetSpeed')}</span>
              <span class="text-[#fabd2f] font-bold text-sm">{telemetry.targetPacingWpm} WPM</span>
            </div>
            <input
              type="range"
              min="140"
              max="450"
              step="10"
              value={telemetry.targetPacingWpm}
              oninput={handlePacerSlider}
              class="w-full h-1.5 bg-[#32302f] rounded-lg appearance-none cursor-pointer accent-[#fe8019]"
            />
            <!-- Quick Preset Buttons -->
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 180 ? 'border-[#83a598] text-[#83a598]' : ''}"
                onclick={() => setPresetPacing(180)}
              >
                {$t('flowCockpit.speedSlow')}
              </button>
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 260 ? 'border-[#fe8019] text-[#fe8019]' : ''}"
                onclick={() => setPresetPacing(260)}
              >
                {$t('flowCockpit.speedNormal')}
              </button>
              <button
                type="button"
                class="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#d5c4a1] transition-colors cursor-pointer {telemetry.targetPacingWpm === 360 ? 'border-[#8ec07c] text-[#8ec07c]' : ''}"
                onclick={() => setPresetPacing(360)}
              >
                {$t('flowCockpit.speedFast')}
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
          onclick={resetStats}
          title={$t('flowCockpit.resetStatsTooltip')}
        >
          <span class="material-symbols-outlined text-[15px]">restart_alt</span>
          <span>{$t('flowCockpit.resetStats')}</span>
        </button>

        <button
          type="button"
          class="px-4 py-1.5 text-xs font-medium text-[#282828] bg-[#fabd2f] hover:bg-[#fe8019] rounded-lg transition-colors cursor-pointer shadow-sm"
          onclick={close}
        >
          {$t('flowCockpit.doneAndReturn')}
        </button>
      </div>
    </div>
  </div>
{/if}
