<script lang="ts">
  import type { PaperDocument } from '../../stores/documentStore';
  import { t } from '../../stores/localeStore';

  interface Props {
    isOpen?: boolean;
    activePaper?: PaperDocument | null;
    notes?: Array<{ title: string; text: string; time: string }>;
    onclose?: () => void;
    onupdateNotes?: (detail: { notes: Array<{ title: string; text: string; time: string }> }) => void;
  }

  let {
    isOpen = $bindable(false),
    activePaper = null,
    notes = $bindable([]),
    onclose,
    onupdateNotes
  }: Props = $props();

  let newNoteTitle = $state('');
  let newNoteText = $state('');
  let isAddingNote = $state(false);
  let editingIndex = $state<number | null>(null);
  let editTitle = $state('');
  let editText = $state('');
  let copyFeedback = $state('');
  let copyFeedbackTimer: any = null;

  function close() {
    isOpen = false;
    isAddingNote = false;
    editingIndex = null;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  function handleAddNote() {
    if (!newNoteText.trim()) return;

    const title = newNoteTitle.trim() || `Note · ${activePaper?.title || 'Paper Keypoint'}`;
    const newNote = {
      title,
      text: newNoteText.trim(),
      time: new Date().toLocaleTimeString()
    };

    notes = [newNote, ...notes];
    newNoteTitle = '';
    newNoteText = '';
    isAddingNote = false;
    onupdateNotes?.({ notes });
  }

  function handleStartEdit(index: number) {
    editingIndex = index;
    editTitle = notes[index].title;
    editText = notes[index].text;
  }

  function handleSaveEdit(index: number) {
    if (editingIndex === null) return;
    notes[index] = {
      ...notes[index],
      title: editTitle.trim() || notes[index].title,
      text: editText.trim() || notes[index].text
    };
    notes = [...notes];
    editingIndex = null;
    onupdateNotes?.({ notes });
  }

  function handleCancelEdit() {
    editingIndex = null;
  }

  function handleDeleteNote(index: number) {
    if (!confirm($t('notes.deleteConfirm'))) return;
    notes = notes.filter((_, i) => i !== index);
    if (editingIndex === index) editingIndex = null;
    onupdateNotes?.({ notes });
  }

  function handleClearAllNotes() {
    if (!confirm($t('notes.clearConfirm'))) return;
    notes = [];
    editingIndex = null;
    onupdateNotes?.({ notes });
  }

  function handleAddSampleNote() {
    const sample = {
      title: `Sample Note · ${activePaper?.title || 'Attention Is All You Need'}`,
      text: 'Scaled Dot-Product Attention eliminates recurrent dependencies, and dividing by √d_k prevents Softmax vanishing gradients. Multi-Head Attention allows joint attendance across representation subspaces.',
      time: new Date().toLocaleTimeString()
    };
    notes = [sample, ...notes];
    onupdateNotes?.({ notes });
  }

  function generateMarkdown(): string {
    let md = `# MUGEN YOMU Notes Export\n\n`;
    md += `**Document**: ${activePaper?.title || 'Untitled'}\n`;
    md += `**Venue**: ${activePaper?.venue || 'Library'} (${activePaper?.arxivId || activePaper?.sourceUrl || 'Local Document'})\n`;
    md += `**Export Time**: ${new Date().toLocaleString()}\n`;
    md += `**Total Notes**: ${notes.length}\n\n---\n\n`;

    notes.forEach((n, idx) => {
      md += `### ${idx + 1}. ${n.title}\n`;
      md += `> Recorded: ${n.time}\n\n`;
      md += `${n.text}\n\n`;
    });

    return md;
  }

  async function handleCopyMarkdown() {
    if (notes.length === 0) return;
    const md = generateMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      showFeedback($t('notes.copySuccess'));
    } catch {
      showFeedback($t('notes.copyFail'));
    }
  }

  async function handleCopySingle(note: { title: string; text: string; time: string }) {
    const text = `### ${note.title} (${note.time})\n${note.text}`;
    try {
      await navigator.clipboard.writeText(text);
      showFeedback($t('notes.copySingleSuccess'));
    } catch {
      showFeedback($t('notes.copySingleFail'));
    }
  }

  function showFeedback(msg: string) {
    copyFeedback = msg;
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback = '';
    }, 2500);
  }

  function handleExportFile() {
    if (notes.length === 0) {
      alert($t('notes.noNotesAlert'));
      return;
    }
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `MUGEN_YOMU_Notes_${activePaper?.id || 'paper'}.md`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
    showFeedback($t('notes.downloadTriggered'));
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-default"
      onclick={close}
      role="button"
      tabindex="-1"
      aria-label={$t('common.closeModal')}
      onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && close()}
    ></div>

    <!-- Modal Container (select-text enabled for reading and copying) -->
    <div
      class="relative w-full max-w-3xl max-h-[88vh] bg-[#1d2021] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col select-text transition-all duration-200 z-10"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div class="p-4 bg-[#141617] border-b border-[#3c3836] flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#fabd2f]/15 border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
            <span class="material-symbols-outlined text-[20px]">draw</span>
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-[#ebdbb2] tracking-wide">{$t('notes.manageTitle')}</h3>
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-[#32302f] border border-[#504945] text-[#fabd2f]">
                {$t('notes.notesCollected', { count: notes.length })}
              </span>
            </div>
            <span class="font-mono text-[11px] text-[#a89984] truncate max-w-[480px]">
              {activePaper?.title || $t('notes.currentPaper')}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fabd2f]/50 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            onclick={() => isAddingNote = !isAddingNote}
            title={$t('notes.addNoteTooltip')}
          >
            <span class="material-symbols-outlined text-[15px]">{isAddingNote ? 'close' : 'add'}</span>
            <span>{isAddingNote ? $t('notes.cancelAdd') : $t('notes.addQuickNote')}</span>
          </button>

          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors"
            onclick={close}
            title={$t('notes.closeTooltip')}
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      <!-- Quick Add Form Area (Collapsible) -->
      {#if isAddingNote}
        <div class="p-3.5 bg-[#282828] border-b border-[#3c3836] flex flex-col gap-2.5 animate-fade-in shrink-0">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-[#fe8019]">edit_note</span>
            <span class="text-xs font-semibold text-[#ebdbb2]">{$t('notes.newNoteHeader')}</span>
          </div>
          <input
            type="text"
            bind:value={newNoteTitle}
            placeholder={$t('notes.titlePlaceholder')}
            class="w-full bg-[#1d2021] border border-[#3c3836] focus:border-[#fe8019] rounded-lg px-3 py-1.5 text-xs text-[#ebdbb2] placeholder-[#7c6f64] outline-none transition-colors"
          />
          <textarea
            bind:value={newNoteText}
            rows="3"
            placeholder={$t('notes.contentPlaceholder')}
            class="w-full bg-[#1d2021] border border-[#3c3836] focus:border-[#fe8019] rounded-lg p-3 text-xs text-[#ebdbb2] placeholder-[#7c6f64] outline-none resize-none transition-colors leading-relaxed"
          ></textarea>
          <div class="flex items-center justify-end gap-2">
            <button
              class="px-3 py-1 text-xs text-[#a89984] hover:text-[#ebdbb2] transition-colors"
              onclick={() => { isAddingNote = false; newNoteText = ''; }}
            >
              {$t('notes.cancel')}
            </button>
            <button
              class="px-3.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] disabled:opacity-50 disabled:cursor-not-allowed text-[#1d2021] font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              disabled={!newNoteText.trim()}
              onclick={handleAddNote}
            >
              <span class="material-symbols-outlined text-[14px]">save</span>
              <span>{$t('notes.saveToLibrary')}</span>
            </button>
          </div>
        </div>
      {/if}

      <!-- Toast Feedback Bar -->
      {#if copyFeedback}
        <div class="px-4 py-1.5 bg-[#b8bb26]/20 border-b border-[#b8bb26]/40 text-[#b8bb26] text-xs font-mono flex items-center justify-between animate-fade-in shrink-0">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">check_circle</span>
            <span>{copyFeedback}</span>
          </div>
          <button class="text-[#a89984] hover:text-[#ebdbb2]" onclick={() => copyFeedback = ''}>
            <span class="material-symbols-outlined text-[12px]">close</span>
          </button>
        </div>
      {/if}

      <!-- Notes Content Scrollable List -->
      <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-3 min-h-[220px]">
        {#if notes.length === 0}
          <!-- Empty State -->
          <div class="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
            <div class="w-14 h-14 rounded-2xl bg-[#282828] border border-[#3c3836] flex items-center justify-center text-[#7c6f64] mb-3 shadow-inner">
              <span class="material-symbols-outlined text-[32px]">note_alt</span>
            </div>
            <h4 class="text-sm font-bold text-[#ebdbb2] mb-1">{$t('notes.emptyTitle')}</h4>
            <p class="text-xs text-[#a89984] max-w-md leading-relaxed mb-4">
              {$t('notes.emptyDesc')}
            </p>
            <div class="flex items-center gap-2">
              <button
                class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f]/50 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
                onclick={handleAddSampleNote}
              >
                <span class="material-symbols-outlined text-[15px]">auto_stories</span>
                <span>{$t('notes.loadDemo')}</span>
              </button>
              <button
                class="px-3 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                onclick={() => isAddingNote = true}
              >
                <span class="material-symbols-outlined text-[15px]">add</span>
                <span>{$t('notes.addFirst')}</span>
              </button>
            </div>
          </div>
        {:else}
          <!-- Card List -->
          {#each notes as note, idx}
            <div
              class="bg-[#282828] border border-[#3c3836] hover:border-[#504945] rounded-xl p-3.5 transition-all flex flex-col gap-2 shadow-sm group"
            >
              <!-- Card Header -->
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <span class="font-mono text-[10px] text-[#fe8019] bg-[#1d2021] border border-[#3c3836] px-1.5 py-0.5 rounded shrink-0">
                    #{idx + 1}
                  </span>
                  {#if editingIndex === idx}
                    <input
                      type="text"
                      bind:value={editTitle}
                      class="flex-1 bg-[#1d2021] border border-[#fe8019] rounded px-2 py-0.5 text-xs text-[#ebdbb2] outline-none"
                    />
                  {:else}
                    <h4 class="text-xs font-bold text-[#ebdbb2] truncate">
                      {note.title}
                    </h4>
                  {/if}
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="font-mono text-[10px] text-[#7c6f64]">
                    {note.time}
                  </span>

                  {#if editingIndex === idx}
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#b8bb26] hover:bg-[#1d2021] transition-colors"
                      onclick={() => handleSaveEdit(idx)}
                      title={$t('notes.saveEditTooltip')}
                    >
                      <span class="material-symbols-outlined text-[15px]">done</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:bg-[#1d2021] transition-colors"
                      onclick={handleCancelEdit}
                      title={$t('notes.cancelEditTooltip')}
                    >
                      <span class="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  {:else}
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#fabd2f] hover:bg-[#1d2021] transition-colors"
                      onclick={() => handleCopySingle(note)}
                      title={$t('notes.copyNoteTooltip')}
                    >
                      <span class="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#1d2021] transition-colors"
                      onclick={() => handleStartEdit(idx)}
                      title={$t('notes.editNoteTooltip')}
                    >
                      <span class="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#fb4934] hover:bg-[#1d2021] transition-colors"
                      onclick={() => handleDeleteNote(idx)}
                      title={$t('notes.deleteNoteTooltip')}
                    >
                      <span class="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Card Body -->
              {#if editingIndex === idx}
                <textarea
                  bind:value={editText}
                  rows="4"
                  class="w-full bg-[#1d2021] border border-[#fe8019] rounded p-2 text-xs text-[#ebdbb2] outline-none leading-relaxed resize-none"
                ></textarea>
              {:else}
                <p class="text-xs text-[#d5c4a1] leading-relaxed whitespace-pre-wrap font-sans bg-[#1d2021]/50 p-2.5 rounded-lg border border-[#32302f]">
                  {note.text}
                </p>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-3.5 bg-[#141617] border-t border-[#3c3836] flex items-center justify-between shrink-0 select-none">
        <div class="flex items-center gap-3">
          <span class="font-mono text-[11px] text-[#7c6f64]">
            {$t('notes.totalCount', { count: notes.length })}
          </span>

          {#if notes.length > 0}
            <button
              class="text-[11px] text-[#7c6f64] hover:text-[#fb4934] flex items-center gap-1 transition-colors"
              onclick={handleClearAllNotes}
              title={$t('notes.clearAllTooltip')}
            >
              <span class="material-symbols-outlined text-[13px]">delete_sweep</span>
              <span>{$t('notes.clearAll')}</span>
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if notes.length > 0}
            <button
              class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f]/60 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              onclick={handleCopyMarkdown}
              title={$t('notes.copyMarkdownTooltip')}
            >
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
              <span>{$t('notes.copyMarkdown')}</span>
            </button>

            <button
              class="px-3.5 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              onclick={handleExportFile}
              title={$t('notes.exportMdTooltip')}
            >
              <span class="material-symbols-outlined text-[15px]">download</span>
              <span>{$t('notes.exportMd')}</span>
            </button>
          {/if}

          <button
            class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs transition-colors"
            onclick={close}
          >
            {$t('common.close')}
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}
