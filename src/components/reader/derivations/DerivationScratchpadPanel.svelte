<script lang="ts">
  import { renderMath } from '../../../utils/katexUtils';
  import { t } from '../../../stores/localeStore';
  import { get } from 'svelte/store';
  import type { SanityResult, TensorShapeResult } from '../../../services/derivationSimulator';

  interface Props {
    scratchpadLatex?: string;
    scratchpadNotes?: string;
    scratchpadDk?: number;
    scratchpadDotProduct?: number;
    batchSize?: number;
    seqLen?: number;
    dModel?: number;
    numHeads?: number;
    sanityResult: SanityResult;
    tensorShapeResults?: TensorShapeResult;
    isVerifyingScratchpad?: boolean;
    scratchpadAiResult?: {
      isValid: boolean;
      verdictTitle: string;
      critique: string;
      stepSuggestions: string[];
      correctedLatex?: string;
    } | null;
    onverifyScratchpad?: () => void;
    oncaptureToNotes?: () => void;
  }

  let {
    scratchpadLatex = $bindable('\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V'),
    scratchpadNotes = $bindable(get(t)('derivations.scratchpadDefaultNotes')),
    scratchpadDk = $bindable(64),
    scratchpadDotProduct = $bindable(16),
    batchSize = $bindable(2),
    seqLen = $bindable(512),
    dModel = $bindable(512),
    numHeads = $bindable(8),
    sanityResult,
    tensorShapeResults = [],
    isVerifyingScratchpad = false,
    scratchpadAiResult = null,
    onverifyScratchpad,
    oncaptureToNotes
  }: Props = $props();

  let scratchpadTab = $state<'numeric' | 'tensors' | 'ai-verify'>('numeric');

  function insertSymbolToScratchpad(symbol: string) {
    scratchpadLatex += symbol;
  }
</script>

