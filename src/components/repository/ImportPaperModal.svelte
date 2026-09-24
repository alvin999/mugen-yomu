<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    userManualDocument,
    attentionPaper,
    resnetPaper,
    anthropicCircuitsWeb,
    fetchWebArticle,
    fetchArxivDocument,
    parseMarkdownToDocument,
    parseEpubToDocument,
    saveLibraryToStorage,
    setActivePaperId,
    type PaperDocument
  } from '../../stores/documentStore';
  import { parsePdfToDocument } from '../../services/pdfParserService';
  import { cleanPaperText } from '../../utils/paperTextSanitizer';

  export let isOpen: boolean = false;
  export let currentLibrary: PaperDocument[] = [];

  const dispatch = createEventDispatcher();

  let activeTab: 'arxiv' | 'pdf' | 'book' | 'web' | 'preset' | 'paste' | 'upload' = 'arxiv';

  // Tab Book: EPUB Local File Import State
  let isParsingBook: boolean = false;
  let bookParsePercent: number = 0;
  let bookParseStepText: string = '';
  let bookError: string = '';
  let previewBookPaper: PaperDocument | null = null;
  let bookDragOver: boolean = false;

  // Tab 0: arXiv ID Import State
  let arxivInput: string = '1706.03762';
  let isFetchingArxiv: boolean = false;
  let arxivError: string = '';
  let previewArxivPaper: PaperDocument | null = null;

  // Tab 1: Web URL State
  let webUrl: string = 'https://transformer-circuits.pub/2021/framework/index.html';
  let isFetchingWeb: boolean = false;
  let webError: string = '';
  let previewWebPaper: PaperDocument | null = null;

  // Tab 3: Paste Text State
  let pasteTitle: string = '';
  let pasteContent: string = '';
  let pasteError: string = '';
  let autoSanitizePaste: boolean = true;

  // Tab PDF: Local PDF Parser State
  let isParsingPdf: boolean = false;
  let pdfParsePercent: number = 0;
  let pdfParseStepText: string = '';
  let pdfError: string = '';
  let previewPdfPaper: PaperDocument | null = null;
  let pdfDragOver: boolean = false;

  // Tab 4: File Upload State
  let uploadJsonText: string = '';
  let uploadError: string = '';
  let previewUploadPaper: PaperDocument | null = null;

  // --- Clipboard Helper & Paste Handlers ---
  let clipboardToast: string = '';
  let toastTimeout: any = null;

  function showToast(msg: string) {
    clipboardToast = msg;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      clipboardToast = '';
    }, 2800);
  }

  async function getClipboardText(): Promise<string | null> {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast('瀏覽器限制讀取剪貼簿，請使用 Ctrl+V 貼上');
      return null;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast('剪貼簿目前沒有文字內容');
        return null;
      }
      return text;
    } catch (err: any) {
      showToast('無法讀取剪貼簿（可能需要允許瀏覽器權限）');
      return null;
    }
  }

  async function handlePasteArxiv() {
    const text = await getClipboardText();
    if (!text) return;
    let cleaned = text.trim();
    // 自動辨識 arXiv URL 或 ID
    const match = cleaned.match(/(?:arxiv\.org\/(?:abs|pdf|html)\/|arxiv:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (match && match[1]) {
      arxivInput = match[1];
      showToast(`已貼上 arXiv ID: ${arxivInput}`);
    } else {
      arxivInput = cleaned;
      showToast('已從剪貼簿貼上');
    }
    arxivError = '';
  }

  async function handlePasteWebUrl() {
    const text = await getClipboardText();
    if (!text) return;
    webUrl = text.trim();
    webError = '';
    showToast('已從剪貼簿貼上網址');
  }

  async function handlePasteTitle() {
    const text = await getClipboardText();
    if (!text) return;
    pasteTitle = text.trim().replace(/^#+\s*/, '');
    showToast('已從剪貼簿貼上標題');
  }

  async function handlePasteContent() {
    const text = await getClipboardText();
    if (!text) return;
    const contentToUse = autoSanitizePaste ? cleanPaperText(text) : text;
    pasteContent = contentToUse;
    pasteError = '';

    // 若標題空白，嘗試自動擷取首行作為標題
    if (!pasteTitle.trim()) {
      const firstLine = text.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
      if (firstLine && firstLine.length < 80) {
        pasteTitle = firstLine;
      }
    }
    showToast(`已貼上內容 (${contentToUse.length.toLocaleString()} 字元)`);
  }

  function close() {
    isOpen = false;
    dispatch('close');
  }

  // --- Tab 0: arXiv Fetch Logic ---
  async function handleFetchArxiv() {
    if (!arxivInput.trim()) {
      arxivError = '請輸入有效的 arXiv ID 或論文網址';
      return;
    }
    arxivError = '';
    isFetchingArxiv = true;
    previewArxivPaper = null;

    try {
      const doc = await fetchArxivDocument(arxivInput);
      previewArxivPaper = doc;
    } catch (err: any) {
      arxivError = `抓取 arXiv 失敗：${err.message || '無法解析該論文'}`;
    } finally {
      isFetchingArxiv = false;
    }
  }

  function handleImportArxivPaper() {
    if (!previewArxivPaper) return;
    importAndActivatePaper(previewArxivPaper);
  }

  function setDemoArxiv(id: string) {
    arxivInput = id;
    handleFetchArxiv();
  }

  // --- Tab 1: Web Fetch Logic ---
  async function handleFetchWeb() {
    if (!webUrl.trim()) {
      webError = '請輸入有效的網頁網址 (URL)';
      return;
    }
    webError = '';
    isFetchingWeb = true;
    previewWebPaper = null;

    try {
      const doc = await fetchWebArticle(webUrl);
      previewWebPaper = doc;
    } catch (err: any) {
      webError = `解析網頁失敗：${err.message || '無法訪問該網址'}`;
    } finally {
      isFetchingWeb = false;
    }
  }

  function handleImportWebArticle() {
    if (!previewWebPaper) return;
    importAndActivatePaper(previewWebPaper);
  }

  function setDemoUrl(url: string) {
    webUrl = url;
    handleFetchWeb();
  }

  // --- Tab 2: Preset Loader ---
  function handleSelectPreset(preset: PaperDocument) {
    importAndActivatePaper(preset);
  }

  function handleRestoreAllPresets() {
    const presets = [userManualDocument, attentionPaper, resnetPaper, anthropicCircuitsWeb];
    let updated = [...currentLibrary];
    for (const p of presets) {
      if (!updated.some(item => item.id === p.id)) {
        updated.push(p);
      }
    }
    saveLibraryToStorage(updated);
    dispatch('paperLoaded', { paper: userManualDocument, library: updated });
    clipboardToast = '已成功補齊並還原預設核心文獻！';
    setTimeout(() => {
      clipboardToast = '';
      close();
    }, 1200);
  }

  // --- Tab 3: Paste Text Logic ---
  function handleCleanPasteText() {
    if (!pasteContent.trim()) return;
    pasteContent = cleanPaperText(pasteContent);
  }

  function handleParsePaste() {
    if (!pasteContent.trim()) {
      pasteError = '請貼上文章內容或 Markdown 文字';
      return;
    }
    pasteError = '';
    const title = pasteTitle.trim() || '自訂貼上文獻';
    const contentToParse = autoSanitizePaste ? cleanPaperText(pasteContent) : pasteContent;
    const doc = parseMarkdownToDocument(title, contentToParse);
    importAndActivatePaper(doc);
  }

  // --- Tab 4: File Upload Logic ---
  function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.title || !parsed.sections) {
          throw new Error('缺少必要之 title 或 sections 欄位');
        }
        if (!parsed.id) parsed.id = `custom_${Date.now()}`;
        if (!parsed.type) parsed.type = 'paper';
        previewUploadPaper = parsed as PaperDocument;
        uploadError = '';
      } catch (err: any) {
        uploadError = `檔案解析失敗：${err.message || '無效的 JSON 結構'}`;
        previewUploadPaper = null;
      }
    };
    reader.readAsText(file);
  }

  // --- Tab PDF: Local Offline PDF Parser Logic ---
  async function handlePdfFile(file: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      pdfError = '請選取標準 PDF 格式檔案 (.pdf)！';
      return;
    }
    pdfError = '';
    isParsingPdf = true;
    pdfParsePercent = 0;
    pdfParseStepText = '準備解析本機 PDF...';
    previewPdfPaper = null;

    try {
      const doc = await parsePdfToDocument(file, file.name, (pct, msg) => {
        pdfParsePercent = pct;
        pdfParseStepText = msg;
      });
      previewPdfPaper = doc;
    } catch (err: any) {
      console.error('PDF 解析失敗:', err);
      pdfError = `PDF 解析失敗: ${err?.message || '未知錯誤'}`;
    } finally {
      isParsingPdf = false;
    }
  }

  function handlePdfInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handlePdfFile(target.files[0]);
    }
  }

  function handlePdfDrop(e: DragEvent) {
    e.preventDefault();
    pdfDragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handlePdfFile(e.dataTransfer.files[0]);
    }
  }

  function handleImportPdfPaper() {
    if (!previewPdfPaper) return;
    importAndActivatePaper(previewPdfPaper);
  }

  function handleImportUploadedPaper() {
    if (!previewUploadPaper) return;
    importAndActivatePaper(previewUploadPaper);
  }

  // --- Book (EPUB / GitBook) Handlers ---
  async function handleEpubFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      await parseEpubFile(input.files[0]);
    }
  }

  async function handleEpubDrop(e: DragEvent) {
    e.preventDefault();
    bookDragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.epub')) {
        await parseEpubFile(file);
      } else {
        bookError = '請拖放副檔名為 .epub 的電子書檔案';
      }
    }
  }

  async function parseEpubFile(file: File) {
    isParsingBook = true;
    bookError = '';
    previewBookPaper = null;
    bookParsePercent = 10;
    bookParseStepText = '讀取本機 EPUB 檔案...';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const paper = await parseEpubToDocument(arrayBuffer, {
        toTraditional: false,
        onProgress: (p) => {
          bookParseStepText = p.step;
          bookParsePercent = p.percent;
        }
      });
      previewBookPaper = paper;
    } catch (err: any) {
      bookError = err?.message || 'EPUB 解析失敗，請確認檔案結構是否完整';
    } finally {
      isParsingBook = false;
    }
  }

  function handleImportBookPaper() {
    if (!previewBookPaper) return;
    importAndActivatePaper(previewBookPaper);
  }

  // --- Common Import Handler ---
  function importAndActivatePaper(paper: PaperDocument) {
    // Check if already in library by ID
    const exists = currentLibrary.some(p => p.id === paper.id);
    let updatedLibrary = exists
      ? currentLibrary.map(p => p.id === paper.id ? paper : p)
      : [paper, ...currentLibrary];

    saveLibraryToStorage(updatedLibrary);
    setActivePaperId(paper.id);

    dispatch('paperLoaded', { paper, library: updatedLibrary });
    close();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none" aria-modal="true" role="dialog">
    <div class="w-full max-w-3xl bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
      
      {#if clipboardToast}
        <div class="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 bg-[#32302f] border border-[#fe8019] text-[#fabd2f] text-xs font-mono rounded-lg shadow-xl flex items-center gap-1.5 animate-pulse">
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">info</span>
          <span>{clipboardToast}</span>
        </div>
      {/if}
      
      <!-- Modal Header -->
      <div class="p-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-[17px]">add_notes</span>
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-[#ebdbb2] tracking-wide">匯入文獻與網頁文章 (Import Document)</h3>
            <span class="font-mono text-[10px] text-[#a89984]">支援學術論文、AI 研究報告、Distill 與技術部落格</span>
          </div>
        </div>
        <button
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          on:click={close}
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Tab Switcher -->
      <div class="px-5 pt-3 bg-[#1d2021]/80 border-b border-[#3c3836] flex items-center gap-1.5 overflow-x-auto">
        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'arxiv' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'arxiv'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">auto_stories</span>
          <span>arXiv 一鍵匯入 (原圖)</span>
          <span class="bg-[#fe8019]/20 text-[#fe8019] text-[9px] px-1 py-0.2 rounded font-bold">推薦</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'pdf' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'pdf'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">picture_as_pdf</span>
          <span>本機 PDF 解析</span>
          <span class="bg-[#b8bb26]/20 text-[#b8bb26] text-[9px] px-1 py-0.2 rounded font-bold">離線</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'book' ? 'bg-[#282828] text-[#8ec07c] border-t-2 border-[#8ec07c] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'book'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#8ec07c]">menu_book</span>
          <span>EPUB 電子書</span>
          <span class="bg-[#8ec07c]/20 text-[#8ec07c] text-[9px] px-1 py-0.2 rounded font-bold">上傳</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'web' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'web'}
        >
          <span class="material-symbols-outlined text-[15px]">language</span>
          網頁 URL 匯入
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'preset' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'preset'}
        >
          <span class="material-symbols-outlined text-[15px]">stars</span>
          經典學術與專文
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'paste' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'paste'}
        >
          <span class="material-symbols-outlined text-[15px]">content_paste</span>
          文字 / Markdown 貼上
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'upload' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          on:click={() => activeTab = 'upload'}
        >
          <span class="material-symbols-outlined text-[15px]">upload_file</span>
          JSON 檔案上傳
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">

        <!-- ==================== TAB 0: ARXIV ID IMPORT ==================== -->
        {#if activeTab === 'arxiv'}
          <div class="flex flex-col gap-3.5">
            <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5 shadow-inner">
              <span class="material-symbols-outlined text-[20px] text-[#fe8019] shrink-0 mt-0.5">auto_stories</span>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-[#ebdbb2] flex items-center gap-1.5">
                  ar5iv 官方原生學術圖表無損抓取
                  <span class="font-mono text-[10px] text-[#fabd2f] bg-[#282828] px-1.5 py-0.2 rounded border border-[#504945]">SVG / WebP 原圖</span>
                </span>
                <span class="text-[#a89984] leading-relaxed">
                  輸入任何 arXiv 論文 ID 或網址，系統自動透過 ar5iv HTML5 服務擷取官方高解析度模型架構圖、Figure 圖說與章節目錄，並自動綁定官方 PDF 供雙軌對照。
                </span>
              </div>
            </div>

            <!-- arXiv ID Input -->
            <div class="flex flex-col gap-1.5">
              <label for="import-arxiv-input" class="font-mono text-[11px] text-[#d5c4a1] flex items-center justify-between">
                <span>arXiv 論文編號或網址</span>
                <span class="text-[#a89984]">支援格式如 1706.03762 或 https://arxiv.org/abs/...</span>
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="import-arxiv-input"
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="text"
                  placeholder="例如: 1706.03762"
                  bind:value={arxivInput}
                  on:keydown={(e) => e.key === 'Enter' && handleFetchArxiv()}
                />
                <button
                  type="button"
                  class="px-2.5 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  title="從剪貼簿貼上"
                  on:click={handlePasteArxiv}
                >
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">content_paste</span>
                  <span class="font-mono text-[11px]">貼上</span>
                </button>
                <button
                  class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                  disabled={isFetchingArxiv}
                  on:click={handleFetchArxiv}
                >
                  {#if isFetchingArxiv}
                    <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
                    <span>抓取圖文中...</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px]">download</span>
                    <span>抓取論文</span>
                  {/if}
                </button>
              </div>

              {#if arxivError}
                <div class="p-2.5 rounded bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] font-mono text-[11px] flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[14px]">error</span>
                  <span>{arxivError}</span>
                </div>
              {/if}
            </div>

            <!-- Demo Quick Chips -->
            <div class="flex flex-col gap-1.5">
              <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">熱門經典論文推薦</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  on:click={() => setDemoArxiv('1706.03762')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  1706.03762 (Attention Is All You Need)
                </button>
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  on:click={() => setDemoArxiv('1512.03385')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  1512.03385 (ResNet 深度殘差)
                </button>
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  on:click={() => setDemoArxiv('2005.14165')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  2005.14165 (GPT-3 語言模型)
                </button>
              </div>
            </div>

            <!-- Preview Card for arXiv -->
            {#if previewArxivPaper}
              <div class="mt-1 p-3.5 bg-[#1d2021] border border-[#fabd2f] rounded-xl flex flex-col gap-2.5 shadow-lg animate-fade-in">
                <div class="flex items-center justify-between text-[11px] font-mono">
                  <span class="text-[#b8bb26] font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">check_circle</span>
                    已成功解析 arXiv 圖文結構
                  </span>
                  <span class="text-[#fabd2f] bg-[#fabd2f]/10 border border-[#fabd2f]/40 px-1.5 py-0.2 rounded">
                    {previewArxivPaper.arxivId || 'arXiv'}
                  </span>
                </div>

                <div class="flex flex-col gap-1">
                  <h4 class="text-sm font-serif font-bold text-[#ebdbb2] leading-snug">
                    {previewArxivPaper.title}
                  </h4>
                  <span class="text-[11px] text-[#a89984]">
                    {previewArxivPaper.authors.slice(0, 4).join(', ')} {previewArxivPaper.authors.length > 4 ? '等' : ''}
                  </span>
                </div>

                <div class="flex items-center gap-3 font-mono text-[10px] text-[#d5c4a1] pt-1 border-t border-[#3c3836]">
                  <span>{previewArxivPaper.sections.length} 個主要章節</span>
                  <span class="text-[#fe8019] flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                    已關聯官方 PDF
                  </span>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  on:click={handleImportArxivPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  匯入至文獻庫並開啟研讀
                </button>
              </div>
            {/if}
          </div>

        <!-- ==================== TAB PDF: LOCAL OFFLINE PDF PARSER ==================== -->
        {:else if activeTab === 'pdf'}
          <div class="flex flex-col gap-3.5">
            <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5 shadow-inner">
              <span class="material-symbols-outlined text-[20px] text-[#fe8019] shrink-0 mt-0.5">lock</span>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-[#ebdbb2] flex items-center gap-1.5">
                  100% 瀏覽器本機離線解析 (Zero-Server Privacy)
                  <span class="font-mono text-[10px] text-[#b8bb26] bg-[#282828] px-1.5 py-0.2 rounded border border-[#504945]">極致隱私</span>
                </span>
                <span class="text-[#a89984] leading-relaxed">
                  拖入任何學術論文或技術文獻 PDF，系統將在您的瀏覽器端直接由底層二進制流抽取大綱目錄、雙欄重排、去斷字並建立雙語伴讀工作台。文獻絕不離開您的裝置。
                </span>
              </div>
            </div>

            <!-- PDF Upload Drop Zone -->
            <div
              class="border-2 border-dashed {pdfDragOver ? 'border-[#fe8019] bg-[#fe8019]/10' : 'border-[#504945] hover:border-[#fe8019] bg-[#1d2021]'} p-6 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer relative"
              on:dragover|preventDefault={() => pdfDragOver = true}
              on:dragleave|preventDefault={() => pdfDragOver = false}
              on:drop|preventDefault={handlePdfDrop}
            >
              <input
                class="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                type="file"
                accept=".pdf,application/pdf"
                disabled={isParsingPdf}
                on:change={handlePdfInput}
              />
              <span class="material-symbols-outlined text-4xl text-[#fe8019]">picture_as_pdf</span>
              <span class="text-xs font-semibold text-[#ebdbb2]">
                {isParsingPdf ? '正在解析中，請稍候...' : '點擊選擇或直接拖曳 PDF 檔案至此'}
              </span>
              <span class="font-mono text-[10px] text-[#a89984]">
                支援 IEEE、NeurIPS、ACM、Nature 等雙欄與單欄論文排版格式
              </span>
            </div>

            {#if isParsingPdf}
              <!-- Progress Indicator -->
              <div class="p-3.5 bg-[#1d2021] border border-[#fe8019]/40 rounded-xl flex flex-col gap-2 shadow-md animate-fade-in">
                <div class="flex items-center justify-between font-mono text-[11px]">
                  <span class="text-[#fe8019] font-semibold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
                    {pdfParseStepText || '正在解析 PDF 文件...'}
                  </span>
                  <span class="text-[#fabd2f] font-bold">{pdfParsePercent}%</span>
                </div>
                <div class="w-full h-1.5 bg-[#282828] rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[#fe8019] to-[#fabd2f] transition-all duration-300 rounded-full"
                    style="width: {pdfParsePercent}%"
                  ></div>
                </div>
              </div>
            {/if}

            {#if pdfError}
              <div class="p-2.5 rounded bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] font-mono text-[11px] flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">error</span>
                <span>{pdfError}</span>
              </div>
            {/if}

            {#if previewPdfPaper}
              <!-- Preview Card -->
              <div class="p-4 bg-[#1d2021] border border-[#b8bb26] rounded-xl flex flex-col gap-3 shadow-lg animate-fade-in">
                <div class="flex items-center justify-between text-[11px] font-mono">
                  <span class="text-[#b8bb26] font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">check_circle</span>
                    已成功解析本機文獻結構
                  </span>
                  <span class="text-[#8ec07c] bg-[#8ec07c]/10 border border-[#8ec07c]/40 px-1.5 py-0.2 rounded">
                    純本機離線文獻
                  </span>
                </div>

                <!-- Editable Title -->
                <div class="flex flex-col gap-1">
                  <label for="pdf-preview-title" class="font-mono text-[10px] text-[#a89984]">文獻標題 (可直接修改確認):</label>
                  <input
                    id="pdf-preview-title"
                    type="text"
                    bind:value={previewPdfPaper.title}
                    class="bg-[#282828] border border-[#3c3836] text-[#ebdbb2] px-2.5 py-1.5 rounded text-xs font-serif font-bold focus:outline-none focus:border-[#fe8019]"
                  />
                </div>

                <!-- Meta row -->
                <div class="flex items-center gap-3 font-mono text-[10px] text-[#d5c4a1] pt-1 border-t border-[#3c3836]">
                  <span>{previewPdfPaper.sections.length} 個主要章節</span>
                  <span class="text-[#8ec07c]">{previewPdfPaper.authors.slice(0, 2).join(', ')}</span>
                  <span class="text-[#fe8019] flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                    已就緒原檔畫布
                  </span>
                </div>

                <!-- Outline Preview -->
                <div class="flex flex-col gap-1">
                  <span class="font-mono text-[10px] text-[#a89984]">辨識之章節目錄預覽：</span>
                  <div class="max-h-28 overflow-y-auto bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col gap-1 font-mono text-[11px] text-[#ebdbb2]">
                    {#each previewPdfPaper.sections.slice(0, 8) as sec}
                      <div class="flex items-center justify-between text-[#d5c4a1]">
                        <span class="truncate">§ {sec.title}</span>
                        <span class="text-[#a89984] text-[9px] shrink-0 ml-2">p.{sec.page || 1}</span>
                      </div>
                    {/each}
                    {#if previewPdfPaper.sections.length > 8}
                      <span class="text-[#a89984] text-[10px] italic">... 其餘 {previewPdfPaper.sections.length - 8} 個章節</span>
                    {/if}
                  </div>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  on:click={handleImportPdfPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  匯入至文獻庫並開啟雙語研讀
                </button>
              </div>
            {/if}
          </div>

        <!-- ==================== TAB BOOK: EPUB IMPORT ==================== -->
        {:else if activeTab === 'book'}
          <div class="flex flex-col gap-3.5">
            <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5">
              <span class="material-symbols-outlined text-[18px] text-[#8ec07c] shrink-0 mt-0.5">menu_book</span>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-[#ebdbb2]">EPUB 電子書無損解析引擎</span>
                <span class="text-[#a89984] leading-relaxed">
                  徹底告別 PDF 排版錯位與 Markdown 圖片破損！直接上傳或拖放本機 <code class="text-[#fabd2f]">.epub</code> 檔案，純前端秒級解開全書章節目錄樹，完整內嵌高畫質圖表與原始代碼縮排。
                </span>
              </div>
            </div>

            <!-- 本機 EPUB 檔案拖放上傳 -->
            <div class="flex flex-col gap-1.5">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2.5 transition-colors cursor-pointer {bookDragOver ? 'border-[#8ec07c] bg-[#8ec07c]/10' : 'border-[#504945] hover:border-[#8ec07c]/60 bg-[#1d2021]/50'}"
                on:dragover|preventDefault={() => bookDragOver = true}
                on:dragleave={() => bookDragOver = false}
                on:drop={handleEpubDrop}
                on:click={() => document.getElementById('epub-file-input')?.click()}
                on:keydown={(e) => e.key === 'Enter' && document.getElementById('epub-file-input')?.click()}
                tabindex="0"
                role="button"
              >
                <input
                  id="epub-file-input"
                  type="file"
                  accept=".epub"
                  class="hidden"
                  on:change={handleEpubFileInput}
                />
                <span class="material-symbols-outlined text-[36px] text-[#8ec07c]">file_open</span>
                <div class="flex flex-col items-center gap-0.5 text-center">
                  <span class="font-semibold text-[#ebdbb2] text-sm">拖曳 .epub 檔案至此處，或點擊選擇本機檔案</span>
                  <span class="text-[#a89984] text-[11px]">純前端本地秒級解析 · 完整提取全書章節、段落、代碼與高畫質圖表</span>
                </div>
              </div>
            </div>

            <!-- 解析進度條指示 -->
            {#if isParsingBook}
              <div class="bg-[#1d2021] border border-[#8ec07c]/40 p-3 rounded-lg flex flex-col gap-2 shadow-inner">
                <div class="flex items-center justify-between font-mono text-[11px]">
                  <span class="text-[#8ec07c] font-semibold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[14px] animate-spin">sync</span>
                    {bookParseStepText || '正在解析書籍結構...'}
                  </span>
                  <span class="text-[#fabd2f] font-bold">{bookParsePercent}%</span>
                </div>
                <div class="w-full bg-[#32302f] rounded-full h-1.5 overflow-hidden">
                  <div class="bg-[#8ec07c] h-1.5 transition-all duration-300 rounded-full" style="width: {bookParsePercent}%;"></div>
                </div>
              </div>
            {/if}

            <!-- 錯誤提示 -->
            {#if bookError}
              <div class="bg-[#fb4934]/10 border border-[#fb4934]/30 text-[#fb4934] p-3 rounded-lg flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px]">error</span>
                <span>{bookError}</span>
              </div>
            {/if}

            <!-- 預覽結果確認面板 -->
            {#if previewBookPaper}
              <div class="bg-[#1d2021] border border-[#8ec07c]/50 p-4 rounded-lg flex flex-col gap-3 shadow-md">
                <div class="flex items-start justify-between">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 bg-[#8ec07c]/20 text-[#8ec07c] font-mono text-[10px] font-bold rounded">
                        EPUB 解析完成
                      </span>
                    </div>
                    <h4 class="text-sm font-bold text-[#ebdbb2] leading-snug">{previewBookPaper.title}</h4>
                    <span class="text-[#a89984] text-[11px] font-mono">
                      作者：{previewBookPaper.authors?.join(', ') || '技術作者'} · 來源：{previewBookPaper.venue}
                    </span>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2 bg-[#282828] p-2.5 rounded border border-[#3c3836] font-mono text-center">
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">收錄章節</span>
                    <span class="text-xs font-bold text-[#8ec07c]">{previewBookPaper.sections.length} 章</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">總段落數</span>
                    <span class="text-xs font-bold text-[#fabd2f]">
                      {previewBookPaper.sections.reduce((acc, s) => acc + s.paragraphs.length, 0)} 段
                    </span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">高畫質圖表</span>
                    <span class="text-xs font-bold text-[#b8bb26]">{previewBookPaper.figureList?.length || 0} 張</span>
                  </div>
                </div>

                <!-- 目錄大綱前 8 章預覽 -->
                <div class="flex flex-col gap-1 font-mono text-[11px]">
                  <span class="text-[#a89984] text-[10px]">章節目錄預覽：</span>
                  <div class="max-h-28 overflow-y-auto flex flex-col gap-1 bg-[#282828]/60 p-2 rounded border border-[#3c3836]">
                    {#each previewBookPaper.sections.slice(0, 8) as sec, idx}
                      <div class="flex items-center gap-1.5 text-[#ebdbb2] text-[10px] truncate">
                        <span class="text-[#8ec07c] font-bold">#{idx + 1}</span>
                        <span class="truncate">{sec.title}</span>
                      </div>
                    {/each}
                    {#if previewBookPaper.sections.length > 8}
                      <span class="text-[#a89984] text-[9px] italic">... 還有 {previewBookPaper.sections.length - 8} 個章節</span>
                    {/if}
                  </div>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#8ec07c] hover:bg-[#b8bb26] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  on:click={handleImportBookPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  收錄全書至文獻庫並開啟閱讀
                </button>
              </div>
            {/if}
          </div>

        <!-- ==================== TAB 1: WEB URL IMPORT ==================== -->
        {:else if activeTab === 'web'}
          <div class="flex flex-col gap-3.5">
            <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5">
              <span class="material-symbols-outlined text-[18px] text-[#8ec07c] shrink-0 mt-0.5">smart_toy</span>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-[#ebdbb2]">智慧 Reader 網頁解析引擎</span>
                <span class="text-[#a89984] leading-relaxed">
                  輸入任何技術專文或研究部落格網址，系統自動萃取標題、過濾雜訊，並依標題切分章節目錄與段落。
                </span>
              </div>
            </div>

            <!-- URL Input Bar -->
            <div class="flex flex-col gap-1.5">
              <label for="import-web-url" class="font-mono text-[11px] text-[#d5c4a1]">文章或論文網址 (URL)</label>
              <div class="flex items-center gap-2">
                <input
                  id="import-web-url"
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="url"
                  placeholder="https://transformer-circuits.pub/... 或 https://arxiv.org/html/..."
                  bind:value={webUrl}
                  on:keydown={(e) => e.key === 'Enter' && handleFetchWeb()}
                />
                <button
                  type="button"
                  class="px-2.5 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  title="從剪貼簿貼上網址"
                  on:click={handlePasteWebUrl}
                >
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">content_paste</span>
                  <span class="font-mono text-[11px]">貼上</span>
                </button>
                <button
                  class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
                  disabled={isFetchingWeb}
                  on:click={handleFetchWeb}
                >
                  {#if isFetchingWeb}
                    <span class="material-symbols-outlined text-[15px] animate-spin">refresh</span>
                    <span>抓取解析中...</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px]">download</span>
                    <span>抓取並解析</span>
                  {/if}
                </button>
              </div>
              {#if webError}
                <span class="text-[#fb4934] font-mono text-[11px] mt-0.5">{webError}</span>
              {/if}
            </div>

            <!-- Sample URL Recommendations -->
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <span class="font-mono text-[10px] text-[#a89984]">推薦示範網址：</span>
              <button
                class="font-mono text-[10px] bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] px-2 py-0.5 rounded transition-colors"
                on:click={() => setDemoUrl('https://transformer-circuits.pub/2021/framework/index.html')}
              >
                Anthropic Circuits 專文
              </button>
              <button
                class="font-mono text-[10px] bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] text-[#8ec07c] px-2 py-0.5 rounded transition-colors"
                on:click={() => setDemoUrl('https://distill.pub/2016/augmented-rnns/')}
              >
                Distill: Augmented RNNs
              </button>
            </div>

            <!-- Parsed Preview Card -->
            {#if previewWebPaper}
              <div class="mt-2 bg-[#1d2021] border border-[#504945] p-3.5 rounded-xl flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] bg-[#8ec07c]/15 text-[#8ec07c] border border-[#8ec07c]/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    解析完成 · Web Article
                  </span>
                  <span class="font-mono text-[10px] text-[#a89984]">
                    已切分 {previewWebPaper.sections.length} 個章節大綱
                  </span>
                </div>

                <h4 class="text-sm font-bold text-[#ebdbb2] leading-snug">
                  {previewWebPaper.title}
                </h4>

                <p class="text-[11px] text-[#d5c4a1] line-clamp-2">
                  {previewWebPaper.abstract.english}
                </p>

                <div class="pt-2 border-t border-[#3c3836] flex items-center justify-between">
                  <span class="font-mono text-[10px] text-[#a89984] truncate max-w-[320px]">
                    來源：{previewWebPaper.sourceUrl}
                  </span>
                  <button
                    class="px-3.5 py-1.5 bg-[#b8bb26] hover:bg-[#98971a] text-[#1d2021] font-semibold rounded-lg flex items-center gap-1 transition-colors"
                    on:click={handleImportWebArticle}
                  >
                    <span class="material-symbols-outlined text-[15px]">auto_stories</span>
                    立即載入閱讀
                  </button>
                </div>
              </div>
            {/if}
          </div>

        <!-- ==================== TAB 2: PRESET LIBRARY ==================== -->
        {:else if activeTab === 'preset'}
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-[#3c3836]">
              <span class="font-mono text-[11px] text-[#a89984]">點擊任一手冊或經典文獻重新載入 (Fallback 恢復)：</span>
              <button
                type="button"
                class="px-2.5 py-1 bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019]/60 text-[#fabd2f] text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                on:click={handleRestoreAllPresets}
                title="一鍵將全部 4 篇預設核心論文與手冊重新補齊至本地文獻庫"
              >
                <span class="material-symbols-outlined text-[14px]">history</span>
                <span>一鍵還原全部核心文獻</span>
              </button>
            </div>

            <!-- Preset 0: MUGEN YOMU Official Operating Manual -->
            <div class="bg-[#1d2021] border border-[#fe8019]/60 hover:border-[#fe8019] p-3.5 rounded-xl flex flex-col gap-2 transition-all shadow-md">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] bg-[#fe8019]/20 border border-[#fe8019]/50 text-[#fe8019] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[12px]">menu_book</span> {userManualDocument.venue}
                  </span>
                  <span class="font-mono text-[10px] text-[#fabd2f] font-semibold">★ 官方說明書</span>
                </div>
                <button
                  class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded text-xs transition-colors flex items-center gap-1 shadow-sm"
                  on:click={() => handleSelectPreset(userManualDocument)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> 載入研讀
                </button>
              </div>

              <h4 class="text-sm font-bold text-[#ebdbb2] font-serif">
                {userManualDocument.title}
              </h4>
              <p class="text-[#a89984] text-[11px]">
                {userManualDocument.authors.join(', ')}
              </p>
              <p class="text-[#d5c4a1] text-xs leading-relaxed bg-[#282828] p-2 rounded border border-[#3c3836]">
                {userManualDocument.abstract.chineseSummary}
              </p>
            </div>

            <!-- Preset 1: Attention Is All You Need -->
            <div class="bg-[#1d2021] border border-[#3c3836] hover:border-[#fe8019] p-3.5 rounded-xl flex flex-col gap-2 transition-all">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-2 py-0.5 rounded font-semibold">
                    {attentionPaper.venue}
                  </span>
                  <span class="font-mono text-[10px] text-[#fabd2f]">Citations: {attentionPaper.citations}</span>
                </div>
                <button
                  class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded text-xs transition-colors flex items-center gap-1"
                  on:click={() => handleSelectPreset(attentionPaper)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> 載入研讀
                </button>
              </div>

              <h4 class="text-sm font-bold text-[#ebdbb2] font-serif">
                {attentionPaper.title}
              </h4>
              <p class="text-[#a89984] text-[11px]">
                {attentionPaper.authors.join(', ')}
              </p>
              <p class="text-[#d5c4a1] text-xs leading-relaxed bg-[#282828] p-2 rounded border border-[#3c3836]">
                {attentionPaper.abstract.chineseSummary}
              </p>
            </div>

            <!-- Preset 2: ResNet -->
            <div class="bg-[#1d2021] border border-[#3c3836] hover:border-[#fe8019] p-3.5 rounded-xl flex flex-col gap-2 transition-all">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] bg-[#8ec07c]/15 border border-[#8ec07c]/40 text-[#8ec07c] px-2 py-0.5 rounded font-semibold">
                    {resnetPaper.venue}
                  </span>
                  <span class="font-mono text-[10px] text-[#fabd2f]">Citations: {resnetPaper.citations}</span>
                </div>
                <button
                  class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded text-xs transition-colors flex items-center gap-1"
                  on:click={() => handleSelectPreset(resnetPaper)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> 載入研讀
                </button>
              </div>

              <h4 class="text-sm font-bold text-[#ebdbb2] font-serif">
                {resnetPaper.title}
              </h4>
              <p class="text-[#a89984] text-[11px]">
                {resnetPaper.authors.join(', ')}
              </p>
              <p class="text-[#d5c4a1] text-xs leading-relaxed bg-[#282828] p-2 rounded border border-[#3c3836]">
                {resnetPaper.abstract.chineseSummary}
              </p>
            </div>

            <!-- Preset 3: Anthropic Circuits (Web Article) -->
            <div class="bg-[#1d2021] border border-[#3c3836] hover:border-[#fe8019] p-3.5 rounded-xl flex flex-col gap-2 transition-all">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold">
                    [Web] {anthropicCircuitsWeb.venue}
                  </span>
                  <span class="font-mono text-[10px] text-[#fabd2f]">Mechanistic Interpretability</span>
                </div>
                <button
                  class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded text-xs transition-colors flex items-center gap-1"
                  on:click={() => handleSelectPreset(anthropicCircuitsWeb)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> 載入研讀
                </button>
              </div>

              <h4 class="text-sm font-bold text-[#ebdbb2] font-serif">
                {anthropicCircuitsWeb.title}
              </h4>
              <p class="text-[#a89984] text-[11px]">
                {anthropicCircuitsWeb.authors.join(', ')}
              </p>
              <p class="text-[#d5c4a1] text-xs leading-relaxed bg-[#282828] p-2 rounded border border-[#3c3836]">
                {anthropicCircuitsWeb.abstract.chineseSummary}
              </p>
            </div>
          </div>

        <!-- ==================== TAB 3: PASTE TEXT / MARKDOWN ==================== -->
        {:else if activeTab === 'paste'}
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <label for="import-paste-title" class="font-mono text-[11px] text-[#d5c4a1]">文獻標題 (Title)</label>
                <button
                  type="button"
                  class="text-[10px] font-mono text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 cursor-pointer transition-colors"
                  title="貼上剪貼簿內容至標題"
                  on:click={handlePasteTitle}
                >
                  <span class="material-symbols-outlined text-[12px] text-[#fe8019]">content_paste</span>
                  <span>貼上標題</span>
                </button>
              </div>
              <input
                id="import-paste-title"
                class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] text-xs"
                type="text"
                placeholder="例如：Self-Attention Mechanism Explained"
                bind:value={pasteTitle}
              />
            </div>

            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <label for="import-paste-content" class="font-mono text-[11px] text-[#d5c4a1]">正文內容或 Markdown</label>
                  <label class="flex items-center gap-1 cursor-pointer text-[10px] font-mono text-[#b8bb26] bg-[#b8bb26]/10 px-1.5 py-0.5 rounded border border-[#b8bb26]/30 hover:bg-[#b8bb26]/20 transition-colors" title="自動將 PDF 複製之硬換行、斷詞連字號 (如 Sys-tem) 與連字分離修復為乾淨段落">
                    <input type="checkbox" bind:checked={autoSanitizePaste} class="rounded text-[#fe8019] focus:ring-0 cursor-pointer w-3 h-3" />
                    <span>自動淨化 PDF 換行與連字號</span>
                  </label>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="text-[10px] font-mono text-[#ebdbb2] bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                    title="從剪貼簿貼上完整文章內容"
                    on:click={handlePasteContent}
                  >
                    <span class="material-symbols-outlined text-[13px] text-[#fe8019]">content_paste_go</span>
                    <span>貼上剪貼簿內容</span>
                  </button>
                  {#if pasteContent.trim()}
                    <button
                      type="button"
                      class="text-[10px] font-mono text-[#fe8019] hover:text-[#fabd2f] flex items-center gap-0.5 hover:underline cursor-pointer"
                      on:click={handleCleanPasteText}
                      title="立即在文字框內預覽淨化後的排版"
                    >
                      <span class="material-symbols-outlined text-[13px]">cleaning_services</span>
                      預先淨化文字框
                    </button>
                  {/if}
                </div>
              </div>
              <textarea
                id="import-paste-content"
                class="w-full h-44 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] p-3 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs leading-relaxed resize-none placeholder:text-[#a89984]/50"
                placeholder="# 1. Introduction&#10;Deep learning has evolved rapidly...&#10;&#10;## 2. Methodology&#10;We propose a novel framework..."
                bind:value={pasteContent}
              ></textarea>
            </div>

            {#if pasteError}
              <span class="text-[#fb4934] font-mono text-[11px]">{pasteError}</span>
            {/if}

            <button
              class="w-full py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
              on:click={handleParsePaste}
            >
              <span class="material-symbols-outlined text-[15px]">auto_fix_high</span>
              智能解析並開啟研讀
            </button>
          </div>

        <!-- ==================== TAB 4: JSON UPLOAD ==================== -->
        {:else if activeTab === 'upload'}
          <div class="flex flex-col gap-3">
            <div class="border-2 border-dashed border-[#504945] hover:border-[#fe8019] bg-[#1d2021] p-6 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer relative">
              <input
                class="absolute inset-0 opacity-0 cursor-pointer"
                type="file"
                accept=".json"
                on:change={handleFileUpload}
              />
              <span class="material-symbols-outlined text-3xl text-[#fabd2f]">upload_file</span>
              <span class="text-xs font-semibold text-[#ebdbb2]">點擊選擇或拖曳 MUGEN Paper JSON 檔案至此</span>
              <span class="font-mono text-[10px] text-[#a89984]">符合標準文獻 Schema（包含章節、段落與伴讀知識庫）</span>
            </div>

            {#if uploadError}
              <span class="text-[#fb4934] font-mono text-[11px]">{uploadError}</span>
            {/if}

            {#if previewUploadPaper}
              <div class="bg-[#1d2021] border border-[#b8bb26]/50 p-3 rounded-lg flex items-center justify-between">
                <div class="flex flex-col">
                  <span class="font-semibold text-[#ebdbb2] text-xs">{previewUploadPaper.title}</span>
                  <span class="font-mono text-[10px] text-[#a89984]">{previewUploadPaper.sections.length} 個章節</span>
                </div>
                <button
                  class="px-3.5 py-1.5 bg-[#b8bb26] hover:bg-[#98971a] text-[#1d2021] font-semibold rounded text-xs transition-colors"
                  on:click={handleImportUploadedPaper}
                >
                  匯入至文獻庫
                </button>
              </div>
            {/if}
          </div>
        {/if}

      </div>

      <!-- Modal Footer -->
      <div class="p-3.5 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-between">
        <span class="font-mono text-[10px] text-[#a89984]">
          本機文獻庫目前已收錄 {currentLibrary.length} 篇作品
        </span>
        <button
          class="px-4 py-1.5 rounded-lg text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          on:click={close}
        >
          關閉
        </button>
      </div>

    </div>
  </div>
{/if}
