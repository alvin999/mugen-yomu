<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../types/document';
  import { isPresetPaper } from '../../stores/documentStore';
  import { deactivateCursor, activateCursor } from '../../stores/vimCursorStore';

  export let isOpen: boolean = false;
  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher<{
    confirm: { id: string };
    cancel: void;
  }>();

  $: if (isOpen) {
    deactivateCursor();
  } else {
    activateCursor();
  }

  function handleCancel() {
    isOpen = false;
    dispatch('cancel');
  }

  function handleConfirm() {
    if (!paper) return;
    const id = paper.id;
    isOpen = false;
    dispatch('confirm', { id });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  }

  $: isPreset = paper ? isPresetPaper(paper.id) : false;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && paper}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fade-in"
    aria-modal="true"
    role="dialog"
  >
    <!-- Backdrop Click to Close -->
    <div
      class="fixed inset-0 cursor-default"
      on:click={handleCancel}
      role="button"
      tabindex="-1"
      aria-label="點擊遮罩關閉彈窗"
    ></div>

    <!-- Modal Card Container -->
    <div
      class="relative w-full max-w-md bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 animate-scale-up"
    >
      <!-- Header -->
      <div class="p-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-[#fb4934]/20 border border-[#fb4934]/50 flex items-center justify-center text-[#fb4934]">
            <span class="material-symbols-outlined text-[18px]">delete_forever</span>
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-[#ebdbb2]">移除文獻確認</h3>
            <span class="font-mono text-[10px] text-[#a89984]">Remove Paper from Repository</span>
          </div>
        </div>

        <button
          type="button"
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors cursor-pointer"
          on:click={handleCancel}
          title="關閉 (Esc)"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Body Content -->
      <div class="p-5 flex flex-col gap-4 text-xs">
        <!-- Paper Info Card -->
        <div class="bg-[#1d2021] border border-[#3c3836] rounded-lg p-3 flex flex-col gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            {#if isPreset}
              <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.2 rounded font-semibold uppercase flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[10px]">auto_stories</span> 內建核心文獻
              </span>
            {/if}
            {#if paper.type === 'web'}
              <span class="font-mono text-[9px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-1.5 py-0.2 rounded font-semibold uppercase flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[10px]">language</span> 網頁文章
              </span>
            {:else}
              <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1.5 py-0.2 rounded font-semibold uppercase flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[10px]">description</span> 學術論文
              </span>
            {/if}
            <span class="font-mono text-[10px] text-[#a89984] truncate max-w-[180px]">
              {paper.venue || '學術文庫'}
            </span>
            {#if paper.arxivId}
              <span class="font-mono text-[10px] text-[#fabd2f] bg-[#fabd2f]/10 px-1 py-0.2 rounded">
                {paper.arxivId}
              </span>
            {/if}
          </div>

          <h4 class="text-xs font-bold text-[#ebdbb2] leading-snug line-clamp-2">
            {paper.title}
          </h4>

          <div class="flex items-center justify-between text-[10px] font-mono text-[#a89984] pt-1.5 border-t border-[#3c3836]">
            <span class="truncate max-w-[200px]">
              {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || '未知作者')}
            </span>
            <span>{paper.sections?.length || 0} 個章節</span>
          </div>
        </div>

        <!-- Deletion Impact Warning -->
        <div class="bg-[#fb4934]/10 border border-[#fb4934]/30 rounded-lg p-3 flex items-start gap-2.5 text-[#fb4934]">
          <span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
          <div class="flex flex-col gap-1.5 text-[11px] leading-relaxed flex-1">
            <span class="font-bold text-[#ebdbb2]">確定要從本機文獻庫中移除這篇文章嗎？</span>
            <span class="text-[#d5c4a1]">此操作將從本地儲存中永久移除此文獻，並連同清除：</span>
            <div class="bg-[#1d2021]/80 rounded p-2 border border-[#3c3836] flex flex-col gap-1 text-[10.5px]">
              <div class="flex items-center gap-1.5 text-[#ebdbb2]">
                <span class="h-1.5 w-1.5 rounded-full bg-[#fb4934]"></span>
                <span>本機閱讀掌握度與章節進度狀態</span>
              </div>
              <div class="flex items-center gap-1.5 text-[#ebdbb2]">
                <span class="h-1.5 w-1.5 rounded-full bg-[#fb4934]"></span>
                <span>此文獻所關聯的所有精讀筆記</span>
              </div>
              <div class="flex items-center gap-1.5 text-[#ebdbb2]">
                <span class="h-1.5 w-1.5 rounded-full bg-[#fb4934]"></span>
                <span>PDF 與網頁閱讀之捲動進度與頁碼記憶</span>
              </div>
            </div>

            {#if isPreset}
              <div class="mt-1 pt-1.5 border-t border-[#fb4934]/20 text-[#fabd2f] text-[10.5px] flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">info</span>
                <span>此為內建核心文獻，刪除後若需要可隨時至「匯入」選單中的「經典推薦」重新載入 (Fallback)。</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="p-3 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-medium transition-colors cursor-pointer"
          on:click={handleCancel}
        >
          取消 (Esc)
        </button>

        <button
          type="button"
          class="px-3.5 py-1.5 bg-[#fb4934] hover:bg-[#cc241d] text-[#1d2021] hover:text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          on:click={handleConfirm}
        >
          <span class="material-symbols-outlined text-[15px]">delete</span>
          <span>確認移除文獻</span>
        </button>
      </div>
    </div>
  </div>
{/if}
