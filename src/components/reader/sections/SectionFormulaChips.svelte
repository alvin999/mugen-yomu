<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection, FormulaItem } from '../../../types/document';
  import { renderMath } from '../../../utils/katexUtils';

  // svelte-ignore export_let_unused
  export let sec: ChapterSection | undefined = undefined;
  export let formulas: FormulaItem[] = [];

  const dispatch = createEventDispatcher<{
    jumpToFormulaStudio: { formula: FormulaItem };
    locateFormula: { formulaId: string };
  }>();
</script>

{#if formulas && formulas.length > 0}
  <div class="flex flex-col gap-3 my-2">
    <div class="flex items-center gap-2 text-xs font-mono text-[#fabd2f] border-b border-[#3c3836]/60 pb-1.5">
      <span class="material-symbols-outlined text-[15px] text-[#fe8019]">functions</span>
      <span class="font-bold">本節核心數學模型與算子定義 ({formulas.length})</span>
    </div>

    {#each formulas as formula}
      <div class="bg-[#1d2021] border border-[#504945] rounded-xl p-4 flex flex-col items-center justify-center relative shadow-inner group/form-card transition-all hover:border-[#fe8019]/60">
        <div class="w-full flex items-center justify-between text-xs font-mono text-[#fabd2f] border-b border-[#3c3836]/60 pb-2 mb-2">
          <span class="flex items-center gap-1.5 font-bold truncate max-w-[320px]">
            <span class="text-[#fe8019]">{formula.number ? `${formula.number} ` : ''}</span>
            <span>{formula.name}</span>
          </span>
          <div class="flex items-center gap-2">
            <button
              class="font-mono text-[11px] text-[#fe8019] hover:text-[#fabd2f] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/40 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
              on:click|stopPropagation={() => dispatch('jumpToFormulaStudio', { formula })}
              title="前往推導對照工作台，檢視嚴謹分步數學證明與張量維度"
            >
              <span class="material-symbols-outlined text-[13px]">schema</span>
              <span>推導工作室</span>
            </button>
            <button
              class="font-mono text-[11px] text-[#8ec07c] hover:text-[#b8bb26] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
              on:click|stopPropagation={() => dispatch('locateFormula', { formulaId: formula.id })}
              title="在當前文獻中定位對應段落"
            >
              <span class="material-symbols-outlined text-[13px]">my_location</span>
              <span>定位原文</span>
            </button>
          </div>
        </div>

        <!-- Formula Display Rendered via KaTeX -->
        <div class="w-full flex items-center justify-center py-3 overflow-x-auto text-[#ebdbb2]">
          <div class="katex-display-container text-[20px] text-[#ebdbb2] px-2 select-none group-hover/form-card:scale-[1.01] transition-transform">
            {@html renderMath(formula.latexText, true)}
          </div>
        </div>

        <!-- Variables Hover Explanations with KaTeX Symbols -->
        {#if formula.variables && formula.variables.length > 0}
          <div class="flex flex-wrap items-center justify-center gap-2 mt-3 pt-3 border-t border-[#3c3836] w-full">
            {#each formula.variables as v}
              <span class="font-mono text-xs bg-[#282828] border border-[#3c3836] hover:border-[#504945] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm transition-colors">
                <span class="inline-flex items-center text-sm" style="color: {v.color}">
                  {@html renderMath(v.symbol, false)}
                </span>
                <span class="text-[#a89984]">:</span>
                <span class="text-[#d5c4a1]">{v.meaning}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
