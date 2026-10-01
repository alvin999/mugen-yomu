<script lang="ts">
  import type { ChapterSection } from '../../../types/document';
  import { t } from '../../../stores/localeStore';

  interface Props {
    sec: ChapterSection;
    readingMode?: 'bilingual' | 'split' | 'zen' | 'figures';
    isFocused?: boolean;
    loadingIntuitionId?: string | null;
    loadingSyntaxId?: string | null;
    loadingTerminologyId?: string | null;
    isSectionTranslating?: boolean;
    onshowIntuition?: (detail: { sec: ChapterSection }) => void;
    onshowSyntax?: (detail: { sec: ChapterSection }) => void;
    onshowTerminology?: (detail: { sec: ChapterSection }) => void;
    ontranslateSection?: (detail: { sec: ChapterSection }) => void;
    onaddNote?: (detail: { title: string }) => void;
  }

  let {
    sec,
    readingMode = 'bilingual',
    isFocused = false,
    loadingIntuitionId = null,
    loadingSyntaxId = null,
    loadingTerminologyId = null,
    isSectionTranslating = false,
    onshowIntuition,
    onshowSyntax,
    onshowTerminology,
    ontranslateSection,
    onaddNote
  }: Props = $props();
</script>

<div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg p-1.5 transition-all duration-200 {isFocused ? 'bg-[#282828] border border-[#3c3836] shadow-sm opacity-100' : 'bg-[#1d2021]/50 border border-[#3c3836]/30 opacity-60 hover:opacity-100'}">
  {#if readingMode !== 'zen'}
    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingIntuitionId === sec.id}
      onclick={(e) => { e.stopPropagation(); onshowIntuition?.({ sec }); }}
      title={$t('reader.actionToolbar.intuitionTooltip')}
    >
      {#if loadingIntuitionId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#fabd2f] animate-spin">sync</span>
        <span>{$t('reader.actionToolbar.generatingIntuition')}</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">lightbulb</span>
        <span>{$t('reader.actionToolbar.intuition')}</span>
      {/if}
    </button>

    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#8ec07c] border border-[#8ec07c]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingSyntaxId === sec.id}
      onclick={(e) => { e.stopPropagation(); onshowSyntax?.({ sec }); }}
      title={$t('reader.actionToolbar.syntaxTooltip')}
    >
      {#if loadingSyntaxId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#8ec07c] animate-spin">sync</span>
        <span>{$t('reader.actionToolbar.analyzingSyntax')}</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
        <span>{$t('reader.actionToolbar.syntax')}</span>
      {/if}
    </button>

    <button
      class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] border border-[#504945] px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      disabled={loadingTerminologyId === sec.id}
      onclick={(e) => { e.stopPropagation(); onshowTerminology?.({ sec }); }}
      title={$t('reader.actionToolbar.termsTooltip')}
    >
      {#if loadingTerminologyId === sec.id}
        <span class="material-symbols-outlined text-[14px] text-[#fe8019] animate-spin">sync</span>
        <span>{$t('reader.actionToolbar.extractingTerms')}</span>
      {:else}
        <span class="material-symbols-outlined text-[14px] text-[#fe8019]">menu_book</span>
        <span>{$t('reader.actionToolbar.terms')}</span>
      {/if}
    </button>
  {/if}

  <button
    class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/40 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
    disabled={isSectionTranslating}
    onclick={(e) => { e.stopPropagation(); ontranslateSection?.({ sec }); }}
    title={$t('reader.actionToolbar.smoothTranslateTooltip')}
  >
    {#if isSectionTranslating}
      <span class="material-symbols-outlined text-[14px] text-[#fe8019] animate-spin">sync</span>
      <span>{$t('reader.actionToolbar.translating')}</span>
    {:else}
      <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">translate</span>
      <span>{$t('reader.actionToolbar.translateSection')}</span>
    {/if}
  </button>

  {#if readingMode !== 'zen'}
    <div class="h-4 w-px bg-[#504945] mx-0.5"></div>

    <button
      class="flex items-center gap-1.5 hover:bg-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded text-xs transition-colors cursor-pointer"
      onclick={(e) => { e.stopPropagation(); onaddNote?.({ title: sec.title }); }}
    >
      <span class="material-symbols-outlined text-[14px]">push_pin</span>
      <span>{$t('reader.actionToolbar.stickyNote')}</span>
    </button>
  {/if}
</div>
