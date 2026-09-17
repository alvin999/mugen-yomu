<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let pdfDoc: any = null;
  export let currentPage: number = 1;
  export let isLoadingPdf: boolean = false;
  export let isRenderingPage: boolean = false;
  export let renderError: string | null = null;
  export let canvasElement: HTMLCanvasElement | null = null;

  const dispatch = createEventDispatcher<{
    switchToText: void;
    retry: void;
    openExternal: void;
    canvasReady: { canvas: HTMLCanvasElement };
  }>();

  $: if (canvasElement) {
    dispatch('canvasReady', { canvas: canvasElement });
  }
</script>

<div class="w-full h-full p-4 overflow-auto flex justify-center items-start">
  {#if isLoadingPdf}
    <div class="w-full h-full flex flex-col items-center justify-center gap-3 text-xs font-mono text-[#fabd2f]">
      <span class="material-symbols-outlined text-3xl animate-spin text-[#fe8019]">sync</span>
      <span class="text-sm font-semibold">正在載入 PDF 結構...</span>
      <span class="text-[#a89984] text-[11px]">透過本機代理繞過 CORS 限制 · 請稍候</span>
    </div>
  {:else if pdfDoc}
    <!-- High-Fidelity PDF.js Canvas Renderer -->
    <div class="relative flex flex-col items-center shadow-2xl rounded bg-white">
      <canvas bind:this={canvasElement} class="block select-text max-w-full"></canvas>

      {#if isRenderingPage}
        <div class="absolute inset-0 bg-[#141617]/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-xs font-mono text-[#fabd2f]">
          <span class="material-symbols-outlined text-2xl animate-spin text-[#fe8019]">sync</span>
          <span>繪製第 {currentPage} 頁...</span>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Canvas Loading Failed or No PDF State -->
    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
      <div class="w-14 h-14 rounded-full bg-[#282828] border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
        <span class="material-symbols-outlined text-2xl">picture_as_pdf</span>
      </div>
      <div class="flex flex-col gap-1 max-w-md">
        <h4 class="text-sm font-bold text-[#ebdbb2]">PDF 畫布暫未能載入</h4>
        <p class="text-xs text-[#a89984] leading-relaxed">
          {renderError || '可能受限於目標期刊伺服器之 CORS 跨域防護。建議點擊下方切換為學術擬真排版模式，或開啟外部連結。'}
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-2 mt-2">
        <button
          class="px-3 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
          on:click={() => dispatch('switchToText')}
        >
          <span class="material-symbols-outlined text-[14px]">menu_book</span>
          <span>切換為學術排版模式 (推薦)</span>
        </button>

        <button
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#ebdbb2] rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
          on:click={() => dispatch('retry')}
        >
          <span class="material-symbols-outlined text-[14px]">sync</span>
          <span>重新載入</span>
        </button>

        <button
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#8ec07c] hover:text-[#b8bb26] rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
          on:click={() => dispatch('openExternal')}
        >
          <span class="material-symbols-outlined text-[14px]">open_in_new</span>
          <span>獨立新分頁開啟</span>
        </button>
      </div>
    </div>
  {/if}
</div>