<div class="h-full flex flex-col bg-[#282828] overflow-y-auto p-5 flex flex-col gap-5">
  <!-- Scratchpad Header & Quick Symbols -->
  <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-3 shadow-inner">
    <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[17px] text-[#fabd2f]">edit_note</span>
        <span class="font-mono text-xs text-[#fabd2f] font-bold">{$t('derivations.scratchpadTitle')}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
          onclick={() => onverifyScratchpad?.()}
          disabled={isVerifyingScratchpad}
        >
          {#if isVerifyingScratchpad}
            <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
            <span>{$t('derivations.aiAuditing')}</span>
          {:else}
            <span class="material-symbols-outlined text-[13px]">verified</span>
            <span>{$t('derivations.aiVerify')}</span>
          {/if}
        </button>
        <button
          class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
          onclick={() => oncaptureToNotes?.()}
        >
          <span class="material-symbols-outlined text-[13px]">save</span>
          <span>{$t('derivations.saveSandboxNotes')}</span>
        </button>
      </div>
    </div>

    <!-- Quick Symbol Buttons -->
    <div class="flex items-center gap-1.5 overflow-x-auto py-1">
      <span class="font-mono text-[10px] text-[#a89984] shrink-0">{$t('derivations.commonSymbols')}</span>
      {#each [
        { label: '∑', insert: '\\sum_{i=1}^n ' },
        { label: '∏', insert: '\\prod_{i=1}^n ' },
        { label: 'a/b', insert: '\\frac{a}{b} ' },
        { label: '√', insert: '\\sqrt{d_k} ' },
        { label: 'softmax', insert: '\\mathrm{softmax}(z) ' },
        { label: 'W^O', insert: 'W^O ' },
        { label: 'E[X]', insert: '\\mathbb{E}[X] ' },
        { label: 'Var', insert: '\\mathrm{Var}(X) ' },
        { label: 'σ', insert: '\\sigma ' },
        { label: '∞', insert: '\\infty ' }
      ] as sym}
        <button
          class="font-mono text-xs px-2 py-0.5 rounded bg-[#282828] hover:bg-[#32302f] text-[#d5c4a1] hover:text-[#fe8019] border border-[#3c3836] shrink-0"
          onclick={() => insertSymbolToScratchpad(sym.insert)}
        >
          {sym.label}
        </button>
      {/each}
    </div>

    <!-- LaTeX Textarea Input -->
    <div class="flex flex-col gap-1.5">
      <textarea
        bind:value={scratchpadLatex}
        rows="3"
        class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 font-mono text-xs text-[#ebdbb2] focus:outline-none focus:border-[#fe8019] transition-colors resize-y leading-relaxed"
        placeholder={$t('derivations.inputLatexPlaceholder')}
      ></textarea>
    </div>

    <!-- Live KaTeX Realtime Math Preview -->
    <div class="bg-[#141617] border border-[#3c3836] p-4 rounded-lg flex flex-col items-center justify-center min-h-[70px] overflow-x-auto text-[#ebdbb2]">
      <span class="font-mono text-[9px] text-[#a89984] self-start mb-1">{$t('derivations.livePreview')}</span>
      <div class="text-[20px]">
        {@html renderMath(scratchpadLatex, true)}
      </div>
    </div>

    <!-- User Reasoning Notes -->
    <input
      type="text"
      bind:value={scratchpadNotes}
      class="w-full bg-[#141617] border border-[#3c3836] rounded px-3 py-1.5 text-xs text-[#d5c4a1] focus:outline-none focus:border-[#fabd2f]"
      placeholder={$t('derivations.inputExplanationPlaceholder')}
    />
  </div>

  <!-- Scratchpad Tool Tabs: Numerical Sanity vs Tensor Shapes vs AI Verdict -->
  <div class="flex items-center gap-2 border-b border-[#3c3836] pb-2">
    <button
      class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'numeric' ? 'bg-[#3c3836] text-[#fe8019] border border-[#fe8019]/40' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
      onclick={() => scratchpadTab = 'numeric'}
    >
      <span class="material-symbols-outlined text-[13px]">pin</span>
      <span>{$t('derivations.numericSandbox')}</span>
    </button>
    <button
      class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'tensors' ? 'bg-[#3c3836] text-[#fe8019] border border-[#fe8019]/40' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
      onclick={() => scratchpadTab = 'tensors'}
    >
      <span class="material-symbols-outlined text-[13px]">grid_view</span>
      <span>{$t('derivations.tensorSimulator')}</span>
    </button>
    {#if scratchpadAiResult}
      <button
        class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'ai-verify' ? 'bg-[#3c3836] text-[#8ec07c] border border-[#8ec07c]/40' : 'text-[#8ec07c] hover:text-[#ebdbb2]'}"
        onclick={() => scratchpadTab = 'ai-verify'}
      >
        <span class="material-symbols-outlined text-[13px]">psychology</span>
        <span>{$t('derivations.aiCritique')}</span>
      </button>
    {/if}
  </div>

  <!-- Tool Tab 1: Numerical Sanity Sandbox -->
  {#if scratchpadTab === 'numeric'}
    <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
        <span class="font-mono text-xs font-bold text-[#fabd2f]">
          {$t('derivations.saturationTitle')}
        </span>
        <span class="font-mono text-[10px] text-[#a89984]">{$t('derivations.saturationSubtitle')}</span>
      </div>

      <!-- Sliders & Inputs -->
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5 bg-[#282828] p-3 rounded-lg border border-[#3c3836]">
          <div class="flex justify-between font-mono text-xs">
            <span class="text-[#d5c4a1]">{$t('derivations.headDimDk')}</span>
            <strong class="text-[#fe8019]">{scratchpadDk}</strong>
          </div>
          <input
            type="range"
            min="4"
            max="512"
            step="4"
            bind:value={scratchpadDk}
            class="accent-[#fe8019] cursor-pointer"
          />
          <span class="font-mono text-[10px] text-[#a89984]">{$t('derivations.scaleDivisor', { val: sanityResult.sqrtDk })}</span>
        </div>

        <div class="flex flex-col gap-1.5 bg-[#282828] p-3 rounded-lg border border-[#3c3836]">
          <div class="flex justify-between font-mono text-xs">
            <span class="text-[#d5c4a1]">{$t('derivations.unscaledDotProduct')}</span>
            <strong class="text-[#fabd2f]">{scratchpadDotProduct}</strong>
          </div>
          <input
            type="range"
            min="1"
            max="64"
            step="1"
            bind:value={scratchpadDotProduct}
            class="accent-[#fabd2f] cursor-pointer"
          />
          <span class="font-mono text-[10px] text-[#a89984]">{$t('derivations.scaledValue', { val: sanityResult.scaledValue })}</span>
        </div>
      </div>

      <!-- Numerical Comparison Table -->
      <div class="grid grid-cols-2 gap-4 font-mono text-xs">
        <!-- Unscaled Column -->
        <div class="bg-[#282828] p-3.5 rounded-lg border border-[#fb4934]/40 flex flex-col gap-2">
          <div class="flex items-center justify-between border-b border-[#3c3836] pb-1">
            <span class="text-[#fb4934] font-bold">{$t('derivations.unscaledDanger')}</span>
            <span class="text-[10px] text-[#fb4934] bg-[#fb4934]/15 px-1.5 rounded">{$t('derivations.dangerBadge')}</span>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.softmaxInputVal')}</span>
            <strong class="text-[#ebdbb2]">{sanityResult.dotProduct}</strong>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.softmaxProb')}</span>
            <strong class="text-[#ebdbb2]">{(sanityResult.unscaledSigmoid * 100).toFixed(2)}%</strong>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.gradientMultiplier')}</span>
            <strong class="{sanityResult.isSaturated ? 'text-[#fb4934]' : 'text-[#ebdbb2]'}">
              {sanityResult.unscaledGradMultiplier}
            </strong>
          </div>
          {#if sanityResult.isSaturated}
            <div class="bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] p-2 rounded text-[10px] mt-1">
              {$t('derivations.gradVanishingWarning')}
            </div>
          {/if}
        </div>

        <!-- Scaled Column -->
        <div class="bg-[#282828] p-3.5 rounded-lg border border-[#b8bb26]/50 flex flex-col gap-2">
          <div class="flex items-center justify-between border-b border-[#3c3836] pb-1">
            <span class="text-[#b8bb26] font-bold">{$t('derivations.scaledSafe')}</span>
            <span class="text-[10px] text-[#b8bb26] bg-[#b8bb26]/15 px-1.5 rounded">{$t('derivations.safeBadge')}</span>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.softmaxInputVal')}</span>
            <strong class="text-[#ebdbb2]">{sanityResult.scaledValue}</strong>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.softmaxProb')}</span>
            <strong class="text-[#ebdbb2]">{(sanityResult.scaledSigmoid * 100).toFixed(2)}%</strong>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#a89984]">{$t('derivations.gradientMultiplier')}</span>
            <strong class="text-[#b8bb26]">{sanityResult.scaledGradMultiplier}</strong>
          </div>
          <div class="bg-[#b8bb26]/15 border border-[#b8bb26]/40 text-[#b8bb26] p-2 rounded text-[10px] mt-1">
            {$t('derivations.gradHealthy')}
          </div>
        </div>
      </div>
    </div>

  <!-- Tool Tab 2: Tensor Dimensional Propagator -->
  {:else if scratchpadTab === 'tensors'}
    <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
        <span class="font-mono text-xs font-bold text-[#83a598]">
          {$t('derivations.transformerDimsTitle')}
        </span>
        <span class="font-mono text-[10px] text-[#a89984]">{$t('derivations.transformerDimsSubtitle')}</span>
      </div>

      <div class="grid grid-cols-4 gap-2 font-mono text-xs">
        <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
          <span class="text-[#a89984] text-[10px]">Batch Size (B):</span>
          <input type="number" bind:value={batchSize} min="1" max="64" class="bg-transparent text-[#fe8019] font-bold focus:outline-none" />
        </div>
        <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
          <span class="text-[#a89984] text-[10px]">Seq Length (S):</span>
          <input type="number" bind:value={seqLen} min="1" max="8192" class="bg-transparent text-[#fabd2f] font-bold focus:outline-none" />
        </div>
        <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
          <span class="text-[#a89984] text-[10px]">d_model (D):</span>
          <input type="number" bind:value={dModel} min="64" max="4096" step="64" class="bg-transparent text-[#8ec07c] font-bold focus:outline-none" />
        </div>
        <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
          <span class="text-[#a89984] text-[10px]">Num Heads (H):</span>
          <input type="number" bind:value={numHeads} min="1" max="64" class="bg-transparent text-[#83a598] font-bold focus:outline-none" />
        </div>
      </div>

      <!-- Generated Shape List -->
      <div class="flex flex-col gap-2 font-mono text-xs">
        {#each tensorShapeResults as ts}
          <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded flex items-center justify-between">
            <span class="text-[#ebdbb2] font-semibold">{ts.stage}</span>
            <span class="text-[#8ec07c] bg-[#1d2021] px-2 py-0.5 rounded border border-[#504945]">{ts.shape}</span>
            <span class="text-[#a89984] text-[10px] truncate max-w-[200px]">{ts.desc}</span>
          </div>
        {/each}
      </div>
    </div>

  <!-- Tool Tab 3: AI Verification Output -->
  {:else if scratchpadAiResult}
    <div class="bg-[#1d2021] border border-[#8ec07c]/50 p-4 rounded-xl flex flex-col gap-3">
      <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
        <span class="font-mono text-xs font-bold text-[#8ec07c] flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[15px]">psychology</span>
          {scratchpadAiResult.verdictTitle}
        </span>
        <span class="font-mono text-[10px] {scratchpadAiResult.isValid ? 'text-[#b8bb26]' : 'text-[#fb4934]'}">
          {scratchpadAiResult.isValid ? $t('derivations.logicPassed') : $t('derivations.needCorrection')}
        </span>
      </div>

      <p class="text-xs text-[#d5c4a1] leading-relaxed">
        {scratchpadAiResult.critique}
      </p>

      {#if scratchpadAiResult.correctedLatex && scratchpadAiResult.correctedLatex !== scratchpadLatex}
        <div class="bg-[#282828] p-3 rounded border border-[#3c3836] flex flex-col gap-1.5">
          <span class="font-mono text-[10px] text-[#fabd2f]">{$t('derivations.mentorRigorous')}</span>
          <div class="text-[16px] text-[#ebdbb2] flex justify-center py-2">
            {@html renderMath(scratchpadAiResult.correctedLatex, true)}
          </div>
        </div>
      {/if}

      {#if scratchpadAiResult.stepSuggestions && scratchpadAiResult.stepSuggestions.length > 0}
        <div class="flex flex-col gap-1">
          <span class="font-mono text-[10px] text-[#fe8019] font-bold">{$t('derivations.mentorAdvice')}</span>
          <ul class="list-disc list-inside text-[11px] text-[#d5c4a1] space-y-1">
            {#each scratchpadAiResult.stepSuggestions as sug}
              <li>{sug}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>
