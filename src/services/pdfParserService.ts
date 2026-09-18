// In-Browser Offline PDF Parser for MUGEN YOMU
// 100% Client-side parsing using Mozilla PDF.js (Zero-Server Privacy Guarantee)

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PaperDocument, ChapterSection, SectionCompanionData } from '../stores/documentStore';
import { cleanPaperText, cleanParagraphs } from '../utils/paperTextSanitizer';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ExtractedLine {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  page: number;
}

export interface RawSection {
  id: string;
  title: string;
  level: number;
  page: number;
  paragraphs: string[];
  rawLines?: ExtractedLine[];
}

export interface ParseProgressCallback {
  (percent: number, stepText: string): void;
}

/**
 * 清理並標準化文字（消除斷詞連字號、修復連字字形分離並清理多餘空白）
 */
function cleanText(text: string): string {
  return cleanPaperText(text, { unwrapLines: false });
}

/**
 * 檢查是否為學術標頭/大綱候選字串
 */
function detectHeadingLevel(text: string, fontSize: number, bodyFontSize: number): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 90) return null;

  // 1. 特殊學術章節關鍵字 (不帶數字)
  const isKeywordSection = /^(abstract|introduction|background|related work|methodology|methods|experiments|experimental results|results and discussion|discussion|conclusion|conclusions|references|acknowledgments|appendix)\b/i.test(trimmed);
  if (isKeywordSection && (fontSize >= bodyFontSize * 1.08 || trimmed.length < 35)) {
    return 1;
  }

  // 2. 羅馬數字或阿拉伯數字主章節 (如 "1. Introduction", "1 Introduction", "I. INTRODUCTION")
  if (/^(?:[0-9]{1,2}|[IVXLCDM]{1,6})\.?\s+[A-Z][A-Za-z0-9\s,\-:–—]{2,60}$/.test(trimmed)) {
    return 1;
  }

  // 3. 次級章節 (如 "1.1 Model Architecture", "3.2 Attention")
  if (/^[0-9]{1,2}\.[0-9]{1,2}\.?\s+[A-Z][A-Za-z0-9\s,\-:–—]{2,60}$/.test(trimmed)) {
    return 2;
  }

  // 4. 三級章節 (如 "3.2.1 Scaled Dot-Product Attention")
  if (/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}\.?\s+[A-Z][A-Za-z0-9\s,\-:–—]{2,60}$/.test(trimmed)) {
    return 3;
  }

  // 5. 字體顯著偏大 (大於內文字體 1.25 倍) 且短行
  if (fontSize >= bodyFontSize * 1.25 && trimmed.length <= 50 && !/[.,;:!?]$/.test(trimmed)) {
    return 1;
  }

  return null;
}

/**
 * 遞迴展開 PDF 原生書籤目錄 (Bookmarks / Outlines)
 */
async function extractPdfOutlines(
  pdfDoc: pdfjsLib.PDFDocumentProxy
): Promise<Array<{ title: string; page: number; level: number }>> {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || outline.length === 0) return [];

    const results: Array<{ title: string; page: number; level: number }> = [];

    async function traverse(items: any[], currentLevel: number) {
      for (const item of items) {
        let targetPage = 1;
        if (item.dest) {
          try {
            let destRef = item.dest;
            if (typeof destRef === 'string') {
              const explicitDest = await pdfDoc.getDestination(destRef);
              if (explicitDest && explicitDest[0]) {
                targetPage = (await pdfDoc.getPageIndex(explicitDest[0])) + 1;
              }
            } else if (Array.isArray(destRef) && destRef[0]) {
              targetPage = (await pdfDoc.getPageIndex(destRef[0])) + 1;
            }
          } catch {
            targetPage = 1;
          }
        }

        const cleanTitle = cleanText(item.title || '');
        if (cleanTitle) {
          results.push({
            title: cleanTitle,
            page: Math.max(1, targetPage),
            level: Math.min(3, currentLevel)
          });
        }

        if (item.items && item.items.length > 0) {
          await traverse(item.items, currentLevel + 1);
        }
      }
    }

    await traverse(outline, 1);
    return results;
  } catch (err) {
    console.warn('讀取 PDF 書籤大綱失敗:', err);
    return [];
  }
}

/**
 * 單頁版面分析與排版還原（支援雙欄學術論文版面自動感應）
 */
