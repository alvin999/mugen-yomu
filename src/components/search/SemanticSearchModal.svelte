<script lang="ts">
  import {
    searchSemantic,
    indexPaperChunks,
    reindexPaperChunks,
    extractChunksFromSections,
    getEngineStatus
  } from '../../services/embedding/hybridEmbeddingService';
  import type { SemanticSearchResult, EmbeddingEngineStatus } from '../../services/embedding/embeddingTypes';

  import {
    findBestMatchCharIndex,
    formatSearchHighlight
  } from '../../utils/textSearchMatcher';
  import { t } from '../../stores/localeStore';

  interface Props {
    isOpen?: boolean;
    paperId?: string;
    sections?: any[];
    onclose?: () => void;
    onselectParagraph?: (detail: {
      sectionId: string;
      paragraphIndex: number;
      text: string;
      query?: string;
      charIndex?: number;
      matchedText?: string;
    }) => void;
    onopenSettings?: () => void;
  }

  let {
    isOpen = $bindable(false),
    paperId = '',
    sections = [],
    onclose,
    onselectParagraph,
    onopenSettings
  }: Props = $props();

  let query = $state('');
  let isSearching = $state(false);
  let isIndexing = $state(false);
  let indexingProgress = $state({ current: 0, total: 0 });
  let searchResults = $state<SemanticSearchResult[]>([]);
  let status = $state<EmbeddingEngineStatus | null>(null);
  let hasSearched = $state(false);
  let searchError = $state('');

  $effect(() => {
    if (isOpen && paperId) {
      refreshStatus();
    }
  });

  async function refreshStatus() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mugen_embedding_pref');
      }
      status = await getEngineStatus(paperId);
    } catch (e) {
      console.warn('讀取向量引擎狀態失敗:', e);
    }
  }

  async function handleIndexNow() {
    if (!paperId || !sections || sections.length === 0) return;
    isIndexing = true;
    searchError = '';
    try {
      const chunks = extractChunksFromSections(paperId, sections);
      indexingProgress = { current: 0, total: chunks.length };

      await indexPaperChunks(paperId, chunks, (indexed, total) => {
        indexingProgress = { current: indexed, total };
      });

      await refreshStatus();
    } catch (err: any) {
      searchError = `${$t('search.indexFailed')}: ${err.message || String(err)}`;
    } finally {
      isIndexing = false;
    }
  }

  async function handleReindexNow() {
    if (!paperId || !sections || sections.length === 0) return;
    isIndexing = true;
    searchError = '';
    try {
      const chunks = extractChunksFromSections(paperId, sections);
      indexingProgress = { current: 0, total: chunks.length };

      await reindexPaperChunks(paperId, chunks, (indexed, total) => {
        indexingProgress = { current: indexed, total };
      });

      await refreshStatus();
      if (query.trim()) {
        await handleSearch();
      }
    } catch (err: any) {
      searchError = `${$t('search.reindexFailed')}: ${err.message || String(err)}`;
    } finally {
      isIndexing = false;
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    if (!paperId) return;

    isSearching = true;
    hasSearched = true;
    searchError = '';

    try {
      // 若尚未建立索引，先自動檢查或提示
      if (status && status.indexedCount === 0) {
        await handleIndexNow();
      }

      const results = await searchSemantic(paperId, q, 6);
      searchResults = results;
    } catch (err: any) {
      searchError = `${$t('search.searchFailed')}: ${err.message || String(err)}`;
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose?.();
    } else if (e.key === 'Enter') {
      handleSearch();
    }
  }

  function handleSelect(item: SemanticSearchResult) {
    const matchInfo = findBestMatchCharIndex(item.text, query);
    onselectParagraph?.({
      sectionId: item.sectionId || '',
      paragraphIndex: item.paragraphIndex,
      text: item.text,
      query: query.trim(),
      charIndex: matchInfo.charIndex,
      matchedText: matchInfo.matchedText
    });
    onclose?.();
  }

  function focusOnMount(el: HTMLElement) {
    setTimeout(() => el?.focus(), 50);
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
    onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-[#1d2021] border border-[#504945] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-[#ebdbb2] animate-scale-up"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[#3c3836] flex items-center justify-between bg-[#282828]/60">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#fabd2f]/10 border border-[#fabd2f]/30 flex items-center justify-center text-[#fabd2f]">
            <span class="material-symbols-outlined text-[20px] animate-pulse">radar</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-base tracking-wide text-[#fbf1c7]">{$t('search.modalTitle')}</h3>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#32302f] border border-[#504945] text-[#fabd2f] font-medium">
                {$t('search.dimBadge')}
              </span>
            </div>
            <p class="text-xs text-[#a89984] mt-0.5">{$t('search.modalSubtitle')}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="p-1 rounded-lg text-[#a89984] hover:text-[#fbf1c7] hover:bg-[#3c3836] transition-colors cursor-pointer"
            onclick={() => onclose?.()}
            aria-label={$t('common.close')}
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      <!-- Search Input Area -->
      <div class="p-4 border-b border-[#3c3836] bg-[#282828]/30">
        <div class="relative flex items-center">
          <span class="material-symbols-outlined absolute left-3.5 text-[#a89984] text-[18px]">
            psychology
          </span>
          <input
            type="text"
            bind:value={query}
            placeholder={$t('search.inputPlaceholder')}
            class="w-full bg-[#141617] border border-[#504945] focus:border-[#fabd2f] rounded-lg pl-10 pr-24 py-2.5 text-sm text-[#ebdbb2] placeholder-[#7c6f64] outline-none transition-all shadow-inner"
            use:focusOnMount
          />
          <button
            type="button"
            class="absolute right-2 px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] active:scale-95 text-white font-medium text-xs rounded-md shadow transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            disabled={isSearching || isIndexing || !query.trim()}
            onclick={handleSearch}
          >
            {#if isSearching}
              <span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
              <span>{$t('search.searching')}</span>
            {:else}
              <span class="material-symbols-outlined text-[14px]">search</span>
              <span>{$t('search.btnSearch')}</span>
            {/if}
          </button>
        </div>

        <!-- Status / Indexing Prompt Bar -->
        <div class="mt-2.5 flex items-center justify-between text-xs text-[#a89984]">
          <div class="flex items-center gap-2">
            {#if status && status.indexedCount > 0}
              <span class="flex items-center gap-1 text-[#8ec07c]">
                <span class="material-symbols-outlined text-[14px]">verified</span>
                {$t('search.readyCount').replace('{count}', String(status.indexedCount))}
              </span>
            {:else}
              <span class="flex items-center gap-1 text-[#fabd2f]">
                <span class="material-symbols-outlined text-[14px]">info</span>
                {$t('search.notIndexed')}
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            {#if !isIndexing && status && status.indexedCount > 0}
              <button
                type="button"
                class="text-xs text-[#a89984] hover:text-[#fabd2f] hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                onclick={handleReindexNow}
                title={$t('search.reindexTooltip')}
              >
                <span class="material-symbols-outlined text-[13px]">refresh</span>
                <span>{$t('search.reindex')}</span>
              </button>
            {:else if !isIndexing && (!status || status.indexedCount === 0)}
              <button
                type="button"
                class="text-xs text-[#fe8019] hover:underline flex items-center gap-0.5 cursor-pointer"
                onclick={handleIndexNow}
              >
                <span class="material-symbols-outlined text-[13px]">bolt</span>
                {$t('search.indexNow')}
              </button>
            {/if}
          </div>
        </div>

        {#if isIndexing}
          <div class="mt-2">
            <div class="flex items-center justify-between text-[11px] text-[#fabd2f] mb-1 font-mono">
              <span>{$t('search.indexingProgress').replace('{current}', String(indexingProgress.current)).replace('{total}', String(indexingProgress.total))}</span>
              <span>{Math.round((indexingProgress.current / (indexingProgress.total || 1)) * 100)}%</span>
            </div>
            <div class="w-full bg-[#141617] h-1.5 rounded-full overflow-hidden">
              <div
                class="bg-[#fe8019] h-full transition-all duration-150"
                style="width: {(indexingProgress.current / (indexingProgress.total || 1)) * 100}%"
              ></div>
            </div>
          </div>
        {/if}

        {#if searchError}
          <div class="mt-2 p-2 rounded bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] text-xs flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">error</span>
            <span>{searchError}</span>
          </div>
        {/if}
      </div>

      <!-- Results List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {#if isSearching}
          <div class="py-12 flex flex-col items-center justify-center text-[#a89984] gap-2">
            <div class="w-8 h-8 border-2 border-[#fabd2f] border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs font-mono">{$t('search.comparingVectors')}</p>
          </div>
        {:else if searchResults.length > 0}
          <div class="text-xs font-mono text-[#a89984] px-1 flex items-center justify-between">
            <span>{$t('search.foundMatches').replace('{count}', String(searchResults.length))}</span>
            <span>{$t('search.clickToNavigate')}</span>
          </div>

          {#each searchResults as item, idx}
            {@const matchInfo = findBestMatchCharIndex(item.text, query)}
            <div
              class="p-3.5 rounded-lg border {matchInfo.isDirectMatch ? 'border-[#fe8019]/60 bg-[#fe8019]/[0.05] shadow-[0_0_12px_rgba(254,128,25,0.09)]' : 'border-[#3c3836] bg-[#282828]/40'} hover:bg-[#32302f] hover:border-[#fabd2f]/50 transition-all cursor-pointer group"
              onclick={() => handleSelect(item)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleSelect(item)}
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center flex-wrap gap-2">
                  <!-- 科學餘弦指標 -->
                  <span
                    class="px-2 py-0.5 rounded text-[11px] font-mono font-medium border border-[#504945] bg-[#1d2021] text-[#a89984]"
                    title="Cosine Similarity"
                  >
                    cos θ <span class="text-[#fbf1c7] font-semibold">{(item.similarity ?? (item.scorePercent / 100)).toFixed(2)}</span>
                  </span>

                  {#if matchInfo.isDirectMatch && matchInfo.matchedText}
                    <!-- 命中目標強烈高亮徽章 (僅在真有字面命中時顯示) -->
                    <span
                      class="px-2.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-all bg-[#fe8019] text-[#1d2021] font-bold shadow-[0_0_8px_rgba(254,128,25,0.45)]"
                    >
                      <span class="material-symbols-outlined text-[13px]">center_focus_strong</span>
                      <span>
                        {$t('search.directHit')}: "{matchInfo.matchedText}"
                        <span class="text-[#1d2021]/80 font-normal">· #{matchInfo.charIndex + 1}</span>
                      </span>
                    </span>
                  {/if}

                  {#if item.sectionTitle}
                    <span class="text-xs text-[#d5c4a1] font-medium truncate max-w-[200px]">
                      {item.sectionTitle}
                    </span>
                  {/if}
                </div>

                <span class="text-[11px] font-mono text-[#a89984] group-hover:text-[#fabd2f] transition-colors flex items-center gap-0.5 shrink-0 ml-2">
                  {matchInfo.isDirectMatch ? $t('search.jumpToWord') : $t('search.jumpToParagraph')} <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
                </span>
              </div>

              <p class="text-xs text-[#ebdbb2]/90 leading-relaxed line-clamp-3 font-sans">
                {@html formatSearchHighlight(item.text, matchInfo)}
              </p>
            </div>
          {/each}
        {:else if hasSearched}
          <div class="py-12 text-center text-[#7c6f64]">
            <span class="material-symbols-outlined text-[36px] mb-1">travel_explore</span>
            <p class="text-sm">{$t('search.noResultsTitle')}</p>
            <p class="text-xs text-[#665c54] mt-1">{$t('search.noResultsHint')}</p>
          </div>
        {:else}
          <div class="py-10 text-center text-[#7c6f64]">
            <span class="material-symbols-outlined text-[40px] text-[#504945] mb-2">auto_awesome</span>
            <p class="text-sm text-[#a89984]">{$t('search.readyTitle')}</p>
            <p class="text-xs text-[#665c54] max-w-md mx-auto mt-1">
              {$t('search.readyHint')}
            </p>
          </div>
        {/if}
      </div>

      <!-- Footer (Clean & Pure) -->
      <div class="px-5 py-3 border-t border-[#3c3836] bg-[#1d2021] flex items-center justify-end text-[11px] text-[#7c6f64] font-mono">
        <div class="flex items-center gap-3">
          <span>{$t('search.pressEnter')}</span>
          <span>{$t('search.pressEsc')}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #3c3836;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #504945;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleUp {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-fade-in {
    animation: fadeIn 0.15s ease-out forwards;
  }
  .animate-scale-up {
    animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
