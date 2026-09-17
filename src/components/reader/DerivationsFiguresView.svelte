<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PaperDocument, FigureItem, FormulaItem } from '../../stores/documentStore';
  import { flattenSections } from '../../stores/readingStore';
  import katex from 'katex';
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

  export let paper: PaperDocument | null = null;

  const dispatch = createEventDispatcher();

  $: allSections = flattenSections(paper?.sections || []);

  // 動態萃取當前文獻的所有圖表 (支援精準去重與編號歸納)
  $: dynamicFigures = (() => {
    const list: { figure: FigureItem; sectionId?: string; sectionTitle?: string }[] = [];
    const seenFigures = new Set<string>();

    const addFig = (fig: FigureItem, secId?: string, secTitle?: string) => {
      if (!fig) return;
      // 去重鍵值：優先依據 imageUrl，其次依據 figureNumber + name，最後依據 id
      const normImg = fig.imageUrl?.trim() || '';
      const normNum = fig.figureNumber?.trim().toLowerCase() || '';
      const normName = fig.name?.trim().toLowerCase() || '';
      const dedupKey = normImg ? `img:${normImg}` : (normNum ? `num:${normNum}:${normName}` : `id:${fig.id}`);
      
      if (!seenFigures.has(dedupKey)) {
        seenFigures.add(dedupKey);
        list.push({ figure: fig, sectionId: secId, sectionTitle: secTitle });
      }
    };

    if (paper?.figureList && paper.figureList.length > 0) {
      for (const fig of paper.figureList) {
        const sec = allSections.find(s => s.figures?.some((f: FigureItem) => f.id === fig.id || f.imageUrl === fig.imageUrl));
        addFig(fig, sec?.id, sec?.title);
      }
    }

    for (const sec of allSections) {
      if (sec.figures && sec.figures.length > 0) {
        for (const fig of sec.figures) {
          addFig(fig, sec.id, sec.title);
        }
      }
    }

    // 若依然沒有圖表，但正文段落中含有真實圖片標籤 ![alt](url)，自動提取
    if (list.length === 0) {
      for (const sec of allSections) {
        if (sec.paragraphs) {
          for (const p of sec.paragraphs) {
            const imgMatch = p.match(/!\[(.*?)\]\((.*?)\)/);
            if (imgMatch) {
              const alt = imgMatch[1] || '文獻實驗分析圖';
              const url = imgMatch[2].split(' ')[0].replace(/['"]/g, '');
              const num = `Figure ${list.length + 1}`;
              addFig({
                id: `auto_fig_${list.length + 1}`,
                figureNumber: num,
                name: alt,
                imageUrl: url,
                caption: alt
              }, sec.id, sec.title);
            }
          }
        }
      }
    }

    return list;
  })();

  // 記錄圖片載入錯誤清單，自動無縫退回 SVG 拓撲畫布
  let brokenImageUrls: Record<string, boolean> = {};
  // 圖表檢視模式：'auto' (預設有圖顯示圖，無圖/錯誤顯示拓撲) | 'topology' (強制拓撲) | 'image' (強制圖片)
  let figureCanvasViewMode: 'auto' | 'topology' | 'image' = 'auto';

  // 動態萃取當前文獻的所有公式並記錄出處 (Provenance Tracking)
  $: dynamicFormulas = (() => {
    const list: { formula: FormulaItem; sectionId?: string; sectionTitle?: string }[] = [];
    const seenLatex = new Set<string>();

    // 1. 先收集各章節中已結構化之 formulas (若有)
    for (const sec of allSections) {
      if (sec.formulas && sec.formulas.length > 0) {
        for (const f of sec.formulas) {
          const key = f.latexText?.trim();
          if (key && !seenLatex.has(key)) {
            seenLatex.add(key);
            const resolvedSecId = f.sectionId || sec.id || 'sec_root';
            const resolvedSecTitle = f.sectionTitle || sec.title || (paper?.title ? `文獻核心章節` : '文獻主體章節');
            list.push({ formula: f, sectionId: resolvedSecId, sectionTitle: resolvedSecTitle });
          }
        }
      }
    }

    // 2. 自動掃描各章節段落中內嵌之真實方程式 ($$ ... $$)
    let autoCounter = list.length;
    for (const sec of allSections) {
      if (!sec.paragraphs || sec.paragraphs.length === 0) continue;
      const secPage = sec.page ? `p. ${sec.page}` : undefined;
      const cleanSecTitle = (sec.title || '').replace(/^§\s*/, '').trim();
      const secPrefix = cleanSecTitle.split(' ')[0] || '';
      const paragraphs = sec.paragraphs;

      for (let i = 0; i < paragraphs.length; i++) {
        const rawP = paragraphs[i];
        if (!rawP) continue;
        const trimmed = rawP.trim();

        // 單段公式包含完整 $$ ... $$
        if (trimmed.includes('$$')) {
          const blockMatch = trimmed.match(/\$\$([\s\S]*?)\$\$(\s*\(([0-9a-zA-Z.-]+)\))?/);
          if (blockMatch && blockMatch[1].trim()) {
            const mathContent = blockMatch[1].trim();
            if (!seenLatex.has(mathContent)) {
              seenLatex.add(mathContent);
              autoCounter++;

              let formulaNum = blockMatch[3] ? `(${blockMatch[3]})` : '';
              if (!formulaNum && i + 1 < paragraphs.length) {
                const nextP = paragraphs[i + 1].trim();
                const numMatch = nextP.match(/^\(([0-9a-zA-Z.-]+)\)$/);
                if (numMatch) {
                  formulaNum = `(${numMatch[1]})`;
                }
              }
              if (!formulaNum) formulaNum = `(${autoCounter})`;

              const nameNum = formulaNum.replace(/[()]/g, '');
              const formulaName = secPrefix
                ? `§ ${secPrefix} 方程式 ${nameNum}`
                : `核心方程式 ${nameNum}`;

              const lhs = mathContent.split(/[\s=:]+/)[0]?.replace(/[\\{}]/g, '').trim() || 'y';
              const fItem: FormulaItem = {
                id: `sec_${sec.id}_eq_${autoCounter}`,
                number: formulaNum,
                name: formulaName,
                latexText: mathContent,
                page: secPage,
                sectionId: sec.id,
                sectionTitle: sec.title,
                sourceContextSnippet: trimmed.replace(/\$\$/g, '').slice(0, 180),
                variables: [
                  { symbol: lhs, meaning: '核心目標物理量 / 響應狀態指標', color: '#fe8019' },
                  { symbol: 'm_\\Sigma / t', meaning: '控制變因 / 累積質量或時間', color: '#fabd2f' }
                ]
              };
              list.push({ formula: fItem, sectionId: sec.id, sectionTitle: sec.title });
            }
          }
        }
      }
    }

    return list;
  })();

  $: activeSectionProvenanceId =
    dynamicFormulas[selectedFormulaIndex]?.sectionId ||
    currentFormulaDerivation?.sourceSectionId ||
    '';

  $: activeSectionProvenanceTitle = (() => {
    const raw =
      dynamicFormulas[selectedFormulaIndex]?.sectionTitle ||
      currentFormulaDerivation?.sourceSectionTitle ||
      (dynamicFormulas.length === 0 ? '3.2.1 Scaled Dot-Product Attention' : '文獻主體章節');
    return raw.replace(/^§\s*/, '').trim();
  })();

  $: activePageProvenance =
    dynamicFormulas[selectedFormulaIndex]?.formula.page ||
    currentFormulaDerivation?.sourcePage ||
    (dynamicFormulas.length === 0 ? 'p. 4' : '');

  $: activeContextSnippet =
    dynamicFormulas[selectedFormulaIndex]?.formula.sourceContextSnippet ||
    currentFormulaDerivation?.sourceContextSnippet ||
    '';


  function normalizeAcademicImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim().replace(/^<|>$/g, '');
    if (url.includes('mdpi.com') && (url.includes('/images/') || url.includes('/html/') || /\.(?:png|jpe?g|webp|svg|gif)/i.test(url))) {
      url = url.replace(/https?:\/\/(?:www\.)?mdpi\.com\//i, 'https://pub.mdpi-res.com/');
    }
    return url;
  }

  // 狀態變數
  let selectedFigureIndex: number = 0;
  let selectedFormulaIndex: number = 0;

  // Fallback demo tabs when no extracted items exist
  let activeFigureTab: 'fig1' | 'fig2' = 'fig1';
  let activeDerivationTab: 'derivation1' | 'derivation2' | 'derivation3' = 'derivation1';

  // 右欄檢視模式：論文核心推導 vs 互動推導沙盒
  let studioRightMode: 'derivation' | 'scratchpad' = 'derivation';

  // 左欄圖片縮放控制
  let figureZoom: number = 100;
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
  let scratchpadTab: 'numeric' | 'tensors' | 'ai-verify' = 'numeric';
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
          const alreadyExists = targetSec.formulas.some(f => f.latexText.trim().replace(/\s+/g, '') === normLatex);
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
      // Fallback
      currentFigureDeconstruction = CLASSIC_FIGURE_DECONSTRUCTIONS[activeFigureTab] || CLASSIC_FIGURE_DECONSTRUCTIONS.fig1;
    }
  }

  // 響應當前選取之公式更新推導資訊
  $: {
    const activeForm = dynamicFormulas[selectedFormulaIndex]?.formula;
    if (activeForm) {
      loadFormulaDerivation(activeForm);
    } else {
      // Fallback
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
    figureZoom = 100;
  }

  async function loadFigureDeconstruction(fig: FigureItem, forceAi: boolean = false) {
    figureAnalysisError = '';
    // 若已有經典資料且非強制 AI
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
      // 預設快速嘗試載入（優先自快取或經典，否則套用領域適配科學拓撲）
      const adapted = getDomainAdaptedFigurePipeline(paper?.title || '', fig.name);
      let rawData = CLASSIC_FIGURE_DECONSTRUCTIONS[fig.id];

      // 檢查快取中是否殘留了歷史遺留的神經網路張量假資料
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
      .replace(/\\right\}/g, '\\right\\}')
      .replace(/([^\\])%/g, '$1\\%')
      .replace(/^%/g, '\\%');
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

  function copyLatex(latex: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(latex);
      showToast('LaTeX 原始碼已複製！');
    }
  }

  function insertSymbolToScratchpad(symbol: string) {
    scratchpadLatex += symbol;
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

    dispatch('saveNote', {
      title,
      text: content
    });

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

    dispatch('saveNote', {
      title,
      text: content
    });

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

    dispatch('saveNote', {
      title,
      text: content
    });

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
      <!-- Heuristic Programmatic Scan Button (Token-Friendly) -->
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

      <!-- Center/Right Mode Tabs: Core Derivation vs Scratchpad -->
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
          title="開啟互動式 LaTeX 演算沙盒，代入數值試算與張量維度檢驗 (CHECKLIST Item 8)"
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
    <div class="h-full flex flex-col bg-[#1d2021]/70 overflow-hidden">
      <!-- Dynamic Tabs for Document Figures -->
      {#if dynamicFigures.length > 0}
        <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
          <div class="flex items-center gap-1.5 overflow-x-auto max-w-[70%]">
            {#each dynamicFigures as item, idx}
              <button
                class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {selectedFigureIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
                on:click={() => { selectedFigureIndex = idx; figureZoom = 100; }}
              >
                <span class="material-symbols-outlined text-[13px]">image</span>
                <span>{item.figure.figureNumber || `圖表 ${idx + 1}`}</span>
              </button>
            {/each}
          </div>

          <!-- Figure Zoom Controls -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-xs font-mono"
              on:click={() => figureZoom = Math.max(50, figureZoom - 20)}
              title="縮小圖片"
            >
              -
            </button>
            <span class="font-mono text-[10px] text-[#a89984] w-9 text-center">{figureZoom}%</span>
            <button
              class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-xs font-mono"
              on:click={() => figureZoom = Math.min(250, figureZoom + 20)}
              title="放大圖片"
            >
              +
            </button>
            <button
              class="w-6 h-6 rounded flex items-center justify-center bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#fe8019] text-xs"
              on:click={() => figureZoom = 100}
              title="重設縮放 (100%)"
            >
              <span class="material-symbols-outlined text-[13px]">restart_alt</span>
            </button>
          </div>
        </div>
      {:else}
        <!-- Fallback Tabs for Attention Paper SVGs with PREVIEW badge -->
        <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded font-bold">
              PREVIEW
            </span>
            <button
              class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
              on:click={() => { activeFigureTab = 'fig1'; }}
            >
              <span class="material-symbols-outlined text-[14px]">account_tree</span>
              <span>Fig 1: Transformer 全景拓撲</span>
            </button>
            <button
              class="font-mono text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 {activeFigureTab === 'fig2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
              on:click={() => { activeFigureTab = 'fig2'; }}
            >
              <span class="material-symbols-outlined text-[14px]">device_hub</span>
              <span>Fig 2: 點積注意力電路</span>
            </button>
          </div>
        </div>
      {/if}

      <!-- Left Figure Content & Deconstruction Cards -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {#if dynamicFigures.length === 0}
          <!-- Preview Banner for Figures -->
          <div class="bg-[#fabd2f]/10 border border-[#fabd2f]/40 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2 text-[#fabd2f]">
              <span class="material-symbols-outlined text-[18px]">info</span>
              <div class="flex flex-col">
                <span class="font-bold">範例預覽 (Preview Mode)</span>
                <span class="text-[11px] text-[#d5c4a1]">當前論文尚未萃取出專屬圖表，此處為展示模板。點擊右側以程式初篩提煉。</span>
              </div>
            </div>
            <button
              class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shrink-0 transition-colors shadow-sm"
              on:click={handleHeuristicScan}
              disabled={isScanningHeuristically}
            >
              {#if isScanningHeuristically}
                <span class="inline-block w-2.5 h-2.5 border-2 border-[#1d2021] border-t-transparent rounded-full animate-spin"></span>
                <span>提煉中...</span>
              {:else}
                <span class="material-symbols-outlined text-[13px]">auto_fix_high</span>
                <span>程式初篩 + 提煉圖表</span>
              {/if}
            </button>
          </div>
        {/if}
        <!-- Image & Topology Render Canvas -->
        {#if dynamicFigures.length > 0 && dynamicFigures[selectedFigureIndex]}
          {@const activeItem = dynamicFigures[selectedFigureIndex]}
          {@const rawImg = activeItem.figure.imageUrl?.trim() || ''}
          {@const isBroken = Boolean(rawImg && brokenImageUrls[rawImg])}
          {@const hasImg = Boolean(rawImg && !isBroken)}
          {@const showTopology = figureCanvasViewMode === 'topology' || (!hasImg && figureCanvasViewMode !== 'image')}
          <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
            <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[280px]">
                  {activeItem.figure.figureNumber ? `${activeItem.figure.figureNumber}: ` : ''}{activeItem.figure.name}
                </span>
                {#if showTopology}
                  <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1.5 py-0.5 rounded font-semibold shrink-0">
                    系統資料流拓撲
                  </span>
                {:else}
                  <span class="font-mono text-[9px] bg-[#8ec07c]/15 border border-[#8ec07c]/40 text-[#8ec07c] px-1.5 py-0.5 rounded font-semibold shrink-0">
                    論文原圖視圖
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <!-- 視圖模式切換按鈕 (若有圖片時可自由切換拓撲 vs 原圖) -->
                {#if hasImg}
                  <div class="flex items-center bg-[#1d2021] border border-[#3c3836] rounded p-0.5 text-[10px] font-mono">
                    <button
                      class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode !== 'topology' ? 'bg-[#3c3836] text-[#fabd2f] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                      on:click={() => figureCanvasViewMode = 'image'}
                      title="顯示論文原始圖片"
                    >
                      原圖
                    </button>
                    <button
                      class="px-1.5 py-0.5 rounded transition-colors {figureCanvasViewMode === 'topology' ? 'bg-[#3c3836] text-[#fe8019] font-bold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
                      on:click={() => figureCanvasViewMode = 'topology'}
                      title="切換為資料流拓撲向量視圖"
                    >
                      拓撲
                    </button>
                  </div>
                {/if}

                {#if !showTopology && hasImg}
                  <button
                    class="font-mono text-[10px] bg-[#32302f] hover:bg-[#3c3836] border border-[#504945] text-[#ebdbb2] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                    on:click={() => openLightbox(normalizeAcademicImageUrl(rawImg), activeItem.figure.name)}
                  >
                    <span class="material-symbols-outlined text-[12px]">fullscreen</span>
                    <span>全螢幕</span>
                  </button>
                {/if}

                {#if activeItem.sectionId}
                  <button
                    class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                    on:click={() => handleJumpToSection(activeItem.sectionId || '')}
                  >
                    <span>跳轉章節</span>
                    <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </button>
                {/if}
              </div>
            </div>

            <!-- Canvas Area: 圖片或互動式 SVG 資料流拓撲圖 -->
            {#if showTopology}
              {@const isML = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '')}
              {@const adaptedTopology = getDomainAdaptedFigurePipeline(paper?.title || '', activeItem.figure.name)}
              {@const rawSteps = currentFigureDeconstruction?.dataFlowSteps && currentFigureDeconstruction.dataFlowSteps.length > 0
                ? currentFigureDeconstruction.dataFlowSteps.slice(0, 3)
                : adaptedTopology.dataFlowSteps}
              {@const steps = rawSteps.map((s, idx) => {
                if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
                  return adaptedTopology.dataFlowSteps[idx] || s;
                }
                return s;
              })}
              <!-- 現代互動式 SVG 資料流拓撲圖 (解決破圖與拓撲無法顯示問題) -->
              <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex flex-col items-center justify-center min-h-[280px] max-h-[440px] overflow-auto relative select-none">
                <!-- 頂部拓撲說明列 -->
                <div class="w-full flex items-center justify-between pb-2 mb-2 border-b border-[#282828] text-xs font-mono">
                  <div class="flex items-center gap-1.5 text-[#fe8019]">
                    <span class="material-symbols-outlined text-[15px]">account_tree</span>
                    <span class="font-bold text-[11px]">方法論資料流拓撲管線 (Data Flow Architecture Pipeline)</span>
                  </div>
                  <span class="text-[10px] text-[#a89984]">
                    {currentFigureDeconstruction?.dataFlowSteps?.length || 3} 個連續運算階段
                  </span>
                </div>

                <!-- SVG 拓撲流程管線繪製 -->
                <svg class="w-full max-h-[300px]" viewBox="0 0 540 230" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="nodeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#1d2021" />
                      <stop offset="100%" stop-color="#282828" />
                    </linearGradient>
                    <linearGradient id="nodeGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#282828" />
                      <stop offset="100%" stop-color="#32302f" />
                    </linearGradient>
                    <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                      <polygon points="0 1, 7 4, 0 7" fill="#fe8019" />
                    </marker>
                  </defs>

                  <!-- 背景網格微點 -->
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#3c3836" opacity="0.3" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid)" />

                  <!-- 連接箭頭 1 -> 2 -->
                  <path d="M 170 100 L 205 100" stroke="#fe8019" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#flowArrow)">
                    <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.2s" repeatCount="indefinite" />
                  </path>

                  <!-- 連接箭頭 2 -> 3 -->
                  <path d="M 350 100 L 385 100" stroke="#fe8019" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#flowArrow)">
                    <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.2s" repeatCount="indefinite" />
                  </path>

                  <!-- 節點 1: Input Stage -->
                  <g transform="translate(15, 35)">
                    <rect width="155" height="135" rx="8" fill="url(#nodeGrad1)" stroke="#504945" stroke-width="1.2" />
                    <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                    <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                    <line x1="0" y1="28" x2="155" y2="28" stroke="#3c3836" stroke-width="1" />
                    <!-- Badge -->
                    <circle cx="16" cy="14" r="7" fill="#fe8019" />
                    <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">1</text>
                    <text x="30" y="18" fill="#fabd2f" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                      {steps[0]?.component || '輸入/控制變因'}
                    </text>
                    <!-- Body -->
                    <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                      {(steps[0]?.component || '輸入特徵層').slice(0, 10)}
                    </text>
                    <foreignObject x="10" y="58" width="135" height="42">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #a89984; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        {steps[0]?.action || '特徵資料載入與正規化'}
                      </div>
                    </foreignObject>
                    <!-- Tensor / Math Pill (KaTeX 渲染) -->
                    <foreignObject x="8" y="104" width="139" height="24">
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        class="w-full h-full flex items-center justify-center px-1 bg-[#141617] border border-[#3c3836] rounded text-[10px] text-[#8ec07c] overflow-hidden whitespace-nowrap text-ellipsis shadow-inner"
                      >
                        {@html renderMath(steps[0]?.tensorTransformation || '(B, S, D_{in})')}
                      </div>
                    </foreignObject>
                  </g>

                  <!-- 節點 2: Core Processing / Kinetics Stage -->
                  <g transform="translate(195, 30)">
                    <rect width="155" height="145" rx="8" fill="url(#nodeGradActive)" stroke="#fe8019" stroke-width="1.8" />
                    <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                    <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                    <line x1="0" y1="28" x2="155" y2="28" stroke="#fe8019" stroke-width="1" />
                    <!-- Badge -->
                    <circle cx="16" cy="14" r="7" fill="#fe8019" />
                    <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">2</text>
                    <text x="30" y="18" fill="#fe8019" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                      {steps[1]?.component || '核心表徵轉換'}
                    </text>
                    <!-- Body -->
                    <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                      {(steps[1]?.component || '核心動力學層').slice(0, 10)}
                    </text>
                    <foreignObject x="10" y="58" width="135" height="46">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #d5c4a1; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        {steps[1]?.action || '特徵提取與連續動力學演進'}
                      </div>
                    </foreignObject>
                    <!-- Tensor / Math Pill (KaTeX 渲染) -->
                    <foreignObject x="8" y="112" width="139" height="26">
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        class="w-full h-full flex items-center justify-center px-1 bg-[#1d2021] border border-[#fe8019]/80 rounded text-[10px] text-[#fe8019] font-bold overflow-hidden whitespace-nowrap text-ellipsis shadow-sm"
                      >
                        {@html renderMath(steps[1]?.tensorTransformation || '(B, S, D_{hidden})')}
                      </div>
                    </foreignObject>
                  </g>

                  <!-- 節點 3: Output / Target Evaluation Stage -->
                  <g transform="translate(375, 35)">
                    <rect width="155" height="135" rx="8" fill="url(#nodeGrad1)" stroke="#504945" stroke-width="1.2" />
                    <rect x="0" y="0" width="155" height="28" rx="8" fill="#1d2021" />
                    <rect x="0" y="20" width="155" height="8" fill="#1d2021" />
                    <line x1="0" y1="28" x2="155" y2="28" stroke="#3c3836" stroke-width="1" />
                    <!-- Badge -->
                    <circle cx="16" cy="14" r="7" fill="#8ec07c" />
                    <text x="16" y="17" fill="#1d2021" font-family="JetBrains Mono" font-size="9" font-weight="bold" text-anchor="middle">3</text>
                    <text x="30" y="18" fill="#8ec07c" font-family="JetBrains Mono" font-size="10" font-weight="bold">
                      {steps[2]?.component || '輸出/指標預測'}
                    </text>
                    <!-- Body -->
                    <text x="12" y="52" fill="#ebdbb2" font-family="Noto Serif TC, serif" font-size="10" font-weight="bold">
                      {(steps[2]?.component || '目標響應層').slice(0, 10)}
                    </text>
                    <foreignObject x="10" y="58" width="135" height="42">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 9px; color: #a89984; font-family: sans-serif; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        {steps[2]?.action || '目標物理量評估與收斂驗證'}
                      </div>
                    </foreignObject>
                    <!-- Tensor / Math Pill (KaTeX 渲染) -->
                    <foreignObject x="8" y="104" width="139" height="24">
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        class="w-full h-full flex items-center justify-center px-1 bg-[#141617] border border-[#3c3836] rounded text-[10px] text-[#8ec07c] overflow-hidden whitespace-nowrap text-ellipsis shadow-inner"
                      >
                        {@html renderMath(steps[2]?.tensorTransformation || '(B, S, D_{out})')}
                      </div>
                    </foreignObject>
                  </g>

                  <!-- 底部全域資料流標註 -->
                  <text x="270" y="205" fill="#a89984" font-family="JetBrains Mono" font-size="9" text-anchor="middle">
                    ⟵ 系統狀態連續演進與邊界收斂管線 ⟶
                  </text>
                </svg>
              </div>
            {:else}
              <!-- 原始論文圖片視圖 (帶圖片載入錯誤防護) -->
              <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 flex items-center justify-center overflow-auto min-h-[260px] max-h-[420px]">
                <img
                  src={normalizeAcademicImageUrl(rawImg)}
                  alt={activeItem.figure.name}
                  referrerpolicy="no-referrer"
                  style="transform: scale({figureZoom / 100}); transform-origin: center center;"
                  class="max-h-[360px] max-w-full object-contain rounded transition-transform duration-200 cursor-zoom-in"
                  on:click={() => openLightbox(normalizeAcademicImageUrl(rawImg), activeItem.figure.name)}
                  on:error={() => {
                    if (rawImg) brokenImageUrls[rawImg] = true;
                  }}
                  loading="lazy"
                />
              </div>
            {/if}

            {#if activeItem.figure.caption}
              <p class="text-xs text-[#d5c4a1] font-serif leading-relaxed text-justify px-1 border-l-2 border-[#fe8019]/60 pl-2.5 my-1 bg-[#1d2021]/50 py-1 rounded-r">
                {activeItem.figure.caption}
              </p>
            {/if}
          </div>
        {:else}
          <!-- Demo Fallback Attention SVG Figures -->
          <div class="bg-[#282828] border border-[#3c3836] p-4 rounded-xl flex flex-col gap-3 shadow-md">
            <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
              <span class="font-mono text-xs text-[#fabd2f] font-bold">
                {activeFigureTab === 'fig1' ? 'Figure 1: The Transformer Architecture (全景拓撲)' : 'Figure 2: Scaled Dot-Product Attention Circuit (運算電路)'}
              </span>
              <span class="font-mono text-[10px] text-[#8ec07c]">經典文獻架構模型</span>
            </div>

            <!-- SVG Vector Visualizer -->
            <div class="w-full bg-[#141617] border border-[#504945] rounded-lg p-4 flex items-center justify-center">
              {#if activeFigureTab === 'fig1'}
                <svg class="w-full max-h-[280px]" viewBox="0 0 460 260">
                  <rect x="20" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#fe8019" stroke-width="1.5" />
                  <text x="75" y="55" fill="#fe8019" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">1. INPUT STAGE</text>
                  <line x1="30" y1="65" x2="120" y2="65" stroke="#3c3836" stroke-width="1" />
                  <rect x="30" y="75" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="90" fill="#d5c4a1" font-family="Geist" font-size="9" text-anchor="middle">Token Embeddings</text>
                  <rect x="30" y="105" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="120" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">+ Positional Encoding</text>
                  <rect x="30" y="135" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="75" y="150" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">Multi-Head Attention</text>

                  <path d="M 130 130 L 165 130" stroke="#fabd2f" stroke-width="2" stroke-dasharray="4,2" />

                  <rect x="175" y="20" width="120" height="220" rx="8" fill="#1d2021" stroke="#fabd2f" stroke-width="1.5" />
                  <text x="235" y="45" fill="#fabd2f" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">2. ENCODER BLOCK</text>
                  <line x1="185" y1="55" x2="285" y2="55" stroke="#3c3836" stroke-width="1" />
                  <rect x="185" y="65" width="100" height="26" rx="4" fill="#32302f" stroke="#fe8019" stroke-width="1.5" />
                  <text x="235" y="81" fill="#fe8019" font-family="Geist" font-size="9" font-weight="bold" text-anchor="middle">Self-Attention</text>
                  <rect x="185" y="100" width="100" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="235" y="115" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm (殘差)</text>
                  <rect x="185" y="130" width="100" height="26" rx="4" fill="#282828" stroke="#504945" />
                  <text x="235" y="146" fill="#8ec07c" font-family="Geist" font-size="9" text-anchor="middle">Feed Forward (2048)</text>
                  <rect x="185" y="165" width="100" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="235" y="180" fill="#b8bb26" font-family="Geist" font-size="9" text-anchor="middle">Add & Norm (殘差)</text>

                  <path d="M 295 130 L 325 130" stroke="#8ec07c" stroke-width="2" stroke-dasharray="4,2" />

                  <rect x="335" y="30" width="110" height="200" rx="8" fill="#1d2021" stroke="#8ec07c" stroke-width="1.5" />
                  <text x="390" y="55" fill="#8ec07c" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">3. DECODER & OUTPUT</text>
                  <line x1="345" y1="65" x2="435" y2="65" stroke="#3c3836" stroke-width="1" />
                  <rect x="345" y="75" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="90" fill="#fabd2f" font-family="Geist" font-size="9" text-anchor="middle">Masked Self-Attn</text>
                  <rect x="345" y="105" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="120" fill="#83a598" font-family="Geist" font-size="9" text-anchor="middle">Cross-Attention</text>
                  <rect x="345" y="135" width="90" height="22" rx="4" fill="#282828" stroke="#504945" />
                  <text x="390" y="150" fill="#d3869b" font-family="Geist" font-size="9" text-anchor="middle">Linear & Softmax</text>
                </svg>
              {:else}
                <svg class="w-full max-h-[280px]" viewBox="0 0 320 220">
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
              {/if}
            </div>
          </div>
        {/if}

        <!-- Figure Architectural Deconstruction Card (架構解構與資料流) -->
        {#if currentFigureDeconstruction}
          {@const isML = /transformer|attention|neural|deep learning|resnet|machine learning|reinforcement|language model|convolution/i.test(paper?.title || '')}
          {@const adapted = getDomainAdaptedFigurePipeline(paper?.title || '', currentFigureDeconstruction.name)}
          {@const displaySteps = currentFigureDeconstruction.dataFlowSteps.map((s, idx) => {
            if (!isML && (s.tensorTransformation?.includes('(B, S, D') || s.component?.includes('輸入特徵') || s.component?.includes('核心表徵'))) {
              return adapted.dataFlowSteps[idx] || s;
            }
            return s;
          })}
          <div class="bg-[#1d2021] border border-[#504945] rounded-xl p-4 flex flex-col gap-4 shadow-inner">
            <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-[#fe8019]">account_tree</span>
                <h3 class="font-mono text-xs font-bold text-[#fe8019]">圖表架構深度解構 (Architectural Deconstruction)</h3>
              </div>
              <div class="flex items-center gap-2">
                {#if dynamicFigures[selectedFigureIndex]}
                  <button
                    class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                    on:click={() => loadFigureDeconstruction(dynamicFigures[selectedFigureIndex].figure, true)}
                    disabled={isAnalyzingFigure}
                  >
                    {#if isAnalyzingFigure}
                      <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
                      <span>解構中...</span>
                    {:else}
                      <span class="material-symbols-outlined text-[12px]">psychology</span>
                      <span>⚡ AI 圖表深層解構</span>
                    {/if}
                  </button>
                {/if}
                <button
                  class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                  on:click={handleCaptureFigureToNotes}
                  title="將此圖表架構與資料流解構收錄至精讀筆記"
                >
                  <span class="material-symbols-outlined text-[12px]">edit_note</span>
                  <span>收錄至筆記</span>
                </button>
              </div>
            </div>

            <!-- Concept Overview -->
            <p class="text-xs text-[#ebdbb2] leading-relaxed text-justify">
              {currentFigureDeconstruction.conceptOverview}
            </p>

            <!-- Data Flow Pipeline Steps -->
            <div class="flex flex-col gap-2">
              <h4 class="font-mono text-[11px] font-bold text-[#fabd2f] flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">alt_route</span>
                資料流動與算子轉換路徑 (Data Flow Pipeline)
              </h4>
              <div class="flex flex-col gap-2">
                {#each displaySteps as step}
                  <div class="bg-[#282828] border border-[#3c3836] rounded-lg p-2.5 flex flex-col gap-1.5">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-[11px] text-[#8ec07c] font-semibold flex items-center gap-1">
                        <span class="w-4 h-4 rounded-full bg-[#8ec07c]/20 text-[#8ec07c] text-[10px] flex items-center justify-center font-bold">
                          {step.step}
                        </span>
                        {step.component}
                      </span>
                      {#if step.tensorTransformation}
                        <span class="font-mono text-[10px] text-[#fabd2f] bg-[#1d2021] px-2 py-0.5 rounded border border-[#504945]">
                          {@html renderMath(step.tensorTransformation, false)}
                        </span>
                      {/if}
                    </div>
                    <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                      {step.action}
                    </p>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Engineering Design Decisions & Trade-offs -->
            {#if currentFigureDeconstruction.designDecisions && currentFigureDeconstruction.designDecisions.length > 0}
              <div class="flex flex-col gap-2">
                <h4 class="font-mono text-[11px] font-bold text-[#83a598] flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px]">lightbulb</span>
                  關鍵工程設計決策與權衡 (Design Decisions & Trade-offs)
                </h4>
                <div class="flex flex-col gap-2">
                  {#each currentFigureDeconstruction.designDecisions as item}
                    <div class="bg-[#282828]/70 border border-[#3c3836] rounded-lg p-2.5 flex flex-col gap-1">
                      <span class="font-mono text-[11px] font-semibold text-[#fe8019]">
                        📌 {item.decision}
                      </span>
                      <p class="text-[11px] text-[#d5c4a1] leading-relaxed">
                        {item.rationale}
                      </p>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Cross-reference anchor to equations -->
            {#if currentFigureDeconstruction.relatedFormulaId}
              <div class="bg-[#282828] border border-[#fabd2f]/40 p-2.5 rounded-lg flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">sync_alt</span>
                  <span class="font-mono text-[11px] text-[#ebdbb2]">
                    此架構對應右側數學公式：<strong class="text-[#fabd2f]">{currentFigureDeconstruction.relatedFormulaId}</strong>
                  </span>
                </div>
                <button
                  class="font-mono text-[10px] text-[#fabd2f] hover:underline flex items-center gap-0.5 cursor-pointer"
                  on:click={() => studioRightMode = 'derivation'}
                >
                  <span>檢視對應推導</span>
                  <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                </button>
              </div>
            {/if}

            <!-- Key Takeaway -->
            <div class="border-t border-[#3c3836] pt-2 text-[11px] text-[#a89984] italic">
              💡 核心總結：{currentFigureDeconstruction.keyTakeaway}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT COLUMN: Mathematical Derivations & Interactive Scratchpad -->
    <div class="h-full flex flex-col bg-[#282828] overflow-hidden">
      {#if studioRightMode === 'derivation'}
        <!-- Mode A: Core Formula Derivations -->
        <!-- Formula Selector Tabs -->
        {#if dynamicFormulas.length > 0}
          <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
            <div class="flex items-center gap-1.5 overflow-x-auto max-w-[70%]">
              {#each dynamicFormulas as item, idx}
                <button
                  class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 shrink-0 {selectedFormulaIndex === idx ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40 shadow-sm' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
                  on:click={() => selectedFormulaIndex = idx}
                  title="來源出處：§ {item.sectionTitle || '未指定'}"
                >
                  <span class="material-symbols-outlined text-[13px]">functions</span>
                  <span>{item.formula.number || `Eq (${idx + 1})`}</span>
                  {#if item.sectionTitle}
                    <span class="text-[9px] text-[#8ec07c] bg-[#141617] border border-[#3c3836] px-1 py-0.2 rounded font-semibold max-w-[85px] truncate">
                      § {item.sectionTitle.replace(/^§\s*/, '').split(' ')[0]}
                    </span>
                  {/if}
                </button>
              {/each}
            </div>

            <div class="flex items-center gap-2">
              {#if dynamicFormulas[selectedFormulaIndex]}
                <button
                  class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors shadow-sm"
                  on:click={() => loadFormulaDerivation(dynamicFormulas[selectedFormulaIndex].formula, true)}
                  disabled={isDerivingFormula}
                >
                  {#if isDerivingFormula}
                    <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
                    <span>推導中...</span>
                  {:else}
                    <span class="material-symbols-outlined text-[13px]">psychology</span>
                    <span>⚡ AI 步驟證明推導</span>
                  {/if}
                </button>
              {/if}
              <button
                class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors"
                on:click={handleCaptureDerivationToNotes}
                title="將分步數學推導與證明收錄至精讀筆記"
              >
                <span class="material-symbols-outlined text-[13px]">edit_note</span>
                <span>收錄至筆記</span>
              </button>
            </div>
          </div>
        {:else}
          <!-- Fallback Demo Tabs with PREVIEW badge -->
          <div class="p-2 border-b border-[#3c3836] flex items-center justify-between bg-[#1d2021] shrink-0">
            <div class="flex items-center gap-1.5 overflow-x-auto">
              <span class="font-mono text-[10px] bg-[#fabd2f]/15 border border-[#fabd2f]/40 text-[#fabd2f] px-1.5 py-0.5 rounded font-bold shrink-0">
                PREVIEW
              </span>
              <button
                class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation1' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
                on:click={() => activeDerivationTab = 'derivation1'}
              >
                <span class="material-symbols-outlined text-[13px]">functions</span>
                <span>Eq (1): 縮放點積注意力</span>
              </button>
              <button
                class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation2' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
                on:click={() => activeDerivationTab = 'derivation2'}
              >
                <span class="material-symbols-outlined text-[13px]">calculate</span>
                <span>Eq (2): 多頭子空間投影</span>
              </button>
              <button
                class="font-mono text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shrink-0 {activeDerivationTab === 'derivation3' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border border-[#fe8019]/40' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
                on:click={() => activeDerivationTab = 'derivation3'}
              >
                <span class="material-symbols-outlined text-[13px]">speed</span>
                <span>說明書: 認知效能模型</span>
              </button>
            </div>
            <button
              class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2 py-1 rounded flex items-center gap-1 transition-colors shrink-0"
              on:click={handleCaptureDerivationToNotes}
            >
              <span class="material-symbols-outlined text-[13px]">edit_note</span>
              <span>收錄至筆記</span>
            </button>
          </div>
        {/if}

        <!-- Derivation Deck Scrollable Body -->
        <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {#if dynamicFormulas.length === 0}
            <!-- Preview Banner for Formulas -->
            <div class="bg-[#fabd2f]/10 border border-[#fabd2f]/40 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2 text-[#fabd2f]">
                <span class="material-symbols-outlined text-[18px]">functions</span>
                <div class="flex flex-col">
                  <span class="font-bold">範例預覽 (Preview Mode)</span>
                  <span class="text-[11px] text-[#d5c4a1]">當前論文尚未萃取出數學公式，此處為展示模板。點擊右側以程式初篩提煉。</span>
                </div>
              </div>
              <button
                class="px-2.5 py-1 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-bold rounded flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                on:click={handleHeuristicScan}
                disabled={isScanningHeuristically}
              >
                {#if isScanningHeuristically}
                  <span class="inline-block w-2.5 h-2.5 border-2 border-[#1d2021] border-t-transparent rounded-full animate-spin"></span>
                  <span>提煉中...</span>
                {:else}
                  <span class="material-symbols-outlined text-[13px]">calculate</span>
                  <span>程式初篩 + 提煉推導</span>
                {/if}
              </button>
            </div>
          {/if}
          {#if currentFormulaDerivation}
            <!-- 1. Main Formula Hero Card -->
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-3 shadow-inner">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs text-[#fabd2f] font-bold truncate max-w-[320px]">
                  {currentFormulaDerivation.formulaNumber ? `${currentFormulaDerivation.formulaNumber} ` : ''}{currentFormulaDerivation.formulaName}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] px-2 py-0.5 rounded flex items-center gap-1"
                    on:click={() => copyLatex(currentFormulaDerivation?.latexText || '')}
                    title="複製 LaTeX 公式原始碼"
                  >
                    <span class="material-symbols-outlined text-[12px]">content_copy</span>
                    <span>複製 LaTeX</span>
                  </button>
                  {#if activeSectionProvenanceId}
                    <button
                      class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                      on:click={() => handleJumpToSection(activeSectionProvenanceId)}
                    >
                      <span>跳轉至章節</span>
                      <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Source Provenance Banner: 清楚標註函數是從哪裡來的 -->
              <div class="flex flex-wrap items-center justify-between gap-2 bg-[#181a1b] border border-[#3c3836] px-3 py-1.5 rounded-lg text-xs font-mono">
                <div class="flex items-center gap-2 text-[#8ec07c] min-w-0">
                  <span class="material-symbols-outlined text-[14px] text-[#fe8019] shrink-0">pin_drop</span>
                  <span class="font-bold text-[#fe8019] shrink-0">文獻出處:</span>
                  <span class="font-medium text-[#ebdbb2] truncate" title="§ {activeSectionProvenanceTitle}">
                    § {activeSectionProvenanceTitle}
                  </span>
                  {#if activePageProvenance}
                    <span class="text-[#a89984] bg-[#282828] border border-[#3c3836] px-1.5 py-0.5 rounded text-[10px] shrink-0">
                      {activePageProvenance}
                    </span>
                  {/if}
                </div>
                {#if activeSectionProvenanceId}
                  <button
                    type="button"
                    class="font-mono text-[10px] text-[#8ec07c] hover:text-[#b8bb26] hover:bg-[#282828] border border-[#8ec07c]/40 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    on:click={() => handleJumpToSection(activeSectionProvenanceId)}
                    title="跳轉回文獻並定位到該章節原文"
                  >
                    <span class="material-symbols-outlined text-[12px]">my_location</span>
                    <span>定位原文對應段落</span>
                  </button>
                {/if}
              </div>

              <!-- Context Quote Snippet (若有來源段落引述線索) -->
              {#if activeContextSnippet}
                <div class="bg-[#181a1b]/60 border-l-2 border-[#fe8019] px-3 py-1.5 rounded-r text-[11px] text-[#a89984] italic">
                  <span class="text-[#fe8019] font-semibold not-italic mr-1">[原文引述線索]:</span>
                  “{activeContextSnippet}”
                </div>
              {/if}

              <!-- Main Formula via KaTeX -->
              <div class="py-4 flex justify-center text-[22px] text-[#ebdbb2] border-y border-[#3c3836] overflow-x-auto select-text">
                {@html renderMath(currentFormulaDerivation.latexText, true)}
              </div>

              <!-- Variables Color-Coded Definition Grid -->
              {#if dynamicFormulas[selectedFormulaIndex]?.formula.variables}
                <div class="flex flex-col gap-2 text-xs pt-1">
                  <h4 class="font-mono text-[#fe8019] font-bold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[13px]">palette</span>
                    關鍵變數符號語義字典
                  </h4>
                  <div class="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                    {#each dynamicFormulas[selectedFormulaIndex].formula.variables as v}
                      <div class="bg-[#282828] p-2 rounded flex items-center justify-between border border-[#3c3836]">
                        <span style="color: {v.color}">{@html renderMath(v.symbol, false)}</span>
                        <span class="text-[#d5c4a1]">{v.meaning}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- 2. Mathematical Proof & Step-by-Step Derivations -->
            <div class="bg-[#1d2021] border border-[#504945] p-5 rounded-xl flex flex-col gap-4 shadow-inner">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs text-[#8ec07c] font-bold flex items-center gap-1">
                  <span class="material-symbols-outlined text-[15px]">calculate</span>
                  分步嚴謹數學推導與證明 (Step-by-Step Proof)
                </span>
                <span class="font-mono text-[10px] text-[#a89984]">代數演繹與幾何證明</span>
              </div>

              <!-- Initial Assumptions -->
              {#if currentFormulaDerivation.assumptions && currentFormulaDerivation.assumptions.length > 0}
                <div class="flex flex-col gap-1.5 bg-[#282828]/60 p-3 rounded-lg border border-[#3c3836]">
                  <h4 class="font-mono text-[11px] font-bold text-[#fabd2f]">前置定義與統計假設 (Formulation & Assumptions)</h4>
                  <ul class="list-disc list-inside text-xs text-[#d5c4a1] space-y-1">
                    {#each currentFormulaDerivation.assumptions as assumption}
                      <li class="leading-relaxed">{@html renderMath(assumption, false)}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Steps List -->
              <div class="flex flex-col gap-3.5">
                {#each currentFormulaDerivation.steps as step}
                  <div class="bg-[#282828] border border-[#3c3836] rounded-lg p-3.5 flex flex-col gap-2 shadow-sm">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-xs font-bold text-[#fabd2f] flex items-center gap-1.5">
                        <span class="w-5 h-5 rounded-full bg-[#fe8019]/20 text-[#fe8019] text-[11px] flex items-center justify-center font-bold">
                          {step.stepNumber}
                        </span>
                        {step.title}
                      </span>
                    </div>

                    <!-- Step Equation via KaTeX -->
                    <div class="p-3 bg-[#1d2021] rounded border border-[#504945] font-mono text-[14px] flex justify-center overflow-x-auto text-[#ebdbb2] my-1">
                      {@html renderMath(step.latexFormula, true)}
                    </div>

                    <p class="text-xs text-[#d5c4a1] leading-relaxed text-justify">
                      {step.explanation}
                    </p>

                    {#if step.intuition}
                      <div class="text-[11px] text-[#8ec07c] bg-[#1d2021]/60 px-2.5 py-1.5 rounded border-l-2 border-[#8ec07c] leading-relaxed flex items-center gap-1">
                        <span>💡 <strong>直覺：</strong></span>
                        <span>{step.intuition}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <!-- 3. Boundary & Limit Analysis (極限定理與邊界條件) -->
              {#if currentFormulaDerivation.limitAnalysis && currentFormulaDerivation.limitAnalysis.length > 0}
                <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
                  <h4 class="font-mono text-xs font-bold text-[#fe8019] flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">query_stats</span>
                    極限分析與數值穩定性 (Boundary & Limit Analysis)
                  </h4>
                  <div class="grid grid-cols-1 gap-2">
                    {#each currentFormulaDerivation.limitAnalysis as limit}
                      <div class="bg-[#282828] border border-[#3c3836] p-3 rounded-lg flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                          <span class="font-mono text-xs text-[#fabd2f] font-semibold">
                            {@html renderMath(limit.condition, false)}
                          </span>
                          {#if limit.mathSnippet}
                            <span class="font-mono text-[11px] text-[#8ec07c]">
                              {@html renderMath(limit.mathSnippet, false)}
                            </span>
                          {/if}
                        </div>
                        <p class="text-xs text-[#d5c4a1] leading-relaxed">
                          {limit.consequence}
                        </p>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 4. Tensor Dimensional Propagation (張量維度拓撲演進) -->
              {#if currentFormulaDerivation.tensorShapes && currentFormulaDerivation.tensorShapes.length > 0}
                <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
                  <h4 class="font-mono text-xs font-bold text-[#83a598] flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">view_in_ar</span>
                    張量維度拓撲演進矩陣 (Tensor Dimensions)
                  </h4>
                  <div class="overflow-x-auto rounded-lg border border-[#3c3836]">
                    <table class="w-full text-left font-mono text-xs">
                      <thead class="bg-[#282828] text-[#fabd2f] border-b border-[#3c3836]">
                        <tr>
                          <th class="p-2">運算階段 / 節點</th>
                          <th class="p-2 text-[#8ec07c]">張量形狀 (Tensor Shape)</th>
                          <th class="p-2">維度物理意涵</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-[#3c3836] bg-[#1d2021]/50 text-[#d5c4a1]">
                        {#each currentFormulaDerivation.tensorShapes as ts}
                          <tr>
                            <td class="p-2 text-[#ebdbb2] font-semibold">{ts.stage}</td>
                            <td class="p-2 text-[#8ec07c]">{@html renderMath(ts.shape, false)}</td>
                            <td class="p-2 text-[11px]">{ts.description}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/if}

              <!-- 5. Physical Intuition Banner -->
              <div class="bg-[#32302f] border-l-4 border-[#fe8019] p-3 rounded-r-lg text-xs text-[#ebdbb2] leading-relaxed">
                <span class="font-bold text-[#fe8019]">🏛️ 科研物理與幾何本質直覺：</span>
                {currentFormulaDerivation.physicalIntuition}
              </div>
            </div>
          {/if}
        </div>

      {:else}
        <!-- Mode B: Interactive Derivation Scratchpad (CHECKLIST Item 8) -->
        <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <!-- Scratchpad Header & Quick Symbols -->
          <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-3 shadow-inner">
            <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[17px] text-[#fabd2f]">edit_note</span>
                <span class="font-mono text-xs text-[#fabd2f] font-bold">自訂 LaTeX 數學公式推導沙盒 (Interactive Derivation Scratchpad)</span>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#fe8019]/50 text-[#fe8019] px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                  on:click={handleVerifyScratchpad}
                  disabled={isVerifyingScratchpad}
                >
                  {#if isVerifyingScratchpad}
                    <span class="inline-block w-2.5 h-2.5 border-2 border-[#fe8019] border-t-transparent rounded-full animate-spin"></span>
                    <span>AI 審核中...</span>
                  {:else}
                    <span class="material-symbols-outlined text-[13px]">verified</span>
                    <span>⚡ AI 伴讀推導驗證</span>
                  {/if}
                </button>
                <button
                  class="font-mono text-[10px] bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                  on:click={handleCaptureScratchpadToNotes}
                >
                  <span class="material-symbols-outlined text-[13px]">save</span>
                  <span>收錄沙盒筆記</span>
                </button>
              </div>
            </div>

            <!-- Quick Symbol Buttons -->
            <div class="flex items-center gap-1.5 overflow-x-auto py-1">
              <span class="font-mono text-[10px] text-[#a89984] shrink-0">常用符號:</span>
              {#each [
                { label: '∑', insert: '\\sum_{i=1}^n ' },
                { label: '∏', insert: '\\prod_{i=1}^n ' },
                { label: 'a/b', insert: '\\frac{a}{b} ' },
                { label: '√', insert: '\\sqrt{d_k} ' },
                { label: 'softmax', insert: '\\mathrm{softmax}(z) ' },
                { label: 'W^O', insert: 'W^O ' },
                { label: 'E[X]', insert: '\\mathbb{E}[X] ' },
                { label: 'Var', insert: '\\mathrm{Var}(X) ' },
                { label: 'σ', insert: '\\sigma ' },
                { label: '∞', insert: '\\infty ' }
              ] as sym}
                <button
                  class="font-mono text-xs px-2 py-0.5 rounded bg-[#282828] hover:bg-[#32302f] text-[#d5c4a1] hover:text-[#fe8019] border border-[#3c3836] shrink-0"
                  on:click={() => insertSymbolToScratchpad(sym.insert)}
                >
                  {sym.label}
                </button>
              {/each}
            </div>

            <!-- LaTeX Textarea Input -->
            <div class="flex flex-col gap-1.5">
              <textarea
                bind:value={scratchpadLatex}
                rows="3"
                class="w-full bg-[#141617] border border-[#504945] rounded-lg p-3 font-mono text-xs text-[#ebdbb2] focus:outline-none focus:border-[#fe8019] transition-colors resize-y leading-relaxed"
                placeholder="在此輸入或修改 LaTeX 數學公式..."
              ></textarea>
            </div>

            <!-- Live KaTeX Realtime Math Preview -->
            <div class="bg-[#141617] border border-[#3c3836] p-4 rounded-lg flex flex-col items-center justify-center min-h-[70px] overflow-x-auto text-[#ebdbb2]">
              <span class="font-mono text-[9px] text-[#a89984] self-start mb-1">即時 KaTeX 渲染預覽:</span>
              <div class="text-[20px]">
                {@html renderMath(scratchpadLatex, true)}
              </div>
            </div>

            <!-- User Reasoning Notes -->
            <input
              type="text"
              bind:value={scratchpadNotes}
              class="w-full bg-[#141617] border border-[#3c3836] rounded px-3 py-1.5 text-xs text-[#d5c4a1] focus:outline-none focus:border-[#fabd2f]"
              placeholder="輸入此公式之推導說明或個人疑問..."
            />
          </div>

          <!-- Scratchpad Tool Tabs: Numerical Sanity vs Tensor Shapes vs AI Verdict -->
          <div class="flex items-center gap-2 border-b border-[#3c3836] pb-2">
            <button
              class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'numeric' ? 'bg-[#3c3836] text-[#fe8019] border border-[#fe8019]/40' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
              on:click={() => scratchpadTab = 'numeric'}
            >
              <span class="material-symbols-outlined text-[13px]">pin</span>
              <span>數值代入試算沙盒</span>
            </button>
            <button
              class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'tensors' ? 'bg-[#3c3836] text-[#fe8019] border border-[#fe8019]/40' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
              on:click={() => scratchpadTab = 'tensors'}
            >
              <span class="material-symbols-outlined text-[13px]">grid_view</span>
              <span>張量維度推演器</span>
            </button>
            {#if scratchpadAiResult}
              <button
                class="font-mono text-xs px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1 {scratchpadTab === 'ai-verify' ? 'bg-[#3c3836] text-[#8ec07c] border border-[#8ec07c]/40' : 'text-[#8ec07c] hover:text-[#ebdbb2]'}"
                on:click={() => scratchpadTab = 'ai-verify'}
              >
                <span class="material-symbols-outlined text-[13px]">psychology</span>
                <span>AI 導師審查講評</span>
              </button>
            {/if}
          </div>

          <!-- Tool Tab 1: Numerical Sanity Sandbox -->
          {#if scratchpadTab === 'numeric'}
            <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-4">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs font-bold text-[#fabd2f]">
                  點積縮放前後之 Softmax 飽和度數值試算
                </span>
                <span class="font-mono text-[10px] text-[#a89984]">代入不同維度與內積幅值觀察梯度變化</span>
              </div>

              <!-- Sliders & Inputs -->
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5 bg-[#282828] p-3 rounded-lg border border-[#3c3836]">
                  <div class="flex justify-between font-mono text-xs">
                    <span class="text-[#d5c4a1]">頭維度 d_k:</span>
                    <strong class="text-[#fe8019]">{scratchpadDk}</strong>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="512"
                    step="4"
                    bind:value={scratchpadDk}
                    class="accent-[#fe8019] cursor-pointer"
                  />
                  <span class="font-mono text-[10px] text-[#a89984]">縮放除數 √d_k = {sanityResult.sqrtDk}</span>
                </div>

                <div class="flex flex-col gap-1.5 bg-[#282828] p-3 rounded-lg border border-[#3c3836]">
                  <div class="flex justify-between font-mono text-xs">
                    <span class="text-[#d5c4a1]">未縮放點積 q · k:</span>
                    <strong class="text-[#fabd2f]">{scratchpadDotProduct}</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="64"
                    step="1"
                    bind:value={scratchpadDotProduct}
                    class="accent-[#fabd2f] cursor-pointer"
                  />
                  <span class="font-mono text-[10px] text-[#a89984]">縮放後數值 = {sanityResult.scaledValue}</span>
                </div>
              </div>

              <!-- Numerical Comparison Table -->
              <div class="grid grid-cols-2 gap-4 font-mono text-xs">
                <!-- Unscaled Column -->
                <div class="bg-[#282828] p-3.5 rounded-lg border border-[#fb4934]/40 flex flex-col gap-2">
                  <div class="flex items-center justify-between border-b border-[#3c3836] pb-1">
                    <span class="text-[#fb4934] font-bold">❌ 未除以 √d_k (原始點積)</span>
                    <span class="text-[10px] text-[#fb4934] bg-[#fb4934]/15 px-1.5 rounded">危險</span>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">進入 Softmax 數值:</span>
                    <strong class="text-[#ebdbb2]">{sanityResult.dotProduct}</strong>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">Softmax 競爭概率:</span>
                    <strong class="text-[#ebdbb2]">{(sanityResult.unscaledSigmoid * 100).toFixed(2)}%</strong>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">反向傳播梯度乘子:</span>
                    <strong class="{sanityResult.isSaturated ? 'text-[#fb4934]' : 'text-[#ebdbb2]'}">
                      {sanityResult.unscaledGradMultiplier}
                    </strong>
                  </div>
                  {#if sanityResult.isSaturated}
                    <div class="bg-[#fb4934]/15 border border-[#fb4934]/40 text-[#fb4934] p-2 rounded text-[10px] mt-1">
                      ⚠️ 嚴重梯度消失！數值過大迫使 Softmax 進入平坦區，導數趨近於 0。
                    </div>
                  {/if}
                </div>

                <!-- Scaled Column -->
                <div class="bg-[#282828] p-3.5 rounded-lg border border-[#b8bb26]/50 flex flex-col gap-2">
                  <div class="flex items-center justify-between border-b border-[#3c3836] pb-1">
                    <span class="text-[#b8bb26] font-bold">✅ 經除以 √d_k (方差歸一化)</span>
                    <span class="text-[10px] text-[#b8bb26] bg-[#b8bb26]/15 px-1.5 rounded">健康</span>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">進入 Softmax 數值:</span>
                    <strong class="text-[#ebdbb2]">{sanityResult.scaledValue}</strong>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">Softmax 競爭概率:</span>
                    <strong class="text-[#ebdbb2]">{(sanityResult.scaledSigmoid * 100).toFixed(2)}%</strong>
                  </div>
                  <div class="flex justify-between text-[11px]">
                    <span class="text-[#a89984]">反向傳播梯度乘子:</span>
                    <strong class="text-[#b8bb26]">{sanityResult.scaledGradMultiplier}</strong>
                  </div>
                  <div class="bg-[#b8bb26]/15 border border-[#b8bb26]/40 text-[#b8bb26] p-2 rounded text-[10px] mt-1">
                    ✨ 梯度活化充沛！數值約束在敏感區間，模型能穩定持續學習。
                  </div>
                </div>
              </div>
            </div>

          <!-- Tool Tab 2: Tensor Dimensional Propagator -->
          {:else if scratchpadTab === 'tensors'}
            <div class="bg-[#1d2021] border border-[#504945] p-4 rounded-xl flex flex-col gap-4">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs font-bold text-[#83a598]">
                  Transformer 全流程張量維度即時推演器
                </span>
                <span class="font-mono text-[10px] text-[#a89984]">調整超參數試算矩陣維度相容性</span>
              </div>

              <div class="grid grid-cols-4 gap-2 font-mono text-xs">
                <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
                  <span class="text-[#a89984] text-[10px]">Batch Size (B):</span>
                  <input type="number" bind:value={batchSize} min="1" max="64" class="bg-transparent text-[#fe8019] font-bold focus:outline-none" />
                </div>
                <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
                  <span class="text-[#a89984] text-[10px]">Seq Length (S):</span>
                  <input type="number" bind:value={seqLen} min="1" max="8192" class="bg-transparent text-[#fabd2f] font-bold focus:outline-none" />
                </div>
                <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
                  <span class="text-[#a89984] text-[10px]">d_model (D):</span>
                  <input type="number" bind:value={dModel} min="64" max="4096" step="64" class="bg-transparent text-[#8ec07c] font-bold focus:outline-none" />
                </div>
                <div class="bg-[#282828] p-2 rounded border border-[#3c3836] flex flex-col">
                  <span class="text-[#a89984] text-[10px]">Num Heads (H):</span>
                  <input type="number" bind:value={numHeads} min="1" max="64" class="bg-transparent text-[#83a598] font-bold focus:outline-none" />
                </div>
              </div>

              <!-- Generated Shape List -->
              <div class="flex flex-col gap-2 font-mono text-xs">
                {#each tensorShapeResults as ts}
                  <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded flex items-center justify-between">
                    <span class="text-[#ebdbb2] font-semibold">{ts.stage}</span>
                    <span class="text-[#8ec07c] bg-[#1d2021] px-2 py-0.5 rounded border border-[#504945]">{ts.shape}</span>
                    <span class="text-[#a89984] text-[10px] truncate max-w-[200px]">{ts.desc}</span>
                  </div>
                {/each}
              </div>
            </div>

          <!-- Tool Tab 3: AI Verification Output -->
          {:else if scratchpadAiResult}
            <div class="bg-[#1d2021] border border-[#8ec07c]/50 p-4 rounded-xl flex flex-col gap-3">
              <div class="flex items-center justify-between border-b border-[#3c3836] pb-2">
                <span class="font-mono text-xs font-bold text-[#8ec07c] flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[15px]">psychology</span>
                  {scratchpadAiResult.verdictTitle}
                </span>
                <span class="font-mono text-[10px] {scratchpadAiResult.isValid ? 'text-[#b8bb26]' : 'text-[#fb4934]'}">
                  {scratchpadAiResult.isValid ? '● 邏輯通過' : '▲ 需進一步修正'}
                </span>
              </div>

              <p class="text-xs text-[#d5c4a1] leading-relaxed">
                {scratchpadAiResult.critique}
              </p>

              {#if scratchpadAiResult.correctedLatex && scratchpadAiResult.correctedLatex !== scratchpadLatex}
                <div class="bg-[#282828] p-3 rounded border border-[#3c3836] flex flex-col gap-1.5">
                  <span class="font-mono text-[10px] text-[#fabd2f]">導師推薦嚴謹寫法：</span>
                  <div class="text-[16px] text-[#ebdbb2] flex justify-center py-2">
                    {@html renderMath(scratchpadAiResult.correctedLatex, true)}
                  </div>
                </div>
              {/if}

              {#if scratchpadAiResult.stepSuggestions && scratchpadAiResult.stepSuggestions.length > 0}
                <div class="flex flex-col gap-1">
                  <span class="font-mono text-[10px] text-[#fe8019] font-bold">後續推導演進建議：</span>
                  <ul class="list-disc list-inside text-[11px] text-[#d5c4a1] space-y-1">
                    {#each scratchpadAiResult.stepSuggestions as sug}
                      <li>{sug}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- Fullscreen Image Lightbox Modal -->
{#if isFigureLightboxOpen}
  <div
    class="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-md"
    on:click={closeLightbox}
  >
    <div class="w-full max-w-5xl flex items-center justify-between pb-3 text-[#ebdbb2]">
      <span class="font-mono text-sm font-bold text-[#fabd2f]">{lightboxTitle}</span>
      <button
        class="text-[#a89984] hover:text-[#fe8019] flex items-center gap-1 font-mono text-xs bg-[#282828] px-3 py-1 rounded border border-[#3c3836]"
        on:click={closeLightbox}
      >
        <span>關閉 (ESC)</span>
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
    <div class="max-w-5xl max-h-[85vh] overflow-auto flex items-center justify-center" on:click|stopPropagation>
      <img
        src={lightboxImageUrl}
        alt={lightboxTitle}
        class="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl border border-[#3c3836]"
      />
    </div>
  </div>
{/if}
