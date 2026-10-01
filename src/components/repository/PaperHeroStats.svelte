<script lang="ts">
  import type { CacheStats } from '../../services/cacheService';
  import { t } from '../../stores/localeStore';

  interface Props {
    totalPapers?: number;
    readCount?: number;
    inProgressCount?: number;
    localMemoryMb?: number;
    cacheStats?: CacheStats | null;
    searchQuery?: string;
    sortBy?: 'recent' | 'progress' | 'title' | 'sections';
    viewMode?: 'grid' | 'table';
    onsearch?: (data: { query: string }) => void;
    onsortChange?: (data: { sortBy: 'recent' | 'progress' | 'title' | 'sections' }) => void;
    onviewModeChange?: (data: { mode: 'grid' | 'table' }) => void;
    onopenImport?: () => void;
    onexportBackup?: () => void;
  }

  let {
    totalPapers = 0,
    readCount = 0,
    inProgressCount = 0,
    localMemoryMb = 0.8,
    cacheStats = null,
    searchQuery = $bindable(''),
    sortBy = $bindable('recent'),
    viewMode = $bindable('grid'),
    onsearch,
    onsortChange,
    onviewModeChange,
    onopenImport,
    onexportBackup
  }: Props = $props();

  function handleSearchInput(e: Event) {
    const query = (e.target as HTMLInputElement).value;
    searchQuery = query;
    onsearch?.({ query });
  }

  function handleSortChange(e: Event) {
    sortBy = (e.target as HTMLSelectElement).value as any;
    onsortChange?.({ sortBy });
  }
</script>

