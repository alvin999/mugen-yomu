<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, FigureItem, FormulaItem } from '../../stores/documentStore';
  import { flattenSections } from '../../stores/readingStore';
  import katex from 'katex';

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher();

  $: allSections = flattenSections(paper?.sections || []);

  // 動態萃取當前文獻的所有圖表
  $: dynamicFigures = (() => {
    const list: { figure: FigureItem; sectionId?: string; sectionTitle?: string }[] = [];
    if (paper?.figureList && paper.figureList.length > 0) {
      for (const fig of paper.figureList) {
        const sec = allSections.find(s => s.figures?.some((f: FigureItem) => f.id === fig.id || f.imageUrl === fig.imageUrl));
        list.push({ figure: fig, sectionId: sec?.id, sectionTitle: sec?.title });
      }
      return list;
    }
    for (const sec of allSections) {
      if (sec.figures && sec.figures.length > 0) {
        for (const fig of sec.figures) {
          list.push({ figure: fig, sectionId: sec.id, sectionTitle: sec.title });
        }
      }
    }
    return list;
  })();

  // 動態萃取當前文獻的所有公式
  $: dynamicFormulas = (() => {
    const list: { formula: FormulaItem; sectionId?: string; sectionTitle?: string }[] = [];
    for (const sec of allSections) {
      if (sec.formulas && sec.formulas.length > 0) {
        for (const f of sec.formulas) {
          list.push({ formula: f, sectionId: sec.id, sectionTitle: sec.title });
        }
      }
    }
    return list;
  })();

  function normalizeAcademicImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim().replace(/^<|>$/g, '');
    if (url.includes('mdpi.com') && (url.includes('/images/') || url.includes('/html/') || /\.(?:png|jpe?g|webp|svg|gif)/i.test(url))) {
      url = url.replace(/https?:\/\/(?:www\.)?mdpi\.com\//i, 'https://pub.mdpi-res.com/');
    }
    return url;
  }

  let selectedFigureIndex: number = 0;
  let selectedFormulaIndex: number = 0;

  // Fallback demo tabs when no extracted items exist
  let activeFigureTab: 'fig1' | 'fig2' = 'fig1';
  let activeDerivationTab: 'derivation1' | 'derivation2' | 'derivation3' = 'derivation1';

  let lastPaperId: string = '';
  $: if (paper && paper.id !== lastPaperId) {
    lastPaperId = paper.id;
    selectedFigureIndex = 0;
    selectedFormulaIndex = 0;
  }

  function sanitizeLatex(latex: string): string {
    if (!latex) return '';
    return latex
      .replace(/_\{(\s*)\}/g, '')
      .replace(/\^\{(\s*)\}/g, '')
      .replace(/_\{(\s*)\}\^\{(\s*)\}/g, '')
      .replace(/\^\{(\s*)\}_\{(\s*)\}/g, '')
      .replace(/\^\{([^}]+)\}_\{(\s*)\}\^\{(\s*)\}/g, '^{$1}')
      .replace(/_\{([^}]+)\}\^\{(\s*)\}_\{(\s*)\}/g, '_{$1}')
      .replace(/\^\{([^}]+)\}\s*\^\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `^{${g1} ${g2}}` : `^{${g1}}`)
      .replace(/_\{([^}]+)\}\s*_\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `_{${g1} ${g2}}` : `_{${g1}}`)
      .replace(/\\left\{/g, '\\left\\{')
      .replace(/\\right\}/g, '\\right\\}');
  }

  function renderMath(latex: string, displayMode: boolean = false): string {
    if (!latex) return '';
    try {
      const cleanLatex = sanitizeLatex(latex);
      return katex.renderToString(cleanLatex, {
        displayMode,
        throwOnError: false
      });
    } catch (err) {
      return `<span class="text-[#fb4934] font-mono">${latex}</span>`;
    }
  }

  function handleJumpToSection(secId: string) {
    dispatch('selectSection', { id: secId });
  }
</script>

