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
  import { pdfViewerStore } from '../../stores/pdfViewerStore';
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
  let renderedPage: number = 0;

  // 訂閱全域集中 PDF 閱讀狀態與本機 PDF 資源
  $: localPdfFile = $pdfViewerStore.localPdfFile;
  $: localPdfBlobUrl = $pdfViewerStore.localPdfBlobUrl;
  $: localPdfArrayBuffer = $pdfViewerStore.localPdfArrayBuffer;
  $: currentPage = $pdfViewerStore.currentPage;
  $: totalPages = $pdfViewerStore.totalPages;
  $: zoomLevel = $pdfViewerStore.zoomLevel;
  $: viewerMode = $pdfViewerStore.viewerMode;
  $: paperTheme = $pdfViewerStore.paperTheme;
  $: isSyncEnabled = $pdfViewerStore.isSyncEnabled;
  $: matchResults = $pdfViewerStore.matchResults;
  $: pageTextIndex = $pdfViewerStore.pageTextIndex;
  $: isStringMatchActive = $pdfViewerStore.isStringMatchActive;
  $: isStringIndexing = $pdfViewerStore.isStringIndexing;
  $: stringIndexProgress = $pdfViewerStore.stringIndexProgress;

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

  // Local Drag-and-Drop & Convert State
  let isDraggingOver: boolean = false;
  let isConvertingToPaper: boolean = false;
  let convertProgress: number = 0;

  let lastSyncedSectionId: string = '';

  $: allSections = sections && sections.length > 0 ? flattenSections(sections) : flattenSections(paper?.sections || []);
  $: activeSection = allSections.find(s => s.id === activeSectionId) || null;

  $: isPdf = Boolean(
    localPdfArrayBuffer ||
    (paper?.type !== 'web' && (
      (paper?.pdfUrl && paper.pdfUrl.trim().length > 0) ||
      (paper?.arxivId && paper.arxivId.trim().length > 0)
    ))
  );

  $: activeBaseUrl = (() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (paper?.type !== 'web' && paper?.pdfUrl) return paper.pdfUrl;
    if (paper?.type !== 'web' && paper?.arxivId) return `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
    if (paper?.sourceUrl) return paper.sourceUrl;
    return '';
  })();

  // 監聽 Paper 變動，更新 Store 當前 Paper ID 並維護網頁模式安全預設
  $: if (paper) {
    if (paper.id) {
      pdfViewerStore.setActivePaperId(paper.id);
    }
    if (paper.type === 'web' || !isPdf) {
      if (viewerMode === 'canvas') {
        pdfViewerStore.setViewerMode('text');
      }
    }
  }

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

  $: if (isPdf && activeBaseUrl && activeBaseUrl !== currentLoadedSource) {
    currentLoadedSource = activeBaseUrl;
    initAndLoadPdf();
  }

  $: if (!isPdf && viewerMode === 'canvas') {
    pdfViewerStore.setViewerMode('text');
  }

  // 當 Store 中的頁碼在其他地方改變 (例如抽屜或雙軌對照另一端切換)，自動觸發畫布渲染
  $: if (isPdf && pdfDoc && viewerMode === 'canvas' && currentPage !== renderedPage && !isRenderingPage) {
    triggerPageRender(currentPage);
  }

  onMount(() => {
    if (isPdf) {
      initAndLoadPdf();
    }
  });

  onDestroy(() => {
    // 資源由全域 store 管理，組件卸載時無需 revoke Blob URL
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
        pdfViewerStore.setTotalPages(pdfDoc.numPages);
        pdfViewerStore.setViewerMode('canvas');

        await tick();
        await triggerPageRender(currentPage);

        if (!isStringMatchActive && !isStringIndexing) {
          runStringMatchingPipeline();
        }
      }
    } catch (err: any) {
      console.warn('PDF.js 載入失敗，降級至擬真排版模式:', err);
      renderError = err?.message || 'PDF 載入失敗';
      pdfViewerStore.setViewerMode('text');
    } finally {
      isLoadingPdf = false;
    }
  }

  function handleRetry() {
    currentLoadedSource = null;
    renderError = null;
    isLoadingPdf = true;
    pdfViewerStore.setViewerMode('canvas');
    initAndLoadPdf();
  }

  async function runStringMatchingPipeline() {
    if (!pdfDoc || isStringIndexing) return;
    pdfViewerStore.setStringIndexingState(true, 0);

    try {
      const textIndex = await buildPdfTextIndex(pdfDoc, (progress) => {
        pdfViewerStore.setStringIndexingState(true, progress);
      });

      if (allSections && allSections.length > 0 && textIndex.length > 0) {
        const { updatedSections, matchResults: res } = alignAllSectionsWithPdf(allSections, textIndex);
        const resultMap: Record<string, MatchResult> = {};
        for (const r of res) {
          resultMap[r.sectionId] = r;
        }

        pdfViewerStore.setMatchResults(resultMap, textIndex);
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
      pdfViewerStore.setStringIndexingState(false, 100);
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
      renderedPage = validPage;
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
    
    // 更新集中 Store 中的進度，自動保存至 LocalStorage
    pdfViewerStore.setCurrentPage(validPage, paper?.id);

    if (options.fromUser) {
      // 1. 若有全文精準比對結果，優先反查對應章節
      let matchingSec: ChapterSection | undefined = undefined;
      if (isStringMatchActive && matchResults) {
        for (const [secId, res] of Object.entries(matchResults)) {
          if (res.matchedPage === validPage) {
            matchingSec = allSections.find(s => s.id === secId);
            if (matchingSec) break;
          }
        }
      }

      // 2. 若無比對結果，尋找定義頁碼為該頁的章節
      if (!matchingSec) {
        matchingSec = allSections.find(s => s.page === validPage);
      }

      // 3. 若仍無，尋找在該頁之前的最接近章節（小於等於該頁且頁碼最大者）
      if (!matchingSec) {
        const candidates = allSections.filter(s => s.page && s.page <= validPage);
        if (candidates.length > 0) {
          candidates.sort((a, b) => (b.page || 0) - (a.page || 0));
          matchingSec = candidates[0];
        }
      }

      if (matchingSec) {
        lastSyncedSectionId = matchingSec.id;
        activeSectionId = matchingSec.id;
        // 使用者主動翻頁時，向外廣播章節選定事件，讓 MugenReader 滾動對齊
        if (isSyncEnabled) {
          dispatch('selectSection', { id: matchingSec.id, sectionId: matchingSec.id, source: 'pdf' });
        }
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
    const nextSync = !isSyncEnabled;
    pdfViewerStore.setSyncEnabled(nextSync);
    if (nextSync && activeSection) {
      lastSyncedSectionId = activeSection.id;
      const targetPage = activeSection.page ?? 1;
      jumpToPage(targetPage);
    }
  }

  function handleSectionSelect(secId: string) {
    lastSyncedSectionId = secId;
    activeSectionId = secId;
    dispatch('selectSection', { id: secId, sectionId: secId });
    const found = allSections.find(s => s.id === secId);
    if (found && found.page && viewerMode === 'canvas') {
      jumpToPage(found.page);
    }
  }

  function setZoom(newZoom: number) {
    pdfViewerStore.setZoomLevel(newZoom);
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

  async function loadLocalFile(file: File) {
    await pdfViewerStore.loadLocalPdf(file);
    currentLoadedSource = 'local_buffer_' + Date.now();
    await initAndLoadPdf();
  }

  function clearLocalPdf() {
    pdfViewerStore.clearLocalPdf();
    currentLoadedSource = null;
    initAndLoadPdf();
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
  function handleWebSectionScroll(secId: string) {
    if (!secId || secId === activeSectionId) return;
    lastSyncedSectionId = secId;
    activeSectionId = secId;
    if (isSyncEnabled) {
      dispatch('selectSection', { id: secId, sectionId: secId, source: 'web' });
    }
  }

  $: nativeIframeSrc = (() => {
    if (!activeBaseUrl) return '';
    return activeBaseUrl;
  })();
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
      pdfViewerStore.setViewerMode(e.detail.mode);
      if (e.detail.mode === 'canvas') {
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
    {#if isPdf && viewerMode === 'canvas'}
      <PdfCanvasRenderer
        {pdfDoc}
        {currentPage}
        {isLoadingPdf}
        {isRenderingPage}
        {renderError}
        bind:canvasElement
        on:switchToText={() => pdfViewerStore.setViewerMode('text')}
        on:retry={handleRetry}
        on:openExternal={handleOpenExternal}
        on:canvasReady={() => {
          if (pdfDoc && !isRenderingPage) {
            triggerPageRender(currentPage);
          }
        }}
      />
    {:else if viewerMode === 'native'}
      {#if activeBaseUrl}
        <div class="w-full h-full flex flex-col">
          <div class="bg-[#181a1b] border-b border-[#3c3836] px-3 py-1 flex items-center justify-between text-[11px] font-mono text-[#a89984] shrink-0">
            <span class="flex items-center gap-1.5 text-[#fabd2f]">
              <span class="material-symbols-outlined text-[13px]">info</span>
              <span>受瀏覽器同源安全性限制，原站無法跨域同步滾動</span>
            </span>
            <button
              type="button"
              class="text-[#8ec07c] hover:text-[#b8bb26] hover:underline cursor-pointer flex items-center gap-0.5 text-[11px]"
              on:click={() => pdfViewerStore.setViewerMode('text')}
              title="切換至擬真排版模式"
            >
              <span>切換至排版模式（支援雙向進度同步與主題）</span>
              <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
            </button>
          </div>
          <iframe
            src={nativeIframeSrc}
            title="原生學術文件檢視器"
            class="w-full flex-1 border-0 bg-white"
          ></iframe>
        </div>
      {:else}
        <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
          <span class="material-symbols-outlined text-4xl text-[#a89984]">language</span>
          <span class="text-xs text-[#a89984] font-mono">未指定有效原生網頁或 PDF 來源網址</span>
        </div>
      {/if}
    {:else}
      <StructuredTextRenderer
        {paper}
        {allSections}
        {activeSectionId}
        {mode}
        {isPdf}
        bind:paperTheme
        on:sectionClick={(e) => handleSectionSelect(e.detail.sectionId)}
        on:sectionScroll={(e) => handleWebSectionScroll(e.detail.sectionId)}
        on:openLightbox={(e) => openLightbox(e.detail.url, e.detail.caption)}
        on:retryPdf={handleRetry}
      />
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
