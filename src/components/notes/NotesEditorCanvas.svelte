<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { renderNoteMarkdown } from '../../utils/markdownNoteRenderer';
  import type { NoteEntry } from './NotesExplorerList.svelte';

  export let note: NoteEntry | null = null;
  export let viewMode: 'split' | 'edit' | 'preview' = 'split';

  const dispatch = createEventDispatcher<{
    updateNote: { note: NoteEntry };
    jumpToSource: { note: NoteEntry };
    deleteNote: void;
    copyMarkdown: void;
    exportMarkdown: void;
  }>();

  let autoSaveMessage: string = '✓ 已即時同步本機';
  let autoSaveTimer: any = null;

  function triggerAutoSave() {
    autoSaveMessage = '儲存中...';
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (note) {
        dispatch('updateNote', { note });
      }
      autoSaveMessage = '✓ 已即時同步本機';
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

    const replacement = prefix + (selected || '文字') + suffix;
    note.text = before + replacement + after;
    triggerAutoSave();

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected || '文字').length);
    }, 10);
  }

  $: renderedHtml = note ? renderNoteMarkdown(note.text) : '';
</script>

<main class="flex-1 flex flex-col bg-[#282828] h-full overflow-hidden select-text">
  {#if !note}
    <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#7c6f64]">
      <div class="w-14 h-14 rounded-2xl bg-[#1d2021] border border-[#3c3836] flex items-center justify-center text-[#7c6f64] mb-3">
        <span class="material-symbols-outlined text-[32px]">draw</span>
      </div>
      <h3 class="text-sm font-bold text-[#ebdbb2] mb-1">未選取任何精讀筆記</h3>
      <p class="text-xs text-[#a89984] max-w-xs">
        請在左側選擇一篇文獻筆記，或點擊「新增筆記」開始記錄論證推導觀點。
      </p>
    </div>
  {:else}
    <!-- Top Action Toolbar -->
    <div class="p-3 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between gap-3 shrink-0 select-none">
      <!-- Left: Source paper & Jump Button -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-mono text-[10px] bg-[#282828] border border-[#3c3836] text-[#fabd2f] px-2 py-0.5 rounded truncate max-w-[200px]">
          {note.paperTitle || '學術文獻'}
        </span>

        {#if note.sectionTitle || note.sectionId}
          <button
            class="px-2 py-0.5 bg-[#fe8019]/10 hover:bg-[#fe8019]/25 border border-[#fe8019]/40 text-[#fe8019] rounded text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
            on:click={() => dispatch('jumpToSource', { note })}
            title="點擊切換回閱讀工作台並定位至該段落"
          >
            <span class="material-symbols-outlined text-[13px]">my_location</span>
            <span class="truncate max-w-[240px]">§ {note.sectionTitle || note.sectionId} (跳轉原文)</span>
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
            on:click={() => viewMode = 'split'}
            title="雙欄對照 (編輯與預覽)"
          >
            雙欄
          </button>
          <button
            class="px-2 py-0.5 text-xs font-mono rounded transition-colors {viewMode === 'edit' ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            on:click={() => viewMode = 'edit'}
            title="純編輯模式"
          >
            編輯
          </button>
          <button
            class="px-2 py-0.5 text-xs font-mono rounded transition-colors {viewMode === 'preview' ? 'bg-[#3c3836] text-[#fe8019] font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
            on:click={() => viewMode = 'preview'}
            title="純預覽閱讀模式"
          >
            預覽
          </button>
        </div>

        <!-- Copy Markdown -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fabd2f] text-[#fabd2f] rounded-lg text-xs transition-colors cursor-pointer"
          on:click={() => dispatch('copyMarkdown')}
          title="複製此則 Markdown"
        >
          <span class="material-symbols-outlined text-[15px]">content_copy</span>
        </button>

        <!-- Export File -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019] text-[#fe8019] rounded-lg text-xs transition-colors cursor-pointer"
          on:click={() => dispatch('exportMarkdown')}
          title="匯出此則為 .md 檔案"
        >
          <span class="material-symbols-outlined text-[15px]">download</span>
        </button>

        <!-- Delete -->
        <button
          class="p-1.5 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fb4934] text-[#a89984] hover:text-[#fb4934] rounded-lg text-xs transition-colors cursor-pointer"
          on:click={() => dispatch('deleteNote')}
          title="刪除此筆記"
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
        on:input={handleTitleInput}
        placeholder="筆記標題..."
        class="flex-1 bg-transparent text-lg font-bold text-[#ebdbb2] focus:text-[#fe8019] placeholder-[#7c6f64] outline-none border-b border-transparent focus:border-[#fe8019]/40 py-1 transition-colors"
      />
      <span class="font-mono text-[11px] text-[#7c6f64] shrink-0">
        記錄於 {note.time}
      </span>
    </div>

    <!-- Quick Markdown Formatting Bar (Only when editor is visible) -->
    {#if viewMode !== 'preview'}
      <div class="px-6 py-1.5 bg-[#1d2021]/80 border-b border-[#3c3836] flex items-center gap-1 select-none overflow-x-auto">
        <button class="px-2 py-0.5 rounded text-xs font-bold text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" on:click={() => insertFormatting('**', '**')} title="粗體 (**)">B</button>
        <button class="px-2 py-0.5 rounded text-xs italic text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" on:click={() => insertFormatting('*', '*')} title="斜體 (*)">I</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" on:click={() => insertFormatting('`', '`')} title="行內代碼 (`代碼`)">&lt;/&gt;</button>
        <button class="px-2 py-0.5 rounded text-xs text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" on:click={() => insertFormatting('> ')} title="引用塊 (&gt;)">Quote</button>
        <button class="px-2 py-0.5 rounded text-xs text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828]" on:click={() => insertFormatting('- ')} title="清單 (-)">List</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#fabd2f] hover:bg-[#282828]" on:click={() => insertFormatting('$', '$')} title="行內 LaTeX 公式 ($式$)">$ 式 $</button>
        <button class="px-2 py-0.5 rounded text-xs font-mono text-[#fe8019] hover:bg-[#282828]" on:click={() => insertFormatting('$$\n', '\n$$')} title="獨立區塊 LaTeX 公式 ($$式$$)">$$ 區塊式 $$</button>
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
            on:input={handleTextInput}
            placeholder="請輸入 Markdown 格式精讀筆記、論證心得、LaTeX 公式 ($...$ 或 $$...$$)..."
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
              即時學術渲染預覽 (Markdown + KaTeX)
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
