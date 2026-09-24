import type { PaperDocument, ChapterSection, FigureItem } from '../types/document';
import { parseHtmlWithReadability } from './htmlReadabilityService';
import { convertDocumentToTraditional } from './traditionalChineseService';

export interface TocChapterItem {
  id: string;
  title: string;
  url: string;
  level: number;
}

export interface BookDetectionResult {
  title: string;
  chapters: TocChapterItem[];
  detectedEpubUrl?: string;
  isSupported: boolean;
}

export interface BookCrawlProgress {
  step: string;
  currentChapter: number;
  totalChapters: number;
  percent: number;
}

/**
 * 輔助函式：透過本機 Proxy 獲取 HTML
 */
async function fetchHtmlWithProxy(url: string): Promise<string> {
  const proxyUrl = typeof window !== 'undefined'
    ? `/api/html-proxy?url=${encodeURIComponent(url)}`
    : url;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`無法獲取網頁 (HTTP ${res.status}): ${url}`);
  }
  return res.text();
}

/**
 * 偵測線上書籍目錄結構 (支援 MkDocs, GitBook, Docusaurus, VitePress 等)
 */
export async function detectOnlineBook(homeUrl: string): Promise<BookDetectionResult> {
  let targetUrl = homeUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  const html = await fetchHtmlWithProxy(targetUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. 探測是否有現成的 EPUB 檔案下載連結
  let detectedEpubUrl: string | undefined;
  const epubLink = doc.querySelector('a[href$=".epub"], a[href*="/releases/download/"][href*=".epub"]');
  if (epubLink) {
    const rawHref = epubLink.getAttribute('href');
    if (rawHref) {
      detectedEpubUrl = new URL(rawHref, targetUrl).href;
    }
  }

  // 書名探測
  const siteTitle = doc.querySelector('.md-header__title, nav[aria-label="Header"] .title, .navbar__title, header h1')?.textContent?.trim() ||
    doc.title.split('-')[0].trim() ||
    '線上技術書籍';

  // 2. 探測側邊欄導航目錄 (TOC)
  // 常見容器：.md-nav--primary, nav.md-nav, nav[aria-label="Table of contents"], .sidebar, aside nav
  let navContainer = doc.querySelector('.md-nav--primary') ||
    doc.querySelector('nav[aria-label="Table of contents"]') ||
    doc.querySelector('.sidebar') ||
    doc.querySelector('aside nav') ||
    doc.querySelector('nav');

  const chapters: TocChapterItem[] = [];
  const seenUrls = new Set<string>();

  const baseOrigin = new URL(targetUrl).origin;
  const basePath = new URL(targetUrl).pathname.replace(/\/[^/]*$/, '/');

  // 從導航容器或全頁鏈結中尋找同站內文檔鏈結
  const links = navContainer
    ? Array.from(navContainer.querySelectorAll('a'))
    : Array.from(doc.querySelectorAll('a'));

  let chId = 1;
  for (const a of links) {
    const href = a.getAttribute('href');
    const text = a.textContent?.replace(/\s+/g, ' ').trim();
    if (!href || !text) continue;

    // 排除外連、錨點、搜尋或空連結
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    if (text === '首页' || text === 'Home' || text.length < 2) continue;

    try {
      const fullUrl = new URL(href, targetUrl).href;
      // 確保同源且在類似子路徑下
      if (!fullUrl.startsWith(baseOrigin)) continue;

      // 去除結尾 hash
      const cleanFullUrl = fullUrl.split('#')[0];
      if (seenUrls.has(cleanFullUrl)) continue;
      seenUrls.add(cleanFullUrl);

      // 計算層級
      let level = 1;
      let parent = a.parentElement;
      while (parent && parent !== navContainer && parent !== doc.body) {
        if (parent.tagName === 'UL' || parent.tagName === 'OL') {
          level++;
        }
        parent = parent.parentElement;
      }

      chapters.push({
        id: `ch_${chId++}`,
        title: text,
        url: cleanFullUrl,
        level: Math.min(level, 3)
      });
    } catch {}
  }

  return {
    title: siteTitle,
    chapters,
    detectedEpubUrl,
    isSupported: chapters.length > 0 || !!detectedEpubUrl
  };
}

/**
 * 批次循序抓取線上書籍全章節並整合成單一 PaperDocument
 */
export async function crawlEntireOnlineBook(
  bookInfo: BookDetectionResult,
  options: {
    toTraditional?: boolean;
    onProgress?: (progress: BookCrawlProgress) => void;
  } = {}
): Promise<PaperDocument> {
  const { toTraditional = true, onProgress } = options;
  const chapters = bookInfo.chapters;
  const total = chapters.length;

  if (total === 0) {
    throw new Error('未偵測到任何章節，無法匯入');
  }

  const allSections: ChapterSection[] = [];
  const allFigures: FigureItem[] = [];
  let secGlobalId = 1;

  for (let i = 0; i < total; i++) {
    const ch = chapters[i];
    const percent = Math.round(((i + 1) / total) * 90);
    onProgress?.({
      step: `正在抓取 (${i + 1}/${total}): ${ch.title}...`,
      currentChapter: i + 1,
      totalChapters: total,
      percent
    });

    try {
      const html = await fetchHtmlWithProxy(ch.url);
      const singleDoc = parseHtmlWithReadability(html, ch.url);

      if (singleDoc.sections && singleDoc.sections.length > 0) {
        // 第一個 section 套用章節主標題
        singleDoc.sections.forEach((sec, sIdx) => {
          const sectionTitle = sIdx === 0 ? ch.title : `${ch.title} - ${sec.title}`;
          allSections.push({
            ...sec,
            id: `sec_${secGlobalId++}`,
            title: sectionTitle,
            page: i + 1
          });
        });
      }

      if (singleDoc.figureList) {
        allFigures.push(...singleDoc.figureList);
      }

      // 適度禮貌延遲 (50ms)，避免高頻發送請求
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.warn(`抓取章節 ${ch.title} 失敗:`, err);
      allSections.push({
        id: `sec_${secGlobalId++}`,
        title: ch.title,
        level: ch.level,
        page: i + 1,
        progress: 0,
        isRead: false,
        paragraphs: [`[無法自動下載本章內容，請直接訪問原文](${ch.url})`]
      });
    }
  }

  let finalDoc: PaperDocument = {
    id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'web',
    title: bookInfo.title,
    authors: ['線上技術出版'],
    venue: '線上技術書籍',
    readingSpeedWpm: 260,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: `本書共包含 ${allSections.length} 個章節單元，已由 MUGEN YOMU 書籍抓取引擎完整收錄。`,
      chineseSummary: ''
    },
    sections: allSections,
    companionData: {},
    figureList: allFigures.length > 0 ? allFigures : undefined
  };

  allSections.forEach(sec => {
    finalDoc.companionData[sec.id] = {
      intuition: {
        title: `關於「${sec.title}」的工程架構`,
        tag: '技術精讀',
        content: ['點擊伴讀或段落「繁體中文對照」展開 AI 導讀']
      },
      terminology: [
        { term: sec.title.split(' ')[0] || '核心概念', explanation: 'AI 自動提煉台灣繁體術語對照', color: '#fabd2f' }
      ]
    };
  });

  if (toTraditional) {
    onProgress?.({
      step: '正在進行全書台灣繁體中文轉換 (OpenCC)...',
      currentChapter: total,
      totalChapters: total,
      percent: 95
    });
    finalDoc = convertDocumentToTraditional(finalDoc);
  }

  onProgress?.({
    step: '全書匯入成功！',
    currentChapter: total,
    totalChapters: total,
    percent: 100
  });

  return finalDoc;
}
