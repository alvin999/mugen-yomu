<script lang="ts">
  import { renderNoteMarkdown } from '../../utils/markdownNoteRenderer';
  import type { NoteEntry } from './NotesExplorerList.svelte';
  import { t } from '../../stores/localeStore';

  interface Props {
    note?: NoteEntry | null;
    viewMode?: 'split' | 'edit' | 'preview';
    onupdateNote?: (detail: { note: NoteEntry }) => void;
    onjumpToSource?: (detail: { note: NoteEntry }) => void;
    ondeleteNote?: () => void;
    oncopyMarkdown?: () => void;
    onexportMarkdown?: () => void;
  }

  let {
    note = null,
    viewMode = $bindable('split'),
    onupdateNote,
    onjumpToSource,
    ondeleteNote,
    oncopyMarkdown,
    onexportMarkdown
  }: Props = $props();

  let isSaving = $state(false);
  let autoSaveMessage = $derived(isSaving ? $t('notes.autoSaving') : $t('notes.autoSaveSynced'));
  let autoSaveTimer: any = null;

  function triggerAutoSave() {
    isSaving = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (note) {
        onupdateNote?.({ note });
      }
      isSaving = false;
    }, 400);
  }

  function handleTitleInput(e: Event) {
    if (!note) return;
    note.title = (e.target as HTMLInputElement).value;
    triggerAutoSave();
  }

  function handleTextInput(e: Event) {
    if (!note) return;
    note.text = (e.target as HTMLTextAreaElement).value;
    triggerAutoSave();
  }

  function insertFormatting(prefix: string, suffix: string = '') {
    const textarea = document.getElementById('note-markdown-textarea') as HTMLTextAreaElement;
    if (!textarea || !note) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    const replacement = prefix + (selected || 'Text') + suffix;
    note.text = before + replacement + after;
    triggerAutoSave();

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected || 'Text').length);
    }, 10);
  }

  let renderedHtml = $derived(note ? renderNoteMarkdown(note.text) : '');
</script>

