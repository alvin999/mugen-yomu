<script lang="ts">
  import { onMount } from 'svelte';
  import NavigationRail from './layout/NavigationRail.svelte';
  import AppHeader from './layout/AppHeader.svelte';
  import DensityRibbon from './layout/DensityRibbon.svelte';
  import ReadingMap from './reading-map/ReadingMap.svelte';
  import BilingualReader from './reader/BilingualReader.svelte';
  import DerivationsFiguresView from './reader/DerivationsFiguresView.svelte';
  import CognitiveCompanion from './companion/CognitiveCompanion.svelte';
  import ByokModal from './byok/ByokModal.svelte';
  import ImportPaperModal from './repository/ImportPaperModal.svelte';
  import PaperRepositoryPanel from './repository/PaperRepositoryPanel.svelte';
  import OriginalDocumentViewer from './reader/OriginalDocumentViewer.svelte';
  import CitationGraphView from './citation/CitationGraphView.svelte';
  import CognitiveNotesModal from './notes/CognitiveNotesModal.svelte';

  import {
    getInitialLibrary,
    getActivePaperId,
    setActivePaperId,
    saveLibraryToStorage,
    type PaperDocument,
    type ChapterSection
  } from '../stores/documentStore';
  import {
    flattenSections,
    loadPaperReadingState,
    savePaperReadingState,
    clearPaperReadingState,
    applyProgressToSections
  } from '../stores/readingStore';
  import { getCacheStats, getStorageEstimate, type CacheStats } from '../services/cacheService';
  import {
    formatModelDisplayName,
    generateScientificIntuition,
    generateSentenceDeconstruction,
    generateTerminologyAlignment
  } from '../services/aiService';

  // State Management
  let currentMainView: 'workspace' | 'citation-graph' = 'workspace';
  let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  let isPdfDrawerOpen: boolean = false;
  let isNotesModalOpen: boolean = false;
  let splitRatio: number = 50;
  let isDraggingSplit: boolean = false;
  let zoomLevel: number = 100;
  let isByokOpen: boolean = false;
  let isImportOpen: boolean = false;
  let isRepositoryOpen: boolean = false;
  let isRailCollapsed: boolean = false;

  let modelName: string = 'Groq (Llama 3.3 70B)';
  let cachedInfo: string = '$0.14 / 2.4k cached (省 82%)';
  let cacheStats: CacheStats | null = null;
  let localMemoryMb: number = 0.8;
  let localMemoryPercent: number = 1;
  let localMemoryTooltip: string = '本機 IndexedDB 快取與文獻庫';
  let companionRef: any = null;
  let readerRef: any = null;

  // 認知核心非同步載入狀態
  let loadingIntuitionId: string | null = null;
  let loadingSyntaxId: string | null = null;
  let loadingTerminologyId: string | null = null;

  let paperLibrary: PaperDocument[] = [];
  let activePaperId: string = 'mugen_yomu_user_manual';
  let activePaper: PaperDocument | null = null;
  let activeSectionId: string = '3.2';
  let activeContextText: string = '§ 3.2 Complex Sentence Deconstruction';

  // Notes in memory
  let capturedNotes: Array<{ title: string; text: string; time: string }> = [];

  // 依據本機快取即時數據動態計算節省成本與 Token
  $: if (cacheStats) {
    const tokensK = (cacheStats.totalTokensSaved / 1000).toFixed(1);
    cachedInfo = `$${cacheStats.costSavedUsd.toFixed(2)} / ${tokensK}k cached (省 ${cacheStats.savingsPercent}%)`;
  }

  onMount(() => {
    paperLibrary = getInitialLibrary();
    activePaperId = getActivePaperId();
    const current = paperLibrary.find(p => p.id === activePaperId) || paperLibrary[0];
    if (current) {
      setPaper(current);
    }
    loadActiveModel();
    refreshCacheStats();
  });

  function loadActiveModel() {
    if (typeof window === 'undefined') return;
    const p = localStorage.getItem('mugen_provider') || 'groq';
    const m = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
    modelName = formatModelDisplayName(p, m);
  }

  async function refreshCacheStats() {
    cacheStats = await getCacheStats();
    const storage = await getStorageEstimate();
    localMemoryMb = storage.usageMb;
    localMemoryPercent = storage.percent;
    localMemoryTooltip = `本機已使用 ${storage.usageMb} MB / 總配額 ${storage.displayText.split('/')[1]?.trim() || '1 GB'}`;
  }

  function setPaper(paper: PaperDocument) {
    activePaper = paper;
    activePaperId = paper.id;
    setActivePaperId(paper.id);

    // 載入該論文在 LocalStorage 的閱讀進度
    const savedState = loadPaperReadingState(paper.id);
    if (savedState && activePaper.sections) {
      activePaper.sections = applyProgressToSections(activePaper.sections, savedState);
    }

    // 載入該論文在 LocalStorage 的精讀筆記
    if (typeof window !== 'undefined') {
      try {
        const savedNotes = localStorage.getItem(`mugen_notes_${paper.id}`);
        capturedNotes = savedNotes ? JSON.parse(savedNotes) : [];
      } catch {
        capturedNotes = [];
      }
    }

    // Pick section 3.2 or 3.2.1 if exists, else first section
    const allSecs = flattenSections(activePaper.sections);
    const targetSec = allSecs.find(s => s.id === '3.2' || s.id === '3.2.1') || allSecs[0];
    if (targetSec) {
      activeSectionId = targetSec.id;
      activeContextText = `§ ${targetSec.title}`;
    }
  }

  function saveNotes(notes: Array<{ title: string; text: string; time: string }>) {
    capturedNotes = notes;
    if (typeof window !== 'undefined' && activePaperId) {
      try {
        localStorage.setItem(`mugen_notes_${activePaperId}`, JSON.stringify(capturedNotes));
      } catch (e) {
        console.warn('Failed to save notes to localStorage', e);
      }
    }
  }

  // 記錄並持久化章節狀態
  function updateSectionState(sectionId: string, updates: Partial<{ isRead: boolean; progress: number; dwellSeconds: number }>) {
    if (!activePaper || !activePaper.sections) return;

    function updateRecursive(secs: ChapterSection[]): ChapterSection[] {
      return secs.map(s => {
        if (s.id === sectionId) {
          const newIsRead = updates.isRead !== undefined ? updates.isRead : s.isRead;
          const newProgress = updates.progress !== undefined ? updates.progress : (newIsRead ? 100 : s.progress);
          return {
            ...s,
            isRead: newIsRead,
            progress: newProgress
          };
        }
        if (s.children && s.children.length > 0) {
          return { ...s, children: updateRecursive(s.children) };
        }
        return s;
      });
    }

    activePaper.sections = updateRecursive(activePaper.sections);
    activePaper = { ...activePaper };

    // 同步儲存至 LocalStorage
    const flattened = flattenSections(activePaper.sections);
    const stateMap: Record<string, any> = {};
    for (const item of flattened) {
      stateMap[item.id] = {
        isRead: item.isRead,
        progress: item.progress,
        lastUpdated: Date.now()
      };
    }
    savePaperReadingState(activePaper.id, stateMap);
  }

  // 1. 視線停留累積精讀
  function handleSectionDwell(e: CustomEvent<{ id: string; dwellSeconds: number }>) {
    const { id, dwellSeconds } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (!target) return;

    if (!target.isRead) {
      const currentProgress = target.progress || 0;
      const addedProgress = Math.min(100, Math.max(currentProgress, Math.round((dwellSeconds / 7) * 100)));
      const isNowRead = addedProgress >= 100;
      updateSectionState(id, { progress: addedProgress, isRead: isNowRead, dwellSeconds });
    }
  }

  // 2. 視線路過掃讀
  function handleSectionSkimmed(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (target && !target.isRead && (!target.progress || target.progress < 30)) {
      updateSectionState(id, { progress: 30 });
    }
  }

  // 3. 深度互動（展開翻譯、查看直覺、標註筆記）直接判定 100% 精讀
  function handleSectionInteracted(e: CustomEvent<{ id: string; action: string }>) {
    const { id } = e.detail;
    updateSectionState(id, { isRead: true, progress: 100 });
  }

  // 4. 使用者在目錄樹手動切換已讀/未讀
  function handleToggleSectionRead(e: CustomEvent<{ id: string }>) {
    const { id } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const target = allSecs.find(s => s.id === id);
    if (target) {
      const nextRead = !target.isRead;
      updateSectionState(id, { isRead: nextRead, progress: nextRead ? 100 : 0 });
    }
  }

  // 5. 重設本篇閱讀進度
  function handleResetProgress() {
    if (!activePaper) return;
    clearPaperReadingState(activePaper.id);
    function resetSecs(secs: ChapterSection[]): ChapterSection[] {
      return secs.map(s => ({
        ...s,
        isRead: false,
        progress: 0,
        children: s.children ? resetSecs(s.children) : undefined
      }));
    }
    activePaper.sections = resetSecs(activePaper.sections);
    activePaper = { ...activePaper };
  }

  function handleModeChange(event: CustomEvent<{ mode: 'bilingual' | 'split' | 'zen' | 'figures' }>) {
    readingMode = event.detail.mode;
    currentMainView = 'workspace';
    if (readingMode === 'split') {
      isPdfDrawerOpen = false;
    }
  }

  function handleLoadPaperFromCitation(e: CustomEvent<{ paperId: string }>) {
    const targetId = e.detail.paperId;
    const found = paperLibrary.find(p => p.id === targetId || p.id.includes(targetId));
    if (found) {
      setPaper(found);
      currentMainView = 'workspace';
    }
  }

  function handleSplitMouseDown(e: MouseEvent) {
    isDraggingSplit = true;
    window.addEventListener('mousemove', handleSplitMouseMove);
    window.addEventListener('mouseup', handleSplitMouseUp);
  }

  function handleSplitMouseMove(e: MouseEvent) {
    if (!isDraggingSplit) return;
    const container = document.getElementById('split-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const newRatio = Math.max(25, Math.min(75, Math.round((offsetX / rect.width) * 100)));
    splitRatio = newRatio;
  }

  function handleSplitMouseUp() {
    isDraggingSplit = false;
    window.removeEventListener('mousemove', handleSplitMouseMove);
    window.removeEventListener('mouseup', handleSplitMouseUp);
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      isPdfDrawerOpen = !isPdfDrawerOpen;
    } else if (e.key === 'Escape' && isPdfDrawerOpen) {
      isPdfDrawerOpen = false;
    } else if (e.key === 'Escape' && isNotesModalOpen) {
      isNotesModalOpen = false;
    }
  }

  function handleZoomChange(event: CustomEvent<{ zoomLevel: number }>) {
    zoomLevel = event.detail.zoomLevel;
  }

  function handleSelectSection(event: CustomEvent<{ id: string; source?: string; noScroll?: boolean }>) {
    const { id, source, noScroll } = event.detail || {};
    activeSectionId = id;
    if (activePaper) {
      const allSecs = flattenSections(activePaper.sections);
      const found = allSecs.find(s => s.id === activeSectionId);
      activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
    }
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }

    // 關鍵修復：絕對不要在使用者滾動或點擊段落時反向呼叫 scrollToTarget！
    // 只有當來源是目錄樹點擊 (outline)、導航 (nav)、PDF跳轉 (pdf) 時才主動跳轉！
    const isNavigation = source === 'outline' || source === 'nav' || source === 'pdf';
    if (isNavigation && !noScroll) {
      setTimeout(() => {
        if (readerRef && readerRef.scrollToTarget) {
          readerRef.scrollToTarget('sec-' + activeSectionId);
        }
      }, 30);
    }
  }

  // 當使用者滾動滑過前面的章節時，自動將已讀過的章節標記為已研讀
  function handleSectionsPassed(e: CustomEvent<{ readSectionIds: string[]; currentSectionId: string }>) {
    const { readSectionIds } = e.detail || {};
    if (!activePaper || !readSectionIds || readSectionIds.length === 0) return;

    let hasChange = false;
    function updatePassed(secs: ChapterSection[]): ChapterSection[] {
      return secs.map(s => {
        let isRead = s.isRead;
        let progress = s.progress;
        if (readSectionIds.includes(s.id) && !s.isRead) {
          isRead = true;
          progress = 100;
          hasChange = true;
        }
        return {
          ...s,
          isRead,
          progress,
          children: s.children ? updatePassed(s.children) : undefined
        };
      });
    }

    const updated = updatePassed(activePaper.sections);
    if (hasChange) {
      activePaper.sections = updated;
      activePaper = { ...activePaper };

      // 持久化儲存
      const flattened = flattenSections(activePaper.sections);
      const stateMap: Record<string, any> = {};
      for (const item of flattened) {
        stateMap[item.id] = { isRead: item.isRead, progress: item.progress, lastUpdated: Date.now() };
      }
      savePaperReadingState(activePaper.id, stateMap);
    }
  }

  // 當使用者自然滾動到達文末時，整篇論文自動完成 100% 精讀！
  function handleReachedBottom() {
    if (!activePaper || !activePaper.sections) return;
    const allSecs = flattenSections(activePaper.sections);
    const allAlreadyRead = allSecs.every(s => s.isRead);
    if (allAlreadyRead) return;

    function markAll(secs: ChapterSection[]): ChapterSection[] {
      return secs.map(s => ({
        ...s,
        isRead: true,
        progress: 100,
        children: s.children ? markAll(s.children) : undefined
      }));
    }

    activePaper.sections = markAll(activePaper.sections);
    activePaper = { ...activePaper };

    const flattened = flattenSections(activePaper.sections);
    const stateMap: Record<string, any> = {};
    for (const item of flattened) {
      stateMap[item.id] = { isRead: true, progress: 100, lastUpdated: Date.now() };
    }
    savePaperReadingState(activePaper.id, stateMap);
  }

  function handleSelectFigure(event: CustomEvent<{ figId: string }>) {
    readingMode = 'figures';
  }

  function handleSectionsAligned(event: CustomEvent<{ sections: ChapterSection[] }>) {
    if (activePaper && event.detail.sections) {
      activePaper.sections = event.detail.sections;
      activePaper = { ...activePaper };
    }
  }

  function handleSelectEquation(event: CustomEvent<{ eqId: string }>) {
    if (readingMode === 'figures') {
      readingMode = 'bilingual';
    }
    if (activePaper?.sections) {
      const allSecs = flattenSections(activePaper.sections);
      const formulaSec = allSecs.find(s => s.formulas && s.formulas.some((f: any) => f.id === event.detail.eqId)) ||
        allSecs.find(s => s.id === '3.2' || s.id === '3.2.1');
      if (formulaSec) {
        activeSectionId = formulaSec.id;
        activeContextText = `§ ${formulaSec.title}`;
      }
    }
    setTimeout(() => {
      if (readerRef && readerRef.scrollToTarget) {
        readerRef.scrollToTarget('eq-' + event.detail.eqId);
      }
    }, 60);
  }

  function getAiConfig() {
    if (typeof window === 'undefined') {
      return { provider: 'groq', apiKey: '', model: 'llama-3.3-70b-versatile', ollamaUrl: 'http://localhost:11434' };
    }
    const provider = localStorage.getItem('mugen_provider') || 'groq';
    const apiKey = localStorage.getItem(`mugen_key_${provider}`) || localStorage.getItem('mugen_key_groq') || '';
    const model = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
    const ollamaUrl = localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434';
    return { provider, apiKey, model, ollamaUrl };
  }

  async function generateIntuitionForSection(sec: ChapterSection) {
    if (!sec || !sec.id) return;
    loadingIntuitionId = sec.id;
    try {
      const config = getAiConfig();
      const res = await generateScientificIntuition(
        sec.title,
        sec.paragraphs || [],
        config.provider,
        config.apiKey,
        config.model,
        config.ollamaUrl
      );

      if (activePaper) {
        if (!activePaper.companionData) activePaper.companionData = {};
        const prev = activePaper.companionData[sec.id] || {
          intuition: res,
          terminology: [],
          socraticQuestions: []
        };
        activePaper.companionData[sec.id] = {
          ...prev,
          intuition: {
            title: res.title,
            tag: res.tag,
            content: res.content
          }
        };
        activePaper = { ...activePaper };
      }
      refreshCacheStats();
      setTimeout(() => {
        companionRef?.focusCard('intuition');
      }, 80);
    } catch (e) {
      console.warn('生成白話科學直覺失敗:', e);
    } finally {
      loadingIntuitionId = null;
    }
  }

  async function generateSyntaxForSection(sec: ChapterSection, selectedText?: string) {
    if (!sec || !sec.id) return;
    loadingSyntaxId = sec.id;
    try {
      const config = getAiConfig();
      const textToAnalyze = (selectedText && selectedText.trim().length > 10)
        ? selectedText.trim()
        : (sec.paragraphs ? sec.paragraphs.join(' ') : sec.title);

      const res = await generateSentenceDeconstruction(
        textToAnalyze,
        sec.title,
        config.provider,
        config.apiKey,
        config.model,
        config.ollamaUrl
      );

      if (activePaper) {
        if (!activePaper.companionData) activePaper.companionData = {};
        const prev = activePaper.companionData[sec.id] || {
          intuition: { title: `關於「${sec.title}」的核心探討`, tag: 'Insight', content: [] },
          terminology: [],
          socraticQuestions: []
        };
        activePaper.companionData[sec.id] = {
          ...prev,
          syntaxTree: {
            line: res.line,
            snippet: res.snippet,
            svo: res.svo
          }
        };

        // 同步更新章節原型的 svoSentence，讓雙語閱讀器內文也直接呈現彩色結構標籤
        const svoItem = res.svo.find(item => item.role.includes('主幹') || item.role.includes('S-V-O')) || res.svo[0];
        const modItem = res.svo.find(item => item.role.includes('方式') || item.role.includes('條件') || item.role.includes('修飾') || item.role.includes('平行')) || res.svo[1];
        const purItem = res.svo.find(item => item.role.includes('目的') || item.role.includes('結果')) || res.svo[2];

        sec.svoSentence = {
          sentence: res.snippet,
          svoBadge: 'S-V-O 認知拆解',
          subjectVerbObject: {
            title: svoItem ? svoItem.role : '[主幹 S-V-O]',
            en: svoItem ? svoItem.text : res.snippet,
            zh: svoItem ? svoItem.zh : '核心論述主幹'
          },
          modifier: {
            title: modItem ? modItem.role : '[方式與條件]',
            en: modItem ? modItem.text : '',
            zh: modItem ? modItem.zh : '前提條件與限定修飾'
          },
          purpose: {
            title: purItem ? purItem.role : '[目的與結果]',
            en: purItem ? purItem.text : '',
            zh: purItem ? purItem.zh : '預期達致之效應與推論'
          }
        };

        activePaper = { ...activePaper };
      }
      refreshCacheStats();
      setTimeout(() => {
        companionRef?.focusCard('syntax');
      }, 80);
    } catch (e) {
      console.warn('生成長難句拆解失敗:', e);
    } finally {
      loadingSyntaxId = null;
    }
  }

  async function generateTerminologyForSection(sec: ChapterSection) {
    if (!sec || !sec.id) return;
    loadingTerminologyId = sec.id;
    try {
      const config = getAiConfig();
      const res = await generateTerminologyAlignment(
        sec.title,
        sec.paragraphs || [],
        config.provider,
        config.apiKey,
        config.model,
        config.ollamaUrl
      );

      if (activePaper) {
        if (!activePaper.companionData) activePaper.companionData = {};
        const prev = activePaper.companionData[sec.id] || {
          intuition: { title: `關於「${sec.title}」的核心探討`, tag: 'Insight', content: [] },
          terminology: [],
          socraticQuestions: []
        };
        activePaper.companionData[sec.id] = {
          ...prev,
          terminology: res.terms
        };
        activePaper = { ...activePaper };
      }
      refreshCacheStats();
      setTimeout(() => {
        companionRef?.focusCard('terminology');
      }, 80);
    } catch (e) {
      console.warn('生成術語對齊失敗:', e);
    } finally {
      loadingTerminologyId = null;
    }
  }

  function handleCompanionTriggerGenerate(e: CustomEvent<{ type: string }>) {
    const { type } = e.detail;
    if (!activePaper) return;
    const allSecs = flattenSections(activePaper.sections);
    const sec = allSecs.find(s => s.id === activeSectionId) || allSecs[0];
    if (!sec) return;

    if (type === 'intuition') {
      generateIntuitionForSection(sec);
    } else if (type === 'syntax') {
      generateSyntaxForSection(sec);
    } else if (type === 'terminology') {
      generateTerminologyForSection(sec);
    }
  }

  function handleReaderAction(event: CustomEvent<{ action: string; payload?: any; section?: ChapterSection; selectedText?: string }>) {
    const { action, payload, section, selectedText } = event.detail;

    // 找出對應章節
    let targetSec = section;
    if (!targetSec && activePaper) {
      const allSecs = flattenSections(activePaper.sections);
      targetSec = allSecs.find(s => s.id === (payload || activeSectionId));
    }

    // 關鍵同步：確保伴讀卡片、載入骨架態與當前章節正確聯動切換
    if (targetSec && activeSectionId !== targetSec.id) {
      activeSectionId = targetSec.id;
    }

    const secTitle = targetSec ? targetSec.title : activeSectionId;

    if (action === 'explainTerm') {
      activeContextText = `術語解析 · ${payload}`;
    } else if (action === 'showIntuition') {
      activeContextText = `§ ${secTitle} · 白話科研直覺`;
      if (targetSec) {
        const hasValidIntuition =
          activePaper?.companionData?.[targetSec.id]?.intuition &&
          activePaper.companionData[targetSec.id].intuition.tag !== '待 AI 解析' &&
          !activePaper.companionData[targetSec.id].intuition.title.includes('的核心探討');
        if (hasValidIntuition) {
          companionRef?.focusCard('intuition');
        } else {
          generateIntuitionForSection(targetSec);
        }
      }
    } else if (action === 'showSyntax') {
      activeContextText = `§ ${secTitle} · 長難句語法拆解`;
      if (targetSec) {
        const hasSyntax = activePaper?.companionData?.[targetSec.id]?.syntaxTree;
        if (hasSyntax && !selectedText) {
          companionRef?.focusCard('syntax');
        } else {
          generateSyntaxForSection(targetSec, selectedText);
        }
      }
    } else if (action === 'showTerminology') {
      activeContextText = `§ ${secTitle} · 關鍵術語對齊`;
      if (targetSec) {
        const terms = activePaper?.companionData?.[targetSec.id]?.terminology;
        const hasTerms = terms && terms.length > 1;
        if (hasTerms) {
          companionRef?.focusCard('terminology');
        } else {
          generateTerminologyForSection(targetSec);
        }
      }
    } else if (action === 'addNote') {
      const noteTitle = payload || activeContextText;
      const newNote = {
        title: noteTitle,
        text: `於 ${activeContextText} 標註之重要論文觀點與筆記內容。`,
        time: new Date().toLocaleTimeString()
      };
      saveNotes([newNote, ...capturedNotes]);
      alert(`已為「${noteTitle}」新增精讀筆記！可點選左側 Cognitive Notes 檢視與編輯。`);
    } else if (action === 'translationCompleted') {
      refreshCacheStats();
    } else if (action === 'openOriginalToPage') {
      const { page, sectionId } = payload || {};
      if (sectionId) {
        activeSectionId = sectionId;
        if (activePaper) {
          const allSecs = flattenSections(activePaper.sections);
          const found = allSecs.find(s => s.id === activeSectionId);
          activeContextText = found ? `§ ${found.title}` : `§ ${activeSectionId}`;
        }
      }
      if (readingMode !== 'split') {
        isPdfDrawerOpen = true;
      }
    }
  }

  function handleAskQuestion(event: CustomEvent<{ query: string; reply?: string }>) {
    activeContextText = `探討中: ${event.detail.query.slice(0, 18)}...`;
    refreshCacheStats();
  }

  function handleQuickCompanionAction(event: CustomEvent<{ action: string; payload?: any }>) {
    if (event.detail.action === 'saveSnippet' && event.detail.payload) {
      const newNote = {
        title: `伴讀精華 · ${activeContextText}`,
        text: event.detail.payload,
        time: new Date().toLocaleTimeString()
      };
      saveNotes([newNote, ...capturedNotes]);
    } else if (event.detail.action === 'exportNotes') {
      handleExportNotes();
    }
  }

  function handleExportNotes() {
    isNotesModalOpen = true;
  }

  function handlePaperLoaded(event: CustomEvent<{ paper: PaperDocument; library: PaperDocument[] }>) {
    paperLibrary = event.detail.library;
    setPaper(event.detail.paper);
  }

  function handleDirectImportPaper(event: CustomEvent<{ paper: PaperDocument }>) {
    const paper = event.detail.paper;
    const exists = paperLibrary.some(p => p.id === paper.id);
    const updatedLibrary = exists
      ? paperLibrary.map(p => p.id === paper.id ? paper : p)
      : [paper, ...paperLibrary];
    paperLibrary = updatedLibrary;
    saveLibraryToStorage(updatedLibrary);
    setPaper(paper);
  }

  function handlePaperSelected(event: CustomEvent<{ paper: PaperDocument }>) {
    setPaper(event.detail.paper);
  }

  function handleByokSave(event: CustomEvent<{ provider: string; model: string; apiKey: string }>) {
    const p = event.detail.provider;
    const m = event.detail.model;
    modelName = formatModelDisplayName(p, m);
    if (companionRef && companionRef.refreshKeyFromStorage) {
      companionRef.refreshKeyFromStorage();
    }
    refreshCacheStats();
  }
