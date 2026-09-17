<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let authors: string[] = [];
  export let selectedAuthorInfo: string | null = null;

  const dispatch = createEventDispatcher<{
    selectAuthor: { author: string };
    closeAuthorInfo: void;
  }>();
</script>

<div class="text-xs text-[#a89984] flex flex-wrap items-center gap-x-1.5 gap-y-1 relative">
  {#each authors as author, i}
    <button
      class="text-[#d5c4a1] font-medium hover:text-[#fe8019] cursor-pointer transition-colors bg-transparent border-0 p-0 text-left"
      on:click={() => dispatch('selectAuthor', { author })}
      title="點擊查看作者貢獻度備註"
    >
      {author}{i < authors.length - 1 ? ',' : ''}
    </button>
  {/each}

  {#if selectedAuthorInfo}
    <div class="w-full mt-1 p-2 rounded-lg bg-[#1d2021] border border-[#fe8019]/40 text-[#ebdbb2] text-[11px] font-mono flex items-center justify-between shadow-lg animate-fade-in">
      <span>{selectedAuthorInfo} · 共同第一作者 / 核心演算法架構設計者 (* Equal contribution)</span>
      <button
        class="text-[#a89984] hover:text-[#ebdbb2] ml-2 font-bold cursor-pointer"
        on:click={() => dispatch('closeAuthorInfo')}
      >✕</button>
    </div>
  {/if}
</div>
