<script lang="ts">
  /**
   * @deprecated 請優先使用 MugenReader.svelte。
   * 本元件作為向下相容轉發層，保證既有外部模組調用不受破壞。
   */
  import MugenReader from './MugenReader.svelte';
  import type { PaperDocument } from '../../types/document';

  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isAbstractCollapsed: boolean = false;

  export let focusedParagraphKey: string = '';
  export let focusedParagraphText: string = '';
  export let selectedText: string = '';

  export let loadingIntuitionId: string | null = null;
  export let loadingSyntaxId: string | null = null;
  export let loadingTerminologyId: string | null = null;

  let readerInstance: MugenReader;

  export function scrollToTarget(targetId: string, sectionId?: string, formulaNumber?: string) {
    if (readerInstance && readerInstance.scrollToTarget) {
      readerInstance.scrollToTarget(targetId, sectionId, formulaNumber);
    }
  }

  export function focusSectionFirstParagraph(
    targetSecId: string,
    options: { syncImmediately?: boolean } = {}
  ): boolean {
    if (readerInstance && readerInstance.focusSectionFirstParagraph) {
      return readerInstance.focusSectionFirstParagraph(targetSecId, options);
    }
    return false;
  }

  export function resetScrollAndProgress() {
    if (readerInstance && readerInstance.resetScrollAndProgress) {
      readerInstance.resetScrollAndProgress();
    }
  }

  export function highlightAndScrollToParagraph(paragraphKey: string) {
    if (readerInstance && readerInstance.highlightAndScrollToParagraph) {
      readerInstance.highlightAndScrollToParagraph(paragraphKey);
    }
  }
</script>

<MugenReader
  bind:this={readerInstance}
  {paper}
  {activeSectionId}
  {readingMode}
  {isAbstractCollapsed}
  bind:focusedParagraphKey
  bind:focusedParagraphText
  bind:selectedText
  {loadingIntuitionId}
  {loadingSyntaxId}
  {loadingTerminologyId}
  on:selectSection
  on:sectionChanged
  on:paragraphFocused
  on:textSelected
  on:probeCitation
  on:readerAction
  on:sectionDwell
  on:sectionSkimmed
  on:sectionInteracted
  on:sectionsPassed
  on:paragraphsRead
  on:reachedBottom
  on:updatePaper
  on:saveNote
/>