function extractPageLines(
  textContent: any,
  viewport: any,
  pageNum: number
): ExtractedLine[] {
  const items = (textContent.items || []).filter(
    (it: any) => it && typeof it.str === 'string' && it.str.trim().length > 0
  );
  if (items.length === 0) return [];

  const width = viewport.width;
  const height = viewport.height;

  // 1. 濾除頁首 (頂部 6.5%) 與頁尾 (底部 6.5%)
  const topCutoff = height * 0.935;
  const bottomCutoff = height * 0.065;

  const validItems = items.filter((it: any) => {
    const y = it.transform[5];
    return y >= bottomCutoff && y <= topCutoff;
  });

  // 2. 雙欄學術版面檢測
  // 若中間區域 (0.46 * width ~ 0.54 * width) 很少文字跨越，且兩邊皆有大量文字，視為雙欄排版
  let leftItemsCount = 0;
  let rightItemsCount = 0;
  let crossCenterCount = 0;
  const centerLeft = width * 0.46;
  const centerRight = width * 0.54;

  for (const it of validItems) {
    const x = it.transform[4];
    const w = it.width || 0;
    if (x + w < centerLeft) {
      leftItemsCount++;
    } else if (x > centerRight) {
      rightItemsCount++;
    } else {
      crossCenterCount++;
    }
  }

  const isTwoColumn =
    leftItemsCount >= 8 &&
    rightItemsCount >= 8 &&
    crossCenterCount < (leftItemsCount + rightItemsCount) * 0.15;

  // 3. 排序策略
  const sortedItems = [...validItems].sort((a: any, b: any) => {
    const ax = a.transform[4];
    const ay = a.transform[5];
    const bx = b.transform[4];
    const by = b.transform[5];

    if (isTwoColumn) {
      const aCol = ax + (a.width || 0) / 2 < width * 0.5 ? 0 : 1;
      const bCol = bx + (b.width || 0) / 2 < width * 0.5 ? 0 : 1;
      if (aCol !== bCol) return aCol - bCol; // 先左欄再右欄
    }

    // 同欄內由上至下 (PDF Y 軸從下往上，故 ay 較大表示在上方)
    if (Math.abs(ay - by) > 3) {
      return by - ay;
    }
    // 同行內由左至右
    return ax - bx;
  });

  // 4. 將同一行內的 text items 拼接為完整 Line
  const lines: ExtractedLine[] = [];
  let currentLine: ExtractedLine | null = null;

  for (const it of sortedItems) {
    const x = it.transform[4];
    const y = it.transform[5];
    const w = it.width || 0;
    const fontSize = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || it.height || 10;
    const str = it.str;

    if (!currentLine || Math.abs(currentLine.y - y) > 3.2) {
      if (currentLine) {
        currentLine.text = cleanText(currentLine.text);
        if (currentLine.text.length > 0) lines.push(currentLine);
      }
      currentLine = {
        text: str,
        x,
        y,
        width: w,
        fontSize,
        page: pageNum
      };
    } else {
      // 在同一行內，根據水平間距決定是否補空格
      const prevRight = currentLine.x + currentLine.width;
      const gap = x - prevRight;
      const needsSpace =
        gap > 1.8 &&
        !currentLine.text.endsWith(' ') &&
        !str.startsWith(' ') &&
        !currentLine.text.endsWith('-') &&
        !currentLine.text.endsWith('/');

      currentLine.text += (needsSpace ? ' ' : '') + str;
      currentLine.width = x + w - currentLine.x;
      currentLine.fontSize = Math.max(currentLine.fontSize, fontSize);
    }
  }

  if (currentLine) {
    currentLine.text = cleanText(currentLine.text);
    if (currentLine.text.length > 0) lines.push(currentLine);
  }

  return lines;
}

/**
 * 智慧去斷字（De-hyphenation）與段落重構
 */
function reconstructParagraphsFromLines(lines: ExtractedLine[]): {
  paragraphs: string[];
  lineCount: number;
} {
  if (lines.length === 0) return { paragraphs: [], lineCount: 0 };

  const paragraphs: string[] = [];
  let currentPara = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    const nextLine = lines[i + 1];

    if (currentPara.endsWith('-')) {
      // 前一行結尾為連字號，直接緊密接合本行文字（保留連字號交由 cleanText 進行智慧詞庫分析）
      currentPara = `${currentPara}${text}`;
    } else {
      currentPara = currentPara ? `${currentPara} ${text}` : text;
    }

    // 段落終止條件判定：
    // 1. 本行以句點/問號/驚嘆號/冒號結尾
    // 2. 下一行垂直距離明顯大於一般行距 (例如行距 > 1.6 倍字體大小) 或跨頁
    // 3. 本節已無後續行
    const isPunctuationEnd = /[.!?:]\s*$/.test(text);
    const hasNext = Boolean(nextLine);
    const isDiffPage = hasNext && nextLine.page !== line.page;
    const nextYGap = hasNext && !isDiffPage ? Math.abs(line.y - nextLine.y) : 0;
    const isLargeGap = isDiffPage || nextYGap > line.fontSize * 1.6;

    if (!hasNext || isLargeGap || (isPunctuationEnd && text.length > 35 && nextYGap > line.fontSize * 1.3)) {
      const cleanPara = cleanText(currentPara);
      if (cleanPara.length > 0) {
        paragraphs.push(cleanPara);
      }
      currentPara = '';
    }
  }

  if (currentPara.trim().length > 0) {
    const cleanPara = cleanText(currentPara);
    if (cleanPara.length > 0) {
      paragraphs.push(cleanPara);
    }
  }

  return { paragraphs, lineCount: lines.length };
}

