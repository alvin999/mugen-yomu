<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { PaperDocument, ChapterSection } from '../../types/document';
  import { flattenSections } from '../../stores/readingStore';
  import {
    loadPdf,
    renderPageToCanvas,
    buildPdfTextIndex,
    alignAllSectionsWithPdf,
    type MatchResult
  } from '../../services/pdfService';
  import type * as pdfjsLib from 'pdfjs-dist';
  import { parsePdfToDocument } from '../../services/pdfParserService';
  import { pdfViewerStore } from '../../stores/pdfViewerStore';
  import { getLocalPdfBinary } from '../../services/pdfStorageService';
  import OriginalViewerToolbar from './original/OriginalViewerToolbar.svelte';
  import PdfCanvasRenderer from './original/PdfCanvasRenderer.svelte';
  import ImageLightboxModal from '../common/ImageLightboxModal.svelte';
  import { t } from '../../stores/localeStore';

  interface Props {
    paper?: PaperDocument | null;
    mode?: 'split' | 'drawer';
    activeSectionId?: string;
    sections?: ChapterSection[];
    onsectionsAligned?: (detail: { sections: ChapterSection[] }) => void;
    onselectSection?: (detail: { id: string; sectionId: string; source?: string }) => void;
    onimportPaper?: (detail: { paper: PaperDocument }) => void;
    onswitchToSplit?: () => void;
    onclose?: () => void;
  }

  let {
    paper = null,
    mode = 'split',
    activeSectionId = '',
    sections = [],
    onsectionsAligned,
    onselectSection,
    onimportPaper,
    onswitchToSplit,
    onclose
  }: Props = $props();

  // PDF Document & Canvas State
  let pdfDoc = $state<pdfjsLib.PDFDocumentProxy | null>(null);
  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let isLoadingPdf = $state<boolean>(false);
  let isRenderingPage = $state<boolean>(false);
  let renderError = $state<string | null>(null);
  let currentLoadedPaperId = $state<string | null>(null);
  let renderedPage = $state<number>(0);

  // 訂閱全域集中 PDF 閱讀狀態與本機 PDF 資源
  let localPdfFile = $derived($pdfViewerStore.localPdfFile);
  let localPdfBlobUrl = $derived($pdfViewerStore.localPdfBlobUrl);
  let localPdfArrayBuffer = $derived($pdfViewerStore.localPdfArrayBuffer);
  let currentPage = $derived($pdfViewerStore.currentPage);
  let totalPages = $derived($pdfViewerStore.totalPages);
  let zoomLevel = $derived($pdfViewerStore.zoomLevel);
  let viewerMode = $derived($pdfViewerStore.viewerMode);
  let paperTheme = $derived($pdfViewerStore.paperTheme);
  let isSyncEnabled = $derived($pdfViewerStore.isSyncEnabled);
  let matchResults = $derived($pdfViewerStore.matchResults);
  let pageTextIndex = $derived($pdfViewerStore.pageTextIndex);
  let isStringMatchActive = $derived($pdfViewerStore.isStringMatchActive);
  let isStringIndexing = $derived($pdfViewerStore.isStringIndexing);
  let stringIndexProgress = $derived($pdfViewerStore.stringIndexProgress);

  // Lightbox State for Academic Figures
  let activeLightboxImg = $state<string | null>(null);
  let activeLightboxCaption = $state<string>('');

  function openLightbox(imgUrl: string, caption?: string) {
    if (!imgUrl) return;
    activeLightboxImg = imgUrl;
    activeLightboxCaption = caption || $t('reader.lightboxCaption');
  }

  function closeLightbox() {
    activeLightboxImg = null;
  }

  // Local Drag-and-Drop & Convert State
  let isDraggingOver = $state<boolean>(false);
  let isConvertingToPaper = $state<boolean>(false);
  let convertProgress = $state<number>(0);

  let lastSyncedSectionId = $state<string>('');

  let allSections = $derived(sections && sections.length > 0 ? flattenSections(sections) : flattenSections(paper?.sections || []));
  let activeSection = $derived(allSections.find(s => s.id === activeSectionId) || null);

  let isPdf = $derived(Boolean(
    localPdfArrayBuffer ||
    (paper?.type !== 'web' && (
      (paper?.pdfUrl && paper.pdfUrl.trim().length > 0) ||
      (paper?.arxivId && paper.arxivId.trim().length > 0) ||
      (paper?.id && paper.id.startsWith('local_pdf_'))
    ))
  ));

  let activeBaseUrl = $derived((() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (paper?.id && paper.id.startsWith('local_pdf_')) return `indexeddb://${paper.id}`;
    if (paper?.type !== 'web' && paper?.pdfUrl) return paper.pdfUrl;
    if (paper?.type !== 'web' && paper?.arxivId) return `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
    if (paper?.sourceUrl) return paper.sourceUrl;
    return '';
  })());

  let isWeb = $derived(!isPdf && Boolean(paper?.type === 'web' || paper?.sourceUrl || (activeBaseUrl && !activeBaseUrl.startsWith('indexeddb:'))));
  let webUrl = $derived(paper?.sourceUrl || (paper?.type === 'web' ? activeBaseUrl : ''));

  // 監聽 Paper 變動，更新 Store 當前 Paper ID
  $effect(() => {
    if (paper && paper.id) {
      pdfViewerStore.setActivePaperId(paper.id);
    }
  });

  // 監聽外部傳入的焦點章節變更，自動對齊 PDF 頁面
  $effect(() => {
    if (isSyncEnabled && activeSectionId && activeSectionId !== lastSyncedSectionId) {
      syncWithActiveSection(activeSectionId);
    }
  });

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

  $effect(() => {
    if (isPdf && paper && paper.id && paper.id !== currentLoadedPaperId) {
      currentLoadedPaperId = paper.id;
      initAndLoadPdf();
    }
  });

  // 當 Store 中的頁碼在其他地方改變或 canvas 掛載就緒，自動觸發畫布渲染
  $effect(() => {
    if (isPdf && pdfDoc && canvasElement && viewerMode === 'canvas' && currentPage !== renderedPage && !isRenderingPage) {
      triggerPageRender(currentPage);
    }
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
      renderError = err?.message || get(t)('viewer.pdfLoadFailed');
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
        onsectionsAligned?.({ sections: updatedSections });

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
        renderError = get(t)('viewer.canvasRenderError', { error: err?.message || err });
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
          onselectSection?.({ id: matchingSec.id, sectionId: matchingSec.id, source: 'pdf' });
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
    onselectSection?.({ id: secId, sectionId: secId });
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
        alert($t('reader.original.dropPdfAlert'));
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
      const name = localPdfFile ? localPdfFile.name : (paper?.title || $t('reader.original.localDoc'));
      const doc = await parsePdfToDocument(source, name, (pct) => {
        convertProgress = pct;
      });

      if (localPdfBlobUrl && !doc.pdfUrl) {
        doc.pdfUrl = localPdfBlobUrl;
      }

      onimportPaper?.({ paper: doc });
    } catch (err: any) {
      alert($t('reader.original.parseLocalPdfFail', { msg: err?.message || err }));
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
  ondragover={(e) => { e.preventDefault(); isDraggingOver = true; }}
  ondragleave={(e) => { e.preventDefault(); isDraggingOver = false; }}
  ondrop={handleDrop}
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
    onsetZoom={(data) => setZoom(data.zoom)}
    onsetViewerMode={(data) => {
      pdfViewerStore.setViewerMode(data.mode);
      if (data.mode === 'canvas') {
        if (pdfDoc) triggerPageRender(currentPage);
        else handleRetry();
      }
    }}
    onretry={handleRetry}
    onopenExternal={handleOpenExternal}
    onswitchToSplit={() => onswitchToSplit?.()}
    onclose={() => onclose?.()}
    ontoggleSync={toggleSync}
    onselectSection={(data) => handleSectionSelect(data.sectionId)}
    onprevPage={handlePrevPage}
    onnextPage={handleNextPage}
    oninputPage={(data) => jumpToPage(data.page, { fromUser: true })}
    onconvertToPaper={handleConvertToPaper}
    onfileSelect={(data) => handleFileSelect(data.event)}
    onclearLocalPdf={clearLocalPdf}
  />

  <!-- Drag-and-Drop Overlay Indicator -->
  {#if isDraggingOver}
    <div class="absolute inset-0 z-50 bg-[#1d2021]/90 border-2 border-dashed border-[#fe8019] flex flex-col items-center justify-center gap-2 text-[#fabd2f] backdrop-blur-sm pointer-events-none">
      <span class="material-symbols-outlined text-4xl animate-bounce text-[#fe8019]">upload_file</span>
      <span class="font-mono text-sm font-bold">{$t('reader.original.dropPdfPrompt')}</span>
      <span class="text-xs text-[#a89984]">{$t('reader.original.localRenderHint')}</span>
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
        onretry={handleRetry}
        onopenExternal={handleOpenExternal}
      />
    {:else if isWeb && webUrl}
      <div class="w-full h-full flex flex-col relative bg-[#141617]">
        <!-- 網頁獨立瀏覽與無法連動提醒橫幅 -->
        <div class="px-3 py-1.5 bg-[#282828] border-b border-[#3c3836] flex items-center justify-between text-xs font-mono shrink-0">
          <div class="flex items-center gap-2 truncate">
            <span class="material-symbols-outlined text-[16px] text-[#fe8019] shrink-0">info</span>
            <span class="text-[#fabd2f] font-semibold">{$t('reader.original.originalWebCompare')}</span>
            <span class="text-[#a89984] text-[11px] truncate hidden sm:inline">{$t('reader.original.browserSameOriginHint')}</span>
          </div>
          <button
            class="px-2 py-0.5 bg-[#32302f] hover:bg-[#3c3836] text-[#8ec07c] hover:text-[#b8bb26] border border-[#3c3836] rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors shrink-0 ml-2"
            onclick={handleOpenExternal}
            title={$t('reader.original.openOriginalWebTab')}
          >
            <span class="material-symbols-outlined text-[13px]">open_in_new</span>
            <span>{$t('reader.original.openInNewTab')}</span>
          </button>
        </div>

        <!-- 嵌入原生網頁 iframe -->
        <div class="flex-1 w-full relative bg-white">
          <iframe
            src={webUrl}
            title={paper?.title || $t('reader.original.originalWebCompare')}
            class="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          ></iframe>
        </div>
      </div>
    {:else}
      <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
        <span class="material-symbols-outlined text-4xl text-[#a89984]">picture_as_pdf</span>
        <span class="text-xs text-[#a89984] font-mono">{$t('reader.original.dragPdfHint')}</span>
      </div>
    {/if}
  </div>

  <!-- Bottom Synchronized Status Bar -->
  <footer class="h-6 bg-[#1d2021] border-t border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-[10px] font-mono text-[#a89984]">
    <div class="flex items-center gap-2 truncate">
      <span class="flex items-center gap-1 {isPdf && isSyncEnabled ? 'text-[#b8bb26]' : 'text-[#a89984]'}">
        <span class="w-1.5 h-1.5 rounded-full {isPdf && isSyncEnabled ? 'bg-[#b8bb26] animate-pulse' : 'bg-[#a89984]'}"></span>
        <span>{isPdf ? (isSyncEnabled ? $t('reader.original.readingCanvas') : $t('reader.original.independentBrowsing')) : $t('reader.original.webIndependentBrowsing')}</span>
      </span>
      <span>·</span>
      <span class="text-[#ebdbb2] truncate max-w-[200px]" title={activeSection?.title || ''}>
        {activeSection ? `§ ${activeSection.id} ${activeSection.title}` : $t('reader.original.docInitialState')}
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if isStringMatchActive}
        <span class="text-[#8ec07c]">{$t('reader.original.exactPageCalibration')}</span>
      {/if}
      <span class="text-[#fabd2f]">
        {isPdf ? (viewerMode === 'canvas' ? $t('reader.original.canvasView') : $t('reader.original.realisticLayout')) : $t('reader.original.nativeWeb')}
      </span>
    </div>
  </footer>
</aside>

<!-- Fullscreen High-Resolution Image Lightbox Modal (共用燈箱元件) -->
<ImageLightboxModal
  isOpen={Boolean(activeLightboxImg)}
  imageUrl={activeLightboxImg || ''}
  caption={activeLightboxCaption}
  onclose={closeLightbox}
/>
