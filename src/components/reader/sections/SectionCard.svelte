<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection, FormulaItem, PaperDocument } from '../../../types/document';
  import { flowStore } from '../../../stores/flowStore';
  import { normalizeParagraphs } from '../../../utils/paragraphUtils';
  import { getSectionTitleParts } from '../controllers/readerScrollManager';
  import ParagraphItem from '../paragraphs/ParagraphItem.svelte';
  import SectionFormulaChips from './SectionFormulaChips.svelte';
  import CognitiveActionToolbar from './CognitiveActionToolbar.svelte';

  export let sec: ChapterSection;
  export let isFocused: boolean = false;
  export let hasRead: boolean = false;
  export let paper: PaperDocument | null = null;
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';

  export let focusedParagraphKey: string = '';
  export let showTranslationMap: Record<string, boolean> = {};
  export let translatingMap: Record<string, boolean> = {};
  export let isTypingMap: Record<string, boolean> = {};
  export let paragraphTranslations: Record<string, string> = {};
  export let translationSourceMap: Record<string, string> = {};
  export let translationNoticeMap: Record<string, string> = {};
  export let copyToastText: string | null = null;

  export let loadingIntuitionId: string | null = null;
  export let loadingSyntaxId: string | null = null;
  export let loadingTerminologyId: string | null = null;
  export let isSectionTranslating: boolean = false;
  export let deduplicatedFormulas: FormulaItem[] = [];

  const dispatch = createEventDispatcher<{
    sectionClick: { secId: string };
    openOriginalToPage: { page: number; sectionId: string };
    paragraphClick: { secId: string; pIndex: number; text: string; clickCharIdx?: number };
    askCompanion: { sec: ChapterSection; pIndex: number; text: string };
    toggleTranslation: { secId: string; pIndex: number; text: string };
    retranslate: { secId: string; pIndex: number; text: string };
    openLightbox: { url: string; caption?: string };
    copyLatex: { latex: string };
    copyTranslation: { text: string };
    saveNote: any;
    skipTyping: { key: string };
    openSettings: void;
    jumpToFormulaStudio: { formula: FormulaItem; section: ChapterSection };
    locateFormula: { formula: FormulaItem; section: ChapterSection };
    cognitiveAction: { action: string; sec: ChapterSection };
    translateSection: { sec: ChapterSection };
    addNote: { title: string };
  }>();

  $: titleInfo = getSectionTitleParts(sec.title, sec.id);
  $: normalizedParas = normalizeParagraphs(sec.paragraphs);
  $: textParas = normalizedParas.filter(p => p.type === 'text' && p.text && p.text.trim().length > 0);
  $: totalTextParas = textParas.length;
</script>

<section
  id={`sec-${sec.id}`}
  class="flex flex-col gap-3 transition-[background-color,border-color,box-shadow,opacity] duration-300 rounded-xl p-4 sm:p-5 relative {
    isFocused
      ? 'bg-[#32302f] border border-[#fe8019]/60 shadow-[0_4px_24px_rgba(0,0,0,0.4)] opacity-100'
      : hasRead
        ? 'bg-[#282828]/45 hover:bg-[#282828] border border-[#3c3836]/40 opacity-75 hover:opacity-95'
        : 'bg-[#1d2021]/30 hover:bg-[#282828]/30 border border-[#3c3836]/20 opacity-35 hover:opacity-65'
  }"
