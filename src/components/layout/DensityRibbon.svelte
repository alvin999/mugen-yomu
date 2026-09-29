<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { flowStore } from '../../stores/flowStore';
  import { embeddingStore } from '../../stores/embeddingStore';
  import FlowCockpitModal from './FlowCockpitModal.svelte';

  export let focusTrack: string = '§ 3.2 Attention Mechanism · Depth Level: Formal Derivation';
  export let flowWpm: number = 265;
  export let embeddingDim: number = 384;

  const dispatch = createEventDispatcher();
  let isCockpitOpen: boolean = false;

  $: activeEngineLabel = `語意檢索 (${embeddingDim}-dim)`;

  function handleOpenSemanticRadar() {
    dispatch('openSemanticSearch');
  }

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
      <span class="text-[#ebdbb2] flex items-center gap-1">
        {#if currentTelemetry?.calculationMode === 'cursor'}
          <span class="material-symbols-outlined text-[12px] text-[#fe8019]" title="🎯 游標引導精準計算">ads_click</span>
        {/if}
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

    <!-- Interactive Semantic Vector Radar Capsule -->
    <button
      type="button"
      class="flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded border border-[#fabd2f]/30 bg-[#fabd2f]/10 text-[#fabd2f] hover:bg-[#fabd2f]/20 hover:border-[#fabd2f]/50 transition-all cursor-pointer shadow-xs active:scale-98 group"
      on:click={handleOpenSemanticRadar}
      title="點擊開啟語意檢索雷達 (支援跨語言自然語意段落搜尋與 Local RAG)"
    >
      <span class="material-symbols-outlined text-[13px] text-[#fe8019] animate-pulse">radar</span>
      <span class="group-hover:text-[#fbf1c7] transition-colors">{activeEngineLabel}</span>
      <span class="material-symbols-outlined text-[11px] text-[#a89984] group-hover:text-[#fabd2f] transition-colors">manage_search</span>
    </button>
  </div>
</div>

<!-- Flow Cockpit Modal -->
<FlowCockpitModal
  isOpen={isCockpitOpen}
  on:close={() => isCockpitOpen = false}
/>

