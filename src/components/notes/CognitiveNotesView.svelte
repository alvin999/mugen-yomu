<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import NotesLibraryNav from './NotesLibraryNav.svelte';
  import NotesExplorerList, { type NoteEntry } from './NotesExplorerList.svelte';
  import NotesEditorCanvas from './NotesEditorCanvas.svelte';

  export let paperLibrary: PaperDocument[] = [];
  export let activePaper: PaperDocument | null = null;

  const dispatch = createEventDispatcher<{
    jumpToSection: { paperId: string; sectionId: string };
    backToWorkspace: void;
  }>();

  // 狀態管理
  let activePaperFilterId: string = activePaper?.id || 'all';
  let isStarredFilter: boolean = false;
  let selectedNoteIndex: number = 0;
  let editorViewMode: 'split' | 'edit' | 'preview' = 'split';
  let toastMessage: string = '';
  let toastTimer: any = null;

  // 所有收錄的筆記平坦陣列
  let allNotes: NoteEntry[] = [];
  let paperNotesCountMap: Record<string, number> = {};

  onMount(() => {
    loadAllNotes();
  });

  $: if (activePaper) {
    // 若外部更新了 activePaper，若目前正在查看該篇，同步筆記
    loadAllNotes();
  }

  function loadAllNotes() {
    if (typeof window === 'undefined') return;
    const loaded: NoteEntry[] = [];
    const countMap: Record<string, number> = {};

    paperLibrary.forEach(p => {
      try {
        const raw = localStorage.getItem(`mugen_notes_${p.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            countMap[p.id] = parsed.length;
            parsed.forEach((n: any) => {
              loaded.push({
                id: n.id || `${p.id}_${Date.now()}_${Math.random()}`,
                title: n.title || '精讀速記',
                text: n.text || '',
                time: n.time || new Date().toLocaleTimeString(),
                paperId: p.id,
                paperTitle: p.title,
                sectionId: n.sectionId || '',
                sectionTitle: n.sectionTitle || '',
                isPinned: Boolean(n.isPinned)
              });
            });
          } else {
            countMap[p.id] = 0;
          }
        } else {
          countMap[p.id] = 0;
        }
      } catch (err) {
        console.warn(`[CognitiveNotes] Failed to parse notes for ${p.id}:`, err);
        countMap[p.id] = 0;
      }
    });

    allNotes = loaded;
    paperNotesCountMap = countMap;
  }

  function saveNotesForPaper(paperId: string) {
    if (typeof window === 'undefined' || !paperId) return;
    const paperNotes = allNotes.filter(n => n.paperId === paperId);
    try {
      localStorage.setItem(`mugen_notes_${paperId}`, JSON.stringify(paperNotes));
      paperNotesCountMap[paperId] = paperNotes.length;
      paperNotesCountMap = { ...paperNotesCountMap };
    } catch (e) {
      console.warn('Failed to save notes:', e);
    }
  }

  // 根據目前選中的文獻與星號過濾筆記
  $: filteredNotes = allNotes.filter(n => {
    if (isStarredFilter && !n.isPinned) return false;
    if (activePaperFilterId !== 'all' && n.paperId !== activePaperFilterId) return false;
    return true;
  });

  // 當前選中的筆記實體
  $: currentNote = filteredNotes[selectedNoteIndex] || null;

  // 當前過濾欄的文獻標題
  $: currentFilterPaperTitle = activePaperFilterId === 'all'
    ? '全部文獻筆記'
    : (paperLibrary.find(p => p.id === activePaperFilterId)?.title || '精選文獻');

  function handleAddNote() {
    const targetPaper = (activePaperFilterId !== 'all' ? paperLibrary.find(p => p.id === activePaperFilterId) : activePaper) || paperLibrary[0];
    const newNote: NoteEntry = {
      id: `${targetPaper.id}_${Date.now()}`,
      title: `精讀觀點 · ${new Date().toLocaleDateString()}`,
      text: '在此輸入論文推導筆記、白話概念思考或問題記錄...\n\n- 核心發現：\n- 關鍵公式：$E = mc^2$\n',
      time: new Date().toLocaleTimeString(),
      paperId: targetPaper.id,
      paperTitle: targetPaper.title,
      sectionId: targetPaper.sections?.[0]?.id || '',
      sectionTitle: targetPaper.sections?.[0]?.title || '',
      isPinned: false
    };

    allNotes = [newNote, ...allNotes];
    selectedNoteIndex = 0;
    saveNotesForPaper(targetPaper.id);
    showToast('已新增一筆精讀筆記');
  }

  function handleUpdateNote(updated: NoteEntry) {
    allNotes = allNotes.map(n => (n.id === updated.id ? updated : n));
    if (updated.paperId) {
      saveNotesForPaper(updated.paperId);
    }
  }

  function handleDeleteNote(indexInFiltered: number) {
    const target = filteredNotes[indexInFiltered];
    if (!target) return;
    if (!confirm(`確定要刪除「${target.title}」這則筆記嗎？`)) return;

    allNotes = allNotes.filter(n => n.id !== target.id);
    if (selectedNoteIndex >= filteredNotes.length - 1) {
      selectedNoteIndex = Math.max(0, filteredNotes.length - 2);
    }
    if (target.paperId) {
      saveNotesForPaper(target.paperId);
    }
    showToast('已刪除筆記');
  }

  function handleTogglePin(indexInFiltered: number) {
    const target = filteredNotes[indexInFiltered];
    if (!target) return;
    target.isPinned = !target.isPinned;
    allNotes = [...allNotes];
    if (target.paperId) {
      saveNotesForPaper(target.paperId);
    }
  }

  function handleJumpToSource(note: NoteEntry) {
    if (!note.paperId) return;
    dispatch('jumpToSection', {
      paperId: note.paperId,
      sectionId: note.sectionId || ''
    });
  }

  function handleCopyMarkdown(singleNote?: NoteEntry) {
    let md = '';
    if (singleNote) {
      md = `# ${singleNote.title}\n> 來源：${singleNote.paperTitle} (${singleNote.time})\n\n${singleNote.text}`;
    } else {
      md = `# MUGEN YOMU 精讀筆記彙整庫\n匯出時間：${new Date().toLocaleString()}\n總筆記量：${filteredNotes.length} 則\n\n---\n\n`;
      filteredNotes.forEach((n, i) => {
        md += `## ${i + 1}. ${n.title}\n> 文獻：${n.paperTitle} · 記錄時間：${n.time}\n\n${n.text}\n\n---\n\n`;
      });
    }

    navigator.clipboard.writeText(md).then(() => {
      showToast(singleNote ? '已複製單筆筆記 Markdown' : '已複製全部筆記 Markdown 至剪貼簿');
    }).catch(() => {
      showToast('複製失敗，請手動匯出');
    });
  }

  function handleExportMarkdown(singleNote?: NoteEntry) {
    let md = '';
    let filename = '';
    if (singleNote) {
      md = `# ${singleNote.title}\n> 來源：${singleNote.paperTitle} (${singleNote.time})\n\n${singleNote.text}`;
      filename = `Note_${singleNote.title.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 25)}.md`;
    } else {
      md = `# MUGEN YOMU 精讀筆記彙整庫\n匯出時間：${new Date().toLocaleString()}\n總筆記量：${filteredNotes.length} 則\n\n---\n\n`;
      filteredNotes.forEach((n, i) => {
        md += `## ${i + 1}. ${n.title}\n> 文獻：${n.paperTitle} · 記錄時間：${n.time}\n\n${n.text}\n\n---\n\n`;
      });
      filename = `MugenYomu_Notes_Export_${Date.now()}.md`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = filename;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
    showToast('已下載 Markdown 檔案');
  }

  function showToast(msg: string) {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = '';
    }, 2500);
  }
</script>

<div class="h-full w-full flex flex-col bg-[#282828] text-[#ebdbb2] overflow-hidden select-text relative">
  <!-- Toast message popover -->
  {#if toastMessage}
    <div class="absolute top-4 right-6 z-50 px-3.5 py-1.5 bg-[#b8bb26] text-[#1d2021] font-bold text-xs rounded-lg shadow-xl flex items-center gap-1.5 animate-fade-in font-mono">
      <span class="material-symbols-outlined text-[15px]">check_circle</span>
      <span>{toastMessage}</span>
    </div>
  {/if}

  <!-- Top Studio Header -->
  <header class="h-12 bg-[#141617] border-b border-[#3c3836] px-4 flex items-center justify-between shrink-0 select-none">
    <div class="flex items-center gap-3">
      <div class="w-7 h-7 rounded-lg bg-[#fabd2f]/15 border border-[#fabd2f]/40 flex items-center justify-center text-[#fabd2f]">
        <span class="material-symbols-outlined text-[16px]">draw</span>
      </div>
      <div class="flex items-center gap-2">
        <h2 class="text-xs font-bold text-[#ebdbb2]">Cognitive Notes · 精讀筆記工作室</h2>
        <span class="font-mono text-[10px] bg-[#282828] text-[#fabd2f] px-1.5 py-0.2 rounded border border-[#3c3836]">
          全庫收錄 {allNotes.length} 則
        </span>
      </div>
    </div>

    <!-- Global Export Controls -->
    <div class="flex items-center gap-2">
      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f] text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
        on:click={() => handleCopyMarkdown()}
        title="複製目前篩選的所有筆記為 Markdown"
      >
        <span class="material-symbols-outlined text-[14px]">content_copy</span>
        <span>複製全部</span>
      </button>

      <button
        class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        on:click={() => handleExportMarkdown()}
        title="匯出目前所有筆記為 .md 檔案"
      >
        <span class="material-symbols-outlined text-[15px]">download</span>
        <span>匯出 .md 全集</span>
      </button>

      <div class="h-4 w-px bg-[#3c3836] mx-0.5"></div>

      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
        on:click={() => dispatch('backToWorkspace')}
        title="返回閱讀工作台"
      >
        <span class="material-symbols-outlined text-[14px]">close</span>
        <span>返回</span>
      </button>
    </div>
  </header>

  <!-- 3-Column Studio Body -->
  <div class="flex-1 overflow-hidden flex divide-x divide-[#3c3836]">
    <!-- Col 1: Library & Category Navigator (w-64) -->
    <NotesLibraryNav
      {paperLibrary}
      bind:activePaperFilterId
      bind:isStarredFilter
      {paperNotesCountMap}
      totalNotesCount={allNotes.length}
      on:selectFilter={(e) => { activePaperFilterId = e.detail.paperId; selectedNoteIndex = 0; }}
      on:toggleStarred={(e) => { isStarredFilter = e.detail.isStarred; selectedNoteIndex = 0; }}
      on:backToWorkspace={() => dispatch('backToWorkspace')}
    />

    <!-- Col 2: Notes Explorer & Search List (w-80) -->
    <NotesExplorerList
      notes={filteredNotes}
      bind:selectedIndex={selectedNoteIndex}
      currentPaperTitle={currentFilterPaperTitle}
      on:selectNote={(e) => selectedNoteIndex = e.detail.index}
      on:addNote={handleAddNote}
      on:deleteNote={(e) => handleDeleteNote(e.detail.index)}
      on:togglePin={(e) => handleTogglePin(e.detail.index)}
    />

    <!-- Col 3: Deep Markdown & KaTeX Canvas (flex-1) -->
    <NotesEditorCanvas
      note={currentNote}
      bind:viewMode={editorViewMode}
      on:updateNote={(e) => handleUpdateNote(e.detail.note)}
      on:jumpToSource={(e) => handleJumpToSource(e.detail.note)}
      on:deleteNote={() => handleDeleteNote(selectedNoteIndex)}
      on:copyMarkdown={() => currentNote && handleCopyMarkdown(currentNote)}
      on:exportMarkdown={() => currentNote && handleExportMarkdown(currentNote)}
    />
  </div>
</div>