>
  <div class="absolute -left-1 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full transition-opacity duration-300 {isFocused ? 'focus-lens-bar opacity-100' : 'opacity-0 pointer-events-none'}"></div>

  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="flex items-center justify-between gap-2 pb-2 mb-0.5 border-b border-[#3c3836]/60 cursor-pointer group/sec-header"
    on:click={() => dispatch('sectionClick', { secId: sec.id })}
    title="點擊定位至此章節頂部"
  >
    <div class="flex items-baseline gap-2.5 min-w-0">
      <span class="font-mono text-sm font-bold {sec.level === 1 ? 'text-[#fe8019]' : 'text-[#fabd2f] bg-[#282828] border border-[#504945]/70 px-2 py-0.5 rounded'} shrink-0">
        {titleInfo.prefix}
      </span>
      <h3 class="{sec.level === 1 ? 'text-2xl font-serif text-[#ebdbb2]' : 'text-lg sm:text-[19px] font-serif font-bold text-[#fbf1c7]'} tracking-tight truncate group-hover/sec-header:text-[#fe8019] transition-colors">
        {titleInfo.mainTitle}
      </h3>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if sec.page || paper?.pdfUrl || paper?.arxivId || paper?.type === 'web'}
        <button
          class="flex items-center gap-1 bg-[#282828] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2 py-0.5 rounded text-[11px] font-mono text-[#fabd2f] transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          on:click|stopPropagation={() => dispatch('openOriginalToPage', { page: sec.page || 1, sectionId: sec.id })}
          title={paper?.type === 'web'
            ? (paper.pdfUrl ? `在原始抽屜開啟（第 ${sec.page || 1} 頁 / 章節）` : '在原始抽屜開啟原文網頁')
            : `在原始 PDF 檢視第 ${sec.page || 1} 頁`}
        >
          <span class="material-symbols-outlined text-[13px] text-[#fe8019]">
            {paper?.type === 'web' ? 'dock_to_left' : 'find_in_page'}
          </span>
          <span>
            {paper?.type === 'web'
              ? (paper.pdfUrl ? `原 p.${sec.page || 1}` : '原文抽屜')
              : `PDF p.${sec.page || 1}`} ↗
          </span>
        </button>
      {/if}

      {#if isFocused}
        <div class="flex items-center gap-1 bg-[#fe8019]/15 border border-[#fe8019]/50 px-2 py-0.5 rounded-full text-[#fe8019]">
          <span class="material-symbols-outlined text-[13px]">center_focus_strong</span>
          <span class="font-mono text-[9px] font-semibold uppercase hidden sm:inline">Focus Lens Active</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Paragraphs with Inline Bilingual Translation & Figures -->
  <div class="flex flex-col gap-5">
    {#each normalizedParas as item}
      {@const pIndex = item.originalIndex}
      {@const key = `${sec.id}_${pIndex}`}
      <ParagraphItem
        {item}
        {sec}
        {totalTextParas}
        {readingMode}
        isParaFocused={focusedParagraphKey === key}
        isPacerActive={$flowStore.isPacerActive}
        targetPacingWpm={$flowStore.targetPacingWpm}
        showTranslation={Boolean(showTranslationMap[key])}
        isTranslating={Boolean(translatingMap[key])}
        isTyping={Boolean(isTypingMap[key])}
        translationText={paragraphTranslations[key] || ''}
        translationSource={translationSourceMap[key] || ''}
        translationNotice={translationNoticeMap[key] || ''}
        {copyToastText}
        on:paragraphClick={(e) => dispatch('paragraphClick', e.detail)}
        on:askCompanion={(e) => dispatch('askCompanion', e.detail)}
        on:toggleTranslation={(e) => dispatch('toggleTranslation', e.detail)}
        on:retranslate={(e) => dispatch('retranslate', e.detail)}
        on:openLightbox={(e) => dispatch('openLightbox', e.detail)}
        on:copyLatex={(e) => dispatch('copyLatex', e.detail)}
        on:copyTranslation={(e) => dispatch('copyTranslation', e.detail)}
        on:saveNote={(e) => dispatch('saveNote', e.detail)}
        on:skipTyping={() => dispatch('skipTyping', { key })}
        on:openSettings={() => dispatch('openSettings')}
      />
    {/each}
  </div>

  <!-- Section Structured Mathematical Formula Cards -->
  <SectionFormulaChips
    {sec}
    formulas={deduplicatedFormulas}
    on:jumpToFormulaStudio={(e) => dispatch('jumpToFormulaStudio', { formula: e.detail.formula, section: sec })}
    on:locateFormula={(e) => dispatch('locateFormula', { formula: e.detail.formulaId as any, section: sec })}
  />

  <!-- Inline Semantic Action Toolbar -->
  {#if totalTextParas > 0}
    <CognitiveActionToolbar
      {sec}
      {readingMode}
      {isFocused}
      {loadingIntuitionId}
      {loadingSyntaxId}
      {loadingTerminologyId}
      {isSectionTranslating}
      on:showIntuition={(e) => dispatch('cognitiveAction', { action: 'showIntuition', sec: e.detail.sec })}
      on:showSyntax={(e) => dispatch('cognitiveAction', { action: 'showSyntax', sec: e.detail.sec })}
      on:showTerminology={(e) => dispatch('cognitiveAction', { action: 'showTerminology', sec: e.detail.sec })}
      on:translateSection={(e) => dispatch('translateSection', { sec: e.detail.sec })}
      on:addNote={(e) => dispatch('addNote', { title: e.detail.title })}
    />
  {/if}
</section>
