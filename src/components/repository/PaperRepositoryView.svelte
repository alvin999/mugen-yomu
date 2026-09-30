<script lang="ts">
  import type { PaperDocument } from '../../stores/documentStore';
  import {
    saveLibraryToStorage,
    setActivePaperId,
    convertDocumentToTraditional,
    isPaperProtected,
    deletePaperFromLibrary
  } from '../../stores/documentStore';
  import { loadPaperReadingState, calculateReadingStats, applyProgressToSections } from '../../stores/readingStore';
  import type { CacheStats } from '../../services/cacheService';

  import PaperHeroStats from './PaperHeroStats.svelte';
  import PaperGridItem from './PaperGridItem.svelte';
  import PaperTableList from './PaperTableList.svelte';
  import PaperInspectorDrawer from './PaperInspectorDrawer.svelte';
  import DeletePaperConfirmModal from '../common/DeletePaperConfirmModal.svelte';

  interface Props {
    library?: PaperDocument[];
    activePaperId?: string;
    localMemoryMb?: number;
    cacheStats?: CacheStats | null;
    onselectPaper?: (data: { paper: PaperDocument }) => void;
    onchangeActivePaper?: (data: { paper: PaperDocument }) => void;
    onopenCitationGraph?: (data: { paper: PaperDocument }) => void;
    onopenNotes?: (data: { paper: PaperDocument }) => void;
    onopenImport?: () => void;
    onupdateLibrary?: (data: { library: PaperDocument[] }) => void;
    onconvertToTraditional?: (data: { paper: PaperDocument }) => void;
    onbackToWorkspace?: () => void;
  }

  let {
    library = $bindable([]),
    activePaperId = $bindable(''),
    localMemoryMb = 0.8,
    cacheStats = null,
    onselectPaper,
    onchangeActivePaper,
    onopenCitationGraph,
    onopenNotes,
    onopenImport,
    onupdateLibrary,
    onconvertToTraditional,
    onbackToWorkspace
  }: Props = $props();

  // 篩選與狀態
  let categoryFilter: 'all' | 'paper' | 'web' | 'in-progress' | 'completed' = $state('all');
  let searchQuery: string = $state('');
  let sortBy: 'recent' | 'progress' | 'title' | 'sections' = $state('recent');
  let viewMode: 'grid' | 'table' = $state('grid');

  // 各篇論文的即時閱讀進度與筆記數量快顯對映
  let progressMap: Record<string, number> = $state({});
  let notesCountMap: Record<string, number> = $state({});

  // 預覽抽屜狀態
  let previewPaper: PaperDocument | null = $state(null);
  let isInspectorOpen: boolean = $state(false);

  // 刪除確認 Modal 狀態
  let paperToDelete: PaperDocument | null = $state(null);
  let isDeleteModalOpen: boolean = $state(false);

  $effect(() => {
    refreshPaperStats(library);
  });

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
  let completedCount = $derived(Object.values(progressMap).filter(p => p >= 100).length);
  let inProgressCount = $derived(Object.values(progressMap).filter(p => p > 0 && p < 100).length);

  // 根據分類與搜尋條件動態過濾清單
  let filteredPapers = $derived.by(() => {
    return (library || []).filter(p => {
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
  });

  function handleSelectPaper(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    onselectPaper?.({ paper });
  }

  function handleViewCitation(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    onopenCitationGraph?.({ paper });
  }

  function handleViewNotes(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    onopenNotes?.({ paper });
  }

  function handlePreviewPaper(paper: PaperDocument) {
    previewPaper = paper;
    isInspectorOpen = true;
  }

  function handleConvertToTraditional(paper: PaperDocument) {
    if (!paper) return;
    const converted = convertDocumentToTraditional(paper);
    library = library.map(p => p.id === converted.id ? converted : p);
    saveLibraryToStorage(library);
    previewPaper = converted;
    onupdateLibrary?.({ library });
    onconvertToTraditional?.({ paper: converted });
  }

  function handleDeletePaper(id: string) {
    const target = library.find(p => p && p.id === id);
    if (!target) return;
    paperToDelete = target;
    isDeleteModalOpen = true;
  }

  function handleConfirmDelete(id: string) {
    try {
      const wasActive = activePaperId === id;
      const { updatedLibrary, nextActivePaper } = deletePaperFromLibrary(library, id);
      library = updatedLibrary;
      onupdateLibrary?.({ library });

      if (wasActive) {
        if (nextActivePaper) {
          activePaperId = nextActivePaper.id;
          setActivePaperId(nextActivePaper.id);
          // 靜默更新活躍文獻，不強迫跳回 workspace
          onchangeActivePaper?.({ paper: nextActivePaper });
        } else {
          activePaperId = '';
          setActivePaperId('');
        }
      }

      if (previewPaper && previewPaper.id === id) {
        previewPaper = null;
        isInspectorOpen = false;
      }
    } catch (err: any) {
      console.error('刪除失敗:', err);
    } finally {
      isDeleteModalOpen = false;
      paperToDelete = null;
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
    onsearch={(data) => searchQuery = data.query}
    onsortChange={(data) => sortBy = data.sortBy}
    onviewModeChange={(data) => viewMode = data.mode}
    onopenImport={() => onopenImport?.()}
    onexportBackup={handleExportBackup}
  />

  <!-- 2. Main Studio Body (Left Category Rail + Right Content Gallery) -->
  <div class="flex-1 overflow-hidden flex divide-x divide-[#3c3836]">
    <!-- Left Category & Filter Sidebar -->
    <aside class="w-64 bg-[#1d2021] flex flex-col justify-between p-4 shrink-0 overflow-y-auto select-none gap-4">
      <div class="flex flex-col gap-1.5">
        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] px-2 py-1">文獻庫分類</span>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'all' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => categoryFilter = 'all'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">folder_special</span>
            <span>全部典藏</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">{library.length}</span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'paper' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => categoryFilter = 'paper'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">description</span>
            <span>學術論文 (Papers)</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">
            {library.filter(p => p.type !== 'web').length}
          </span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'web' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => categoryFilter = 'web'}
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
          onclick={() => categoryFilter = 'in-progress'}
        >
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">pending</span>
            <span>研讀進行中</span>
          </div>
          <span class="font-mono text-[10px] text-[#7c6f64]">{inProgressCount}</span>
        </button>

        <button
          class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer {categoryFilter === 'completed' ? 'bg-[#3c3836] text-[#fe8019] font-bold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => categoryFilter = 'completed'}
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
            onclick={() => onopenImport?.()}
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
              onselect={(data) => handleSelectPaper(data.paper)}
              onviewCitation={(data) => handleViewCitation(data.paper)}
              onviewNotes={(data) => handleViewNotes(data.paper)}
              onpreview={(data) => handlePreviewPaper(data.paper)}
              ondelete={(data) => handleDeletePaper(data.id)}
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
          onselect={(data) => handleSelectPaper(data.paper)}
          onviewCitation={(data) => handleViewCitation(data.paper)}
          onviewNotes={(data) => handleViewNotes(data.paper)}
          onpreview={(data) => handlePreviewPaper(data.paper)}
          ondelete={(data) => handleDeletePaper(data.id)}
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
    onclose={() => isInspectorOpen = false}
    onselect={(data) => handleSelectPaper(data.paper)}
    onviewCitation={(data) => handleViewCitation(data.paper)}
    onviewNotes={(data) => handleViewNotes(data.paper)}
    onconvertToTraditional={(data) => handleConvertToTraditional(data.paper)}
    ondelete={(data) => handleDeletePaper(data.id)}
  />

  <!-- 風格化刪除確認 Modal -->
  <DeletePaperConfirmModal
    bind:isOpen={isDeleteModalOpen}
    paper={paperToDelete}
    onconfirm={(data) => handleConfirmDelete(data.id)}
    oncancel={() => { isDeleteModalOpen = false; paperToDelete = null; }}
  />
</div>
