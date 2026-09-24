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
  import { getLocalPdfBinary } from '../../services/pdfStorageService';
  import OriginalViewerToolbar from './original/OriginalViewerToolbar.svelte';
  import PdfCanvasRenderer from './original/PdfCanvasRenderer.svelte';
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
  let currentLoadedPaperId: string | null = null;
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
      (paper?.arxivId && paper.arxivId.trim().length > 0) ||
      (paper?.id && paper.id.startsWith('local_pdf_'))
    ))
  );

  $: activeBaseUrl = (() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (paper?.id && paper.id.startsWith('local_pdf_')) return `indexeddb://${paper.id}`;
    if (paper?.type !== 'web' && paper?.pdfUrl) return paper.pdfUrl;
    if (paper?.type !== 'web' && paper?.arxivId) return `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
    if (paper?.sourceUrl) return paper.sourceUrl;
    return '';
  })();

  $: isWeb = !isPdf && Boolean(paper?.type === 'web' || paper?.sourceUrl || (activeBaseUrl && !activeBaseUrl.startsWith('indexeddb:')));
  $: webUrl = paper?.sourceUrl || (paper?.type === 'web' ? activeBaseUrl : '');

  // 監聽 Paper 變動，更新 Store 當前 Paper ID
  $: if (paper && paper.id) {
    pdfViewerStore.setActivePaperId(paper.id);
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

  $: if (isPdf && paper && paper.id && paper.id !== currentLoadedPaperId) {
    currentLoadedPaperId = paper.id;
    initAndLoadPdf();
  }

  // 當 Store 中的頁碼在其他地方改變或 canvas 掛載就緒，自動觸發畫布渲染
  $: if (isPdf && pdfDoc && canvasElement && viewerMode === 'canvas' && currentPage !== renderedPage && !isRenderingPage) {
    triggerPageRender(currentPage);
  }

  onDestroy(() => {
    // 資源由全域 store 管理，組件卸載時無需 revoke Blob URL
  });

  async function initAndLoadPdf() {
    if (!isPdf || isLoadingPdf) return;
    isLoadingPdf = true;
    renderError = null;

    try {
      if (localPdfArrayBuffer) {
        pdfDoc = await loadPdf(localPdfArrayBuffer.slice(0));
      } else if (paper?.id) {
        // 嘗試從 IndexedDB 取回本機快取的 PDF 二進制資料 (解決重新整理後遺失的問題)
        const cachedBuffer = await getLocalPdfBinary(paper.id);
        if (cachedBuffer) {
          pdfViewerStore.loadLocalPdfBuffer(cachedBuffer, paper.title, paper.id);
          pdfDoc = await loadPdf(cachedBuffer.slice(0));
        } else if (paper?.arxivId) {
          const arxivUrl = `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
          pdfDoc = await loadPdf(arxivUrl);
        } else if (paper?.pdfUrl && !paper.pdfUrl.startsWith('blob:')) {
          pdfDoc = await loadPdf(paper.pdfUrl);
        }
      } else if (paper?.arxivId) {
        const arxivUrl = `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
        pdfDoc = await loadPdf(arxivUrl);
      } else if (paper?.pdfUrl && !paper.pdfUrl.startsWith('blob:')) {
        pdfDoc = await loadPdf(paper.pdfUrl);
      }

      if (pdfDoc) {
        pdfViewerStore.setTotalPages(pdfDoc.numPages);
        pdfViewerStore.setViewerMode('canvas');

        // 先結束 PDF 載入狀態，促使 Svelte 將 <canvas> 節點掛載入 DOM
        isLoadingPdf = false;
        await tick();
        await triggerPageRender(currentPage);

        if (!isStringMatchActive && !isStringIndexing) {
          runStringMatchingPipeline();
        }
      }
    } catch (err: any) {
      console.warn('PDF.js 載入失敗:', err);
      renderError = err?.message || 'PDF 載入失敗';
    } finally {
      isLoadingPdf = false;
    }
  }

  function handleRetry() {
    currentLoadedPaperId = null;
    renderError = null;
    isLoadingPdf = false;
    isRenderingPage = false;
    renderedPage = 0;
    initAndLoadPdf();
  }

  async function runStringMatchingPipeline() {
    if (!pdfDoc || isStringIndexing) return;

    // 若所有章節已經具備 page 頁碼（本機解析引擎或 arXiv 預設已有），或總頁數 > 15 頁（如 xv6 110 頁）
    // 略過耗時耗 CPU 的二次全文比對，直接以現有頁碼秒級連動
    const hasDefinedPages = allSections && allSections.length > 0 && allSections.filter(s => Boolean(s.page)).length >= allSections.length * 0.7;
    if (hasDefinedPages || (pdfDoc && pdfDoc.numPages > 15)) {
      return;
    }

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
    if (!pdfDoc || viewerMode !== 'canvas' || isRenderingPage) return;
    if (!canvasElement) {
      await tick();
      if (!canvasElement) {
        await new Promise(r => setTimeout(r, 60));
        if (!canvasElement) return;
      }
    }
    isRenderingPage = true;

    try {
      const maxPage = totalPages > 0 ? totalPages : 1;
      const validPage = Math.max(1, Math.min(maxPage, pageToRender));
      await renderPageToCanvas(pdfDoc, validPage, canvasElement, zoomLevel);
      renderedPage = validPage;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('Canvas 繪圖異常:', err);
        renderError = `Canvas 繪圖異常: ${err?.message || err}`;
      }
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
    currentLoadedPaperId = 'local_file_' + Date.now();
    await initAndLoadPdf();
  }

  function clearLocalPdf() {
    pdfViewerStore.clearLocalPdf();
    currentLoadedPaperId = null;
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

  <!-- Viewports Area: Pure JavaScript Single-Page PDF Canvas or Original Webpage View -->
  <div class="flex-1 w-full overflow-hidden relative bg-[#141617]">
    {#if isPdf}
      <PdfCanvasRenderer
        {pdfDoc}
        {currentPage}
        {isLoadingPdf}
        {isRenderingPage}
        {renderError}
        bind:canvasElement
        on:retry={handleRetry}
        on:openExternal={handleOpenExternal}
      />
    {:else if isWeb && webUrl}
      <div class="w-full h-full flex flex-col relative bg-[#141617]">
        <!-- 網頁獨立瀏覽與無法連動提醒橫幅 -->
        <div class="px-3 py-1.5 bg-[#282828] border-b border-[#3c3836] flex items-center justify-between text-xs font-mono shrink-0">
          <div class="flex items-center gap-2 truncate">
            <span class="material-symbols-outlined text-[16px] text-[#fe8019] shrink-0">info</span>
            <span class="text-[#fabd2f] font-semibold">原始網頁對照</span>
            <span class="text-[#a89984] text-[11px] truncate hidden sm:inline">受瀏覽器同源安全限制，無法與右側章節連動</span>
          </div>
          <button
            class="px-2 py-0.5 bg-[#32302f] hover:bg-[#3c3836] text-[#8ec07c] hover:text-[#b8bb26] border border-[#3c3836] rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors shrink-0 ml-2"
            on:click={handleOpenExternal}
            title="在獨立分頁中開啟原始網頁"
          >
            <span class="material-symbols-outlined text-[13px]">open_in_new</span>
            <span>另開新分頁</span>
          </button>
        </div>

        <!-- 嵌入原生網頁 iframe -->
        <div class="flex-1 w-full relative bg-white">
          <iframe
            src={webUrl}
            title={paper?.title || '原始網頁'}
            class="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          ></iframe>
        </div>
      </div>
    {:else}
      <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
        <span class="material-symbols-outlined text-4xl text-[#a89984]">picture_as_pdf</span>
        <span class="text-xs text-[#a89984] font-mono">請選取或拖入 PDF 文獻以開啟原版對照</span>
      </div>
    {/if}
  </div>

  <!-- Bottom Synchronized Status Bar -->
  <footer class="h-6 bg-[#1d2021] border-t border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-[10px] font-mono text-[#a89984]">
    <div class="flex items-center gap-2 truncate">
      <span class="flex items-center gap-1 {isPdf && isSyncEnabled ? 'text-[#b8bb26]' : 'text-[#a89984]'}">
        <span class="w-1.5 h-1.5 rounded-full {isPdf && isSyncEnabled ? 'bg-[#b8bb26] animate-pulse' : 'bg-[#a89984]'}"></span>
        <span>{isPdf ? (isSyncEnabled ? '已連線閱讀器' : '獨立瀏覽中') : '網頁獨立瀏覽 (無法連動)'}</span>
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
        {isPdf ? (viewerMode === 'canvas' ? '畫布視圖' : '擬真排版') : '原生網頁'}
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
