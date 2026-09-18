<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export interface NoteEntry {
    id?: string;
    title: string;
    text: string;
    time: string;
    paperId?: string;
    paperTitle?: string;
    sectionId?: string;
    sectionTitle?: string;
    isPinned?: boolean;
  }

  export let notes: NoteEntry[] = [];
  export let selectedIndex: number = 0;
  export let currentPaperTitle: string = '全部文獻';

  const dispatch = createEventDispatcher<{
    selectNote: { index: number };
    addNote: void;
    deleteNote: { index: number };
    togglePin: { index: number };
  }>();

  let searchQuery: string = '';

  $: filteredNotes = notes.map((note, index) => ({ note, index })).filter(({ note }) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (note.title || '').toLowerCase().includes(q) || (note.text || '').toLowerCase().includes(q);
  });
</script>

<section class="w-80 bg-[#1d2021] border-r border-[#3c3836] flex flex-col justify-between shrink-0 h-full select-none">
  <!-- Top Search & Add Button -->
  <div class="p-3 border-b border-[#3c3836] flex flex-col gap-2.5 shrink-0">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5 min-w-0">
        <h3 class="font-bold text-xs text-[#ebdbb2] truncate">{currentPaperTitle}</h3>
        <span class="font-mono text-[10px] bg-[#282828] text-[#fabd2f] px-1.5 py-0.2 rounded border border-[#3c3836] shrink-0">
          {notes.length}
        </span>
      </div>

      <button
        class="px-2 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold text-xs rounded-lg flex items-center gap-1 transition-colors shadow-sm cursor-pointer shrink-0"
        on:click={() => dispatch('addNote')}
        title="手動新增一筆精讀觀點"
      >
        <span class="material-symbols-outlined text-[15px]">add</span>
        <span>新增筆記</span>
      </button>
    </div>

    <!-- Search input -->
    <div class="relative w-full">
      <span class="material-symbols-outlined absolute left-2.5 top-2 text-[14px] text-[#7c6f64]">search</span>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="搜尋筆記標題、概念、內文..."
        class="w-full bg-[#282828] border border-[#3c3836] focus:border-[#fe8019] text-[#ebdbb2] placeholder-[#7c6f64] rounded-lg pl-8 pr-7 py-1 text-xs outline-none transition-colors"
      />
      {#if searchQuery}
        <button
          class="absolute right-2 top-1.5 text-[#7c6f64] hover:text-[#ebdbb2]"
          on:click={() => searchQuery = ''}
        >
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Note Items List -->
  <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
    {#if filteredNotes.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#7c6f64]">
        <span class="material-symbols-outlined text-[28px] mb-2 opacity-60">edit_note</span>
        <span class="text-xs font-medium text-[#a89984]">目前無相關精讀筆記</span>
        <span class="text-[10px] mt-1">點擊上方「新增筆記」或於閱讀器中標註</span>
      </div>
    {:else}
      {#each filteredNotes as { note, index } (index)}
        {@const isSelected = selectedIndex === index}
        <div
          class="p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col gap-1.5 {isSelected ? 'bg-[#282828] border-[#fe8019] shadow-sm' : 'bg-[#282828]/40 border-[#3c3836] hover:border-[#504945] hover:bg-[#282828]/80'}"
          on:click={() => dispatch('selectNote', { index })}
          role="button"
          tabindex="0"
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && dispatch('selectNote', { index })}
        >
          <!-- Card Top: Title & Pin/Delete -->
          <div class="flex items-start justify-between gap-1.5">
            <h4 class="text-xs font-bold truncate flex-1 {isSelected ? 'text-[#fe8019]' : 'text-[#ebdbb2] group-hover:text-[#fe8019]'}">
              {note.title}
            </h4>

            <div class="flex items-center gap-0.5 shrink-0">
              <button
                class="w-5 h-5 rounded flex items-center justify-center transition-colors {note.isPinned ? 'text-[#fabd2f]' : 'text-[#504945] opacity-0 group-hover:opacity-100 hover:text-[#fabd2f]'}"
                on:click|stopPropagation={() => dispatch('togglePin', { index })}
                title={note.isPinned ? '取消釘選' : '釘選此筆記'}
              >
                <span class="material-symbols-outlined text-[13px]">{note.isPinned ? 'star' : 'star_border'}</span>
              </button>
              <button
                class="w-5 h-5 rounded flex items-center justify-center text-[#504945] hover:text-[#fb4934] transition-colors opacity-0 group-hover:opacity-100"
                on:click|stopPropagation={() => dispatch('deleteNote', { index })}
                title="刪除筆記"
              >
                <span class="material-symbols-outlined text-[13px]">delete</span>
              </button>
            </div>
          </div>

          <!-- Snippet preview -->
          <p class="text-[11px] text-[#a89984] line-clamp-2 leading-relaxed font-sans">
            {note.text || '無內文'}
          </p>

          <!-- Card Footer: Section/Paper badge & Time -->
          <div class="flex items-center justify-between pt-1 border-t border-[#3c3836]/40 text-[10px] font-mono text-[#7c6f64]">
            <span class="truncate max-w-[150px] text-[#fabd2f]/90 bg-[#141617] px-1 py-0.2 rounded border border-[#32302f]">
              {note.sectionTitle || note.paperTitle || '精讀心得'}
            </span>
            <span>{note.time}</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>
