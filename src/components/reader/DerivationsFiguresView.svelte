<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PaperDocument, FigureItem, FormulaItem } from '../../types/document';
  import { flattenSections } from '../../stores/readingStore';
  import {
    CLASSIC_FORMULA_DERIVATIONS,
    CLASSIC_FIGURE_DECONSTRUCTIONS,
    fetchFormulaDerivation,
    fetchFigureDeconstruction,
    calculateNumericalSanity,
    calculateTransformerShapes,
    verifyScratchpadDerivation,
    scanAndExtractDocumentDerivationsHeuristically,
    getDomainAdaptedFigurePipeline,
    type FormulaDerivationData,
    type FigureDeconstructionData
  } from '../../services/derivationService';
  import {
    extractDynamicFigures,
    extractDynamicFormulas
  } from '../../utils/derivationExtractor';
  import ImageLightboxModal from '../common/ImageLightboxModal.svelte';
  import FigureDeconstructionPanel from './derivations/FigureDeconstructionPanel.svelte';
  import FormulaDerivationPanel from './derivations/FormulaDerivationPanel.svelte';
  import DerivationScratchpadPanel from './derivations/DerivationScratchpadPanel.svelte';

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher();

  $: allSections = flattenSections(paper?.sections || []);

  // 動態萃取當前文獻的所有圖表與公式 (使用獨立的 extractor 工具層)
  $: dynamicFigures = extractDynamicFigures(paper, allSections);
  $: dynamicFormulas = extractDynamicFormulas(paper, allSections);

  // 狀態變數
  let selectedFigureIndex: number = 0;
  let selectedFormulaIndex: number = 0;

  // Fallback demo tabs when no extracted items exist
  let activeFigureTab: 'fig1' | 'fig2' = 'fig1';
  let activeDerivationTab: 'derivation1' | 'derivation2' | 'derivation3' = 'derivation1';

  // 右欄檢視模式：論文核心推導 vs 互動推導沙盒
  let studioRightMode: 'derivation' | 'scratchpad' = 'derivation';

  // 全螢幕燈箱狀態
  let isFigureLightboxOpen: boolean = false;
  let lightboxImageUrl: string = '';
  let lightboxTitle: string = '';

  // 圖表架構解構狀態
  let currentFigureDeconstruction: FigureDeconstructionData | null = null;
  let isAnalyzingFigure: boolean = false;
  let figureAnalysisError: string = '';

  // 數學公式推導狀態
  let currentFormulaDerivation: FormulaDerivationData | null = null;
  let isDerivingFormula: boolean = false;
  let formulaDerivationError: string = '';

  // 互動演算沙盒狀態 (CHECKLIST Item 8)
  let scratchpadLatex: string = '\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V';
  let scratchpadNotes: string = '驗證將維度 d_k 縮放除數代入後，能否將方差從 d_k 壓回單位 1';
  let scratchpadDk: number = 64;
  let scratchpadDotProduct: number = 16;
  let batchSize: number = 2;
  let seqLen: number = 512;
  let dModel: number = 512;
  let numHeads: number = 8;
  let isVerifyingScratchpad: boolean = false;
  let scratchpadAiResult: {
    isValid: boolean;
    verdictTitle: string;
    critique: string;
    stepSuggestions: string[];
    correctedLatex?: string;
  } | null = null;

  // 提示回饋氣泡
  let copyToastText: string = '';
  let noteToastText: string = '';
  let toastTimer: any = null;

  function showToast(text: string, isNote: boolean = false) {
    if (toastTimer) clearTimeout(toastTimer);
    if (isNote) {
      noteToastText = text;
      copyToastText = '';
    } else {
      copyToastText = text;
      noteToastText = '';
    }
    toastTimer = setTimeout(() => {
      copyToastText = '';
      noteToastText = '';
    }, 2800);
  }

  // 程式初篩 + 輕量 AI 提煉狀態 (免費方案友善)
  let isScanningHeuristically: boolean = false;
  let scanError: string = '';

  async function handleHeuristicScan() {
    if (!paper) return;
    isScanningHeuristically = true;
    scanError = '';
    try {
      const p = (typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') : null) || 'groq';
      const k = (typeof window !== 'undefined' ? localStorage.getItem(`mugen_api_key_${p}`) : null) || '';
      const m = (typeof window !== 'undefined' ? localStorage.getItem('mugen_model') : null) || 'llama-3.3-70b-versatile';
      const o = (typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') : null) || 'http://localhost:11434';

      const result = await scanAndExtractDocumentDerivationsHeuristically(paper, p, k, m, o);

      // 更新文獻的 figureList (依據 id 去重)
      if (result.extractedFigures.length > 0) {
        const existingFigIds = new Set((paper.figureList || []).map(f => f.id));
        const newFigs = result.extractedFigures.filter(f => !existingFigIds.has(f.id));
        if (newFigs.length > 0) {
          paper.figureList = [...(paper.figureList || []), ...newFigs];
        }
      }

      // 更新文獻的 formulas (依據 latexText 去重，並精確分發給所屬章節)
      if (result.extractedFormulas.length > 0 && paper.sections && paper.sections.length > 0) {
        const flatSecs = flattenSections(paper.sections);
        for (const extFormula of result.extractedFormulas) {
          const targetSec = (extFormula.sectionId && flatSecs.find(s => s.id === extFormula.sectionId)) ||
                            (extFormula.sectionTitle && flatSecs.find(s => extFormula.sectionTitle?.includes(s.title) || s.title.includes(extFormula.sectionTitle || ''))) ||
                            paper.sections[0];
          
          if (!targetSec.formulas) targetSec.formulas = [];
          const normLatex = extFormula.latexText.trim().replace(/\s+/g, '');
          const alreadyExists = targetSec.formulas.some((f: any) => f.latexText.trim().replace(/\s+/g, '') === normLatex);
          if (!alreadyExists) {
            targetSec.formulas = [...targetSec.formulas, extFormula];
          }
        }
      }

      // 更新本地推導快取
      Object.assign(CLASSIC_FORMULA_DERIVATIONS, result.formulaDerivations);
      Object.assign(CLASSIC_FIGURE_DECONSTRUCTIONS, result.figureDeconstructions);

      paper = { ...paper };
      dispatch('updatePaper', { paper });
      showToast('✨ 程式初篩 + 輕量 AI 提煉完成！已為本篇建立專屬圖表推導');
    } catch (err: any) {
      scanError = err.message || '分析失敗';
      showToast('❌ 提煉失敗：' + (err.message || '未知錯誤'));
    } finally {
      isScanningHeuristically = false;
    }
  }

  // 響應當前選取之圖表更新解構資訊
  $: {
    const activeFig = dynamicFigures[selectedFigureIndex]?.figure;
    if (activeFig) {
      loadFigureDeconstruction(activeFig);
    } else {
      currentFigureDeconstruction = CLASSIC_FIGURE_DECONSTRUCTIONS[activeFigureTab] || CLASSIC_FIGURE_DECONSTRUCTIONS.fig1;
    }
  }

  // 響應當前選取之公式更新推導資訊
  $: {
    const activeForm = dynamicFormulas[selectedFormulaIndex]?.formula;
    if (activeForm) {
      loadFormulaDerivation(activeForm);
    } else {
      if (activeDerivationTab === 'derivation1') {
        currentFormulaDerivation = CLASSIC_FORMULA_DERIVATIONS.eq1;
      } else if (activeDerivationTab === 'derivation2') {
        currentFormulaDerivation = CLASSIC_FORMULA_DERIVATIONS.eq2;
      } else {
        currentFormulaDerivation = CLASSIC_FORMULA_DERIVATIONS.eq_efficiency;
      }
    }
  }

  // 響應沙盒數值即時計算
  $: sanityResult = calculateNumericalSanity(scratchpadDk, scratchpadDotProduct);
  $: tensorShapeResults = calculateTransformerShapes(batchSize, seqLen, dModel, numHeads);

  let lastPaperId: string = '';
  $: if (paper && paper.id !== lastPaperId) {
    lastPaperId = paper.id;
    selectedFigureIndex = 0;
    selectedFormulaIndex = 0;
  }

  async function loadFigureDeconstruction(fig: FigureItem, forceAi: boolean = false) {
    figureAnalysisError = '';
    if (!forceAi && CLASSIC_FIGURE_DECONSTRUCTIONS[fig.id]) {
      currentFigureDeconstruction = CLASSIC_FIGURE_DECONSTRUCTIONS[fig.id];
      return;
    }

    if (forceAi) {
      isAnalyzingFigure = true;
      try {
        const p = (typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') : null) || 'groq';
        const k = (typeof window !== 'undefined' ? localStorage.getItem(`mugen_api_key_${p}`) : null) || '';
        const m = (typeof window !== 'undefined' ? localStorage.getItem('mugen_model') : null) || 'llama-3.3-70b-versatile';
        const o = (typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') : null) || 'http://localhost:11434';

        const res = await fetchFigureDeconstruction(fig, paper, p, k, m, o);
        currentFigureDeconstruction = res;
        showToast('✨ AI 圖表深層解構完成！已儲存至本機快取');
      } catch (err: any) {
        figureAnalysisError = err.message || 'AI 分析失敗';
      } finally {
        isAnalyzingFigure = false;
      }
    } else {
      const adapted = getDomainAdaptedFigurePipeline(paper?.title || '', fig.name);
      let rawData: FigureDeconstructionData | null = CLASSIC_FIGURE_DECONSTRUCTIONS[fig.id] || null;

      const isML = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '');
      if (rawData && !isML) {
        const hasTensor = rawData.dataFlowSteps?.some(s => s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵'));
        if (hasTensor) {
          rawData = null;
        }
      }

      currentFigureDeconstruction = rawData || {
        figureId: fig.id,
        figureNumber: fig.figureNumber || 'Figure',
        name: fig.name,
        conceptOverview: fig.caption || adapted.conceptOverview,
        dataFlowSteps: adapted.dataFlowSteps,
        designDecisions: adapted.designDecisions,
        keyTakeaway: adapted.keyTakeaway
      };
    }
  }

  async function loadFormulaDerivation(formula: FormulaItem, forceAi: boolean = false) {
    formulaDerivationError = '';
    if (!forceAi && CLASSIC_FORMULA_DERIVATIONS[formula.id]) {
      currentFormulaDerivation = CLASSIC_FORMULA_DERIVATIONS[formula.id];
      return;
    }

    if (forceAi) {
      isDerivingFormula = true;
      try {
        const p = (typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') : null) || 'groq';
        const k = (typeof window !== 'undefined' ? localStorage.getItem(`mugen_api_key_${p}`) : null) || '';
        const m = (typeof window !== 'undefined' ? localStorage.getItem('mugen_model') : null) || 'llama-3.3-70b-versatile';
        const o = (typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') : null) || 'http://localhost:11434';

        const res = await fetchFormulaDerivation(formula, paper, p, k, m, o);
        currentFormulaDerivation = res;
        showToast('✨ AI 步驟推導完成！已儲存至本機快取');
      } catch (err: any) {
        formulaDerivationError = err.message || 'AI 推導演算失敗';
      } finally {
        isDerivingFormula = false;
      }
    } else {
      currentFormulaDerivation = CLASSIC_FORMULA_DERIVATIONS[formula.id] || {
        formulaId: formula.id,
        formulaNumber: formula.number,
        formulaName: formula.name,
        latexText: formula.latexText,
        sourceSectionId: formula.sectionId,
        sourceSectionTitle: formula.sectionTitle,
        sourcePage: formula.page,
        sourceContextSnippet: formula.sourceContextSnippet,
        assumptions: [
          '假設系統物理量與狀態變數在實驗邊界範圍內具備局部連續性與可微性。',
          '滿足質量/能量守恆定律或數值積分/迭代之收斂性條件。'
        ],
        steps: [
          {
            stepNumber: 1,
            title: '控制方程與核心算式形式化',
            latexFormula: formula.latexText,
            explanation: '依據論文理論架構，將系統關鍵狀態量與連續動態過程以精確的微分/積分或函數映射刻畫。',
            intuition: '確立系統核心控制變因與輸出指標之間的動態關聯。'
          },
          {
            stepNumber: 2,
            title: '邊界條件帶入與微分解算',
            latexFormula: formula.latexText,
            explanation: '將各分段初始條件與實驗常數代入微分/積分算式，推導連續狀態演進軌跡。',
            intuition: '在實驗設定邊界下精確預測物理量之連續累積效應。'
          }
        ],
        limitAnalysis: [
          {
            condition: '邊界條件趨近極限 (t \\to t_{end} 或 m \\to m_{max})',
            consequence: '系統指標呈現飽和漸進收斂，計算曲線與實驗實測吻合。',
            mathSnippet: '\\lim_{t \\to \\infty} \\text{ 或 } \\lim_{m \\to M}'
          }
        ],
        tensorShapes: formula.variables?.map(v => ({
          stage: v.symbol,
          shape: '(數值序列/純量)',
          description: v.meaning
        })) || [
          { stage: '輸入變數', shape: '(純量/序列)', description: '實驗控制變因' },
          { stage: '目標輸出', shape: '(純量/數值)', description: '系統響應指標' }
        ],
        physicalIntuition: `本公式「${formula.name}」在論文論證體系中擔任核心動力學/數學表徵，量化了實驗控制變因與系統響應之間的連續確定性關聯。`
      };
    }
  }

  function handleJumpToSection(secId: string) {
    dispatch('selectSection', { id: secId });
  }

  // 收錄推導至精讀筆記
  function handleCaptureDerivationToNotes() {
    if (!currentFormulaDerivation) return;
    const title = `數學推導 · ${currentFormulaDerivation.formulaNumber ? currentFormulaDerivation.formulaNumber + ' ' : ''}${currentFormulaDerivation.formulaName}`;
    const stepsMarkdown = currentFormulaDerivation.steps.map(s => 
      `### Step ${s.stepNumber}: ${s.title}\n$$${s.latexFormula}$$\n${s.explanation}\n> 💡 **直覺**：${s.intuition || '保持維度相容與數值穩定'}`
    ).join('\n\n');

    const content = `## ${title}
> 論文出處：《${paper?.title || '學術文獻'}》

### 核心公式
$$${currentFormulaDerivation.latexText}$$

### 初始假設與條件
${currentFormulaDerivation.assumptions.map(a => `- ${a}`).join('\n')}

${stepsMarkdown}

### 物理/工程科研直覺
${currentFormulaDerivation.physicalIntuition}
`;

    dispatch('saveNote', { title, text: content });
    showToast('📝 推導證明已成功收錄至精讀筆記！', true);
  }

  // 收錄圖表解構至筆記
  function handleCaptureFigureToNotes() {
    if (!currentFigureDeconstruction) return;
    const title = `圖表解構 · ${currentFigureDeconstruction.figureNumber ? currentFigureDeconstruction.figureNumber + ' ' : ''}${currentFigureDeconstruction.name}`;
    const content = `## ${title}
> 論文出處：《${paper?.title || '學術文獻'}》

### 概念總覽
${currentFigureDeconstruction.conceptOverview}

### 資料流轉與模組轉換
${currentFigureDeconstruction.dataFlowSteps.map(s => `${s.step}. **${s.component}**：${s.action} ${s.tensorTransformation ? `($$${s.tensorTransformation}$$)` : ''}`).join('\n')}

### 關鍵工程設計決策
${currentFigureDeconstruction.designDecisions.map(d => `- **${d.decision}**：${d.rationale}`).join('\n')}

### 核心結論
${currentFigureDeconstruction.keyTakeaway}
`;

    dispatch('saveNote', { title, text: content });
    showToast('📝 圖表架構解構已收錄至精讀筆記！', true);
  }

  // 收錄沙盒推導至筆記
  function handleCaptureScratchpadToNotes() {
    const title = `自訂推導沙盒筆記 · ${new Date().toLocaleTimeString()}`;
    const content = `## ${title}
### 自訂 LaTeX 方程式
$$${scratchpadLatex}$$

### 研讀推導備註
${scratchpadNotes}

### 數值代入檢驗 ($d_k=${scratchpadDk}$, $q \\cdot k=${scratchpadDotProduct}$)
- 縮放除數 $\\sqrt{d_k}$: ${sanityResult.sqrtDk}
- 縮放後點積數值: ${sanityResult.scaledValue}
- Softmax 梯度敏感狀態: ${sanityResult.isSaturated ? '⚠️ 飽和鈍化 (梯度接近 0)' : '✅ 梯度健康流動'}

${scratchpadAiResult ? `### AI 導師審查講評\n**${scratchpadAiResult.verdictTitle}**\n${scratchpadAiResult.critique}` : ''}
`;

    dispatch('saveNote', { title, text: content });
    showToast('📝 沙盒推導驗證已收錄至精讀筆記！', true);
  }

  // 觸發 AI 驗證沙盒公式
  async function handleVerifyScratchpad() {
    isVerifyingScratchpad = true;
    try {
      const p = (typeof window !== 'undefined' ? localStorage.getItem('mugen_provider') : null) || 'groq';
      const k = (typeof window !== 'undefined' ? localStorage.getItem(`mugen_api_key_${p}`) : null) || '';
      const m = (typeof window !== 'undefined' ? localStorage.getItem('mugen_model') : null) || 'llama-3.3-70b-versatile';
      const o = (typeof window !== 'undefined' ? localStorage.getItem('mugen_ollama_url') : null) || 'http://localhost:11434';

      scratchpadAiResult = await verifyScratchpadDerivation(scratchpadLatex, scratchpadNotes, p, k, m, o);
      showToast('✨ AI 伴讀推導審核完成！');
    } catch (err: any) {
      console.warn('Scratchpad verification failed:', err);
    } finally {
      isVerifyingScratchpad = false;
    }
  }

  function openLightbox(url: string, title: string) {
    lightboxImageUrl = url;
    lightboxTitle = title;
    isFigureLightboxOpen = true;
  }

  function closeLightbox() {
    isFigureLightboxOpen = false;
  }
</script>

<div class="w-full h-full flex flex-col bg-[#282828] text-[#ebdbb2] overflow-hidden select-none">
  <!-- Top Bar of Comparative View -->
  <div class="h-11 bg-[#1d2021] border-b border-[#3c3836] px-4 flex items-center justify-between shrink-0 gap-3">
    <div class="flex items-center gap-2.5">
      <!-- Back to Reader Button -->
      <button
        class="font-mono text-xs px-2.5 py-1 rounded bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#fe8019]/60 text-[#ebdbb2] hover:text-[#fe8019] flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
        on:click={() => dispatch('backToReader')}
        title="返回雙語伴讀工作區"
      >
        <span class="material-symbols-outlined text-[15px]">arrow_back</span>
        <span class="font-medium">返回閱讀</span>
      </button>

      <span class="text-[#504945]">/</span>

      <span class="font-mono text-xs font-semibold text-[#fabd2f] flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[17px] text-[#fe8019]">schema</span>
        圖表與數學推導對照工作台 (Derivations & Figures Studio)
      </span>
      {#if dynamicFormulas.length === 0 && dynamicFigures.length === 0}
        <span class="font-mono text-[10px] bg-[#fabd2f]/15 text-[#fabd2f] border border-[#fabd2f]/40 px-2 py-0.5 rounded font-bold">
          範例預覽模式 · PREVIEW
        </span>
      {:else}
        <span class="font-mono text-[10px] bg-[#32302f] text-[#a89984] px-2 py-0.5 rounded border border-[#504945]">
          左右雙軌認知聯動
        </span>
      {/if}
      {#if copyToastText || noteToastText}
        <span class="font-mono text-xs text-[#b8bb26] bg-[#b8bb26]/15 border border-[#b8bb26]/40 px-2 py-0.5 rounded animate-fade-in flex items-center gap-1">
          <span class="material-symbols-outlined text-[13px]">check_circle</span>
          <span>{copyToastText || noteToastText}</span>
        </span>
      {/if}
    </div>

    <!-- Center/Right Controls -->
    <div class="flex items-center gap-2.5">
      <!-- Heuristic Programmatic Scan Button -->
      <button
        class="font-mono text-xs px-2.5 py-1 rounded bg-[#fe8019]/15 hover:bg-[#fe8019]/25 border border-[#fe8019]/50 text-[#fe8019] hover:text-[#fabd2f] flex items-center gap-1.5 transition-colors font-semibold shadow-sm"
        on:click={handleHeuristicScan}
        disabled={isScanningHeuristically}
        title="使用本機程式演算法初篩，再以輕量微量 Prompt 交由 AI 提煉核心公式與圖表（極致節省 Token，免費方案友善）"
      >
        {#if isScanningHeuristically}
          <span class="inline-block w-3 h-3 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
          <span>程式初篩與 AI 提煉中...</span>
        {:else}
          <span class="material-symbols-outlined text-[14px]">auto_fix_high</span>
          <span>⚡ 程式初篩 + 提煉推導</span>
        {/if}
      </button>

      <!-- Center/Right Mode Tabs -->
      <div class="flex items-center bg-[#282828] border border-[#3c3836] p-0.5 rounded-lg shadow-inner">
        <button
          class="font-mono text-xs px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 {studioRightMode === 'derivation' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => studioRightMode = 'derivation'}
          title="檢視論文核心公式的分步嚴謹數學推導、證明與張量維度"
        >
          <span class="material-symbols-outlined text-[14px]">functions</span>
          <span>📐 論文公式分步推導</span>
        </button>
        <button
          class="font-mono text-xs px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 {studioRightMode === 'scratchpad' ? 'bg-[#fe8019] text-[#1d2021] font-semibold shadow-sm' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
          on:click={() => studioRightMode = 'scratchpad'}
          title="開啟互動式 LaTeX 演算沙盒，代入數值試算與張量維度檢驗"
        >
          <span class="material-symbols-outlined text-[14px]">science</span>
          <span>🧪 互動推導演算沙盒</span>
        </button>
      </div>

      <div class="font-mono text-[11px] text-[#a89984] truncate max-w-[200px] hidden md:block" title={paper?.title}>
        {paper?.title || '文獻圖表與推導演算'}
      </div>
    </div>
  </div>

  <!-- Dual-Column Studio Body -->
  <div class="flex-1 grid grid-cols-2 overflow-hidden divide-x divide-[#3c3836]">
    <!-- LEFT COLUMN: Figure Deck & Deep Deconstruction -->
    <FigureDeconstructionPanel
      {paper}
      {dynamicFigures}
      {selectedFigureIndex}
      {activeFigureTab}
      {currentFigureDeconstruction}
      {isAnalyzingFigure}
      {isScanningHeuristically}
      on:selectFigure={(e) => { selectedFigureIndex = e.detail.index; }}
      on:selectFallbackTab={(e) => { activeFigureTab = e.detail.tab; }}
      on:analyzeFigure={(e) => loadFigureDeconstruction(e.detail.figure, true)}
      on:heuristicScan={handleHeuristicScan}
      on:captureToNotes={handleCaptureFigureToNotes}
      on:openLightbox={(e) => openLightbox(e.detail.url, e.detail.title)}
      on:jumpToSection={(e) => handleJumpToSection(e.detail.sectionId)}
      on:switchRightMode={(e) => { studioRightMode = e.detail.mode; }}
    />

    <!-- RIGHT COLUMN: Mathematical Derivations & Interactive Scratchpad -->
    {#if studioRightMode === 'derivation'}
      <FormulaDerivationPanel
        {paper}
        {dynamicFormulas}
        {selectedFormulaIndex}
        {activeDerivationTab}
        {currentFormulaDerivation}
        {isDerivingFormula}
        {isScanningHeuristically}
        on:selectFormula={(e) => { selectedFormulaIndex = e.detail.index; }}
        on:selectFallbackTab={(e) => { activeDerivationTab = e.detail.tab; }}
        on:deriveFormula={(e) => loadFormulaDerivation(e.detail.formula, true)}
        on:heuristicScan={handleHeuristicScan}
        on:captureToNotes={handleCaptureDerivationToNotes}
        on:jumpToSection={(e) => handleJumpToSection(e.detail.sectionId)}
        on:toast={(e) => showToast(e.detail.text)}
      />
    {:else}
      <DerivationScratchpadPanel
        bind:scratchpadLatex
        bind:scratchpadNotes
        bind:scratchpadDk
        bind:scratchpadDotProduct
        bind:batchSize
        bind:seqLen
        bind:dModel
        bind:numHeads
        {sanityResult}
        {tensorShapeResults}
        {isVerifyingScratchpad}
        {scratchpadAiResult}
        on:verifyScratchpad={handleVerifyScratchpad}
        on:captureToNotes={handleCaptureScratchpadToNotes}
      />
    {/if}
  </div>
</div>

<!-- Fullscreen Image Lightbox Modal (共用元件) -->
<ImageLightboxModal
  isOpen={isFigureLightboxOpen}
  imageUrl={lightboxImageUrl}
  caption={lightboxTitle}
  on:close={closeLightbox}
/>
