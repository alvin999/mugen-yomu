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
  import PaperRepositoryPanel from './repository/PaperRepositoryPanel.svelte';
  import OriginalDocumentViewer from './reader/OriginalDocumentViewer.svelte';

  import {
    getInitialLibrary,
    getActivePaperId,
    setActivePaperId,
    type PaperDocument
  } from '../stores/documentStore';
  import { flattenSections } from '../stores/readingStore';
  import { getCacheStats, type CacheStats } from '../services/cacheService';
  import { formatModelDisplayName } from '../services/aiService';

  // State Management
  let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  let isPdfDrawerOpen: boolean = false;
  let splitRatio: number = 50;
  let isDraggingSplit: boolean = false;
  let zoomLevel: number = 100;
  let isByokOpen: boolean = false;
  let isImportOpen: boolean = false;
  let isRepositoryOpen: boolean = false;
  let isRailCollapsed: boolean = false;

  let modelName: string = 'Groq (Llama 3.3 70B)';
  let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  let cacheStats: CacheStats | null = null;
  let companionRef: any = null;
  let readerRef: any = null;

  let paperLibrary: PaperDocument[] = [];
  let activePaperId: string = 'mugen_yomu_user_manual';
  let activePaper: PaperDocument | null = null;
  let activeSectionId: string = '3.2';
  let activeContextText: string = '§ 3.2 Complex Sentence Deconstruction';

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
  }

  function setPaper(paper: PaperDocument) {
    activePaper = paper;
    activePaperId = paper.id;
    setActivePaperId(paper.id);

    // Pick section 3.2 or 3.2.1 if exists, else first section
    const allSecs = flattenSections(paper.sections);
    const targetSec = allSecs.find(s => s.id === '3.2' || s.id === '3.2.1') || allSecs[0];
    if (targetSec) {
      activeSectionId = targetSec.id;
      activeContextText = `§ ${targetSec.title}`;
    }
  }

  function handleModeChange(event: CustomEvent<{ mode: 'bilingual' | 'split' | 'zen' | 'figures' }>) {
    readingMode = event.detail.mode;
    if (readingMode === 'split') {
      isPdfDrawerOpen = false;
    }
  }

  function handleSplitMouseDown(e: MouseEvent) {
    isDraggingSplit = true;
    window.addEventListener('mousemove', handleSplitMouseMove);
    window.addEventListener('mouseup', handleSplitMouseUp);
  }

  function handleSplitMouseMove(e: MouseEvent) {
    if (!isDraggingSplit) return;
    const container = document.getElementById('split-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const newRatio = Math.max(25, Math.min(75, Math.round((offsetX / rect.width) * 100)));
    splitRatio = newRatio;
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

  function handleSelectSection(event: CustomEvent<{ id: string }>) {
    activeSectionId = event.detail.id;
    if (activePaper) {
      const allSecs = flattenSections(activePaper.sections);
      const found = allSecs.find(s => s.id === activeSectionId);
      activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
    }
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    setTimeout(() => {
      if (readerRef && readerRef.scrollToTarget) {
        readerRef.scrollToTarget('sec-' + activeSectionId);
      }
    }, 60);
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string }>) {
    readingMode = 'figures';
  }

  function handleSectionsAligned(event: CustomEvent<{ sections: ChapterSection[] }>) {
    if (activePaper && event.detail.sections) {
      activePaper.sections = event.detail.sections;
      activePaper = { ...activePaper };
    }
  }

  function handleSelectEquation(event: CustomEvent<{ eqId: string }>) {
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    if (activePaper?.sections) {
      const allSecs = flattenSections(activePaper.sections);
      const formulaSec = allSecs.find(s => s.formulas && s.formulas.some((f: any) => f.id === event.detail.eqId)) ||
        allSecs.find(s => s.id === '3.2' || s.id === '3.2.1');
      if (formulaSec) {
        activeSectionId = formulaSec.id;
        activeContextText = `§ ${formulaSec.title}`;
      }
    }
    setTimeout(() => {
      if (readerRef && readerRef.scrollToTarget) {
        readerRef.scrollToTarget('eq-' + event.detail.eqId);
      }
    }, 60);
  }

  function handleReaderAction(event: CustomEvent<{ action: string; payload?: any }>) {
    const { action, payload } = event.detail;
    if (action === 'explainTerm') {
      activeContextText = `術語解析 · ${payload}`;
    } else if (action === 'showIntuition') {
      activeContextText = `${activeSectionId} · 白話科研直覺`;
    } else if (action === 'showSyntax') {
      activeContextText = `${activeSectionId} · 長難句語法拆解`;
    } else if (action === 'showTerminology') {
      activeContextText = `${activeSectionId} · 關鍵術語對齊`;
    } else if (action === 'addNote') {
      const noteTitle = payload || activeContextText;
      capturedNotes = [
        ...capturedNotes,
        {
          title: noteTitle,
          text: `於 ${activeContextText} 標註之重要論文觀點與筆記內容。`,
          time: new Date().toLocaleTimeString()
        }
      ];
      alert(`已為「${noteTitle}」新增精讀筆記！`);
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
    }
  }

  function handleAskQuestion(event: CustomEvent<{ query: string; reply?: string }>) {
    activeContextText = `探討中: ${event.detail.query.slice(0, 18)}...`;
    refreshCacheStats();
  }

  function handleQuickCompanionAction(event: CustomEvent<{ action: string; payload?: any }>) {
    if (event.detail.action === 'saveSnippet' && event.detail.payload) {
      capturedNotes = [
        ...capturedNotes,
        {
          title: `伴讀精華 · ${activeContextText}`,
          text: event.detail.payload,
          time: new Date().toLocaleTimeString()
        }
      ];
    } else if (event.detail.action === 'exportNotes') {
      handleExportNotes();
    }
  }

  function handleExportNotes() {
    if (capturedNotes.length === 0) {
      capturedNotes = [
        {
          title: `精讀標註 · ${activePaper?.title || 'Attention Is All You Need'}`,
          text: '自注意力機制消除了傳統循環模型中的順序依賴，點積矩陣除以 √d_k 阻斷了 Softmax 梯度消失。',
          time: new Date().toLocaleTimeString()
        }
      ];
    }

    let md = `# MUGEN YOMU 精讀筆記匯出\n\n`;
    md += `**文獻名稱**：${activePaper?.title}\n`;
    md += `**出處**：${activePaper?.venue} (${activePaper?.arxivId || activePaper?.sourceUrl || ''})\n`;
    md += `**匯出時間**：${new Date().toLocaleString()}\n\n---\n\n`;

    capturedNotes.forEach((n, idx) => {
      md += `### ${idx + 1}. ${n.title} (${n.time})\n\n`;
      md += `${n.text}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `MUGEN_YOMU_Notes_${activePaper?.id || 'paper'}.md`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  }

  function handlePaperLoaded(event: CustomEvent<{ paper: PaperDocument; library: PaperDocument[] }>) {
    paperLibrary = event.detail.library;
    setPaper(event.detail.paper);
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
    paperCount={paperLibrary.length}
    bind:isCollapsed={isRailCollapsed}
    on:openRepository={() => isRepositoryOpen = true}
    on:toggleCollapse={(e) => isRailCollapsed = e.detail.isCollapsed}
    on:navigate={(e) => {
      if (e.detail.path === 'cognitive-notes') {
        handleExportNotes();
      } else if (e.detail.path === 'prompt-formula-lab') {
        readingMode = 'figures';
      }
    }}
  />

  <!-- Main Content Body (Offset left dynamically by rail width) -->
  <div class="transition-all duration-300 ease-in-out {isRailCollapsed ? 'pl-16' : 'pl-60'} flex-1 flex flex-col h-full overflow-hidden">
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
      on:modeChange={handleModeChange}
      on:zoomChange={handleZoomChange}
      on:togglePdfDrawer={() => isPdfDrawerOpen = !isPdfDrawerOpen}
      on:openSettings={() => isByokOpen = true}
      on:openRepository={() => isRepositoryOpen = true}
      on:openImport={() => isImportOpen = true}
      on:exportNotes={handleExportNotes}
    />

    <!-- Main Workspace Frame (pushed down by 64px header) -->
    <main class="w-full pt-16 h-full flex flex-col bg-[#282828] overflow-hidden">
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
              on:switchToSplit={() => {}}
            />
          </div>

          <!-- Central Draggable Splitter Handle -->
          <div
            class="w-2.5 bg-[#1d2021] hover:bg-[#fe8019] transition-colors cursor-col-resize flex items-center justify-center z-20 group shrink-0"
            on:mousedown={handleSplitMouseDown}
            title="拖曳以自訂左右分屏比例"
            role="separator"
          >
            <div class="w-1 h-8 bg-[#504945] group-hover:bg-[#1d2021] rounded-full"></div>
          </div>

          <!-- Right Track: Bilingual Academic Reader (Zoomable) -->
          <div class="h-full overflow-hidden flex-1" style="zoom: {zoomLevel}%">
            <BilingualReader
              bind:this={readerRef}
              paper={activePaper}
              {activeSectionId}
              {readingMode}
              on:selectSection={handleSelectSection}
              on:readerAction={handleReaderAction}
            />
          </div>
        </div>
      {:else if readingMode === 'figures'}
        <!-- Derivations & Figures Comparative Studio Canvas -->
        <div class="flex-1 overflow-hidden">
          <DerivationsFiguresView
            paper={activePaper}
            on:selectSection={(e) => {
              readingMode = 'bilingual';
              handleSelectSection(e);
            }}
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
              {activeSectionId}
              arxivId={activePaper?.arxivId}
              sourceUrl={activePaper?.sourceUrl}
              on:selectSection={handleSelectSection}
              on:selectFigure={handleSelectFigure}
              on:selectEquation={handleSelectEquation}
            />
          {/if}

          <!-- Column 2: Bilingual Paper Reader (Scaled by zoomLevel) -->
          <div class="h-full overflow-hidden" style="zoom: {zoomLevel}%">
            <BilingualReader
              bind:this={readerRef}
              paper={activePaper}
              {activeSectionId}
              {readingMode}
              on:selectSection={handleSelectSection}
              on:readerAction={handleReaderAction}
            />
          </div>

          <!-- Column 3: AI Cognitive Companion (hidden in Zen mode) -->
          {#if readingMode !== 'zen'}
            <CognitiveCompanion
              bind:this={companionRef}
              {activeContextText}
              companionData={activePaper?.companionData[activeSectionId]}
              on:askQuestion={handleAskQuestion}
              on:quickAction={handleQuickCompanionAction}
              on:openSettings={() => isByokOpen = true}
            />
          {/if}

        </div>
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

  <!-- Paper Repository Panel -->
  <PaperRepositoryPanel
    bind:isOpen={isRepositoryOpen}
    library={paperLibrary}
    {activePaperId}
    on:selectPaper={handlePaperSelected}
    on:openImport={() => { isRepositoryOpen = false; isImportOpen = true; }}
    on:close={() => isRepositoryOpen = false}
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
      class="fixed inset-0 top-16 bg-black/45 z-30 transition-opacity animate-fade-in"
      on:click={() => isPdfDrawerOpen = false}
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
        on:close={() => isPdfDrawerOpen = false}
        on:switchToSplit={() => { isPdfDrawerOpen = false; readingMode = 'split'; }}
      />
    </div>
  {/if}
</div>

<svelte:window on:keydown={handleGlobalKeydown} />

