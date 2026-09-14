<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';

  export let isOpen: boolean = false;
  export let activePaper: PaperDocument | null = null;
  export let notes: Array<{ title: string; text: string; time: string }> = [];

  const dispatch = createEventDispatcher();

  let newNoteTitle: string = '';
  let newNoteText: string = '';
  let isAddingNote: boolean = false;
  let editingIndex: number | null = null;
  let editTitle: string = '';
  let editText: string = '';
  let copyFeedback: string = '';
  let copyFeedbackTimer: any = null;

  function close() {
    isOpen = false;
    isAddingNote = false;
    editingIndex = null;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  function handleAddNote() {
    if (!newNoteText.trim()) return;

    const title = newNoteTitle.trim() || `精讀速記 · ${activePaper?.title || '論文重點'}`;
    const newNote = {
      title,
      text: newNoteText.trim(),
      time: new Date().toLocaleTimeString()
    };

    notes = [newNote, ...notes];
    newNoteTitle = '';
    newNoteText = '';
    isAddingNote = false;
    dispatch('updateNotes', { notes });
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
    dispatch('updateNotes', { notes });
  }

  function handleCancelEdit() {
    editingIndex = null;
  }

  function handleDeleteNote(index: number) {
    if (!confirm('確定要刪除此則精讀筆記嗎？')) return;
    notes = notes.filter((_, i) => i !== index);
    if (editingIndex === index) editingIndex = null;
    dispatch('updateNotes', { notes });
  }

  function handleClearAllNotes() {
    if (!confirm('確定要清空當前文獻的所有精讀筆記嗎？此操作無法還原。')) return;
    notes = [];
    editingIndex = null;
    dispatch('updateNotes', { notes });
  }

  function handleAddSampleNote() {
    const sample = {
      title: `精讀標註 · ${activePaper?.title || 'Attention Is All You Need'}`,
      text: '自注意力機制消除了傳統循環模型中的循序依賴，點積矩陣除以 √d_k 阻斷了 Softmax 梯度消失。在論文核心架構中，Multi-Head Attention 具備並行捕捉多語意子空間之優勢。',
      time: new Date().toLocaleTimeString()
    };
    notes = [sample, ...notes];
    dispatch('updateNotes', { notes });
  }

  function generateMarkdown(): string {
    let md = `# MUGEN YOMU 精讀筆記匯出\n\n`;
    md += `**文獻名稱**：${activePaper?.title || '未命名文獻'}\n`;
    md += `**出處**：${activePaper?.venue || '論文庫'} (${activePaper?.arxivId || activePaper?.sourceUrl || '本機文獻'})\n`;
    md += `**匯出時間**：${new Date().toLocaleString()}\n`;
    md += `**筆記總數**：${notes.length} 則\n\n---\n\n`;

    notes.forEach((n, idx) => {
      md += `### ${idx + 1}. ${n.title}\n`;
      md += `> 記錄時間：${n.time}\n\n`;
      md += `${n.text}\n\n`;
    });

    return md;
  }

  async function handleCopyMarkdown() {
    if (notes.length === 0) return;
    const md = generateMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      showFeedback('已複製全部 Markdown 到剪貼簿！');
    } catch {
      showFeedback('複製失敗，請手動匯出檔案');
    }
  }

  async function handleCopySingle(note: { title: string; text: string; time: string }) {
    const text = `### ${note.title} (${note.time})\n${note.text}`;
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('已複製單筆筆記！');
    } catch {
      showFeedback('複製失敗');
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
      alert('目前尚無任何精讀筆記可匯出！');
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
    showFeedback('已啟動 Markdown 檔案下載');
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    on:click={close}
    role="button"
    tabindex="0"
    aria-label="點擊關閉筆記面板"
    on:keydown={(e) => e.key === 'Escape' && close()}
  >
    <!-- Modal Container (select-text enabled for reading and copying) -->
    <div
      class="w-full max-w-3xl max-h-[88vh] bg-[#1d2021] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col select-text transition-all duration-200"
      on:click|stopPropagation
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
              <h3 class="text-sm font-bold text-[#ebdbb2] tracking-wide">Cognitive Notes · 精讀筆記管理</h3>
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-[#32302f] border border-[#504945] text-[#fabd2f]">
                {notes.length} 則收錄
              </span>
            </div>
            <span class="font-mono text-[11px] text-[#a89984] truncate max-w-[480px]">
              {activePaper?.title || '當前論文'}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fabd2f]/50 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            on:click={() => isAddingNote = !isAddingNote}
            title="手動新增筆記"
          >
            <span class="material-symbols-outlined text-[15px]">{isAddingNote ? 'close' : 'add'}</span>
            <span>{isAddingNote ? '取消新增' : '新增速記'}</span>
          </button>

          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors"
            on:click={close}
            title="關閉 (ESC)"
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
            <span class="text-xs font-semibold text-[#ebdbb2]">新增精讀觀點速記</span>
          </div>
          <input
            type="text"
            bind:value={newNoteTitle}
            placeholder="筆記標題（選填，預設：精讀速記 · 當前論文）"
            class="w-full bg-[#1d2021] border border-[#3c3836] focus:border-[#fe8019] rounded-lg px-3 py-1.5 text-xs text-[#ebdbb2] placeholder-[#7c6f64] outline-none transition-colors"
          />
          <textarea
            bind:value={newNoteText}
            rows="3"
            placeholder="請輸入論文觀點、推導心得或文獻批判思考..."
            class="w-full bg-[#1d2021] border border-[#3c3836] focus:border-[#fe8019] rounded-lg p-3 text-xs text-[#ebdbb2] placeholder-[#7c6f64] outline-none resize-none transition-colors leading-relaxed"
          ></textarea>
          <div class="flex items-center justify-end gap-2">
            <button
              class="px-3 py-1 text-xs text-[#a89984] hover:text-[#ebdbb2] transition-colors"
              on:click={() => { isAddingNote = false; newNoteText = ''; }}
            >
              取消
            </button>
            <button
              class="px-3.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] disabled:opacity-50 disabled:cursor-not-allowed text-[#1d2021] font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              disabled={!newNoteText.trim()}
              on:click={handleAddNote}
            >
              <span class="material-symbols-outlined text-[14px]">save</span>
              <span>儲存至筆記庫</span>
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
          <button class="text-[#a89984] hover:text-[#ebdbb2]" on:click={() => copyFeedback = ''}>
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
            <h4 class="text-sm font-bold text-[#ebdbb2] mb-1">尚無精讀筆記</h4>
            <p class="text-xs text-[#a89984] max-w-md leading-relaxed mb-4">
              在文獻閱讀工作區中點選各段落底部的「<span class="text-[#fabd2f]">標註精讀筆記</span>」，或在 AI 伴讀對話中點擊「<span class="text-[#fe8019]">收錄至筆記</span>」，觀點與推導即時彙整於此。
            </p>
            <div class="flex items-center gap-2">
              <button
                class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f]/50 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
                on:click={handleAddSampleNote}
              >
                <span class="material-symbols-outlined text-[15px]">auto_stories</span>
                <span>載入精讀範例筆記</span>
              </button>
              <button
                class="px-3 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                on:click={() => isAddingNote = true}
              >
                <span class="material-symbols-outlined text-[15px]">add</span>
                <span>手動新增第一筆</span>
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
                      on:click={() => handleSaveEdit(idx)}
                      title="儲存修改"
                    >
                      <span class="material-symbols-outlined text-[15px]">done</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:bg-[#1d2021] transition-colors"
                      on:click={handleCancelEdit}
                      title="取消編輯"
                    >
                      <span class="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  {:else}
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#fabd2f] hover:bg-[#1d2021] transition-colors"
                      on:click={() => handleCopySingle(note)}
                      title="複製本則筆記"
                    >
                      <span class="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#1d2021] transition-colors"
                      on:click={() => handleStartEdit(idx)}
                      title="編輯筆記"
                    >
                      <span class="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                    <button
                      class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#fb4934] hover:bg-[#1d2021] transition-colors"
                      on:click={() => handleDeleteNote(idx)}
                      title="刪除筆記"
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
            共 {notes.length} 則精讀觀點
          </span>

          {#if notes.length > 0}
            <button
              class="text-[11px] text-[#7c6f64] hover:text-[#fb4934] flex items-center gap-1 transition-colors"
              on:click={handleClearAllNotes}
              title="清空所有筆記"
            >
              <span class="material-symbols-outlined text-[13px]">delete_sweep</span>
              <span>清空筆記</span>
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if notes.length > 0}
            <button
              class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f]/60 text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              on:click={handleCopyMarkdown}
              title="將所有筆記複製為 Markdown"
            >
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
              <span>複製 Markdown</span>
            </button>

            <button
              class="px-3.5 py-1.5 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              on:click={handleExportFile}
              title="將精讀筆記下載為 .md 檔案"
            >
              <span class="material-symbols-outlined text-[15px]">download</span>
              <span>匯出為 .md 檔案</span>
            </button>
          {/if}

          <button
            class="px-3 py-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs transition-colors"
            on:click={close}
          >
            關閉
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}