<div class="bg-[#1d2021] border-b border-[#3c3836] px-6 py-4 flex flex-col gap-4 select-none shrink-0 shadow-sm">
  <!-- Top Stat Metric Cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <!-- Stat 1: Total Papers -->
    <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex items-center justify-between shadow-inner">
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">{$t('repo.stats.total')}</span>
        <span class="text-xl font-bold font-mono text-[#ebdbb2] mt-0.5">{totalPapers} <span class="text-xs font-normal text-[#a89984]">{$t('repo.stats.unit')}</span></span>
      </div>
      <div class="w-9 h-9 rounded-lg bg-[#fe8019]/15 border border-[#fe8019]/40 flex items-center justify-center text-[#fe8019]">
        <span class="material-symbols-outlined text-[20px]">library_books</span>
      </div>
    </div>

    <!-- Stat 2: Reading Progress -->
    <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex items-center justify-between shadow-inner">
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">{$t('repo.stats.progress')}</span>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="text-base font-bold font-mono text-[#b8bb26]">{readCount} <span class="text-xs font-normal text-[#a89984]">{$t('repo.stats.completedUnit')}</span></span>
          <span class="text-xs text-[#504945]">/</span>
          <span class="text-base font-bold font-mono text-[#fabd2f]">{inProgressCount} <span class="text-xs font-normal text-[#a89984]">{$t('repo.stats.inProgressUnit')}</span></span>
        </div>
      </div>
      <div class="w-9 h-9 rounded-lg bg-[#b8bb26]/15 border border-[#b8bb26]/40 flex items-center justify-center text-[#b8bb26]">
        <span class="material-symbols-outlined text-[20px]">task_alt</span>
      </div>
    </div>

    <!-- Stat 3: Local Storage -->
    <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex items-center justify-between shadow-inner">
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">{$t('repo.stats.cache')}</span>
        <span class="text-xl font-bold font-mono text-[#83a598] mt-0.5">{localMemoryMb} <span class="text-xs font-normal text-[#a89984]">MB</span></span>
      </div>
      <div class="w-9 h-9 rounded-lg bg-[#83a598]/15 border border-[#83a598]/40 flex items-center justify-center text-[#83a598]">
        <span class="material-symbols-outlined text-[20px]">database</span>
      </div>
    </div>

    <!-- Stat 4: Cost Savings -->
    <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex items-center justify-between shadow-inner">
      <div class="flex flex-col">
        <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider">{$t('repo.stats.savings')}</span>
        <span class="text-xl font-bold font-mono text-[#fabd2f] mt-0.5">{cacheStats ? cacheStats.savingsPercent : 82}% <span class="text-xs font-normal text-[#a89984]">{$t('repo.stats.savedUnit')}</span></span>
      </div>
      <div class="w-9 h-9 rounded-lg bg-[#fabd2f]/15 border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
        <span class="material-symbols-outlined text-[20px]">savings</span>
      </div>
    </div>
  </div>

  <!-- Bottom Toolbar: Search, Filters, Sort, View Switcher & Action Buttons -->
  <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
    <!-- Search Bar -->
    <div class="relative flex-1 min-w-[240px] max-w-md">
      <span class="material-symbols-outlined absolute left-3 top-2.5 text-[16px] text-[#7c6f64]">search</span>
      <input
        type="text"
        value={searchQuery}
        oninput={handleSearchInput}
        placeholder={$t('repo.search.placeholder')}
        class="w-full bg-[#282828] border border-[#3c3836] focus:border-[#fe8019] text-[#ebdbb2] placeholder-[#7c6f64] rounded-lg pl-9 pr-8 py-1.5 text-xs outline-none transition-colors"
      />
      {#if searchQuery}
        <button
          class="absolute right-2.5 top-2 text-[#7c6f64] hover:text-[#ebdbb2]"
          onclick={() => { searchQuery = ''; onsearch?.({ query: '' }); }}
        >
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      {/if}
    </div>

    <!-- Sort, View Mode & Action Buttons -->
    <div class="flex items-center gap-2">
      <!-- Sort Selector -->
      <div class="flex items-center gap-1.5 bg-[#282828] border border-[#3c3836] rounded-lg px-2 py-1">
        <span class="material-symbols-outlined text-[14px] text-[#a89984]">sort</span>
        <select
          value={sortBy}
          onchange={handleSortChange}
          class="bg-transparent text-xs text-[#ebdbb2] outline-none cursor-pointer font-mono"
        >
          <option value="recent" class="bg-[#282828]">{$t('repo.sort.recent')}</option>
          <option value="progress" class="bg-[#282828]">{$t('repo.sort.progress')}</option>
          <option value="title" class="bg-[#282828]">{$t('repo.sort.title')}</option>
          <option value="sections" class="bg-[#282828]">{$t('repo.sort.sections')}</option>
        </select>
      </div>

      <!-- View Mode Switcher -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg p-0.5">
        <button
          class="p-1 rounded flex items-center justify-center transition-colors {viewMode === 'grid' ? 'bg-[#3c3836] text-[#fe8019]' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          onclick={() => { viewMode = 'grid'; onviewModeChange?.({ mode: 'grid' }); }}
          title={$t('repo.view.grid')}
        >
          <span class="material-symbols-outlined text-[16px]">grid_view</span>
        </button>
        <button
          class="p-1 rounded flex items-center justify-center transition-colors {viewMode === 'table' ? 'bg-[#3c3836] text-[#fe8019]' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          onclick={() => { viewMode = 'table'; onviewModeChange?.({ mode: 'table' }); }}
          title={$t('repo.view.table')}
        >
          <span class="material-symbols-outlined text-[16px]">table_rows</span>
        </button>
      </div>

      <div class="h-5 w-px bg-[#3c3836] mx-0.5"></div>

      <!-- Export Backup Button -->
      <button
        class="px-2.5 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#a89984] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
        onclick={() => onexportBackup?.()}
        title={$t('repo.actions.backupTooltip')}
      >
        <span class="material-symbols-outlined text-[15px]">download</span>
        <span>{$t('repo.actions.backup')}</span>
      </button>

      <!-- Import Paper Button -->
      <button
        class="px-3 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        onclick={() => onopenImport?.()}
      >
        <span class="material-symbols-outlined text-[16px]">add_circle</span>
        <span>{$t('repo.actions.import')}</span>
      </button>
    </div>
  </div>
</div>
