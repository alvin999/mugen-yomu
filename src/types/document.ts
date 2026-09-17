import type { CitationGraphData } from '../services/citationService';

export interface ChapterSection {
  id: string;
  title: string;
  level: number; // 1: H1/Section, 2: H2/Subsection, 3: H3/Sub-subsection
  page?: number; // 原檔 PDF 對應頁碼 (1-indexed)
  progress: number;
  isRead: boolean;
  paragraphs: string[];
  readParaIndices?: number[]; // 已研讀之小段落索引集合
  svoSentence?: {
    sentence: string;
    svoBadge: string;
    subjectVerbObject: { title: string; en: string; zh: string };
    modifier: { title: string; en: string; zh: string };
    purpose: { title: string; en: string; zh: string };
  };
  formulas?: FormulaItem[];
  figures?: FigureItem[];
  children?: ChapterSection[];
}

export interface FormulaItem {
  id: string;
  number: string;
  name: string;
  latexText: string;
  page?: string;
  variables: { symbol: string; meaning: string; color: string }[];
  sectionId?: string;
  sectionTitle?: string;
  sourceContextSnippet?: string;
}

export interface FigureItem {
  id: string;
  name: string;
  caption: string;
  figureNumber?: string;
  imageUrl?: string;
  svgType?: 'transformer' | 'resnet' | 'circuit';
}

export interface SectionCompanionData {
  intuition: {
    title: string;
    tag: string;
    content: string[];
  };
  syntaxTree?: {
    line: string;
    snippet: string;
    svo: { role: string; text: string; zh: string; color: string }[];
  };
  terminology: { term: string; zh?: string; explanation: string; color: string }[];
  socraticQuestions: { id: string; text: string; icon: string; color: string; answerSummary: string }[];
}

export interface PaperDocument {
  id: string;
  type: 'paper' | 'web';
  title: string;
  sourceUrl?: string;
  pdfUrl?: string; // 官方原始 PDF 連結或本機 Blob URL
  authors: string[];
  venue: string;
  arxivId?: string;
  doi?: string;
  citations?: string;
  readingSpeedWpm?: number;
  depthLevel?: string;
  abstract: {
    english: string;
    chineseSummary: string;
  };
  sections: ChapterSection[];
  companionData: Record<string, SectionCompanionData>;
  figureList?: FigureItem[];
  citationGraph?: CitationGraphData;
}
