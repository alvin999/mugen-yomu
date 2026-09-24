<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import { saveLibraryToStorage, setActivePaperId } from '../../stores/documentStore';
  import { loadPaperReadingState, calculateReadingStats, applyProgressToSections } from '../../stores/readingStore';
  import type { CacheStats } from '../../services/cacheService';

  import PaperHeroStats from './PaperHeroStats.svelte';
  import PaperGridItem from './PaperGridItem.svelte';
  import PaperTableList from './PaperTableList.svelte';
  import PaperInspectorDrawer from './PaperInspectorDrawer.svelte';

  export let library: PaperDocument[] = [];
  export let activePaperId: string = '';
  export let localMemoryMb: number = 0.8;
  export let cacheStats: CacheStats | null = null;

  const dispatch = createEventDispatcher<{
    selectPaper: { paper: PaperDocument };
    openCitationGraph: { paper: PaperDocument };
    openNotes: { paper: PaperDocument };
    openImport: void;
    updateLibrary: { library: PaperDocument[] };
    backToWorkspace: void;
  }>();

  // 篩選與狀態
  let categoryFilter: 'all' | 'paper' | 'web' | 'in-progress' | 'completed' = 'all';
  let searchQuery: string = '';
  let sortBy: 'recent' | 'progress' | 'title' | 'sections' = 'recent';
  let viewMode: 'grid' | 'table' = 'grid';

  // 各篇論文的即時閱讀進度與筆記數量快顯對映
  let progressMap: Record<string, number> = {};
  let notesCountMap: Record<string, number> = {};

  // 預覽抽屜狀態
  let previewPaper: PaperDocument | null = null;
  let isInspectorOpen: boolean = false;

  $: refreshPaperStats(library);

  function refreshPaperStats(papers: PaperDocument[]) {
    if (typeof window === 'undefined') return;
    const pMap: Record<string, number> = {};
    const nMap: Record<string, number> = {};

    (papers || []).forEach(p => {
      if (!p || !p.id) return;
      // 1. 進度計算
      const saved = loadPaperReadingState(p.id);
      if (saved && p.sections) {
        const withProgress = applyProgressToSections(p.sections, saved);
        const stats = calculateReadingStats(withProgress);
        pMap[p.id] = stats.deepCoveragePercent;
      } else {
        const stats = calculateReadingStats(p.sections || []);
        pMap[p.id] = stats.deepCoveragePercent;
      }

      // 2. 筆記篇數計算
      try {
        const rawNotes = localStorage.getItem(`mugen_notes_${p.id}`);
        const parsed = rawNotes ? JSON.parse(rawNotes) : [];
        nMap[p.id] = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        nMap[p.id] = 0;
      }
    });

    progressMap = pMap;
    notesCountMap = nMap;
  }

  // 統計整體數量
  $: completedCount = Object.values(progressMap).filter(p => p >= 100).length;
  $: inProgressCount = Object.values(progressMap).filter(p => p > 0 && p < 100).length;

  // 根據分類與搜尋條件動態過濾清單
  $: filteredPapers = (library || []).filter(p => {
    if (!p) return false;
    // 1. 分類過濾
    if (categoryFilter === 'paper' && p.type === 'web') return false;
    if (categoryFilter === 'web' && p.type !== 'web') return false;
    const prog = progressMap[p.id] || 0;
    if (categoryFilter === 'completed' && prog < 100) return false;
    if (categoryFilter === 'in-progress' && (prog === 0 || prog >= 100)) return false;

    // 2. 搜尋過濾
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchAuthors = Array.isArray(p.authors)
        ? p.authors.some(a => (a || '').toLowerCase().includes(q))
        : (typeof p.authors === 'string' && (p.authors as string).toLowerCase().includes(q));
      const matchVenue = (p.venue || '').toLowerCase().includes(q);
      const matchArxiv = (p.arxivId || '').toLowerCase().includes(q);
      return matchTitle || matchAuthors || matchVenue || matchArxiv;
    }
    return true;
  }).sort((a, b) => {
    if (!a || !b) return 0;
    if (sortBy === 'progress') {
      return (progressMap[b.id] || 0) - (progressMap[a.id] || 0);
    }
    if (sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sortBy === 'sections') {
      return (b.sections?.length || 0) - (a.sections?.length || 0);
    }
    // 'recent': active paper first, then original order
    if (a.id === activePaperId) return -1;
    if (b.id === activePaperId) return 1;
    return 0;
  });

  function handleSelectPaper(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    dispatch('selectPaper', { paper });
  }

  function handleViewCitation(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    dispatch('openCitationGraph', { paper });
  }

  function handleViewNotes(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    dispatch('openNotes', { paper });
  }

  function handlePreviewPaper(paper: PaperDocument) {
    previewPaper = paper;
    isInspectorOpen = true;
  }

  function handleDeletePaper(id: string) {
    if (id === 'arxiv_1706_03762' || id === 'cvpr_2016_resnet' || id === 'web_anthropic_circuits') {
      alert('預設經典論文與專文具備防護機制，無法刪除！');
      return;
    }
    if (!confirm('確定要自本地文獻庫中移除這篇文章嗎？此操作將同時移除對應之快取紀錄。')) return;

    const updated = library.filter(p => p.id !== id);
    library = updated;
    saveLibraryToStorage(library);
    dispatch('updateLibrary', { library });

    if (activePaperId === id && library.length > 0) {
      handleSelectPaper(library[0]);
    }
  }

  function handleExportBackup() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(library, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mugen_yomu_library_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
</script>

<div class="h-full w-full flex flex-col bg-[#282828] text-[#ebdbb2] overflow-hidden select-text">
  <!-- 1. Top Stat & Search Hero Ribbon -->
  <PaperHeroStats
    totalPapers={(library || []).length}
    readCount={completedCount}
    {inProgressCount}
    {localMemoryMb}
    {cacheStats}
    bind:searchQuery
    bind:sortBy
    bind:viewMode
    on:search={(e) => searchQuery = e.detail.query}
    on:sortChange={(e) => sortBy = e.detail.sortBy}
    on:viewModeChange={(e) => viewMode = e.detail.mode}
    on:openImport={() => dispatch('openImport')}
    on:exportBackup={handleExportBackup}
  />

  <!-- 2. Main Studio Body (Left Category Rail + Right Content Gallery) -->
  <div class="flex-1 overflow-hidden flex divide-x divide-[#3c3836]">
    <!-- Left Category Filter Rail (w-52) -->
    <aside class="w-52 bg-[#1d2021] flex flex-col justify-between p-3 select-none shrink-0">
      <div class="flex flex-col gap-1">
        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] px-2 py-1">文獻篩選分類</span>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'all' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => categoryFilter = 'all'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">folder</span>
            <span>全部文獻</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">{library.length}</span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'paper' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => categoryFilter = 'paper'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">description</span>
            <span>學術論文 (arXiv)</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">
            {library.filter(p => p.type !== 'web').length}
          </span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'web' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => categoryFilter = 'web'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">language</span>
            <span>網頁專文 (Web)</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">
            {library.filter(p => p.type === 'web').length}
          </span>
        </button>

        <div class="h-px bg-[#3c3836] my-2"></div>

        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] px-2 py-1">精讀進度</span>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'in-progress' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => categoryFilter = 'in-progress'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">pending</span>
            <span>研讀進行中</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">{inProgressCount}</span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'completed' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => categoryFilter = 'completed'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[#b8bb26]">check_circle</span>
            <span>精讀已掌握</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">{completedCount}</span>
        </button>
      </div>

      <!-- Quick Tips -->
      <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg text-[11px] text-[#a89984] flex flex-col gap-1">
        <span class="font-bold text-[#ebdbb2] flex items-center gap-1">
          <span class="material-symbols-outlined text-[14px] text-[#fe8019]">lightbulb</span>
          快速提示
        </span>
        <p class="leading-relaxed text-[10px]">
          點選卡片可即時開啟全文。文獻與閱讀進度完全儲存於本機 IndexedDB，無隱私外洩風險。
        </p>
      </div>
    </aside>

    <!-- Right Content Gallery (flex-1) -->
    <main class="flex-1 overflow-y-auto p-6 bg-[#282828]">
      {#if filteredPapers.length === 0}
        <div class="h-full flex flex-col items-center justify-center text-center py-16">
          <div class="w-16 h-16 rounded-2xl bg-[#1d2021] border border-[#3c3836] flex items-center justify-center text-[#7c6f64] mb-3 shadow-inner">
            <span class="material-symbols-outlined text-[32px]">manage_search</span>
          </div>
          <h3 class="text-sm font-bold text-[#ebdbb2] mb-1">找不到相符的文獻</h3>
          <p class="text-xs text-[#a89984] max-w-sm mb-4">
            請嘗試調整篩選條件或搜尋關鍵字，或點擊下方按鈕匯入新的論文或專文。
          </p>
          <button
            class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            on:click={() => dispatch('openImport')}
          >
            <span class="material-symbols-outlined text-[16px]">add_circle</span>
            <span>匯入新文獻</span>
          </button>
        </div>
      {:else if viewMode === 'grid'}
        <!-- Bento Cards Grid (Responsive 1, 2, or 3 cols) -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {#each filteredPapers as paper (paper.id)}
            <PaperGridItem
              {paper}
              isActive={paper.id === activePaperId}
              progressPercent={progressMap[paper.id] || 0}
              notesCount={notesCountMap[paper.id] || 0}
              on:select={(e) => handleSelectPaper(e.detail.paper)}
              on:viewCitation={(e) => handleViewCitation(e.detail.paper)}
              on:viewNotes={(e) => handleViewNotes(e.detail.paper)}
              on:preview={(e) => handlePreviewPaper(e.detail.paper)}
              on:delete={(e) => handleDeletePaper(e.detail.id)}
            />
          {/each}
        </div>
      {:else}
        <!-- Dense Table View -->
        <PaperTableList
          papers={filteredPapers}
          {activePaperId}
          {progressMap}
          {notesCountMap}
          on:select={(e) => handleSelectPaper(e.detail.paper)}
          on:viewCitation={(e) => handleViewCitation(e.detail.paper)}
          on:viewNotes={(e) => handleViewNotes(e.detail.paper)}
          on:preview={(e) => handlePreviewPaper(e.detail.paper)}
          on:delete={(e) => handleDeletePaper(e.detail.id)}
        />
      {/if}
    </main>
  </div>

  <!-- Right-side Detail Inspector Drawer -->
  <PaperInspectorDrawer
    paper={previewPaper}
    bind:isOpen={isInspectorOpen}
    progressPercent={previewPaper ? (progressMap[previewPaper.id] || 0) : 0}
    notesCount={previewPaper ? (notesCountMap[previewPaper.id] || 0) : 0}
    on:close={() => isInspectorOpen = false}
    on:select={(e) => handleSelectPaper(e.detail.paper)}
    on:viewCitation={(e) => handleViewCitation(e.detail.paper)}
    on:viewNotes={(e) => handleViewNotes(e.detail.paper)}
  />
</div>
