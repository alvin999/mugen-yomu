<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import DensityRibbon from '../layout/DensityRibbon.svelte';
  import ReadingMap from '../reading-map/ReadingMap.svelte';
  import BilingualReader from '../reader/BilingualReader.svelte';
  import DerivationsFiguresView from '../reader/DerivationsFiguresView.svelte';
  import CognitiveCompanion from '../companion/CognitiveCompanion.svelte';
  import OriginalDocumentViewer from '../reader/OriginalDocumentViewer.svelte';

  import type { PaperDocument, ChapterSection } from '../../types/document';
  import { flattenSections } from '../../stores/readingStore';
  import { calculateSplitRatio, adjustSplitRatioByStep } from '../../utils/useSplitPane';
  import { addNoteToPaper } from '../../stores/notesStore';
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
  export let activePaper: PaperDocument | null = null;
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let zoomLevel: number = 100;
  export let isPdfDrawerOpen: boolean = false;

  const dispatch = createEventDispatcher<{
    updatePaper: { paper: PaperDocument };
    importPaper: { paper: PaperDocument };
    openSettings: void;
    exportNotes: void;
    refreshCacheStats: void;
  }>();

  // Internal workspace state
  let splitRatio: number = 50;
  let isDraggingSplit: boolean = false;
  let activeSectionId: string = '';
  let activeContextText: string = '';
  let activeParagraphText: string = '';
  let activeSelectedText: string = '';
  let activeFocusedParagraphKey: string = '';
  let currentPaperId: string = '';

  // AI Cognitive async loading indicators
  let loadingIntuitionId: string | null = null;
  let loadingSyntaxId: string | null = null;
  let loadingTerminologyId: string | null = null;

  // Component references for intra-workspace communication
  let companionRef: any = null;
  let readerRef: any = null;

  // Sync active section when activePaper changes
  $: if (activePaper && activePaper.id !== currentPaperId) {
    currentPaperId = activePaper.id;
    const allSecs = flattenSections(activePaper.sections || []);
    const targetSec = allSecs[0];
    if (targetSec) {
      activeSectionId = targetSec.id;
      activeContextText = `§ ${targetSec.title}`;
    } else {
      activeSectionId = '';
      activeContextText = '';
    }
  }

  // Exported methods for App shell orchestration
  export function jumpToSection(sectionId: string, source: string = 'nav') {
    selectSection({ id: sectionId, source });
  }

  export function refreshCompanionKey() {
    if (companionRef && companionRef.refreshKeyFromStorage) {
      companionRef.refreshKeyFromStorage();
    }
  }

  // --- Reading Progress Event Handlers ---
  function handleSectionDwell(e: CustomEvent<{ id: string; dwellSeconds: number }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = applySectionDwell(activePaper, e.detail.id, e.detail.dwellSeconds);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionSkimmed(e: CustomEvent<{ id: string }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = applySectionSkimmed(activePaper, e.detail.id);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionInteracted(e: CustomEvent<{ id: string; action: string }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = applySectionInteracted(activePaper, e.detail.id);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleToggleSectionRead(e: CustomEvent<{ id: string }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = toggleSectionReadState(activePaper, e.detail.id);
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

  function handleParagraphsRead(e: CustomEvent<{ paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }> }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = applyParagraphsRead(activePaper, e.detail?.paragraphs || []);
    if (hasChange) {
      dispatch('updatePaper', { paper: updatedPaper });
    }
  }

  function handleSectionsPassed(e: CustomEvent<{ readSectionIds: string[]; currentSectionId: string }>) {
    if (!activePaper) return;
    const { updatedPaper, hasChange } = applySectionsPassed(activePaper, e.detail?.readSectionIds || []);
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

    const isNavigation = source === 'outline' || source === 'nav' || source === 'pdf';
    if (isNavigation && !noScroll) {
      setTimeout(() => {
        if (readerRef && readerRef.scrollToTarget) {
          readerRef.scrollToTarget('sec-' + activeSectionId);
        }
      }, 30);
    }
  }

  function handleSelectSection(event: CustomEvent<{ id?: string; sectionId?: string; source?: string; noScroll?: boolean }>) {
    selectSection(event.detail || {});
  }

  function handleSectionChanged(event: CustomEvent<{ sectionId: string }>) {
    const { sectionId } = event.detail || {};
    if (sectionId && sectionId !== activeSectionId) {
      activeSectionId = sectionId;
      if (activePaper) {
        const allSecs = flattenSections(activePaper.sections);
        const found = allSecs.find(s => s.id === activeSectionId);
        activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
      }
    }
  }

  function handleParagraphFocused(e: CustomEvent<{ sectionId: string; paragraphIndex: number; paragraphKey: string; text: string; selectedText: string }>) {
    const { paragraphKey, text, selectedText } = e.detail;
    activeParagraphText = text;
    activeFocusedParagraphKey = paragraphKey;
    if (selectedText) activeSelectedText = selectedText;
  }

  function handleTextSelected(e: CustomEvent<{ selectedText: string }>) {
    activeSelectedText = e.detail.selectedText;
  }

  function handleProbeCitation(e: CustomEvent<{ citation: string; sectionId: string; paragraphText: string }>) {
    const { citation, paragraphText } = e.detail;
    if (paragraphText) activeParagraphText = paragraphText;
    if (companionRef && companionRef.askWithCustomPrompt) {
      companionRef.askWithCustomPrompt(`請深入剖析文中引用的文獻 ${citation}：作者引用該論文的論證目的是什麼？其實驗設計或條件（如壓力、流速等）與本文有何關聯與局限性？`);
    }
  }

  function handleLocateSource(e: CustomEvent<{ paragraphKey: string }>) {
    const { paragraphKey } = e.detail;
    if (readerRef && readerRef.highlightAndScrollToParagraph) {
      readerRef.highlightAndScrollToParagraph(paragraphKey);
    }
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string; imageUrl?: string; name?: string }>) {
    const { imageUrl, name } = event.detail;
    if (imageUrl && readerRef && (readerRef as any).openLightbox) {
      (readerRef as any).openLightbox(imageUrl, name || '學術圖表預覽');
    } else {
      readingMode = 'figures';
    }
  }

  function handleSelectEquation(event: CustomEvent<{ eqId: string; sectionId?: string; formulaNumber?: string }>) {
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    const targetEqId = event.detail.eqId;
    const targetSecId = event.detail.sectionId;
    const formulaNumber = event.detail.formulaNumber;

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

  function handleSectionsAligned(event: CustomEvent<{ sections: ChapterSection[] }>) {
    if (activePaper && event.detail.sections) {
      const updatedPaper = { ...activePaper, sections: event.detail.sections };
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

  function handleCompanionTriggerGenerate(e: CustomEvent<{ type: string }>) {
    const { type } = e.detail;
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

  function handleReaderAction(event: CustomEvent<{ action: string; payload?: any; section?: ChapterSection; selectedText?: string }>) {
    const { action, payload, section, selectedText } = event.detail;

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
      activeContextText = `術語解析 · ${payload}`;
    } else if (action === 'showIntuition') {
      activeContextText = `§ ${secTitle} · 白話科研直覺`;
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
      activeContextText = `§ ${secTitle} · 長難句語法拆解`;
      if (targetSec) {
        const hasSyntax = activePaper?.companionData?.[targetSec.id]?.syntaxTree;
        if (hasSyntax && !selectedText) {
          companionRef?.focusCard('syntax');
        } else {
          generateSyntaxForSection(targetSec, selectedText);
        }
      }
    } else if (action === 'showTerminology') {
      activeContextText = `§ ${secTitle} · 關鍵術語對齊`;
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
          text: `於 ${activeContextText} 標註之重要論文觀點與筆記內容。`,
          paperId: activePaper.id,
          paperTitle: activePaper.title,
          sectionId: activeSectionId,
          sectionTitle: secTitle
        });
      }
      alert(`已為「${noteTitle}」新增精讀筆記！可點選左側 Cognitive Notes 檢視與編輯。`);
    } else if (action === 'focusCompanion') {
      const { text } = event.detail as any;
      if (text) activeParagraphText = text;
      if (companionRef && companionRef.askWithCustomPrompt) {
        companionRef.askWithCustomPrompt(`請針對這一段文字進行伴讀深度解析：作者在此處的核心論據與關鍵實驗變因是什麼？`);
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

  function handleAskQuestion(event: CustomEvent<{ query: string; reply?: string }>) {
    activeContextText = `探討中: ${event.detail.query.slice(0, 18)}...`;
    dispatch('refreshCacheStats');
  }

  function handleQuickCompanionAction(event: CustomEvent<{ action: string; payload?: any }>) {
    if (event.detail.action === 'saveSnippet' && event.detail.payload && activePaper) {
      addNoteToPaper({
        title: `伴讀精華 · ${activeContextText}`,
        text: event.detail.payload,
        paperId: activePaper.id,
        paperTitle: activePaper.title,
        sectionId: activeSectionId,
        sectionTitle: activeContextText
      });
    } else if (event.detail.action === 'exportNotes') {
      dispatch('exportNotes');
    }
  }

  function handleSaveNote(e: CustomEvent<{ title: string; text: string }>) {
    if (activePaper) {
      addNoteToPaper({
        title: e.detail.title,
        text: e.detail.text,
        paperId: activePaper.id,
        paperTitle: activePaper.title,
        sectionId: activeSectionId,
        sectionTitle: activeContextText
      });
      dispatch('refreshCacheStats');
    }
  }
</script>

<div class="flex-1 w-full h-full flex flex-col bg-[#282828] overflow-hidden">
  <!-- Density & Flow Ribbon -->
  <DensityRibbon
    focusTrack="{activeContextText} · Depth Level: {activePaper?.depthLevel || 'Academic Rigor'}"
    flowWpm={activePaper?.readingSpeedWpm || 265}
    embeddingDim={384}
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
          on:selectSection={handleSelectSection}
          on:sectionsAligned={handleSectionsAligned}
          on:importPaper={(e) => dispatch('importPaper', { paper: e.detail.paper })}
          on:switchToSplit={() => {}}
        />
      </div>

      <!-- Central Draggable Splitter Handle -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <div
        class="w-2.5 bg-[#1d2021] hover:bg-[#fe8019] transition-colors cursor-col-resize flex items-center justify-center z-20 group shrink-0"
        on:mousedown={handleSplitMouseDown}
        title="拖曳以自訂左右分屏比例（可使用鍵盤左右鍵微調）"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-valuenow={splitRatio}
        aria-valuemin="20"
        aria-valuemax="80"
        aria-label="左右分屏調整桿"
        on:keydown={(e) => {
          if (e.key === 'ArrowLeft') splitRatio = adjustSplitRatioByStep(splitRatio, 'decrease', { minRatio: 20, maxRatio: 80, step: 5 });
          if (e.key === 'ArrowRight') splitRatio = adjustSplitRatioByStep(splitRatio, 'increase', { minRatio: 20, maxRatio: 80, step: 5 });
        }}
      >
        <div class="w-1 h-8 bg-[#504945] group-hover:bg-[#1d2021] rounded-full"></div>
      </div>

      <!-- Right Track: Bilingual Academic Reader (Zoomable) -->
      <div class="h-full min-w-0 overflow-hidden flex-1 flex flex-col" style="zoom: {zoomLevel}%">
        <BilingualReader
          bind:this={readerRef}
          paper={activePaper}
          {activeSectionId}
          {readingMode}
          on:selectSection={handleSelectSection}
          on:sectionChanged={handleSectionChanged}
          on:readerAction={handleReaderAction}
          on:sectionDwell={handleSectionDwell}
          on:sectionSkimmed={handleSectionSkimmed}
          on:sectionInteracted={handleSectionInteracted}
          on:sectionsPassed={handleSectionsPassed}
          on:paragraphsRead={handleParagraphsRead}
          on:reachedBottom={handleReachedBottom}
          on:updatePaper={(e) => dispatch('updatePaper', { paper: e.detail.paper })}
        />
      </div>
    </div>
  {:else if readingMode === 'figures'}
    <!-- Derivations & Figures Comparative Studio Canvas -->
    <div class="flex-1 overflow-hidden">
      <DerivationsFiguresView
        paper={activePaper}
        on:backToReader={() => readingMode = 'bilingual'}
        on:selectSection={(e) => {
          readingMode = 'bilingual';
          handleSelectSection(e);
        }}
        on:saveNote={handleSaveNote}
        on:updatePaper={(e) => dispatch('updatePaper', { paper: e.detail.paper })}
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
          on:selectSection={handleSelectSection}
          on:selectFigure={handleSelectFigure}
          on:selectEquation={handleSelectEquation}
          on:openFiguresStudio={() => readingMode = 'figures'}
          on:toggleSectionRead={handleToggleSectionRead}
          on:resetProgress={handleResetProgress}
        />
      {/if}

      <!-- Column 2: Bilingual Paper Reader (Scaled by zoomLevel) -->
      <div class="h-full w-full min-w-0 overflow-hidden flex flex-col" style="zoom: {zoomLevel}%">
        <BilingualReader
          bind:this={readerRef}
          paper={activePaper}
          {activeSectionId}
          {readingMode}
          {loadingIntuitionId}
          {loadingSyntaxId}
          {loadingTerminologyId}
          bind:focusedParagraphKey={activeFocusedParagraphKey}
          bind:focusedParagraphText={activeParagraphText}
          bind:selectedText={activeSelectedText}
          on:selectSection={handleSelectSection}
          on:sectionChanged={handleSectionChanged}
          on:paragraphFocused={handleParagraphFocused}
          on:textSelected={handleTextSelected}
          on:probeCitation={handleProbeCitation}
          on:readerAction={handleReaderAction}
          on:sectionDwell={handleSectionDwell}
          on:sectionSkimmed={handleSectionSkimmed}
          on:sectionInteracted={handleSectionInteracted}
          on:sectionsPassed={handleSectionsPassed}
          on:paragraphsRead={handleParagraphsRead}
          on:reachedBottom={handleReachedBottom}
          on:updatePaper={(e) => dispatch('updatePaper', { paper: e.detail.paper })}
        />
      </div>

      <!-- Column 3: AI Cognitive Companion (hidden in Zen mode) -->
      {#if readingMode !== 'zen'}
        <CognitiveCompanion
          bind:this={companionRef}
          {activeContextText}
          paperTitle={activePaper?.title || ''}
          activeParagraphText={activeParagraphText}
          selectedText={activeSelectedText}
          focusedParagraphKey={activeFocusedParagraphKey}
          companionData={activePaper?.companionData[activeSectionId]}
          isGeneratingIntuition={loadingIntuitionId === activeSectionId}
          isGeneratingSyntax={loadingSyntaxId === activeSectionId}
          isGeneratingTerminology={loadingTerminologyId === activeSectionId}
          on:triggerGenerate={handleCompanionTriggerGenerate}
          on:askQuestion={handleAskQuestion}
          on:quickAction={handleQuickCompanionAction}
          on:locateSource={handleLocateSource}
          on:openSettings={() => dispatch('openSettings')}
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
      on:click={() => isPdfDrawerOpen = false}
      on:keydown={(e) => e.key === 'Escape' && (isPdfDrawerOpen = false)}
      role="button"
      tabindex="0"
      aria-label="點擊關閉原檔抽屜"
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
        on:selectSection={handleSelectSection}
        on:sectionsAligned={handleSectionsAligned}
        on:importPaper={(e) => {
          dispatch('importPaper', { paper: e.detail.paper });
          isPdfDrawerOpen = false;
          readingMode = 'split';
        }}
        on:close={() => isPdfDrawerOpen = false}
        on:switchToSplit={() => { isPdfDrawerOpen = false; readingMode = 'split'; }}
      />
    </div>
  {/if}
</div>
