<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection, PaperDocument, FigureItem, FormulaItem } from '../../stores/documentStore';
  import { calculateReadingStats } from '../../stores/readingStore';

  export let sections: ChapterSection[] = [];
  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let arxivId: string | undefined = undefined;
  export let sourceUrl: string | undefined = undefined;

  const dispatch = createEventDispatcher();

  let searchQuery: string = '';

  function normalizeAcademicImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim().replace(/^<|>$/g, '');
    if (url.includes('mdpi.com') && (url.includes('/images/') || url.includes('/html/') || /\.(?:png|jpe?g|webp|svg|gif)/i.test(url))) {
      url = url.replace(/https?:\/\/(?:www\.)?mdpi\.com\//i, 'https://pub.mdpi-res.com/');
    }
    return url;
  }

  // 聚合當前文獻的所有圖表 (Figures Dashboard)
  $: allPaperFigures = (() => {
    const list: FigureItem[] = [];
    const seenUrls = new Set<string>();

    if (paper?.figureList) {
      for (const f of paper.figureList) {
        if (!seenUrls.has(f.imageUrl)) {
          seenUrls.add(f.imageUrl);
          list.push({ ...f, imageUrl: normalizeAcademicImageUrl(f.imageUrl) });
        }
      }
    }

    function extractFromSecs(secs: ChapterSection[]) {
      for (const sec of secs) {
        if (sec.figures) {
          for (const f of sec.figures) {
            if (!seenUrls.has(f.imageUrl)) {
              seenUrls.add(f.imageUrl);
              list.push({ ...f, imageUrl: normalizeAcademicImageUrl(f.imageUrl) });
            }
          }
        }
        if (sec.children) extractFromSecs(sec.children);
      }
    }
    extractFromSecs(sections);

    return list;
  })();

  $: readingStats = calculateReadingStats(sections);
  $: deepCoveragePercent = readingStats.deepCoveragePercent;
  $: skimCoveragePercent = readingStats.skimCoveragePercent;
  $: deepWords = readingStats.deepWords;
  $: totalWords = readingStats.totalWords;

  // Filter sections recursively based on search query
  $: filteredSections = filterSections(sections, searchQuery.toLowerCase().trim());

  function filterSections(secs: ChapterSection[], query: string): ChapterSection[] {
    if (!query) return secs;
    const result: ChapterSection[] = [];

    for (const sec of secs) {
      const titleMatch = sec.title.toLowerCase().includes(query);
      const contentMatch = (sec.paragraphs || []).some(p => p.toLowerCase().includes(query));
      const childMatches = sec.children ? filterSections(sec.children, query) : [];

      if (titleMatch || contentMatch || childMatches.length > 0) {
        result.push({
          ...sec,
          children: childMatches.length > 0 ? childMatches : sec.children
        });
      }
    }
    return result;
  }

  function selectSection(id: string) {
    activeSectionId = id;
    dispatch('selectSection', { id, source: 'outline' });
  }

  function toggleSectionRead(id: string, e: MouseEvent) {
    e.stopPropagation();
    dispatch('toggleSectionRead', { id });
  }

  function resetProgress() {
    if (confirm('確定要重設本篇論文的閱讀進度嗎？')) {
      dispatch('resetProgress');
    }
  }

  function selectFigure(figId: string) {
    dispatch('selectFigure', { figId });
  }

  function selectEquation(eqId: string, sectionId?: string, formulaNumber?: string) {
    dispatch('selectEquation', { eqId, sectionId, formulaNumber });
  }

  // 取得當前文獻的第一個圖表
  $: firstFigure = (() => {
    for (const sec of sections) {
      if (sec.figures && sec.figures.length > 0) return sec.figures[0];
      if (sec.children) {
        for (const sub of sec.children) {
          if (sub.figures && sub.figures.length > 0) return sub.figures[0];
        }
      }
    }
    return null;
  })();

  export interface DashboardFormulaItem {
    formula: FormulaItem;
    sectionId: string;
    sectionTitle: string;
    page?: string;
    sourceContextSnippet?: string;
  }

  // 聚合當前文獻的所有函數公式並記錄章節出處 (Provenance Tracking)
  $: allPaperFormulas = (() => {
    const list: DashboardFormulaItem[] = [];
    const seenLatex = new Set<string>();
    const isMLPaper = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '');

    function extractFromSecs(secs: ChapterSection[]) {
      for (const sec of secs) {
        // 1. 已結構化之 formulas (嚴格過濾非 ML 論文中的偽造損失函數)
        if (sec.formulas) {
          for (const f of sec.formulas) {
            if (!f || !f.latexText) continue;
            const combined = `${f.latexText} ${f.name || ''} ${JSON.stringify(f.variables || [])}`;
            const isFabricatedML = /\\min[\s_{]|\\mathcal\{L\}|\\mathbb\{E\}|\\Omega\s*\(|\\ell\s*\(|f_\\theta|綜合損失|正則化懲罰|模型參數權重/i.test(combined);
            if (isFabricatedML && !isMLPaper) continue;

            const norm = f.latexText.trim().replace(/\s+/g, '');
            if (!seenLatex.has(norm)) {
              seenLatex.add(norm);
              const resolvedSecId = f.sectionId || sec.id || 'sec_root';
              const resolvedSecTitle = f.sectionTitle || sec.title || (paper?.title ? `§ ${paper.title.slice(0, 16)}...` : '文獻主體章節');
              const resolvedPage = f.page || (sec.page ? `p. ${sec.page}` : undefined);
              list.push({
                formula: f,
                sectionId: resolvedSecId,
                sectionTitle: resolvedSecTitle,
                page: resolvedPage,
                sourceContextSnippet: f.sourceContextSnippet
              });
            }
          }
        }

        // 2. 段落中內嵌之區塊公式 ($$ ... $$)
        if (sec.paragraphs) {
          const secPage = sec.page ? `p. ${sec.page}` : undefined;
          const cleanSecTitle = (sec.title || '').replace(/^§\s*/, '').trim();
          const secPrefix = cleanSecTitle.split(' ')[0] || '';

          for (let i = 0; i < sec.paragraphs.length; i++) {
            const p = sec.paragraphs[i];
            if (!p || !p.includes('$$')) continue;
            const blockMatch = p.match(/\$\$([\s\S]*?)\$\$(\s*\(([0-9a-zA-Z.-]+)\))?/);
            if (blockMatch && blockMatch[1].trim()) {
              const rawLatex = blockMatch[1].trim();
              const norm = rawLatex.replace(/\s+/g, '');
              if (!seenLatex.has(norm)) {
                seenLatex.add(norm);
                let formulaNum = blockMatch[3] ? `(${blockMatch[3]})` : '';
                if (!formulaNum && i + 1 < sec.paragraphs.length) {
                  const nextP = sec.paragraphs[i + 1].trim();
                  const numMatch = nextP.match(/^\(([0-9a-zA-Z.-]+)\)$/);
                  if (numMatch) formulaNum = `(${numMatch[1]})`;
                }
                if (!formulaNum) formulaNum = `(${list.length + 1})`;

                const nameNum = formulaNum.replace(/[()]/g, '');
                const formulaName = secPrefix ? `§ ${secPrefix} 方程式 ${nameNum}` : `核心方程式 ${nameNum}`;
                const lhs = rawLatex.split(/[\s=:]+/)[0]?.replace(/[\\{}]/g, '').trim() || 'y';

                list.push({
                  formula: {
                    id: `sec_${sec.id}_eq_${list.length + 1}`,
                    number: formulaNum,
                    name: formulaName,
                    latexText: rawLatex,
                    page: secPage,
                    sectionId: sec.id,
                    sectionTitle: sec.title,
                    sourceContextSnippet: p.replace(/\$\$/g, '').slice(0, 160),
                    variables: [
                      { symbol: lhs, meaning: '核心目標物理量 / 狀態指標', color: '#fe8019' },
                      { symbol: 'm_\\Sigma / t', meaning: '控制變因 / 累積質量與時間', color: '#fabd2f' }
                    ]
                  },
                  sectionId: sec.id,
                  sectionTitle: sec.title,
                  page: secPage,
                  sourceContextSnippet: p.replace(/\$\$/g, '').slice(0, 160)
                });
              }
            }
          }
        }

        if (sec.children) extractFromSecs(sec.children);
      }
    }

    extractFromSecs(sections);
    return list;
  })();

  let activeFormulaIndex: number = 0;
  $: if (activeFormulaIndex >= allPaperFormulas.length && allPaperFormulas.length > 0) {
    activeFormulaIndex = 0;
  }
  $: currentDashboardFormula = allPaperFormulas[activeFormulaIndex] || null;

  function nextFormula(e: MouseEvent) {
    e.stopPropagation();
    if (allPaperFormulas.length > 0) {
      activeFormulaIndex = (activeFormulaIndex + 1) % allPaperFormulas.length;
    }
  }

  function prevFormula(e: MouseEvent) {
    e.stopPropagation();
    if (allPaperFormulas.length > 0) {
      activeFormulaIndex = (activeFormulaIndex - 1 + allPaperFormulas.length) % allPaperFormulas.length;
    }
  }

  let collapsedSections: Record<string, boolean> = {};

  function toggleSectionCollapse(id: string, e: MouseEvent) {
    e.stopPropagation();
    collapsedSections[id] = !collapsedSections[id];
    collapsedSections = { ...collapsedSections };
  }
</script>

<aside class="h-full flex flex-col bg-[#1d2021] border-r border-[#3c3836] overflow-hidden select-none">
  <!-- Search Bar with Live Filter -->
  <div class="p-2 bg-[#1d2021] shrink-0 border-b border-[#3c3836]">
    <div class="relative flex items-center">
      <span class="material-symbols-outlined absolute left-2 text-[15px] text-[#a89984]">search</span>
      <input
        class="w-full bg-[#282828] border border-[#3c3836] text-[#ebdbb2] placeholder:text-[#a89984]/70 text-xs pl-7 pr-7 py-1.5 rounded-lg focus:outline-none focus:border-[#fe8019] focus:bg-[#32302f] transition-colors"
        placeholder="搜尋段落、定理、公式或名詞..."
        type="text"
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          class="absolute right-2 text-[#a89984] hover:text-[#ebdbb2]"
          on:click={() => searchQuery = ''}
        >
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-3">
    <!-- Progress Heatmap Badge -->
    <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
      <div class="flex items-center justify-between text-[#a89984]">
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[10px] uppercase tracking-wider text-[#ebdbb2] font-semibold">精讀覆蓋率</span>
          <span class="text-[10px] font-mono text-[#b8bb26] font-bold" title="已精讀研讀比例">{deepCoveragePercent}%</span>
          {#if skimCoveragePercent > 0}
            <span class="text-[9px] font-mono text-[#fabd2f]/90" title="已瀏覽掃讀比例">(+{skimCoveragePercent}% 掃讀)</span>
          {/if}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[11px] text-[#fabd2f] font-semibold">
            {deepWords.toLocaleString()} / {totalWords.toLocaleString()} 字
          </span>
          <button
            class="text-[#a89984] hover:text-[#fe8019] transition-colors p-0.5 rounded cursor-pointer"
            on:click={resetProgress}
            title="重設此篇閱讀進度"
          >
            <span class="material-symbols-outlined text-[13px]">restart_alt</span>
          </button>
        </div>
      </div>
      <!-- Dual-Track Real Progress Bar -->
      <div class="w-full h-2 bg-[#141617] rounded-full overflow-hidden flex border border-[#3c3836]/80" title="綠色: 精讀掌握度 {deepCoveragePercent}% / 黃色: 瀏覽掃讀度 {skimCoveragePercent}%">
        <div class="bg-[#b8bb26] h-full transition-all duration-300" style="width: {deepCoveragePercent}%"></div>
        <div class="bg-[#fabd2f]/50 h-full transition-all duration-300" style="width: {skimCoveragePercent}%"></div>
      </div>
      <div class="flex items-center justify-between font-mono text-[10px] text-[#a89984] leading-tight">
        <span>視線停留於 <strong class="text-[#fe8019]">§{activeSectionId}</strong></span>
        <span class="text-[#b8bb26] flex items-center gap-0.5">
          <span class="h-1.5 w-1.5 rounded-full bg-[#b8bb26] inline-block"></span>
          即時動態追蹤
        </span>
      </div>
    </div>

    <!-- Outline Structure Tree -->
    <div class="flex flex-col gap-0.5">
      <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] px-2 mb-1 flex items-center justify-between">
        <span>目錄樹 (Structure)</span>
        {#if searchQuery}
          <span class="text-[#fabd2f]">過濾中</span>
        {/if}
      </span>

      {#if filteredSections.length === 0}
        <div class="p-3 text-center text-[#a89984] text-xs font-mono">
          未找到匹配「{searchQuery}」之章節
        </div>
      {/if}

      {#each filteredSections as section}
        {@const isAct = activeSectionId === section.id}
        <!-- Level 1 Section -->
        <div class="flex flex-col">
          <div
            class="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors {
              isAct
                ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]'
                : 'text-[#ebdbb2] hover:bg-[#282828] hover:text-[#fabd2f]'
            }"
          >
            <!-- Toggle Checkmark / Icon & Section Title -->
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                class="hover:scale-125 transition-transform flex items-center shrink-0 cursor-pointer bg-transparent border-0 p-0 text-inherit"
                on:click={(e) => toggleSectionRead(section.id, e)}
                title={section.isRead ? "點擊標記為未讀" : "點擊標記為已讀"}
              >
                {#if isAct}
                  <span class="material-symbols-outlined text-[16px] text-[#fe8019]" title="正在閱讀中">center_focus_strong</span>
                {:else if section.isRead}
                  <span class="material-symbols-outlined text-[16px] text-[#b8bb26]" title="已精讀">check_circle</span>
                {:else if section.progress >= 70}
                  <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">timelapse</span>
                {:else if section.progress > 0}
                  <span class="material-symbols-outlined text-[16px] text-[#fabd2f]/80">radio_button_checked</span>
                {:else}
                  <span class="material-symbols-outlined text-[16px] text-[#a89984] hover:text-[#ebdbb2]">radio_button_unchecked</span>
                {/if}
              </button>
              <button
                type="button"
                class="text-xs truncate text-left bg-transparent border-0 p-0 text-inherit cursor-pointer flex-1 min-w-0"
                on:click={() => selectSection(section.id)}
              >
                {section.title}
              </button>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              {#if section.isRead}
                <span class="font-mono text-[10px] text-[#b8bb26] font-semibold">100%</span>
              {:else if section.progress > 0}
                <span class="font-mono text-[10px] text-[#fabd2f]">{section.progress}%</span>
              {/if}

              {#if section.children && section.children.length > 0}
                <button
                  class="w-5 h-5 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#504945]/40 transition-colors"
                  on:click={(e) => toggleSectionCollapse(section.id, e)}
                  title={collapsedSections[section.id] ? "展開子章節" : "收合子章節"}
                >
                  <span class="material-symbols-outlined text-[16px]">
                    {collapsedSections[section.id] ? 'chevron_right' : 'expand_more'}
                  </span>
                </button>
              {/if}
            </div>
          </div>

          <!-- Level 2 Children -->
          {#if section.children && section.children.length > 0 && !collapsedSections[section.id]}
            <div class="ml-2.5 pl-2.5 flex flex-col gap-0.5 mt-0.5 border-l border-[#504945]">
              {#each section.children as sub}
                {@const isSubAct = activeSectionId === sub.id}
                <div
                  class="w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors {
                    isSubAct
                      ? 'bg-[#3c3836] text-[#fe8019] font-semibold'
                      : 'text-[#d5c4a1] hover:text-[#ebdbb2] hover:bg-[#282828]'
                  }"
                >
                  <div class="flex-1 text-left truncate text-xs flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      class="hover:scale-125 transition-transform flex items-center shrink-0 cursor-pointer bg-transparent border-0 p-0 text-inherit"
                      on:click={(e) => toggleSectionRead(sub.id, e)}
                      title={sub.isRead ? "點擊標記為未讀" : "點擊標記為已讀"}
                    >
                      {#if isSubAct}
                        <span class="material-symbols-outlined text-[14px] text-[#fe8019]">center_focus_strong</span>
                      {:else if sub.isRead}
                        <span class="material-symbols-outlined text-[13px] text-[#b8bb26]">check_circle</span>
                      {:else if sub.progress > 0}
                        <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">timelapse</span>
                      {:else}
                        <span class="material-symbols-outlined text-[13px] text-[#a89984]">radio_button_unchecked</span>
                      {/if}
                    </button>
                    <button
                      type="button"
                      class="truncate text-left bg-transparent border-0 p-0 text-inherit cursor-pointer flex-1 min-w-0"
                      on:click={() => selectSection(sub.id)}
                    >
                      {sub.title}
                    </button>
                  </div>

                  <div class="flex items-center gap-1 shrink-0">
                    {#if sub.children && sub.children.length > 0}
                      <button
                        class="w-4 h-4 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2]"
                        on:click={(e) => toggleSectionCollapse(sub.id, e)}
                      >
                        <span class="material-symbols-outlined text-[14px]">
                          {collapsedSections[sub.id] ? 'chevron_right' : 'expand_more'}
                        </span>
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Level 3 Children -->
                {#if sub.children && sub.children.length > 0 && !collapsedSections[sub.id]}
                  <div class="ml-2 pl-2 border-l border-[#504945]/70 flex flex-col gap-0.5 py-0.5">
                    {#each sub.children as subsub}
                      {@const isSubSubAct = activeSectionId === subsub.id}
                      <button
                        class="w-full text-left px-1.5 py-0.5 font-mono text-[10px] rounded transition-colors flex items-center gap-1 {
                          isSubSubAct
                            ? 'bg-[#32302f] text-[#fe8019] font-semibold'
                            : 'text-[#d5c4a1] hover:text-[#ebdbb2] hover:bg-[#32302f]'
                        }"
                        on:click={() => selectSection(subsub.id)}
                      >
                        <span class="material-symbols-outlined text-[11px] {isSubSubAct ? 'text-[#fe8019]' : 'text-[#a89984]'}">arrow_right</span>
                        <span class="truncate">{subsub.title}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Figures & Equations Dashboard Deck -->
    <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
      <div class="flex items-center justify-between px-1">
        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px] text-[#fe8019]">photo_library</span>
          <span>文獻圖表看板</span>
          {#if allPaperFigures.length > 0}
            <span class="text-[#b8bb26] font-bold font-mono">({allPaperFigures.length})</span>
          {/if}
        </span>
        <button
          type="button"
          class="font-mono text-[10px] text-[#fabd2f] hover:text-[#fe8019] hover:underline cursor-pointer flex items-center gap-0.5 bg-transparent border-0 p-0"
          on:click={() => dispatch('openFiguresStudio')}
          title="切換至全景圖表推導工作室"
        >
          <span>Studio ➜</span>
        </button>
      </div>

      <!-- Figures Gallery Strip (Directly load and showcase all figures in Dashboard) -->
      {#if allPaperFigures.length > 0}
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 px-0.5 scrollbar-thin scrollbar-thumb-[#3c3836]">
          {#each allPaperFigures as fig, fIndex}
            <button
              type="button"
              class="w-14 h-16 bg-[#141617] hover:bg-[#282828] border border-[#3c3836] hover:border-[#fe8019] rounded shrink-0 overflow-hidden relative flex flex-col items-center justify-between p-1 transition-all cursor-pointer group shadow-xs hover:scale-105 active:scale-95"
              on:click={() => dispatch('selectFigure', { figId: fig.id, imageUrl: fig.imageUrl, name: fig.name })}
              title={`${fig.figureNumber || `Figure ${fIndex + 1}`}: ${fig.name}`}
            >
              <div class="w-full flex-1 flex items-center justify-center overflow-hidden">
                <img
                  src={fig.imageUrl}
                  alt={fig.name}
                  referrerpolicy="no-referrer"
                  class="max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              </div>
              <span class="font-mono text-[8px] text-[#fabd2f] group-hover:text-[#fe8019] truncate w-full text-center mt-0.5 font-bold">
                {fig.figureNumber?.replace(/Figure\s*/i, 'F') || `F${fIndex + 1}`}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <!-- Fallback Mini Figure Card -->
        <button
          type="button"
          class="w-full text-left bg-[#282828] border border-[#3c3836] p-2 rounded-lg hover:bg-[#32302f] hover:border-[#504945] transition-colors cursor-pointer flex gap-2 group"
          on:click={() => selectFigure(firstFigure?.id || 'fig1')}
        >
          <div class="w-12 h-14 bg-[#1d2021] border border-[#3c3836] rounded shrink-0 overflow-hidden relative flex items-center justify-center p-1">
            {#if firstFigure?.imageUrl}
              <img
                src={firstFigure.imageUrl}
                alt={firstFigure.name}
                referrerpolicy="no-referrer"
                class="w-full h-full object-contain"
                loading="lazy"
              />
            {:else}
              <svg class="w-full h-full text-[#fabd2f] opacity-80 group-hover:opacity-100 transition-opacity" viewBox="0 0 40 50">
                <rect fill="currentColor" fill-opacity="0.2" height="8" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="4"></rect>
                <rect fill="currentColor" fill-opacity="0.4" height="12" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="16"></rect>
                <rect fill="currentColor" fill-opacity="0.2" height="14" rx="2" stroke="currentColor" stroke-width="1.2" width="30" x="5" y="32"></rect>
                <path d="M 20 12 L 20 16 M 20 28 L 20 32" stroke="currentColor" stroke-width="1.2"></path>
              </svg>
            {/if}
            <span class="absolute bottom-0.5 right-0.5 font-mono text-[8px] bg-[#1d2021] border border-[#504945] px-0.5 rounded text-[#a89984]">
              {firstFigure?.figureNumber?.replace(/Figure\s*/i, 'Fig ') || 'Fig 1'}
            </span>
          </div>
          <div class="flex flex-col justify-center min-w-0">
            <span class="text-xs text-[#ebdbb2] font-medium truncate">{firstFigure?.name || '文獻圖表載入中'}</span>
            <span class="font-mono text-[10px] text-[#a89984] truncate">{firstFigure?.caption || '學術文獻結構圖表'}</span>
          </div>
        </button>
      {/if}

      <!-- Mini Equation & Provenance Dashboard Card -->
      {#if currentDashboardFormula}
        <!-- Formula Provenance Pills Strip: 一眼掌握全篇論文所有函數出處 -->
        {#if allPaperFormulas.length > 0}
          <div class="flex items-center gap-1 overflow-x-auto pb-1 px-0.5 scrollbar-thin scrollbar-thumb-[#3c3836]">
            {#each allPaperFormulas as item, fIdx}
              <button
                type="button"
                class="font-mono text-[9px] px-2 py-0.5 rounded-full border transition-all shrink-0 flex items-center gap-1 cursor-pointer {
                  activeFormulaIndex === fIdx
                    ? 'bg-[#fe8019]/20 border-[#fe8019] text-[#fe8019] font-bold shadow-xs'
                    : 'bg-[#141617] border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] hover:border-[#504945]'
                }"
                on:click={() => {
                  activeFormulaIndex = fIdx;
                  selectEquation(item.formula.id, item.sectionId, item.formula.number);
                }}
                title={`${item.formula.number || `Eq ${fIdx + 1}`}: ${item.formula.name} (出處: § ${item.sectionTitle})`}
              >
                <span class="material-symbols-outlined text-[10px] text-[#fe8019]">functions</span>
                <span>{item.formula.number || `Eq ${fIdx + 1}`}</span>
                <span class="opacity-70">·</span>
                <span class="truncate max-w-[80px]">§ {item.sectionTitle.replace(/^§\s*/, '').split(' ')[0]}</span>
              </button>
            {/each}
          </div>
        {/if}

        <div class="w-full bg-[#282828] border border-[#3c3836] border-l-4 border-l-[#fabd2f] p-2.5 rounded-lg hover:border-[#504945] transition-colors flex flex-col gap-2 shadow-sm">
          <!-- Top Row: Equation Number, Name & Navigation -->
          <div class="flex items-center justify-between text-[#a89984]">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-[10px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.2 rounded font-bold shrink-0">
                {currentDashboardFormula.formula.number || 'Eq. (1)'}
              </span>
              <span class="font-mono text-[11px] text-[#ebdbb2] font-semibold truncate max-w-[140px]">{currentDashboardFormula.formula.name}</span>
            </div>
            {#if allPaperFormulas.length > 1}
              <div class="flex items-center gap-1 shrink-0">
                <span class="font-mono text-[9px] text-[#a89984]">{activeFormulaIndex + 1}/{allPaperFormulas.length}</span>
                <button
                  type="button"
                  class="text-[#a89984] hover:text-[#fe8019] p-0.5 rounded hover:bg-[#3c3836] transition-colors"
                  on:click={prevFormula}
                  title="上一條公式"
                >
                  <span class="material-symbols-outlined text-[12px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  class="text-[#a89984] hover:text-[#fe8019] p-0.5 rounded hover:bg-[#3c3836] transition-colors"
                  on:click={nextFormula}
                  title="下一條公式"
                >
                  <span class="material-symbols-outlined text-[12px]">chevron_right</span>
                </button>
              </div>
            {/if}
          </div>

          <!-- Provenance Badge: 清楚標註函數是從哪裡來的 (章節出處與頁碼) -->
          <div class="flex items-center justify-between gap-1 text-[9px] font-mono bg-[#141617] border border-[#3c3836] px-2 py-1 rounded text-[#8ec07c]">
            <div class="flex items-center gap-1.5 truncate max-w-[190px]" title="文獻出處：§ {currentDashboardFormula.sectionTitle} {currentDashboardFormula.page ? `(${currentDashboardFormula.page})` : ''}">
              <span class="material-symbols-outlined text-[12px] text-[#fe8019] shrink-0">pin_drop</span>
              <span class="text-[#fe8019] font-bold shrink-0">出處:</span>
              <span class="text-[#ebdbb2] font-medium truncate">§ {currentDashboardFormula.sectionTitle.replace(/^§\s*/, '')}</span>
            </div>
            {#if currentDashboardFormula.page}
              <span class="text-[#a89984] bg-[#282828] border border-[#3c3836] px-1 py-0.2 rounded text-[8px] shrink-0">{currentDashboardFormula.page}</span>
            {/if}
          </div>

          <!-- Formula Math Expression Display & Direct Target Jump -->
          <button
            type="button"
            class="w-full text-left font-mono text-[#ebdbb2] bg-[#1d2021] hover:bg-[#181a1b] border border-[#3c3836] hover:border-[#fe8019]/60 px-2 py-1.5 rounded tracking-tight text-[10px] truncate cursor-pointer transition-colors shadow-xs"
            on:click={() => {
              if (currentDashboardFormula) {
                selectEquation(currentDashboardFormula.formula.id, currentDashboardFormula.sectionId, currentDashboardFormula.formula.number);
              }
            }}
            title="點擊定位跳轉至原文對應公式"
          >
            {currentDashboardFormula.formula.latexText}
          </button>

          <!-- Source Context Snippet (原文引述脈絡線索) -->
          {#if currentDashboardFormula.sourceContextSnippet}
            <div class="text-[9px] text-[#a89984] italic truncate px-1 border-l-2 border-[#fe8019]/70 bg-[#1d2021]/50 py-0.5 rounded-r" title="原文引述：{currentDashboardFormula.sourceContextSnippet}">
              <span class="text-[#fe8019] font-normal mr-1">[引述]:</span>“{currentDashboardFormula.sourceContextSnippet}”
            </div>
          {/if}

          <!-- Bottom Actions: Jump To Section & Open Studio -->
          <div class="flex items-center justify-between pt-1 border-t border-[#3c3836]/60">
            <button
              type="button"
              class="font-mono text-[9px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5 transition-colors cursor-pointer"
              on:click={() => dispatch('openFiguresStudio')}
              title="前往 Formula Lab 深入推導與證明"
            >
              <span class="material-symbols-outlined text-[11px]">schema</span>
              <span>推導工作室</span>
            </button>
            <button
              type="button"
              class="font-mono text-[9px] text-[#8ec07c] hover:text-[#b8bb26] flex items-center gap-0.5 transition-colors cursor-pointer font-semibold"
              on:click={() => {
                if (currentDashboardFormula) {
                  selectSection(currentDashboardFormula.sectionId);
                  selectEquation(currentDashboardFormula.formula.id, currentDashboardFormula.sectionId, currentDashboardFormula.formula.number);
                }
              }}
              title="跳轉並在原文中精確定位此公式"
            >
              <span class="material-symbols-outlined text-[11px]">my_location</span>
              <span>定位原文出處 ➜</span>
            </button>
          </div>
        </div>
      {:else}
        <!-- Fallback Mini Card when no formula extracted yet -->
        <button
          type="button"
          class="w-full text-left bg-[#282828] border border-[#3c3836] border-l-4 border-l-[#fabd2f] p-2 rounded-lg hover:bg-[#32302f] transition-colors cursor-pointer flex flex-col gap-1"
          on:click={() => selectEquation('eq_efficiency')}
        >
          <div class="flex items-center justify-between text-[#a89984]">
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1 py-0.2 rounded font-bold">PREVIEW</span>
              <span class="font-mono text-[10px] text-[#fabd2f] font-semibold">Eq. (1)</span>
            </div>
            <span class="font-mono text-[10px] truncate max-w-[120px]">核心推導公式</span>
          </div>
          <div class="font-mono text-[#ebdbb2] bg-[#1d2021] border border-[#3c3836] px-1.5 py-1 rounded tracking-tight text-[10px] truncate">
            η = (C · (1 + γ)) / (ln(τ + 1) · √Ω)
          </div>
          <span class="font-mono text-[9px] text-[#8ec07c]">出處: 範例展示 (Attention § 3.2.1)</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Left Bottom System Pill -->
  <div class="p-2 bg-[#141617] border-t border-[#3c3836] shrink-0">
    <div class="flex items-center justify-between text-[#a89984] font-mono text-[10px]">
      <span class="flex items-center gap-1.5 truncate max-w-[180px]">
        <span class="h-1.5 w-1.5 rounded-full bg-[#b8bb26] shrink-0"></span>
        {#if arxivId}
          {arxivId}
        {:else if sourceUrl}
          {new URL(sourceUrl).hostname}
        {:else}
          LOCAL ARCHIVE
        {/if}
      </span>
      <span class="font-mono text-[#fe8019] shrink-0">MUGEN BETA</span>
    </div>
  </div>
</aside>
