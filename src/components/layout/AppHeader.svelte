<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import type { CacheStats } from '../../services/cacheService';
  import { THEMES, currentTheme, setTheme } from '../../stores/themeStore';

  export let activePaper: PaperDocument | null = null;
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isPdfDrawerOpen: boolean = false;
  export let zoomLevel: number = 100;
  export let modelName: string = 'Groq (Llama 3.3 70B)';
  export let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  export let isRailCollapsed: boolean = false;
  export let cacheStats: CacheStats | null = null;
  export let currentMainView: string = 'workspace';

  let isThemeDropdownOpen: boolean = false;

  function handleWindowClick() {
    if (isThemeDropdownOpen) {
      isThemeDropdownOpen = false;
    }
  }

  const dispatch = createEventDispatcher();

  function setMode(mode: 'bilingual' | 'split' | 'zen' | 'figures') {
    readingMode = mode;
    dispatch('modeChange', { mode });
  }

  function adjustZoom(delta: number) {
    zoomLevel = Math.max(70, Math.min(150, zoomLevel + delta));
    dispatch('zoomChange', { zoomLevel });
  }

  function openSettings() {
    dispatch('openSettings');
  }

  function exportNotes() {
    dispatch('exportNotes');
  }

  function openRepository() {
    dispatch('openRepository');
  }

  function openImport() {
    dispatch('openImport');
  }

  function backToWorkspace() {
    dispatch('backToWorkspace');
  }
</script>

<svelte:window on:click={handleWindowClick} />

