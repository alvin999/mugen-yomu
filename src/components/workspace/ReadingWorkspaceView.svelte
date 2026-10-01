<script lang="ts">
  import { onDestroy } from 'svelte';
  import DensityRibbon from '../layout/DensityRibbon.svelte';
  import ReadingMap from '../reading-map/ReadingMap.svelte';
  import MugenReader from '../reader/MugenReader.svelte';
  import DerivationsFiguresView from '../reader/DerivationsFiguresView.svelte';
  import CognitiveCompanion from '../companion/CognitiveCompanion.svelte';
  import OriginalDocumentViewer from '../reader/OriginalDocumentViewer.svelte';
  import SemanticSearchModal from '../search/SemanticSearchModal.svelte';

  import type { PaperDocument, ChapterSection } from '../../types/document';
  import { flattenSections, loadLastReadingPosition } from '../../stores/readingStore';
  import { calculateSplitRatio, adjustSplitRatioByStep } from '../../utils/useSplitPane';
  import { addNoteToPaper } from '../../stores/notesStore';
  import { t } from '../../stores/localeStore';
  import { get } from 'svelte/store';
  import {
    applySectionDwell,
    applySectionSkimmed,
    applySectionInteracted,
    toggleSectionReadState,
    resetPaperReadingProgress,
    applyParagraphsRead,
    applySectionsPassed,
    markPaperAllRead
  } from '../../services/readingProgressService';
  import {
    getStoredAiConfig,
    dispatchGenerateIntuition,
    dispatchGenerateSyntax,
    dispatchGenerateTerminology
  } from '../../services/cognitiveDispatcher';

  // Props
  interface Props {
    activePaper?: PaperDocument | null;
    readingMode?: 'bilingual' | 'split' | 'zen' | 'figures';
    zoomLevel?: number;
    isPdfDrawerOpen?: boolean;
    onupdatePaper?: (detail: { paper: PaperDocument }) => void;
    onimportPaper?: (detail: { paper: PaperDocument }) => void;
    onopenSettings?: () => void;
    onexportNotes?: () => void;
    onrefreshCacheStats?: () => void;
  }

  let {
    activePaper = null,
    readingMode = $bindable('bilingual'),
    zoomLevel = $bindable(100),
    isPdfDrawerOpen = $bindable(false),
    onupdatePaper,
    onimportPaper,
    onopenSettings,
    onexportNotes,
    onrefreshCacheStats
  }: Props = $props();

  function dispatch(event: string, detail?: any) {
    switch (event) {
      case 'updatePaper':
        onupdatePaper?.(detail);
        break;
      case 'importPaper':
        onimportPaper?.(detail);
        break;
      case 'openSettings':
        onopenSettings?.();
        break;
      case 'exportNotes':
        onexportNotes?.();
        break;
      case 'refreshCacheStats':
        onrefreshCacheStats?.();
        break;
    }
  }

  // Internal workspace state
  let splitRatio = $state<number>(50);
  let isDraggingSplit = $state<boolean>(false);
  let activeSectionId = $state<string>('');
  let activeContextText = $state<string>('');
  let activeParagraphText = $state<string>('');
  let activeSelectedText = $state<string>('');
  let activeFocusedParagraphKey = $state<string>('');
  let currentPaperId: string = '';
  let isSemanticSearchOpen = $state<boolean>(false);

  // AI Cognitive async loading indicators
  let loadingIntuitionId = $state<string | null>(null);
  let loadingSyntaxId = $state<string | null>(null);
  let loadingTerminologyId = $state<string | null>(null);

  // Component references for intra-workspace communication
  let companionRef = $state<any>(null);
  let readerRef = $state<any>(null);

  // Sync active section when activePaper changes
  $effect(() => {
    if (activePaper && activePaper.id !== currentPaperId) {
      currentPaperId = activePaper.id;
      const allSecs = flattenSections(activePaper.sections || []);
      const lastPos = loadLastReadingPosition(activePaper.id);
      let targetSec = lastPos?.sectionId ? allSecs.find(s => s.id === lastPos.sectionId) : null;
      if (!targetSec) {
        targetSec = allSecs[0];
      }
      if (targetSec) {
        activeSectionId = targetSec.id;
        activeContextText = `§ ${targetSec.title}`;
      } else {
        activeSectionId = '';
        activeContextText = '';
      }
    }
  });

  // Exported methods for App shell orchestration
  export function jumpToSection(sectionId: string, source: string = 'nav') {
    selectSection({ id: sectionId, source });
  }

  // 跨模式（例如雙語伴讀 ↔ 雙軌對照）切換時，確保視野自動捲動對齊當前 activeSectionId
  let lastReadingMode = readingMode;
  $effect(() => {
    if (readingMode !== lastReadingMode) {
      lastReadingMode = readingMode;
      if (activeSectionId) {
        setTimeout(() => {
          if (readerRef && readerRef.scrollToTarget) {
            readerRef.scrollToTarget('sec-' + activeSectionId);
          }
        }, 120);
      }
    }
  });

  export function refreshCompanionKey() {
    if (companionRef && companionRef.refreshKeyFromStorage) {
      companionRef.refreshKeyFromStorage();
    }
  }

  // --- Reading Progress Event Handlers ---
  function handleSectionDwell(e: { id: string; dwellSeconds: number } | CustomEvent<{ id: string; dwellSeconds: number }>) {
    if (!activePaper) return;
    const detail = 'detail' in e ? e.detail : e;
    const { updatedPaper, hasChange } = applySectionDwell(activePaper, detail.id, detail.dwellSeconds);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionSkimmed(e: { id: string } | CustomEvent<{ id: string }>) {
    if (!activePaper) return;
    const detail = 'detail' in e ? e.detail : e;
    const { updatedPaper, hasChange } = applySectionSkimmed(activePaper, detail.id);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionInteracted(e: { id: string; action: string } | CustomEvent<{ id: string; action: string }>) {
    if (!activePaper) return;
    const detail = 'detail' in e ? e.detail : e;
    const { updatedPaper, hasChange } = applySectionInteracted(activePaper, detail.id);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleToggleSectionRead(e: CustomEvent<{ id: string }> | { id: string }) {
    if (!activePaper) return;
    const id = 'detail' in e ? e.detail.id : e.id;
    const { updatedPaper, hasChange } = toggleSectionReadState(activePaper, id);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleResetProgress() {
    if (!activePaper) return;
    const { updatedPaper } = resetPaperReadingProgress(activePaper);
    dispatch('updatePaper', { paper: updatedPaper });

    if (readerRef && readerRef.resetScrollAndProgress) {
      readerRef.resetScrollAndProgress();
    }
  }

  function handleParagraphsRead(e: { paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }> } | CustomEvent<{ paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }> }>) {
    if (!activePaper) return;
    const detail = 'detail' in e ? e.detail : e;
    const { updatedPaper, hasChange } = applyParagraphsRead(activePaper, detail?.paragraphs || []);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionsPassed(e: { readSectionIds: string[]; currentSectionId: string } | CustomEvent<{ readSectionIds: string[]; currentSectionId: string }>) {
    if (!activePaper) return;
    const detail = 'detail' in e ? e.detail : e;
    const { updatedPaper, hasChange } = applySectionsPassed(activePaper, detail?.readSectionIds || []);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleReachedBottom() {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = markPaperAllRead(activePaper);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  // --- Split Pane Dragging Handlers ---
  function handleSplitMouseDown(_e: MouseEvent) {
    isDraggingSplit = true;
    window.addEventListener('mousemove', handleSplitMouseMove);
    window.addEventListener('mouseup', handleSplitMouseUp);
  }

  function handleSplitMouseMove(e: MouseEvent) {
    if (!isDraggingSplit) return;
    const container = document.getElementById('split-container');
    splitRatio = calculateSplitRatio(e.clientX, container, { minRatio: 25, maxRatio: 75 });
  }

  function handleSplitMouseUp() {
    isDraggingSplit = false;
    window.removeEventListener('mousemove', handleSplitMouseMove);
    window.removeEventListener('mouseup', handleSplitMouseUp);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', handleSplitMouseMove);
      window.removeEventListener('mouseup', handleSplitMouseUp);
    }
  });

  // --- Section Navigation & Focus ---
  function selectSection(detail: { id?: string; sectionId?: string; source?: string; noScroll?: boolean }) {
    const id = detail.id || detail.sectionId;
    if (!id) return;
    const { source, noScroll } = detail;
    activeSectionId = id;
    if (activePaper) {
      const allSecs = flattenSections(activePaper.sections);
      const found = allSecs.find(s => s.id === activeSectionId);
      activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
    }
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }

    const isNavigation = source === 'outline' || source === 'nav' || source === 'pdf' || source === 'web';
    if (isNavigation && !noScroll) {
      setTimeout(() => {
        if (readerRef && readerRef.scrollToTarget) {
          readerRef.scrollToTarget('sec-' + activeSectionId);
        }
      }, 30);
    }
  }

  function handleSelectSection(event: CustomEvent<{ id?: string; sectionId?: string; source?: string; noScroll?: boolean }> | { id?: string; sectionId?: string; source?: string; noScroll?: boolean }) {
    const detail = (event && 'detail' in event ? event.detail : event) || {};
    selectSection(detail);
  }

  function handleSectionChanged(event: { sectionId: string } | CustomEvent<{ sectionId: string }>) {
    const detail = 'detail' in event ? event.detail : event;
    const { sectionId } = detail || {};
    if (sectionId && sectionId !== activeSectionId) {
      activeSectionId = sectionId;
      if (activePaper) {
        const allSecs = flattenSections(activePaper.sections);
        const found = allSecs.find(s => s.id === activeSectionId);
        activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
      }
    }
  }

  function handleParagraphFocused(e: { sectionId: string; paragraphIndex: number; paragraphKey: string; text: string; selectedText: string } | CustomEvent<{ sectionId: string; paragraphIndex: number; paragraphKey: string; text: string; selectedText: string }>) {
    const detail = 'detail' in e ? e.detail : e;
    const { paragraphKey, text, selectedText } = detail;
    activeParagraphText = text;
    activeFocusedParagraphKey = paragraphKey;
    if (selectedText) activeSelectedText = selectedText;
  }

  function handleSemanticSelectParagraph(event: { sectionId: string; paragraphIndex: number; text: string; query?: string; charIndex?: number; matchedText?: string } | CustomEvent<{ sectionId: string; paragraphIndex: number; text: string; query?: string; charIndex?: number; matchedText?: string }>) {
    const detail = 'detail' in event ? event.detail : event;
    const { sectionId, paragraphIndex, text, query, charIndex } = detail;
    if (sectionId) {
      // 避免 source: 'outline' 觸發 scrollToTarget 重置到章節首字
      selectSection({ sectionId, source: 'semantic', noScroll: true });
      activeParagraphText = text;

      // 精確跳轉定位至該段落的目標字詞 (Jump to Word / Character)
      setTimeout(() => {
        if (readerRef && readerRef.focusParagraphAtChar) {
          readerRef.focusParagraphAtChar(sectionId, paragraphIndex ?? 0, charIndex ?? 0, query);
        }
      }, 50);
    }
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      isSemanticSearchOpen = !isSemanticSearchOpen;
    }
  }

  function handleTextSelected(e: CustomEvent<{ selectedText?: string; text?: string }> | { selectedText?: string; text?: string }) {
    const detail = 'detail' in e ? e.detail : e;
    activeSelectedText = detail.selectedText || detail.text || '';
  }

  function handleProbeCitation(e: { citation: string; sectionId: string; paragraphText: string } | CustomEvent<{ citation: string; sectionId: string; paragraphText: string }>) {
    const detail = 'detail' in e ? e.detail : e;
    const { citation, paragraphText } = detail;
    if (paragraphText) activeParagraphText = paragraphText;
    if (companionRef && companionRef.askWithCustomPrompt) {
      companionRef.askWithCustomPrompt(get(t)('workspace.askCitationPrompt', { citation }));
    }
  }

  function handleLocateSource(e: { paragraphKey: string } | CustomEvent<{ paragraphKey: string }>) {
    const detail = 'detail' in e ? e.detail : e;
    const { paragraphKey } = detail;
    if (readerRef && readerRef.highlightAndScrollToParagraph) {
      readerRef.highlightAndScrollToParagraph(paragraphKey);
    }
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string; imageUrl?: string; name?: string }> | { figId: string; imageUrl?: string; name?: string }) {
    const detail = (event && 'detail' in event ? event.detail : event) || {};
    const { imageUrl, name } = detail;
    if (imageUrl && readerRef && (readerRef as any).openLightbox) {
      (readerRef as any).openLightbox(imageUrl, name || $t('formula.previewMode'));
    } else {
      readingMode = 'figures';
    }
  }

  function handleSelectEquation(event: CustomEvent<{ eqId: string; sectionId?: string; formulaNumber?: string }> | { eqId: string; sectionId?: string; formulaNumber?: string }) {
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    const detail = (event && 'detail' in event ? event.detail : event) || {};
    const targetEqId = detail.eqId;
    const targetSecId = detail.sectionId;
    const formulaNumber = detail.formulaNumber;

    if (activePaper?.sections) {
      const allSecs = flattenSections(activePaper.sections);
      let formulaSec = targetSecId ? allSecs.find(s => s.id === targetSecId) : undefined;
      if (!formulaSec) {
        formulaSec = allSecs.find(s => s.formulas && s.formulas.some((f: any) => f.id === targetEqId)) || allSecs[0];
      }
      if (formulaSec) {
        activeSectionId = formulaSec.id;
        activeContextText = `§ ${formulaSec.title}`;
      }
    }
    setTimeout(() => {
      if (readerRef && readerRef.scrollToTarget) {
        readerRef.scrollToTarget('eq-' + targetEqId, targetSecId, formulaNumber);
      }
    }, 150);
  }

  function handleSectionsAligned(event: { sections: ChapterSection[] } | CustomEvent<{ sections: ChapterSection[] }>) {
    const detail = 'detail' in event ? event.detail : event;
    if (activePaper && detail.sections) {
      const updatedPaper = { ...activePaper, sections: detail.sections };
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  // --- AI Companion Cognitive Generators ---
  async function generateIntuitionForSection(sec: ChapterSection) {
    if (!sec || !sec.id || !activePaper) return;
    loadingIntuitionId = sec.id;
    try {
      await dispatchGenerateIntuition(activePaper, sec, getStoredAiConfig());
      dispatch('updatePaper', { paper: { ...activePaper } });
      dispatch('refreshCacheStats');
      setTimeout(() => {
        companionRef?.focusCard('intuition');
      }, 80);
    } catch (e) {
      console.warn('生成白話科學直覺失敗:', e);
    } finally {
      loadingIntuitionId = null;
    }
  }

  async function generateSyntaxForSection(sec: ChapterSection, selectedText?: string) {
    if (!sec || !sec.id || !activePaper) return;
    loadingSyntaxId = sec.id;
    try {
      await dispatchGenerateSyntax(activePaper, sec, selectedText, getStoredAiConfig());
      dispatch('updatePaper', { paper: { ...activePaper } });
      dispatch('refreshCacheStats');
      setTimeout(() => {
        companionRef?.focusCard('syntax');
      }, 80);
    } catch (e) {
      console.warn('生成長難句拆解失敗:', e);
    } finally {
      loadingSyntaxId = null;
    }
  }

  async function generateTerminologyForSection(sec: ChapterSection) {
    if (!sec || !sec.id || !activePaper) return;
    loadingTerminologyId = sec.id;
    try {
      await dispatchGenerateTerminology(activePaper, sec, getStoredAiConfig());
      dispatch('updatePaper', { paper: { ...activePaper } });
      dispatch('refreshCacheStats');
      setTimeout(() => {
        companionRef?.focusCard('terminology');
      }, 80);
    } catch (e) {
      console.warn('生成術語對齊失敗:', e);
    } finally {
      loadingTerminologyId = null;
    }
  }

  function handleCompanionTriggerGenerate(e: { type: 'intuition' | 'syntax' | 'terminology' } | CustomEvent<{ type: string }>) {
    const detail = 'detail' in e ? e.detail : e;
    const { type } = detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const sec = allSecs.find(s => s.id === activeSectionId) || allSecs[0];
    if (!sec) return;

    if (type === 'intuition') {
      generateIntuitionForSection(sec);
    } else if (type === 'syntax') {
      generateSyntaxForSection(sec);
    } else if (type === 'terminology') {
      generateTerminologyForSection(sec);
    }
  }

  function handleReaderAction(event: { action: string; payload?: any; section?: ChapterSection; selectedText?: string; [key: string]: any } | CustomEvent<{ action: string; payload?: any; section?: ChapterSection; selectedText?: string }>) {
    const detail = 'detail' in event ? event.detail : event;
    const { action, payload, section, selectedText } = detail;

    let targetSec = section;
    if (!targetSec && activePaper) {
      const allSecs = flattenSections(activePaper.sections);
      targetSec = allSecs.find(s => s.id === (payload || activeSectionId));
    }

    if (targetSec && activeSectionId !== targetSec.id) {
      activeSectionId = targetSec.id;
    }

    const secTitle = targetSec ? targetSec.title : activeSectionId;

    if (action === 'explainTerm') {
      activeContextText = get(t)('workspace.termAnalysisContext', { term: payload });
    } else if (action === 'showIntuition') {
      activeContextText = get(t)('workspace.intuitionContext', { title: secTitle });
      if (targetSec) {
        const hasValidIntuition =
          activePaper?.companionData?.[targetSec.id]?.intuition &&
          activePaper.companionData[targetSec.id].intuition.tag !== '待 AI 解析' &&
          !activePaper.companionData[targetSec.id].intuition.title.includes('的核心探討');
        if (hasValidIntuition) {
          companionRef?.focusCard('intuition');
        } else {
          generateIntuitionForSection(targetSec);
        }
      }
    } else if (action === 'showSyntax') {
      activeContextText = get(t)('workspace.syntaxContext', { title: secTitle });
      if (targetSec) {
        const hasSyntax = activePaper?.companionData?.[targetSec.id]?.syntaxTree;
        if (hasSyntax && !selectedText) {
          companionRef?.focusCard('syntax');
        } else {
          generateSyntaxForSection(targetSec, selectedText);
        }
      }
    } else if (action === 'showTerminology') {
      activeContextText = get(t)('workspace.termsContext', { title: secTitle });
      if (targetSec) {
        const terms = activePaper?.companionData?.[targetSec.id]?.terminology;
        const hasTerms = terms && terms.length > 1;
        if (hasTerms) {
          companionRef?.focusCard('terminology');
        } else {
          generateTerminologyForSection(targetSec);
        }
      }
    } else if (action === 'addNote') {
      const noteTitle = payload || activeContextText;
      if (activePaper) {
        addNoteToPaper({
          title: noteTitle,
          text: get(t)('workspace.defaultNoteText', { context: activeContextText }),
          paperId: activePaper.id,
          paperTitle: activePaper.title,
          sectionId: activeSectionId,
          sectionTitle: secTitle
        });
      }
      alert(get(t)('workspace.noteAddedAlert', { title: noteTitle }));
    } else if (action === 'focusCompanion') {
      const { text } = event.detail as any;
      if (text) activeParagraphText = text;
      if (companionRef && companionRef.askWithCustomPrompt) {
        companionRef.askWithCustomPrompt(get(t)('workspace.askParagraphDeepPrompt'));
      }
    } else if (action === 'translationCompleted') {
      dispatch('refreshCacheStats');
    } else if (action === 'openOriginalToPage') {
      const { sectionId } = payload || {};
      if (sectionId) {
        activeSectionId = sectionId;
        if (activePaper) {
          const allSecs = flattenSections(activePaper.sections);
          const found = allSecs.find(s => s.id === activeSectionId);
          activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
        }
      }
      if (readingMode !== 'split') {
        isPdfDrawerOpen = true;
      }
    } else if (action === 'openSettings') {
      dispatch('openSettings');
    }
  }

  function handleAskQuestion(event: { query: string; reply: string; cached?: boolean } | CustomEvent<{ query: string; reply?: string }>) {
    const detail = 'detail' in event ? event.detail : event;
    activeContextText = get(t)('workspace.companionQueryTitle', { query: detail.query.slice(0, 18) });
    dispatch('refreshCacheStats');
  }

  function handleQuickCompanionAction(event: { action: string; payload?: any } | CustomEvent<{ action: string; payload?: any }>) {
    const detail = 'detail' in event ? event.detail : event;
    if (detail.action === 'saveSnippet' && detail.payload && activePaper) {
      addNoteToPaper({
        title: get(t)('workspace.companionDigestTitle', { context: activeContextText }),
        text: detail.payload,
        paperId: activePaper.id,
        paperTitle: activePaper.title,
        sectionId: activeSectionId,
        sectionTitle: activeContextText
      });
    } else if (detail.action === 'exportNotes') {
      dispatch('exportNotes');
    }
  }

  function handleSaveNote(e: CustomEvent<{ title: string; text: string }> | { title: string; text: string }) {
    const detail = 'detail' in e ? e.detail : e;
    if (activePaper) {
      addNoteToPaper({
        title: detail.title,
        text: detail.text,
        paperId: activePaper.id,
        paperTitle: activePaper.title,
        sectionId: activeSectionId,
        sectionTitle: activeContextText
      });
      dispatch('refreshCacheStats');
    }
  }
</script>

<svelte:window on:keydown={handleGlobalKeyDown} />

<div class="flex-1 w-full h-full flex flex-col bg-[#282828] overflow-hidden">
  <!-- Density & Flow Ribbon -->
  <DensityRibbon
    focusTrack="{activeContextText} · Depth Level: {activePaper?.depthLevel || 'Academic Rigor'}"
    flowWpm={activePaper?.readingSpeedWpm || 265}
    embeddingDim={384}
    onopenSemanticSearch={() => isSemanticSearchOpen = true}
  />

  <!-- Workspace Studio Layout -->
  {#if readingMode === 'split'}
    <!-- 50/50 Synchronized Dual-Track Split Screen View -->
    <div id="split-container" class="flex-1 overflow-hidden flex divide-x divide-[#3c3836] relative {isDraggingSplit ? 'select-none cursor-col-resize' : ''}">
      <!-- Left Track: Original Document Viewer -->
      <div class="h-full overflow-hidden flex flex-col" style="width: {splitRatio}%">
        <OriginalDocumentViewer
          paper={activePaper}
          mode="split"
          {activeSectionId}
          sections={activePaper?.sections || []}
          onselectSection={handleSelectSection}
          onsectionsAligned={handleSectionsAligned}
          onimportPaper={(data) => dispatch('importPaper', { paper: data.paper })}
          onswitchToSplit={() => {}}
        />
      </div>

      <!-- Central Draggable Splitter Handle -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        class="w-2.5 bg-[#1d2021] hover:bg-[#fe8019] transition-colors cursor-col-resize flex items-center justify-center z-20 group shrink-0"
        onmousedown={handleSplitMouseDown}
        title={$t('workspace.splitHandleTitle')}
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-valuenow={splitRatio}
        aria-valuemin="20"
        aria-valuemax="80"
        aria-label={$t('workspace.splitHandleAria')}
        onkeydown={(e) => {
          if (e.key === 'ArrowLeft') splitRatio = adjustSplitRatioByStep(splitRatio, 'decrease', { minRatio: 20, maxRatio: 80, step: 5 });
          if (e.key === 'ArrowRight') splitRatio = adjustSplitRatioByStep(splitRatio, 'increase', { minRatio: 20, maxRatio: 80, step: 5 });
        }}
      >
        <div class="w-1 h-8 bg-[#504945] group-hover:bg-[#1d2021] rounded-full"></div>
      </div>

      <!-- Right Track: Mugen Academic Reader (Zoomable) -->
      <div class="h-full min-w-0 overflow-hidden flex-1 flex flex-col" style="zoom: {zoomLevel}%">
        <MugenReader
          bind:this={readerRef}
          paper={activePaper}
          {activeSectionId}
          {readingMode}
          {zoomLevel}
          onselectSection={handleSelectSection}
          onsectionChanged={handleSectionChanged}
          onreaderAction={handleReaderAction}
          onsectionDwell={handleSectionDwell}
          onsectionSkimmed={handleSectionSkimmed}
          onsectionInteracted={handleSectionInteracted}
          onsectionsPassed={handleSectionsPassed}
          onparagraphsRead={handleParagraphsRead}
          onreachedBottom={handleReachedBottom}
          onupdatePaper={(data) => dispatch('updatePaper', { paper: data.paper })}
        />
      </div>
    </div>
  {:else if readingMode === 'figures'}
    <!-- Derivations & Figures Comparative Studio Canvas -->
    <div class="flex-1 overflow-hidden">
      <DerivationsFiguresView
        paper={activePaper}
        onbackToReader={() => readingMode = 'bilingual'}
        onselectSection={(data) => {
          readingMode = 'bilingual';
          handleSelectSection(data);
        }}
        onsaveNote={handleSaveNote}
        onupdatePaper={(data) => dispatch('updatePaper', { paper: data.paper })}
      />
    </div>
  {:else}
    <!-- Standard Triad / Zen Studio Layout Grid -->
    <div class="flex-1 overflow-hidden grid transition-all duration-300 {
      readingMode === 'zen'
        ? 'grid-cols-1'
        : 'grid-cols-[270px_minmax(0,1fr)_390px]'
    }">

      <!-- Column 1: Reading Map (hidden in Zen mode) -->
      {#if readingMode !== 'zen'}
        <ReadingMap
          sections={activePaper?.sections || []}
          paper={activePaper}
          {activeSectionId}
          arxivId={activePaper?.arxivId}
          sourceUrl={activePaper?.sourceUrl}
          onselectSection={handleSelectSection}
          onselectFigure={handleSelectFigure}
          onselectEquation={handleSelectEquation}
          onopenFiguresStudio={() => readingMode = 'figures'}
          ontoggleSectionRead={handleToggleSectionRead}
          onresetProgress={handleResetProgress}
        />
      {/if}

      <!-- Column 2: Mugen Paper Reader (Scaled by zoomLevel) -->
      <div class="h-full w-full min-w-0 overflow-hidden flex flex-col" style="zoom: {zoomLevel}%">
        <MugenReader
          bind:this={readerRef}
          paper={activePaper}
          {activeSectionId}
          {readingMode}
          {zoomLevel}
          {loadingIntuitionId}
          {loadingSyntaxId}
          {loadingTerminologyId}
          bind:focusedParagraphKey={activeFocusedParagraphKey}
          bind:focusedParagraphText={activeParagraphText}
          bind:selectedText={activeSelectedText}
          onselectSection={handleSelectSection}
          onsectionChanged={handleSectionChanged}
          onparagraphFocused={handleParagraphFocused}
          ontextSelected={handleTextSelected}
          onprobeCitation={handleProbeCitation}
          onreaderAction={handleReaderAction}
          onsectionDwell={handleSectionDwell}
          onsectionSkimmed={handleSectionSkimmed}
          onsectionInteracted={handleSectionInteracted}
          onsectionsPassed={handleSectionsPassed}
          onparagraphsRead={handleParagraphsRead}
          onreachedBottom={handleReachedBottom}
          onupdatePaper={(data) => dispatch('updatePaper', { paper: data.paper })}
        />
      </div>

      <!-- Column 3: AI Cognitive Companion (hidden in Zen mode) -->
      {#if readingMode !== 'zen'}
        <CognitiveCompanion
          bind:this={companionRef}
          paperId={activePaper?.id || ''}
          {activeContextText}
          paperTitle={activePaper?.title || ''}
          activeParagraphText={activeParagraphText}
          selectedText={activeSelectedText}
          focusedParagraphKey={activeFocusedParagraphKey}
          companionData={activePaper?.companionData[activeSectionId]}
          isGeneratingIntuition={loadingIntuitionId === activeSectionId}
          isGeneratingSyntax={loadingSyntaxId === activeSectionId}
          isGeneratingTerminology={loadingTerminologyId === activeSectionId}
          ontriggerGenerate={handleCompanionTriggerGenerate}
          onaskQuestion={handleAskQuestion}
          onquickAction={handleQuickCompanionAction}
          onlocateSource={handleLocateSource}
          onopenSettings={() => dispatch('openSettings')}
        />
      {/if}

    </div>
  {/if}

  <!-- Slide-out Original Document Inspector Drawer (Alt+P) -->
  {#if isPdfDrawerOpen}
    <!-- Backdrop Overlay -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="fixed inset-0 top-16 bg-black/45 z-30 transition-opacity animate-fade-in cursor-pointer"
      onclick={() => isPdfDrawerOpen = false}
      onkeydown={(e) => e.key === 'Escape' && (isPdfDrawerOpen = false)}
      role="button"
      tabindex="0"
      aria-label={$t('workspace.closePdfDrawerAria')}
    ></div>

    <!-- Right Drawer Panel -->
    <div
      class="fixed right-0 top-16 bottom-0 w-[48vw] min-w-[390px] max-w-[840px] bg-[#1d2021] border-l border-[#504945] z-40 shadow-2xl flex flex-col animate-slide-left"
    >
      <OriginalDocumentViewer
        paper={activePaper}
        mode="drawer"
        {activeSectionId}
        sections={activePaper?.sections || []}
        onselectSection={handleSelectSection}
        onsectionsAligned={handleSectionsAligned}
        onimportPaper={(data) => {
          dispatch('importPaper', { paper: data.paper });
          isPdfDrawerOpen = false;
          readingMode = 'split';
        }}
        onclose={() => isPdfDrawerOpen = false}
        onswitchToSplit={() => { isPdfDrawerOpen = false; readingMode = 'split'; }}
      />
    </div>
  {/if}

  <!-- Semantic Vector Radar Search Modal (Ctrl+Shift+F) -->
  <SemanticSearchModal
    isOpen={isSemanticSearchOpen}
    paperId={activePaper?.id || ''}
    sections={activePaper?.sections || []}
    onclose={() => isSemanticSearchOpen = false}
    onselectParagraph={handleSemanticSelectParagraph}
    onopenSettings={() => {
      isSemanticSearchOpen = false;
      dispatch('openSettings');
    }}
  />
</div>
