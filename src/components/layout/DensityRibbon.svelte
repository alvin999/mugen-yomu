<script lang="ts">
  import { flowStore } from '../../stores/flowStore';
  import { embeddingStore } from '../../stores/embeddingStore';
  import { t } from '../../stores/localeStore';
  import FlowCockpitModal from './FlowCockpitModal.svelte';

  interface Props {
    focusTrack?: string;
    flowWpm?: number;
    embeddingDim?: number;
    onopenSemanticSearch?: () => void;
    onopenCockpit?: () => void;
  }

  let {
    focusTrack = '§ 3.2 Attention Mechanism · Depth Level: Formal Derivation',
    flowWpm = 265,
    embeddingDim = 384,
    onopenSemanticSearch,
    onopenCockpit
  }: Props = $props();

  let isCockpitOpen: boolean = $state(false);

  let activeEngineLabel = $derived($t('flowCockpit.semanticSearchLabel', { dim: embeddingDim }));
  let currentTelemetry = $derived($flowStore);
  let displayWpm = $derived(currentTelemetry?.currentWpm || flowWpm);
  let activeColor = $derived(currentTelemetry?.stateColor || '#b8bb26');
  let activeLabel = $derived(
    currentTelemetry?.flowState === 'paused' ? $t('flowCockpit.statePaused') :
    currentTelemetry?.flowState === 'skimming' ? $t('flowCockpit.stateSkimming') :
    currentTelemetry?.flowState === 'flow' ? $t('flowCockpit.stateFlow') :
    currentTelemetry?.flowState === 'deep_rigor' ? $t('flowCockpit.stateDeepRigor') :
    $t('flowCockpit.defaultFlowState')
  );
  let isPaused = $derived(currentTelemetry?.isPaused || false);
  let isPacerActive = $derived(currentTelemetry?.isPacerActive || false);

  function handleOpenSemanticRadar() {
    onopenSemanticSearch?.();
  }

  function handleOpenCockpit() {
    isCockpitOpen = true;
    onopenCockpit?.();
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
      onclick={handleOpenCockpit}
      title={$t('flowCockpit.ribbonTooltip')}
    >
      <span class="material-symbols-outlined text-[13px] animate-pulse" style="color: {activeColor};">
        {isPaused ? 'pause_circle' : 'speed'}
      </span>
      <span class="text-[#ebdbb2] flex items-center gap-1">
        {#if currentTelemetry?.calculationMode === 'cursor'}
          <span class="material-symbols-outlined text-[12px] text-[#fe8019]" title="🎯 Cursor Pacing">ads_click</span>
        {/if}
        {$t('flowCockpit.ribbonFlowSpeed')} <strong class="font-semibold" style="color: {activeColor};">{displayWpm} wpm</strong>
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
      onclick={handleOpenSemanticRadar}
      title={$t('flowCockpit.semanticSearchTooltip')}
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
  onclose={() => isCockpitOpen = false}
/>
