<script lang="ts">
  import { onMount } from 'svelte';
  import NavigationRail from './layout/NavigationRail.svelte';
  import AppHeader from './layout/AppHeader.svelte';
  import DensityRibbon from './layout/DensityRibbon.svelte';
  import ReadingMap from './reading-map/ReadingMap.svelte';
  import BilingualReader from './reader/BilingualReader.svelte';
  import DerivationsFiguresView from './reader/DerivationsFiguresView.svelte';
  import CognitiveCompanion from './companion/CognitiveCompanion.svelte';
  import ByokModal from './byok/ByokModal.svelte';
  import ImportPaperModal from './repository/ImportPaperModal.svelte';
  import PaperRepositoryView from './repository/PaperRepositoryView.svelte';
  import OriginalDocumentViewer from './reader/OriginalDocumentViewer.svelte';
  import CitationGraphView from './citation/CitationGraphView.svelte';
  import CognitiveNotesView from './notes/CognitiveNotesView.svelte';

  import {
    getInitialLibrary,
    getActivePaperId,
    setActivePaperId,
    saveLibraryToStorage,
    sanitizePaperData,
    type PaperDocument,
    type ChapterSection
  } from '../stores/documentStore';
  import {
    flattenSections,
    calculateReadingStats,
    synchronizeHeadingProgress,
    loadPaperReadingState,
    savePaperReadingState,
    clearPaperReadingState,
    applyProgressToSections
  } from '../stores/readingStore';
  import { flowStore } from '../stores/flowStore';
  import { getCacheStats, getStorageEstimate, type CacheStats } from '../services/cacheService';
  import { formatModelDisplayName } from '../services/aiService';
  import {
    updateSectionStateRecursive,
    toggleSubsectionsRecursive,
    resetSectionsProgress,
    updateSectionsParagraphsRead,
    updateSectionsPassed,
    markAllSectionsRead,
    buildReadingStateMap
  } from '../utils/readingTreeUtils';
  import { calculateSplitRatio, adjustSplitRatioByStep } from '../utils/useSplitPane';
  import {
    getStoredAiConfig,
    dispatchGenerateIntuition,
    dispatchGenerateSyntax,
    dispatchGenerateTerminology
  } from '../services/cognitiveDispatcher';

  // State Management
  let currentMainView: 'workspace' | 'repository' | 'citation-graph' | 'notes' = 'workspace';
  let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  let isPdfDrawerOpen: boolean = false;
  let splitRatio: number = 50;
  let isDraggingSplit: boolean = false;
  let zoomLevel: number = 100;
  let isByokOpen: boolean = false;
  let isImportOpen: boolean = false;
  let isRailCollapsed: boolean = false;

  let modelName: string = 'Groq (Llama 3.3 70B)';
  let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  let cacheStats: CacheStats | null = null;
  let localMemoryMb: number = 0.8;
  let localMemoryPercent: number = 1;
  let localMemoryTooltip: string = '本機 IndexedDB 快取與文獻庫';
  let companionRef: any = null;
  let readerRef: any = null;

  // 認知核心非同步載入狀態
  let loadingIntuitionId: string | null = null;
  let loadingSyntaxId: string | null = null;
  let loadingTerminologyId: string | null = null;

  let paperLibrary: PaperDocument[] = [];
  let activePaperId: string = 'mugen_yomu_user_manual';
  let activePaper: PaperDocument | null = null;
  let activeSectionId: string = '';
  let activeContextText: string = '';
  let activeParagraphText: string = '';
  let activeSelectedText: string = '';
  let activeFocusedParagraphKey: string = '';

  // Notes in memory
  let capturedNotes: Array<{ title: string; text: string; time: string }> = [];

  // 依據本機快取即時數據動態計算節省成本與 Token
  $: if (cacheStats) {
    const tokensK = (cacheStats.totalTokensSaved / 1000).toFixed(1);
    cachedInfo = `$${cacheStats.costSavedUsd.toFixed(2)} / ${tokensK}k cached (省 ${cacheStats.savingsPercent}%)`;
  }

  onMount(() => {
    paperLibrary = getInitialLibrary();
    activePaperId = getActivePaperId();
    const current = paperLibrary.find(p => p.id === activePaperId) || paperLibrary[0];
    if (current) {
      setPaper(current);
    }
    loadActiveModel();
    refreshCacheStats();
  });

  function loadActiveModel() {
    if (typeof window === 'undefined') return;
    const p = localStorage.getItem('mugen_provider') || 'groq';
    const m = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
    modelName = formatModelDisplayName(p, m);
  }

  async function refreshCacheStats() {
    cacheStats = await getCacheStats();
    const storage = await getStorageEstimate();
    localMemoryMb = storage.usageMb;
    localMemoryPercent = storage.percent;
    localMemoryTooltip = `本機已使用 ${storage.usageMb} MB / 總配額 ${storage.displayText.split('/')[1]?.trim() || '1 GB'}`;
  }

  function setPaper(paper: PaperDocument) {
    if (sanitizePaperData(paper)) {
      saveLibraryToStorage(paperLibrary);
    }
    activePaper = paper;
    activePaperId = paper.id;
    setActivePaperId(paper.id);

    // 載入該論文在 LocalStorage 的閱讀進度
    const savedState = loadPaperReadingState(paper.id);
    if (savedState && activePaper.sections) {
      activePaper.sections = applyProgressToSections(activePaper.sections, savedState);
    }

    // 載入該論文在 LocalStorage 的精讀筆記
    if (typeof window !== 'undefined') {
      try {
        const savedNotes = localStorage.getItem(`mugen_notes_${paper.id}`);
        capturedNotes = savedNotes ? JSON.parse(savedNotes) : [];
      } catch {
        capturedNotes = [];
      }
    }

    // 依序預設選取論文的第一個章節
    const allSecs = flattenSections(activePaper.sections);
    const targetSec = allSecs[0];
    if (targetSec) {
      activeSectionId = targetSec.id;
      activeContextText = `§ ${targetSec.title}`;
    } else {
      activeSectionId = '';
      activeContextText = '';
    }

    // 初始化本篇閱讀心流速率遙測
    const stats = calculateReadingStats(activePaper.sections);
    flowStore.initForPaper(paper.id, stats.totalWords, paper.readingSpeedWpm || 260);
  }

  function saveNotes(notes: Array<{ title: string; text: string; time: string }>) {
    capturedNotes = notes;
    if (typeof window !== 'undefined' && activePaperId) {
      try {
        localStorage.setItem(`mugen_notes_${activePaperId}`, JSON.stringify(capturedNotes));
      } catch (e) {
        console.warn('Failed to save notes to localStorage', e);
      }
    }
  }

  // 記錄並持久化章節狀態
  function updateSectionState(sectionId: string, updates: Partial<{ isRead: boolean; progress: number; dwellSeconds: number }>) {
    if (!activePaper || !activePaper.sections) return;

    const updated = updateSectionStateRecursive(activePaper.sections, sectionId, updates);
    activePaper.sections = synchronizeHeadingProgress(updated);
    activePaper = { ...activePaper };

    savePaperReadingState(activePaper.id, buildReadingStateMap(activePaper.sections));
  }

  // 1. 視線停留累積精讀
  function handleSectionDwell(e: CustomEvent<{ id: string; dwellSeconds: number }>) {
    const { id, dwellSeconds } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (!target) return;

    if (!target.isRead) {
      const currentProgress = target.progress || 0;
      const addedProgress = Math.min(100, Math.max(currentProgress, Math.round((dwellSeconds / 7) * 100)));
      const isNowRead = addedProgress >= 100;
      updateSectionState(id, { progress: addedProgress, isRead: isNowRead, dwellSeconds });
    }
  }

  // 2. 視線路過掃讀
  function handleSectionSkimmed(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (target && !target.isRead && (!target.progress || target.progress < 30)) {
      updateSectionState(id, { progress: 30 });
    }
  }

  // 3. 深度互動（展開翻譯、查看直覺、標註筆記）直接判定 100% 精讀
  function handleSectionInteracted(e: CustomEvent<{ id: string; action: string }>) {
    const { id } = e.detail;
    updateSectionState(id, { isRead: true, progress: 100 });
  }

  // 4. 使用者在目錄樹手動切換已讀/未讀
  function handleToggleSectionRead(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (target) {
      const nextRead = !target.isRead;
      const toggled = toggleSubsectionsRecursive(activePaper.sections, target, nextRead);
      activePaper.sections = synchronizeHeadingProgress(toggled);
      activePaper = { ...activePaper };

      savePaperReadingState(activePaper.id, buildReadingStateMap(activePaper.sections));
    }
  }

  // 5. 重設本篇閱讀進度
  function handleResetProgress() {
    if (!activePaper) return;

    const currentPaper = activePaper;

    // 1. 重設章節樹進度至 0%
    currentPaper.sections = resetSectionsProgress(currentPaper.sections);
    const updatedPaper: PaperDocument = { ...currentPaper };
    activePaper = updatedPaper;

    // 2. 儲存全新的 0% 狀態至 LocalStorage（覆寫預設 Mock 論文之歷史已讀標記）
    savePaperReadingState(updatedPaper.id, buildReadingStateMap(updatedPaper.sections));

    // 3. 同步更新文獻庫並持久化
    paperLibrary = paperLibrary.map(p =>
      p.id === updatedPaper.id ? updatedPaper : p
    );
    saveLibraryToStorage(paperLibrary);

    // 4. 重設計時與心流遙測
    const stats = calculateReadingStats(updatedPaper.sections);
    flowStore.initForPaper(updatedPaper.id, stats.totalWords, updatedPaper.readingSpeedWpm || 260);

    // 5. 通知閱讀器重設段落已讀集合並平滑回到頂端
    if (readerRef && readerRef.resetScrollAndProgress) {
      readerRef.resetScrollAndProgress();
    }
  }

  function handleModeChange(event: CustomEvent<{ mode: 'bilingual' | 'split' | 'zen' | 'figures' }>) {
    readingMode = event.detail.mode;
    currentMainView = 'workspace';
    if (readingMode === 'split') {
      isPdfDrawerOpen = false;
    }
  }

  function handleLoadPaperFromCitation(e: CustomEvent<{ paperId: string }>) {
    const targetId = e.detail.paperId;
    const found = paperLibrary.find(p => p.id === targetId || p.id.includes(targetId));
    if (found) {
      setPaper(found);
      currentMainView = 'workspace';
    }
  }

  function handleUpdateCitationGraph(e: CustomEvent<{ paperId: string; citationGraph: any }>) {
    const { paperId, citationGraph } = e.detail;
    if (!paperId || !citationGraph) return;

    if (activePaper && (activePaper.id === paperId || activePaper.id.includes(paperId))) {
      activePaper.citationGraph = citationGraph;
      activePaper = { ...activePaper };
    }

    paperLibrary = paperLibrary.map(p =>
      (p.id === paperId || p.id.includes(paperId)) ? { ...p, citationGraph } : p
    );
    saveLibraryToStorage(paperLibrary);
    refreshCacheStats();
  }

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

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      isPdfDrawerOpen = !isPdfDrawerOpen;
    } else if (e.key === 'Escape' && isPdfDrawerOpen) {
      isPdfDrawerOpen = false;
    }
  }

  function handleZoomChange(event: CustomEvent<{ zoomLevel: number }>) {
    zoomLevel = event.detail.zoomLevel;
  }

  function handleSelectSection(event: CustomEvent<{ id?: string; sectionId?: string; source?: string; noScroll?: boolean }>) {
    const detail = (event.detail || {}) as any;
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

  // 當使用者滾動或互動閱讀了細部小段落時，更新章節的小段落已讀集合與進度百分比
  function handleParagraphsRead(e: CustomEvent<{ paragraphs: Array<{ sectionId: string; paraIndex: number; words: number }> }>) {
    const { paragraphs } = e.detail || {};
    if (!activePaper || !paragraphs || paragraphs.length === 0) return;

    const { updatedSections, hasChange } = updateSectionsParagraphsRead(activePaper.sections, paragraphs);
    if (hasChange) {
      activePaper.sections = synchronizeHeadingProgress(updatedSections);
      activePaper = { ...activePaper };
      savePaperReadingState(activePaper.id, buildReadingStateMap(activePaper.sections));
    }
  }

  // 當使用者滾動滑過前面的章節時，自動將已讀過的章節標記為已研讀
  function handleSectionsPassed(e: CustomEvent<{ readSectionIds: string[]; currentSectionId: string }>) {
    const { readSectionIds } = e.detail || {};
    if (!activePaper || !readSectionIds || readSectionIds.length === 0) return;

    const { updatedSections, hasChange } = updateSectionsPassed(activePaper.sections, readSectionIds);
    if (hasChange) {
      activePaper.sections = synchronizeHeadingProgress(updatedSections);
      activePaper = { ...activePaper };
      savePaperReadingState(activePaper.id, buildReadingStateMap(activePaper.sections));
    }
  }

  // 當使用者自然滾動到達文末時，整篇論文自動完成 100% 精讀！
  function handleReachedBottom() {
    if (!activePaper || !activePaper.sections) return;
    const allSecs = flattenSections(activePaper.sections);
    const allAlreadyRead = allSecs.every(s => s.isRead);
    if (allAlreadyRead) return;

    activePaper.sections = markAllSectionsRead(activePaper.sections);
    activePaper = { ...activePaper };
    savePaperReadingState(activePaper.id, buildReadingStateMap(activePaper.sections));
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string; imageUrl?: string; name?: string }>) {
    const { imageUrl, name } = event.detail;
    if (imageUrl && readerRef && (readerRef as any).openLightbox) {
      (readerRef as any).openLightbox(imageUrl, name || '學術圖表預覽');
    } else {
      readingMode = 'figures';
    }
  }

  function handleSectionsAligned(event: CustomEvent<{ sections: ChapterSection[] }>) {
    if (activePaper && event.detail.sections) {
      activePaper.sections = event.detail.sections;
      activePaper = { ...activePaper };
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

  async function generateIntuitionForSection(sec: ChapterSection) {
    if (!sec || !sec.id || !activePaper) return;
    loadingIntuitionId = sec.id;
    try {
      await dispatchGenerateIntuition(activePaper, sec, getStoredAiConfig());
      activePaper = { ...activePaper };
      refreshCacheStats();
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
      activePaper = { ...activePaper };
      refreshCacheStats();
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
      activePaper = { ...activePaper };
      refreshCacheStats();
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

    // 找出對應章節
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
      const newNote = {
        title: noteTitle,
        text: `於 ${activeContextText} 標註之重要論文觀點與筆記內容。`,
        time: new Date().toLocaleTimeString(),
        paperId: activePaperId,
        paperTitle: activePaper?.title || '',
        sectionId: activeSectionId,
        sectionTitle: secTitle
      };
      saveNotes([newNote, ...capturedNotes]);
      alert(`已為「${noteTitle}」新增精讀筆記！可點選左側 Cognitive Notes 檢視與編輯。`);
    } else if (action === 'focusCompanion') {
      const { text } = event.detail as any;
      if (text) activeParagraphText = text;
      if (companionRef && companionRef.askWithCustomPrompt) {
        companionRef.askWithCustomPrompt(`請針對這一段文字進行伴讀深度解析：作者在此處的核心論據與關鍵實驗變因是什麼？`);
      }
    } else if (action === 'translationCompleted') {
      refreshCacheStats();
    } else if (action === 'openOriginalToPage') {
      const { page, sectionId } = payload || {};
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
      isByokOpen = true;
    }
  }

  function handleAskQuestion(event: CustomEvent<{ query: string; reply?: string }>) {
    activeContextText = `探討中: ${event.detail.query.slice(0, 18)}...`;
    refreshCacheStats();
  }

  function handleQuickCompanionAction(event: CustomEvent<{ action: string; payload?: any }>) {
    if (event.detail.action === 'saveSnippet' && event.detail.payload) {
      const newNote = {
        title: `伴讀精華 · ${activeContextText}`,
        text: event.detail.payload,
        time: new Date().toLocaleTimeString()
      };
      saveNotes([newNote, ...capturedNotes]);
    } else if (event.detail.action === 'exportNotes') {
      handleExportNotes();
    }
  }

  function handleSaveNote(e: CustomEvent<{ title: string; text: string }>) {
    const newNote = {
      title: e.detail.title,
      text: e.detail.text,
      time: new Date().toLocaleTimeString()
    };
    saveNotes([newNote, ...capturedNotes]);
    refreshCacheStats();
  }

  function handleUpdatePaper(e: CustomEvent<{ paper: PaperDocument }>) {
    const updated = e.detail.paper;
    activePaper = updated;
    paperLibrary = paperLibrary.map(p => p.id === updated.id ? updated : p);
    saveLibraryToStorage(paperLibrary);
    refreshCacheStats();
  }

  function handleParagraphFocused(e: CustomEvent<{ sectionId: string; paragraphIndex: number; paragraphKey: string; text: string; selectedText: string }>) {
    const { sectionId, paragraphKey, text, selectedText } = e.detail;
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

  function handleExportNotes() {
    currentMainView = 'notes';
  }

  function handlePaperSelectedFromRepository(event: CustomEvent<{ paper: PaperDocument }>) {
    setPaper(event.detail.paper);
    currentMainView = 'workspace';
  }

  function handleOpenCitationFromRepository(event: CustomEvent<{ paper: PaperDocument }>) {
    setPaper(event.detail.paper);
    currentMainView = 'citation-graph';
  }

  function handleOpenNotesFromRepository(event: CustomEvent<{ paper: PaperDocument }>) {
    setPaper(event.detail.paper);
    currentMainView = 'notes';
  }

  function handleJumpToSectionFromNotes(e: CustomEvent<{ paperId: string; sectionId: string }>) {
    const { paperId, sectionId } = e.detail;
    const found = paperLibrary.find(p => p.id === paperId || p.id.includes(paperId));
    if (found && found.id !== activePaperId) {
      setPaper(found);
    }
    currentMainView = 'workspace';
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    if (sectionId) {
      setTimeout(() => {
        handleSelectSection(new CustomEvent('selectSection', { detail: { id: sectionId, source: 'nav' } }));
      }, 50);
    }
  }

  function handlePaperLoaded(event: CustomEvent<{ paper: PaperDocument; library: PaperDocument[] }>) {
    paperLibrary = event.detail.library;
    setPaper(event.detail.paper);
  }

  function handleDirectImportPaper(event: CustomEvent<{ paper: PaperDocument }>) {
    const paper = event.detail.paper;
    const exists = paperLibrary.some(p => p.id === paper.id);
    const updatedLibrary = exists
      ? paperLibrary.map(p => p.id === paper.id ? paper : p)
      : [paper, ...paperLibrary];
    paperLibrary = updatedLibrary;
    saveLibraryToStorage(updatedLibrary);
    setPaper(paper);
  }

  function handlePaperSelected(event: CustomEvent<{ paper: PaperDocument }>) {
    setPaper(event.detail.paper);
  }

  function handleByokSave(event: CustomEvent<{ provider: string; model: string; apiKey: string }>) {
    const p = event.detail.provider;
    const m = event.detail.model;
    modelName = formatModelDisplayName(p, m);
    if (companionRef && companionRef.refreshKeyFromStorage) {
      companionRef.refreshKeyFromStorage();
    }
    refreshCacheStats();
  }
</script>

<div class="flex h-screen w-screen bg-[#282828] text-[#ebdbb2] overflow-hidden select-text">
  <!-- Left Navigation Rail (Collapsible: 64px / 240px) -->
  <NavigationRail
    currentPath={
      currentMainView === 'repository' ? 'paper-repository' :
      currentMainView === 'notes' ? 'cognitive-notes' :
      currentMainView === 'citation-graph' ? 'citation-graph' :
      (readingMode === 'figures' ? 'prompt-formula-lab' : 'reading-workspace')
    }
    paperCount={paperLibrary.length}
    bind:isCollapsed={isRailCollapsed}
    memoryUsageMb={localMemoryMb}
    memoryPercent={localMemoryPercent}
    memoryTooltip={localMemoryTooltip}
    on:toggleCollapse={(e) => isRailCollapsed = e.detail.isCollapsed}
    on:navigate={(e) => {
      if (e.detail.path === 'paper-repository') {
        currentMainView = 'repository';
      } else if (e.detail.path === 'cognitive-notes') {
        currentMainView = 'notes';
      } else if (e.detail.path === 'citation-graph') {
        currentMainView = 'citation-graph';
      } else if (e.detail.path === 'prompt-formula-lab') {
        currentMainView = 'workspace';
        readingMode = 'figures';
      } else if (e.detail.path === 'reading-workspace') {
        currentMainView = 'workspace';
        if (readingMode === 'figures') {
          readingMode = 'bilingual';
        }
      }
    }}
  />

  <!-- Main Content Body (Offset left dynamically by rail width) -->
  <div class="transition-all duration-300 ease-in-out {isRailCollapsed ? 'pl-16' : 'pl-60'} flex-1 w-full min-w-0 flex flex-col h-full overflow-hidden">
    <!-- Top Fixed Header -->
    <AppHeader
      {activePaper}
      bind:readingMode
      bind:zoomLevel
      bind:isPdfDrawerOpen
      {modelName}
      {cachedInfo}
      {isRailCollapsed}
      {cacheStats}
      {currentMainView}
      on:modeChange={handleModeChange}
      on:zoomChange={handleZoomChange}
      on:togglePdfDrawer={() => isPdfDrawerOpen = !isPdfDrawerOpen}
      on:openSettings={() => isByokOpen = true}
      on:openRepository={() => currentMainView = 'repository'}
      on:openImport={() => isImportOpen = true}
      on:exportNotes={handleExportNotes}
      on:backToWorkspace={() => currentMainView = 'workspace'}
    />

    <!-- Main Workspace Frame (pushed down by 64px header) -->
    <main class="w-full pt-16 h-full flex flex-col bg-[#282828] overflow-hidden">
      {#if currentMainView === 'repository'}
        <PaperRepositoryView
          library={paperLibrary}
          {activePaperId}
          {localMemoryMb}
          {cacheStats}
          on:selectPaper={handlePaperSelectedFromRepository}
          on:openCitationGraph={handleOpenCitationFromRepository}
          on:openNotes={handleOpenNotesFromRepository}
          on:openImport={() => isImportOpen = true}
          on:updateLibrary={(e) => { paperLibrary = e.detail.library; refreshCacheStats(); }}
          on:backToWorkspace={() => currentMainView = 'workspace'}
        />
      {:else if currentMainView === 'notes'}
        <CognitiveNotesView
          {paperLibrary}
          {activePaper}
          on:jumpToSection={handleJumpToSectionFromNotes}
          on:backToWorkspace={() => currentMainView = 'workspace'}
        />
      {:else if currentMainView === 'citation-graph'}
        <CitationGraphView
          paper={activePaper}
          on:backToWorkspace={() => currentMainView = 'workspace'}
          on:loadPaper={handleLoadPaperFromCitation}
          on:updateCitationGraph={handleUpdateCitationGraph}
        />
      {:else}
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
              on:importPaper={handleDirectImportPaper}
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
              on:updatePaper={handleUpdatePaper}
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
            on:updatePaper={handleUpdatePaper}
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
              on:updatePaper={handleUpdatePaper}
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
              on:openSettings={() => isByokOpen = true}
            />
          {/if}

        </div>
      {/if}
      {/if}
    </main>
  </div>

  <!-- Import Paper Modal -->
  <ImportPaperModal
    bind:isOpen={isImportOpen}
    currentLibrary={paperLibrary}
    on:paperLoaded={handlePaperLoaded}
    on:close={() => isImportOpen = false}
  />

  <!-- BYOK Setting Modal -->
  <ByokModal
    bind:isOpen={isByokOpen}
    on:save={handleByokSave}
    on:close={() => isByokOpen = false}
  />

  <!-- Slide-out Original Document Inspector Drawer (Alt+P) -->
  {#if isPdfDrawerOpen}
    <!-- Backdrop Overlay -->
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
          handleDirectImportPaper(e);
          isPdfDrawerOpen = false;
          readingMode = 'split';
        }}
        on:close={() => isPdfDrawerOpen = false}
        on:switchToSplit={() => { isPdfDrawerOpen = false; readingMode = 'split'; }}
      />
    </div>
  {/if}
</div>

<svelte:window on:keydown={handleGlobalKeydown} />
