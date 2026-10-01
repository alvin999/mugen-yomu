<script lang="ts">
  import type { PaperDocument } from '../../stores/documentStore';
  import { t } from '../../stores/localeStore';

  interface Props {
    papers?: PaperDocument[];
    activePaperId?: string;
    progressMap?: Record<string, number>;
    notesCountMap?: Record<string, number>;
    onselect?: (data: { paper: PaperDocument }) => void;
    onviewCitation?: (data: { paper: PaperDocument }) => void;
    onviewNotes?: (data: { paper: PaperDocument }) => void;
    onpreview?: (data: { paper: PaperDocument }) => void;
    ondelete?: (data: { id: string }) => void;
  }

  let {
    papers = [],
    activePaperId = '',
    progressMap = {},
    notesCountMap = {},
    onselect,
    onviewCitation,
    onviewNotes,
    onpreview,
    ondelete
  }: Props = $props();
</script>

<div class="w-full overflow-x-auto bg-[#1d2021] border border-[#3c3836] rounded-xl select-none">
  <table class="w-full text-left border-collapse text-xs">
    <thead>
      <tr class="bg-[#141617] border-b border-[#3c3836] text-[#a89984] font-mono text-[11px]">
        <th class="py-3 px-4 w-28">{$t('repo.table.progress')}</th>
        <th class="py-3 px-4 min-w-[280px]">{$t('repo.table.titleAuthors')}</th>
        <th class="py-3 px-4 w-36">{$t('repo.table.typeVenue')}</th>
        <th class="py-3 px-4 w-40 text-center">{$t('repo.table.stats')}</th>
        <th class="py-3 px-4 w-44 text-right">{$t('repo.table.actions')}</th>
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
                    {$t('repo.table.current')}
                  </span>
                {:else if progress >= 100}
                  <span class="text-[#b8bb26] font-semibold">{$t('repo.table.completed')}</span>
                {:else}
                  <span class="text-[#a89984]">{$t('repo.table.inProgress')}</span>
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
                class="text-left font-bold text-[#ebdbb2] hover:text-[#fe8019] transition-colors truncate max-w-md block cursor-pointer"
                onclick={() => onselect?.({ paper })}
                title={paper.title}
              >
                {paper.title}
              </button>
              <span class="text-[11px] text-[#7c6f64] truncate max-w-sm">
                {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || $t('repo.table.unknownAuthor'))}
              </span>
            </div>
          </td>

          <!-- 3. Type & Venue -->
          <td class="py-3 px-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-1">
                {#if paper.type === 'web'}
                  <span class="font-mono text-[9px] bg-[#83a598]/15 text-[#83a598] px-1.5 py-0.2 rounded border border-[#83a598]/30 uppercase">{$t('repo.table.webBadge')}</span>
                {:else}
                  <span class="font-mono text-[9px] bg-[#fe8019]/15 text-[#fe8019] px-1.5 py-0.2 rounded border border-[#fe8019]/30 uppercase">{$t('repo.table.paperBadge')}</span>
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
              <span title={$t('repo.grid.sectionsTitle')}>{paper.sections?.length || 0} {$t('repo.table.sectionsUnit')}</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#fabd2f]" title={$t('repo.grid.formulasTitle')}>{formulaCount} {$t('repo.table.formulasUnit')}</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#8ec07c]" title={$t('repo.grid.figuresTitle')}>{figureCount} {$t('repo.table.figuresUnit')}</span>
              <span class="text-[#504945]">·</span>
              <span class="text-[#fe8019]" title={$t('repo.grid.notesTitle')}>{notesCount} {$t('repo.table.notesUnit')}</span>
            </div>
          </td>

          <!-- 5. Actions -->
          <td class="py-3 px-4 text-right">
            <div class="inline-flex items-center gap-1.5">
              <button
                class="px-2 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold text-xs rounded transition-colors cursor-pointer"
                onclick={() => onselect?.({ paper })}
                title={$t('repo.table.studyTooltip')}
              >
                {$t('repo.table.studyBtn')}
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#83a598] hover:bg-[#282828] rounded transition-colors cursor-pointer"
                onclick={() => onviewCitation?.({ paper })}
                title={$t('repo.table.citationTooltip')}
              >
                <span class="material-symbols-outlined text-[16px]">hub</span>
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#fabd2f] hover:bg-[#282828] rounded transition-colors cursor-pointer"
                onclick={() => onviewNotes?.({ paper })}
                title={$t('repo.table.notesTooltip')}
              >
                <span class="material-symbols-outlined text-[16px]">draw</span>
              </button>
              <button
                class="p-1 text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] rounded transition-colors cursor-pointer"
                onclick={() => onpreview?.({ paper })}
                title={$t('repo.table.previewTooltip')}
              >
                <span class="material-symbols-outlined text-[16px]">visibility</span>
              </button>
              <button
                type="button"
                class="p-1 text-[#7c6f64] hover:text-[#fb4934] hover:bg-[#282828] rounded transition-colors cursor-pointer"
                onclick={(e) => { e.stopPropagation(); ondelete?.({ id: paper.id }); }}
                title={$t('repo.table.deleteTooltip')}
              >
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