</script>

<div class="flex h-screen w-screen bg-[#282828] text-[#ebdbb2] overflow-hidden select-text">
  <!-- Left Navigation Rail (Collapsible: 64px / 240px) -->
  <NavigationRail
    currentPath={currentMainView === 'citation-graph' ? 'citation-graph' : (readingMode === 'figures' ? 'prompt-formula-lab' : 'reading-workspace')}
    paperCount={paperLibrary.length}
    bind:isCollapsed={isRailCollapsed}
    memoryUsageMb={localMemoryMb}
    memoryPercent={localMemoryPercent}
    memoryTooltip={localMemoryTooltip}
    on:openRepository={() => isRepositoryOpen = true}
    on:openNotes={() => isNotesModalOpen = true}
    on:toggleCollapse={(e) => isRailCollapsed = e.detail.isCollapsed}
    on:navigate={(e) => {
      if (e.detail.path === 'cognitive-notes') {
        isNotesModalOpen = true;
      } else if (e.detail.path === 'prompt-formula-lab') {
        currentMainView = 'workspace';
        readingMode = 'figures';
      } else if (e.detail.path === 'citation-graph') {
        currentMainView = 'citation-graph';
      } else if (e.detail.path === 'reading-workspace') {
        currentMainView = 'workspace';
      }
    }}
  />

  <!-- Main Content Body (Offset left dynamically by rail width) -->
  <div class="transition-all duration-300 ease-in-out {isRailCollapsed ? 'pl-16' : 'pl-60'} flex-1 flex flex-col h-full overflow-hidden">
    <!-- Top Fixed Header -->
    <AppHeader
      {activePaper}
      bind:readingMode
      bind:zoomLevel
      bind:isPdfDrawerOpen
      {modelName}
      {cachedInfo}
      {isRailCollapsed}
      {cacheStats}
      on:modeChange={handleModeChange}
      on:zoomChange={handleZoomChange}
      on:togglePdfDrawer={() => isPdfDrawerOpen = !isPdfDrawerOpen}
      on:openSettings={() => isByokOpen = true}
      on:openRepository={() => isRepositoryOpen = true}
      on:openImport={() => isImportOpen = true}
      on:exportNotes={handleExportNotes}
    />

    <!-- Main Workspace Frame (pushed down by 64px header) -->
    <main class="w-full pt-16 h-full flex flex-col bg-[#282828] overflow-hidden">
      {#if currentMainView === 'citation-graph'}
        <CitationGraphView
          paper={activePaper}
          on:backToWorkspace={() => currentMainView = 'workspace'}
          on:loadPaper={handleLoadPaperFromCitation}
        />
      {:else}
        <!-- Density & Flow Ribbon -->
        <DensityRibbon
          focusTrack="{activeContextText} · Depth Level: {activePaper?.depthLevel || 'Academic Rigor'}"
          flowWpm={activePaper?.readingSpeedWpm || 265}
          embeddingDim={384}
        />

      <!-- Workspace Studio Layout -->
      {#if readingMode === 'split'}
        <!-- 50/50 Synchronized Dual-Track Split Screen View -->
        <div id="split-container" class="flex-1 overflow-hidden flex divide-x divide-[#3c3836] relative {isDraggingSplit ? 'select-none cursor-col-resize' : ''}">
          <!-- Left Track: Original Document Viewer -->
          <div class="h-full overflow-hidden flex flex-col" style="width: {splitRatio}%">
            <OriginalDocumentViewer
              paper={activePaper}
              mode="split"
              {activeSectionId}
              sections={activePaper?.sections || []}
              on:selectSection={handleSelectSection}
              on:sectionsAligned={handleSectionsAligned}
              on:importPaper={handleDirectImportPaper}
              on:switchToSplit={() => {}}
            />
          </div>

          <!-- Central Draggable Splitter Handle -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
          <div
            class="w-2.5 bg-[#1d2021] hover:bg-[#fe8019] transition-colors cursor-col-resize flex items-center justify-center z-20 group shrink-0"
            on:mousedown={handleSplitMouseDown}
            title="拖曳以自訂左右分屏比例（可使用鍵盤左右鍵微調）"
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            aria-valuenow={splitRatio}
            aria-valuemin="20"
            aria-valuemax="80"
            aria-label="左右分屏調整桿"
            on:keydown={(e) => {
              if (e.key === 'ArrowLeft') splitRatio = Math.max(20, splitRatio - 5);
              if (e.key === 'ArrowRight') splitRatio = Math.min(80, splitRatio + 5);
            }}
          >
            <div class="w-1 h-8 bg-[#504945] group-hover:bg-[#1d2021] rounded-full"></div>
          </div>

          <!-- Right Track: Bilingual Academic Reader (Zoomable) -->
          <div class="h-full overflow-hidden flex-1" style="zoom: {zoomLevel}%">
            <BilingualReader
              bind:this={readerRef}
              paper={activePaper}
              {activeSectionId}
              {readingMode}
              on:selectSection={handleSelectSection}
              on:readerAction={handleReaderAction}
              on:sectionDwell={handleSectionDwell}
              on:sectionSkimmed={handleSectionSkimmed}
              on:sectionInteracted={handleSectionInteracted}
              on:sectionsPassed={handleSectionsPassed}
              on:reachedBottom={handleReachedBottom}
            />
          </div>
        </div>
      {:else if readingMode === 'figures'}
        <!-- Derivations & Figures Comparative Studio Canvas -->
        <div class="flex-1 overflow-hidden">
          <DerivationsFiguresView
            paper={activePaper}
            on:selectSection={(e) => {
              readingMode = 'bilingual';
              handleSelectSection(e);
            }}
          />
        </div>
      {:else}
        <!-- Standard Triad / Zen Studio Layout Grid -->
        <div class="flex-1 overflow-hidden grid transition-all duration-300 {
          readingMode === 'zen'
            ? 'grid-cols-1'
            : 'grid-cols-[270px_minmax(0,1fr)_390px]'
        }">

          <!-- Column 1: Reading Map (hidden in Zen mode) -->
          {#if readingMode !== 'zen'}
            <ReadingMap
              sections={activePaper?.sections || []}
              {activeSectionId}
              arxivId={activePaper?.arxivId}
              sourceUrl={activePaper?.sourceUrl}
              on:selectSection={handleSelectSection}
              on:selectFigure={handleSelectFigure}
              on:selectEquation={handleSelectEquation}
              on:toggleSectionRead={handleToggleSectionRead}
              on:resetProgress={handleResetProgress}
            />
          {/if}

          <!-- Column 2: Bilingual Paper Reader (Scaled by zoomLevel) -->
          <div class="h-full overflow-hidden" style="zoom: {zoomLevel}%">
            <BilingualReader
              bind:this={readerRef}
              paper={activePaper}
              {activeSectionId}
              {readingMode}
              {loadingIntuitionId}
              {loadingSyntaxId}
              {loadingTerminologyId}
              on:selectSection={handleSelectSection}
              on:readerAction={handleReaderAction}
              on:sectionDwell={handleSectionDwell}
              on:sectionSkimmed={handleSectionSkimmed}
              on:sectionInteracted={handleSectionInteracted}
              on:sectionsPassed={handleSectionsPassed}
              on:reachedBottom={handleReachedBottom}
            />
          </div>

          <!-- Column 3: AI Cognitive Companion (hidden in Zen mode) -->
          {#if readingMode !== 'zen'}
            <CognitiveCompanion
              bind:this={companionRef}
              {activeContextText}
              companionData={activePaper?.companionData[activeSectionId]}
              isGeneratingIntuition={loadingIntuitionId === activeSectionId}
              isGeneratingSyntax={loadingSyntaxId === activeSectionId}
              isGeneratingTerminology={loadingTerminologyId === activeSectionId}
              on:triggerGenerate={handleCompanionTriggerGenerate}
              on:askQuestion={handleAskQuestion}
              on:quickAction={handleQuickCompanionAction}
              on:openSettings={() => isByokOpen = true}
            />
          {/if}

        </div>
      {/if}
      {/if}
    </main>
  </div>

  <!-- Import Paper Modal -->
  <ImportPaperModal
    bind:isOpen={isImportOpen}
    currentLibrary={paperLibrary}
    on:paperLoaded={handlePaperLoaded}
    on:close={() => isImportOpen = false}
  />

  <!-- Paper Repository Panel -->
  <PaperRepositoryPanel
    bind:isOpen={isRepositoryOpen}
    library={paperLibrary}
    {activePaperId}
    on:selectPaper={handlePaperSelected}
    on:openImport={() => { isRepositoryOpen = false; isImportOpen = true; }}
    on:close={() => isRepositoryOpen = false}
  />

  <!-- BYOK Setting Modal -->
  <ByokModal
    bind:isOpen={isByokOpen}
    on:save={handleByokSave}
    on:close={() => isByokOpen = false}
  />

  <!-- Cognitive Notes Modal -->
  <CognitiveNotesModal
    bind:isOpen={isNotesModalOpen}
    {activePaper}
    notes={capturedNotes}
    on:updateNotes={(e) => saveNotes(e.detail.notes)}
    on:close={() => isNotesModalOpen = false}
  />

  <!-- Slide-out Original Document Inspector Drawer (Alt+P) -->
  {#if isPdfDrawerOpen}
    <!-- Backdrop Overlay -->
    <div
      class="fixed inset-0 top-16 bg-black/45 z-30 transition-opacity animate-fade-in cursor-pointer"
      on:click={() => isPdfDrawerOpen = false}
      on:keydown={(e) => e.key === 'Escape' && (isPdfDrawerOpen = false)}
      role="button"
      tabindex="0"
      aria-label="點擊關閉原檔抽屜"
    ></div>

    <!-- Right Drawer Panel -->
    <div
      class="fixed right-0 top-16 bottom-0 w-[48vw] min-w-[390px] max-w-[840px] bg-[#1d2021] border-l border-[#504945] z-40 shadow-2xl flex flex-col animate-slide-left"
    >
      <OriginalDocumentViewer
        paper={activePaper}
        mode="drawer"
        {activeSectionId}
        sections={activePaper?.sections || []}
        on:selectSection={handleSelectSection}
        on:sectionsAligned={handleSectionsAligned}
        on:importPaper={(e) => {
          handleDirectImportPaper(e);
          isPdfDrawerOpen = false;
          readingMode = 'split';
        }}
        on:close={() => isPdfDrawerOpen = false}
        on:switchToSplit={() => { isPdfDrawerOpen = false; readingMode = 'split'; }}
      />
    </div>
  {/if}
</div>

<svelte:window on:keydown={handleGlobalKeydown} />