<main class="flex-1 flex flex-col bg-[#282828] h-full overflow-hidden select-text">
  {#if !note}
    <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#7c6f64]">
      <div class="w-14 h-14 rounded-2xl bg-[#1d2021] border border-[#3c3836] flex items-center justify-center text-[#7c6f64] mb-3">
        <span class="material-symbols-outlined text-[32px]">draw</span>
      </div>
      <h3 class="text-sm font-bold text-[#ebdbb2] mb-1">{$t('notes.unselectedTitle')}</h3>
      <p class="text-xs text-[#a89984] max-w-xs">
        {$t('notes.unselectedHint')}
      </p>
    </div>
  {:else}
    <!-- Top Action Toolbar -->
    <div class="p-3 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between gap-3 shrink-0 select-none">
      <!-- Left: Source paper & Jump Button -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-mono text-[10px] bg-[#282828] border border-[#3c3836] text-[#fabd2f] px-2 py-0.5 rounded truncate max-w-[200px]">
          {note.paperTitle || $t('notes.allLibrary')}
        </span>

        {#if note.sectionTitle || note.sectionId}
          <button
            class="px-2 py-0.5 bg-[#fe8019]/10 hover:bg-[#fe8019]/25 border border-[#fe8019]/40 text-[#fe8019] rounded text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
            onclick={() => onjumpToSource?.({ note })}
            title={$t('notes.jumpToSource')}
          >
            <span class="material-symbols-outlined text-[13px]">my_location</span>
            <span class="truncate max-w-[240px]">§ {note.sectionTitle || note.sectionId} ({$t('notes.jumpToSource')})</span>
          </button>
        {/if}

        <span class="font-mono text-[10px] text-[#7c6f64] hidden sm:inline">
          {autoSaveMessage}
        </span>
      </div>

      <!-- Right: View Mode Toggle & Utility Buttons -->
      <div class="flex items-center gap-1.5">
        <!-- View mode tabs -->
        <div class="flex items-center bg-[#282828] border border-[#3c3836] rounded-lg p-0.5">
          <button
            class="px-2 py-0.5 text-xs font-mono rounded transition-colors {viewMode === 'split' ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            onclick={() => viewMode = 'split'}
            title={$t('notes.viewSplit')}
          >
            {$t('notes.viewSplit')}
          </button>
          <button
            class="px-2 py-0.5 text-xs font-mono rounded transition-colors {viewMode === 'edit' ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            onclick={() => viewMode = 'edit'}
            title={$t('notes.viewEdit')}
          >
            {$t('notes.viewEdit')}
          </button>
          <button
            class="px-2 py-0.5 text-xs font-mono rounded transition-colors {viewMode === 'preview' ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            onclick={() => viewMode = 'preview'}
            title={$t('notes.viewPreview')}
          >
            {$t('notes.viewPreview')}
          </button>
        </div>

        <!-- Copy Markdown -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fabd2f] text-[#fabd2f] rounded-lg text-xs transition-colors cursor-pointer"
          onclick={() => oncopyMarkdown?.()}
          title={$t('common.copy')}
        >
          <span class="material-symbols-outlined text-[15px]">content_copy</span>
        </button>

        <!-- Export File -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#fe8019] rounded-lg text-xs transition-colors cursor-pointer"
          onclick={() => onexportMarkdown?.()}
          title={$t('notes.exportSingle')}
        >
          <span class="material-symbols-outlined text-[15px]">download</span>
        </button>

        <!-- Delete -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fb4934] text-[#a89984] hover:text-[#fb4934] rounded-lg text-xs transition-colors cursor-pointer"
          onclick={() => ondeleteNote?.()}
          title={$t('notes.deleteNote')}
        >
          <span class="material-symbols-outlined text-[15px]">delete</span>
        </button>
      </div>
    </div>

    <!-- Title Input Area -->
    <div class="px-6 pt-4 pb-2 bg-[#282828] border-b border-[#3c3836]/60 flex items-center gap-3">
      <input
        type="text"
        value={note.title}
        oninput={handleTitleInput}
        placeholder={$t('notes.titlePlaceholder')}
        class="flex-1 bg-transparent text-lg font-bold text-[#ebdbb2] focus:text-[#fe8019] placeholder-[#7c6f64] outline-none border-b border-transparent focus:border-[#fe8019]/40 py-1 transition-colors"
      />
      <span class="font-mono text-[11px] text-[#7c6f64] shrink-0">
        {note.time}
      </span>
    </div>

    <!-- Quick Markdown Formatting Bar (Only when editor is visible) -->
    {#if viewMode !== 'preview'}
      <div class="px-6 py-1.5 bg-[#1d2021]/80 border-b border-[#3c3836] flex items-center gap-1 select-none overflow-x-auto">
        <button class="px-2 py-0.5 rounded text-xs font-bold text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" onclick={() => insertFormatting('**', '**')} title="Bold (**)">B</button>
        <button class="px-2 py-0.5 rounded text-xs italic text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" onclick={() => insertFormatting('*', '*')} title="Italic (*)">I</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" onclick={() => insertFormatting('`', '`')} title="Inline Code (`code`)">&lt;/&gt;</button>
        <button class="px-2 py-0.5 rounded text-xs text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" onclick={() => insertFormatting('> ')} title="Quote (&gt;)">Quote</button>
        <button class="px-2 py-0.5 rounded text-xs text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" onclick={() => insertFormatting('- ')} title="List (-)">List</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#fabd2f] hover:bg-[#282828]" onclick={() => insertFormatting('$', '$')} title="Inline Math ($x$)">$ x $</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#fe8019] hover:bg-[#282828]" onclick={() => insertFormatting('$$\n', '\n$$')} title="Block Math ($$x$$)">$$ Block $$</button>
      </div>
    {/if}

    <!-- Editor & Preview Body -->
    <div class="flex-1 overflow-hidden flex divide-x divide-[#3c3836]">
      <!-- Left / Editor Area -->
      {#if viewMode === 'split' || viewMode === 'edit'}
        <div class="flex-1 h-full overflow-y-auto p-6 flex flex-col">
          <textarea
            id="note-markdown-textarea"
            value={note.text}
            oninput={handleTextInput}
            placeholder={$t('notes.contentPlaceholder')}
            class="w-full flex-1 bg-transparent text-[#d5c4a1] placeholder-[#7c6f64] font-mono text-xs leading-relaxed resize-none outline-none border-none"
          ></textarea>
        </div>
      {/if}

      <!-- Right / Preview Area -->
      {#if viewMode === 'split' || viewMode === 'preview'}
        <div class="flex-1 h-full overflow-y-auto p-6 bg-[#1f2223] flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-3 border-b border-[#3c3836]/60">
            <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px] text-[#b8bb26]">visibility</span>
              {$t('notes.previewBanner')}
            </span>
          </div>
          <div class="prose prose-invert max-w-none text-xs leading-relaxed select-text">
            {@html renderedHtml}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</main>
