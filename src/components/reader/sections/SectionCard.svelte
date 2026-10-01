<script lang="ts">
  import type { ChapterSection, FormulaItem, PaperDocument } from '../../../types/document';
  import { flowStore } from '../../../stores/flowStore';
  import { normalizeParagraphs } from '../../../utils/paragraphUtils';
  import { getSectionTitleParts } from '../controllers/readerScrollManager';
  import ParagraphItem from '../paragraphs/ParagraphItem.svelte';
  import SectionFormulaChips from './SectionFormulaChips.svelte';
  import CognitiveActionToolbar from './CognitiveActionToolbar.svelte';
  import { t } from '../../../stores/localeStore';

  interface Props {
    sec: ChapterSection;
    isFocused?: boolean;
    hasRead?: boolean;
    paper?: PaperDocument | null;
    readingMode?: 'bilingual' | 'split' | 'zen' | 'figures';
    focusedParagraphKey?: string;
    showTranslationMap?: Record<string, boolean>;
    translatingMap?: Record<string, boolean>;
    isTypingMap?: Record<string, boolean>;
    paragraphTranslations?: Record<string, string>;
    translationSourceMap?: Record<string, string>;
    translationNoticeMap?: Record<string, string>;
    copyToastText?: string | null;
    loadingIntuitionId?: string | null;
    loadingSyntaxId?: string | null;
    loadingTerminologyId?: string | null;
    isSectionTranslating?: boolean;
    deduplicatedFormulas?: FormulaItem[];
    onsectionClick?: (detail: { secId: string }) => void;
    onopenOriginalToPage?: (detail: { page: number; sectionId: string }) => void;
    onparagraphClick?: (detail: { secId: string; pIndex: number; text: string; clickCharIdx?: number }) => void;
    onaskCompanion?: (detail: { sec: ChapterSection; pIndex: number; text: string }) => void;
    ontoggleTranslation?: (detail: { secId: string; pIndex: number; text: string }) => void;
    onretranslate?: (detail: { secId: string; pIndex: number; text: string }) => void;
    onopenLightbox?: (detail: { url: string; caption?: string }) => void;
    oncopyLatex?: (detail: { latex: string }) => void;
    oncopyTranslation?: (detail: { text: string }) => void;
    onsaveNote?: (detail: any) => void;
    onskipTyping?: (detail: { key: string }) => void;
    onopenSettings?: () => void;
    onjumpToFormulaStudio?: (detail: { formula: FormulaItem; section: ChapterSection }) => void;
    onlocateFormula?: (detail: { formula: FormulaItem; section: ChapterSection }) => void;
    oncognitiveAction?: (detail: { action: string; sec: ChapterSection }) => void;
    ontranslateSection?: (detail: { sec: ChapterSection }) => void;
    onaddNote?: (detail: { title: string }) => void;
  }

  let {
    sec,
    isFocused = false,
    hasRead = false,
    paper = null,
    readingMode = 'bilingual',
    focusedParagraphKey = '',
    showTranslationMap = {},
    translatingMap = {},
    isTypingMap = {},
    paragraphTranslations = {},
    translationSourceMap = {},
    translationNoticeMap = {},
    copyToastText = null,
    loadingIntuitionId = null,
    loadingSyntaxId = null,
    loadingTerminologyId = null,
    isSectionTranslating = false,
    deduplicatedFormulas = [],
    onsectionClick,
    onopenOriginalToPage,
    onparagraphClick,
    onaskCompanion,
    ontoggleTranslation,
    onretranslate,
    onopenLightbox,
    oncopyLatex,
    oncopyTranslation,
    onsaveNote,
    onskipTyping,
    onopenSettings,
    onjumpToFormulaStudio,
    onlocateFormula,
    oncognitiveAction,
    ontranslateSection,
    onaddNote
  }: Props = $props();

  let titleInfo = $derived(getSectionTitleParts(sec.title, sec.id));
  let normalizedParas = $derived(normalizeParagraphs(sec.paragraphs));
  let textParas = $derived(normalizedParas.filter(p => p.type === 'text' && p.text && p.text.trim().length > 0));
  let totalTextParas = $derived(textParas.length);
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
    onclick={() => onsectionClick?.({ secId: sec.id })}
    title={$t('reader.sectionHeading.locateTopTooltip')}
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
          onclick={(e) => { e.stopPropagation(); onopenOriginalToPage?.({ page: sec.page || 1, sectionId: sec.id }); }}
          title={paper?.type === 'web'
            ? (paper.pdfUrl ? $t('reader.sectionHeading.openInOriginalDrawer', { page: sec.page || 1 }) : $t('reader.sectionHeading.openInOriginalWeb'))
            : $t('reader.sectionHeading.openInOriginalPage', { page: sec.page || 1 })}
        >
          <span class="material-symbols-outlined text-[13px] text-[#fe8019]">
            {paper?.type === 'web' ? 'dock_to_left' : 'find_in_page'}
          </span>
          <span>
            {paper?.type === 'web'
              ? (paper.pdfUrl ? $t('reader.sectionHeading.origPage', { page: sec.page || 1 }) : $t('reader.sectionHeading.origDrawer'))
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
        onparagraphClick={(e) => onparagraphClick?.(e)}
        onaskCompanion={(e) => onaskCompanion?.(e)}
        ontoggleTranslation={(e) => ontoggleTranslation?.(e)}
        onretranslate={(e) => onretranslate?.(e)}
        onopenLightbox={(e) => onopenLightbox?.(e)}
        oncopyLatex={(e) => oncopyLatex?.(e)}
        oncopyTranslation={(e) => oncopyTranslation?.(e)}
        onsaveNote={(e) => onsaveNote?.(e)}
        onskipTyping={() => onskipTyping?.({ key })}
        onopenSettings={() => onopenSettings?.()}
      />
    {/each}
  </div>

  <!-- Section Structured Mathematical Formula Cards -->
  <SectionFormulaChips
    {sec}
    formulas={deduplicatedFormulas}
    onjumpToFormulaStudio={(e) => onjumpToFormulaStudio?.({ formula: e.formula, section: sec })}
    onlocateFormula={(e) => onlocateFormula?.({ formula: e.formulaId as any, section: sec })}
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
      onshowIntuition={(e) => oncognitiveAction?.({ action: 'showIntuition', sec: e.sec })}
      onshowSyntax={(e) => oncognitiveAction?.({ action: 'showSyntax', sec: e.sec })}
      onshowTerminology={(e) => oncognitiveAction?.({ action: 'showTerminology', sec: e.sec })}
      ontranslateSection={(e) => ontranslateSection?.({ sec: e.sec })}
      onaddNote={(e) => onaddNote?.({ title: e.title })}
    />
  {/if}
</section>
