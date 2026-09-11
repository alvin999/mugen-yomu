<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument } from '../../stores/documentStore';
  import katex from 'katex';

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher();

  let activeFigureTab: 'fig1' | 'fig2' = 'fig1';
  let activeDerivationTab: 'derivation1' | 'derivation2' | 'derivation3' = 'derivation1';

  function renderMath(latex: string, displayMode: boolean = false): string {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
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

    <div class="font-mono text-[11px] text-[#a89984]">
      {paper?.title || '文獻圖表與推導演算'}
    </div>
  </div>

  <!-- Dual-Column Studio Body -->
  <div class="flex-1 grid grid-cols-2 overflow-hidden divide-x divide-[#3c3836]">
    
    <!-- LEFT COLUMN: Figure Deck -->
    <div class="h-full flex flex-col bg-[#1d2021]/60 overflow-hidden">
      <!-- Tabs -->
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

            <!-- High Definition Interactive SVG Diagram -->
            <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
              <svg class="w-full max-h-[300px]" viewBox="0 0 460 260">
                <!-- Column 1: Reading Map -->
                <rect x="20" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#fe8019" stroke-width="1.5" />
                <text x="75" y="55" fill="#fe8019" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">1. READING MAP</text>
                <line x1="30" y1="65" x2="120" y2="65" stroke="#3c3836" stroke-width="1" />
                <rect x="30" y="75" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="75" y="88" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">動態目錄索引樹</text>
                <rect x="30" y="100" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="75" y="113" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">精讀覆蓋率指示條</text>
                <rect x="30" y="125" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="75" y="138" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">圖表與公式快覽卡</text>

                <!-- Flow arrow 1 -->
                <path d="M 130 130 L 155 130" stroke="#fabd2f" stroke-width="2" marker-end="url(#arrow)" />

                <!-- Column 2: Scholarly Canvas -->
                <rect x="160" y="20" width="140" height="220" rx="8" fill="#282828" stroke="#fabd2f" stroke-width="2" />
                <text x="230" y="45" fill="#fabd2f" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">2. SCHOLAR CANVAS</text>
                <line x1="170" y1="55" x2="290" y2="55" stroke="#504945" stroke-width="1" />
                
                <rect x="170" y="65" width="120" height="42" rx="4" fill="#32302f" stroke="#fe8019" stroke-width="1.5" />
                <text x="230" y="82" fill="#fe8019" font-family="Geist" font-size="10" font-weight="bold" text-anchor="middle">★ Focus Lens 透鏡</text>
                <text x="230" y="98" fill="#ebdbb2" font-family="Source Serif 4" font-size="9" text-anchor="middle">長難句 SVO 結構標註</text>

                <rect x="170" y="115" width="120" height="42" rx="4" fill="#1d2021" stroke="#83a598" />
                <text x="230" y="132" fill="#83a598" font-family="JetBrains Mono" font-size="10" text-anchor="middle">KaTeX 互動公式沙盒</text>
                <text x="230" y="148" fill="#a89984" font-family="Geist" font-size="9" text-anchor="middle">變數語義色彩映射</text>

                <rect x="170" y="165" width="120" height="30" rx="4" fill="#32302f" stroke="#504945" />
                <text x="230" y="184" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">白話科學摘要卡片</text>

                <!-- Flow arrow 2 -->
                <path d="M 300 130 L 325 130" stroke="#b8bb26" stroke-width="2" />

                <!-- Column 3: AI Companion -->
                <rect x="330" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#b8bb26" stroke-width="1.5" />
                <text x="385" y="55" fill="#b8bb26" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">3. AI COMPANION</text>
                <line x1="340" y1="65" x2="430" y2="65" stroke="#3c3836" stroke-width="1" />
                <rect x="340" y="75" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="385" y="88" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">① 白話科研直覺</text>
                <rect x="340" y="100" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="385" y="113" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">② 長難句語法樹</text>
                <rect x="340" y="125" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="385" y="138" fill="#83a598" font-family="Geist" font-size="9" text-anchor="middle">③ 術語精準對齊</text>
                <rect x="340" y="150" width="90" height="18" rx="4" fill="#282828" stroke="#504945" />
                <text x="385" y="163" fill="#d3869b" font-family="Geist" font-size="9" text-anchor="middle">④ 蘇格拉底追問</text>
              </svg>
            </div>

            <p class="font-serif text-xs text-[#d5c4a1] leading-relaxed">
              三欄協同設計將學術閱讀拆解為「地圖導航（閱讀狀態與覆蓋）」、「高解析原文主體（聚焦透鏡）」與「即時認知助理（四層解構）」，完全消弭長篇論文的認知過載。
            </p>
          </div>
        {:else}
          <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs text-[#fabd2f] font-bold">Figure 2: Scaled Dot-Product & Multi-Head Topology</span>
              <button
                class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5"
                on:click={() => handleJumpToSection('3.2')}
              >
                <span>跳轉至 § 3.2 說明</span>
                <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            </div>

            <!-- Scaled Dot-Product Attention SVG -->
            <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
              <svg class="w-full max-h-[300px]" viewBox="0 0 380 240">
                <rect x="40" y="180" width="60" height="30" rx="6" fill="#fe8019" />
                <text x="70" y="200" fill="#1d2021" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">Q</text>

                <rect x="120" y="180" width="60" height="30" rx="6" fill="#fabd2f" />
                <text x="150" y="200" fill="#1d2021" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">K</text>

                <rect x="220" y="180" width="60" height="30" rx="6" fill="#8ec07c" />
                <text x="250" y="200" fill="#1d2021" font-family="JetBrains Mono" font-size="12" font-weight="bold" text-anchor="middle">V</text>

                <!-- MatMul 1 -->
                <rect x="70" y="125" width="80" height="28" rx="6" fill="#282828" stroke="#fe8019" stroke-width="1.5" />
                <text x="110" y="143" fill="#ebdbb2" font-family="Geist" font-size="11" text-anchor="middle">MatMul (Q · K^T)</text>

                <line x1="70" y1="180" x2="100" y2="153" stroke="#fe8019" stroke-width="1.5" />
                <line x1="150" y1="180" x2="120" y2="153" stroke="#fabd2f" stroke-width="1.5" />

                <!-- Scale -->
                <rect x="70" y="80" width="80" height="26" rx="6" fill="#32302f" stroke="#fabd2f" stroke-width="1.5" />
                <text x="110" y="97" fill="#fabd2f" font-family="JetBrains Mono" font-size="10" text-anchor="middle">Scale (÷ √d_k)</text>
                <line x1="110" y1="125" x2="110" y2="106" stroke="#ebdbb2" stroke-width="1.5" />

                <!-- Softmax -->
                <rect x="70" y="35" width="80" height="26" rx="6" fill="#3c3836" stroke="#b8bb26" stroke-width="1.5" />
                <text x="110" y="52" fill="#b8bb26" font-family="Geist" font-size="10" font-weight="bold" text-anchor="middle">Softmax</text>
                <line x1="110" y1="80" x2="110" y2="61" stroke="#ebdbb2" stroke-width="1.5" />

                <!-- MatMul 2 -->
                <rect x="180" y="35" width="100" height="30" rx="6" fill="#282828" stroke="#83a598" stroke-width="1.5" />
                <text x="230" y="54" fill="#83a598" font-family="Geist" font-size="11" font-weight="bold" text-anchor="middle">MatMul with V</text>
                <line x1="150" y1="48" x2="180" y2="48" stroke="#b8bb26" stroke-width="1.5" />
                <line x1="250" y1="180" x2="250" y2="65" stroke="#8ec07c" stroke-width="1.5" />
              </svg>
            </div>

            <p class="font-serif text-xs text-[#d5c4a1] leading-relaxed">
              透過點積矩陣將 Query 與 Key 進行相關度映射，關鍵在於 Scale 步驟除以 √d_k 壓抑過大數值，確保 Softmax 梯度在正反向傳播期間維持健康數值區間。
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT COLUMN: Mathematical Derivations Sandbox -->
    <div class="h-full flex flex-col bg-[#282828] overflow-hidden">
      <!-- Tabs -->
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
          <!-- Derivation 1 -->
          <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (1): Scaled Dot-Product Attention</span>
              <span class="font-mono text-[11px] text-[#a89984]">NeurIPS 2017 Oral</span>
            </div>

            <!-- Main Formula -->
            <div class="py-3 flex justify-center text-[22px] text-[#ebdbb2] border-y border-[#3c3836]">
              {@html renderMath('\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V', true)}
            </div>

            <!-- Step-by-Step Proof / Rigor -->
            <div class="flex flex-col gap-2 text-xs">
              <h4 class="font-mono text-[#fe8019] font-bold">數學證明：為什麼點積必須除以 √d_k？</h4>
              <p class="text-[#d5c4a1] leading-relaxed text-justify">
                假設向量 q 與 k 的各維度分量皆為獨立隨機變數，且具有零均值（E = 0）與單位方差（Var = 1）：
              </p>
              <div class="p-2.5 bg-[#282828] rounded border border-[#3c3836] font-mono text-[13px] flex justify-center">
                {@html renderMath('q \\cdot k = \\sum_{i=1}^{d_k} q_i k_i \\implies \\text{Var}(q \\cdot k) = d_k, \\quad \\sigma = \\sqrt{d_k}', true)}
              </div>
              <p class="text-[#d5c4a1] leading-relaxed text-justify">
                當維度 d_k 極大時（例如 64 或 128），點積的數值幅值將增長至數十倍，迫使 Softmax 進入極端飽和區，其梯度趨近於 0 將導致嚴重的梯度消失。因此，除以 √d_k 恰好完成<strong>方差歸一化</strong>（Variance Normalization），使分母回歸 Var = 1。
              </p>
            </div>
          </div>
        {:else if activeDerivationTab === 'derivation2'}
          <!-- Derivation 2 -->
          <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (2): Multi-Head Attention Subspaces</span>
              <span class="font-mono text-[11px] text-[#a89984]">8 並行頭 (h=8)</span>
            </div>

            <!-- Formula -->
            <div class="py-3 flex justify-center text-[20px] text-[#ebdbb2] border-y border-[#3c3836]">
              {@html renderMath('\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h) W^O', true)}
            </div>

            <div class="flex flex-col gap-2 text-xs">
              <h4 class="font-mono text-[#8ec07c] font-bold">正交子空間理論分析</h4>
              <p class="text-[#d5c4a1] leading-relaxed text-justify">
                單一注意力頭會強制將不同類型的語義關係平均化（Averaging Effect）。透過 h 個獨立投影矩陣，模型得以在不同的空間子維度（如句法依賴、指代消解、邏輯順序）並行捕捉多元特徵。
              </p>
            </div>
          </div>
        {:else}
          <!-- Derivation 3: Manual Efficiency Model -->
          <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs text-[#fabd2f] font-bold">公式推導 (3): 認知閱讀效能模型</span>
              <span class="font-mono text-[11px] text-[#b8bb26]">MUGEN YOMU 核心演算法</span>
            </div>

            <!-- Formula -->
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
    </div>

  </div>
</div>
