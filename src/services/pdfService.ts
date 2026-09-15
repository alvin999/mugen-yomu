// PDF Service for MUGEN YOMU (Powered by Mozilla PDF.js)
// Provides in-canvas high-fidelity rendering and full-text string matching page anchoring.

import * as pdfjsLib from 'pdfjs-dist';
// Use local bundled worker via Vite ?url to avoid external CDN failures and SSL issues
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ChapterSection } from '../stores/documentStore';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PageTextEntry {
  pageNum: number;
  text: string;
}

export interface MatchResult {
  sectionId: string;
  matchedPage: number;
  confidence: number;
  matchedSnippet?: string;
}

/**
 * 將跨來源遠端 PDF 網址轉接至本機 /api/pdf-proxy 端點，徹底解除瀏覽器 CORS 限制
 */
export function getProxiedPdfUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }
  return `/api/pdf-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * 載入 PDF 文件物件 (支援 URL、Blob URL 或 ArrayBuffer，遠端網址自動走代理端點)
 */
export async function loadPdf(source: string | ArrayBuffer | Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
    const proxyUrl = getProxiedPdfUrl(source);
    try {
      // 透過本地 Vite 代理下載 PDF 為 ArrayBuffer，徹底避免瀏覽器 CORS 與憑證檢驗阻斷
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorDetail = await res.text().catch(() => res.statusText);
        throw new Error(`遠端 PDF 下載失敗 (${res.status}): ${errorDetail || res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('下載的 PDF 資料內容為空 (0 bytes)');
      }
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      return await loadingTask.promise;
    } catch (proxyErr: any) {
      console.warn('代理下載失敗，嘗試直接透過 URL 解析:', proxyErr);
      try {
        const loadingTask = pdfjsLib.getDocument(source);
        return await loadingTask.promise;
      } catch (directErr: any) {
        // 匯集代理與直連錯誤，提供 UI 明確的失敗原因
        const reason = proxyErr?.name === 'AbortError'
          ? '遠端連線逾時 (15 秒無回應)'
          : (proxyErr?.message || '跨來源限制或網路連線中斷');
        throw new Error(`PDF 載入異常: ${reason}`);
      }
    }
  }

  const loadingTask = pdfjsLib.getDocument(source);
  return await loadingTask.promise;
}

// Track active render task per canvas to cleanly cancel previous in-flight renders on rapid page flips
const activeRenderTasks = new WeakMap<HTMLCanvasElement, any>();

/**
 * 渲染指定頁面至 HTML5 Canvas
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.35
): Promise<{ width: number; height: number }> {
  // 若該 Canvas 尚有未完成的渲染任務，先行取消，防止 PDF.js 拋出並發鎖定錯誤
  const existingTask = activeRenderTasks.get(canvas);
  if (existingTask) {
    try {
      existingTask.cancel();
    } catch {
      // 忽略取消異常
    }
  }

  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  // 調整 Canvas 解析度以適配 Retina / 高 DPI 螢幕
  const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法取得 Canvas 2D 繪圖上下文');

  ctx.save();
  ctx.scale(outputScale, outputScale);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };

  const renderTask = page.render(renderContext);
  activeRenderTasks.set(canvas, renderTask);

  try {
    await renderTask.promise;
  } catch (err: any) {
    if (err?.name === 'RenderingCancelledException') {
      // 使用者連續快速翻頁時的正常取消行為，不視為錯誤
      return { width: viewport.width, height: viewport.height };
    }
    throw err;
  } finally {
    if (activeRenderTasks.get(canvas) === renderTask) {
      activeRenderTasks.delete(canvas);
    }
    ctx.restore();
  }

  return { width: viewport.width, height: viewport.height };
}

/**
 * 提取整篇 PDF 每一頁的純文字內容並建立檢索索引
 */