/**
 * 純前端核心解析主函式：接收本機 PDF File 或 ArrayBuffer，解析為完整的 PaperDocument 物件
 */
export async function parsePdfToDocument(
  source: File | ArrayBuffer,
  fileName?: string,
  onProgress?: ParseProgressCallback
): Promise<PaperDocument> {
  const reportProgress = (pct: number, msg: string) => {
    if (onProgress) onProgress(pct, msg);
  };

  reportProgress(5, '正在讀取本機 PDF 檔案二進制流...');

  let arrayBuffer: ArrayBuffer;
  let localBlobUrl: string | undefined;
  let targetName = fileName || '本機 PDF 文獻';

  if (source instanceof File) {
    targetName = source.name.replace(/\.[^/.]+$/, '');
    arrayBuffer = await source.arrayBuffer();
    localBlobUrl = URL.createObjectURL(source);
  } else {
    arrayBuffer = source;
  }

  reportProgress(15, '正在啟動純前端 PDF.js 解析引擎...');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  reportProgress(25, `成功載入 PDF，共 ${numPages} 頁。正在讀取文件大綱與元數據...`);

  // 1. 取得文件 Metadata
  let docTitle = targetName;
  let docAuthors: string[] = ['本機上傳文獻作者'];

  try {
    const meta = await pdfDoc.getMetadata();
    const info = meta?.info as any;
    if (info?.Title && cleanText(info.Title).length > 4 && !info.Title.toLowerCase().endsWith('.pdf')) {
      docTitle = cleanText(info.Title);
    }
    if (info?.Author && cleanText(info.Author).length > 2) {
      docAuthors = cleanText(info.Author).split(/[,;]/).map(a => a.trim()).filter(Boolean);
    }
  } catch (err) {
    console.warn('讀取 PDF 元數據失敗:', err);
  }

  // 2. 取得官方大綱目錄 (Bookmarks)
  reportProgress(35, '正在分析 PDF 階層書籤目錄...');
  const outlineItems = await extractPdfOutlines(pdfDoc);

  // 3. 逐頁提取排版文字與計算基準字體大小
  reportProgress(45, '正在逐頁掃描文字排版、雙欄結構與消除頁首頁尾...');
  const allPageLines: ExtractedLine[][] = [];
  const fontSizes: number[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const pageLines = extractPageLines(textContent, viewport, p);
    allPageLines.push(pageLines);

    for (const line of pageLines) {
      fontSizes.push(line.fontSize);
    }

    if (p % 2 === 0 || p === numPages) {
      const stepPct = 45 + Math.round((p / numPages) * 30);
      reportProgress(stepPct, `正在提取第 ${p} / ${numPages} 頁文字與雙欄重排...`);
    }
  }

  // 計算平均/中位數內文字號
  fontSizes.sort((a, b) => a - b);
  const bodyFontSize = fontSizes.length > 0 ? fontSizes[Math.floor(fontSizes.length * 0.5)] : 10;

  // 4. 若 Metadata 中標題仍為預設，嘗試在第一頁尋找字體最大的短行作為論文標題
  if (docTitle === targetName && allPageLines[0] && allPageLines[0].length > 0) {
    const firstPageLines = allPageLines[0].slice(0, 8); // 僅看第一頁上半部
    let maxFontLine: ExtractedLine | null = null;

    for (const l of firstPageLines) {
      if (l.text.length >= 8 && l.text.length <= 120) {
        if (!maxFontLine || l.fontSize > maxFontLine.fontSize) {
          maxFontLine = l;
        }
      }
    }

    if (maxFontLine && maxFontLine.fontSize >= bodyFontSize * 1.3) {
      docTitle = cleanText(maxFontLine.text);
    }
  }

  reportProgress(80, '正在依據語意章節大綱進行段落切割與 SVO 結構初始化...');

  // 5. 章節劃分策略：
  // 策略 A：若有官方書籤目錄 (Outline >= 2 個)，依據書籤頁碼與標題切分
  // 策略 B：若無書籤，由第一頁至最後一頁掃描 Heading Pattern 與大字號短行切分
  const rawSections: RawSection[] = [];
  let currentSec: RawSection | null = null;
  let sectionIndex = 1;
  const flatLines = allPageLines.flat();

  for (let i = 0; i < flatLines.length; i++) {
    const line = flatLines[i];
    const headingLevel = detectHeadingLevel(line.text, line.fontSize, bodyFontSize);

    if (headingLevel !== null) {
      const secId = String(sectionIndex++);
      currentSec = {
        id: secId,
        title: line.text,
        level: headingLevel,
        page: line.page,
        paragraphs: [],
        rawLines: []
      };
      rawSections.push(currentSec);
    } else {
      if (!currentSec) {
        // 第一個章節前的文字，視為前言或 Abstract
        currentSec = {
          id: String(sectionIndex++),
          title: 'Abstract & Overview',
          level: 1,
          page: 1,
          paragraphs: [],
          rawLines: []
        };
        rawSections.push(currentSec);
      }
      if (!currentSec.rawLines) currentSec.rawLines = [];
      currentSec.rawLines.push(line);
      currentSec.paragraphs.push(line.text);
    }
  }

  // 若依 Heading 劃分章節過少 (少於 2 個)，則改以頁面分區備援
  if (rawSections.length <= 1 && numPages > 1) {
    rawSections.length = 0;
    for (let p = 1; p <= numPages; p++) {
      const pageLines = allPageLines[p - 1] || [];
      const { paragraphs } = reconstructParagraphsFromLines(pageLines);
      if (paragraphs.length > 0) {
        rawSections.push({
          id: String(p),
          title: p === 1 ? '1. Abstract & Introduction' : `Section ${p} (Page ${p})`,
          level: 1,
          page: p,
          paragraphs
        });
      }
    }
  } else {
    // 將每個章節中的散亂行依據真實版面垂直座標重組為語意段落
    for (const sec of rawSections) {
      if (sec.rawLines && sec.rawLines.length > 0) {
        const { paragraphs } = reconstructParagraphsFromLines(sec.rawLines);
        sec.paragraphs = paragraphs;
      } else {
        sec.paragraphs = cleanParagraphs(sec.paragraphs);
      }
    }
  }

  // 6. 提取或構造 Abstract
  let abstractEnglish = '';
  const abstractSec = rawSections.find(s => /abstract/i.test(s.title));
  if (abstractSec && abstractSec.paragraphs.length > 0) {
    abstractEnglish = abstractSec.paragraphs.join(' ');
  } else if (rawSections[0] && rawSections[0].paragraphs.length > 0) {
    abstractEnglish = rawSections[0].paragraphs.slice(0, 2).join(' ');
  } else {
    abstractEnglish = '本篇文獻已由 MUGEN YOMU 本機離線 PDF 引擎自動提取章節大綱與雙語對照排版。';
  }

  reportProgress(92, '正在封裝 MUGEN YOMU 學術文獻結構與本機對照連結...');

  // 7. 轉換為標準 ChapterSection 階層
  const finalSections: ChapterSection[] = rawSections.map((raw, idx) => ({
    id: raw.id,
    title: raw.title,
    level: raw.level,
    page: raw.page,
    progress: 0,
    isRead: false,
    paragraphs: raw.paragraphs.length > 0 ? raw.paragraphs : ['本節無純文字內容或為純圖表頁面。']
  }));

  // 8. 構造 AI 伴讀預設資訊庫
  const companionData: Record<string, SectionCompanionData> = {};
  for (const sec of finalSections) {
    companionData[sec.id] = {
      intuition: {
        title: `關於「${sec.title}」的核心探討`,
        tag: '待 AI 解析',
        content: [
          '本論文為本機直接離線解析之文獻。點擊上方「白話科研直覺」或伴讀區，即可利用您設定的 AI 金鑰或本地 Ollama 模型進行深入的科學直覺推導。'
        ]
      },
      terminology: [
        {
          term: sec.title.replace(/^[0-9.]+\s*/, '').split(' ')[0] || 'Term',
          explanation: '點擊伴讀卡片或段落下方「學術術語對齊」，由 AI 自動萃取本節專有名詞對照字典',
          color: '#fabd2f'
        }
      ],
      socraticQuestions: [
        {
          id: `q_${sec.id}_1`,
          icon: 'help_outline',
          color: 'text-[#fe8019]',
          text: `作者在「${sec.title}」這部分的主要核心論點是什麼？`,
          answerSummary: '本章節旨在確立該主題之理論立論基礎，並排除先前研究之潛在干擾變數。'
        }
      ]
    };
  }

  const generatedId = `local_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const document: PaperDocument = {
    id: generatedId,
    type: 'paper',
    title: docTitle,
    sourceUrl: `local://${targetName}.pdf`,
    pdfUrl: localBlobUrl,
    authors: docAuthors,
    venue: 'Local Offline PDF Archive',
    readingSpeedWpm: 240,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: abstractEnglish.slice(0, 900),
      chineseSummary: '' // 預設留空，等待使用者按需點擊生成，節省免費配額
    },
    sections: finalSections,
    companionData
  };

  reportProgress(100, `解析完成！共識別 ${finalSections.length} 個章節、${numPages} 頁。`);

  return document;
}
