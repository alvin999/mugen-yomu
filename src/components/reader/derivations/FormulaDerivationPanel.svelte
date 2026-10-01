<script lang="ts">
  import type { PaperDocument, FormulaItem } from '../../../types/document';
  import type { FormulaDerivationData } from '../../../types/derivation';
  import type { ExtractedFormulaItem } from '../../../utils/derivationExtractor';
  import { renderMath, copyLatexToClipboard, renderLatexInSnippet } from '../../../utils/katexUtils';
  import { t } from '../../../stores/localeStore';
  import { get } from 'svelte/store';

  interface Props {
    paper?: PaperDocument | null;
    dynamicFormulas?: ExtractedFormulaItem[];
    selectedFormulaIndex?: number;
    activeDerivationTab?: 'derivation1' | 'derivation2' | 'derivation3';
    currentFormulaDerivation?: FormulaDerivationData | null;
    isDerivingFormula?: boolean;
    isScanningHeuristically?: boolean;
    onselectFormula?: (detail: { index: number }) => void;
    onselectFallbackTab?: (detail: { tab: 'derivation1' | 'derivation2' | 'derivation3' }) => void;
    onderiveFormula?: (detail: { formula: FormulaItem }) => void;
    onheuristicScan?: () => void;
    oncaptureToNotes?: () => void;
    onjumpToSection?: (detail: { sectionId: string }) => void;
    ontoast?: (detail: { text: string }) => void;
  }

  let {
    paper = null,
    dynamicFormulas = [],
    selectedFormulaIndex = 0,
    activeDerivationTab = 'derivation1',
    currentFormulaDerivation = null,
    isDerivingFormula = false,
    isScanningHeuristically = false,
    onselectFormula,
    onselectFallbackTab,
    onderiveFormula,
    onheuristicScan,
    oncaptureToNotes,
    onjumpToSection,
    ontoast
  }: Props = $props();

  let activeFormulaItem = $derived(dynamicFormulas[selectedFormulaIndex]);

  let activeSectionProvenanceId = $derived(
    activeFormulaItem?.sectionId ||
    currentFormulaDerivation?.sourceSectionId ||
    ''
  );

  let activeSectionProvenanceTitle = $derived((() => {
    const raw =
      activeFormulaItem?.sectionTitle ||
      currentFormulaDerivation?.sourceSectionTitle ||
      (dynamicFormulas.length === 0 ? '3.2.1 Scaled Dot-Product Attention' : get(t)('derivations.mainSection'));
    return raw.replace(/^§\s*/, '').trim();
  })());

  let activePageProvenance = $derived(
    activeFormulaItem?.formula.page ||
    currentFormulaDerivation?.sourcePage ||
    (dynamicFormulas.length === 0 ? 'p. 4' : '')
  );

  let activeContextSnippet = $derived(
    activeFormulaItem?.formula.sourceContextSnippet ||
    currentFormulaDerivation?.sourceContextSnippet ||
    ''
  );

  function handleCopyLatex(latex: string) {
    copyLatexToClipboard(latex);
    ontoast?.({ text: get(t)('derivations.latexCopiedToast') });
  }
</script>

