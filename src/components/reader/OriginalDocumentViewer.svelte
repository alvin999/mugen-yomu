<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../stores/documentStore';
  import { flattenSections } from '../../stores/readingStore';
  import {
    loadPdf,
    renderPageToCanvas,
    buildPdfTextIndex,
    alignAllSectionsWithPdf,
    type PageTextEntry,
    type MatchResult
  } from '../../services/pdfService';
  import type * as pdfjsLib from 'pdfjs-dist';

  export let paper: PaperDocument | null = null;
  export let mode: 'split' | 'drawer' = 'split';
  export let activeSectionId: string = '';
  export let sections: ChapterSection[] = [];

  const dispatch = createEventDispatcher();

  // PDF Document & Canvas State
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let isLoadingPdf: boolean = false;
  let isRenderingPage: boolean = false;
  let renderError: string | null = null;
  let currentLoadedSource: string | null = null;

  // Viewer Mode: 'canvas' (PDF.js 畫布引擎，支援即時跳頁與字串比對) | 'native' (備援 Iframe)
  let viewerMode: 'canvas' | 'native' = 'canvas';

  // Local File States
  let localPdfBlobUrl: string | null = null;
  let localPdfArrayBuffer: ArrayBuffer | null = null;
  let isDraggingOver: boolean = false;
  let fileInputRef: HTMLInputElement | null = null;

  // Pagination & Display States
  let isSyncEnabled: boolean = true;
  let currentPage: number = 1;
  let totalPages: number = 0;
  let pageInputVal: number = 1;
  let zoomLevel: number = 1.25; // 預設縮放 125%

  // Full-text String Matching States
  let pageTextIndex: PageTextEntry[] = [];
  let isStringIndexing: boolean = false;
  let stringIndexProgress: number = 0;
  let isStringMatchActive: boolean = false;
  let matchResults: MatchResult[] = [];

  // Flattened sections for dropdown & matching
  $: allSections = flattenSections(sections && sections.length > 0 ? sections : (paper?.sections || []));
  $: activeSection = allSections.find(s => s.id === activeSectionId) || null;
  $: currentShowingSection = allSections.find(s => s.page === currentPage) || activeSection;

  // 1. 智慧識別 PDF 來源（本機 ArrayBuffer、Blob、paper.pdfUrl、arxivId、或 sourceUrl 包含 .pdf/.dvi）
  $: detectedPdfUrl = (() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (paper?.pdfUrl) return paper.pdfUrl;
    if (paper?.arxivId) return `https://arxiv.org/pdf/${paper.arxivId.replace(/^arxiv:/i, '')}.pdf`;
    
    if (paper?.sourceUrl) {
      const lower = paper.sourceUrl.toLowerCase();
      if (lower.includes('.pdf') || lower.includes('/pdf/') || lower.endsWith('.dvi')) {
        return paper.sourceUrl;
      }
    }

    if (paper?.type === 'paper' && paper?.sourceUrl) {
      return paper.sourceUrl;
    }

    return null;
  })();

  $: isPdf = Boolean(localPdfArrayBuffer || detectedPdfUrl);
  $: activeBaseUrl = detectedPdfUrl || paper?.sourceUrl || 'https://arxiv.org/pdf/1706.03762.pdf';

  // 監聽 PDF 來源變更並載入
  $: if (isPdf && (localPdfArrayBuffer || detectedPdfUrl)) {
    const sourceIdentifier = localPdfArrayBuffer ? 'local_buffer' : detectedPdfUrl;
    if (sourceIdentifier && sourceIdentifier !== currentLoadedSource) {
      currentLoadedSource = sourceIdentifier;
      initAndLoadPdf();
    }
  }

  // Synchronization Tracking State: 防止 currentPage 成為響應依賴，導致手動翻頁時被無限回彈
  let lastSyncedSectionId: string = '';

  // 監聽網頁章節焦點變化，並自動聯動 PDF 翻頁
  // 關鍵修正：僅在外部閱讀器焦點 (activeSectionId) 實際切換時才跳頁，手動翻頁不會被強制彈回
  $: if (isSyncEnabled && activeSectionId && activeSectionId !== lastSyncedSectionId && allSections.length > 0) {
    lastSyncedSectionId = activeSectionId;
    const sec = allSections.find(s => s.id === activeSectionId);
    if (sec && sec.page && sec.page !== currentPage) {
      jumpToPage(sec.page);
    }
  }

  onDestroy(() => {
    if (localPdfBlobUrl) URL.revokeObjectURL(localPdfBlobUrl);
  });

  /**
   * 初始化並透過 PDF.js 載入 PDF 文件
   */
  async function initAndLoadPdf() {
    isLoadingPdf = true;
    renderError = null;
    isStringMatchActive = false;

    try {
      let sourceToLoad: string | ArrayBuffer = localPdfArrayBuffer || detectedPdfUrl || '';
      if (!sourceToLoad) return;

      const loadedDoc = await loadPdf(sourceToLoad);
      pdfDoc = loadedDoc;
      totalPages = loadedDoc.numPages;
      viewerMode = 'canvas';

      // 載入完成後立即繪製當前頁面
      await triggerPageRender(currentPage);

      // 非同步在背景執行全文提取與「字串比對自動錨定」
      runStringMatchingPipeline();
    } catch (err: any) {
      console.warn('PDF.js 畫布載入失敗，切換至原生瀏覽器內核模式:', err);
      // 若因 CORS 限制無法以 Canvas 讀取遠端 PDF，自動降級為瀏覽器內核 Iframe
      viewerMode = 'native';
      renderError = `遠端來源受瀏覽器跨來源 (CORS) 限制：已自動切換至內核檢視器。拖放本機 PDF 即可開啟 100% 高精畫布與字串比對。`;
    } finally {
      isLoadingPdf = false;
    }
  }

  /**
   * 全文檢索與字串比對管線：比對各章節標題在 PDF 中的確切頁碼
   */
  async function runStringMatchingPipeline() {
    if (!pdfDoc) return;
    isStringIndexing = true;
    stringIndexProgress = 0;

    try {
      pageTextIndex = await buildPdfTextIndex(pdfDoc, (progress) => {
        stringIndexProgress = progress;
      });

      if (allSections && allSections.length > 0 && pageTextIndex.length > 0) {
        const { updatedSections, matchResults: res } = alignAllSectionsWithPdf(allSections, pageTextIndex);
        matchResults = res;
        isStringMatchActive = true;

        // 通知外層應用更新章節頁碼
        dispatch('sectionsAligned', { sections: updatedSections });

        // 若當前選取的章節有更精確的匹配頁碼，即刻校準
        if (activeSectionId) {
          const matched = updatedSections.find(s => s.id === activeSectionId);
          if (matched && matched.page && matched.page !== currentPage) {
            lastSyncedSectionId = activeSectionId;
            jumpToPage(matched.page);
          }
        }
      }
    } catch (err) {
      console.warn('全文比對管線執行異常:', err);
    } finally {
      isStringIndexing = false;
    }
  }

  /**
   * 繪製指定頁面至 Canvas
   */
  async function triggerPageRender(pageToRender: number) {
    if (!pdfDoc || !canvasElement || viewerMode !== 'canvas') return;
    isRenderingPage = true;

    try {
      const maxPage = totalPages > 0 ? totalPages : 1;
      const validPage = Math.max(1, Math.min(maxPage, pageToRender));
      await renderPageToCanvas(pdfDoc, validPage, canvasElement, zoomLevel);
    } catch (err: any) {
      console.warn('Canvas 繪圖異常:', err);
    } finally {
      isRenderingPage = false;
    }
  }

  function jumpToPage(targetPage: number, options: { fromUser?: boolean } = {}) {
    const maxPage = totalPages > 1 ? totalPages : 999;
    const validPage = Math.max(1, Math.min(maxPage, Math.round(Number(targetPage) || 1)));
    currentPage = validPage;
    pageInputVal = validPage;

    if (options.fromUser) {
      // 若是使用者在原檔抽屜中翻頁，智慧匹配該頁面所屬章節以同步下拉選單，並防止反向回彈
      const matchingSec = allSections.find(s => s.page === validPage);
      if (matchingSec) {
        lastSyncedSectionId = matchingSec.id;
        activeSectionId = matchingSec.id;
      }
    }

    if (viewerMode === 'canvas') {
      triggerPageRender(validPage);
    }
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      jumpToPage(currentPage - 1, { fromUser: true });
    }
  }

  function handleNextPage() {
    if (totalPages <= 1 || currentPage < totalPages) {
      jumpToPage(currentPage + 1, { fromUser: true });
    }
  }

  function toggleSync() {
    isSyncEnabled = !isSyncEnabled;
    if (isSyncEnabled && activeSection) {
      lastSyncedSectionId = activeSection.id;
      const targetPage = activeSection.page ?? 1;
      jumpToPage(targetPage);
    }
  }

  function handleSectionDropdownChange(secId: string) {
    lastSyncedSectionId = secId;
    activeSectionId = secId;
    dispatch('selectSection', { id: secId });
    const found = allSections.find(s => s.id === secId);
    if (found && found.page) {
      jumpToPage(found.page);
    }
  }

  function setZoom(newZoom: number) {
    zoomLevel = Math.max(0.7, Math.min(2.5, Number(newZoom.toFixed(2))));
    if (viewerMode === 'canvas') {
      triggerPageRender(currentPage);
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      loadLocalFile(target.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        loadLocalFile(file);
      } else {
        alert('請拖入標準 PDF 格式檔案 (.pdf)！');
      }
    }
  }

  function loadLocalFile(file: File) {
    if (localPdfBlobUrl) URL.revokeObjectURL(localPdfBlobUrl);
    localPdfBlobUrl = URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      localPdfArrayBuffer = e.target?.result as ArrayBuffer;
      currentPage = 1;
      pageInputVal = 1;
      currentLoadedSource = 'local_buffer_' + Date.now();
      initAndLoadPdf();
    };
    reader.readAsArrayBuffer(file);
  }

  function clearLocalPdf() {
    if (localPdfBlobUrl) {
      URL.revokeObjectURL(localPdfBlobUrl);
      localPdfBlobUrl = null;
    }
    localPdfArrayBuffer = null;
    currentPage = 1;
    pageInputVal = 1;
    currentLoadedSource = null;
  }

  function handleClose() {
    dispatch('close');
  }

  function handleSwitchToSplit() {
    dispatch('switchToSplit');
  }

  function handleOpenExternal() {
    if (activeBaseUrl) {
      window.open(activeBaseUrl, '_blank');
    }
  }

  function formatSectionOption(sec: ChapterSection): string {
    const cleanTitle = sec.title.replace(/^[0-9.]+\s*/, '').replace(/\s*\(p\.\s*\d+\)$/i, '');
    return `§ ${sec.id} ${cleanTitle} (p.${sec.page || 1})`;
  }
