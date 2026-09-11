<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    attentionPaper,
    resnetPaper,
    anthropicCircuitsWeb,
    fetchWebArticle,
    parseMarkdownToDocument,
    saveLibraryToStorage,
    setActivePaperId,
    type PaperDocument
  } from '../../stores/documentStore';

  export let isOpen: boolean = false;
  export let currentLibrary: PaperDocument[] = [];

  const dispatch = createEventDispatcher();

  let activeTab: 'web' | 'preset' | 'paste' | 'upload' = 'web';

  // Tab 1: Web URL State
  let webUrl: string = 'https://transformer-circuits.pub/2021/framework/index.html';
  let isFetchingWeb: boolean = false;
  let webError: string = '';
  let previewWebPaper: PaperDocument | null = null;

  // Tab 3: Paste Text State
  let pasteTitle: string = '';
  let pasteContent: string = '';
  let pasteError: string = '';

  // Tab 4: File Upload State
  let uploadJsonText: string = '';
  let uploadError: string = '';
  let previewUploadPaper: PaperDocument | null = null;

  function close() {
    isOpen = false;
    dispatch('close');
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

  // --- Tab 3: Paste Text Logic ---
  function handleParsePaste() {
    if (!pasteContent.trim()) {
      pasteError = '請貼上文章內容或 Markdown 文字';
      return;
    }
    pasteError = '';
    const title = pasteTitle.trim() || '自訂貼上文獻';
    const doc = parseMarkdownToDocument(title, pasteContent);
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

  function handleImportUploadedPaper() {
    if (!previewUploadPaper) return;
    importAndActivatePaper(previewUploadPaper);
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
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
    <div class="w-full max-w-3xl bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
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
        
        <!-- ==================== TAB 1: WEB URL IMPORT ==================== -->
        {#if activeTab === 'web'}
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
              <label class="font-mono text-[11px] text-[#d5c4a1]">文章或論文網址 (URL)</label>
              <div class="flex items-center gap-2">
                <input
                  class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/50"
                  type="url"
                  placeholder="https://transformer-circuits.pub/... 或 https://arxiv.org/html/..."
                  bind:value={webUrl}
                  on:keydown={(e) => e.key === 'Enter' && handleFetchWeb()}
                />
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
            <span class="font-mono text-[11px] text-[#a89984]">點擊任一經典學術論文或前沿專文，立即進入深度伴讀工作台：</span>

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
              <label class="font-mono text-[11px] text-[#d5c4a1]">文獻標題 (Title)</label>
              <input
                class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] text-xs"
                type="text"
                placeholder="例如：Self-Attention Mechanism Explained"
                bind:value={pasteTitle}
              />
            </div>

            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <label class="font-mono text-[11px] text-[#d5c4a1]">正文內容或 Markdown</label>
                <span class="font-mono text-[10px] text-[#a89984]">支援 # 1. Intro, ## 2. Details 分段</span>
              </div>
              <textarea
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
