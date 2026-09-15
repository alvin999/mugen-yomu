<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import { saveLibraryToStorage, setActivePaperId } from '../../stores/documentStore';

  export let isOpen: boolean = false;
  export let library: PaperDocument[] = [];
  export let activePaperId: string = '';

  const dispatch = createEventDispatcher();

  function close() {
    isOpen = false;
    dispatch('close');
  }

  function handleSelectPaper(paper: PaperDocument) {
    activePaperId = paper.id;
    setActivePaperId(paper.id);
    dispatch('selectPaper', { paper });
    close();
  }

  function handleDeletePaper(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (id === 'arxiv_1706_03762' || id === 'cvpr_2016_resnet' || id === 'web_anthropic_circuits') {
      alert('預設經典論文與專文無法刪除！');
      return;
    }
    if (!confirm('確定要自文獻庫中移除這篇文章嗎？')) return;

    library = library.filter(p => p.id !== id);
    saveLibraryToStorage(library);

    // If currently reading the deleted paper, fallback to attention
    if (activePaperId === id && library.length > 0) {
      handleSelectPaper(library[0]);
    }
  }

  function handleOpenImport() {
    dispatch('openImport');
  }

  function handleExportBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(library, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mugen_yomu_library_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
</script>

{#if isOpen}
  <!-- Drawer Container -->
  <div class="fixed inset-0 z-50 flex justify-start select-none">
    <!-- Drawer Backdrop -->
    <div
      role="button"
      tabindex="-1"
      aria-label="關閉文獻庫側邊面板"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      on:click={close}
      on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && close()}
    ></div>

    <!-- Slide-in Drawer -->
    <div
      class="relative w-full max-w-md bg-[#1d2021] border-r border-[#3c3836] h-full shadow-2xl flex flex-col z-10"
    >
      <!-- Drawer Header -->
      <div class="p-4 bg-[#141617] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-[#fe8019]/20 border border-[#fe8019]/60 flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-[18px]">library_books</span>
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-[#ebdbb2]">本地文獻與網頁庫 (Paper Repository)</h3>
            <span class="font-mono text-[10px] text-[#a89984]">已收錄 {library.length} 篇作品 · 本地加密存儲</span>
          </div>
        </div>

        <button
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]"
          on:click={close}
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Action Toolbar -->
      <div class="p-3 bg-[#1d2021] border-b border-[#3c3836] flex items-center gap-2">
        <button
          class="flex-1 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          on:click={handleOpenImport}
        >
          <span class="material-symbols-outlined text-[15px]">add_circle</span>
          匯入新論文 / 網頁
        </button>

        <button
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-xs font-mono rounded-lg flex items-center gap-1 transition-colors"
          on:click={handleExportBackup}
          title="匯出本機文獻庫備份 (JSON)"
        >
          <span class="material-symbols-outlined text-[15px]">download</span>
          備份
        </button>
      </div>

      <!-- Paper List Container -->
      <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {#each library as paper}
          <div
            role="button"
            tabindex="0"
            class="bg-[#282828] border rounded-xl p-3 flex flex-col gap-2 transition-all cursor-pointer hover:border-[#504945] {paper.id === activePaperId ? 'border-[#fe8019] shadow-[0_0_12px_rgba(254,128,25,0.2)] bg-[#32302f]' : 'border-[#3c3836]'}"
            on:click={() => handleSelectPaper(paper)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectPaper(paper)}
          >
            <div class="flex items-center justify-between">
              <!-- Type & Venue Badge -->
              <div class="flex items-center gap-1.5">
                {#if paper.type === 'web'}
                  <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-1.5 py-0.2 rounded font-semibold uppercase flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[10px]">language</span> 網頁文章
                  </span>
                {:else}
                  <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1.5 py-0.2 rounded font-semibold uppercase flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-[10px]">description</span> 學術論文
                  </span>
                {/if}
                <span class="font-mono text-[10px] text-[#a89984] truncate max-w-[170px]">{paper.venue}</span>
              </div>

              <!-- Active or Actions -->
              <div class="flex items-center gap-1">
                {#if paper.id === activePaperId}
                  <span class="font-mono text-[10px] text-[#fe8019] flex items-center gap-1 font-semibold">
                    <span class="h-1.5 w-1.5 rounded-full bg-[#fe8019] animate-pulse"></span>
                    當前研讀中
                  </span>
                {:else}
                  <button
                    class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#fb4934] hover:bg-[#1d2021] transition-colors"
                    title="刪除文章"
                    on:click={(e) => handleDeletePaper(paper.id, e)}
                  >
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                {/if}
              </div>
            </div>

            <!-- Title -->
            <h4 class="text-xs font-bold text-[#ebdbb2] line-clamp-2 leading-snug">
              {paper.title}
            </h4>

            <!-- Author / Meta -->
            <span class="text-[11px] text-[#a89984] truncate">
              {paper.authors.join(', ')}
            </span>

            <!-- Footer Stats -->
            <div class="pt-2 border-t border-[#3c3836]/60 flex items-center justify-between text-[#a89984] font-mono text-[10px]">
              <span>{paper.sections.length} 個章節</span>
              {#if paper.arxivId}
                <span class="text-[#fabd2f]">{paper.arxivId}</span>
              {:else if paper.sourceUrl}
                <span class="text-[#8ec07c] truncate max-w-[150px]">{new URL(paper.sourceUrl).hostname}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

    </div>
  </div>
{/if}
