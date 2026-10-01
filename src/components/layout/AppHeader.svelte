<script lang="ts">
  import { type PaperDocument, isPaperProtected } from '../../stores/documentStore';
  import type { CacheStats } from '../../services/cacheService';
  import { THEMES, currentTheme, setTheme } from '../../stores/themeStore';
  import { vimCursorState, vimConfigStore, updateVimConfig, setVimHelpOpen } from '../../stores/vimCursorStore';
  import {
    currentLocale,
    setLocale,
    AVAILABLE_LOCALES,
    isTraditionalConverterVisible,
    t
  } from '../../stores/localeStore';

  interface Props {
    activePaper?: PaperDocument | null;
    readingMode?: 'bilingual' | 'split' | 'zen' | 'figures';
    isPdfDrawerOpen?: boolean;
    zoomLevel?: number;
    modelName?: string;
    cachedInfo?: string;
    isRailCollapsed?: boolean;
    cacheStats?: CacheStats | null;
    currentMainView?: string;
    onmodeChange?: (data: { mode: 'bilingual' | 'split' | 'zen' | 'figures' }) => void;
    onzoomChange?: (data: { zoomLevel: number }) => void;
    onopenSettings?: () => void;
    onexportNotes?: () => void;
    onopenRepository?: () => void;
    onopenImport?: () => void;
    onbackToWorkspace?: () => void;
    ondeleteCurrentPaper?: (data: { paperId: string }) => void;
    onconvertToTraditional?: () => void;
    ontogglePdfDrawer?: () => void;
  }

  let {
    activePaper = null,
    readingMode = $bindable('bilingual'),
    isPdfDrawerOpen = $bindable(false),
    zoomLevel = $bindable(100),
    modelName = 'Groq (Llama 3.3 70B)',
    cachedInfo = '$0.14 / 2.4k cached',
    isRailCollapsed = false,
    cacheStats = null,
    currentMainView = 'workspace',
    onmodeChange,
    onzoomChange,
    onopenSettings,
    onexportNotes,
    onopenRepository,
    onopenImport,
    onbackToWorkspace,
    ondeleteCurrentPaper,
    onconvertToTraditional,
    ontogglePdfDrawer
  }: Props = $props();

  let isThemeDropdownOpen: boolean = $state(false);
  let isLocaleDropdownOpen: boolean = $state(false);

  function handleWindowClick() {
    if (isThemeDropdownOpen) {
      isThemeDropdownOpen = false;
    }
    if (isLocaleDropdownOpen) {
      isLocaleDropdownOpen = false;
    }
    if ($vimCursorState.isHelpOpen) {
      setVimHelpOpen(false);
    }
  }

  function toggleHelp(e: MouseEvent) {
    e.stopPropagation();
    if (isThemeDropdownOpen) isThemeDropdownOpen = false;
    setVimHelpOpen(!$vimCursorState.isHelpOpen);
  }

  function setMode(mode: 'bilingual' | 'split' | 'zen' | 'figures') {
    readingMode = mode;
    onmodeChange?.({ mode });
  }

  function adjustZoom(delta: number) {
    zoomLevel = Math.max(70, Math.min(150, zoomLevel + delta));
    onzoomChange?.({ zoomLevel });
  }

  function openSettings() {
    onopenSettings?.();
  }

  function exportNotes() {
    onexportNotes?.();
  }

  function openRepository() {
    onopenRepository?.();
  }

  function openImport() {
    onopenImport?.();
  }

  function backToWorkspace() {
    onbackToWorkspace?.();
  }
</script>

<svelte:window onclick={handleWindowClick} />

