<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection } from '../../../types/document';

  export let sec: ChapterSection;
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isFocused: boolean = false;
  export let loadingIntuitionId: string | null = null;
  export let loadingSyntaxId: string | null = null;
  export let loadingTerminologyId: string | null = null;
  export let isSectionTranslating: boolean = false;

  const dispatch = createEventDispatcher<{
    showIntuition: { sec: ChapterSection };
    showSyntax: { sec: ChapterSection };
    showTerminology: { sec: ChapterSection };
    translateSection: { sec: ChapterSection };
    addNote: { title: string };
  }>();
</script>

<div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg p-1.5 transition-all duration-200 {isFocused ? 'bg-[#282828] border border-[#3c3836] shadow-sm opacity-100' : 'bg-[#1d2021]/50 border border-[#3c3836]/30 opacity-60 hover:opacity-100'}">
  {#if readingMode !== 'zen'}
    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingIntuitionId === sec.id}
      on:click|stopPropagation={() => dispatch('showIntuition', { sec })}
      title="深度生成本章節的白話科學直覺"
    >
      {#if loadingIntuitionId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#fabd2f] animate-spin">sync</span>
        <span>直覺生成中...</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">lightbulb</span>
        <span>白話科學直覺</span>
      {/if}
    </button>

    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#8ec07c] border border-[#8ec07c]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingSyntaxId === sec.id}
      on:click|stopPropagation={() => dispatch('showSyntax', { sec })}
      title="解析長難句，呼叫 AI 自動拆解本節主謂賓句型"
    >
      {#if loadingSyntaxId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#8ec07c] animate-spin">sync</span>
        <span>句構拆解中...</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
        <span>句構拆解</span>
      {/if}
    </button>

    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] border border-[#504945] px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingTerminologyId === sec.id}
      on:click|stopPropagation={() => dispatch('showTerminology', { sec })}
      title="提取並對齊本節學術術語與台灣繁體標準翻譯"
    >
      {#if loadingTerminologyId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#fe8019] animate-spin">sync</span>
        <span>術語提取中...</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#fe8019]">menu_book</span>
        <span>學術術語表</span>
      {/if}
    </button>
  {/if}

  <button
    class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/40 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
    disabled={isSectionTranslating}
    on:click|stopPropagation={() => dispatch('translateSection', { sec })}
    title="依序平滑展開當前章節所有段落繁體中文翻譯（含 429 速率保護）"
  >
    {#if isSectionTranslating}
      <span class="material-symbols-outlined text-[14px] text-[#fe8019] animate-spin">sync</span>
      <span>平滑翻譯中...</span>
    {:else}
      <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">translate</span>
      <span>整節翻譯</span>
    {/if}
  </button>

  {#if readingMode !== 'zen'}
    <div class="h-4 w-px bg-[#504945] mx-0.5"></div>

    <button
      class="flex items-center gap-1.5 hover:bg-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded text-xs transition-colors cursor-pointer"
      on:click|stopPropagation={() => dispatch('addNote', { title: sec.title })}
    >
      <span class="material-symbols-outlined text-[14px]">push_pin</span>
      <span>便箋筆記</span>
    </button>
  {/if}
</div>
