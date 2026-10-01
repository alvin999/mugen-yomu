<script lang="ts">
  import type { PaperDocument, ChapterSection } from '../../../types/document';
  import { t } from '../../../stores/localeStore';

  interface Props {
    paper?: PaperDocument | null;
    viewerMode?: 'canvas' | 'text' | 'native';
    isPdf?: boolean;
    pdfDoc?: any;
    currentPage?: number;
    totalPages?: number;
    zoomLevel?: number;
    isSyncEnabled?: boolean;
    isStringMatchActive?: boolean;
    isStringIndexing?: boolean;
    stringIndexProgress?: number;
    isConvertingToPaper?: boolean;
    convertProgress?: number;
    isLoadingPdf?: boolean;
    localPdfArrayBuffer?: ArrayBuffer | null;
    localPdfBlobUrl?: string | null;
    allSections?: ChapterSection[];
    activeSectionId?: string;
    mode?: 'split' | 'drawer';
    onsetZoom?: (detail: { zoom: number }) => void;
    onsetViewerMode?: (detail: { mode: 'canvas' | 'text' | 'native' }) => void;
    onretry?: () => void;
    onopenExternal?: () => void;
    onswitchToSplit?: () => void;
    onclose?: () => void;
    ontoggleSync?: () => void;
    onselectSection?: (detail: { sectionId: string }) => void;
    onprevPage?: () => void;
    onnextPage?: () => void;
    oninputPage?: (detail: { page: number }) => void;
    onconvertToPaper?: () => void;
    onfileSelect?: (detail: { event: Event }) => void;
    onclearLocalPdf?: () => void;
  }

  let {
    paper = null,
    viewerMode = 'canvas',
    isPdf = false,
    pdfDoc = null,
    currentPage = 1,
    totalPages = 1,
    zoomLevel = 1.0,
    isSyncEnabled = true,
    isStringMatchActive = false,
    isStringIndexing = false,
    stringIndexProgress = 0,
    isConvertingToPaper = false,
    convertProgress = 0,
    isLoadingPdf = false,
    localPdfArrayBuffer = null,
    localPdfBlobUrl = null,
    allSections = [],
    activeSectionId = '',
    mode = 'split',
    onsetZoom,
    onsetViewerMode,
    onretry,
    onopenExternal,
    onswitchToSplit,
    onclose,
    ontoggleSync,
    onselectSection,
    onprevPage,
    onnextPage,
    oninputPage,
    onconvertToPaper,
    onfileSelect,
    onclearLocalPdf
  }: Props = $props();

  let fileInputRef = $state<HTMLInputElement | null>(null);
  let pageInputVal = $state<number>(1);
  $effect(() => {
    pageInputVal = currentPage;
  });

  function handlePageCommit() {
    let p = parseInt(String(pageInputVal), 10);
    if (isNaN(p)) p = 1;
    if (p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    oninputPage?.({ page: p });
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
        {$t('reader.original.localCanvas')}
      </span>
    {:else if isPdf}
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
        <span class="material-symbols-outlined text-[12px]">description</span>
        {viewerMode === 'canvas' ? $t('reader.original.canvasView') : $t('reader.original.pdfOriginal')}
      </span>
    {:else}
      <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold flex items-center gap-1 shrink-0">
        <span class="material-symbols-outlined text-[12px]">language</span>
        {$t('reader.original.webArticle')}
      </span>
    {/if}

    <!-- String Matching Badge -->
    {#if isStringMatchActive}
      <span class="font-mono text-[9px] bg-[#b8bb26]/20 border border-[#b8bb26]/60 text-[#b8bb26] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 shrink-0 animate-fade-in" title={$t('reader.original.stringAnchorTooltip')}>
        <span class="material-symbols-outlined text-[11px]">manage_search</span>
        {$t('reader.original.stringAnchor')}
      </span>
    {:else if isStringIndexing}
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 animate-pulse">
        <span class="material-symbols-outlined text-[11px] animate-spin">sync</span>
        {$t('reader.original.matchingProgress', { progress: stringIndexProgress })}
      </span>
    {/if}

    <span class="text-[#ebdbb2] truncate font-sans text-xs" title={paper?.title}>
      {paper?.title || $t('reader.original.defaultTitle')}
    </span>
  </div>

  <!-- Right: Zoom, Engine Switch & Actions -->
  <div class="flex items-center gap-1.5 shrink-0">
    <!-- Quick Convert to Study Canvas Button -->
    {#if (localPdfArrayBuffer || localPdfBlobUrl)}
      <button
        class="px-2 py-0.5 rounded bg-[#fe8019]/20 hover:bg-[#fe8019] text-[#fe8019] hover:text-[#1d2021] border border-[#fe8019]/60 transition-colors flex items-center gap-1 text-[10px] font-mono font-bold cursor-pointer disabled:opacity-50"
        disabled={isConvertingToPaper}
        onclick={() => onconvertToPaper?.()}
        title={$t('reader.original.convertToCanvasTooltip')}
      >
        {#if isConvertingToPaper}
          <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
          <span>{$t('reader.original.converting', { progress: convertProgress })}</span>
        {:else}
          <span class="material-symbols-outlined text-[12px]">auto_stories</span>
          <span>{$t('reader.original.convertToCanvas')}</span>
        {/if}
      </button>
    {/if}

    <!-- Zoom Controls (Canvas Mode) -->
    {#if viewerMode === 'canvas' && pdfDoc}
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded px-1 py-0.5 gap-1 text-[11px]">
        <button
          class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
          onclick={() => onsetZoom?.({ zoom: zoomLevel - 0.2 })}
          title={$t('reader.original.zoomOut')}
        >-</button>
        <span class="text-[#fabd2f] font-mono w-9 text-center text-[10px]">{Math.round(zoomLevel * 100)}%</span>
        <button
          class="hover:text-[#ebdbb2] px-1 text-xs transition-colors cursor-pointer"
          onclick={() => onsetZoom?.({ zoom: zoomLevel + 0.2 })}
          title={$t('reader.original.zoomIn')}
        >+</button>
      </div>
    {/if}

    {#if isPdf}
      <div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#282828] border border-[#3c3836] text-[10px] font-mono text-[#fabd2f]">
        <span class="material-symbols-outlined text-[12px] text-[#fe8019]">brush</span>
        <span>{$t('reader.original.spaCanvas')}</span>
      </div>
    {:else}
      <div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#282828] border border-[#3c3836] text-[10px] font-mono text-[#83a598]">
        <span class="material-symbols-outlined text-[12px] text-[#83a598]">public</span>
        <span>{$t('reader.original.originalWebView')}</span>
      </div>
    {/if}

    <!-- PDF Only Controls: Retry, Local PDF Upload -->
    {#if isPdf}
      <!-- Retry Button -->
      <button
        class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 rounded text-[11px] text-[#fabd2f] flex items-center gap-1 transition-colors cursor-pointer"
        onclick={() => onretry?.()}
        disabled={isLoadingPdf}
        title={$t('reader.original.reloadPdf')}
      >
        <span class="material-symbols-outlined text-[13px] {isLoadingPdf ? 'animate-spin text-[#fe8019]' : ''}">sync</span>
        <span class="hidden sm:inline">{$t('reader.original.retry')}</span>
      </button>

      <!-- Local PDF Upload -->
      <button
        class="px-2 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] rounded text-[11px] text-[#d5c4a1] flex items-center gap-1 transition-colors cursor-pointer"
        onclick={() => fileInputRef?.click()}
        title={$t('reader.original.localPdfTooltip')}
      >
        <span class="material-symbols-outlined text-[13px] text-[#fe8019]">upload_file</span>
        <span class="hidden sm:inline">{$t('reader.original.localPdf')}</span>
      </button>
      <input
        type="file"
        accept="application/pdf,.pdf"
        class="hidden"
        bind:this={fileInputRef}
        onchange={(e) => onfileSelect?.({ event: e })}
      />

      {#if localPdfArrayBuffer || localPdfBlobUrl}
        <button
          class="px-1.5 py-1 text-[#fb4934] hover:bg-[#282828] rounded text-[10px] cursor-pointer"
          onclick={() => onclearLocalPdf?.()}
          title={$t('reader.original.restoreDefaultPdf')}
        >
          {$t('reader.original.restoreDefaultPdf')}
        </button>
      {/if}
    {/if}

    <div class="h-4 w-px bg-[#3c3836] mx-0.5"></div>

    <!-- Open External -->
    <button
      class="p-1 hover:bg-[#282828] hover:text-[#ebdbb2] rounded text-[#a89984] flex items-center transition-colors cursor-pointer"
      onclick={() => onopenExternal?.()}
      title={$t('reader.original.openNewTab')}
    >
      <span class="material-symbols-outlined text-[15px]">open_in_new</span>
    </button>

    <!-- Drawer Mode controls -->
    {#if mode === 'drawer'}
      <button
        class="px-2 py-1 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] rounded text-[11px] flex items-center gap-1 font-semibold transition-colors cursor-pointer"
        onclick={() => onswitchToSplit?.()}
        title={$t('reader.original.splitCompareTooltip')}
      >
        <span class="material-symbols-outlined text-[13px]">view_column</span>
        <span>{$t('reader.original.splitCompare')}</span>
      </button>

      <button
        class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors cursor-pointer ml-1"
        onclick={() => onclose?.()}
        title={$t('reader.original.collapseDrawer')}
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
    {#if isPdf}
      <!-- 雙向連動開關 (PDF 專用) -->
      <button
        class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer border shrink-0 {
          isSyncEnabled
            ? 'bg-[#b8bb26]/15 border-[#b8bb26]/50 text-[#b8bb26] hover:bg-[#b8bb26]/25'
            : 'bg-[#3c3836]/40 border-[#504945] text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#3c3836]'
        }"
        onclick={() => ontoggleSync?.()}
        title={isSyncEnabled ? $t('reader.original.syncEnabledTooltip') : $t('reader.original.syncDisabledTooltip')}
      >
        <span class="material-symbols-outlined text-[13px]">{isSyncEnabled ? 'link' : 'link_off'}</span>
        <span class="font-bold hidden sm:inline">{isSyncEnabled ? $t('reader.original.syncEnabled') : $t('reader.original.syncDisabled')}</span>
      </button>
    {:else}
      <!-- 網頁來源時，提示無法連動 -->
      <div
        class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border shrink-0 bg-[#3c3836]/30 border-[#504945] text-[#fabd2f]"
        title={$t('reader.original.externalWebNoSyncTooltip')}
      >
        <span class="material-symbols-outlined text-[13px] text-[#fe8019]">link_off</span>
        <span class="font-bold hidden sm:inline">{$t('reader.original.externalWebNoSync')}</span>
      </div>
    {/if}

    <div class="h-3.5 w-px bg-[#3c3836]"></div>

    <!-- Chapter Dropdown -->
    {#if allSections.length > 0}
      <div class="flex items-center gap-1 min-w-0 {viewerMode === 'native' ? 'opacity-40' : ''}">
        <span class="text-[#a89984] text-[10px] hidden md:inline shrink-0">{$t('reader.original.sectionLabel')}</span>
        <select
          class="bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#ebdbb2] text-[11px] rounded px-2 py-0.5 font-sans truncate max-w-[170px] sm:max-w-[240px] cursor-pointer focus:outline-none focus:border-[#fe8019] disabled:cursor-not-allowed"
          value={activeSectionId}
          disabled={viewerMode === 'native'}
          onchange={(e) => onselectSection?.({ sectionId: e.currentTarget.value })}
          title={viewerMode === 'native' ? $t('viewer.crossDomainChapterNotice') : $t('viewer.quickChapterJump')}
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

  <!-- Right: Page Stepper & Instant Jump (PDF Only) -->
  {#if isPdf}
    <div class="flex items-center gap-1 shrink-0 font-mono text-[11px]">
      <button
        class="w-6 h-6 bg-[#282828] hover:bg-[#3c3836] disabled:opacity-30 border border-[#3c3836] rounded flex items-center justify-center text-[#d5c4a1] transition-colors cursor-pointer"
        onclick={() => onprevPage?.()}
        disabled={currentPage <= 1}
        title={$t('reader.original.prevPage')}
      >
        <span class="material-symbols-outlined text-[14px]">chevron_left</span>
      </button>

      <div class="flex items-center gap-1 px-1">
        <span class="text-[#a89984] text-[10px]">{$t('reader.original.pagePrefix')}</span>
        <input
          type="number"
          min="1"
          max={totalPages}
          bind:value={pageInputVal}
          onkeydown={(e) => { if (e.key === 'Enter') handlePageCommit(); }}
          onblur={handlePageCommit}
          class="w-9 bg-[#282828] border border-[#504945] rounded text-center text-[#fabd2f] font-bold text-xs py-0.5 focus:outline-none focus:border-[#fe8019]"
        />
        <span class="text-[#a89984] text-[10px]">{$t('reader.original.pageSuffix', { totalPages })}</span>
      </div>

      <button
        class="w-6 h-6 bg-[#282828] hover:bg-[#3c3836] disabled:opacity-30 border border-[#3c3836] rounded flex items-center justify-center text-[#d5c4a1] transition-colors cursor-pointer"
        onclick={() => onnextPage?.()}
        disabled={currentPage >= totalPages}
        title={$t('reader.original.nextPage')}
      >
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
      </button>
    </div>
  {/if}
</div>