<div class="h-full flex flex-col bg-[#282828] overflow-hidden">
  <!-- Formula Selector Tabs -->
  {#if dynamicFormulas.length > 0}
    <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
      <div class="flex items-center gap-1.5 overflow-x-auto max-w-[70%]">
        {#each dynamicFormulas as item, idx}
          <button
            class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 shrink-0 {selectedFormulaIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            onclick={() => onselectFormula?.({ index: idx })}
            title={$t('derivations.sourcePrefix', { title: item.sectionTitle || $t('derivations.unspecified') })}
          >
            <span class="material-symbols-outlined text-[13px]">functions</span>
            <span>{item.formula.number || `Eq (${idx + 1})`}</span>
            {#if item.sectionTitle}
              <span class="text-[9px] text-[#8ec07c] bg-[#141617] border border-[#3c3836] px-1 py-0.2 rounded font-semibold max-w-[85px] truncate">
                § {item.sectionTitle.replace(/^§\s*/, '').split(' ')[0]}
              </span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-2">
        {#if activeFormulaItem}
          <button
            class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors shadow-sm"
            onclick={() => activeFormulaItem && onderiveFormula?.({ formula: activeFormulaItem.formula })}
            disabled={isDerivingFormula}
          >
            {#if isDerivingFormula}
              <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
              <span>{$t('derivations.deriving')}</span>
            {:else}
              <span class="material-symbols-outlined text-[13px]">psychology</span>
              <span>{$t('derivations.aiStepDerivation')}</span>
            {/if}
          </button>
        {/if}
        <button
          class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors"
          onclick={() => oncaptureToNotes?.()}
          title={$t('derivations.saveProofToNotesTooltip')}
        >
          <span class="material-symbols-outlined text-[13px]">edit_note</span>
          <span>{$t('derivations.saveToNotes')}</span>
        </button>
      </div>
    </div>
  {:else}
    <!-- Fallback Demo Tabs with PREVIEW badge -->
    <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
      <div class="flex items-center gap-1.5 overflow-x-auto">
        <span class="font-mono text-[10px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded font-bold shrink-0">
          PREVIEW
        </span>
        <button
          class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => onselectFallbackTab?.({ tab: 'derivation1' })}
        >
          <span class="material-symbols-outlined text-[13px]">functions</span>
          <span>{$t('derivations.fallbackDerivation1')}</span>
        </button>
        <button
          class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => onselectFallbackTab?.({ tab: 'derivation2' })}
        >
          <span class="material-symbols-outlined text-[13px]">calculate</span>
          <span>{$t('derivations.fallbackDerivation2')}</span>
        </button>
        <button
          class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation3' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => onselectFallbackTab?.({ tab: 'derivation3' })}
        >
          <span class="material-symbols-outlined text-[13px]">speed</span>
          <span>{$t('derivations.fallbackDerivation3')}</span>
        </button>
      </div>
      <button
        class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors shrink-0"
        onclick={() => oncaptureToNotes?.()}
      >
        <span class="material-symbols-outlined text-[13px]">edit_note</span>
        <span>{$t('derivations.saveToNotes')}</span>
      </button>
    </div>
  {/if}

  <!-- Derivation Deck Scrollable Body -->
  <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
    {#if dynamicFormulas.length === 0}
      <!-- Preview Banner for Formulas -->
      <div class="bg-[#fabd2f]/10 border border-[#fabd2f]/40 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 text-[#fabd2f]">
          <span class="material-symbols-outlined text-[18px]">functions</span>
          <div class="flex flex-col">
            <span class="font-bold">{$t('derivations.previewMode')}</span>
            <span class="text-[11px] text-[#d5c4a1]">{$t('derivations.noFormulasExtracted')}</span>
          </div>
        </div>
        <button
          class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shrink-0 transition-colors shadow-sm"
          onclick={() => onheuristicScan?.()}
          disabled={isScanningHeuristically}
        >
          {#if isScanningHeuristically}
            <span class="inline-block w-2.5 h-2.5 border-2 border-[#1d2021] border-t-transparent rounded-full animate-spin"></span>
            <span>{$t('derivations.deriving')}</span>
          {:else}
            <span class="material-symbols-outlined text-[13px]">calculate</span>
            <span>{$t('derivations.extractFormulasBtn')}</span>
          {/if}
        </button>
      </div>
    {/if}

    {#if currentFormulaDerivation}
      <!-- 1. Main Formula Hero Card -->
      <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-3 shadow-inner">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
          <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[320px]">
            {currentFormulaDerivation.formulaNumber ? `${currentFormulaDerivation.formulaNumber} ` : ''}{currentFormulaDerivation.formulaName}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] px-2 py-0.5 rounded flex items-center gap-1"
              onclick={() => handleCopyLatex(currentFormulaDerivation?.latexText || '')}
              title={$t('derivations.copyLatexTooltip')}
            >
              <span class="material-symbols-outlined text-[12px]">content_copy</span>
              <span>{$t('derivations.copyLatex')}</span>
            </button>
            {#if activeSectionProvenanceId}
              <button
                class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                onclick={() => onjumpToSection?.({ sectionId: activeSectionProvenanceId })}
              >
                <span>{$t('derivations.jumpSection')}</span>
                <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- Source Provenance Banner -->
        <div class="flex flex-wrap items-center justify-between gap-2 bg-[#181a1b] border border-[#3c3836] px-3 py-1.5 rounded-lg text-xs font-mono">
          <div class="flex items-center gap-2 text-[#8ec07c] min-w-0">
            <span class="material-symbols-outlined text-[14px] text-[#fe8019] shrink-0">pin_drop</span>
            <span class="font-bold text-[#fe8019] shrink-0">{$t('derivations.paperSource')}</span>
            <span class="font-medium text-[#ebdbb2] truncate" title="§ {activeSectionProvenanceTitle}">
              § {activeSectionProvenanceTitle}
            </span>
            {#if activePageProvenance}
              <span class="text-[#a89984] bg-[#282828] border border-[#3c3836] px-1.5 py-0.5 rounded text-[10px] shrink-0">
                {activePageProvenance}
              </span>
            {/if}
          </div>
          {#if activeSectionProvenanceId}
            <button
              type="button"
              class="font-mono text-[10px] text-[#8ec07c] hover:text-[#b8bb26] hover:bg-[#282828] border border-[#8ec07c]/40 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              onclick={() => onjumpToSection?.({ sectionId: activeSectionProvenanceId })}
              title={$t('derivations.locateSectionTooltip')}
            >
              <span class="material-symbols-outlined text-[12px]">my_location</span>
              <span>{$t('derivations.locateSection')}</span>
            </button>
          {/if}
        </div>

        <!-- Context Quote Snippet -->
        {#if activeContextSnippet}
          <div class="bg-[#181a1b]/60 border-l-2 border-[#fe8019] px-3 py-1.5 rounded-r text-[11px] text-[#a89984] italic">
            <span class="text-[#fe8019] font-semibold not-italic mr-1">{$t('derivations.sourceQuoteClue')}</span>
            <span class="not-italic text-[#ebdbb2]">“{@html renderLatexInSnippet(activeContextSnippet)}”</span>
          </div>
        {/if}

        <!-- Main Formula via KaTeX -->
        <div class="py-4 flex justify-center text-[22px] text-[#ebdbb2] border-y border-[#3c3836] overflow-x-auto select-text">
          {@html renderMath(currentFormulaDerivation.latexText, true)}
        </div>

        <!-- Variables Color-Coded Definition Grid -->
        {#if activeFormulaItem?.formula.variables}
          <div class="flex flex-col gap-2 text-xs pt-1">
            <h4 class="font-mono text-[#fe8019] font-bold flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">palette</span>
              {$t('derivations.variablesDictionary')}
            </h4>
            <div class="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
              {#each activeFormulaItem.formula.variables as v}
                <div class="bg-[#282828] p-2 rounded flex items-center justify-between border border-[#3c3836]">
                  <span style="color: {v.color}">{@html renderMath(v.symbol, false)}</span>
                  <span class="text-[#d5c4a1]">{v.meaning}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- 2. Mathematical Proof & Step-by-Step Derivations -->
      <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
          <span class="font-mono text-xs text-[#8ec07c] font-bold flex items-center gap-1">
            <span class="material-symbols-outlined text-[15px]">calculate</span>
            {$t('derivations.stepByStepProof')}
          </span>
          <span class="font-mono text-[10px] text-[#a89984]">{$t('derivations.algebraicProof')}</span>
        </div>

        <!-- Initial Assumptions -->
        {#if currentFormulaDerivation.assumptions && currentFormulaDerivation.assumptions.length > 0}
          <div class="flex flex-col gap-1.5 bg-[#282828]/60 p-3 rounded-lg border border-[#3c3836]">
            <h4 class="font-mono text-[11px] font-bold text-[#fabd2f]">{$t('derivations.formulationAssumptions')}</h4>
            <ul class="list-disc list-inside text-xs text-[#d5c4a1] space-y-1">
              {#each currentFormulaDerivation.assumptions as assumption}
                <li class="leading-relaxed">{@html renderLatexInSnippet(assumption)}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Steps List -->
        <div class="flex flex-col gap-3.5">
          {#each currentFormulaDerivation.steps as step}
            <div class="bg-[#282828] border border-[#3c3836] rounded-lg p-3.5 flex flex-col gap-2 shadow-sm">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs font-bold text-[#fabd2f] flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-full bg-[#fe8019]/20 text-[#fe8019] text-[11px] flex items-center justify-center font-bold">
                    {step.stepNumber}
                  </span>
                  {step.title}
                </span>
              </div>

              <!-- Step Equation via KaTeX -->
              <div class="p-3 bg-[#1d2021] rounded border border-[#504945] font-mono text-[14px] flex justify-center overflow-x-auto text-[#ebdbb2] my-1">
                {@html renderMath(step.latexFormula, true)}
              </div>

              <p class="text-xs text-[#d5c4a1] leading-relaxed text-justify">
                {step.explanation}
              </p>

              {#if step.intuition}
                <div class="text-[11px] text-[#8ec07c] bg-[#1d2021]/60 px-2.5 py-1.5 rounded border-l-2 border-[#8ec07c] leading-relaxed flex items-center gap-1">
                  <span>💡 <strong>{$t('derivations.intuition')}</strong></span>
                  <span>{step.intuition}</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- 3. Boundary & Limit Analysis -->
        {#if currentFormulaDerivation.limitAnalysis && currentFormulaDerivation.limitAnalysis.length > 0}
          <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
            <h4 class="font-mono text-xs font-bold text-[#fe8019] flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">query_stats</span>
              {$t('derivations.boundaryAnalysis')}
            </h4>
            <div class="grid grid-cols-1 gap-2">
              {#each currentFormulaDerivation.limitAnalysis as limit}
                <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-lg flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs text-[#fabd2f] font-semibold">
                      {@html renderMath(limit.condition, false)}
                    </span>
                    {#if limit.mathSnippet}
                      <span class="font-mono text-[11px] text-[#8ec07c]">
                        {@html renderMath(limit.mathSnippet, false)}
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-[#d5c4a1] leading-relaxed">
                    {limit.consequence}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 4. Tensor Dimensional Propagation -->
        {#if currentFormulaDerivation.tensorShapes && currentFormulaDerivation.tensorShapes.length > 0}
          <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
            <h4 class="font-mono text-xs font-bold text-[#83a598] flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">view_in_ar</span>
              {$t('derivations.tensorEvolutionMatrix')}
            </h4>
            <div class="overflow-x-auto rounded-lg border border-[#3c3836]">
              <table class="w-full text-left font-mono text-xs">
                <thead class="bg-[#282828] text-[#fabd2f] border-b border-[#3c3836]">
                  <tr>
                    <th class="p-2">{$t('derivations.opStage')}</th>
                    <th class="p-2 text-[#8ec07c]">{$t('derivations.tensorShape')}</th>
                    <th class="p-2">{$t('derivations.dimMeaning')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#3c3836] bg-[#1d2021]/50 text-[#d5c4a1]">
                  {#each currentFormulaDerivation.tensorShapes as ts}
                    <tr>
                      <td class="p-2 text-[#ebdbb2] font-semibold">{ts.stage}</td>
                      <td class="p-2 text-[#8ec07c]">{@html renderMath(ts.shape, false)}</td>
                      <td class="p-2 text-[11px]">{ts.description}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- 5. Physical Intuition Banner -->
        <div class="bg-[#32302f] border-l-4 border-[#fe8019] p-3 rounded-r-lg text-xs text-[#ebdbb2] leading-relaxed">
          <span class="font-bold text-[#fe8019]">{$t('derivations.scientificIntuition')}</span>
          {currentFormulaDerivation.physicalIntuition}
        </div>
      </div>
    {/if}
  </div>
</div>
