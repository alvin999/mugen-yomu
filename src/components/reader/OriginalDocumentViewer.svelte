<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../types/document';
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
  import { parsePdfToDocument } from '../../services/pdfParserService';
  import OriginalViewerToolbar from './original/OriginalViewerToolbar.svelte';
  import PdfCanvasRenderer from './original/PdfCanvasRenderer.svelte';
  import StructuredTextRenderer from './original/StructuredTextRenderer.svelte';
  import ImageLightboxModal from '../common/ImageLightboxModal.svelte';

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

  // Viewer Mode: 'canvas' (PDF.js 畫布) | 'text' (擬真排版) | 'native' (原生 Iframe)
  let viewerMode: 'canvas' | 'text' | 'native' = 'canvas';

  // Paper Sheet Theme: 'parchment' (米白論文紙張) | 'dark' (深邃學者模式)
  let paperTheme: 'parchment' | 'dark' = 'parchment';

  // Lightbox State for Academic Figures
  let activeLightboxImg: string | null = null;
  let activeLightboxCaption: string = '';

  function openLightbox(imgUrl: string, caption?: string) {
    if (!imgUrl) return;
    activeLightboxImg = imgUrl;
    activeLightboxCaption = caption || '學術圖表預覽';
  }

  function closeLightbox() {
    activeLightboxImg = null;
  }

  // Local File Upload & Drag-and-Drop
  let localPdfFile: File | null = null;
  let localPdfBlobUrl: string | null = null;
  let localPdfArrayBuffer: ArrayBuffer | null = null;
  let isDraggingOver: boolean = false;
  let isConvertingToPaper: boolean = false;
  let convertProgress: number = 0;

  // Pagination & Zoom
  let currentPage: number = 1;
  let totalPages: number = 1;
  let zoomLevel: number = 1.0;

  // Bidirectional Synchronization State
  let isSyncEnabled: boolean = true;
  let lastSyncedSectionId: string = '';

  // Full-Text Search & Page Alignment Indexing
  let pageTextIndex: PageTextEntry[] = [];
  let isStringIndexing: boolean = false;
  let stringIndexProgress: number = 0;
  let matchResults: Record<string, MatchResult> = {};
  let isStringMatchActive: boolean = false;

  $: allSections = sections && sections.length > 0 ? flattenSections(sections) : flattenSections(paper?.sections || []);

  $: activeSection = allSections.find(s => s.id === activeSectionId) || null;

  $: isPdf = Boolean(
    localPdfArrayBuffer ||
    (paper?.pdfUrl && paper.pdfUrl.trim().length > 0) ||
    (paper?.arxivId && paper.arxivId.trim().length > 0)
  );

  $: activeBaseUrl = (() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (paper?.pdfUrl) return paper.pdfUrl;
    if (paper?.arxivId) return `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
    if (paper?.sourceUrl) return paper.sourceUrl;
    return '';
  })();

  // 監聽外部傳入的焦點章節變更，自動對齊 PDF 頁面
  $: if (isSyncEnabled && activeSectionId && activeSectionId !== lastSyncedSectionId) {
    syncWithActiveSection(activeSectionId);
  }

  function syncWithActiveSection(secId: string) {
    lastSyncedSectionId = secId;
    const targetSec = allSections.find(s => s.id === secId);
    if (!targetSec) return;

    if (isStringMatchActive && matchResults[secId]) {
      const match = matchResults[secId];
      if (match.matchedPage && match.matchedPage !== currentPage) {
        jumpToPage(match.matchedPage);
        return;
      }
    }

    if (targetSec.page && targetSec.page !== currentPage) {
      jumpToPage(targetSec.page);
    }
  }

  $: if (activeBaseUrl && activeBaseUrl !== currentLoadedSource) {
    currentLoadedSource = activeBaseUrl;
    initAndLoadPdf();
  }

  $: if (!isPdf && viewerMode === 'canvas') {
    viewerMode = 'text';
  }

  onMount(() => {
    if (isPdf) {
      initAndLoadPdf();
    }
  });

  onDestroy(() => {
    if (localPdfBlobUrl) {
      URL.revokeObjectURL(localPdfBlobUrl);
    }
  });

  async function initAndLoadPdf() {
    if (!isPdf) return;
    isLoadingPdf = true;
    renderError = null;

    try {
      if (localPdfArrayBuffer) {
        pdfDoc = await loadPdf(localPdfArrayBuffer);
      } else if (paper?.arxivId) {
        const arxivUrl = `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
        pdfDoc = await loadPdf(arxivUrl);
      } else if (paper?.pdfUrl) {
        pdfDoc = await loadPdf(paper.pdfUrl);
      }

      if (pdfDoc) {
        totalPages = pdfDoc.numPages;
        viewerMode = 'canvas';

        await tick();
        await triggerPageRender(currentPage);

        runStringMatchingPipeline();
      }
    } catch (err: any) {
      console.warn('PDF.js 載入失敗，降級至擬真排版模式:', err);
      renderError = err?.message || 'PDF 載入失敗';
      viewerMode = 'text';
    } finally {
      isLoadingPdf = false;
    }
  }

  function handleRetry() {
    currentLoadedSource = null;
    renderError = null;
    isLoadingPdf = true;
    viewerMode = 'canvas';
    initAndLoadPdf();
  }

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
        const resultMap: Record<string, MatchResult> = {};
        for (const r of res) {
          resultMap[r.sectionId] = r;
        }
        matchResults = resultMap;
        isStringMatchActive = true;

        dispatch('sectionsAligned', { sections: updatedSections });

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

  async function triggerPageRender(pageToRender: number) {
    if (!pdfDoc || viewerMode !== 'canvas') return;
    if (!canvasElement) {
      await tick();
      if (!canvasElement) return;
    }
    isRenderingPage = true;

    try {
      const maxPage = totalPages > 0 ? totalPages : 1;
      const validPage = Math.max(1, Math.min(maxPage, pageToRender));
      await renderPageToCanvas(pdfDoc, validPage, canvasElement, zoomLevel);
    } catch (err: any) {
      console.warn('Canvas 繪圖異常:', err);
      renderError = `Canvas 繪圖異常: ${err?.message || err}`;
    } finally {
      isRenderingPage = false;
    }
  }

  function jumpToPage(targetPage: number, options: { fromUser?: boolean } = {}) {
    const maxPage = totalPages > 1 ? totalPages : 999;
    const validPage = Math.max(1, Math.min(maxPage, Math.round(Number(targetPage) || 1)));
    currentPage = validPage;

    if (options.fromUser) {
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

  function handleSectionSelect(secId: string) {
    lastSyncedSectionId = secId;
    activeSectionId = secId;
    dispatch('selectSection', { id: secId });
    const found = allSections.find(s => s.id === secId);
    if (found && found.page && viewerMode === 'canvas') {
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
    localPdfFile = file;
    if (localPdfBlobUrl) URL.revokeObjectURL(localPdfBlobUrl);
    localPdfBlobUrl = URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      localPdfArrayBuffer = e.target?.result as ArrayBuffer;
      currentPage = 1;
      currentLoadedSource = 'local_buffer_' + Date.now();
      initAndLoadPdf();
    };
    reader.readAsArrayBuffer(file);
  }

  function clearLocalPdf() {
    localPdfFile = null;
    if (localPdfBlobUrl) {
      URL.revokeObjectURL(localPdfBlobUrl);
      localPdfBlobUrl = null;
    }
    localPdfArrayBuffer = null;
    currentPage = 1;
    currentLoadedSource = null;
  }

  async function handleConvertToPaper() {
    if (!localPdfFile && !localPdfArrayBuffer) return;
    isConvertingToPaper = true;
    convertProgress = 0;

    try {
      const source = localPdfFile || localPdfArrayBuffer!;
      const name = localPdfFile ? localPdfFile.name : (paper?.title || '本機文獻');
      const doc = await parsePdfToDocument(source, name, (pct) => {
        convertProgress = pct;
      });

      if (localPdfBlobUrl && !doc.pdfUrl) {
        doc.pdfUrl = localPdfBlobUrl;
      }

      dispatch('importPaper', { paper: doc });
    } catch (err: any) {
      alert(`解析本機 PDF 失敗：${err?.message || err}`);
    } finally {
      isConvertingToPaper = false;
    }
  }

  function handleOpenExternal() {
    if (activeBaseUrl) {
      window.open(activeBaseUrl, '_blank');
    }
  }
</script>

<aside
  class="h-full w-full flex flex-col bg-[#141617] border-r border-[#3c3836] relative select-none overflow-hidden"
  on:dragover|preventDefault={() => isDraggingOver = true}
  on:dragleave|preventDefault={() => isDraggingOver = false}
  on:drop={handleDrop}
>
  <!-- Top Primary & Secondary Toolbar -->
  <OriginalViewerToolbar
    {paper}
    {viewerMode}
    {isPdf}
    {pdfDoc}
    {currentPage}
    {totalPages}
    {zoomLevel}
    {isSyncEnabled}
    {isStringMatchActive}
    {isStringIndexing}
    {stringIndexProgress}
    {isConvertingToPaper}
    {convertProgress}
    {isLoadingPdf}
    {localPdfArrayBuffer}
    {localPdfBlobUrl}
    {allSections}
    {activeSectionId}
    {mode}
    on:setZoom={(e) => setZoom(e.detail.zoom)}
    on:setViewerMode={(e) => {
      viewerMode = e.detail.mode;
      if (viewerMode === 'canvas') {
        if (pdfDoc) triggerPageRender(currentPage);
        else handleRetry();
      }
    }}
    on:retry={handleRetry}
    on:openExternal={handleOpenExternal}
    on:switchToSplit={() => dispatch('switchToSplit')}
    on:close={() => dispatch('close')}
    on:toggleSync={toggleSync}
    on:selectSection={(e) => handleSectionSelect(e.detail.sectionId)}
    on:prevPage={handlePrevPage}
    on:nextPage={handleNextPage}
    on:inputPage={(e) => jumpToPage(e.detail.page, { fromUser: true })}
    on:convertToPaper={handleConvertToPaper}
    on:fileSelect={(e) => handleFileSelect(e.detail.event)}
    on:clearLocalPdf={clearLocalPdf}
  />

  <!-- Drag-and-Drop Overlay Indicator -->
  {#if isDraggingOver}
    <div class="absolute inset-0 z-50 bg-[#1d2021]/90 border-2 border-dashed border-[#fe8019] flex flex-col items-center justify-center gap-2 text-[#fabd2f] backdrop-blur-sm pointer-events-none">
      <span class="material-symbols-outlined text-4xl animate-bounce text-[#fe8019]">upload_file</span>
      <span class="font-mono text-sm font-bold">放開滑鼠以在此開啟本機 PDF 原檔</span>
      <span class="text-xs text-[#a89984]">零資料上傳 · 100% 瀏覽器本機安全渲染</span>
    </div>
  {/if}

  <!-- Viewports Area -->
  <div class="flex-1 w-full overflow-hidden relative bg-[#141617]">
    {#if viewerMode === 'canvas'}
      <PdfCanvasRenderer
        {pdfDoc}
        {currentPage}
        {isLoadingPdf}
        {isRenderingPage}
        {renderError}
        bind:canvasElement
        on:switchToText={() => viewerMode = 'text'}
        on:retry={handleRetry}
        on:openExternal={handleOpenExternal}
        on:canvasReady={() => {
          if (pdfDoc && !isRenderingPage) {
            triggerPageRender(currentPage);
          }
        }}
      />
    {:else if viewerMode === 'text'}
      <StructuredTextRenderer
        {paper}
        {allSections}
        {activeSectionId}
        {mode}
        {isPdf}
        bind:paperTheme
        on:sectionClick={(e) => handleSectionSelect(e.detail.sectionId)}
        on:openLightbox={(e) => openLightbox(e.detail.url, e.detail.caption)}
        on:retryPdf={handleRetry}
      />
    {:else if viewerMode === 'native'}
      {#if activeBaseUrl}
        <iframe
          src={activeBaseUrl}
          title="原生學術文件檢視器"
          class="w-full h-full border-0 bg-white"
        ></iframe>
      {:else}
        <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
          <span class="material-symbols-outlined text-4xl text-[#a89984]">language</span>
          <span class="text-xs text-[#a89984] font-mono">未指定有效原生網頁或 PDF 來源網址</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Bottom Synchronized Status Bar -->
  <footer class="h-6 bg-[#1d2021] border-t border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-[10px] font-mono text-[#a89984]">
    <div class="flex items-center gap-2 truncate">
      <span class="flex items-center gap-1 {isSyncEnabled ? 'text-[#b8bb26]' : 'text-[#a89984]'}">
        <span class="w-1.5 h-1.5 rounded-full {isSyncEnabled ? 'bg-[#b8bb26] animate-pulse' : 'bg-[#a89984]'}"></span>
        <span>{isSyncEnabled ? '已連線閱讀器' : '獨立瀏覽中'}</span>
      </span>
      <span>·</span>
      <span class="text-[#ebdbb2] truncate max-w-[200px]" title={activeSection?.title || '未選定章節'}>
        {activeSection ? `§ ${activeSection.id} ${activeSection.title}` : '文獻初始狀態'}
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if isStringMatchActive}
        <span class="text-[#8ec07c]">精確頁碼校正</span>
      {/if}
      <span class="text-[#fabd2f]">
        {viewerMode === 'canvas' ? '畫布視圖' : (viewerMode === 'text' ? '擬真排版' : '原生網頁')}
      </span>
    </div>
  </footer>
</aside>

<!-- Fullscreen High-Resolution Image Lightbox Modal (共用燈箱元件) -->
<ImageLightboxModal
  isOpen={Boolean(activeLightboxImg)}
  imageUrl={activeLightboxImg || ''}
  caption={activeLightboxCaption}
  on:close={closeLightbox}
/>
