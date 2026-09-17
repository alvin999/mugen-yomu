<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isOpen: boolean = false;
  export let imageUrl: string = '';
  export let caption: string = '學術圖表預覽';

  const dispatch = createEventDispatcher<{ close: void }>();

  let zoom: number = 1;

  function handleClose() {
    zoom = 1;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      handleClose();
    }
  }

  function toggleZoom() {
    zoom = zoom === 1 ? 1.6 : 1;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && imageUrl}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-md transition-opacity duration-200"
    on:click={handleClose}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Header Bar -->
    <div
      class="w-full max-w-5xl flex items-center justify-between pb-3 text-[#ebdbb2]"
      on:click|stopPropagation
      role="toolbar"
      tabindex="-1"
    >
      <div class="flex items-center gap-3 overflow-hidden">
        <span class="material-symbols-outlined text-[#fe8019] text-[20px]">image</span>
        <span class="font-mono text-sm font-bold text-[#fabd2f] truncate max-w-xl">
          {caption}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-1 font-mono text-xs bg-[#282828] px-3 py-1.5 rounded border border-[#3c3836] transition-colors"
          on:click={toggleZoom}
          title={zoom === 1 ? '放大圖表 (160%)' : '還原大小 (100%)'}
        >
          <span class="material-symbols-outlined text-[15px]">
            {zoom === 1 ? 'zoom_in' : 'zoom_out'}
          </span>
          <span>{Math.round(zoom * 100)}%</span>
        </button>

        <button
          type="button"
          class="text-[#a89984] hover:text-[#fe8019] flex items-center gap-1 font-mono text-xs bg-[#282828] px-3 py-1.5 rounded border border-[#3c3836] transition-colors hover:border-[#fe8019]/50"
          on:click={handleClose}
          title="關閉 (ESC)"
        >
          <span>關閉</span>
          <span class="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>
    </div>

    <!-- Image Viewport -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <div
      class="max-w-5xl max-h-[85vh] overflow-auto flex items-center justify-center rounded-lg cursor-zoom-in"
      on:click|stopPropagation={toggleZoom}
      role="figure"
      tabindex="-1"
    >
      <img
        src={imageUrl}
        alt={caption}
        style="transform: scale({zoom}); transform-origin: center center; transition: transform 0.2s ease-out;"
        class="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl border border-[#3c3836]"
      />
    </div>

    <!-- Caption / Hint -->
    <div class="pt-2 text-center text-xs text-[#a89984] font-mono">
      <span>點擊背景或按 ESC 鍵關閉 · 點擊圖片可縮放檢視</span>
    </div>
  </div>
{/if}
