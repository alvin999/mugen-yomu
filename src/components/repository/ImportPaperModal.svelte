<script lang="ts">
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
  import { getProxiedPdfUrl } from '../../services/pdfService';
  import { getStoredApiKey } from '../../services/cognitiveDispatcher';
  import { cleanPaperText } from '../../utils/paperTextSanitizer';
  import { pdfViewerStore } from '../../stores/pdfViewerStore';
  import { get } from 'svelte/store';
  import { t } from '../../stores/localeStore';

  interface Props {
    isOpen?: boolean;
    currentLibrary?: PaperDocument[];
    onpaperLoaded?: (data: { paper: PaperDocument; library: PaperDocument[] }) => void;
    onopenSettings?: () => void;
    onclose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    currentLibrary = [],
    onpaperLoaded,
    onopenSettings,
    onclose
  }: Props = $props();

  let hasGeminiKey = $derived(typeof window !== 'undefined' ? Boolean(getStoredApiKey('google') || getStoredApiKey('gemini')) : false);

  let activeTab = $state<'arxiv' | 'pdf' | 'book' | 'web' | 'preset' | 'paste' | 'upload'>('arxiv');

  // Tab Book: EPUB Local File Import State
  let isParsingBook = $state(false);
  let bookParsePercent = $state(0);
  let bookParseStepText = $state('');
  let bookError = $state('');
  let previewBookPaper = $state<PaperDocument | null>(null);
  let bookDragOver = $state(false);

  // Tab 0: arXiv ID Import State
  let arxivInput = $state('1706.03762');
  let isFetchingArxiv = $state(false);
  let arxivError = $state('');
  let previewArxivPaper = $state<PaperDocument | null>(null);

  // Tab 1: Web URL State
  let webUrl = $state('https://transformer-circuits.pub/2021/framework/index.html');
  let isFetchingWeb = $state(false);
  let webError = $state('');
  let previewWebPaper = $state<PaperDocument | null>(null);
  let botBlockedInfo = $state<{ siteName: string; url: string } | null>(null);


  // Tab 3: Paste Text State
  let pasteTitle = $state('');
  let pasteContent = $state('');
  let pasteError = $state('');
  let autoSanitizePaste = $state(true);

  // Tab PDF: Local Offline & Online PDF Parser State
  let pdfUrlInput = $state('');
  let isParsingPdf = $state(false);
  let pdfParsePercent = $state(0);
  let pdfParseStepText = $state('');
  let pdfError = $state('');
  let previewPdfPaper = $state<PaperDocument | null>(null);
  let pdfDragOver = $state(false);

  // Tab 4: File Upload State
  let uploadJsonText = $state('');
  let uploadError = $state('');
  let previewUploadPaper = $state<PaperDocument | null>(null);

  // --- Clipboard Helper & Paste Handlers ---
  let clipboardToast = $state('');
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
      showToast(get(t)('import.clipboardDenied'));
      return null;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast(get(t)('import.clipboardEmpty'));
        return null;
      }
      return text;
    } catch (err: any) {
      showToast(get(t)('import.clipboardReadFail'));
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
      showToast(get(t)('import.pastedArxiv', { id: arxivInput }));
    } else {
      arxivInput = cleaned;
      showToast(get(t)('import.pastedFromClipboard'));
    }
    arxivError = '';
  }

  async function handlePasteWebUrl() {
    const text = await getClipboardText();
    if (!text) return;
    webUrl = text.trim();
    webError = '';
    showToast(get(t)('import.pastedWebUrl'));
  }

  async function handlePasteTitle() {
    const text = await getClipboardText();
    if (!text) return;
    pasteTitle = text.trim().replace(/^#+\s*/, '');
    showToast(get(t)('import.pastedTitle'));
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
    showToast(get(t)('import.pastedContent', { count: contentToUse.length.toLocaleString() }));
  }

  function close() {
    isOpen = false;
    onclose?.();
  }

  // --- Tab 0: arXiv Fetch Logic ---
  async function handleFetchArxiv() {
    if (!arxivInput.trim()) {
      arxivError = get(t)('import.arxivInvalid');
      return;
    }
    arxivError = '';
    isFetchingArxiv = true;
    previewArxivPaper = null;

    try {
      const doc = await fetchArxivDocument(arxivInput);
      previewArxivPaper = doc;
    } catch (err: any) {
      arxivError = get(t)('import.arxivFetchFail', { error: err.message || 'Error' });
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
      webError = get(t)('import.webInvalidUrl');
      return;
    }
    const trimmed = webUrl.trim();
    if (trimmed.toLowerCase().endsWith('.pdf') || trimmed.includes('/pdf/')) {
      activeTab = 'pdf';
      pdfUrlInput = trimmed;
      showToast(get(t)('import.switchedToPdf'));
      handleFetchPdfUrl();
      return;
    }

    webError = '';
    botBlockedInfo = null;
    isFetchingWeb = true;
    previewWebPaper = null;

    try {
      const doc = await fetchWebArticle(webUrl);
      previewWebPaper = doc;
    } catch (err: any) {
      if (err?.isBotChallenge) {
        botBlockedInfo = {
          siteName: err.siteName || '目標網站',
          url: webUrl
        };
      } else {
        webError = get(t)('import.webFetchFail', { error: err.message || 'Error' });
      }
    } finally {
      isFetchingWeb = false;
    }
  }

  function handleOpenOriginalUrl() {
    if (webUrl) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function handleSwitchToPaste() {
    if (webUrl) {
      try {
        const u = new URL(webUrl);
        pasteTitle = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      } catch {
        pasteTitle = '網頁文章';
      }
    }
    activeTab = 'paste';
  }

  function handleSwitchToPdf() {
    activeTab = 'pdf';
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
    onpaperLoaded?.({ paper: userManualDocument, library: updated });
    clipboardToast = get(t)('import.restorePresetSuccess');
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
      pasteError = get(t)('import.pasteEmptyError');
      return;
    }
    pasteError = '';
    const title = pasteTitle.trim() || get(t)('import.defaultPasteDocTitle');
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
          throw new Error(get(t)('import.missingRequiredFields'));
        }
        if (!parsed.id) parsed.id = `custom_${Date.now()}`;
        if (!parsed.type) parsed.type = 'paper';
        previewUploadPaper = parsed as PaperDocument;
        uploadError = '';
      } catch (err: any) {
        uploadError = get(t)('import.jsonParseFail', { error: err.message || 'Error' });
        previewUploadPaper = null;
      }
    };
    reader.readAsText(file);
  }

  // --- Tab PDF: Local Offline & Online PDF Parser Logic ---
  let currentPdfFile = $state<File | null>(null);

  async function handlePastePdfUrl() {
    const text = await getClipboardText();
    if (!text) return;
    pdfUrlInput = text.trim();
    pdfError = '';
    showToast(get(t)('import.pastedPdfUrl'));
  }

  async function handleFetchPdfUrl() {
    let url = pdfUrlInput.trim();
    if (!url) {
      pdfError = get(t)('import.pdfInvalidUrl');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    pdfError = '';
    isParsingPdf = true;
    pdfParsePercent = 10;
    pdfParseStepText = get(t)('import.pdfDownloadingProxy');
    previewPdfPaper = null;

    try {
      const proxyUrl = getProxiedPdfUrl(url);
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        throw new Error(get(t)('import.remoteConnectionError', { status: res.status, statusText: res.statusText }));
      }
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error(get(t)('import.pdfEmptyContent'));
      }

      const fileName = url.split('/').pop()?.split('?')[0] || get(t)('import.remotePdfTitle');
      const paper = await parsePdfToDocument(
        arrayBuffer,
        fileName,
        (pct, msg) => {
          pdfParsePercent = pct;
          pdfParseStepText = msg;
        }
      );

      paper.pdfUrl = url;
      currentPdfFile = new File([arrayBuffer], `${paper.title}.pdf`, { type: 'application/pdf' });
      previewPdfPaper = paper;
    } catch (err: any) {
      console.error('PDF 解析失敗:', err);
      pdfError = get(t)('import.pdfInterrupt', { error: err?.message || 'Download/parse error' });
    } finally {
      isParsingPdf = false;
    }
  }

  async function handlePdfFile(file: File | null) {
    if (!file) return;
    currentPdfFile = file;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      pdfError = get(t)('import.selectPdfHint');
      return;
    }
    pdfError = '';
    isParsingPdf = true;
    pdfParsePercent = 0;
    pdfParseStepText = get(t)('import.launchingPdfEngine');
    previewPdfPaper = null;

    try {
      const paper = await parsePdfToDocument(
        file,
        file.name,
        (pct, msg) => {
          pdfParsePercent = pct;
          pdfParseStepText = msg;
        }
      );
      previewPdfPaper = paper;
    } catch (err: any) {
      console.error('PDF 解析失敗:', err);
      pdfError = get(t)('import.pdfInterrupt', { error: err?.message || get(t)('import.unknownError') });
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

  async function handleImportPdfPaper() {
    if (!previewPdfPaper) return;
    if (currentPdfFile) {
      await pdfViewerStore.loadLocalPdf(currentPdfFile, previewPdfPaper.id);
    }
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
        bookError = get(t)('import.dropEpubFileHint');
      }
    }
  }

  async function parseEpubFile(file: File) {
    isParsingBook = true;
    bookError = '';
    previewBookPaper = null;
    bookParsePercent = 10;
    bookParseStepText = get(t)('import.readingLocalEpubFile');

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
      bookError = err?.message || get(t)('import.epubParseFail');
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

    onpaperLoaded?.({ paper, library: updatedLibrary });
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
            <h3 class="text-sm font-bold text-[#ebdbb2] tracking-wide">{$t('import.title')}</h3>
            <span class="font-mono text-[10px] text-[#a89984]">{$t('import.subtitle')}</span>
          </div>
        </div>
        <button
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          onclick={close}
          title={$t('settings.close')}
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Tab Switcher -->
      <div class="px-5 pt-3 bg-[#1d2021]/80 border-b border-[#3c3836] flex items-center gap-1.5 overflow-x-auto">
        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'arxiv' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'arxiv'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">auto_stories</span>
          <span>{$t('import.tabArxiv')}</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'pdf' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'pdf'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">picture_as_pdf</span>
          <span>{$t('import.tabPdf')}</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'book' ? 'bg-[#282828] text-[#8ec07c] border-t-2 border-[#8ec07c] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'book'}
        >
          <span class="material-symbols-outlined text-[15px] text-[#8ec07c]">menu_book</span>
          <span>{$t('import.tabEpub')}</span>
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'web' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'web'}
        >
          <span class="material-symbols-outlined text-[15px]">language</span>
          {$t('import.tabWeb')}
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'preset' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'preset'}
        >
          <span class="material-symbols-outlined text-[15px]">stars</span>
          {$t('import.tabPreset')}
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'paste' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'paste'}
        >
          <span class="material-symbols-outlined text-[15px]">content_paste</span>
          {$t('import.tabPaste')}
        </button>

        <button
          class="px-3.5 py-2 font-mono text-xs rounded-t-lg transition-colors flex items-center gap-1.5 {activeTab === 'upload' ? 'bg-[#282828] text-[#fe8019] border-t-2 border-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]/50'}"
          onclick={() => activeTab = 'upload'}
        >
          <span class="material-symbols-outlined text-[15px]">upload_file</span>
          {$t('import.tabUpload')}
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
                  {$t('import.arxivFeature')}
                  <span class="font-mono text-[10px] text-[#fabd2f] bg-[#282828] px-1.5 py-0.2 rounded border border-[#504945]">SVG / WebP</span>
                </span>
                <span class="text-[#a89984] leading-relaxed">
                  {$t('import.arxivFeatureDesc')}
                </span>
              </div>
            </div>

            <!-- arXiv ID Input -->
            <div class="flex flex-col gap-1.5">
              <label for="import-arxiv-input" class="font-mono text-[11px] text-[#d5c4a1] flex items-center justify-between">
                <span>{$t('import.arxivIdLabel')}</span>
                <span class="text-[#a89984]">1706.03762 / https://arxiv.org/abs/...</span>
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="import-arxiv-input"
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="text"
                  placeholder="1706.03762"
                  bind:value={arxivInput}
                  onkeydown={(e) => e.key === 'Enter' && handleFetchArxiv()}
                />
                <button
                  type="button"
                  class="px-2.5 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  title={$t('import.pasteTooltip')}
                  onclick={handlePasteArxiv}
                >
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">content_paste</span>
                  <span class="font-mono text-[11px]">{$t('import.pasteBtn')}</span>
                </button>
                <button
                  class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                  disabled={isFetchingArxiv}
                  onclick={handleFetchArxiv}
                >
                  {#if isFetchingArxiv}
                    <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
                    <span>{$t('import.loadingArxiv')}</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px]">download</span>
                    <span>{$t('import.fetchPaper')}</span>
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
              <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">{$t('import.popularArxiv')}</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  onclick={() => setDemoArxiv('1706.03762')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  1706.03762 (Attention Is All You Need)
                </button>
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  onclick={() => setDemoArxiv('1512.03385')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  1512.03385 (ResNet)
                </button>
                <button
                  class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                  onclick={() => setDemoArxiv('2005.14165')}
                >
                  <span class="material-symbols-outlined text-[11px]">bolt</span>
                  2005.14165 (GPT-3)
                </button>
              </div>
            </div>

            <!-- Preview Card for arXiv -->
            {#if previewArxivPaper}
              <div class="mt-1 p-3.5 bg-[#1d2021] border border-[#fabd2f] rounded-xl flex flex-col gap-2.5 shadow-lg animate-fade-in">
                <div class="flex items-center justify-between text-[11px] font-mono">
                  <span class="text-[#b8bb26] font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">check_circle</span>
                    {$t('import.parsedArxivSuccess')}
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
                    {previewArxivPaper.authors.slice(0, 4).join(', ')} {previewArxivPaper.authors.length > 4 ? '...' : ''}
                  </span>
                </div>

                <div class="flex items-center gap-3 font-mono text-[10px] text-[#d5c4a1] pt-1 border-t border-[#3c3836]">
                  <span>{previewArxivPaper.sections.length} {$t('repo.panel.sectionsUnit')}</span>
                  <span class="text-[#fe8019] flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                    {$t('import.associatedPdf')}
                  </span>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  onclick={handleImportArxivPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  {$t('import.importAndStudy')}
                </button>
              </div>
            {/if}
          </div>

        <!-- ==================== TAB PDF: LOCAL & ONLINE PDF PARSER ==================== -->
        {:else if activeTab === 'pdf'}
          <div class="flex flex-col gap-3.5">
            <!-- Online PDF URL Input -->
            <div class="flex flex-col gap-1.5">
              <label for="import-pdf-url-input" class="font-mono text-[11px] text-[#d5c4a1] flex items-center justify-between">
                <span>{$t('import.onlinePdfLabel')}</span>
                <span class="text-[#a89984]">{$t('import.onlinePdfDesc')}</span>
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="import-pdf-url-input"
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="text"
                  placeholder="https://arxiv.org/pdf/... .pdf"
                  bind:value={pdfUrlInput}
                  onkeydown={(e) => e.key === 'Enter' && handleFetchPdfUrl()}
                />
                <button
                  type="button"
                  class="px-2.5 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  title={$t('import.pasteTooltip')}
                  onclick={handlePastePdfUrl}
                >
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">content_paste</span>
                  <span class="font-mono text-[11px]">{$t('import.pasteBtn')}</span>
                </button>
                <button
                  class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                  disabled={isParsingPdf}
                  onclick={handleFetchPdfUrl}
                >
                  {#if isParsingPdf && pdfUrlInput}
                    <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
                    <span>{$t('import.parsing')}</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px]">download</span>
                    <span>{$t('import.downloadAndParse')}</span>
                  {/if}
                </button>
              </div>
            </div>

            <!-- 分隔線 -->
            <div class="flex items-center gap-3 my-0.5">
              <div class="flex-1 h-px bg-[#3c3836]"></div>
              <span class="text-[10px] font-mono text-[#a89984]">{$t('import.orLocalFile')}</span>
              <div class="flex-1 h-px bg-[#3c3836]"></div>
            </div>

            <!-- PDF Upload Drop Zone -->
            <div
              class="border-2 border-dashed {pdfDragOver ? 'border-[#fe8019] bg-[#fe8019]/10' : 'border-[#504945] hover:border-[#fe8019] bg-[#1d2021]'} p-6 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer relative"
              role="region"
              aria-label="PDF dropzone"
              ondragover={(e) => { e.preventDefault(); pdfDragOver = true; }}
              ondragleave={(e) => { e.preventDefault(); pdfDragOver = false; }}
              ondrop={handlePdfDrop}
            >
              <input
                class="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                type="file"
                accept=".pdf,application/pdf"
                disabled={isParsingPdf}
                onchange={handlePdfInput}
              />
              <span class="material-symbols-outlined text-4xl text-[#fe8019]">picture_as_pdf</span>
              <span class="text-xs font-semibold text-[#ebdbb2]">
                {isParsingPdf ? $t('import.pdfDropzoneParsing') : $t('import.pdfDropzone')}
              </span>
              <span class="font-mono text-[10px] text-[#a89984]">
                {$t('import.pdfFormatHint')}
              </span>
            </div>

            {#if isParsingPdf}
              <!-- Progress Indicator -->
              <div class="p-3.5 bg-[#1d2021] border border-[#fe8019]/40 rounded-xl flex flex-col gap-2 shadow-md animate-fade-in">
                <div class="flex items-center justify-between font-mono text-[11px]">
                  <span class="text-[#fe8019] font-semibold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
                    {pdfParseStepText || $t('import.parsing')}
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
              <div class="p-3 rounded-lg bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] font-mono text-[11px] flex flex-col gap-2 animate-fade-in">
                <div class="flex items-start gap-2">
                  <span class="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                  <span class="leading-relaxed">{pdfError}</span>
                </div>
                {#if currentPdfFile}
                  <div class="flex items-center gap-2 pt-2 border-t border-[#fb4934]/20">
                    <button
                      class="px-2.5 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#b8bb26] text-[#b8bb26] rounded text-[11px] font-sans font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      onclick={() => handlePdfFile(currentPdfFile)}
                    >
                      <span class="material-symbols-outlined text-[13px]">refresh</span>
                      {$t('search.reindex')}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

            {#if previewPdfPaper}
              <!-- Preview Card -->
              <div class="p-4 bg-[#1d2021] border border-[#b8bb26] rounded-xl flex flex-col gap-3 shadow-lg animate-fade-in">
                <div class="flex items-center justify-between text-[11px] font-mono">
                  <span class="text-[#b8bb26] font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">check_circle</span>
                    {$t('import.parsedPdfSuccess')}
                  </span>
                  <span class="text-[#8ec07c] bg-[#8ec07c]/10 border border-[#8ec07c]/40 px-1.5 py-0.2 rounded">
                    {$t('import.offlineLocalPaper')}
                  </span>
                </div>

                <!-- Editable Title -->
                <div class="flex flex-col gap-1">
                  <label for="pdf-preview-title" class="font-mono text-[10px] text-[#a89984]">{$t('import.paperTitleLabel')}</label>
                  <input
                    id="pdf-preview-title"
                    type="text"
                    bind:value={previewPdfPaper.title}
                    class="bg-[#282828] border border-[#3c3836] text-[#ebdbb2] px-2.5 py-1.5 rounded text-xs font-serif font-bold focus:outline-none focus:border-[#fe8019]"
                  />
                </div>

                <!-- Meta row -->
                <div class="flex items-center gap-3 font-mono text-[10px] text-[#d5c4a1] pt-1 border-t border-[#3c3836]">
                  <span>{previewPdfPaper.sections.length} {$t('repo.panel.sectionsUnit')}</span>
                  <span class="text-[#8ec07c]">{previewPdfPaper.authors.slice(0, 2).join(', ')}</span>
                  <span class="text-[#fe8019] flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                    {$t('import.pdfCanvasReady')}
                  </span>
                </div>

                <!-- Outline Preview -->
                <div class="flex flex-col gap-1">
                  <span class="font-mono text-[10px] text-[#a89984]">{$t('import.sectionsOutlinePreview')}</span>
                  <div class="max-h-28 overflow-y-auto bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col gap-1 font-mono text-[11px] text-[#ebdbb2]">
                    {#each previewPdfPaper.sections.slice(0, 8) as sec}
                      <div class="flex items-center justify-between text-[#d5c4a1]">
                        <span class="truncate">§ {sec.title}</span>
                        <span class="text-[#a89984] text-[9px] shrink-0 ml-2">p.{sec.page || 1}</span>
                      </div>
                    {/each}
                    {#if previewPdfPaper.sections.length > 8}
                      <span class="text-[#a89984] text-[10px] italic">... {previewPdfPaper.sections.length - 8}</span>
                    {/if}
                  </div>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  onclick={handleImportPdfPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  {$t('import.importAndBilingual')}
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
                <span class="font-semibold text-[#ebdbb2]">{$t('import.epubEngineTitle')}</span>
                <span class="text-[#a89984] leading-relaxed">
                  {$t('import.epubEngineDesc')}
                </span>
              </div>
            </div>

            <!-- 本機 EPUB 檔案拖放上傳 -->
            <div class="flex flex-col gap-1.5">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2.5 transition-colors cursor-pointer {bookDragOver ? 'border-[#8ec07c] bg-[#8ec07c]/10' : 'border-[#504945] hover:border-[#8ec07c]/60 bg-[#1d2021]/50'}"
                ondragover={(e) => { e.preventDefault(); bookDragOver = true; }}
                ondragleave={() => bookDragOver = false}
                ondrop={handleEpubDrop}
                onclick={() => document.getElementById('epub-file-input')?.click()}
                onkeydown={(e) => e.key === 'Enter' && document.getElementById('epub-file-input')?.click()}
                tabindex="0"
                role="button"
              >
                <input
                  id="epub-file-input"
                  type="file"
                  accept=".epub"
                  class="hidden"
                  onchange={handleEpubFileInput}
                />
                <span class="material-symbols-outlined text-[36px] text-[#8ec07c]">file_open</span>
                <div class="flex flex-col items-center gap-0.5 text-center">
                  <span class="font-semibold text-[#ebdbb2] text-sm">{$t('import.epubDropzone')}</span>
                  <span class="text-[#a89984] text-[11px]">{$t('import.epubDropzoneHint')}</span>
                </div>
              </div>
            </div>

            <!-- 解析進度條指示 -->
            {#if isParsingBook}
              <div class="bg-[#1d2021] border border-[#8ec07c]/40 p-3 rounded-lg flex flex-col gap-2 shadow-inner">
                <div class="flex items-center justify-between font-mono text-[11px]">
                  <span class="text-[#8ec07c] font-semibold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[14px] animate-spin">sync</span>
                    {bookParseStepText || $t('import.parsing')}
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
                        {$t('import.epubParseSuccess')}
                      </span>
                    </div>
                    <h4 class="text-sm font-bold text-[#ebdbb2] leading-snug">{previewBookPaper.title}</h4>
                    <span class="text-[#a89984] text-[11px] font-mono">
                      {previewBookPaper.authors?.join(', ') || ''} · {previewBookPaper.venue}
                    </span>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2 bg-[#282828] p-2.5 rounded border border-[#3c3836] font-mono text-center">
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">{$t('repo.inspector.sectionsLabel')}</span>
                    <span class="text-xs font-bold text-[#8ec07c]">{previewBookPaper.sections.length} {$t('repo.inspector.sectionsUnit')}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">{$t('import.paragraphsCount')}</span>
                    <span class="text-xs font-bold text-[#fabd2f]">
                      {previewBookPaper.sections.reduce((acc, s) => acc + s.paragraphs.length, 0)}
                    </span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-[10px] text-[#a89984]">{$t('import.hdFigures')}</span>
                    <span class="text-xs font-bold text-[#b8bb26]">{previewBookPaper.figureList?.length || 0} {$t('import.hdFiguresUnit')}</span>
                  </div>
                </div>

                <!-- 目錄大綱前 8 章預覽 -->
                <div class="flex flex-col gap-1 font-mono text-[11px]">
                  <span class="text-[#a89984] text-[10px]">{$t('import.sectionsOutlinePreview')}</span>
                  <div class="max-h-28 overflow-y-auto flex flex-col gap-1 bg-[#282828]/60 p-2 rounded border border-[#3c3836]">
                    {#each previewBookPaper.sections.slice(0, 8) as sec, idx}
                      <div class="flex items-center gap-1.5 text-[#ebdbb2] text-[10px] truncate">
                        <span class="text-[#8ec07c] font-bold">#{idx + 1}</span>
                        <span class="truncate">{sec.title}</span>
                      </div>
                    {/each}
                    {#if previewBookPaper.sections.length > 8}
                      <span class="text-[#a89984] text-[9px] italic">... {previewBookPaper.sections.length - 8}</span>
                    {/if}
                  </div>
                </div>

                <button
                  class="mt-1 w-full py-2 bg-[#8ec07c] hover:bg-[#b8bb26] text-[#1d2021] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  onclick={handleImportBookPaper}
                >
                  <span class="material-symbols-outlined text-[16px]">library_add</span>
                  {$t('import.importFullBook')}
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
                <span class="font-semibold text-[#ebdbb2]">{$t('import.webEngineTitle')}</span>
                <span class="text-[#a89984] leading-relaxed">
                  {$t('import.webEngineDesc')}
                </span>
              </div>
            </div>

            <!-- URL Input Bar -->
            <div class="flex flex-col gap-1.5">
              <label for="import-web-url" class="font-mono text-[11px] text-[#d5c4a1]">{$t('import.webUrlLabel')}</label>
              <div class="flex items-center gap-2">
                <input
                  id="import-web-url"
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="url"
                  placeholder="https://..."
                  bind:value={webUrl}
                  onkeydown={(e) => e.key === 'Enter' && handleFetchWeb()}
                />
                <button
                  type="button"
                  class="px-2.5 py-2 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  title={$t('import.pasteTooltip')}
                  onclick={handlePasteWebUrl}
                >
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">content_paste</span>
                  <span class="font-mono text-[11px]">{$t('import.pasteBtn')}</span>
                </button>
                <button
                  class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
                  disabled={isFetchingWeb}
                  onclick={handleFetchWeb}
                >
                  {#if isFetchingWeb}
                    <span class="material-symbols-outlined text-[15px] animate-spin">refresh</span>
                    <span>{$t('import.webFetching')}</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px]">download</span>
                    <span>{$t('import.webFetchAndParse')}</span>
                  {/if}
                </button>
              </div>
              {#if webError}
                <span class="text-[#fb4934] font-mono text-[11px] mt-0.5">{webError}</span>
              {/if}
            </div>

            <!-- Sample URL Recommendations -->
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <span class="font-mono text-[10px] text-[#a89984]">{$t('import.recommendUrls')}</span>
              <button
                class="font-mono text-[10px] bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] px-2 py-0.5 rounded transition-colors"
                onclick={() => setDemoUrl('https://transformer-circuits.pub/2021/framework/index.html')}
              >
                Anthropic Circuits
              </button>
              <button
                class="font-mono text-[10px] bg-[#1d2021] hover:bg-[#32302f] border border-[#3c3836] text-[#8ec07c] px-2 py-0.5 rounded transition-colors"
                onclick={() => setDemoUrl('https://distill.pub/2016/augmented-rnns/')}
              >
                Distill: Augmented RNNs
              </button>
            </div>

            <!-- 反爬蟲機器人驗證專屬 Fallback 警示與引導卡片 -->
            {#if botBlockedInfo}
              <div class="mt-2 p-3.5 bg-[#282828] border border-[#fe8019]/70 rounded-xl flex flex-col gap-2.5 shadow-lg animate-fade-in">
                <div class="flex items-start gap-2.5">
                  <span class="material-symbols-outlined text-[20px] text-[#fe8019] shrink-0 mt-0.5 animate-pulse">security</span>
                  <div class="flex flex-col gap-1">
                    <span class="font-bold text-[#ebdbb2] text-xs flex items-center gap-1.5 flex-wrap">
                      {$t('importer.botBlockedTitle')}
                      <span class="bg-[#fe8019]/20 text-[#fe8019] border border-[#fe8019]/40 text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase">{botBlockedInfo.siteName}</span>
                    </span>
                    <p class="text-[#a89984] text-[11px] leading-relaxed">
                      {$t('importer.botBlockedDesc')}
                    </p>
                  </div>
                </div>

                <!-- 降級操作推薦按鈕列 -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#3c3836]">
                  <button
                    type="button"
                    class="px-2.5 py-2 bg-[#1d2021] hover:bg-[#32302f] border border-[#504945] hover:border-[#8ec07c] text-[#8ec07c] rounded-lg transition-colors flex items-center justify-center gap-1.5 font-mono text-[11px] font-semibold cursor-pointer"
                    onclick={handleOpenOriginalUrl}
                  >
                    <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                    <span>{$t('importer.botActionOpenUrl')}</span>
                  </button>

                  <button
                    type="button"
                    class="px-2.5 py-2 bg-[#1d2021] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f] text-[#fabd2f] rounded-lg transition-colors flex items-center justify-center gap-1.5 font-mono text-[11px] font-semibold cursor-pointer"
                    onclick={handleSwitchToPaste}
                  >
                    <span class="material-symbols-outlined text-[15px]">content_paste</span>
                    <span>{$t('importer.botActionPasteText')}</span>
                  </button>

                  <button
                    type="button"
                    class="px-2.5 py-2 bg-[#1d2021] hover:bg-[#32302f] border border-[#504945] hover:border-[#fe8019] text-[#fe8019] rounded-lg transition-colors flex items-center justify-center gap-1.5 font-mono text-[11px] font-semibold cursor-pointer"
                    onclick={handleSwitchToPdf}
                  >
                    <span class="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                    <span>{$t('importer.botActionUploadPdf')}</span>
                  </button>
                </div>
              </div>
            {/if}

            <!-- Parsed Preview Card -->
            {#if previewWebPaper}
              <div class="mt-2 bg-[#1d2021] border border-[#504945] p-3.5 rounded-xl flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] bg-[#8ec07c]/15 text-[#8ec07c] border border-[#8ec07c]/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                    {$t('import.webParseSuccess')}
                  </span>
                  <span class="font-mono text-[10px] text-[#a89984]">
                    {$t('import.sectionsSplit').replace('{count}', String(previewWebPaper.sections.length))}
                  </span>
                </div>

                {#if previewWebPaper.id.startsWith('academic-')}
                  <div class="bg-[#fabd2f]/10 border border-[#fabd2f]/30 px-2.5 py-1.5 rounded-lg text-[11px] text-[#fabd2f] flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">school</span>
                    <span class="leading-relaxed">{$t('importer.academicFallbackNotice')}</span>
                  </div>
                {/if}

                <h4 class="text-sm font-bold text-[#ebdbb2] leading-snug">
                  {previewWebPaper.title}
                </h4>

                <p class="text-[11px] text-[#d5c4a1] line-clamp-2">
                  {previewWebPaper.abstract.english}
                </p>

                <div class="pt-2 border-t border-[#3c3836] flex items-center justify-between">
                  <span class="font-mono text-[10px] text-[#a89984] truncate max-w-[320px]">
                    {previewWebPaper.sourceUrl}
                  </span>
                  <button
                    class="px-3.5 py-1.5 bg-[#b8bb26] hover:bg-[#98971a] text-[#1d2021] font-semibold rounded-lg flex items-center gap-1 transition-colors"
                    onclick={handleImportWebArticle}
                  >
                    <span class="material-symbols-outlined text-[15px]">auto_stories</span>
                    {$t('import.loadStudy')}
                  </button>
                </div>
              </div>
            {/if}

          </div>

        <!-- ==================== TAB 2: PRESET LIBRARY ==================== -->
        {:else if activeTab === 'preset'}
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-[#3c3836]">
              <span class="font-mono text-[11px] text-[#a89984]">{$t('import.fallbackNotice')}</span>
              <button
                type="button"
                class="px-2.5 py-1 bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019]/60 text-[#fabd2f] text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                onclick={handleRestoreAllPresets}
                title={$t('import.restoreTooltip')}
              >
                <span class="material-symbols-outlined text-[14px]">history</span>
                <span>{$t('import.restoreCore')}</span>
              </button>
            </div>

            <!-- Preset 0: MUGEN YOMU Official Operating Manual -->
            <div class="bg-[#1d2021] border border-[#fe8019]/60 hover:border-[#fe8019] p-3.5 rounded-xl flex flex-col gap-2 transition-all shadow-md">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[10px] bg-[#fe8019]/20 border border-[#fe8019]/50 text-[#fe8019] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[12px]">menu_book</span> {userManualDocument.venue}
                  </span>
                  <span class="font-mono text-[10px] text-[#fabd2f] font-semibold">{$t('import.officialManual')}</span>
                </div>
                <button
                  class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded text-xs transition-colors flex items-center gap-1 shadow-sm"
                  onclick={() => handleSelectPreset(userManualDocument)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> {$t('import.loadAndRead')}
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
                  onclick={() => handleSelectPreset(attentionPaper)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> {$t('import.loadAndRead')}
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
                  onclick={() => handleSelectPreset(resnetPaper)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> {$t('import.loadAndRead')}
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
                  onclick={() => handleSelectPreset(anthropicCircuitsWeb)}
                >
                  <span class="material-symbols-outlined text-[13px]">arrow_forward</span> {$t('import.loadAndRead')}
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
                <label for="import-paste-title" class="font-mono text-[11px] text-[#d5c4a1]">{$t('import.pasteTitleLabel')}</label>
                <button
                  type="button"
                  class="text-[10px] font-mono text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 cursor-pointer transition-colors"
                  title={$t('import.pasteTitleBtn')}
                  onclick={handlePasteTitle}
                >
                  <span class="material-symbols-outlined text-[12px] text-[#fe8019]">content_paste</span>
                  <span>{$t('import.pasteTitleBtn')}</span>
                </button>
              </div>
              <input
                id="import-paste-title"
                class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] text-xs"
                type="text"
                placeholder="Self-Attention Explained"
                bind:value={pasteTitle}
              />
            </div>

            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <label for="import-paste-content" class="font-mono text-[11px] text-[#d5c4a1]">{$t('import.pasteContentLabel')}</label>
                  <label class="flex items-center gap-1 cursor-pointer text-[10px] font-mono text-[#b8bb26] bg-[#b8bb26]/10 px-1.5 py-0.5 rounded border border-[#b8bb26]/30 hover:bg-[#b8bb26]/20 transition-colors" title={$t('import.sanitizeToggleTooltip')}>
                    <input type="checkbox" bind:checked={autoSanitizePaste} class="rounded text-[#fe8019] focus:ring-0 cursor-pointer w-3 h-3" />
                    <span>{$t('import.sanitizeToggle')}</span>
                  </label>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="text-[10px] font-mono text-[#ebdbb2] bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] hover:border-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                    title={$t('import.pasteContentBtn')}
                    onclick={handlePasteContent}
                  >
                    <span class="material-symbols-outlined text-[13px] text-[#fe8019]">content_paste_go</span>
                    <span>{$t('import.pasteContentBtn')}</span>
                  </button>
                  {#if pasteContent.trim()}
                    <button
                      type="button"
                      class="text-[10px] font-mono text-[#fe8019] hover:text-[#fabd2f] flex items-center gap-0.5 hover:underline cursor-pointer"
                      onclick={handleCleanPasteText}
                      title={$t('import.cleanPreviewTooltip')}
                    >
                      <span class="material-symbols-outlined text-[13px]">cleaning_services</span>
                      {$t('import.cleanPreview')}
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
              onclick={handleParsePaste}
            >
              <span class="material-symbols-outlined text-[15px]">auto_fix_high</span>
              {$t('import.parseAndStudy')}
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
                onchange={handleFileUpload}
              />
              <span class="material-symbols-outlined text-3xl text-[#fabd2f]">upload_file</span>
              <span class="text-xs font-semibold text-[#ebdbb2]">{$t('import.jsonDropzone')}</span>
              <span class="font-mono text-[10px] text-[#a89984]">{$t('import.jsonSchemaHint')}</span>
            </div>

            {#if uploadError}
              <span class="text-[#fb4934] font-mono text-[11px]">{uploadError}</span>
            {/if}

            {#if previewUploadPaper}
              <div class="bg-[#1d2021] border border-[#b8bb26]/50 p-3 rounded-lg flex items-center justify-between">
                <div class="flex flex-col">
                  <span class="font-semibold text-[#ebdbb2] text-xs">{previewUploadPaper.title}</span>
                  <span class="font-mono text-[10px] text-[#a89984]">{previewUploadPaper.sections.length} {$t('repo.panel.sectionsUnit')}</span>
                </div>
                <button
                  class="px-3.5 py-1.5 bg-[#b8bb26] hover:bg-[#98971a] text-[#1d2021] font-semibold rounded text-xs transition-colors"
                  onclick={handleImportUploadedPaper}
                >
                  {$t('import.importToLibrary')}
                </button>
              </div>
            {/if}
          </div>
        {/if}

      </div>

      <!-- Modal Footer -->
      <div class="p-3.5 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-between">
        <span class="font-mono text-[10px] text-[#a89984]">
          {$t('import.currentCount').replace('{count}', String(currentLibrary.length))}
        </span>
        <button
          class="px-4 py-1.5 rounded-lg text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          onclick={close}
        >
          {$t('import.close')}
        </button>
      </div>

    </div>
  </div>
{/if}
