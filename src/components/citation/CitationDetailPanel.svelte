<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SimNode } from '../../services/citation/citationPhysicsEngine';

  export let selectedNode: SimNode | null = null;
  export let categoryMeta: Record<string, { name: string; color: string; bgBadge: string; borderBadge: string }>;

  const dispatch = createEventDispatcher<{
    close: void;
    loadPaper: { paperId: string };
  }>();

  $: meta = selectedNode ? categoryMeta[selectedNode.category] : null;

  function handleLoadTarget(targetPaperId?: string) {
    if (!targetPaperId) return;
    dispatch('loadPaper', { paperId: targetPaperId });
  }
</script>

{#if selectedNode && meta}
  <aside class="w-96 bg-[#1d2021] border-l border-[#3c3836] flex flex-col h-full z-20 shadow-2xl overflow-y-auto animate-fade-in shrink-0">
    <!-- Dossier Header -->
    <div class="p-4 border-b border-[#3c3836] bg-[#141617]/60 flex items-start justify-between">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <span
            class="font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
            style="background: {meta.bgBadge}; color: {meta.color}; border: 1px solid {meta.borderBadge};"
          >
            {meta.name}
          </span>
          <span class="font-mono text-[11px] text-[#fabd2f] font-semibold">
            {selectedNode.year}
          </span>
        </div>
        <h3 class="text-sm font-serif font-bold text-[#ebdbb2] leading-snug pt-1">
          {selectedNode.title}
        </h3>
      </div>
      <button
        class="text-[#a89984] hover:text-[#ebdbb2] p-1 rounded hover:bg-[#282828] transition-colors"
        on:click={() => dispatch('close')}
        title="收合卷宗"
      >
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>

    <!-- Dossier Content Body -->
    <div class="p-4 flex flex-col gap-4 text-xs">

      <!-- Authors & Venue Card -->
      <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-xl flex flex-col gap-2 shadow-inner">
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-[#a89984] font-mono">發表場域 / 會議</span>
          <span class="text-[#fabd2f] font-mono font-medium">{selectedNode.venue}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[#a89984] font-mono text-[10px]">作者群 (Authors)</span>
          <span class="text-[#d5c4a1] leading-relaxed">
            {selectedNode.authors.join(', ')}
          </span>
        </div>
        {#if selectedNode.citations}
          <div class="pt-2 border-t border-[#3c3836] flex items-center justify-between">
            <span class="text-[#a89984] font-mono text-[10px]">總引用數 (Citations)</span>
            <span class="text-[#8ec07c] font-mono font-bold bg-[#8ec07c]/10 px-2 py-0.5 rounded border border-[#8ec07c]/30">
              {selectedNode.citations}
            </span>
          </div>
        {/if}
      </div>

      <!-- Highlight: Lineage & Intellectual Heritage Connection -->
      <div class="bg-[#282828] border-l-4 p-3.5 rounded-r-xl flex flex-col gap-1.5 shadow-md" style="border-left-color: {meta.color};">
        <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold" style="color: {meta.color};">
          <span class="material-symbols-outlined text-[16px]">account_tree</span>
          <span>與研讀主文之學術承接關係</span>
        </div>
        <p class="text-[#ebdbb2] leading-relaxed text-[12px] bg-[#1d2021]/80 p-2.5 rounded-lg border border-[#3c3836]">
          {selectedNode.connectionSnippet}
        </p>
      </div>

      <!-- Core Insight & Breakthrough -->
      {#if selectedNode.coreInsight}
        <div class="flex flex-col gap-1.5">
          <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">lightbulb</span>
            核心理論突破與貢獻 (Core Insight)
          </span>
          <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-lg text-[#d5c4a1] leading-relaxed text-[11px]">
            {selectedNode.coreInsight}
          </div>
        </div>
      {/if}

      <!-- External Academic Links (arXiv / DOI) -->
      <div class="flex items-center gap-2 pt-1">
        {#if selectedNode.arxivId}
          <a
            href="https://arxiv.org/abs/{selectedNode.arxivId.replace(/^arxiv:/i, '')}"
            target="_blank"
            rel="noreferrer"
            class="flex-1 py-2 px-3 rounded-lg bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#ebdbb2] text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
          >
            <span class="material-symbols-outlined text-[14px] text-[#fe8019]">open_in_new</span>
            <span>arXiv:{selectedNode.arxivId}</span>
          </a>
        {/if}

        {#if selectedNode.doi}
          <a
            href="https://doi.org/{selectedNode.doi}"
            target="_blank"
            rel="noreferrer"
            class="flex-1 py-2 px-3 rounded-lg bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#8ec07c] text-[#ebdbb2] text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
          >
            <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">link</span>
            <span>DOI 官方索引</span>
          </a>
        {/if}
      </div>

      <!-- Action: One-Click Load Into Reading Workspace -->
      {#if selectedNode.targetPaperId}
        <button
          class="mt-2 w-full py-2.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#141617] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer text-xs"
          on:click={() => handleLoadTarget(selectedNode?.targetPaperId)}
        >
          <span class="material-symbols-outlined text-[17px]">auto_stories</span>
          <span>載入此論文並進入雙語伴讀</span>
        </button>
      {/if}

    </div>

    <!-- Dossier Footer Note -->
    <div class="mt-auto p-3 border-t border-[#3c3836] bg-[#141617]/50 text-center text-[#a89984] font-mono text-[10px]">
      MUGEN YOMU Scholar Citation Graph · BETA
    </div>
  </aside>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.25s ease-out forwards;
  }
</style>
