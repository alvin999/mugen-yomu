<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, ChapterSection } from '../../stores/documentStore';
  import { flattenSections } from '../../stores/readingStore';
  import katex from 'katex';

  export let paper: PaperDocument | null = null;
  export let activeSectionId: string = '3.2.1';
  export let readingMode: 'bilingual' | 'zen' | 'figures' = 'bilingual';
  export let isAbstractCollapsed: boolean = false;

  const dispatch = createEventDispatcher();

  function renderMath(latex: string, displayMode: boolean = false): string {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false
      });
    } catch (err) {
      console.warn('KaTeX rendering error:', err);
      return `<span class="text-[#fb4934] font-mono">${latex}</span>`;
    }
  }

  function triggerAction(actionName: string, payload?: any) {
    dispatch('readerAction', { action: actionName, payload });
  }

  function toggleAbstract() {
    isAbstractCollapsed = !isAbstractCollapsed;
  }

  function handleSectionClick(id: string) {
    activeSectionId = id;
    dispatch('selectSection', { id });
  }

  // Flatten all sections to easily display and anchor
  $: allSections = paper ? flattenSections(paper.sections) : [];
  $: activeSection = allSections.find(s => s.id === activeSectionId) || (allSections[0] || null);
</script>

<main class="h-full overflow-y-auto px-6 py-6 flex justify-center bg-[#282828] scroll-smooth">
  <div class="w-full max-w-[760px] flex flex-col gap-6 pb-28">

    {#if paper}
      <!-- Paper Academic Header -->
      <header class="flex flex-col gap-3 pb-5 bg-[#32302f] border border-[#3c3836] p-5 rounded-xl relative overflow-hidden shadow-md">
        <div class="flex flex-wrap items-center gap-2">
          {#if paper.type === 'web'}
            <span class="font-mono text-[10px] bg-[#83a598]/15 border border-[#83a598]/40 text-[#83a598] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined text-[12px]">language</span> 網頁專文 · Web Article
            </span>
          {:else}
            <span class="font-mono text-[10px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-2 py-0.5 rounded font-semibold">
              {paper.venue}
            </span>
          {/if}

          {#if paper.arxivId}
            <span class="font-mono text-[10px] text-[#a89984]">{paper.arxivId}</span>
          {/if}

          {#if paper.citations}
            <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-2 py-0.5 rounded font-medium">
              Citations: {paper.citations}
            </span>
          {/if}

          {#if paper.sourceUrl}
            <a
              href={paper.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 ml-auto"
            >
              <span>查看原文</span>
              <span class="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          {/if}
        </div>

        <h1 class="text-3xl text-[#ebdbb2] tracking-tight font-serif leading-tight font-bold">
          {paper.title}
        </h1>

        <div class="text-xs text-[#a89984] flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {#each paper.authors as author, i}
            <span class="text-[#d5c4a1] font-medium hover:text-[#fe8019] cursor-pointer">
              {author}{i < paper.authors.length - 1 ? ',' : ''}
            </span>
          {/each}
        </div>

        <!-- Abstract Collapsible Card -->
        <div class="mt-1 bg-[#282828] border border-[#3c3836] p-3.5 rounded-lg flex flex-col gap-2 shadow-inner">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#fabd2f] font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-[#fe8019]">auto_stories</span> 白話科學摘要 (Bilingual Abstract Core)
            </span>
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-0.5 transition-colors"
              on:click={toggleAbstract}
            >
              <span>{isAbstractCollapsed ? '展開' : '收起'}</span>
              <span class="material-symbols-outlined text-[13px]">{isAbstractCollapsed ? 'expand_more' : 'expand_less'}</span>
            </button>
          </div>

          {#if !isAbstractCollapsed}
            <div class="flex flex-col gap-2 text-xs">
              <p class="text-[#d5c4a1] leading-relaxed text-justify">
                {paper.abstract.chineseSummary}
              </p>
              <p class="font-serif text-[#a89984] italic leading-relaxed border-t border-[#3c3836] pt-2 text-[13px]">
                "{paper.abstract.english}"
              </p>
            </div>
          {/if}
        </div>
      </header>

      <!-- Sections Stream -->
      <div class="flex flex-col gap-6">
        {#each allSections as sec}
          {@const isFocused = sec.id === activeSectionId}

          <!-- SECTION WRAPPER -->
          <section
            id={`sec-${sec.id}`}
            class="flex flex-col gap-3 transition-all duration-300 rounded-xl {isFocused ? 'relative bg-[#32302f] border border-[#504945] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)]' : 'opacity-85 hover:opacity-100 p-2'}"
            on:click={() => handleSectionClick(sec.id)}
          >
            <!-- Focus Lens Indicator Bar & Badge -->
            {#if isFocused}
              <div class="absolute -left-2 top-4 bottom-4 w-1.5 bg-[#fe8019] rounded-full focus-lens-bar"></div>
            {/if}

            <div class="flex items-center justify-between">
              <div class="flex items-baseline gap-2.5">
                <span class="font-mono text-[#fe8019] font-bold {sec.level === 1 ? 'text-lg' : 'text-sm'}">
                  {sec.title.split(' ')[0] || sec.id}
                </span>
                <h2 class="{sec.level === 1 ? 'text-xl' : 'text-base'} text-[#ebdbb2] tracking-tight font-bold {sec.level === 1 ? 'font-serif' : 'font-sans'}">
                  {sec.title.replace(/^[0-9.]+\s*/, '')}
                </h2>
              </div>

              {#if isFocused}
                <div class="flex items-center gap-1 bg-[#fe8019]/15 border border-[#fe8019]/50 px-2 py-0.5 rounded-full text-[#fe8019]">
                  <span class="material-symbols-outlined text-[13px]">center_focus_strong</span>
                  <span class="font-mono text-[9px] font-semibold uppercase">Focus Lens Active</span>
                </div>
              {/if}
            </div>

            <!-- Paragraphs -->
            <div class="flex flex-col gap-3">
              {#each sec.paragraphs as para, pIndex}
                <p class="font-serif text-[17px] text-[#ebdbb2]/90 leading-[32px] text-justify">
                  {para}
                </p>
              {/each}
            </div>

            <!-- SVO Sentence Highlight (If present) -->
            {#if sec.svoSentence && isFocused}
              <div class="my-2 p-3 bg-[#282828] border-l-4 border-[#8ec07c] rounded-r-lg flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] bg-[#8ec07c] text-[#1d2021] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                    <span class="material-symbols-outlined text-[11px]">account_tree</span>
                    {sec.svoSentence.svoBadge}
                  </span>
                  <span class="font-mono text-[10px] text-[#a89984]">學術長難句精準拆解</span>
                </div>

                <p class="font-serif text-[#ebdbb2] text-[15px] italic">
                  "{sec.svoSentence.sentence}"
                </p>

                <div class="grid grid-cols-1 gap-1.5 pt-1 text-xs">
                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#fe8019] font-bold shrink-0">{sec.svoSentence.subjectVerbObject.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.subjectVerbObject.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.subjectVerbObject.zh}</span>
                    </div>
                  </div>

                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#fabd2f] font-bold shrink-0">{sec.svoSentence.modifier.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.modifier.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.modifier.zh}</span>
                    </div>
                  </div>

                  <div class="flex items-start gap-2 bg-[#1d2021] p-2 rounded">
                    <span class="font-mono text-[10px] text-[#8ec07c] font-bold shrink-0">{sec.svoSentence.purpose.title}</span>
                    <div class="flex flex-col">
                      <span class="text-[#ebdbb2] font-medium">{sec.svoSentence.purpose.en}</span>
                      <span class="text-[#a89984] text-[11px]">{sec.svoSentence.purpose.zh}</span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Formulas Sandbox (If present) -->
            {#if sec.formulas && sec.formulas.length > 0}
              {#each sec.formulas as formula}
                <div class="my-5 bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col items-center justify-center relative shadow-inner">
                  <span class="absolute right-4 top-3 font-mono text-xs text-[#a89984] select-none">{formula.number}</span>
                  
                  <span class="font-mono text-xs text-[#fabd2f] font-semibold mb-2 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[14px]">functions</span>
                    {formula.name}
                  </span>

                  <!-- Formula Display Rendered via KaTeX -->
                  <div class="w-full flex items-center justify-center py-3 overflow-x-auto text-[#ebdbb2]">
                    <div class="katex-display-container text-[20px] text-[#ebdbb2] px-2 select-none">
                      {@html renderMath(formula.latexText, true)}
                    </div>
                  </div>

                  <!-- Variables Hover Explanations with KaTeX Symbols -->
                  <div class="flex flex-wrap items-center justify-center gap-2 mt-3 pt-3 border-t border-[#3c3836] w-full">
                    {#each formula.variables as v}
                      <span class="font-mono text-xs bg-[#282828] border border-[#3c3836] hover:border-[#504945] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm transition-colors">
                        <span class="inline-flex items-center text-sm" style="color: {v.color}">
                          {@html renderMath(v.symbol, false)}
                        </span>
                        <span class="text-[#a89984]">:</span>
                        <span class="text-[#d5c4a1]">{v.meaning}</span>
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            {/if}

            <!-- Inline Semantic Floating Action Toolbar (Only on Active Focus) -->
            {#if isFocused}
              <div class="mt-2 flex flex-wrap items-center gap-2 bg-[#282828] border border-[#3c3836] p-1.5 rounded-lg shadow-sm">
                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#fabd2f] border border-[#fabd2f]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showIntuition')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">lightbulb</span>
                  <span>白話科學直覺</span>
                </button>

                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#8ec07c] border border-[#8ec07c]/30 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showSyntax')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
                  <span>句構拆解</span>
                </button>

                <button
                  class="flex items-center gap-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] border border-[#504945] px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  on:click|stopPropagation={() => triggerAction('showTerminology')}
                >
                  <span class="material-symbols-outlined text-[14px] text-[#fe8019]">menu_book</span>
                  <span>學術術語對齊</span>
                </button>

                <div class="h-4 w-px bg-[#504945] mx-0.5"></div>

                <button
                  class="flex items-center gap-1.5 hover:bg-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded text-xs transition-colors"
                  on:click|stopPropagation={() => triggerAction('addNote', sec.title)}
                >
                  <span class="material-symbols-outlined text-[14px]">push_pin</span>
                  <span>標註精讀筆記</span>
                </button>
              </div>
            {/if}

          </section>
        {/each}
      </div>
    {/if}

  </div>
</main>