<header class="fixed top-0 {isRailCollapsed ? 'left-16' : 'left-60'} right-0 h-16 bg-[#1d2021]/95 backdrop-blur-xl border-b border-[#3c3836] z-40 px-4 flex items-center justify-between shadow-md select-none gap-4 transition-all duration-300 ease-in-out">
  <!-- Left Brand & Breadcrumb (Prioritized flexible width) -->
  <div class="flex items-center gap-2.5 min-w-0 flex-1">
    <!-- Brand -->
    <button
      type="button"
      class="flex items-center gap-2 shrink-0 cursor-pointer bg-transparent border-none p-0 text-left focus:outline-none focus:ring-1 focus:ring-[#fe8019] rounded"
      onclick={openRepository}
      title={$t('header.openRepoTooltip')}
    >
      <div class="flex flex-col">
        <span class="text-sm font-bold tracking-tight text-[#fe8019] leading-none">MUGEN YOMU</span>
        <span class="font-mono text-[9px] text-[#a89984] leading-tight mt-0.5">{$t('header.subTitle')}</span>
      </div>
    </button>

    <div class="h-6 w-px bg-[#504945] shrink-0"></div>

    <!-- Repository & Import Buttons -->
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        class="font-mono text-xs bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] px-2.5 py-1 rounded font-semibold transition-all flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
        onclick={openImport}
        title={$t('header.importTooltip')}
        id="btn-header-import"
      >
        <span class="material-symbols-outlined text-[14px]">add_circle</span>
        <span>{$t('nav.import')}</span>
      </button>
    </div>

    <span class="text-[#665c54] shrink-0">/</span>

    <!-- Active View or Active Paper Title & Badge -->
    <div class="flex items-center gap-1.5 min-w-0 overflow-hidden text-xs">
      {#if currentMainView === 'repository'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">library_books</span>
          <span>{$t('header.repoMenu')}</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fe8019] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          onclick={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>{$t('nav.backToWorkspace')}</span>
        </button>
      {:else if currentMainView === 'notes'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">draw</span>
          <span>{$t('header.notesMenu')}</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          onclick={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>{$t('nav.backToWorkspace')}</span>
        </button>
      {:else if currentMainView === 'citation-graph'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#83a598]">hub</span>
          <span>{$t('header.citationMenu')}</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#83a598] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          onclick={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>{$t('nav.backToWorkspace')}</span>
        </button>
      {:else if currentMainView === 'formula-lab'}
        <span class="text-[#ebdbb2] font-semibold flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-[#fe8019]">schema</span>
          <span>{$t('rail.formula')}</span>
        </span>
        <button
          class="ml-2 px-2 py-0.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fe8019] font-mono rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          onclick={backToWorkspace}
        >
          <span class="material-symbols-outlined text-[12px]">arrow_back</span>
          <span>{$t('nav.backToWorkspace')}</span>
        </button>
      {:else}
        <span class="text-[#ebdbb2] font-medium truncate max-w-[220px]" title={activePaper?.title}>
          {activePaper?.title || $t('header.loadingPaper')}
        </span>

        {#if activePaper?.type === 'web'}
          <a
            href={activePaper.sourceUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] hover:text-[#ebdbb2] px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 transition-colors"
            title={$t('header.openWebTooltip')}
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

        {#if activePaper}
          <button
            type="button"
            class="w-6 h-6 rounded flex items-center justify-center text-[#7c6f64] hover:text-[#fb4934] hover:bg-[#282828] transition-colors cursor-pointer shrink-0"
            title={$t('header.removePaperTooltip')}
            onclick={() => { if (activePaper) ondeleteCurrentPaper?.({ paperId: activePaper.id }); }}
          >
            <span class="material-symbols-outlined text-[15px]">delete</span>
          </button>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Center Reading Mode Selector (Only shown in Workspace) -->
  {#if currentMainView === 'workspace'}
    <div class="flex items-center justify-center shrink-0">
      <nav class="flex items-center bg-[#282828] border border-[#3c3836] p-1 rounded-xl gap-1 shadow-inner">
        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 cursor-pointer {readingMode === 'bilingual' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          onclick={() => setMode('bilingual')}
        >
          <span class="material-symbols-outlined text-[13px]">chrome_reader_mode</span>
          <span>{$t('nav.bilingual')}</span>
        </button>

        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 cursor-pointer {readingMode === 'split' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          onclick={() => setMode('split')}
          title={$t('header.splitViewTooltip')}
        >
          <span class="material-symbols-outlined text-[13px]">view_column</span>
          <span>{$t('nav.split')}</span>
        </button>

        <button
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 cursor-pointer {readingMode === 'zen' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          onclick={() => setMode('zen')}
        >
          <span class="material-symbols-outlined text-[13px]">self_improvement</span>
          <span>{$t('nav.zen')}</span>
        </button>

        <button
          id="btn-nav-figures"
          class="px-2.5 py-1 transition-all text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1 cursor-pointer {readingMode === 'figures' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]'}"
          onclick={() => setMode('figures')}
          title={$t('header.formulaStudioTooltip')}
        >
          <span class="material-symbols-outlined text-[13px]">schema</span>
          <span>{$t('nav.figures')}</span>
        </button>
      </nav>
    </div>
  {:else}
    <div class="flex-1"></div>
  {/if}

  <!-- Right BYOK & Utilities -->
  <div class="flex items-center gap-2 shrink-0">
    {#if currentMainView === 'workspace'}
      <!-- Traditional Chinese Conversion Button (限定中文版) -->
      {#if $isTraditionalConverterVisible}
        <button
          class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#8ec07c]/60 text-[#8ec07c] hover:text-[#b8bb26] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          onclick={() => onconvertToTraditional?.()}
          title={$t('tools.convertTooltip')}
          id="btn-header-traditional"
        >
          <span class="material-symbols-outlined text-[14px]">translate</span>
          <span class="hidden md:inline">{$t('tools.convertToTraditional')}</span>
        </button>
      {/if}

      <!-- Slide-out PDF / Web Drawer Toggle Button -->
      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#fabd2f] hover:text-[#fe8019] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm {isPdfDrawerOpen ? '!bg-[#fe8019] !text-[#1d2021] font-semibold' : ''}"
        onclick={() => ontogglePdfDrawer?.()}
        title={$t('header.toggleDrawerTooltip')}
      >
        <span class="material-symbols-outlined text-[14px]">{activePaper?.type === 'web' ? 'web' : 'picture_as_pdf'}</span>
        <span class="hidden md:inline">{$t('nav.pdfDrawer')}</span>
        <span class="font-mono text-[9px] opacity-70">Alt+P</span>
      </button>
    {/if}
    <!-- BYOK Status Pill -->
    <button
      class="flex items-center gap-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] px-2 py-1 rounded-lg transition-colors text-left cursor-pointer"
      onclick={openSettings}
      title={$t('header.settingsTooltipWithModel', { model: modelName, cached: cachedInfo })}
    >
      <span class="h-2 w-2 rounded-full bg-[#fabd2f] animate-pulse"></span>
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#ebdbb2] font-medium leading-tight truncate max-w-[130px]">{modelName}</span>
        <span class="font-mono text-[8px] text-[#a89984] leading-tight">
          {cacheStats && cacheStats.cachedCount > 0 ? `${cacheStats.cachedCount} ${$t('header.cachedHits')}` : $t('header.cacheActive')}
        </span>
      </div>
      <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#d79921]/40 text-[#fabd2f] px-1 py-0.2 rounded font-semibold ml-1">
        {$t('header.savedRatio')} {cacheStats ? cacheStats.savingsPercent : 82}%
      </span>
    </button>

    {#if currentMainView === 'workspace'}
      <!-- Zoom Controller -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg p-0.5 text-[#d5c4a1]">
        <button class="w-5 h-5 flex items-center justify-center hover:bg-[#3c3836] hover:text-[#ebdbb2] rounded transition-colors cursor-pointer" onclick={() => adjustZoom(-10)} title={$t('header.zoomOut')}>
          <span class="material-symbols-outlined text-[13px]">remove</span>
        </button>
        <span class="font-mono text-[10px] px-1 text-[#ebdbb2] select-none font-medium">{zoomLevel}%</span>
        <button class="w-5 h-5 flex items-center justify-center hover:bg-[#3c3836] hover:text-[#ebdbb2] rounded transition-colors cursor-pointer" onclick={() => adjustZoom(10)} title={$t('header.zoomIn')}>
          <span class="material-symbols-outlined text-[13px]">add</span>
        </button>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <!-- Language Switcher Dropdown -->
      <div class="relative" id="locale-switcher-container">
        <button
          class="h-7 px-2 rounded-lg flex items-center gap-1.5 text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2] transition-colors cursor-pointer text-xs font-mono border border-transparent hover:border-[#504945] {isLocaleDropdownOpen ? 'bg-[#3c3836] text-[#fe8019] border-[#fe8019]/40' : ''}"
          onclick={(e) => {
            e.stopPropagation();
            if ($vimCursorState.isHelpOpen) setVimHelpOpen(false);
            if (isThemeDropdownOpen) isThemeDropdownOpen = false;
            isLocaleDropdownOpen = !isLocaleDropdownOpen;
          }}
          title={$t('locale.switchLabel')}
          id="btn-locale-switcher"
        >
          <span class="text-[13px]">{AVAILABLE_LOCALES.find(l => l.id === $currentLocale)?.flag || '🌐'}</span>
          <span class="text-[11px] font-medium hidden sm:inline">{AVAILABLE_LOCALES.find(l => l.id === $currentLocale)?.label || $currentLocale}</span>
          <span class="material-symbols-outlined text-[13px] opacity-70">expand_more</span>
        </button>

        {#if isLocaleDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="menu"
            tabindex="-1"
            class="absolute right-0 top-9 w-36 bg-[#282828] border border-[#504945] rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-0.5 animate-fade-in"
            onclick={(e) => e.stopPropagation()}
          >
            {#each AVAILABLE_LOCALES as loc}
              <button
                class="w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-all text-left text-xs font-mono cursor-pointer {loc.id === $currentLocale ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#ebdbb2] hover:bg-[#32302f] hover:text-[#fabd2f]'}"
                onclick={() => { setLocale(loc.id); isLocaleDropdownOpen = false; }}
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm">{loc.flag}</span>
                  <span>{loc.label}</span>
                </div>
                {#if loc.id === $currentLocale}
                  <span class="material-symbols-outlined text-[13px] text-[#fe8019]">check</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Theme Switcher Dropdown -->
      <div class="relative" id="theme-switcher-container">
        <button
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2] transition-colors cursor-pointer {isThemeDropdownOpen ? 'bg-[#3c3836] text-[#fe8019]' : ''}"
          onclick={(e) => {
            e.stopPropagation();
            if ($vimCursorState.isHelpOpen) setVimHelpOpen(false);
            if (isLocaleDropdownOpen) isLocaleDropdownOpen = false;
            isThemeDropdownOpen = !isThemeDropdownOpen;
          }}
          title={$t('header.themeTooltip')}
          id="btn-theme-switcher"
        >
          <span class="material-symbols-outlined text-[16px]">palette</span>
        </button>

        {#if isThemeDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="menu"
            tabindex="-1"
            class="absolute right-0 top-9 w-64 bg-[#282828] border border-[#504945] rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 max-h-96 overflow-y-auto animate-fade-in"
            onclick={(e) => e.stopPropagation()}
          >
            <div class="px-2 py-1.5 border-b border-[#3c3836] flex items-center justify-between">
              <span class="font-mono text-[11px] text-[#ebdbb2] font-semibold flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-[#fe8019]">palette</span>
                <span>{$t('header.theme')}</span>
              </span>
              <span class="font-mono text-[9px] text-[#a89984] bg-[#1d2021] px-1.5 py-0.5 rounded">
                {THEMES.length} {$t('header.themeCount')}
              </span>
            </div>

            <div class="flex flex-col gap-1 mt-1">
              {#each THEMES as thm}
                <button
                  class="w-full px-2 py-1.5 rounded-lg flex items-center justify-between transition-all text-left group cursor-pointer {thm.id === $currentTheme ? 'bg-[#3c3836] border border-[#fe8019]/50' : 'hover:bg-[#32302f] border border-transparent'}"
                  onclick={() => { setTheme(thm.id); isThemeDropdownOpen = false; }}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- Swatch preview -->
                    <div class="flex items-center gap-0.5 p-0.5 bg-[#141617] rounded border border-[#504945] shrink-0">
                      {#each thm.previewColors as color}
                        <span class="w-2 h-3.5 rounded-sm" style="background-color: {color};"></span>
                      {/each}
                    </div>

                    <div class="flex flex-col min-w-0">
                      <span class="font-medium text-[11px] truncate {thm.id === $currentTheme ? 'text-[#fe8019]' : 'text-[#ebdbb2] group-hover:text-[#fe8019]'}">
                        {thm.zhName}
                      </span>
                      <span class="font-mono text-[9px] text-[#a89984] truncate">
                        {thm.name}
                      </span>
                    </div>
                  </div>

                  {#if thm.id === $currentTheme}
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
        onclick={exportNotes}
        title={$t('header.notesTooltip')}
      >
        <span class="material-symbols-outlined text-[16px]">draw</span>
      </button>
      <button class="w-7 h-7 rounded-lg flex items-center justify-center text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2] transition-colors cursor-pointer" onclick={openSettings} title={$t('header.settingsTooltip')}>
        <span class="material-symbols-outlined text-[16px]">settings</span>
      </button>
    </div>

    <!-- Vim 操作說明指南 (取代頭像) -->
    <div class="relative" id="vim-help-container">
      <button
        type="button"
        class="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer {$vimCursorState.isHelpOpen ? 'bg-[#3c3836] text-[#fe8019]' : 'text-[#d5c4a1] hover:bg-[#3c3836] hover:text-[#ebdbb2]'}"
        onclick={toggleHelp}
        title={$t('header.vimHelpTooltip')}
        id="btn-vim-help"
      >
        <span class="material-symbols-outlined text-[18px]">help_outline</span>
      </button>

      {#if $vimCursorState.isHelpOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          class="absolute right-0 top-9 w-80 bg-[#1d2021]/95 backdrop-blur-md border border-[#504945] rounded-xl shadow-2xl p-3.5 text-[11px] text-[#ebdbb2] z-50 animate-scale-in font-mono"
          onclick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between border-b border-[#3c3836] pb-2 mb-2.5">
            <div class="flex items-center gap-1.5 font-bold text-[#fe8019]">
              <span class="material-symbols-outlined text-[16px]">terminal</span>
              <span>{$t('vim.title')}</span>
            </div>
            <button
              type="button"
              class="text-[#a89984] hover:text-[#ebdbb2] text-[14px] px-1 cursor-pointer"
              onclick={() => setVimHelpOpen(false)}
              title={$t('vim.close')}
            >✕</button>
          </div>

          <div class="space-y-2 text-[#d5c4a1]">
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fabd2f] font-bold">h / l</span>
              <span class="text-[#a89984]">{$t('vim.moveChar')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fabd2f] font-bold">j / k</span>
              <span class="text-[#a89984]">{$t('vim.moveLine')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fabd2f] font-bold">w / b</span>
              <span class="text-[#a89984]">{$t('vim.moveWord')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fabd2f] font-bold">0 / $</span>
              <span class="text-[#a89984]">{$t('vim.moveLineEdge')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fabd2f] font-bold">gg / G</span>
              <span class="text-[#a89984]">{$t('vim.moveDocEdge')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#8ec07c] font-bold">t</span>
              <span class="text-[#a89984]">{$t('vim.toggleTranslation')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#8ec07c] font-bold">a</span>
              <span class="text-[#a89984]">{$t('vim.askAi')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#8ec07c] font-bold">y</span>
              <span class="text-[#a89984]">{$t('vim.copyContent')}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-[#fe8019] font-bold">?</span>
              <span class="text-[#a89984]">{$t('vim.toggleHelp')}</span>
            </div>
          </div>

          <div class="mt-3 pt-2.5 border-t border-[#3c3836] flex flex-col gap-1.5 text-[10px] text-[#a89984]">
            <div class="flex items-center justify-between">
              <span class="text-[#fabd2f]">
                {$t('vim.bounceStrength')}: {($vimConfigStore.bounceStrength ?? 60) === 0 ? $t('vim.bounceOff') : `${$vimConfigStore.bounceStrength ?? 60}%`}
              </span>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-[#ebdbb2]">
                <input
                  type="checkbox"
                  checked={$vimConfigStore.isBlinkEnabled}
                  onchange={() => updateVimConfig({ isBlinkEnabled: !$vimConfigStore.isBlinkEnabled })}
                  class="accent-[#fe8019]"
                />
                <span>{$t('vim.cursorBlink')}</span>
              </label>
            </div>
            <div class="flex items-center justify-between border-t border-[#3c3836]/40 pt-1.5">
              <span>{$t('vim.lineGuide')}</span>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-[#ebdbb2]">
                <input
                  type="checkbox"
                  checked={$vimConfigStore.isSmoothScrollEnabled}
                  onchange={() => updateVimConfig({ isSmoothScrollEnabled: !$vimConfigStore.isSmoothScrollEnabled })}
                  class="accent-[#fe8019]"
                />
                <span class={$vimConfigStore.isSmoothScrollEnabled ? 'text-[#fe8019] font-medium' : ''}>{$t('vim.smoothScroll')}</span>
              </label>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
