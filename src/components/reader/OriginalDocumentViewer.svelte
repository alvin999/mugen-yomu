<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
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
  import katex from 'katex';
  import { parsePdfToDocument } from '../../services/pdfParserService';

  export let paper: PaperDocument | null = null;
  export let mode: 'split' | 'drawer' = 'split';
  export let activeSectionId: string = '';
  export let sections: ChapterSection[] = [];

  const dispatch = createEventDispatcher();

  // PDF Document & Canvas State
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let textContainerRef: HTMLElement | null = null;
  let isLoadingPdf: boolean = false;
  let isRenderingPage: boolean = false;
  let renderError: string | null = null;
  let currentLoadedSource: string | null = null;

  // Viewer Mode: 'canvas' (PDF.js 畫布) | 'text' (結構化原文對照備援) | 'native' (備援 Iframe)
  let viewerMode: 'canvas' | 'text' | 'native' = 'canvas';

  function sanitizeLatex(latex: string): string {
    if (!latex) return '';
    return latex
      // 1. 消除空白的上下標：_{}, ^{}, _{ }, ^{ }
      .replace(/_\{(\s*)\}/g, '')
      .replace(/\^\{(\s*)\}/g, '')
      // 2. 消除空下標空上標組合：_{}^{}, ^{}_{}
      .replace(/_\{(\s*)\}\^\{(\s*)\}/g, '')
      .replace(/\^\{(\s*)\}_\{(\s*)\}/g, '')
      // 3. 修正化學式中常出現的雙層上下標（如 ^{+}_{}^{} 轉為 ^{+}）
      .replace(/\^\{([^}]+)\}_\{(\s*)\}\^\{(\s*)\}/g, '^{$1}')
      .replace(/_\{([^}]+)\}\^\{(\s*)\}_\{(\s*)\}/g, '_{$1}')
      // 4. 消除連續重複上標 / 下標
      .replace(/\^\{([^}]+)\}\s*\^\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `^{${g1} ${g2}}` : `^{${g1}}`)
      .replace(/_\{([^}]+)\}\s*_\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `_{${g1} ${g2}}` : `_{${g1}}`)
      // 5. 容錯 \left\{ 與 \right\}
      .replace(/\\left\{/g, '\\left\\{')
      .replace(/\\right\}/g, '\\right\\}');
  }

  function renderMath(latex: string, displayMode: boolean = false): string {
    if (!latex) return '';
    try {
      const cleanLatex = sanitizeLatex(latex);
      return katex.renderToString(cleanLatex, {
        displayMode,
        throwOnError: false
      });
    } catch {
      return `<span class="text-[#fb4934] font-mono">${escapeHtml(latex)}</span>`;
    }
  }

  // Paper Sheet Theme: 'parchment' (經典米白論文紙張) | 'dark' (深邃學者模式)
  let paperTheme: 'parchment' | 'dark' = 'parchment';
  let paperFontSize: 'normal' | 'large' = 'normal';

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

  function normalizeAcademicImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim().replace(/^<|>$/g, '');
    if (url.includes('mdpi.com') && (url.includes('/images/') || url.includes('/html/') || /\.(?:png|jpe?g|webp|svg|gif)/i.test(url))) {
      url = url.replace(/https?:\/\/(?:www\.)?mdpi\.com\//i, 'https://pub.mdpi-res.com/');
    }
    return url;
  }

  function extractImageInfo(text: string): { url: string; alt: string } | null {
    if (!text) return null;
    const trimmed = text.trim();

    // 1. Linked markdown image: [![alt](imgUrl)](linkUrl)
    const linkedMatch = trimmed.match(/^\[!\[(.*?)\]\((.*?)\)\]\((.*?)\)$/);
    if (linkedMatch) {
      const url = linkedMatch[2].split(' ')[0].replace(/['"]/g, '');
      return { alt: linkedMatch[1] || '學術圖表', url: normalizeAcademicImageUrl(url) };
    }

    // 2. Standard markdown image: ![alt](imgUrl)
    const match = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (match) {
      const url = match[2].split(' ')[0].replace(/['"]/g, '');
      return { alt: match[1] || '學術圖表', url: normalizeAcademicImageUrl(url) };
    }

    // 3. HTML img tag: <img src="url" alt="alt">
    const htmlMatch = trimmed.match(/<img\s+[^>]*src=["'](.*?)["'][^>]*>/i);
    if (htmlMatch) {
      const altMatch = trimmed.match(/alt=["'](.*?)["']/i);
      return { alt: altMatch ? altMatch[1] : '學術圖表', url: normalizeAcademicImageUrl(htmlMatch[1]) };
    }

    // 4. Direct image URL
    const urlMatch = trimmed.match(/^(https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp|gif)(?:\?.*)?)$/i);
    if (urlMatch) {
      return { alt: '學術圖表', url: normalizeAcademicImageUrl(urlMatch[1]) };
    }

    return null;
  }

  interface NormalizedParagraphItem {
    type: 'subheading' | 'formula' | 'image' | 'text';
    text?: string;
    level?: number;
    latex?: string;
    number?: string;
    url?: string;
    alt?: string;
    originalIndex: number;
  }

  function normalizeParagraphs(paragraphs: string[]): NormalizedParagraphItem[] {
    if (!paragraphs || paragraphs.length === 0) return [];
    const items: NormalizedParagraphItem[] = [];
    let i = 0;

    while (i < paragraphs.length) {
      const raw = paragraphs[i];
      const trimmed = (raw || '').trim();
      if (!trimmed) {
        i++;
        continue;
      }

      // 1. 檢測子標題 (如 #### 2.8.1. ... 或 ### ...)
      const headingMatch = trimmed.match(/^(#{2,6})\s+(.*)$/);
      if (headingMatch) {
        items.push({
          type: 'subheading',
          text: headingMatch[2].trim(),
          level: headingMatch[1].length,
          originalIndex: i
        });
        i++;
        continue;
      }

      // 2. 檢測圖片
      const imgInfo = extractImageInfo(trimmed);
      if (imgInfo) {
        items.push({
          type: 'image',
          url: imgInfo.url,
          alt: imgInfo.alt,
          originalIndex: i
        });
        i++;
        continue;
      }

      // 3. 檢測跨行 / 連續段落區塊公式
      // 情況 A：單一段落包含完整 $$ ... $$ [可帶公式編號]
      const singleBlockMatch = trimmed.match(/^\$\$([\s\S]*?)\$\$(?:\s*(\([0-9a-zA-Z]+\)))?$/);
      if (singleBlockMatch && singleBlockMatch[1].trim()) {
        let latex = singleBlockMatch[1].trim();
        let formulaNum = singleBlockMatch[2] || '';
        // 檢查下一段是否為中繼空行或公式編號，如 (1)
        let lookAhead = i + 1;
        while (lookAhead < paragraphs.length && !paragraphs[lookAhead].trim()) {
          lookAhead++;
        }
        if (!formulaNum && lookAhead < paragraphs.length) {
          const nextP = paragraphs[lookAhead].trim();
          const numMatch = nextP.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i) || nextP.match(/^Equation\s*\(([0-9]+)\)/i);
          if (numMatch) {
            formulaNum = `(${numMatch[1]})`;
            i = lookAhead;
          }
        }
        items.push({
          type: 'formula',
          latex,
          number: formulaNum,
          originalIndex: i
        });
        i++;
        continue;
      }

      // 情況 B：多行段落切分形式的公式（如 $$ 獨佔一行、公式內容在下一行、$$ 獨佔一行、(1) 獨佔一行）
      if (trimmed === '$$' || trimmed.startsWith('$$')) {
        let latexParts: string[] = [];
        let foundEnd = false;
        let formulaNum = '';
        const startIndex = i;

        if (trimmed.length > 2) {
          latexParts.push(trimmed.slice(2).trim());
        }

        let j = i + 1;
        while (j < paragraphs.length) {
          const nextP = paragraphs[j].trim();
          if (!nextP) {
            j++;
            continue;
          }
          if (nextP === '$$' || nextP.endsWith('$$')) {
            if (nextP.length > 2) {
              latexParts.push(nextP.slice(0, -2).trim());
            }
            foundEnd = true;
            j++;
            break;
          } else {
            latexParts.push(nextP);
            j++;
          }
        }

        if (foundEnd) {
          // 檢查後續行是否為公式編號，如 (1)、(2)
          let lookNum = j;
          while (lookNum < paragraphs.length && !paragraphs[lookNum].trim()) {
            lookNum++;
          }
          if (lookNum < paragraphs.length) {
            const numCandidate = paragraphs[lookNum].trim();
            const numMatch = numCandidate.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i) || numCandidate.match(/^Equation\s*\(([0-9]+)\)/i);
            if (numMatch) {
              formulaNum = `(${numMatch[1]})`;
              j = lookNum + 1; // 消耗編號行
            }
          }

          items.push({
            type: 'formula',
            latex: latexParts.join(' ').trim(),
            number: formulaNum,
            originalIndex: startIndex
          });
          i = j;
          continue;
        }
      }

      // 4. 孤立公式編號行如 (1)，若前一項剛好是公式，自動合併
      const standaloneNumMatch = trimmed.match(/^\(([0-9]+[a-zA-Z]?|[ivx]+)\)$/i);
      if (standaloneNumMatch && items.length > 0 && items[items.length - 1].type === 'formula') {
        const prev = items[items.length - 1];
        if (!prev.number) {
          prev.number = `(${standaloneNumMatch[1]})`;
        }
        i++;
        continue;
      }

      // 5. 一般文字段落
      items.push({
        type: 'text',
        text: trimmed,
        originalIndex: i
      });
      i++;
    }

    return items;
  }

  function extractBlockFormula(para: string): string | null {
    if (!para) return null;
    const trimmed = para.trim();
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
      return trimmed.slice(2, -2).trim();
    }
    return null;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Markdown 超連結與巢狀引註解析器：支援 [text](url) 與 [[1](url)]
  function parseLinksAndText(rawText: string): string {
    if (!rawText) return '';
    const linkRegex = /(?<!!)\[([^\[\]]+)\]\(((?:https?:\/\/|#)[^\s'")]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const res: string[] = [];

    while ((m = linkRegex.exec(rawText)) !== null) {
      if (m.index > last) {
        res.push(escapeHtml(rawText.slice(last, m.index)));
      }
      const anchor = escapeHtml(m[1]);
      const url = m[2].replace(/"/g, '&quot;');
      res.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center text-[#8ec07c] hover:text-[#b8bb26] underline decoration-[#8ec07c]/40 hover:decoration-[#b8bb26] transition-colors font-medium px-0.5 rounded hover:bg-[#8ec07c]/10 cursor-pointer" title="${url}">${anchor}</a>`);
      last = linkRegex.lastIndex;
    }

    if (last < rawText.length) {
      res.push(escapeHtml(rawText.slice(last)));
    }

    return res.join('');
  }

  function formatParagraphWithMath(text: string): string {
    if (!text) return '';
    if (!text.includes('$')) {
      return parseLinksAndText(text);
    }

    const parts: string[] = [];
    let lastIndex = 0;
    const regex = /\$([^$\n]+?)\$/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(parseLinksAndText(text.slice(lastIndex, match.index)));
      }
      const math = match[1].trim();
      const rendered = renderMath(math, false);
      parts.push(`<span class="inline-math px-0.5 align-baseline">${rendered}</span>`);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(parseLinksAndText(text.slice(lastIndex)));
    }

    return parts.join('');
  }

  // Local File States
  let localPdfBlobUrl: string | null = null;
  let localPdfArrayBuffer: ArrayBuffer | null = null;
  let localPdfFile: File | null = null;
  let isDraggingOver: boolean = false;
  let fileInputRef: HTMLInputElement | null = null;
  let isConvertingToPaper: boolean = false;
  let convertProgress: number = 0;

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

  // 若當前文章無 PDF（如純網頁專文），自動切換至結構化原文對照模式，絕不留空白畫布
  $: if (!isPdf && viewerMode === 'canvas') {
    viewerMode = 'text';
  }

  // 當處於結構化原文模式且章節焦點改變時，平滑捲動至目標章節
  $: if (viewerMode === 'text' && activeSectionId && textContainerRef) {
    const el = textContainerRef.querySelector(`#text-sec-${activeSectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      if (!sourceToLoad) {
        viewerMode = 'text';
        return;
      }

      const loadedDoc = await loadPdf(sourceToLoad);
      pdfDoc = loadedDoc;
      totalPages = loadedDoc.numPages;
      viewerMode = 'canvas';

      // 關鍵修復：等待 Svelte DOM 渲染完成，確保 canvasElement 確實已綁定掛載
      await tick();

      // 載入完成後立即繪製當前頁面
      await triggerPageRender(currentPage);

      // 非同步在背景執行全文提取與「字串比對自動錨定」
      runStringMatchingPipeline();
    } catch (err: any) {
      console.warn('PDF 載入失敗，自動降級為結構化原文對照模式:', err);
      const errMsg = err?.message || '遠端 PDF 載入失敗（受網路逾時、跨來源 CORS 或伺服器安全限制）';
      renderError = errMsg;
      // 關鍵自動 Fallback：不再降級為容易被 X-Frame-Options 阻擋的 Iframe，而是自動切換為結構化原文模式，100% 保證左側視窗有內容！
      viewerMode = 'text';
    } finally {
      isLoadingPdf = false;
    }
  }

  /**
   * 使用者手動觸發重試載入 PDF
   */
  function handleRetry() {
    currentLoadedSource = null;
    renderError = null;
    isLoadingPdf = true;
    viewerMode = 'canvas';
    initAndLoadPdf();
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

  function handleSectionClick(secId: string) {
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
      pageInputVal = 1;
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
    pageInputVal = 1;
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
      <!-- Quick Convert to Study Canvas Button -->
      {#if (localPdfFile || localPdfArrayBuffer)}
        <button
          class="px-2 py-0.5 rounded bg-[#fe8019]/20 hover:bg-[#fe8019] text-[#fe8019] hover:text-[#1d2021] border border-[#fe8019]/60 transition-colors flex items-center gap-1 text-[10px] font-mono font-bold cursor-pointer disabled:opacity-50"
          disabled={isConvertingToPaper}
          on:click={handleConvertToPaper}
          title="將此本機 PDF 抽取大綱與章節，轉換為三欄雙語伴讀畫布"
        >
          {#if isConvertingToPaper}
            <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
            <span>解析中 {convertProgress}%</span>
          {:else}
            <span class="material-symbols-outlined text-[12px]">auto_stories</span>
            <span>⚡ 轉換為研讀畫布</span>
          {/if}
        </button>
      {/if}

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

      <!-- Engine Switcher Pill (3-Mode: 畫布 / 學術紙本 / 原站網頁) -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 gap-0.5 text-[10px]">
        {#if isPdf}
          <button
            class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'canvas' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            on:click={() => {
              viewerMode = 'canvas';
              if (pdfDoc) triggerPageRender(currentPage);
              else handleRetry();
            }}
            title="PDF.js 向量畫布高精對照模式"
          >
            <span class="material-symbols-outlined text-[11px]">brush</span>
            <span>畫布</span>
          </button>
        {/if}

        <button
          class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'text' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => viewerMode = 'text'}
          title="仿真學術紙本專刊視角（完整期刊排版、圖表與 KaTeX 算式）"
        >
          <span class="material-symbols-outlined text-[11px]">menu_book</span>
          <span>紙本原文</span>
        </button>

        {#if paper?.sourceUrl || activeBaseUrl}
          <button
            class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'native' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            on:click={() => viewerMode = 'native'}
            title={paper?.type === 'web' ? '原站官方網頁檢視器' : '瀏覽器外掛 PDF 檢視器'}
          >
            <span class="material-symbols-outlined text-[11px]">language</span>
            <span>{paper?.type === 'web' ? '原站網頁' : '內核'}</span>
          </button>
        {/if}
      </div>

      <!-- Single-Click Retry Button -->
      <button
        class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 rounded text-[11px] text-[#fabd2f] flex items-center gap-1 transition-colors cursor-pointer"
        on:click={handleRetry}
        disabled={isLoadingPdf}
        title="重新載入 PDF 文件 (重試)"
      >
        <span class="material-symbols-outlined text-[13px] {isLoadingPdf ? 'animate-spin text-[#fe8019]' : ''}">sync</span>
        <span class="hidden sm:inline">重試</span>
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
  <div class="flex-1 w-full h-full bg-[#181a1b] relative overflow-auto flex flex-col justify-start items-center">
    {#if renderError && viewerMode !== 'canvas'}
      <!-- Fallback / Error Alert Banner -->
      <div class="w-full bg-[#fabd2f]/10 border-b border-[#fabd2f]/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-[#fabd2f] shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-[16px] text-[#fe8019] shrink-0">warning</span>
          <span class="truncate">
            <strong class="text-[#ebdbb2]">遠端 PDF 載入受阻：</strong>
            <span class="text-[#d5c4a1] font-mono text-[11px]">{renderError}</span>
            <span class="text-[#b8bb26] ml-1">（已自動備援至結構化原文對照）</span>
          </span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#fe8019]/90 text-[#1d2021] font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
            on:click={handleRetry}
            disabled={isLoadingPdf}
            title="重新嘗試下載並解析 PDF"
          >
            <span class="material-symbols-outlined text-[12px] {isLoadingPdf ? 'animate-spin' : ''}">sync</span>
            <span>重試載入</span>
          </button>
          <button
            class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#ebdbb2] rounded text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
            on:click={handleOpenExternal}
            title="在新分頁開啟"
          >
            <span class="material-symbols-outlined text-[12px]">open_in_new</span>
            <span>另開原檔</span>
          </button>
        </div>
      </div>
    {/if}

    {#if viewerMode === 'canvas'}
      <div class="w-full h-full p-4 overflow-auto flex justify-center items-start">
        {#if isLoadingPdf}
          <div class="w-full h-full flex flex-col items-center justify-center gap-3 text-xs font-mono text-[#fabd2f]">
            <span class="material-symbols-outlined text-3xl animate-spin text-[#fe8019]">sync</span>
            <span class="text-sm font-semibold">正在載入 PDF 文獻結構...</span>
            <span class="text-[#a89984] text-[11px]">透過本地代理避開 CORS 限制 · 請稍候</span>
          </div>
        {:else if pdfDoc}
          <!-- High-Fidelity PDF.js Canvas Renderer -->
          <div class="relative flex flex-col items-center shadow-2xl rounded bg-white">
            <canvas bind:this={canvasElement} class="block select-text max-w-full"></canvas>

            {#if isRenderingPage}
              <div class="absolute inset-0 bg-[#141617]/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-xs font-mono text-[#fabd2f]">
                <span class="material-symbols-outlined text-2xl animate-spin text-[#fe8019]">sync</span>
                <span>繪製第 {currentPage} 頁...</span>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Canvas Loading Failed or No PDF State -->
          <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
            <div class="w-14 h-14 rounded-full bg-[#282828] border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
              <span class="material-symbols-outlined text-2xl">picture_as_pdf</span>
            </div>
            <div class="flex flex-col gap-1 max-w-md">
              <h4 class="text-sm font-bold text-[#ebdbb2]">PDF 畫布未能成功載入</h4>
              <p class="text-xs text-[#a89984] leading-relaxed">
                {renderError || '遠端伺服器連線逾時或受跨來源安全性限制。您可以重試載入、切換為結構化原文對照，或拖入本機 PDF 原檔。'}
              </p>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <button
                class="px-3.5 py-1.5 bg-[#fe8019] text-[#1d2021] font-bold text-xs rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
                on:click={handleRetry}
              >
                <span class="material-symbols-outlined text-[15px]">sync</span>
                重新嘗試載入 PDF
              </button>
              <button
                class="px-3.5 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] text-[#ebdbb2] text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                on:click={() => viewerMode = 'text'}
              >
                <span class="material-symbols-outlined text-[15px] text-[#8ec07c]">article</span>
                切換為結構化原文對照
              </button>
            </div>
          </div>
        {/if}
      </div>

    {:else if viewerMode === 'text'}
      <!-- Academic Paper Sheet View (仿真學術紙本專刊視角，100% 呈現官方出版物樣式) -->
      <div
        bind:this={textContainerRef}
        class="w-full h-full overflow-y-auto px-3 sm:px-6 py-6 flex flex-col items-center bg-[#121314] select-text relative"
      >
        <!-- Paper Sheet Floating Toolbar -->
        <div class="w-full {mode === 'split' ? 'max-w-none' : 'max-w-[840px]'} mb-3 flex items-center justify-between bg-[#1d2021]/90 backdrop-blur-sm border border-[#3c3836] px-3.5 py-2 rounded-xl text-xs font-mono text-[#a89984] shadow-md shrink-0">
          <div class="flex items-center gap-2">
            <span class="flex items-center gap-1.5 text-[#fe8019] font-bold">
              <span class="material-symbols-outlined text-[15px]">menu_book</span>
              仿真學術紙本專刊
            </span>
            <span class="text-[#504945]">|</span>
            <span class="text-[11px] text-[#a89984]">
              {allSections.length} 章節 · 完整圖表與 KaTeX 公式
            </span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Paper Sheet Theme Switcher -->
            <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 text-[11px]">
              <button
                class="px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer {paperTheme === 'parchment' ? 'bg-[#fcfbf9] text-[#1d2021] font-bold shadow-xs' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                on:click={() => paperTheme = 'parchment'}
                title="經典米白論文紙張"
              >
                <span>📜</span>
                <span>紙本</span>
              </button>
              <button
                class="px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer {paperTheme === 'dark' ? 'bg-[#fe8019] text-[#1d2021] font-bold shadow-xs' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                on:click={() => paperTheme = 'dark'}
                title="深邃學者夜間模式"
              >
                <span>🌙</span>
                <span>夜間</span>
              </button>
            </div>

            <!-- Font Size Toggle -->
            <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 text-[11px]">
              <button
                class="px-1.5 py-0.5 rounded transition-colors cursor-pointer {paperFontSize === 'normal' ? 'bg-[#3c3836] text-[#ebdbb2] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                on:click={() => paperFontSize = 'normal'}
                title="標準字體"
              >A</button>
              <button
                class="px-1.5 py-0.5 rounded transition-colors cursor-pointer {paperFontSize === 'large' ? 'bg-[#3c3836] text-[#ebdbb2] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                on:click={() => paperFontSize = 'large'}
                title="放大字體"
              >A+</button>
            </div>

            {#if isPdf}
              <button
                class="text-[#fabd2f] hover:underline cursor-pointer flex items-center gap-0.5 text-[11px] ml-1"
                on:click={handleRetry}
                title="嘗試載入 PDF 向量畫布"
              >
                <span class="material-symbols-outlined text-[13px]">brush</span>
                <span>畫布</span>
              </button>
            {/if}
          </div>
        </div>

        {#if paper}
          <!-- Physical Paper Sheet Canvas Container -->
          <article
            class="w-full {mode === 'split' ? 'max-w-none' : 'max-w-[840px]'} my-2 transition-all duration-300 rounded-sm shadow-2xl p-6 sm:p-12 mb-20 {
              paperTheme === 'parchment'
                ? 'bg-[#fcfbf9] text-[#1c1b1a] border border-[#e2ded6]'
                : 'bg-[#1d2021] text-[#ebdbb2] border border-[#3c3836]'
            }"
          >
            <!-- 1. Academic Journal Masthead & Header Lines -->
            <header class="mb-6">
              <!-- Top Double Line (3px top border, 1px bottom border) -->
              <div class="border-t-[3px] border-b border-current pt-1.5 pb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] {paperTheme === 'parchment' ? 'text-[#3c3836]' : 'text-[#a89984]'}">
                <div class="flex items-center gap-2 font-bold">
                  <span class="text-[#fe8019] tracking-wider uppercase">{paper.venue || 'Academic Journal'}</span>
                  <span>·</span>
                  <span class="font-medium">{paper.arxivId || 'Open Access Scientific Report'}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="bg-[#2ea043]/15 text-[#2ea043] border border-[#2ea043]/40 font-bold px-1.5 py-0.2 rounded text-[10px] uppercase tracking-wider">
                    OPEN ACCESS
                  </span>
                  {#if paper.sourceUrl}
                    <a
                      href={paper.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="hover:underline flex items-center gap-0.5 {paperTheme === 'parchment' ? 'text-[#0969da]' : 'text-[#8ec07c]'}"
                      title="官方刊載 DOI / 來源網址"
                    >
                      <span>DOI / 原文</span>
                      <span class="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  {/if}
                </div>
              </div>

              <!-- Article Type Banner -->
              <div class="mt-4 mb-2 font-mono text-[10px] font-bold tracking-widest uppercase {paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'}">
                Research Article · Peer-Reviewed Academic Publication
              </div>

              <!-- Paper Main Title -->
              <h1 class="font-serif text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-4 {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'}">
                {paper.title}
              </h1>

              <!-- Publication Meta -->
              <div class="text-xs font-serif italic mb-6 pb-4 border-b border-current/20 flex flex-wrap items-center gap-x-4 gap-y-1 {paperTheme === 'parchment' ? 'text-[#57606a]' : 'text-[#a89984]'}">
                <span>Published online by MUGEN YOMU Academic Reader</span>
                <span>·</span>
                <span>Comprehensive Structured Edition</span>
              </div>
            </header>

            <!-- 2. Structured Sections Flow -->
            <div class="flex flex-col gap-6">
              {#each allSections as sec, sIndex (sec.id)}
                {@const isFocused = sec.id === activeSectionId}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <section
                  id={`text-sec-${sec.id}`}
                  class="flex flex-col transition-all duration-300 rounded p-3 -mx-3 border cursor-pointer {
                    isFocused
                      ? (paperTheme === 'parchment' ? 'bg-[#f0ebe0] border-[#fe8019]/80 shadow-xs' : 'bg-[#282828] border-[#fe8019]/80 shadow-xs')
                      : 'border-transparent hover:border-current/10'
                  }"
                  on:click={() => handleSectionClick(sec.id)}
                >
                  <!-- Section Heading -->
                  <div class="flex items-baseline justify-between gap-2 border-b border-current/20 pb-1.5 mb-3">
                    <h2 class="font-serif text-base sm:text-lg font-bold flex items-baseline gap-2 {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'}">
                      <span class="font-mono text-sm {paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fe8019]'}">
                        § {sec.id}
                      </span>
                      <span>{sec.title.replace(/^[0-9.]+\s*/, '')}</span>
                    </h2>
                    {#if sec.page}
                      <span class="font-mono text-[11px] {paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'} shrink-0">
                        p.{sec.page}
                      </span>
                    {/if}
                  </div>

                  <!-- Paragraphs & Inline Figures / Math -->
                  <div class="flex flex-col gap-3">
                    {#each normalizeParagraphs(sec.paragraphs) as item, itemIdx}
                      {#if item.type === 'subheading'}
                        <!-- Academic Subheading -->
                        <div class="mt-3 mb-1 pt-1 pb-1 border-b border-current/20 flex items-center gap-1.5">
                          <span class="w-1 h-3 bg-[#fe8019] rounded-xs shrink-0"></span>
                          <h3 class="font-serif font-bold text-sm sm:text-base {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#fbf1c7]'}">
                            {item.text}
                          </h3>
                        </div>
                      {:else if item.type === 'image' && item.url}
                        <!-- Academic Figure Card -->
                        <figure class="my-4 p-4 rounded-lg flex flex-col items-center gap-2 border {
                          paperTheme === 'parchment'
                            ? 'bg-[#f4efe6] border-[#ded7ca]'
                            : 'bg-[#141617] border-[#3c3836]'
                        }">
                          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                          <div
                            class="w-full flex items-center justify-center p-2 rounded cursor-zoom-in group"
                            on:click|stopPropagation={() => openLightbox(item.url || '', item.alt)}
                          >
                            <img
                              src={item.url}
                              alt={item.alt || ''}
                              referrerpolicy="no-referrer"
                              class="max-h-[380px] max-w-full rounded object-contain shadow-xs transition-transform group-hover:scale-[1.01]"
                              loading="lazy"
                            />
                          </div>
                          <figcaption class="text-xs font-serif text-center max-w-[92%] leading-relaxed mt-1 {
                            paperTheme === 'parchment' ? 'text-[#57606a]' : 'text-[#a89984]'
                          }">
                            <strong class="font-mono {paperTheme === 'parchment' ? 'text-[#1c1b1a]' : 'text-[#ebdbb2]'}">
                              Figure {sIndex + 1}.{itemIdx + 1}
                            </strong>
                            <span class="ml-1">{item.alt || '學術圖表'}</span>
                          </figcaption>
                        </figure>
                      {:else if item.type === 'formula' && item.latex}
                        <!-- Mathematical Expression -->
                        <div class="my-3 py-2 px-4 rounded flex items-center justify-between border {
                          paperTheme === 'parchment'
                            ? 'bg-[#f7f4ed] border-[#e2ded6]'
                            : 'bg-[#141617] border-[#3c3836]'
                        }">
                          <div class="overflow-x-auto text-center py-1 max-w-full mx-auto">
                            {@html renderMath(item.latex, true)}
                          </div>
                          {#if item.number}
                            <span class="font-mono text-xs font-semibold shrink-0 pl-3 {paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fabd2f]'}">
                              {item.number}
                            </span>
                          {/if}
                        </div>
                      {:else if item.type === 'text' && item.text}
                        <!-- Standard Academic Paragraph -->
                        <p class="font-serif leading-[1.85] text-justify tracking-normal {
                          paperFontSize === 'large' ? 'text-[16.5px]' : 'text-[14.5px]'
                        } {
                          paperTheme === 'parchment' ? 'text-[#24292f]' : 'text-[#d5c4a1]'
                        }">
                          {@html formatParagraphWithMath(item.text)}
                        </p>
                      {/if}
                    {/each}
                  </div>

                  <!-- Formulas Listing -->
                  {#if sec.formulas && sec.formulas.length > 0}
                    <div class="flex flex-col gap-2 mt-3 pt-3 border-t border-current/15">
                      {#each sec.formulas as formula}
                        <div class="p-3 rounded flex flex-col gap-1 border {
                          paperTheme === 'parchment' ? 'bg-[#f7f4ed] border-[#e2ded6]' : 'bg-[#141617] border-[#3c3836]'
                        }">
                          <div class="flex items-center justify-between text-[11px] font-mono {
                            paperTheme === 'parchment' ? 'text-[#b57614]' : 'text-[#fabd2f]'
                          }">
                            <span>{formula.name || '方程式'}</span>
                            <span class="font-bold">{formula.number || ''}</span>
                          </div>
                          <div class="overflow-x-auto py-1 text-center">
                            {@html renderMath(formula.latexText, true)}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </section>
              {/each}
            </div>

            <!-- Paper Sheet Footer -->
            <footer class="mt-12 pt-4 border-t-[3px] border-b border-current font-mono text-[10px] flex items-center justify-between {
              paperTheme === 'parchment' ? 'text-[#8c857b]' : 'text-[#928374]'
            }">
              <span>MUGEN YOMU ACADEMIC REPRINT</span>
              <span>END OF DOCUMENT</span>
            </footer>
          </article>
        {:else}
          <div class="text-center py-16 text-[#a89984] text-xs font-mono">
            尚未選定文獻章節內容
          </div>
        {/if}
      </div>

    {:else}
      <!-- Native Iframe / Live Web View with Akamai Edge Protection Warning & Fast Track -->
      <div class="w-full h-full flex flex-col bg-[#141617]">
        <!-- Address & Action Bar -->
        <div class="h-9 bg-[#1d2021] border-b border-[#3c3836] px-3 flex items-center justify-between text-[11px] font-mono text-[#a89984] shrink-0">
          <div class="flex items-center gap-1.5 truncate max-w-[60%] text-[#ebdbb2]">
            <span class="material-symbols-outlined text-[15px] text-[#8ec07c]">language</span>
            <span class="truncate">{paper?.sourceUrl || activeBaseUrl}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              class="text-[#fabd2f] hover:underline cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
              on:click={() => viewerMode = 'text'}
              title="切換為零破圖、排版精美的仿真學術紙本模式"
            >
              <span class="material-symbols-outlined text-[13px]">menu_book</span>
              <span>切換紙本原文</span>
            </button>
            <button
              class="px-2 py-0.5 bg-[#fe8019] hover:bg-[#fe8019]/90 text-[#1d2021] font-bold rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
              on:click={handleOpenExternal}
              title="在獨立瀏覽器分頁開啟（完全無 Akamai 阻擋）"
            >
              <span class="material-symbols-outlined text-[12px]">open_in_new</span>
              <span>另開原站分頁</span>
            </button>
          </div>
        </div>

        <!-- Akamai / Frame Protection Notice Banner -->
        <div class="bg-[#282828] border-b border-[#3c3836] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#fabd2f] shrink-0">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[15px] text-[#fe8019]">shield</span>
            <span>
              若下方原站出現 <code class="bg-[#141617] px-1 py-0.5 rounded text-[#fe8019]">Access Denied</code>，係因出版商 (MDPI / Akamai CDN) 啟用了跨站防嵌入 (SAMEORIGIN)。
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-[#8ec07c] hover:underline cursor-pointer flex items-center gap-0.5 text-[11px] font-bold"
              on:click={() => viewerMode = 'text'}
            >
              <span>➜ 立即使用【仿真學術紙本模式】（零阻擋・全圖表）</span>
            </button>
          </div>
        </div>

        {#if paper?.sourceUrl || activeBaseUrl}
          <iframe
            src={isPdf ? `${activeBaseUrl}#page=${currentPage}&navpanes=0&toolbar=1&view=FitH` : (paper?.sourceUrl || activeBaseUrl)}
            title="原檔或原站網頁檢視器"
            class="w-full flex-1 border-0 bg-[#282828]"
          ></iframe>
        {:else}
          <!-- Empty State -->
          <div class="w-full flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <div class="w-12 h-12 rounded-full bg-[#282828] border border-[#3c3836] flex items-center justify-center text-[#fe8019]">
              <span class="material-symbols-outlined text-2xl">picture_as_pdf</span>
            </div>
            <div class="flex flex-col gap-1 max-w-sm">
              <h4 class="text-sm font-bold text-[#ebdbb2]">尚未設定此文章的原檔連結</h4>
              <p class="text-xs text-[#a89984] leading-relaxed">
                您可以切換至【仿真學術紙本模式】，或拖曳任何 <code class="text-[#fabd2f]">.pdf</code> 檔案至此處。
              </p>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <button
                class="px-3 py-1.5 bg-[#fe8019] text-[#1d2021] font-bold text-xs rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
                on:click={() => viewerMode = 'text'}
              >
                <span class="material-symbols-outlined text-[15px]">menu_book</span>
                切換為仿真學術紙本
              </button>
              <button
                class="px-3 py-1.5 bg-[#282828] border border-[#504945] text-[#ebdbb2] text-xs rounded-lg hover:bg-[#32302f] transition-colors flex items-center gap-1.5 cursor-pointer"
                on:click={() => fileInputRef?.click()}
              >
                <span class="material-symbols-outlined text-[15px]">upload_file</span>
                選取本機 PDF
              </button>
            </div>
          </div>
        {/if}
      </div>
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

  <!-- Figure Lightbox Modal -->
  {#if activeLightboxImg}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in select-none"
      on:click={closeLightbox}
    >
      <div class="absolute top-4 right-4 flex items-center gap-3">
        <a
          href={activeLightboxImg}
          target="_blank"
          rel="noopener noreferrer"
          class="p-2 rounded-full bg-[#282828] text-[#ebdbb2] hover:bg-[#3c3836] transition-colors"
          title="在新分頁開啟原始高解析圖片"
          on:click|stopPropagation
        >
          <span class="material-symbols-outlined text-xl">open_in_new</span>
        </a>
        <button
          class="p-2 rounded-full bg-[#282828] text-[#ebdbb2] hover:bg-[#fb4934] hover:text-white transition-colors cursor-pointer"
          on:click={closeLightbox}
          title="關閉預覽 (ESC)"
        >
          <span class="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="max-w-[92vw] max-h-[85vh] flex flex-col items-center gap-3"
        on:click|stopPropagation
      >
        <img
          src={activeLightboxImg}
          alt={activeLightboxCaption}
          referrerpolicy="no-referrer"
          class="max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl border border-[#3c3836]"
        />
        {#if activeLightboxCaption}
          <p class="text-xs font-mono text-[#d5c4a1] bg-[#1d2021]/80 px-4 py-1.5 rounded-full border border-[#3c3836] max-w-xl text-center truncate">
            {activeLightboxCaption}
          </p>
        {/if}
      </div>
    </div>
  {/if}
</aside>