<div class="w-full h-full flex flex-col bg-[#282828] text-[#ebdbb2] overflow-hidden select-none">
  <!-- Top Bar of Comparative View -->
  <div class="h-10 bg-[#1d2021] border-b border-[#3c3836] px-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <span class="font-mono text-xs font-semibold text-[#fabd2f] flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px] text-[#fe8019]">schema</span>
        圖表與數學推導對照工作台 (Derivations & Figures Studio)
      </span>
      <span class="font-mono text-[10px] bg-[#32302f] text-[#a89984] px-1.5 py-0.5 rounded border border-[#504945]">
        左右同步交互檢驗
      </span>
    </div>

    <div class="font-mono text-[11px] text-[#a89984] truncate max-w-[400px]">
      {paper?.title || '文獻圖表與推導演算'}
    </div>
  </div>

  <!-- Dual-Column Studio Body -->
  <div class="flex-1 grid grid-cols-2 overflow-hidden divide-x divide-[#3c3836]">
    
    <!-- LEFT COLUMN: Figure Deck -->
    <div class="h-full flex flex-col bg-[#1d2021]/60 overflow-hidden">
      {#if dynamicFigures.length > 0}
        <!-- Dynamic Tabs for Document Figures -->
        <div class="p-2 border-b border-[#3c3836] flex items-center gap-1.5 bg-[#1d2021] overflow-x-auto">
          {#each dynamicFigures as item, idx}
            <button
              class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {selectedFigureIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
              on:click={() => selectedFigureIndex = idx}
            >
              <span class="material-symbols-outlined text-[13px]">image</span>
              <span>{item.figure.figureNumber || `圖表 ${idx + 1}`}</span>
            </button>
          {/each}
        </div>

        <!-- Dynamic Figure Canvas -->
        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {#if dynamicFigures[selectedFigureIndex]}
            {@const activeItem = dynamicFigures[selectedFigureIndex]}
            <figure class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md m-0">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[320px]">
                  {activeItem.figure.figureNumber ? `${activeItem.figure.figureNumber}: ` : ''}{activeItem.figure.name}
                </span>
                {#if activeItem.sectionId}
                  <button
                    class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                    on:click={() => handleJumpToSection(activeItem.sectionId || '')}
                  >
                    <span>跳轉至章節</span>
                    <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </button>
                {/if}
              </div>

              <!-- Image Display with Referrer Policy -->
              <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 flex items-center justify-center overflow-hidden">
                <img
                  src={normalizeAcademicImageUrl(activeItem.figure.imageUrl)}
                  alt={activeItem.figure.name}
                  referrerpolicy="no-referrer"
                  class="max-h-[360px] max-w-full object-contain rounded"
                  loading="lazy"
                />
              </div>

              {#if activeItem.figure.caption}
                <figcaption class="text-xs text-[#d5c4a1] font-serif leading-relaxed text-justify px-1">
                  {activeItem.figure.caption}
                </figcaption>
              {/if}
            </figure>
          {/if}
        </div>

      {:else}
        <!-- Fallback Default Demo Figures (Attention Paper SVG) -->
        <div class="p-2 border-b border-[#3c3836] flex items-center gap-2 bg-[#1d2021]">
          <button
            class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => activeFigureTab = 'fig1'}
          >
            <span class="material-symbols-outlined text-[14px]">account_tree</span>
            <span>Fig 1: 核心拓撲架構</span>
          </button>
          <button
            class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => activeFigureTab = 'fig2'}
          >
            <span class="material-symbols-outlined text-[14px]">device_hub</span>
            <span>Fig 2: 點積注意力機制</span>
          </button>
        </div>

        <!-- Figure Interactive Canvas -->
        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {#if activeFigureTab === 'fig1'}
            <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-[#fabd2f] font-bold">Figure 1: The Triad Cognitive Workspace</span>
                <button
                  class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5"
                  on:click={() => handleJumpToSection('2')}
                >
                  <span>跳轉至 § 2 說明</span>
                  <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                </button>
              </div>

              <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
                <svg class="w-full max-h-[300px]" viewBox="0 0 460 260">
                  <rect x="20" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#fe8019" stroke-width="1.5" />
                  <text x="75" y="55" fill="#fe8019" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">1. READING MAP</text>
                  <line x1="30" y1="65" x2="120" y2="65" stroke="#3c3836" stroke-width="1" />
                  <rect x="30" y="75" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="88" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">動態目錄索引樹</text>
                  <rect x="30" y="100" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="113" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">精讀覆蓋率指示條</text>
                  <rect x="30" y="125" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="138" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">圖表與公式快覽卡</text>

                  <path d="M 130 130 L 165 130" stroke="#fabd2f" stroke-width="2" stroke-dasharray="4,2" marker-end="url(#arrow)" />

                  <rect x="175" y="20" width="120" height="220" rx="8" fill="#1d2021" stroke="#fabd2f" stroke-width="1.5" />
                  <text x="235" y="45" fill="#fabd2f" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">2. BILINGUAL CANVAS</text>
                  <line x1="185" y1="55" x2="285" y2="55" stroke="#3c3836" stroke-width="1" />
                  <rect x="185" y="65" width="100" height="24" rx="4" fill="#32302f" stroke="#fe8019" stroke-width="1.5" />
                  <text x="235" y="80" fill="#fe8019" font-family="Geist" font-size="9" font-weight="bold" text-anchor="middle">Focus Lens 聚焦透鏡</text>
                  <rect x="185" y="98" width="100" height="20" rx="4" fill="#282828" stroke="#504945" />
                  <text x="235" y="111" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">SVO 長難句彩色拆解</text>
                  <rect x="185" y="124" width="100" height="20" rx="4" fill="#282828" stroke="#504945" />
                  <text x="235" y="137" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">逐段打字機精讀翻譯</text>

                  <path d="M 295 130 L 325 130" stroke="#8ec07c" stroke-width="2" stroke-dasharray="4,2" />

                  <rect x="335" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#8ec07c" stroke-width="1.5" />
                  <text x="390" y="55" fill="#8ec07c" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">3. AI COMPANION</text>
                  <line x1="345" y1="65" x2="435" y2="65" stroke="#3c3836" stroke-width="1" />
                  <rect x="345" y="75" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="88" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">白話科學直覺 (Intuition)</text>
                  <rect x="345" y="100" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="113" fill="#83a598" font-family="Geist" font-size="9" text-anchor="middle">學術語法依存樹</text>
                  <rect x="345" y="125" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="138" fill="#d3869b" font-family="Geist" font-size="9" text-anchor="middle">蘇格拉底深度詰問</text>
                </svg>
              </div>

              <p class="font-serif text-xs text-[#d5c4a1] leading-relaxed">
                MUGEN YOMU 核心三欄同步架構：動態目錄導航（左）、雙語伴讀畫布與焦點透鏡（中）、以及四層認知伴讀助理（右）。
              </p>
            </div>
          {:else}
            <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-[#fabd2f] font-bold">Figure 2: Scaled Dot-Product Attention Circuit</span>
                <button
                  class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5"
                  on:click={() => handleJumpToSection('3.2.1')}
                >
                  <span>跳轉至 § 3.2.1</span>
                  <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                </button>
              </div>

              <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
                <svg class="w-full max-h-[300px]" viewBox="0 0 320 220">
                  <rect x="50" y="180" width="40" height="24" rx="4" fill="#fe8019" />
                  <text x="70" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">Q</text>
                  <rect x="130" y="180" width="40" height="24" rx="4" fill="#fabd2f" />
                  <text x="150" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">K</text>
                  <rect x="230" y="180" width="40" height="24" rx="4" fill="#8ec07c" />
                  <text x="250" y="196" fill="#1d2021" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">V</text>

                  <rect x="70" y="125" width="100" height="28" rx="6" fill="#282828" stroke="#fe8019" stroke-width="1.5" />
                  <text x="120" y="143" fill="#ebdbb2" font-family="Geist" font-size="11" font-weight="bold" text-anchor="middle">MatMul (Q · K^T)</text>
                  <line x1="70" y1="180" x2="100" y2="153" stroke="#fe8019" stroke-width="1.5" />
                  <line x1="150" y1="180" x2="120" y2="153" stroke="#fabd2f" stroke-width="1.5" />

                  <rect x="70" y="80" width="80" height="26" rx="6" fill="#32302f" stroke="#fabd2f" stroke-width="1.5" />
                  <text x="110" y="97" fill="#fabd2f" font-family="JetBrains Mono" font-size="10" text-anchor="middle">Scale (÷ √d_k)</text>
                  <line x1="110" y1="125" x2="110" y2="106" stroke="#ebdbb2" stroke-width="1.5" />

                  <rect x="70" y="35" width="80" height="26" rx="6" fill="#3c3836" stroke="#b8bb26" stroke-width="1.5" />
                  <text x="110" y="52" fill="#b8bb26" font-family="Geist" font-size="10" font-weight="bold" text-anchor="middle">Softmax</text>
                  <line x1="110" y1="80" x2="110" y2="61" stroke="#ebdbb2" stroke-width="1.5" />

                  <rect x="180" y="35" width="100" height="30" rx="6" fill="#282828" stroke="#83a598" stroke-width="1.5" />
                  <text x="230" y="54" fill="#83a598" font-family="Geist" font-size="11" font-weight="bold" text-anchor="middle">MatMul with V</text>
                  <line x1="150" y1="48" x2="180" y2="48" stroke="#b8bb26" stroke-width="1.5" />
                  <line x1="250" y1="180" x2="250" y2="65" stroke="#8ec07c" stroke-width="1.5" />
                </svg>
              </div>

              <p class="font-serif text-xs text-[#d5c4a1] leading-relaxed">
                透過點積矩陣將 Query 與 Key 進行相關度映射，關鍵在於 Scale 步驟除以 √d_k 壓抑過大數值，確保 Softmax 梯度維持穩定數值區間。
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- RIGHT COLUMN: Mathematical Derivations Sandbox -->
    <div class="h-full flex flex-col bg-[#282828] overflow-hidden">
      {#if dynamicFormulas.length > 0}
        <!-- Dynamic Tabs for Document Formulas -->
        <div class="p-2 border-b border-[#3c3836] flex items-center gap-1.5 bg-[#1d2021] overflow-x-auto">
          {#each dynamicFormulas as item, idx}
            <button
              class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {selectedFormulaIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
              on:click={() => selectedFormulaIndex = idx}
            >
              <span class="material-symbols-outlined text-[13px]">functions</span>
              <span>{item.formula.number || `Eq (${idx + 1})`}</span>
            </button>
          {/each}
        </div>

        <!-- Dynamic Derivation Math Content -->
        <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {#if dynamicFormulas[selectedFormulaIndex]}
            {@const activeItem = dynamicFormulas[selectedFormulaIndex]}
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[320px]">
                  {activeItem.formula.name || `核心公式 ${activeItem.formula.number || ''}`}
                </span>
                {#if activeItem.sectionId}
                  <button
                    class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                    on:click={() => handleJumpToSection(activeItem.sectionId || '')}
                  >
                    <span>跳轉至 § {activeItem.sectionTitle || activeItem.sectionId}</span>
                    <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </button>
                {/if}
              </div>

              <!-- Main Formula via KaTeX -->
              <div class="py-4 flex justify-center text-[21px] text-[#ebdbb2] border-y border-[#3c3836] overflow-x-auto">
                {@html renderMath(activeItem.formula.latexText, true)}
              </div>

              {#if activeItem.formula.variables && activeItem.formula.variables.length > 0}
                <div class="flex flex-col gap-2 text-xs">
                  <h4 class="font-mono text-[#fe8019] font-bold">關鍵變數符號意涵</h4>
                  <div class="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                    {#each activeItem.formula.variables as v}
                      <div class="bg-[#282828] p-2 rounded flex items-center justify-between">
                        <span style="color: {v.color}">{@html renderMath(v.symbol, false)}</span>
                        <span class="text-[#d5c4a1]">{v.meaning}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>

      {:else}
        <!-- Fallback Default Demo Derivations -->
        <div class="p-2 border-b border-[#3c3836] flex items-center gap-2 bg-[#1d2021]">
          <button
            class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeDerivationTab === 'derivation1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => activeDerivationTab = 'derivation1'}
          >
            <span class="material-symbols-outlined text-[14px]">functions</span>
            <span>Eq (1): 縮放點積注意力</span>
          </button>

          <button
            class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeDerivationTab === 'derivation2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => activeDerivationTab = 'derivation2'}
          >
            <span class="material-symbols-outlined text-[14px]">calculate</span>
            <span>Eq (2): 多頭子空間投影</span>
          </button>

          <button
            class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeDerivationTab === 'derivation3' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
            on:click={() => activeDerivationTab = 'derivation3'}
          >
            <span class="material-symbols-outlined text-[14px]">speed</span>
            <span>說明書: 認知效能模型</span>
          </button>
        </div>

        <!-- Derivation Math Content -->
        <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {#if activeDerivationTab === 'derivation1'}
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (1): Scaled Dot-Product Attention</span>
                <span class="font-mono text-[11px] text-[#a89984]">NeurIPS 2017 Oral</span>
              </div>

              <div class="py-3 flex justify-center text-[22px] text-[#ebdbb2] border-y border-[#3c3836]">
                {@html renderMath('\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V', true)}
              </div>

              <div class="flex flex-col gap-2 text-xs">
                <h4 class="font-mono text-[#fe8019] font-bold">數學證明：為什麼點積必須除以 √d_k？</h4>
                <p class="text-[#d5c4a1] leading-relaxed text-justify">
                  假設向量 q 與 k 的各維度分量皆為獨立隨機變數，且具有零均值（E = 0）與單位方差（Var = 1）：
                </p>
                <div class="p-2.5 bg-[#282828] rounded border border-[#3c3836] font-mono text-[13px] flex justify-center">
                  {@html renderMath('q \\cdot k = \\sum_{i=1}^{d_k} q_i k_i \\implies \\text{Var}(q \\cdot k) = d_k, \\quad \\sigma = \\sqrt{d_k}', true)}
                </div>
                <p class="text-[#d5c4a1] leading-relaxed text-justify">
                  當維度 d_k 極大時，點積的數值幅值將增長至數十倍，迫使 Softmax 進入極端飽和區，其梯度趨近於 0 將導致嚴重的梯度消失。因此除以 √d_k 完成<strong>方差歸一化</strong>。
                </p>
              </div>
            </div>
          {:else if activeDerivationTab === 'derivation2'}
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (2): Multi-Head Attention Subspaces</span>
                <span class="font-mono text-[11px] text-[#a89984]">8 並行頭 (h=8)</span>
              </div>

              <div class="py-3 flex justify-center text-[20px] text-[#ebdbb2] border-y border-[#3c3836]">
                {@html renderMath('\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h) W^O', true)}
              </div>

              <div class="flex flex-col gap-2 text-xs">
                <h4 class="font-mono text-[#8ec07c] font-bold">正交子空間理論分析</h4>
                <p class="text-[#d5c4a1] leading-relaxed text-justify">
                  單一注意力頭會強制將不同類型的語義關係平均化。透過 h 個獨立投影矩陣，模型得以在不同的空間子維度並行捕捉多元特徵。
                </p>
              </div>
            </div>
          {:else}
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (3): 認知閱讀效能模型</span>
                <span class="font-mono text-[11px] text-[#b8bb26]">MUGEN YOMU 核心演算法</span>
              </div>

              <div class="py-3 flex justify-center text-[20px] text-[#ebdbb2] border-y border-[#3c3836]">
                {@html renderMath('\\eta_{\\text{reading}} = \\frac{\\mathcal{C}_{\\text{comprehension}} \\cdot (1 + \\gamma_{\\text{intuition}})}{\\ln(\\tau_{\\text{reading}} + 1) \\cdot \\sqrt{\\Omega_{\\text{svo}}}}', true)}
              </div>

              <div class="flex flex-col gap-2 text-xs">
                <h4 class="font-mono text-[#fabd2f] font-bold">變數參數拓撲解析</h4>
                <div class="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                  <div class="bg-[#282828] p-2 rounded flex items-center justify-between">
                    <span class="text-[#fe8019]">{@html renderMath('\\mathcal{C}_{\\text{comprehension}}', false)}</span>
                    <span class="text-[#d5c4a1]">論文核心論點之整體理解掌握度 (0 ~ 1.0)</span>
                  </div>
                  <div class="bg-[#282828] p-2 rounded flex items-center justify-between">
                    <span class="text-[#fabd2f]">{@html renderMath('\\gamma_{\\text{intuition}}', false)}</span>
                    <span class="text-[#d5c4a1]">科研物理直覺增益權重 (通常介於 0.3 ~ 0.8)</span>
                  </div>
                  <div class="bg-[#282828] p-2 rounded flex items-center justify-between">
                    <span class="text-[#8ec07c]">{@html renderMath('\\sqrt{\\Omega_{\\text{svo}}}', false)}</span>
                    <span class="text-[#d5c4a1]">長難句複雜度阻尼係數 (經 SVO 拆解後顯著降低)</span>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

  </div>
</div>
