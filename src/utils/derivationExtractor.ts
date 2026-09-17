import type { PaperDocument, FigureItem, FormulaItem, ChapterSection } from '../types/document';

export interface ExtractedFigureItem {
  figure: FigureItem;
  sectionId?: string;
  sectionTitle?: string;
}

export interface ExtractedFormulaItem {
  formula: FormulaItem;
  sectionId?: string;
  sectionTitle?: string;
}

/**
 * 動態萃取當前文獻的所有圖表 (支援精準去重、章節歸屬與編號歸納)
 */
export function extractDynamicFigures(paper: PaperDocument | null, allSections: ChapterSection[]): ExtractedFigureItem[] {
  const list: ExtractedFigureItem[] = [];
  const seenFigures = new Set<string>();

  const addFig = (fig: FigureItem, secId?: string, secTitle?: string) => {
    if (!fig) return;
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
}

/**
 * 動態萃取當前文獻的所有公式並記錄出處 (Provenance Tracking)
 */
export function extractDynamicFormulas(paper: PaperDocument | null, allSections: ChapterSection[]): ExtractedFormulaItem[] {
  const list: ExtractedFormulaItem[] = [];
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
}
