<script lang="ts">
  import { onMount } from 'svelte';
  import NavigationRail from './layout/NavigationRail.svelte';
  import AppHeader from './layout/AppHeader.svelte';
  import DensityRibbon from './layout/DensityRibbon.svelte';
  import ReadingMap from './reading-map/ReadingMap.svelte';
  import BilingualReader from './reader/BilingualReader.svelte';
  import CognitiveCompanion from './companion/CognitiveCompanion.svelte';
  import ByokModal from './byok/ByokModal.svelte';
  import ImportPaperModal from './repository/ImportPaperModal.svelte';
  import PaperRepositoryPanel from './repository/PaperRepositoryPanel.svelte';

  import {
    getInitialLibrary,
    getActivePaperId,
    setActivePaperId,
    type PaperDocument
  } from '../stores/documentStore';
  import { flattenSections } from '../stores/readingStore';

  // State Management
  let readingMode: 'bilingual' | 'zen' | 'figures' = 'bilingual';
  let zoomLevel: number = 100;
  let isByokOpen: boolean = false;
  let isImportOpen: boolean = false;
  let isRepositoryOpen: boolean = false;

  let modelName: string = 'Groq (Llama 3.3 70B)';
  let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  let companionRef: any = null;

  let paperLibrary: PaperDocument[] = [];
  let activePaperId: string = 'mugen_yomu_user_manual';
  let activePaper: PaperDocument | null = null;
  let activeSectionId: string = '3.2';
  let activeContextText: string = '§ 3.2 Complex Sentence Deconstruction';

  // Notes in memory
  let capturedNotes: Array<{ title: string; text: string; time: string }> = [];

  onMount(() => {
    paperLibrary = getInitialLibrary();
    activePaperId = getActivePaperId();
    const current = paperLibrary.find(p => p.id === activePaperId) || paperLibrary[0];
    if (current) {
      setPaper(current);
    }
  });

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

  function handleModeChange(event: CustomEvent<{ mode: 'bilingual' | 'zen' | 'figures' }>) {
    readingMode = event.detail.mode;
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
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string }>) {
    readingMode = 'figures';
  }

  function handleSelectEquation(event: CustomEvent<{ eqId: string }>) {
    if (activePaper?.sections) {
      const allSecs = flattenSections(activePaper.sections);
      const formulaSec = allSecs.find(s => s.formulas && s.formulas.some((f: any) => f.id === event.detail.eqId)) ||
        allSecs.find(s => s.id === '3.2' || s.id === '3.2.1');
      if (formulaSec) {
        activeSectionId = formulaSec.id;
        activeContextText = `§ ${formulaSec.title}`;
        return;
      }
    }
    activeSectionId = '3.2';
    activeContextText = '§ 3.2 Complex Sentence Deconstruction';
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
    }
  }

  function handleAskQuestion(event: CustomEvent<{ query: string; reply?: string }>) {
    activeContextText = `探討中: ${event.detail.query.slice(0, 18)}...`;
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
      // Create initial sample notes if empty
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
    if (p === 'groq') {
      modelName = `Groq (${m.replace('llama-', 'Llama-').slice(0, 16)})`;
    } else {
      modelName = `${p.toUpperCase()} (${m.slice(0, 12)})`;
    }
    if (companionRef && companionRef.refreshKeyFromStorage) {
      companionRef.refreshKeyFromStorage();
    }
  }
</script>

<div class="flex h-screen w-screen bg-[#282828] text-[#ebdbb2] overflow-hidden select-text">
  <!-- Left Navigation Rail (Fixed 64px) -->
  <NavigationRail
    paperCount={paperLibrary.length}
    on:openRepository={() => isRepositoryOpen = true}
    on:navigate={(e) => {
      if (e.detail.path === 'cognitive-notes') {
        handleExportNotes();
      }
    }}
  />

  <!-- Main Content Body (Offset left by 64px rail) -->
  <div class="pl-64 flex-1 flex flex-col h-full overflow-hidden">
    <!-- Top Fixed Header -->
    <AppHeader
      {activePaper}
      bind:readingMode
      bind:zoomLevel
      {modelName}
      {cachedInfo}
      on:modeChange={handleModeChange}
      on:zoomChange={handleZoomChange}
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

      <!-- Studio Layout Grid (Dynamic by readingMode) -->
      <div class="flex-1 overflow-hidden grid transition-all duration-300 {
        readingMode === 'zen'
          ? 'grid-cols-1'
          : readingMode === 'figures'
          ? 'grid-cols-[270px_minmax(0,1fr)_minmax(0,1fr)]'
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
</div>