export async function buildPdfTextIndex(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  onProgress?: (progressPercent: number) => void
): Promise<PageTextEntry[]> {
  const entries: PageTextEntry[] = [];
  const total = pdfDoc.numPages;

  for (let p = 1; p <= total; p++) {
    try {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const rawText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      entries.push({
        pageNum: p,
        text: rawText.toLowerCase()
      });

      if (onProgress) {
        onProgress(Math.round((p / total) * 100));
      }
    } catch (err) {
      console.warn(`提取第 ${p} 頁文字失敗:`, err);
      entries.push({ pageNum: p, text: '' });
    }
  }

  return entries;
}

/**
 * 字串比對演算法：比對章節標題與段落特徵字串，精確計算章節所在的 PDF 頁碼
 */
export function matchSectionToPage(
  section: ChapterSection,
  pageIndex: PageTextEntry[]
): MatchResult {
  if (!pageIndex || pageIndex.length === 0) {
    return { sectionId: section.id, matchedPage: 1, confidence: 0 };
  }

  // 1. 清理章節標題特徵 (去掉前置序號如 1., 3.2.1，去掉符號，轉小寫)
  const rawTitle = section.title || '';
  const cleanTitle = rawTitle
    .replace(/^[0-9.]+\s*/, '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();

  // 2. 提取關鍵詞 (大於 3 字元之有效英文/數字/中文詞彙)
  const titleTokens = cleanTitle
    .split(/[\s,.:;_\-/]+/)
    .filter(t => t.length > 2);

  // 3. 提取該章節第一段前 100 字作為段落語義特徵
  const firstPara = (section.paragraphs && section.paragraphs[0])
    ? section.paragraphs[0].slice(0, 120).toLowerCase()
    : '';

  let bestPage = 1;
  let highestScore = -1;
  let matchedSnippet = '';

  for (const entry of pageIndex) {
    let score = 0;
    const pageText = entry.text;

    // A. 完整標題精確子字串匹配 (最高權重 +100)
    if (cleanTitle.length > 3 && pageText.includes(cleanTitle)) {
      score += 100;
      matchedSnippet = cleanTitle;
    }

    // B. 原始標題 (包含章號如 "3.2 attention") 匹配 (+80)
    const rawLower = rawTitle.toLowerCase().trim();
    if (rawLower.length > 3 && pageText.includes(rawLower)) {
      score += 80;
    }

    // C. 標題關鍵詞覆蓋率匹配
    if (titleTokens.length > 0) {
      let matchedCount = 0;
      for (const token of titleTokens) {
        if (pageText.includes(token)) {
          matchedCount++;
        }
      }
      const tokenCoverage = matchedCount / titleTokens.length;
      if (tokenCoverage >= 0.7) {
        score += Math.round(tokenCoverage * 50);
      }
    }

    // D. 第一段開頭前段特徵匹配 (+30)
    if (firstPara.length > 25) {
      const paraChunk = firstPara.slice(0, 45);
      if (pageText.includes(paraChunk)) {
        score += 40;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestPage = entry.pageNum;
    }
  }

  // 若比對得分過低 (< 25)，代表純字串無法精準命中，保留備援估計
  const confidence = Math.min(100, highestScore);
  return {
    sectionId: section.id,
    matchedPage: confidence >= 25 ? bestPage : (section.page || 1),
    confidence,
    matchedSnippet
  };
}

/**
 * 批次為所有章節進行字串比對並更新各章節 page 屬性
 */
export function alignAllSectionsWithPdf(
  sections: ChapterSection[],
  pageIndex: PageTextEntry[]
): { updatedSections: ChapterSection[]; matchResults: MatchResult[] } {
  const matchResults: MatchResult[] = [];

  function processSection(sec: ChapterSection): ChapterSection {
    const result = matchSectionToPage(sec, pageIndex);
    matchResults.push(result);

    const updatedChildren = sec.children ? sec.children.map(processSection) : undefined;
    return {
      ...sec,
      page: result.confidence >= 25 ? result.matchedPage : (sec.page || 1),
      children: updatedChildren
    };
  }

  const updatedSections = sections.map(processSection);
  return { updatedSections, matchResults };
}
