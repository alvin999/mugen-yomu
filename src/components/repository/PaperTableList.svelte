<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';

  export let papers: PaperDocument[] = [];
  export let activePaperId: string = '';
  export let progressMap: Record<string, number> = {};
  export let notesCountMap: Record<string, number> = {};

  const dispatch = createEventDispatcher<{
    select: { paper: PaperDocument };
    viewCitation: { paper: PaperDocument };
    viewNotes: { paper: PaperDocument };
    preview: { paper: PaperDocument };
    delete: { id: string };
  }>();
</script>

<div class="w-full overflow-x-auto bg-[#1d2021] border border-[#3c3836] rounded-xl select-none">
  <table class="w-full text-left border-collapse text-xs">
    <thead>
      <tr class="bg-[#141617] border-b border-[#3c3836] text-[#a89984] font-mono text-[11px]">
        <th class="py-3 px-4 w-28">研讀進度</th>
        <th class="py-3 px-4 min-w-[280px]">文獻標題 / 作者</th>
        <th class="py-3 px-4 w-36">類型 / 出處</th>
        <th class="py-3 px-4 w-40 text-center">規模統計</th>
        <th class="py-3 px-4 w-44 text-right">操作動作</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-[#282828]">
      {#each papers as paper (paper.id)}
        {@const isActive = paper.id === activePaperId}
        {@const progress = progressMap[paper.id] || 0}
        {@const notesCount = notesCountMap[paper.id] || 0}
        {@const formulaCount = paper.sections?.reduce((sum, s) => sum + (s.formulas?.length || 0), 0) || 0}
        {@const figureCount = paper.sections?.reduce((sum, s) => sum + (s.figures?.length || 0), 0) || 0}
        <tr
          class="hover:bg-[#282828]/60 transition-colors {isActive ? 'bg-[#fe8019]/5' : ''}"
        >
          <!-- 1. Progress -->
          <td class="py-3 px-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between font-mono text-[10px]">
                {#if isActive}
                  <span class="text-[#fe8019] font-bold flex items-center gap-1">
                    <span class="h-1.5 w-1.5 rounded-full bg-[#fe8019] animate-pulse"></span>
                    當前
                  </span>
                {:else if progress >= 100}
                  <span class="text-[#b8bb26] font-semibold">精讀完畢</span>
                {:else}
                  <span class="text-[#a89984]">研讀中</span>
                {/if}
                <span class={progress >= 100 ? 'text-[#b8bb26]' : 'text-[#fabd2f]'}>{progress}%</span>
              </div>
              <div class="w-20 bg-[#141617] h-1.5 rounded-full overflow-hidden">
                <div
                  class="h-full {progress >= 100 ? 'bg-[#b8bb26]' : 'bg-[#fabd2f]'}"
                  style="width: {Math.max(3, Math.min(100, progress))}%"
                ></div>
              </div>
            </div>
          </td>

          <!-- 2. Title & Authors -->
          <td class="py-3 px-4">
            <div class="flex flex-col gap-0.5">
              <button
                class="text-left font-bold text-[#ebdbb2] hover:text-[#fe8019] transition-colors truncate max-w-md block"
                on:click={() => dispatch('select', { paper })}
                title={paper.title}
              >
                {paper.title}
              </button>
              <span class="text-[11px] text-[#7c6f64] truncate max-w-sm">
                {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || '未知作者')}
              </span>
            </div>
          </td>

          <!-- 3. Type & Venue -->
          <td class="py-3 px-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-1">
                {#if paper.type === 'web'}
                  <span class="font-mono text-[9px] bg-[#83a598]/15 text-[#83a598] px-1.5 py-0.2 rounded border border-[#83a598]/30 uppercase">網頁</span>
                {:else}
                  <span class="font-mono text-[9px] bg-[#fe8019]/15 text-[#fe8019] px-1.5 py-0.2 rounded border border-[#fe8019]/30 uppercase">論文</span>
                {/if}
                <span class="font-mono text-[10px] text-[#ebdbb2] truncate max-w-[90px]">{paper.venue}</span>
              </div>
              {#if paper.arxivId}
                <span class="font-mono text-[9px] text-[#fabd2f]">{paper.arxivId}</span>
              {/if}
            </div>
          </td>

          <!-- 4. Stats -->
          <td class="py-3 px-4 text-center">
            <div class="inline-flex items-center gap-2 font-mono text-[10px] text-[#a89984] bg-[#141617] px-2.5 py-1 rounded-lg border border-[#32302f]">
              <span title="章節數">{paper.sections?.length || 0} 章</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#fabd2f]" title="公式數">{formulaCount} 式</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#8ec07c]" title="圖表數">{figureCount} 圖</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#fe8019]" title="筆記數">{notesCount} 記</span>
            </div>
          </td>

          <!-- 5. Actions -->
          <td class="py-3 px-4 text-right">
            <div class="inline-flex items-center gap-1.5">
              <button
                class="px-2 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold text-xs rounded transition-colors"
                on:click={() => dispatch('select', { paper })}
                title="進入閱讀工作台"
              >
                研讀
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#83a598] hover:bg-[#282828] rounded transition-colors"
                on:click={() => dispatch('viewCitation', { paper })}
                title="引文星系圖譜"
              >
                <span class="material-symbols-outlined text-[16px]">hub</span>
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#fabd2f] hover:bg-[#282828] rounded transition-colors"
                on:click={() => dispatch('viewNotes', { paper })}
                title="查看精讀筆記"
              >
                <span class="material-symbols-outlined text-[16px]">draw</span>
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] rounded transition-colors"
                on:click={() => dispatch('preview', { paper })}
                title="預覽大綱"
              >
                <span class="material-symbols-outlined text-[16px]">visibility</span>
              </button>
              {#if !isActive}
                <button
                  class="p-1 text-[#7c6f64] hover:text-[#fb4934] hover:bg-[#282828] rounded transition-colors"
                  on:click={() => dispatch('delete', { id: paper.id })}
                  title="移除文獻"
                >
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
