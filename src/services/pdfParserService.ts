// In-Browser Offline PDF Parser for MUGEN YOMU
// 100% Client-side parsing using Mozilla PDF.js (Zero-Server Privacy Guarantee)

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PaperDocument, ChapterSection, SectionCompanionData } from '../stores/documentStore';
import { cleanPaperText } from '../utils/paperTextSanitizer';
import { saveLocalPdfBinary } from './pdfStorageService';

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
}

export interface ParseProgressCallback {
  (percent: number, stepText: string): void;
}

/**
 * 清理並標準化文字
 */
function cleanText(text: string): string {
  return cleanPaperText(text, { unwrapLines: false });
}

/**
 * 檢查是否為學術章節大綱候選字串
 */
function detectHeadingLevel(text: string, fontSize: number, bodyFontSize: number): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 70) return null;

  // 排除條列式說明句子 (帶句號、逗點、動詞句型、步驟說明)
  // 例如 "4. Once all the replicas have acknowledged..." 或 "6. The secondaries all reply..."
  if (/[.!?]$/.test(trimmed)) return null;
  if (/^[0-9]{1,2}\.\s+(?:Once|Then|After|Before|When|If|While|First|Second|Finally|Each|All|The\s+[a-z]+)\b/i.test(trimmed)) {
    return null;
  }
  if (/^(?:Figure|Fig\.|Table|Algorithm)\s+[0-9]+/i.test(trimmed)) return null;

  // 1. 常見學術章節關鍵字 (不帶數字)
  const isKeywordSection = /^(abstract|introduction|background|related work|methodology|methods|system overview|design overview|design|architecture|implementation|experiments|experimental results|evaluation|results and discussion|discussion|conclusion|conclusions|references|acknowledgments|acknowledgements|appendix)\b/i.test(trimmed);
  if (isKeywordSection && (fontSize >= bodyFontSize * 1.04 || trimmed.length < 35)) {
    return 1;
  }

  // 2. 羅馬數字或阿拉伯數字主章節 (如 "1. Introduction", "1 INTRODUCTION", "3. SYSTEM INTERACTIONS")
  const isNumberedMain = /^(?:[0-9]{1,2}|[IVXLCDM]{1,6})\.?\s+[A-Z][A-Za-z0-9\s,\-:—]{2,50}$/.test(trimmed);
  if (isNumberedMain) {
    const isAllUpper = /^(?:[0-9]{1,2}|[IVXLCDM]{1,6})\.?\s+[A-Z0-9\s,\-:—]+$/.test(trimmed);
    if (fontSize >= bodyFontSize * 1.04 || isAllUpper) {
      return 1;
    }
  }

  // 3. 次級章節 (如 "1.1 Model Architecture", "3.2 Attention", "2.7 Consistency Model")
  if (/^[0-9]{1,2}\.[0-9]{1,2}\.?\s+[A-Z][A-Za-z0-9\s,\-:—]{2,50}$/.test(trimmed)) {
    if (fontSize >= bodyFontSize * 0.98 && !trimmed.includes(',') && trimmed.length < 45) {
      return 2;
    }
  }

  // 4. 三級章節 (如 "3.2.1 Scaled Dot-Product Attention", "2.7.1 Guarantees by GFS")
  if (/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}\.?\s+[A-Z][A-Za-z0-9\s,\-:—]{2,50}$/.test(trimmed)) {
    if (fontSize >= bodyFontSize * 0.98 && !trimmed.includes(',') && trimmed.length < 50) {
      return 3;
    }
  }

  // 5. 字號顯著較大 (大於內文字號 1.28 倍) 且短行 (排除作者、機構等)
  if (fontSize >= bodyFontSize * 1.28 && trimmed.length <= 40 && !/[.,;:!?]$/.test(trimmed)) {
    if (!/^(university|department|laboratory|institute|google|microsoft|amazon|facebook|apple|inc\.|ltd\.|http|www|copyright|all rights)/i.test(trimmed)) {
      return 1;
    }
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
    const outline = await Promise.race([
      pdfDoc.getOutline(),
      new Promise<null>((r) => setTimeout(() => r(null), 1200))
    ]);
    if (!outline || outline.length === 0) return [];

    const results: Array<{ title: string; page: number; level: number }> = [];

    async function traverse(items: any[], currentLevel: number) {
      for (const item of items) {
        if (results.length >= 60) break;
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

  // 1. 濾除頁首 (頂部 6%) 與頁尾 (底部 6%)
  const topCutoff = height * 0.94;
  const bottomCutoff = height * 0.06;

  const validItems = items.filter((it: any) => {
    const y = it.transform ? it.transform[5] : 0;
    return y >= bottomCutoff && y <= topCutoff;
  });

  // 2. 雙欄學術版面檢測
  let leftItemsCount = 0;
  let rightItemsCount = 0;
  const midX = width * 0.5;

  for (const it of validItems) {
    const x = it.transform ? it.transform[4] : 0;
    const w = it.width || 0;
    const cx = x + w / 2;
    if (w < width * 0.6) {
      if (cx < midX) leftItemsCount++;
      else rightItemsCount++;
    }
  }

  // 只要左右兩側皆有持續文字流 (>= 6 個項目)，代表此頁主體為雙欄架構
  const isTwoColumn = leftItemsCount >= 6 && rightItemsCount >= 6;

  // 3. 排序策略
  const sortedItems = [...validItems].sort((a: any, b: any) => {
    const ax = a.transform ? a.transform[4] : 0;
    const ay = a.transform ? a.transform[5] : 0;
    const aw = a.width || 0;
    const bx = b.transform ? b.transform[4] : 0;
    const by = b.transform ? b.transform[5] : 0;
    const bw = b.width || 0;

    if (isTwoColumn) {
      const aIsFull = aw >= width * 0.65;
      const bIsFull = bw >= width * 0.65;

      // 欄內文字：左欄優先，右欄其後，絕不交錯跳動
      if (!aIsFull && !bIsFull) {
        const aCol = (ax + aw / 2 < midX) ? 0 : 1;
        const bCol = (bx + bw / 2 < midX) ? 0 : 1;
        if (aCol !== bCol) return aCol - bCol;
      } else if (aIsFull !== bIsFull) {
        // 全寬跨欄物件 (如標題或寬圖) 與一般欄位：若 Y 座標落差明顯，依 Y 由上而下排列
        if (Math.abs(ay - by) > 18) {
          return by - ay;
        }
      }
    }

    // 由上至下 (PDF Y 軸由下往上，故 ay 較大表示靠上)
    if (Math.abs(ay - by) > 3.2) {
      return by - ay;
    }
    // 同一行由左至右
    return ax - bx;
  });

  // 4. 將同一行內的 text items 接合為完整 Line
  const lines: ExtractedLine[] = [];
  let currentLine: (ExtractedLine & { col?: number }) | null = null;

  for (const it of sortedItems) {
    const x = it.transform ? it.transform[4] : 0;
    const y = it.transform ? it.transform[5] : 0;
    const w = it.width || 0;
    const fontSize = Math.abs(it.transform ? (it.transform[0] || it.transform[3]) : 0) || it.height || 10;
    const str = it.str;
    const itCol = (isTwoColumn && (x + w / 2 >= midX) && w < width * 0.65) ? 1 : 0;

    // 換行條件：Y 差距 > 3.2 或是左右欄位不同 (防呆：左欄與右欄同高度文字絕不能黏在一起)
    if (!currentLine || Math.abs(currentLine.y - y) > 3.2 || currentLine.col !== itCol) {
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
        page: pageNum,
        col: itCol
      };
    } else {
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
 * 智慧去斷字（De-hyphenation）與段落重組
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

    // 斷詞修復 (e.g. "atten-", "trans-")
    const endsWithHyphen = /([A-Za-z]+)-\s*$/.test(text);

    if (endsWithHyphen && nextLine && /^[a-z]/.test(nextLine.text)) {
      const dehyphenated = text.replace(/-\s*$/, '');
      currentPara = currentPara ? `${currentPara}${dehyphenated}` : dehyphenated;
    } else {
      currentPara = currentPara ? `${currentPara} ${text}` : text;
    }

    // 段落終止條件：
    // 1. 本行以句號/問號/驚嘆號結尾
    // 2. 下一行是大寫首字母或縮排
    // 3. 或下一行垂直間距大於正常行距
    const isPunctuationEnd = /[.!?:]\s*$/.test(text);
    const hasNext = Boolean(nextLine);
    const nextYGap = hasNext ? Math.abs(line.y - nextLine.y) : 0;
    const isLargeGap = nextYGap > line.fontSize * 1.8;

    if (!hasNext || isLargeGap || (isPunctuationEnd && text.length > 40 && nextYGap > line.fontSize * 1.3)) {
      const cleanPara = cleanPaperText(currentPara, { unwrapLines: true });
      if (cleanPara.length > 0) {
        paragraphs.push(cleanPara);
      }
      currentPara = '';
    }
  }

  if (currentPara.trim()) {
    const cleanPara = cleanPaperText(currentPara, { unwrapLines: true });
    if (cleanPara.length > 0) {
      paragraphs.push(cleanPara);
    }
  }

  return { paragraphs, lineCount: lines.length };
}

/**
 * 純前端極速離線解析主函式：100% 還原章節大綱、標題與語意自然段落
 */
export async function parsePdfToDocument(
  source: File | ArrayBuffer,
  fileName?: string,
  onProgress?: ParseProgressCallback,
  options?: { forceLocal?: boolean }
): Promise<PaperDocument> {
  const reportProgress = (pct: number, msg: string) => {
    if (onProgress) onProgress(pct, msg);
  };

  reportProgress(5, '正在讀取 PDF 二進制資料流...');

  let arrayBuffer: ArrayBuffer;
  let targetName = fileName || '本機 PDF 文獻';

  if (source instanceof File) {
    targetName = source.name.replace(/\.[^/.]+$/, '');
    arrayBuffer = await source.arrayBuffer();
  } else {
    arrayBuffer = source;
  }

  reportProgress(15, '正在啟動純前端 PDF.js 本地極速解析引擎...');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  reportProgress(25, `成功載入 PDF，共 ${numPages} 頁。正在讀取文件大綱與元數據...`);

  // 1. 取得文件 Metadata
  let docTitle = targetName;
  let docAuthors: string[] = ['學術文獻作者'];

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
  reportProgress(35, '正在讀取 PDF 階層書籤大綱...');
  const outlineItems = await extractPdfOutlines(pdfDoc);

  // 3. 逐頁提取排版文字與計算基準字體大小
  reportProgress(45, `正在逐頁掃描排版、雙欄結構與行距 (${numPages} 頁)...`);
  const allPageLines: ExtractedLine[][] = [];
  const fontSizes: number[] = [];

  for (let p = 1; p <= numPages; p++) {
    try {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const pageLines = extractPageLines(textContent, viewport, p);
      allPageLines.push(pageLines);

      for (const line of pageLines) {
        fontSizes.push(line.fontSize);
      }
      page.cleanup();
    } catch {
      allPageLines.push([]);
    }

    if (p % 6 === 0 || p === numPages) {
      const stepPct = 45 + Math.round((p / numPages) * 35);
      reportProgress(stepPct, `正在提取第 ${p} / ${numPages} 頁排版與段落...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // 計算平均/中位數內文字號
  fontSizes.sort((a, b) => a - b);
  const bodyFontSize = fontSizes.length > 0 ? fontSizes[Math.floor(fontSizes.length * 0.5)] : 10;

  // 4. 若 Metadata 中標題仍為檔名，在第一頁尋找字體最大的短行作為論文標題 (如 The Google File System)
  if ((!docTitle || docTitle === targetName || docTitle.toLowerCase().endsWith('.pdf')) && allPageLines[0] && allPageLines[0].length > 0) {
    const firstPageLines = allPageLines[0].slice(0, 8);
    let maxFontLine: ExtractedLine | null = null;

    for (const l of firstPageLines) {
      if (l.text.length >= 6 && l.text.length <= 130 && !/^(arxiv|page|http|doi|volume|issn|isbn)/i.test(l.text)) {
        if (!maxFontLine || l.fontSize > maxFontLine.fontSize) {
          maxFontLine = l;
        }
      }
    }

    if (maxFontLine && maxFontLine.fontSize >= bodyFontSize * 1.15) {
      docTitle = cleanText(maxFontLine.text);
    }
  }

  reportProgress(82, '正在依據語意章節大綱進行自然段落重組...');

  // 5. 章節劃分：
  // 策略 A：若有官方書籤目錄 (Outline >= 2 個)，依據書籤頁碼與標題切分
  // 策略 B：若無書籤，由第一頁至最後一頁掃描 Heading Pattern 與大字號短行切分
  const rawSections: RawSection[] = [];
  let currentSec: RawSection | null = null;
  let sectionIndex = 1;
  const flatLines = allPageLines.flat();

  if (outlineItems && outlineItems.length >= 2) {
    reportProgress(86, `依據官方書籤 (${outlineItems.length} 個章節) 構建目錄與重組段落...`);

    const firstP = outlineItems[0].page;
    if (firstP > 1) {
      const prefaceLines = allPageLines.slice(0, firstP - 1).flat();
      const { paragraphs: prefaceParas } = reconstructParagraphsFromLines(prefaceLines);
      rawSections.push({
        id: 'sec_0',
        title: 'Preface & Overview (前言與概覽)',
        level: 1,
        page: 1,
        paragraphs: prefaceParas.length > 0 ? prefaceParas : ['封面、目錄與前言頁面。點擊左側畫布單頁檢視原檔。']
      });
    }

    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      const startP = item.page;
      const nextItem = outlineItems[i + 1];
      const endP = nextItem ? Math.max(startP, nextItem.page - 1) : numPages;

      const secLines = allPageLines.slice(startP - 1, endP).flat();
      const { paragraphs: secParas } = reconstructParagraphsFromLines(secLines);

      rawSections.push({
        id: `sec_${i + 1}`,
        title: item.title,
        level: item.level,
        page: item.page,
        paragraphs: secParas.length > 0 ? secParas : [`第 ${startP} 頁至第 ${endP} 頁內容。點擊左側畫布單頁檢視原檔。`]
      });
    }
  } else {
    reportProgress(86, '掃描學術標題結構與自動切分段落...');

    let passedFirstFormalSection = false;

    for (let i = 0; i < flatLines.length; i++) {
      const line = flatLines[i];
      let headingLevel = detectHeadingLevel(line.text, line.fontSize, bodyFontSize);

      // 排除 ACM/IEEE 特殊分類標記，如 "Categories and Subject Descriptors", "General Terms", "Keywords"
      if (/^(categories and subject descriptors|general terms|keywords)\b/i.test(line.text.trim())) {
        headingLevel = null;
      }

      // 第一頁防呆：在 Abstract 或第 1 章 (1. INTRODUCTION) 出現之前，標題/作者/機構不可作為獨立章節
      if (!passedFirstFormalSection) {
        if (line.page === 1) {
          const isFormalStart = /^(abstract|1[\.\s]|I[\.\s])/i.test(line.text.trim());
          if (!isFormalStart) {
            headingLevel = null;
          } else {
            passedFirstFormalSection = true;
          }
        } else {
          passedFirstFormalSection = true;
        }
      }

      // 若同一行黏合了 ABSTRACT 與 1. INTRODUCTION，進行自動拆解
      if (headingLevel !== null && /abstract\b.*1[\.\s]+introduction/i.test(line.text)) {
        const sec1Id = String(sectionIndex++);
        rawSections.push({
          id: sec1Id,
          title: 'ABSTRACT',
          level: 1,
          page: line.page,
          paragraphs: []
        });

        const sec2Id = String(sectionIndex++);
        currentSec = {
          id: sec2Id,
          title: '1. INTRODUCTION',
          level: 1,
          page: line.page,
          paragraphs: []
        };
        rawSections.push(currentSec);
        continue;
      }

      if (headingLevel !== null) {
        const secId = String(sectionIndex++);
        currentSec = {
          id: secId,
          title: line.text,
          level: headingLevel,
          page: line.page,
          paragraphs: []
        };
        rawSections.push(currentSec);
      } else {
        if (!currentSec) {
          currentSec = {
            id: String(sectionIndex++),
            title: 'Abstract & Overview',
            level: 1,
            page: 1,
            paragraphs: []
          };
          rawSections.push(currentSec);
        }
        currentSec.paragraphs.push(line.text);
      }
    }

    // 若依 Heading 劃分章節過少 (少於 2 個)，改以頁面分區備援
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
      // 將每個章節中的散亂行重組為語意自然段落
      for (const sec of rawSections) {
        const dummyLines = sec.paragraphs.map(p => ({
          text: p,
          x: 0,
          y: 0,
          width: 100,
          fontSize: bodyFontSize,
          page: sec.page
        }));
        const { paragraphs } = reconstructParagraphsFromLines(dummyLines);
        sec.paragraphs = paragraphs;
      }
    }
  }

  // 6. 提取 Abstract
  let abstractEnglish = '';
  const abstractSec = rawSections.find(s => /abstract/i.test(s.title));
  if (abstractSec && abstractSec.paragraphs.length > 0) {
    abstractEnglish = abstractSec.paragraphs.join(' ');
  } else if (rawSections[0] && rawSections[0].paragraphs.length > 0) {
    abstractEnglish = rawSections[0].paragraphs.slice(0, 2).join(' ');
  } else {
    abstractEnglish = '本篇文獻已由 MUGEN YOMU 本機離線 PDF 引擎自動提取章節大綱與雙語對照排版。';
  }

  reportProgress(94, '正在將本機 PDF 二進制存入 IndexedDB 快取...');
  const generatedId = `local_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await saveLocalPdfBinary(generatedId, arrayBuffer, targetName);

  // 7. 轉換為標準 ChapterSection 階層
  const finalSections: ChapterSection[] = rawSections.map((raw) => ({
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

  const document: PaperDocument = {
    id: generatedId,
    type: 'paper',
    title: docTitle,
    sourceUrl: `local://${targetName}.pdf`,
    authors: docAuthors,
    venue: 'Local Offline PDF Archive',
    readingSpeedWpm: 240,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: abstractEnglish.slice(0, 900),
      chineseSummary: '此文獻已由 MUGEN YOMU 本機離線 PDF 引擎在純瀏覽器端完成排版大綱抽取與章節切分，支援 100% 離線隱私研讀。'
    },
    sections: finalSections,
    companionData
  };

  reportProgress(100, `解析完成！共識別 ${finalSections.length} 個章節、${numPages} 頁。`);
  return document;
}
