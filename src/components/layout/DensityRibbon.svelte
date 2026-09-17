<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { flowStore } from '../../stores/flowStore';
  import FlowCockpitModal from './FlowCockpitModal.svelte';

  export let focusTrack: string = '§ 3.2 Attention Mechanism · Depth Level: Formal Derivation';
  export let flowWpm: number = 265;
  export let embeddingDim: number = 384;

  const dispatch = createEventDispatcher();
  let isCockpitOpen: boolean = false;

  $: currentTelemetry = $flowStore;
  $: displayWpm = currentTelemetry?.currentWpm || flowWpm;
  $: activeColor = currentTelemetry?.stateColor || '#b8bb26';
  $: activeLabel = currentTelemetry?.stateLabel || '沉浸心流 ⚡';
  $: isPaused = currentTelemetry?.isPaused || false;
  $: isPacerActive = currentTelemetry?.isPacerActive || false;

  function handleOpenCockpit() {
    isCockpitOpen = true;
    dispatch('openCockpit');
  }
</script>

<div class="h-8 bg-[#1d2021] border-b border-[#3c3836] px-4 flex items-center justify-between shrink-0 shadow-sm select-none relative z-30">
  <div class="flex items-center gap-2">
    <span class="inline-flex items-center gap-1 text-[#fabd2f] font-mono text-[10px] uppercase tracking-wider bg-[#32302f] border border-[#504945] px-1.5 py-0.5 rounded font-medium">
      <span class="material-symbols-outlined text-[12px] animate-pulse text-[#fe8019]">radar</span> Saccadic Focus Track
    </span>
    <span class="text-[#a89984] font-mono text-[11px] truncate">{focusTrack}</span>
  </div>

  <div class="flex items-center gap-3">
    <!-- Interactive Reading Flow Rate Capsule -->
    <button
      type="button"
      class="flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded border transition-all cursor-pointer shadow-xs group {isPacerActive ? 'ring-1 ring-[#fe8019]/50' : ''} hover:brightness-110 active:scale-98"
      style="background-color: {activeColor}15; border-color: {activeColor}40; color: {activeColor};"
      on:click={handleOpenCockpit}
      title="點擊開啟閱讀心流與眼動遙測儀表板 (Flow Cockpit)"
    >
      <span class="material-symbols-outlined text-[13px] animate-pulse" style="color: {activeColor};">
        {isPaused ? 'pause_circle' : 'speed'}
      </span>
      <span class="text-[#ebdbb2]">
        心流速率: <strong class="font-semibold" style="color: {activeColor};">{displayWpm} wpm</strong>
      </span>
      <span
        class="text-[9px] px-1 py-0.1 rounded font-sans font-medium hidden sm:inline-block"
        style="background-color: {activeColor}25; color: {activeColor};"
      >
        {activeLabel}
      </span>
      <span class="material-symbols-outlined text-[12px] text-[#a89984] group-hover:text-[#ebdbb2] transition-colors ml-0.5">
        open_in_new
      </span>
    </button>

    <div class="h-3 w-px bg-[#504945]"></div>

    <div class="flex items-center gap-1 font-mono text-[11px] text-[#fabd2f]">
      <span class="material-symbols-outlined text-[13px] text-[#fe8019]">bolt</span>
      <span>Local Embeddings: Active ({embeddingDim}-dim)</span>
    </div>
  </div>
</div>

<!-- Flow Cockpit Modal -->
<FlowCockpitModal
  isOpen={isCockpitOpen}
  on:close={() => isCockpitOpen = false}
/>

