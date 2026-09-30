<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import NavigationRail from './layout/NavigationRail.svelte';
  import AppHeader from './layout/AppHeader.svelte';
  import ReadingWorkspaceView from './workspace/ReadingWorkspaceView.svelte';
  import PaperRepositoryView from './repository/PaperRepositoryView.svelte';
  import CitationGraphView from './citation/CitationGraphView.svelte';
  import CognitiveNotesView from './notes/CognitiveNotesView.svelte';
  import SettingsModal from './settings/SettingsModal.svelte';
  import ImportPaperModal from './repository/ImportPaperModal.svelte';
  import DeletePaperConfirmModal from './common/DeletePaperConfirmModal.svelte';

  import {
    getInitialLibrary,
    loadLibraryFromIndexedDB,
    getActivePaperId,
    setActivePaperId,
    saveLibraryToStorage,
    normalizePaper,
    convertDocumentToTraditional,
    isPaperProtected,
    deletePaperFromLibrary,
    type PaperDocument
  } from '../stores/documentStore';
  import {
    calculateReadingStats,
    loadPaperReadingState,
    applyProgressToSections
  } from '../stores/readingStore';
  import { flowStore } from '../stores/flowStore';
  import { getCacheStats, getStorageEstimate, type CacheStats } from '../services/cacheService';
  import { formatModelDisplayName } from '../services/aiService';
  import { deactivateCursor, activateCursor } from '../stores/vimCursorStore';

  import { isRailCollapsedStore, setRailCollapsed } from '../stores/layoutStore';

  // --- App View & Studio Modes ---
  let currentMainView: 'workspace' | 'repository' | 'citation-graph' | 'notes' = 'workspace';
  let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  let isPdfDrawerOpen: boolean = false;
  let zoomLevel: number = 100;
  let isByokOpen: boolean = false;
  let isImportOpen: boolean = false;
  let isDeleteDirectModalOpen: boolean = false;
  let paperToDeleteDirect: PaperDocument | null = null;
  $: isRailCollapsed = $isRailCollapsedStore;

  // --- Model, Memory & Cache Telemetry ---
  let modelName: string = 'Groq (Llama 3.3 70B)';
  let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  let cacheStats: CacheStats | null = null;
  let localMemoryMb: number = 0.8;
  let localMemoryPercent: number = 1;
  let localMemoryTooltip: string = '本機 IndexedDB 快取與文獻庫';

  // --- Paper Library & Active Document ---
  let paperLibrary: PaperDocument[] = [];
  let activePaperId: string = 'mugen_yomu_user_manual';
  let activePaper: PaperDocument | null = null;
  let workspaceRef: any = null;

  // 依據本機快取即時數據動態計算節省成本與 Token
  $: if (cacheStats) {
    const tokensK = (cacheStats.totalTokensSaved / 1000).toFixed(1);
    cachedInfo = `$${cacheStats.costSavedUsd.toFixed(2)} / ${tokensK}k cached (省 ${cacheStats.savingsPercent}%)`;
  }

  let modalObserver: MutationObserver | null = null;
  let hadModalOpen = false;

  function checkModalState() {
    if (typeof document === 'undefined') return;
    const activeModals = document.querySelectorAll(
      '[aria-modal="true"], [role="dialog"], .modal-container, .modal-backdrop, .modal-overlay, [data-modal="true"]'
    );
    const hasModal = activeModals.length > 0;
    if (hasModal && !hadModalOpen) {
      hadModalOpen = true;
      deactivateCursor();
    } else if (!hasModal && hadModalOpen) {
      hadModalOpen = false;
      activateCursor();
    }
  }

  onMount(async () => {
    // 優先從超大容量 IndexedDB 載入文獻庫（如 EPUB 電子書），防止重新整理後丟失
    try {
      const dbLibrary = await loadLibraryFromIndexedDB();
      if (dbLibrary && dbLibrary.length > 0) {
        paperLibrary = dbLibrary;
      } else {
        paperLibrary = getInitialLibrary();
      }
    } catch {
      paperLibrary = getInitialLibrary();
    }

    activePaperId = getActivePaperId();
    const current = paperLibrary.find(p => p.id === activePaperId) || paperLibrary[0];
    if (current) {
      setPaper(current);
    }
    loadActiveModel();
    refreshCacheStats();

    // 監聽 DOM 樹變化，當任何 Modal 被打開或完全關閉時自動同步 Vim 游標生命週期
    modalObserver = new MutationObserver(() => {
      checkModalState();
    });
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  onDestroy(() => {
    if (modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }
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
    activePaper = paper;
    activePaperId = paper.id;
    setActivePaperId(paper.id);

    // 載入該論文在 LocalStorage 的閱讀進度
    const savedState = loadPaperReadingState(paper.id);
    if (savedState && activePaper.sections) {
      activePaper.sections = applyProgressToSections(activePaper.sections, savedState);
    }

    // 初始化本篇閱讀心流速率遙測
    if (activePaper.sections) {
      const stats = calculateReadingStats(activePaper.sections);
      flowStore.initForPaper(paper.id, stats.totalWords, paper.readingSpeedWpm || 260);
    }
  }

  function handleModeChange(event: { mode: 'bilingual' | 'split' | 'zen' | 'figures' } | CustomEvent<{ mode: 'bilingual' | 'split' | 'zen' | 'figures' }>) {
    const mode = 'detail' in event ? event.detail.mode : event.mode;
    readingMode = mode;
    currentMainView = 'workspace';
    if (readingMode === 'split') {
      isPdfDrawerOpen = false;
    }
  }

  function handleZoomChange(event: { zoomLevel: number } | CustomEvent<{ zoomLevel: number }>) {
    zoomLevel = 'detail' in event ? event.detail.zoomLevel : event.zoomLevel;
  }

  function handleConvertToTraditional(paperToConvert?: PaperDocument) {
    const target = paperToConvert || activePaper;
    if (!target) return;
    const converted = convertDocumentToTraditional(target);
    if (activePaper && activePaper.id === converted.id) {
      activePaper = converted;
    }
    paperLibrary = paperLibrary.map(p => p.id === converted.id ? converted : p);
    saveLibraryToStorage(paperLibrary);
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      isPdfDrawerOpen = !isPdfDrawerOpen;
    } else if (e.key === 'Escape' && isPdfDrawerOpen) {
      isPdfDrawerOpen = false;
    }
  }

  let prevByokOrImport = false;
  // 彈窗開啟時立即關閉 Vim 游標；關閉時自動恢復游標
  $: {
    const isAnyAppModalOpen = isByokOpen || isImportOpen;
    if (isAnyAppModalOpen && !prevByokOrImport) {
      deactivateCursor();
    } else if (!isAnyAppModalOpen && prevByokOrImport) {
      activateCursor();
    }
    prevByokOrImport = isAnyAppModalOpen;
  }

  // 全域事件委派：點擊任何 Modal 或遮罩層時，立即隱藏/關閉 Vim 游標
  function handleGlobalPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const isInsideModal = target.closest(
      '[aria-modal="true"], [role="dialog"], .modal-container, .modal-backdrop, .modal-overlay, [data-modal="true"]'
    );
    if (isInsideModal) {
      deactivateCursor();
    }
  }

  function handleUpdatePaper(e: { paper: PaperDocument } | CustomEvent<{ paper: PaperDocument }>) {
    const updated = 'detail' in e ? e.detail.paper : e.paper;
    activePaper = updated;
    paperLibrary = paperLibrary.map(p => p.id === updated.id ? updated : p);
    saveLibraryToStorage(paperLibrary);
    refreshCacheStats();
  }

  function handleDirectImportPaper(e: { paper: PaperDocument } | CustomEvent<{ paper: PaperDocument }>) {
    const detail = 'detail' in e ? e.detail : e;
    const paper = normalizePaper(detail.paper);
    const exists = paperLibrary.some(p => p.id === paper.id);
    const updatedLibrary = exists
      ? paperLibrary.map(p => p.id === paper.id ? paper : p)
      : [paper, ...paperLibrary];
    paperLibrary = updatedLibrary;
    saveLibraryToStorage(updatedLibrary);
    setPaper(paper);
  }

  function handlePaperLoaded(event: { paper: PaperDocument; library: PaperDocument[] } | CustomEvent<{ paper: PaperDocument; library: PaperDocument[] }>) {
    const detail = 'detail' in event ? event.detail : event;
    paperLibrary = (detail.library || []).map(normalizePaper);
    setPaper(normalizePaper(detail.paper));
  }

  function handleDeletePaperDirect(paperId: string) {
    if (!paperId) return;
    const target = paperLibrary.find(p => p && p.id === paperId) || activePaper;
    if (!target) return;
    paperToDeleteDirect = target;
    isDeleteDirectModalOpen = true;
  }

  function handleConfirmDeleteDirect(paperId: string) {
    try {
      const { updatedLibrary, nextActivePaper } = deletePaperFromLibrary(paperLibrary, paperId);
      paperLibrary = updatedLibrary;
      refreshCacheStats();

      if (nextActivePaper) {
        setPaper(nextActivePaper);
      } else {
        activePaper = null;
        activePaperId = '';
        setActivePaperId('');
      }
    } catch (err: any) {
      console.error('刪除失敗:', err);
    } finally {
      isDeleteDirectModalOpen = false;
      paperToDeleteDirect = null;
    }
  }

  function handleLoadPaperFromCitation(e: { paperId: string } | CustomEvent<{ paperId: string }>) {
    const targetId = 'detail' in e ? e.detail.paperId : e.paperId;
    const found = paperLibrary.find(p => p.id === targetId || p.id.includes(targetId));
    if (found) {
      setPaper(found);
      currentMainView = 'workspace';
    }
  }

  function handleUpdateCitationGraph(e: { paperId: string; citationGraph: any } | CustomEvent<{ paperId: string; citationGraph: any }>) {
    const { paperId, citationGraph } = 'detail' in e ? e.detail : e;
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

  function handleJumpToSectionFromNotes(e: CustomEvent<{ paperId: string; sectionId: string }> | { paperId: string; sectionId: string }) {
    const detail = 'detail' in e ? e.detail : e;
    const { paperId, sectionId } = detail;
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
        workspaceRef?.jumpToSection(sectionId, 'nav');
      }, 50);
    }
  }

  function handleByokSave(event: { provider: string; model: string; apiKey: string; ollamaUrl?: string } | CustomEvent<{ provider: string; model: string; apiKey: string }>) {
    const detail = 'detail' in event ? event.detail : event;
    const p = detail.provider;
    const m = detail.model;
    modelName = formatModelDisplayName(p, m);
    workspaceRef?.refreshCompanionKey();
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
    isCollapsed={isRailCollapsed}
    memoryUsageMb={localMemoryMb}
    memoryPercent={localMemoryPercent}
    memoryTooltip={localMemoryTooltip}
    ontoggleCollapse={(data) => setRailCollapsed(data.isCollapsed)}
    onnavigate={(data) => {
      if (data.path === 'paper-repository') {
        currentMainView = 'repository';
      } else if (data.path === 'cognitive-notes') {
        currentMainView = 'notes';
      } else if (data.path === 'citation-graph') {
        currentMainView = 'citation-graph';
      } else if (data.path === 'prompt-formula-lab') {
        currentMainView = 'workspace';
        readingMode = 'figures';
      } else if (data.path === 'reading-workspace') {
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
      onmodeChange={handleModeChange}
      onzoomChange={handleZoomChange}
      ontogglePdfDrawer={() => isPdfDrawerOpen = !isPdfDrawerOpen}
      onopenSettings={() => isByokOpen = true}
      onopenRepository={() => currentMainView = 'repository'}
      onopenImport={() => isImportOpen = true}
      onexportNotes={() => currentMainView = 'notes'}
      onbackToWorkspace={() => currentMainView = 'workspace'}
      onconvertToTraditional={() => handleConvertToTraditional()}
      ondeleteCurrentPaper={(data) => handleDeletePaperDirect(data.paperId)}
    />

    <!-- Main Dynamic Route View Frame (pushed down by 64px header) -->
    <main class="w-full pt-16 h-full flex flex-col bg-[#282828] overflow-hidden">
      {#if currentMainView === 'repository'}
        <PaperRepositoryView
          library={paperLibrary}
          {activePaperId}
          {localMemoryMb}
          {cacheStats}
          onselectPaper={(data) => { setPaper(data.paper); currentMainView = 'workspace'; }}
          onchangeActivePaper={(data) => setPaper(data.paper)}
          onopenCitationGraph={(data) => { setPaper(data.paper); currentMainView = 'citation-graph'; }}
          onopenNotes={(data) => { setPaper(data.paper); currentMainView = 'notes'; }}
          onopenImport={() => isImportOpen = true}
          onupdateLibrary={(data) => {
            paperLibrary = data.library;
            refreshCacheStats();
            if (activePaper && !paperLibrary.some(p => p.id === activePaper?.id)) {
              const next = paperLibrary.length > 0 ? paperLibrary[0] : null;
              if (next) setPaper(next);
            }
          }}
          onconvertToTraditional={(data) => handleConvertToTraditional(data.paper)}
          onbackToWorkspace={() => currentMainView = 'workspace'}
        />
      {:else if currentMainView === 'notes'}
        <CognitiveNotesView
          {paperLibrary}
          {activePaper}
          onjumpToSection={handleJumpToSectionFromNotes}
          onbackToWorkspace={() => currentMainView = 'workspace'}
        />
      {:else if currentMainView === 'citation-graph'}
        <CitationGraphView
          paper={activePaper}
          onbackToWorkspace={() => currentMainView = 'workspace'}
          onloadPaper={handleLoadPaperFromCitation}
          onupdateCitationGraph={handleUpdateCitationGraph}
        />
      {:else}
        <!-- Reading Workspace Studio View -->
        <ReadingWorkspaceView
          bind:this={workspaceRef}
          {activePaper}
          bind:readingMode
          bind:zoomLevel
          bind:isPdfDrawerOpen
          onupdatePaper={handleUpdatePaper}
          onimportPaper={handleDirectImportPaper}
          onopenSettings={() => isByokOpen = true}
          onexportNotes={() => currentMainView = 'notes'}
          onrefreshCacheStats={refreshCacheStats}
        />
      {/if}
    </main>
  </div>

  <!-- Import Paper Modal -->
  <ImportPaperModal
    bind:isOpen={isImportOpen}
    currentLibrary={paperLibrary}
    onpaperLoaded={handlePaperLoaded}
    onopenSettings={() => { isImportOpen = false; isByokOpen = true; }}
    onclose={() => isImportOpen = false}
  />

  <!-- System & LLM Settings Modal -->
  <SettingsModal
    bind:isOpen={isByokOpen}
    onsave={handleByokSave}
    onclose={() => isByokOpen = false}
  />

  <!-- 風格化刪除確認 Modal (從 Header 快捷觸發) -->
  <DeletePaperConfirmModal
    bind:isOpen={isDeleteDirectModalOpen}
    paper={paperToDeleteDirect}
    onconfirm={(data) => handleConfirmDeleteDirect(data.id)}
    oncancel={() => { isDeleteDirectModalOpen = false; paperToDeleteDirect = null; }}
  />
</div>

<svelte:window
  on:keydown={handleGlobalKeydown}
  on:pointerdown={handleGlobalPointerDown}
/>
