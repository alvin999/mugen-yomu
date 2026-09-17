<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../../types/document';

  export let paper: PaperDocument | null = null;
  export let viewerMode: 'canvas' | 'text' | 'native' = 'canvas';
  export let isPdf: boolean = false;
  export let pdfDoc: any = null;
  export let currentPage: number = 1;
  export let totalPages: number = 1;
  export let zoomLevel: number = 1.0;
  export let isSyncEnabled: boolean = true;
  export let isStringMatchActive: boolean = false;
  export let isStringIndexing: boolean = false;
  export let stringIndexProgress: number = 0;
  export let isConvertingToPaper: boolean = false;
  export let convertProgress: number = 0;
  export let isLoadingPdf: boolean = false;
  export let localPdfArrayBuffer: ArrayBuffer | null = null;
  export let localPdfBlobUrl: string | null = null;
  export let allSections: ChapterSection[] = [];
  export let activeSectionId: string = '';
  export let mode: 'split' | 'drawer' = 'split';

  const dispatch = createEventDispatcher<{
    setZoom: { zoom: number };
    setViewerMode: { mode: 'canvas' | 'text' | 'native' };
    retry: void;
    openExternal: void;
    switchToSplit: void;
    close: void;
    toggleSync: void;
    selectSection: { sectionId: string };
    prevPage: void;
    nextPage: void;
    inputPage: { page: number };
    convertToPaper: void;
    fileSelect: { event: Event };
    clearLocalPdf: void;
  }>();

  let fileInputRef: HTMLInputElement | null = null;
  let pageInputVal: number = currentPage;
  $: pageInputVal = currentPage;

  function handlePageCommit() {
    let p = parseInt(String(pageInputVal), 10);
    if (isNaN(p)) p = 1;
    if (p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    dispatch('inputPage', { page: p });
  }

  function formatSectionOption(sec: ChapterSection): string {
    const pInfo = sec.page ? ` (p.${sec.page})` : '';
    const prefix = sec.level && sec.level > 1 ? '  '.repeat(sec.level - 1) + '└ ' : '';
    return `${prefix}${sec.title}${pInfo}`;
  }
</script>

<!-- Primary Header Bar: Document Info, Engine Badge & Action Controls -->
<header class="h-10 bg-[#1d2021] border-b border-[#3c3836] px-3 flex items-center justify-between shrink-0 text-xs font-mono text-[#a89984] z-10 shadow-sm">
  <!-- Left: Badge, Title & String Match Indicator -->
  <div class="flex items-center gap-2 min-w-0 flex-1 mr-2">
    {#if localPdfArrayBuffer}
      <span class="font-mono text-[9px] bg-[#fe8019]/20 border border-[#fe8019]/60 text-[#fe8019] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
        <span class="material-symbols-outlined text-[12px]">picture_as_pdf</span>
        本機畫布
      </span>
    {:else if isPdf}
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
        <span class="material-symbols-outlined text-[12px]">description</span>
        {viewerMode === 'canvas' ? '畫布視圖' : '學術 PDF 原版'}
      </span>
    {:else}
      <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
        <span class="material-symbols-outlined text-[12px]">language</span>
        網頁文獻
      </span>
    {/if}

    <!-- String Matching Badge -->
    {#if isStringMatchActive}
      <span class="font-mono text-[9px] bg-[#b8bb26]/20 border border-[#b8bb26]/60 text-[#b8bb26] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 shrink-0 animate-fade-in" title="已透過 PDF 文字自動校正所有章節出處">
        <span class="material-symbols-outlined text-[11px]">manage_search</span>
        字串錨定
      </span>
    {:else if isStringIndexing}
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 animate-pulse">
        <span class="material-symbols-outlined text-[11px] animate-spin">sync</span>
        比對中 {stringIndexProgress}%
      </span>
    {/if}

    <span class="text-[#ebdbb2] truncate font-sans text-xs" title={paper?.title}>
      {paper?.title || '原始學術文獻'}
    </span>
  </div>

  <!-- Right: Zoom, Engine Switch & Actions -->
  <div class="flex items-center gap-1.5 shrink-0">
    <!-- Quick Convert to Study Canvas Button -->
    {#if (localPdfArrayBuffer || localPdfBlobUrl)}
      <button
        class="px-2 py-0.5 rounded bg-[#fe8019]/20 hover:bg-[#fe8019] text-[#fe8019] hover:text-[#1d2021] border border-[#fe8019]/60 transition-colors flex items-center gap-1 text-[10px] font-mono font-bold cursor-pointer disabled:opacity-50"
        disabled={isConvertingToPaper}
        on:click={() => dispatch('convertToPaper')}
        title="將此 PDF 解析為章節，轉換為雙語研讀畫布"
      >
        {#if isConvertingToPaper}
          <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
          <span>解析中 {convertProgress}%</span>
        {:else}
          <span class="material-symbols-outlined text-[12px]">auto_stories</span>
          <span>✨ 轉換為研讀畫布</span>
        {/if}
      </button>
    {/if}

    <!-- Zoom Controls (Canvas Mode) -->
    {#if viewerMode === 'canvas' && pdfDoc}
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded px-1 py-0.5 gap-1 text-[11px]">
        <button
          class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
          on:click={() => dispatch('setZoom', { zoom: zoomLevel - 0.2 })}
          title="縮小"
        >-</button>
        <span class="text-[#fabd2f] font-mono w-9 text-center text-[10px]">{Math.round(zoomLevel * 100)}%</span>
        <button
          class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
          on:click={() => dispatch('setZoom', { zoom: zoomLevel + 0.2 })}
          title="放大"
        >+</button>
      </div>
    {/if}

    <!-- Engine Switcher Pill -->
    <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded p-0.5 gap-0.5 text-[10px]">
      {#if isPdf}
        <button
          class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'canvas' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => dispatch('setViewerMode', { mode: 'canvas' })}
          title="PDF.js 向量畫布渲染模式"
        >
          <span class="material-symbols-outlined text-[11px]">brush</span>
          <span>畫布</span>
        </button>
      {/if}

      <button
        class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'text' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        on:click={() => dispatch('setViewerMode', { mode: 'text' })}
        title="擬真學術排版期刊視圖（含圖表與 KaTeX 算式）"
      >
        <span class="material-symbols-outlined text-[11px]">menu_book</span>
        <span>排版</span>
      </button>

      {#if paper?.sourceUrl}
        <button
          class="px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-0.5 {viewerMode === 'native' ? 'bg-[#fe8019] text-[#1d2021] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => dispatch('setViewerMode', { mode: 'native' })}
          title={paper?.type === 'web' ? '原始網站視圖' : '原生 PDF 檢視器'}
        >
          <span class="material-symbols-outlined text-[11px]">language</span>
          <span>{paper?.type === 'web' ? '原站' : '原生'}</span>
        </button>
      {/if}
    </div>

    <!-- Retry Button -->
    <button
      class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 rounded text-[11px] text-[#fabd2f] flex items-center gap-1 transition-colors cursor-pointer"
      on:click={() => dispatch('retry')}
      disabled={isLoadingPdf}
      title="重新載入 PDF 來源"
    >
      <span class="material-symbols-outlined text-[13px] {isLoadingPdf ? 'animate-spin text-[#fe8019]' : ''}">sync</span>
      <span class="hidden sm:inline">重試</span>
    </button>

    <!-- Local PDF Upload -->
    <button
      class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] rounded text-[11px] text-[#d5c4a1] flex items-center gap-1 transition-colors cursor-pointer"
      on:click={() => fileInputRef?.click()}
      title="選取本機 PDF 檔案進行比對"
    >
      <span class="material-symbols-outlined text-[13px] text-[#fe8019]">upload_file</span>
      <span class="hidden sm:inline">本地 PDF</span>
    </button>
    <input
      type="file"
      accept="application/pdf,.pdf"
      class="hidden"
      bind:this={fileInputRef}
      on:change={(e) => dispatch('fileSelect', { event: e })}
    />

    {#if localPdfArrayBuffer || localPdfBlobUrl}
      <button
        class="px-1.5 py-1 text-[#fb4934] hover:bg-[#282828] rounded text-[10px] cursor-pointer"
        on:click={() => dispatch('clearLocalPdf')}
        title="清除本地自訂 PDF"
      >
        復原預設
      </button>
    {/if}

    <div class="h-4 w-px bg-[#3c3836] mx-0.5"></div>

    <!-- Open External -->
    <button
      class="p-1 hover:bg-[#282828] hover:text-[#ebdbb2] rounded text-[#a89984] flex items-center transition-colors cursor-pointer"
      on:click={() => dispatch('openExternal')}
      title="在獨立新分頁開啟"
    >
      <span class="material-symbols-outlined text-[15px]">open_in_new</span>
    </button>

    <!-- Drawer Mode controls -->
    {#if mode === 'drawer'}
      <button
        class="px-2 py-1 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] rounded text-[11px] flex items-center gap-1 font-semibold transition-colors cursor-pointer"
        on:click={() => dispatch('switchToSplit')}
        title="切換為左右 50/50 對照模式"
      >
        <span class="material-symbols-outlined text-[13px]">view_column</span>
        <span>切換對照</span>
      </button>

      <button
        class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors cursor-pointer ml-1"
        on:click={() => dispatch('close')}
        title="收起抽屜 (Esc)"
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
    <button
      class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer border shrink-0 {
        isSyncEnabled
          ? 'bg-[#b8bb26]/15 border-[#b8bb26]/50 text-[#b8bb26] hover:bg-[#b8bb26]/25'
          : 'bg-[#3c3836]/40 border-[#504945] text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#3c3836]'
      }"
      on:click={() => dispatch('toggleSync')}
      title={isSyncEnabled ? '目前已開啟雙向閱讀聯動（點擊以自由翻閱）' : '目前處於獨立模式（點擊重新鎖定進度）'}
    >
      <span class="material-symbols-outlined text-[13px]">{isSyncEnabled ? 'link' : 'link_off'}</span>
      <span class="font-bold hidden sm:inline">{isSyncEnabled ? '聯動中' : '獨立閱讀'}</span>
    </button>

    <div class="h-3.5 w-px bg-[#3c3836]"></div>

    <!-- Chapter Dropdown -->
    {#if allSections.length > 0}
      <div class="flex items-center gap-1 min-w-0">
        <span class="text-[#a89984] text-[10px] hidden md:inline shrink-0">章節:</span>
        <select
          class="bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#ebdbb2] text-[11px] rounded px-2 py-0.5 font-sans truncate max-w-[170px] sm:max-w-[240px] cursor-pointer focus:outline-none focus:border-[#fe8019]"
          value={activeSectionId}
          on:change={(e) => dispatch('selectSection', { sectionId: e.currentTarget.value })}
          title="章節快速跳轉對應 PDF 頁面"
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
      on:click={() => dispatch('prevPage')}
      disabled={currentPage <= 1}
      title="上一頁"
    >
      <span class="material-symbols-outlined text-[14px]">chevron_left</span>
    </button>

    <div class="flex items-center gap-1 px-1">
      <span class="text-[#a89984] text-[10px]">第</span>
      <input
        type="number"
        min="1"
        max={totalPages}
        bind:value={pageInputVal}
        on:keydown={(e) => { if (e.key === 'Enter') handlePageCommit(); }}
        on:blur={handlePageCommit}
        class="w-9 bg-[#282828] border border-[#504945] rounded text-center text-[#fabd2f] font-bold text-xs py-0.5 focus:outline-none focus:border-[#fe8019]"
      />
      <span class="text-[#a89984] text-[10px]">/ {totalPages} 頁</span>
    </div>

    <button
      class="w-6 h-6 bg-[#282828] hover:bg-[#3c3836] disabled:opacity-30 border border-[#3c3836] rounded flex items-center justify-center text-[#d5c4a1] transition-colors cursor-pointer"
      on:click={() => dispatch('nextPage')}
      disabled={currentPage >= totalPages}
      title="下一頁"
    >
      <span class="material-symbols-outlined text-[14px]">chevron_right</span>
    </button>
  </div>
</div>
