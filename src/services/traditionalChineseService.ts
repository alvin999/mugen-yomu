import * as OpenCC from 'opencc-js';
import type { PaperDocument, ChapterSection, FigureItem } from '../types/document';

// 建立全域單例轉換器 (簡體 -> 台灣繁體 + 詞彙轉換 s2twp)
let converterTw: ((text: string) => string) | null = null;

export function getTaiwanConverter(): (text: string) => string {
  if (!converterTw) {
    try {
      converterTw = OpenCC.Converter({ from: 'cn', to: 'twp' });
    } catch (e) {
      console.warn('OpenCC 初始化警告，使用備用轉換器:', e);
      converterTw = (t: string) => t;
    }
  }
  return converterTw;
}

/**
 * 將字串轉換為台灣正體/繁體中文（自動對齊台灣標準學術與資訊技術術語）
 */
export function toTraditionalTaiwan(text: string): string {
  if (!text) return '';
  const cvt = getTaiwanConverter();
  return cvt(text);
}

/**
 * 智慧轉換段落文字：
 * 若為 Markdown 程式碼區塊 (```lang ... ```)，僅轉換註解或保持程式碼本體不變，避免破壞程式語意
 */
export function convertParagraphToTaiwan(paragraph: string): string {
  if (!paragraph) return '';
  if (paragraph.startsWith('```') && paragraph.endsWith('```')) {
    // 程式碼區塊：分離第一行與程式碼本體
    const firstNewline = paragraph.indexOf('\n');
    if (firstNewline === -1) return paragraph;
    const header = paragraph.slice(0, firstNewline);
    const codeBody = paragraph.slice(firstNewline + 1, -3);
    
    // 程式碼內的單行與多行註解可做安全轉換
    const convertedCode = codeBody.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, (match) => {
      return toTraditionalTaiwan(match);
    });

    return `${header}\n${convertedCode}\`\`\``;
  }

  return toTraditionalTaiwan(paragraph);
}

/**
 * 將整份 PaperDocument 深度轉換為台灣正體/繁體中文
 */
export function convertDocumentToTraditional(doc: PaperDocument): PaperDocument {
  const convertedTitle = toTraditionalTaiwan(doc.title);
  const convertedAuthors = doc.authors?.map(a => toTraditionalTaiwan(a)) || [];
  const convertedVenue = doc.venue ? toTraditionalTaiwan(doc.venue) : doc.venue;

  // 摘要轉換
  const convertedAbstract = {
    english: doc.abstract?.english || '',
    chineseSummary: doc.abstract?.chineseSummary ? toTraditionalTaiwan(doc.abstract.chineseSummary) : ''
  };

  // 圖表清單轉換
  const convertedFigures: FigureItem[] = (doc.figureList || []).map(fig => ({
    ...fig,
    name: toTraditionalTaiwan(fig.name),
    caption: toTraditionalTaiwan(fig.caption)
  }));

  // 各章節與段落轉換
  const convertedSections: ChapterSection[] = doc.sections.map(sec => {
    const updatedSecFigures = (sec.figures || []).map(fig => ({
      ...fig,
      name: toTraditionalTaiwan(fig.name),
      caption: toTraditionalTaiwan(fig.caption)
    }));

    return {
      ...sec,
      title: toTraditionalTaiwan(sec.title),
      paragraphs: sec.paragraphs.map(p => convertParagraphToTaiwan(p)),
      figures: updatedSecFigures
    };
  });

  // 伴讀數據轉換 (若已有)
  const convertedCompanion: Record<string, any> = {};
  if (doc.companionData) {
    for (const [secId, comp] of Object.entries(doc.companionData)) {
      convertedCompanion[secId] = {
        ...comp,
        intuition: comp.intuition ? {
          title: toTraditionalTaiwan(comp.intuition.title),
          tag: toTraditionalTaiwan(comp.intuition.tag),
          content: comp.intuition.content?.map((c: string) => toTraditionalTaiwan(c)) || []
        } : undefined,
        terminology: comp.terminology ? comp.terminology.map((t: any) => ({
          ...t,
          explanation: toTraditionalTaiwan(t.explanation),
          zh: t.zh ? toTraditionalTaiwan(t.zh) : undefined
        })) : undefined,
        socraticQuestions: comp.socraticQuestions ? comp.socraticQuestions.map((q: any) => ({
          ...q,
          text: toTraditionalTaiwan(q.text),
          answerSummary: toTraditionalTaiwan(q.answerSummary)
        })) : undefined
      };
    }
  }

  return {
    ...doc,
    title: convertedTitle,
    authors: convertedAuthors,
    venue: convertedVenue,
    abstract: convertedAbstract,
    sections: convertedSections,
    figureList: convertedFigures.length > 0 ? convertedFigures : undefined,
    companionData: convertedCompanion
  };
}
