<script lang="ts">
  import { onMount } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import NotesLibraryNav from './NotesLibraryNav.svelte';
  import NotesExplorerList, { type NoteEntry } from './NotesExplorerList.svelte';
  import NotesEditorCanvas from './NotesEditorCanvas.svelte';
  import { t } from '../../stores/localeStore';

  interface Props {
    paperLibrary?: PaperDocument[];
    activePaper?: PaperDocument | null;
    onjumpToSection?: (detail: { paperId: string; sectionId: string }) => void;
    onbackToWorkspace?: () => void;
  }

  let {
    paperLibrary = [],
    activePaper = null,
    onjumpToSection,
    onbackToWorkspace
  }: Props = $props();

  // 狀態管理
  let activePaperFilterId = $state('all');
  let isStarredFilter = $state(false);
  let selectedNoteIndex = $state(0);
  let editorViewMode = $state<'split' | 'edit' | 'preview'>('split');
  let toastMessage = $state('');
  let toastTimer: any = null;
  let hasSetInitialFilter = false;

  // 所有收錄的筆記平坦陣列
  let allNotes = $state<NoteEntry[]>([]);
  let paperNotesCountMap = $state<Record<string, number>>({});

  onMount(() => {
    loadAllNotes();
  });

  $effect(() => {
    if (activePaper) {
      if (!hasSetInitialFilter && activePaper.id) {
        activePaperFilterId = activePaper.id;
        hasSetInitialFilter = true;
      }
      // 若外部更新了 activePaper，若目前正在查看該篇，同步筆記
      loadAllNotes();
    }
  });

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
                title: n.title || $t('notes.defaultNoteTitle'),
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
  let filteredNotes = $derived(
    allNotes.filter(n => {
      if (isStarredFilter && !n.isPinned) return false;
      if (activePaperFilterId !== 'all' && n.paperId !== activePaperFilterId) return false;
      return true;
    })
  );

  // 當前選中的筆記實體
  let currentNote = $derived(filteredNotes[selectedNoteIndex] || null);

  // 當前過濾欄的文獻標題
  let currentFilterPaperTitle = $derived(
    activePaperFilterId === 'all'
      ? $t('notes.allPapers')
      : (paperLibrary.find(p => p.id === activePaperFilterId)?.title || 'Selected Paper')
  );

  function handleAddNote() {
    const targetPaper = (activePaperFilterId !== 'all' ? paperLibrary.find(p => p.id === activePaperFilterId) : activePaper) || paperLibrary[0];
    const newNote: NoteEntry = {
      id: `${targetPaper.id}_${Date.now()}`,
      title: `Note · ${new Date().toLocaleDateString()}`,
      text: 'Enter notes, scientific intuition, or inquiries here...\n\n- Key finding:\n- Important formula: $E = mc^2$\n',
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
    showToast($t('notes.copySingleSuccess'));
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
    if (!confirm($t('notes.deleteConfirm'))) return;

    allNotes = allNotes.filter(n => n.id !== target.id);
    if (selectedNoteIndex >= filteredNotes.length - 1) {
      selectedNoteIndex = Math.max(0, filteredNotes.length - 2);
    }
    if (target.paperId) {
      saveNotesForPaper(target.paperId);
    }
    showToast($t('notes.deleteNoteTooltip'));
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
    onjumpToSection?.({
      paperId: note.paperId,
      sectionId: note.sectionId || ''
    });
  }

  function handleCopyMarkdown(singleNote?: NoteEntry) {
    let md = '';
    if (singleNote) {
      md = `# ${singleNote.title}\n> ${$t('notes.singleExportSource')}${singleNote.paperTitle} (${singleNote.time})\n\n${singleNote.text}`;
    } else {
      md = `# MUGEN YOMU Notes Export\nExport Time：${new Date().toLocaleString()}\nTotal Notes：${filteredNotes.length}\n\n---\n\n`;
      filteredNotes.forEach((n, i) => {
        md += `## ${i + 1}. ${n.title}\n> Paper：${n.paperTitle} · Time：${n.time}\n\n${n.text}\n\n---\n\n`;
      });
    }

    navigator.clipboard.writeText(md).then(() => {
      showToast(singleNote ? $t('notes.copiedSingleToast') : $t('notes.copiedAllToast'));
    }).catch(() => {
      showToast($t('notes.copyFail'));
    });
  }

  function handleExportMarkdown(singleNote?: NoteEntry) {
    let md = '';
    let filename = '';
    if (singleNote) {
      md = `# ${singleNote.title}\n> ${$t('notes.singleExportSource')}${singleNote.paperTitle} (${singleNote.time})\n\n${singleNote.text}`;
      filename = `Note_${singleNote.title.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 25)}.md`;
    } else {
      md = `# MUGEN YOMU Notes Export\nExport Time：${new Date().toLocaleString()}\nTotal Notes：${filteredNotes.length}\n\n---\n\n`;
      filteredNotes.forEach((n, i) => {
        md += `## ${i + 1}. ${n.title}\n> Paper：${n.paperTitle} · Time：${n.time}\n\n${n.text}\n\n---\n\n`;
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
    showToast($t('notes.downloadTriggered'));
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
        <h2 class="text-xs font-bold text-[#ebdbb2]">{$t('notes.title')}</h2>
        <span class="font-mono text-[10px] bg-[#282828] text-[#fabd2f] px-1.5 py-0.2 rounded border border-[#3c3836]">
          {$t('notes.totalPrefix')} {allNotes.length} {$t('notes.totalSuffix')}
        </span>
      </div>
    </div>

    <!-- Global Export Controls -->
    <div class="flex items-center gap-2">
      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#504945] hover:border-[#fabd2f] text-[#fabd2f] rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
        onclick={() => handleCopyMarkdown()}
        title={$t('notes.copyMarkdownTooltip')}
      >
        <span class="material-symbols-outlined text-[14px]">content_copy</span>
        <span>{$t('notes.copyMarkdown')}</span>
      </button>

      <button
        class="px-3 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        onclick={() => handleExportMarkdown()}
        title={$t('notes.exportMdTooltip')}
      >
        <span class="material-symbols-outlined text-[15px]">download</span>
        <span>{$t('notes.exportMarkdown')}</span>
      </button>

      <div class="h-4 w-px bg-[#3c3836] mx-0.5"></div>

      <button
        class="px-2.5 py-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
        onclick={() => onbackToWorkspace?.()}
        title={$t('notes.backToWorkspace')}
      >
        <span class="material-symbols-outlined text-[14px]">arrow_back</span>
        <span>{$t('notes.backToWorkspace')}</span>
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
      onselectFilter={(e) => { activePaperFilterId = e.paperId; selectedNoteIndex = 0; }}
      ontoggleStarred={(e) => { isStarredFilter = e.isStarred; selectedNoteIndex = 0; }}
      onbackToWorkspace={() => onbackToWorkspace?.()}
    />

    <!-- Col 2: Notes Explorer & Search List (w-80) -->
    <NotesExplorerList
      notes={filteredNotes}
      bind:selectedIndex={selectedNoteIndex}
      currentPaperTitle={currentFilterPaperTitle}
      onselectNote={(e) => selectedNoteIndex = e.index}
      onaddNote={handleAddNote}
      ondeleteNote={(e) => handleDeleteNote(e.index)}
      ontogglePin={(e) => handleTogglePin(e.index)}
    />

    <!-- Col 3: Deep Markdown & KaTeX Canvas (flex-1) -->
    <NotesEditorCanvas
      note={currentNote}
      bind:viewMode={editorViewMode}
      onupdateNote={(e) => handleUpdateNote(e.note)}
      onjumpToSource={(e) => handleJumpToSource(e.note)}
      ondeleteNote={() => handleDeleteNote(selectedNoteIndex)}
      oncopyMarkdown={() => currentNote && handleCopyMarkdown(currentNote)}
      onexportMarkdown={() => currentNote && handleExportMarkdown(currentNote)}
    />
  </div>
</div>