</script>

<aside
  class="h-full w-full flex flex-col bg-[#141617] border-r border-[#3c3836] relative select-none overflow-hidden"
  on:dragover|preventDefault={() => isDraggingOver = true}
  on:dragleave|preventDefault={() => isDraggingOver = false}
  on:drop={handleDrop}
>
  <!-- Primary Header Bar: Document Info, Engine Badge & Action Controls -->
  <header class="h-10 bg-[#1d2021] border-b border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-xs font-mono text-[#a89984] z-10 shadow-sm">
    <!-- Left: Badge, Title & String Match Indicator -->
    <div class="flex items-center gap-2 min-w-0 flex-1 mr-2">
      {#if localPdfArrayBuffer}
        <span class="font-mono text-[9px] bg-[#fe8019]/20 border border-[#fe8019]/60 text-[#fe8019] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
          <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
          本機高精畫布
        </span>
      {:else if isPdf}
        <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
          <span class="material-symbols-outlined text-[12px]">description</span>
          {viewerMode === 'canvas' ? '畫布高精對照' : '官方 PDF 原貌'}
        </span>
      {:else}
        <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
          <span class="material-symbols-outlined text-[12px]">language</span>
          原文網頁
        </span>
      {/if}

      <!-- String Matching Badge -->
      {#if isStringMatchActive}
        <span class="font-mono text-[9px] bg-[#b8bb26]/20 border border-[#b8bb26]/60 text-[#b8bb26] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 shrink-0 animate-fade-in" title="已透過 PDF 全文字串比對自動修正所有章節頁碼">
          <span class="material-symbols-outlined text-[11px]">manage_search</span>
          字串比對錨定
        </span>
      {:else if isStringIndexing}
        <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 animate-pulse">
          <span class="material-symbols-outlined text-[11px] animate-spin">sync</span>
          比對中 {stringIndexProgress}%
        </span>
      {/if}

      <span class="text-[#ebdbb2] truncate font-sans text-xs" title={paper?.title}>
        {paper?.title || '原始學術論文'}
      </span>
    </div>

    <!-- Right: Zoom, Engine Switch & Actions -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- Zoom Controls (Canvas Mode) -->
      {#if viewerMode === 'canvas' && pdfDoc}
        <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded px-1 py-0.5 gap-1 text-[11px]">
          <button
            class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
            on:click={() => setZoom(zoomLevel - 0.2)}
            title="縮小"
          >-</button>
          <span class="text-[#fabd2f] font-mono w-9 text-center text-[10px]">{Math.round(zoomLevel * 100)}%</span>
          <button
            class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
            on:click={() => setZoom(zoomLevel + 0.2)}
            title="放大"
          >+</button>
        </div>
      {/if}

      <!-- Engine Switcher Toggle -->
      <button
        class="px-1.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] rounded text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-1 transition-colors cursor-pointer"
        on:click={() => {
          viewerMode = viewerMode === 'canvas' ? 'native' : 'canvas';
          if (viewerMode === 'canvas' && pdfDoc) triggerPageRender(currentPage);
        }}
        title="切換渲染引擎（畫布高精對照 / 瀏覽器內核 Iframe）"
      >
        <span class="material-symbols-outlined text-[12px]">swap_horiz</span>
        <span class="hidden md:inline">{viewerMode === 'canvas' ? '畫布' : '內核'}</span>
      </button>

      <!-- Local PDF Upload Trigger -->
      <button
        class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] rounded text-[11px] text-[#d5c4a1] flex items-center gap-1 transition-colors cursor-pointer"
        on:click={() => fileInputRef?.click()}
        title="選取或拖入本機 PDF 檔案進行對照"
      >
        <span class="material-symbols-outlined text-[13px] text-[#fe8019]">upload_file</span>
        <span class="hidden sm:inline">換本機 PDF</span>
      </button>
      <input
        type="file"
        accept="application/pdf,.pdf"
        class="hidden"
        bind:this={fileInputRef}
        on:change={handleFileSelect}
      />

      {#if localPdfArrayBuffer || localPdfBlobUrl}
        <button
          class="px-1.5 py-1 text-[#fb4934] hover:bg-[#282828] rounded text-[10px]"
          on:click={clearLocalPdf}
          title="恢復官方預設 PDF"
        >
          還原官方
        </button>
      {/if}

      <div class="h-4 w-px bg-[#3c3836] mx-0.5"></div>

      <!-- Open in New Tab -->
      <button
        class="p-1 hover:bg-[#282828] hover:text-[#ebdbb2] rounded text-[#a89984] flex items-center transition-colors cursor-pointer"
        on:click={handleOpenExternal}
        title="在新分頁獨立開啟原檔"
      >
        <span class="material-symbols-outlined text-[15px]">open_in_new</span>
      </button>

      <!-- If Drawer Mode: Allow one-click switch to split screen -->
      {#if mode === 'drawer'}
        <button
          class="px-2 py-1 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] rounded text-[11px] flex items-center gap-1 font-semibold transition-colors cursor-pointer"
          on:click={handleSwitchToSplit}
          title="轉為左右 50/50 雙軌對照模式"
        >
          <span class="material-symbols-outlined text-[13px]">view_column</span>
          <span>轉為雙軌分屏</span>
        </button>

        <button
          class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors cursor-pointer ml-1"
          on:click={handleClose}
          title="收合抽屜 (Esc)"
        >
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- Secondary Toolbar: Bidirectional Sync & Page Navigation Controller -->
  <div class="h-9 bg-[#181a1b] border-b border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-xs font-mono text-[#a89984] z-10">
    <!-- Left: Sync Lock Toggle & Chapter Dropdown -->
    <div class="flex items-center gap-2 min-w-0 flex-1 mr-2">
      <!-- Sync Lock Toggle -->
      <button
        class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer border shrink-0 {
          isSyncEnabled
            ? 'bg-[#b8bb26]/15 border-[#b8bb26]/50 text-[#b8bb26] hover:bg-[#b8bb26]/25'
            : 'bg-[#3c3836]/40 border-[#504945] text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#3c3836]'
        }"
        on:click={toggleSync}
        title={isSyncEnabled ? '目前已開啟閱讀位置雙向聯動（點擊解鎖以自由翻閱）' : '目前為獨立瀏覽模式（點擊重新鎖定並聯動網頁進度）'}
      >
        <span class="material-symbols-outlined text-[13px]">{isSyncEnabled ? 'link' : 'link_off'}</span>
        <span class="font-bold hidden sm:inline">{isSyncEnabled ? '聯動中' : '獨立瀏覽'}</span>
      </button>

      <div class="h-3.5 w-px bg-[#3c3836]"></div>

      <!-- Chapter Dropdown -->
      {#if allSections.length > 0}
        <div class="flex items-center gap-1 min-w-0">
          <span class="text-[#a89984] text-[10px] hidden md:inline shrink-0">章節:</span>
          <select
            class="bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#ebdbb2] text-[11px] rounded px-2 py-0.5 font-sans truncate max-w-[170px] sm:max-w-[240px] cursor-pointer focus:outline-none focus:border-[#fe8019]"
            value={activeSectionId}
            on:change={(e) => handleSectionDropdownChange(e.currentTarget.value)}
            title="選取章節即時跳至對應 PDF 頁面"
          >
            {#each allSections as sec}
              <option value={sec.id}>
                {formatSectionOption(sec)}
              </option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Right: Page Stepper & Instant Jump -->
    <div class="flex items-center gap-1 shrink-0 font-mono text-[11px]">
      <button
        class="w-6 h-6 bg-[#282828] hover:bg-[#3c3836] disabled:opacity-30 border border-[#3c3836] rounded flex items-center justify-center text-[#d5c4a1] transition-colors cursor-pointer"
        on:click={handlePrevPage}
        disabled={currentPage <= 1}
        title="上一頁"
      >
        <span class="material-symbols-outlined text-[14px]">chevron_left</span>
      </button>

      <span class="text-[#a89984] text-[10px]">第</span>
      <input
        type="number"
        min="1"
        max={totalPages || 999}
        bind:value={pageInputVal}
        on:change={() => jumpToPage(pageInputVal)}
        on:keydown={(e) => e.key === 'Enter' && jumpToPage(pageInputVal)}
        class="w-10 h-6 bg-[#282828] border border-[#504945] rounded text-center text-[#fabd2f] font-bold text-xs focus:outline-none focus:border-[#fe8019]"
        title="輸入頁碼並按 Enter 跳頁"
      />
      {#if totalPages > 1}
        <span class="text-[#a89984] text-[10px]">/ {totalPages} 頁</span>
      {:else}
        <span class="text-[#a89984] text-[10px]">頁</span>
      {/if}

      <button
        class="w-6 h-6 bg-[#282828] hover:bg-[#3c3836] disabled:opacity-30 border border-[#3c3836] rounded flex items-center justify-center text-[#d5c4a1] transition-colors cursor-pointer"
        on:click={handleNextPage}
        disabled={totalPages > 1 && currentPage >= totalPages}
        title="下一頁"
      >
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
      </button>
    </div>
  </div>

  <!-- Drag-and-drop Overlay -->
  {#if isDraggingOver}
    <div class="absolute inset-0 z-30 bg-[#282828]/95 border-2 border-dashed border-[#fe8019] flex flex-col items-center justify-center gap-2 select-none animate-fade-in pointer-events-none">
      <span class="material-symbols-outlined text-4xl text-[#fe8019] animate-bounce">picture_as_pdf</span>
      <h3 class="text-base font-bold text-[#ebdbb2]">放開滑鼠以載入本機 PDF 原檔</h3>
      <p class="text-xs text-[#a89984] font-mono">100% 本機瀏覽器解析 · 支援即時字串比對錨定與秒級翻頁</p>
    </div>
  {/if}

  <!-- Main Viewer Content Container -->
  <div class="flex-1 w-full h-full bg-[#181a1b] relative overflow-auto flex justify-center items-start p-4">
    {#if viewerMode === 'canvas'}
      <!-- High-Fidelity PDF.js Canvas Renderer (Instant Page Turning & Full-text Anchoring) -->
      <div class="relative flex flex-col items-center shadow-2xl rounded bg-white">
        <canvas bind:this={canvasElement} class="block select-text max-w-full"></canvas>

        {#if isRenderingPage || isLoadingPdf}
          <div class="absolute inset-0 bg-[#141617]/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-xs font-mono text-[#fabd2f]">
            <span class="material-symbols-outlined text-2xl animate-spin text-[#fe8019]">sync</span>
            <span>{isLoadingPdf ? '載入文獻結構中...' : `繪製第 ${currentPage} 頁...`}</span>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Native Iframe Fallback -->
      {#if activeBaseUrl}
        <iframe
          src="{activeBaseUrl}#page={currentPage}&navpanes=0&toolbar=1&view=FitH"
          title="原始論文 PDF 檢視器 (瀏覽器外掛模式)"
          class="w-full h-full border-0 bg-[#282828]"
        ></iframe>
      {:else}
        <!-- Empty State -->
        <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
          <div class="w-12 h-12 rounded-full bg-[#282828] border border-[#3c3836] flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-2xl">picture_as_pdf</span>
          </div>
          <div class="flex flex-col gap-1 max-w-sm">
            <h4 class="text-sm font-bold text-[#ebdbb2]">尚未設定此文章的原檔 PDF 連結</h4>
            <p class="text-xs text-[#a89984] leading-relaxed">
              您可以直接將任何 <code class="text-[#fabd2f]">.pdf</code> 檔案拖曳至此處，享受即時字串比對與流暢翻頁。
            </p>
          </div>
          <button
            class="px-4 py-1.5 bg-[#fe8019] text-[#1d2021] font-bold text-xs rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer mt-1"
            on:click={() => fileInputRef?.click()}
          >
            <span class="material-symbols-outlined text-[15px]">upload_file</span>
            選取本機 PDF 檔案
          </button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Bottom Mini Status Bar -->
  <footer class="h-6 bg-[#141617] border-t border-[#3c3836] px-3 flex items-center justify-between text-[10px] font-mono text-[#a89984] shrink-0">
    <span class="flex items-center gap-1.5 truncate">
      <span class="h-1.5 w-1.5 rounded-full {isSyncEnabled ? 'bg-[#b8bb26] animate-pulse' : 'bg-[#fabd2f]'}"></span>
      <span class="truncate">
        章節：<strong class="text-[#ebdbb2]">{currentShowingSection ? currentShowingSection.title : '未選取'}</strong> · PDF 第 {currentPage} / {totalPages} 頁
      </span>
      {#if isStringMatchActive}
        <span class="text-[#b8bb26] ml-1">（已全文比對校準）</span>
      {/if}
    </span>
    <span class="text-[#d5c4a1] shrink-0 hidden sm:inline">
      {viewerMode === 'canvas' ? '⚡ 畫布即時渲染 (零重載翻頁)' : '🌐 瀏覽器內核模式'} · 可隨時拖放 .pdf 比對
    </span>
  </footer>
</aside>