<header class="fixed top-0 {isRailCollapsed ? 'left-16' : 'left-60'} right-0 h-16 bg-[#1d2021]/95 backdrop-blur-xl border-b border-[#3c3836] z-40 px-4 flex items-center justify-between shadow-md select-none gap-4 transition-all duration-300 ease-in-out">
  <!-- Left Brand & Breadcrumb (Prioritized flexible width) -->
  <div class="flex items-center gap-2.5 min-w-0 flex-1">
    <!-- Brand -->
    <button
      type="button"
      class="flex items-center gap-2 shrink-0 cursor-pointer bg-transparent border-none p-0 text-left focus:outline-none focus:ring-1 focus:ring-[#fe8019] rounded"
      on:click={openRepository}
      title="開啟文獻庫"
    >
      <div class="flex flex-col">
        <span class="text-sm font-bold tracking-tight text-[#fe8019] leading-none">MUGEN YOMU</span>
        <span class="font-mono text-[9px] text-[#a89984] leading-tight mt-0.5">無限閱讀 · 伴讀工作台</span>
      </div>
    </button>

    <div class="h-6 w-px bg-[#504945] shrink-0"></div>

    <!-- Repository & Import Buttons -->
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        class="font-mono text-xs bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] px-2.5 py-1 rounded font-semibold transition-all flex items-center gap-1 shadow-sm shrink-0"
        on:click={openImport}
        title="匯入新論文或網頁文章"
        id="btn-header-import"
      >
        <span class="material-symbols-outlined text-[14px]">add_circle</span>
        <span>匯入</span>
      </button>
    </div>

    <span class="text-[#665c54] shrink-0">/</span>

    <!-- Active View or Active Paper Title & Badge -->
    <div class="flex items-center gap-1.5 min-w-0 overflow-hidden text-xs">
      {#if currentMainView === 'repository'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">library_books</span>
          <span>本地文獻總庫 (Paper Repository)</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fe8019] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          on:click={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>返回閱讀</span>
        </button>
      {:else if currentMainView === 'notes'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">draw</span>
          <span>精讀筆記工作室 (Cognitive Notes)</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          on:click={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>返回閱讀</span>
        </button>
      {:else if currentMainView === 'citation-graph'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#83a598]">hub</span>
          <span>引文關聯星系 (Citation Graph)</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#83a598] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          on:click={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>返回閱讀</span>
        </button>
      {:else}
        <span class="text-[#ebdbb2] font-medium truncate max-w-[220px]" title={activePaper?.title}>
          {activePaper?.title || '載入中...'}
        </span>

        {#if activePaper?.type === 'web'}
          <a
            href={activePaper.sourceUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] hover:text-[#ebdbb2] px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 transition-colors"
            title="開啟原文網頁"
          >
            <span class="material-symbols-outlined text-[11px]">open_in_new</span>
            <span>{activePaper.venue || 'Web'}</span>
          </a>
        {:else if activePaper?.arxivId}
          <span class="font-mono text-[10px] bg-[#32302f] border border-[#504945] text-[#fabd2f] px-1.5 py-0.5 rounded shrink-0">
            {activePaper.arxivId}
          </span>
        {:else if activePaper}
          <span class="font-mono text-[10px] bg-[#32302f] border border-[#504945] text-[#a89984] px-1.5 py-0.5 rounded shrink-0">
            {activePaper.venue}
          </span>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Center Reading Mode Selector (Only shown in Workspace) -->
  {#if currentMainView === 'workspace'}
    <div class="flex items-center justify-center shrink-0">
      <nav class="flex items-center bg-[#282828] border border-[#3c3836] p-1 rounded-xl gap-1 shadow-inner">
        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 {readingMode === 'bilingual' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          on:click={() => setMode('bilingual')}
        >
          <span class="material-symbols-outlined text-[13px]">chrome_reader_mode</span>
          <span>雙語伴讀</span>
        </button>

        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 {readingMode === 'split' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          on:click={() => setMode('split')}
          title="左右 50/50 雙軌並列：左側原始論文/網頁，右側雙語伴讀"
        >
          <span class="material-symbols-outlined text-[13px]">view_column</span>
          <span>雙軌對照</span>
        </button>

        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 {readingMode === 'zen' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          on:click={() => setMode('zen')}
        >
          <span class="material-symbols-outlined text-[13px]">self_improvement</span>
          <span>純沉浸</span>
        </button>

        <button
          id="btn-nav-figures"
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 {readingMode === 'figures' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          on:click={() => setMode('figures')}
          title="圖表與公式推導工作室"
        >
          <span class="material-symbols-outlined text-[13px]">schema</span>
          <span>圖表推導</span>
        </button>
      </nav>
    </div>
  {:else}
    <div class="flex-1"></div>
  {/if}

  <!-- Right BYOK & Utilities -->
  <div class="flex items-center gap-2 shrink-0">
    {#if currentMainView === 'workspace'}
      <!-- Slide-out PDF / Web Drawer Toggle Button -->
      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm {isPdfDrawerOpen ? '!bg-[#fe8019] !text-[#1d2021] font-semibold' : ''}"
        on:click={() => dispatch('togglePdfDrawer')}
        title="開啟/收合原檔或原站側邊抽屜 (快捷鍵: Alt+P)"
      >
        <span class="material-symbols-outlined text-[14px]">{activePaper?.type === 'web' ? 'web' : 'picture_as_pdf'}</span>
        <span class="hidden md:inline">{activePaper?.type === 'web' ? '原檔抽屜' : '原檔抽屜'}</span>
        <span class="font-mono text-[9px] opacity-70">Alt+P</span>
      </button>
    {/if}
    <!-- BYOK Status Pill -->
    <button
      class="flex items-center gap-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] px-2 py-1 rounded-lg transition-colors text-left"
      on:click={openSettings}
      title="{modelName} · {cachedInfo} · 點擊設定 BYOK API 金鑰與模型"
    >
      <span class="h-2 w-2 rounded-full bg-[#fabd2f] animate-pulse"></span>
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#ebdbb2] font-medium leading-tight truncate max-w-[130px]">{modelName}</span>
        <span class="font-mono text-[8px] text-[#a89984] leading-tight">
          {cacheStats && cacheStats.cachedCount > 0 ? `${cacheStats.cachedCount} 次快取命中 · 本機活躍` : '本機快取活躍'}
        </span>
      </div>
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#d79921]/40 text-[#fabd2f] px-1 py-0.2 rounded font-semibold ml-1">
        省 {cacheStats ? cacheStats.savingsPercent : 82}%
      </span>
    </button>

    {#if currentMainView === 'workspace'}
      <!-- Zoom Controller -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg p-0.5 text-[#d5c4a1]">
        <button class="w-5 h-5 flex items-center justify-center hover:bg-[#3c3836] hover:text-[#ebdbb2] rounded transition-colors" on:click={() => adjustZoom(-10)}>
          <span class="material-symbols-outlined text-[13px]">remove</span>
        </button>
        <span class="font-mono text-[10px] px-1 text-[#ebdbb2] select-none font-medium">{zoomLevel}%</span>
        <button class="w-5 h-5 flex items-center justify-center hover:bg-[#3c3836] hover:text-[#ebdbb2] rounded transition-colors" on:click={() => adjustZoom(10)}>
          <span class="material-symbols-outlined text-[13px]">add</span>
        </button>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <!-- Theme Switcher Dropdown -->
      <div class="relative" id="theme-switcher-container">
        <button
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2] transition-colors cursor-pointer {isThemeDropdownOpen ? 'bg-[#3c3836] text-[#fe8019]' : ''}"
          on:click|stopPropagation={() => isThemeDropdownOpen = !isThemeDropdownOpen}
          title="切換介面主題 (當前：{$currentTheme})"
          id="btn-theme-switcher"
        >
          <span class="material-symbols-outlined text-[16px]">palette</span>
        </button>

        {#if isThemeDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="absolute right-0 top-9 w-64 bg-[#282828] border border-[#504945] rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 max-h-96 overflow-y-auto animate-fade-in"
            on:click|stopPropagation
          >
            <div class="px-2 py-1.5 border-b border-[#3c3836] flex items-center justify-between">
              <span class="font-mono text-[11px] text-[#ebdbb2] font-semibold flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-[#fe8019]">palette</span>
                <span>閱讀主題 (Themes)</span>
              </span>
              <span class="font-mono text-[9px] text-[#a89984] bg-[#1d2021] px-1.5 py-0.5 rounded">
                {THEMES.length} 款
              </span>
            </div>

            <div class="flex flex-col gap-1 mt-1">
              {#each THEMES as t}
                <button
                  class="w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition-all text-left group cursor-pointer {t.id === $currentTheme ? 'bg-[#3c3836] border border-[#fe8019]/50' : 'hover:bg-[#32302f] border border-transparent'}"
                  on:click={() => { setTheme(t.id); isThemeDropdownOpen = false; }}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- Swatch preview -->
                    <div class="flex items-center gap-0.5 p-0.5 bg-[#141617] rounded border border-[#504945] shrink-0">
                      {#each t.previewColors as color}
                        <span class="w-2 h-3.5 rounded-sm" style="background-color: {color};"></span>
                      {/each}
                    </div>

                    <div class="flex flex-col min-w-0">
                      <span class="font-medium text-[11px] truncate {t.id === $currentTheme ? 'text-[#fe8019]' : 'text-[#ebdbb2] group-hover:text-[#fe8019]'}">
                        {t.zhName}
                      </span>
                      <span class="font-mono text-[9px] text-[#a89984] truncate">
                        {t.name}
                      </span>
                    </div>
                  </div>

                  {#if t.id === $currentTheme}
                    <span class="material-symbols-outlined text-[14px] text-[#fe8019] shrink-0">check</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <button
        class="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer {currentMainView === 'notes' ? 'bg-[#3c3836] text-[#fabd2f]' : 'text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2]'}"
        on:click={exportNotes}
        title="開啟精讀筆記工作室"
      >
        <span class="material-symbols-outlined text-[16px]">draw</span>
      </button>
      <button class="w-7 h-7 rounded-lg flex items-center justify-center text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2] transition-colors" on:click={openSettings} title="BYOK 與系統設定">
        <span class="material-symbols-outlined text-[16px]">settings</span>
      </button>
    </div>

    <!-- User Profile Avatar -->
    <div class="w-6 h-6 rounded-full bg-[#fe8019] text-[#1d2021] font-bold flex items-center justify-center shrink-0 shadow-sm text-xs cursor-pointer">
      <span class="material-symbols-outlined text-[14px]">person</span>
    </div>
  </div>
</header>
