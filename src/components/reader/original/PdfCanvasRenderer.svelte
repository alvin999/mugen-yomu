<script lang="ts">
  import { t } from '../../../stores/localeStore';

  interface Props {
    pdfDoc?: any;
    currentPage?: number;
    isLoadingPdf?: boolean;
    isRenderingPage?: boolean;
    renderError?: string | null;
    canvasElement?: HTMLCanvasElement | null;
    onretry?: () => void;
    onopenExternal?: () => void;
  }

  let {
    pdfDoc = null,
    currentPage = 1,
    isLoadingPdf = false,
    isRenderingPage = false,
    renderError = null,
    canvasElement = $bindable(null),
    onretry,
    onopenExternal
  }: Props = $props();
</script>

<div class="w-full h-full p-4 overflow-auto">
  {#if isLoadingPdf}
    <div class="w-full h-full flex flex-col items-center justify-center gap-3 text-xs font-mono text-[#fabd2f]">
      <span class="material-symbols-outlined text-3xl animate-spin text-[#fe8019]">sync</span>
      <span class="text-sm font-semibold">{$t('reader.original.loadingPdf')}</span>
      <span class="text-[#a89984] text-[11px]">{$t('reader.original.proxyHint')}</span>
    </div>
  {:else if pdfDoc}
    <!-- High-Fidelity PDF.js Canvas Renderer (可超出視窗自由縮放與水平捲動) -->
    <div class="min-w-fit min-h-fit flex flex-col items-center mx-auto my-0">
      <div class="relative flex flex-col items-center shadow-2xl rounded bg-white">
        <canvas bind:this={canvasElement} class="block select-text max-w-none shadow-md"></canvas>

        {#if isRenderingPage}
          <div class="absolute inset-0 bg-[#141617]/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-xs font-mono text-[#fabd2f]">
            <span class="material-symbols-outlined text-2xl animate-spin text-[#fe8019]">sync</span>
            <span>{$t('reader.original.renderingPage', { page: currentPage })}</span>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Canvas Loading Failed or No PDF State -->
    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3">
      <div class="w-14 h-14 rounded-full bg-[#282828] border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
        <span class="material-symbols-outlined text-2xl">picture_as_pdf</span>
      </div>
      <div class="flex flex-col gap-1 max-w-md">
        <h4 class="text-sm font-bold text-[#ebdbb2]">{$t('reader.original.canvasLoadFailed')}</h4>
        <p class="text-xs text-[#a89984] leading-relaxed">
          {renderError || $t('reader.original.canvasDefaultError')}
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-2 mt-2">
        <button
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#ebdbb2] rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
          onclick={() => onretry?.()}
        >
          <span class="material-symbols-outlined text-[14px]">sync</span>
          <span>{$t('reader.original.reloadPdf')}</span>
        </button>

        <button
          class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#8ec07c] hover:text-[#b8bb26] rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
          onclick={() => onopenExternal?.()}
        >
          <span class="material-symbols-outlined text-[14px]">open_in_new</span>
          <span>{$t('reader.original.openNewTab')}</span>
        </button>
      </div>
    </div>
  {/if}
</div>
