<script lang="ts">
  import { t } from '../../../stores/localeStore';

  interface Props {
    authors?: string[];
    selectedAuthorInfo?: string | null;
    onselectAuthor?: (data: { author: string }) => void;
    oncloseAuthorInfo?: () => void;
  }

  let {
    authors = [],
    selectedAuthorInfo = null,
    onselectAuthor,
    oncloseAuthorInfo
  }: Props = $props();
</script>

<div class="text-xs text-[#a89984] flex flex-wrap items-center gap-x-1.5 gap-y-1 relative">
  {#each authors as author, i}
    <button
      class="text-[#d5c4a1] font-medium hover:text-[#fe8019] cursor-pointer transition-colors bg-transparent border-0 p-0 text-left"
      onclick={() => onselectAuthor?.({ author })}
      title={$t('reader.author.contribTooltip')}
    >
      {author}{i < authors.length - 1 ? ',' : ''}
    </button>
  {/each}

  {#if selectedAuthorInfo}
    <div class="w-full mt-1 p-2 rounded-lg bg-[#1d2021] border border-[#fe8019]/40 text-[#ebdbb2] text-[11px] font-mono flex items-center justify-between shadow-lg animate-fade-in">
      <span>{selectedAuthorInfo} · {$t('reader.author.equalContrib')}</span>
      <button
        class="text-[#a89984] hover:text-[#ebdbb2] ml-2 font-bold cursor-pointer"
        onclick={() => oncloseAuthorInfo?.()}
      >✕</button>
    </div>
  {/if}
</div>
