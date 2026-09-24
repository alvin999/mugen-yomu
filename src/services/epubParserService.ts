import JSZip from 'jszip';
import type { PaperDocument, ChapterSection, FigureItem } from '../types/document';
import { convertDocumentToTraditional } from './traditionalChineseService';

export interface EpubParseProgress {
  step: string;
  percent: number;
}

export interface EpubParseOptions {
  toTraditional?: boolean;
  onProgress?: (progress: EpubParseProgress) => void;
}

/**
 * 輔助函式：清理與標準化相對路徑
 */
function normalizeZipPath(basePath: string, relativePath: string): string {
  const cleanRel = relativePath.split('#')[0];
  if (!basePath) return cleanRel;

  const stack = basePath.split('/').filter(Boolean);
  const parts = cleanRel.split('/');

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

/**
 * 輔助函式：自 class 屬性提取語言標註
 */
function extractLanguageFromClass(className: string): string {
  if (!className) return '';
  const match = className.match(/(?:^|\s)(?:src-|language-|lang-|hljs-)?([a-zA-Z0-9_+-]+)(?:\s|$)/i);
  if (match) {
    const raw = match[1].toLowerCase();
    if (['src', 'highlight', 'code', 'snippet'].includes(raw)) return '';
    return raw;
  }
  return '';
}

/**
 * 將一般文字與語意節點轉換為 Markdown 段落（排除獨立大圖，大圖由獨立邏輯處理）
 */
function elementToMarkdown(element: Element): string {
  const tag = element.tagName.toUpperCase();

  // 0. 標題元素 (H1 ~ H6，若未被作為獨立章節切分，輸出為 Markdown 子標題)
  if (/^H[1-6]$/.test(tag)) {
    const level = parseInt(tag[1], 10);
    const hashes = '#'.repeat(Math.max(2, Math.min(6, level)));
    const titleText = (element.textContent || '').trim().replace(/[\r\n]+/g, ' ');
    return `${hashes} ${titleText}`;
  }

  // 1. 程式碼區塊
  if (tag === 'PRE') {
    const codeEl = element.querySelector('code');
    const className = (element.className || '') + ' ' + (codeEl?.className || '');
    const lang = extractLanguageFromClass(className);
    const codeText = element.textContent || '';
    return lang ? `\`\`\`${lang}\n${codeText}\n\`\`\`` : `\`\`\`\n${codeText}\n\`\`\``;
  }

  // 2. 表格
  if (tag === 'TABLE') {
    const rows = Array.from(element.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    const tableLines: string[] = [];
    rows.forEach((tr, rIdx) => {
      const cells = Array.from(tr.querySelectorAll('th, td')).map(c => (c.textContent || '').trim().replace(/\|/g, '\\|'));
      if (cells.length > 0) {
        tableLines.push(`| ${cells.join(' | ')} |`);
        if (rIdx === 0) {
          tableLines.push(`| ${cells.map(() => '---').join(' | ')} |`);
        }
      }
    });
    return tableLines.join('\n');
  }

  // 3. 清單
  if (tag === 'UL' || tag === 'OL') {
    const items = Array.from(element.querySelectorAll(':scope > li'));
    return items.map((li, idx) => {
      const prefix = tag === 'UL' ? '- ' : `${idx + 1}. `;
      return `${prefix}${(li.textContent || '').trim()}`;
    }).join('\n');
  }

  // 4. 引言
  if (tag === 'BLOCKQUOTE') {
    const text = (element.textContent || '').trim();
    return text ? `> ${text.replace(/\n+/g, '\n> ')}` : '';
  }

  // 5. 段落與行內元素處理
  const parts: string[] = [];
  element.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent || '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const t = el.tagName.toUpperCase();
      if (t === 'A') {
        const href = el.getAttribute('href') || '#';
        parts.push(`[${el.textContent || ''}](${href})`);
      } else if (t === 'CODE') {
        parts.push(`\`${el.textContent || ''}\``);
      } else if (t === 'STRONG' || t === 'B') {
        parts.push(`**${el.textContent || ''}**`);
      } else if (t === 'EM' || t === 'I') {
        parts.push(`*${el.textContent || ''}*`);
      } else if (t === 'IMG') {
        const src = el.getAttribute('src') || '';
        const alt = (el.getAttribute('alt') || '圖表').replace(/[\r\n]+/g, ' ').trim();
        parts.push(`![${alt}](${src})`);
      } else {
        parts.push(el.textContent || '');
      }
    }
  });

  return parts.join('').trim();
}

/**
 * 遍歷收集章節中的語意區塊（展開 section/div 容器）
 */
function collectEpubSemanticElements(element: Element, result: Element[] = []): Element[] {
  if (!element) return result;

  const tag = element.tagName.toUpperCase();

  // 跳過導覽與腳本
  if (['NAV', 'SCRIPT', 'STYLE'].includes(tag)) return result;

  // 標題與核心區塊元素直接收集
  if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'FIGURE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE'].includes(tag)) {
    result.push(element);
    return result;
  }

  if (tag === 'P') {
    // 若 P 內部包著 figure 或 pre，拆解子項目
    if (element.querySelector('pre') || element.querySelector('img') || element.querySelector('figure')) {
      for (const child of Array.from(element.children)) {
        collectEpubSemanticElements(child, result);
      }
      return result;
    }
    result.push(element);
    return result;
  }

  // 容器元素 (SECTION, DIV, ARTICLE, BODY) 遞迴深入子節點
  for (const child of Array.from(element.children)) {
    collectEpubSemanticElements(child, result);
  }

  return result;
}

/**
 * 核心解析器：解析 EPUB 檔案資料 (ArrayBuffer / Blob / Uint8Array)
 */
export async function parseEpubToDocument(
  epubData: ArrayBuffer | Blob | Uint8Array,
  options: EpubParseOptions = {}
): Promise<PaperDocument> {
  const { toTraditional = false, onProgress } = options;

  onProgress?.({ step: '讀取 EPUB 封裝結構...', percent: 10 });

  const zip = await JSZip.loadAsync(epubData);

  // 1. 讀取 META-INF/container.xml 找出 OPF 檔路徑
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('無效的 EPUB 檔案：未找到 META-INF/container.xml');
  }
  const containerXmlText = await containerFile.async('text');
  const domParser = new DOMParser();
  const containerDoc = domParser.parseFromString(containerXmlText, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');
  if (!opfPath) {
    throw new Error('無效的 EPUB 檔案：未指定 rootfile 根路徑');
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

  onProgress?.({ step: '讀取書籍清單與中繼資料 (OPF)...', percent: 25 });

  // 2. 讀取 OPF 檔
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`找不到 OPF 檔案：${opfPath}`);
  }
  const opfXmlText = await opfFile.async('text');
  const opfDoc = domParser.parseFromString(opfXmlText, 'application/xml');

  // 書籍 Metadata
  const bookTitle = opfDoc.querySelector('title')?.textContent?.trim() || '未命名電子書';
  const creators = Array.from(opfDoc.querySelectorAll('creator')).map(c => c.textContent?.trim() || '').filter(Boolean);
  const authors = creators.length > 0 ? creators : ['技術出版作者'];
  const description = opfDoc.querySelector('description')?.textContent?.trim() || '';

  // 建立 Manifest 映射表 (id -> { href, mediaType, fullPath })
  const manifestItems = new Map<string, { href: string; mediaType: string; fullPath: string }>();
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href) {
      manifestItems.set(id, { href, mediaType, fullPath: normalizeZipPath(opfDir, href) });
    }
  });

  // 讀取 Spine 順序
  const spineItemRefs = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .map(ref => ref.getAttribute('idref'))
    .filter(Boolean) as string[];

  onProgress?.({ step: '提取書中圖表資源與高畫質圖片...', percent: 40 });

  // 3. 預先提取所有圖片為 Base64 Data URL，確保離線與零破版
  const imageMap = new Map<string, string>();
  for (const [_id, item] of manifestItems.entries()) {
    if (item.mediaType.startsWith('image/')) {
      const imgFile = zip.file(item.fullPath);
      if (imgFile) {
        try {
          const base64Data = await imgFile.async('base64');
          const dataUrl = `data:${item.mediaType};base64,${base64Data}`;
          imageMap.set(item.fullPath, dataUrl);
          // 支援各種相對路徑格式
          const filename = item.fullPath.split('/').pop() || '';
          if (filename) {
            imageMap.set(filename, dataUrl);
          }
        } catch (e) {
          console.warn(`提取圖片失敗: ${item.fullPath}`, e);
        }
      }
    }
  }

  // 4. 解析全書 TOC 目錄結構（優先讀取 nav.xhtml 或 toc.ncx）
  const tocEntries: { title: string; fileTarget: string; anchor: string }[] = [];

  // 嘗試讀取 nav.xhtml
  const navItem = Array.from(manifestItems.values()).find(it => it.href.includes('nav') || it.mediaType === 'application/xhtml+xml');
  let navParsed = false;
  if (navItem) {
    const navFile = zip.file(navItem.fullPath);
    if (navFile) {
      try {
        const navText = await navFile.async('text');
        const navDoc = domParser.parseFromString(navText, 'text/html');
        const links = navDoc.querySelectorAll('nav[epub\\:type="toc"] a, nav#toc a, nav.toc a');
        if (links.length > 0) {
          links.forEach(a => {
            const rawHref = a.getAttribute('href') || '';
            const tText = a.textContent?.trim() || '';
            if (rawHref && tText && tText !== '目錄' && tText !== 'Table of Contents') {
              const [fTarget, anchor = ''] = rawHref.split('#');
              const fullF = normalizeZipPath(opfDir, fTarget);
              tocEntries.push({ title: tText, fileTarget: fullF, anchor });
            }
          });
          navParsed = tocEntries.length > 0;
        }
      } catch {}
    }
  }

  // 備援：讀取 toc.ncx
  if (!navParsed) {
    const ncxItem = Array.from(manifestItems.values()).find(it => it.mediaType === 'application/x-dtbncx+xml' || it.href.endsWith('.ncx'));
    if (ncxItem) {
      const ncxFile = zip.file(ncxItem.fullPath);
      if (ncxFile) {
        try {
          const ncxText = await ncxFile.async('text');
          const ncxDoc = domParser.parseFromString(ncxText, 'application/xml');
          ncxDoc.querySelectorAll('navPoint').forEach(nav => {
            const navTitle = nav.querySelector('navLabel > text')?.textContent?.trim() || '';
            const navSrc = nav.querySelector('content')?.getAttribute('src') || '';
            if (navTitle && navSrc) {
              const [fTarget, anchor = ''] = navSrc.split('#');
              const fullF = normalizeZipPath(opfDir, fTarget);
              tocEntries.push({ title: navTitle, fileTarget: fullF, anchor });
            }
          });
        } catch {}
      }
    }
  }

  onProgress?.({ step: '按標題與章節精確切割書籍結構...', percent: 60 });

  const sections: ChapterSection[] = [];
  const allFigures: FigureItem[] = [];
  let figureCounter = 1;
  let sectionCounter = 1;

  let currentSection: ChapterSection | null = null;

  function ensureSection(defaultTitle: string): ChapterSection {
    if (!currentSection) {
      currentSection = {
        id: `sec_${sectionCounter++}`,
        title: defaultTitle,
        level: 1,
        page: Math.max(1, Math.ceil(sectionCounter * 0.8)),
        progress: 0,
        isRead: false,
        paragraphs: [],
        figures: []
      };
      sections.push(currentSection);
    }
    return currentSection;
  }

  // 5. 循序遍歷 Spine 中的所有 XHTML 檔案
  for (let sIdx = 0; sIdx < spineItemRefs.length; sIdx++) {
    const idref = spineItemRefs[sIdx];
    const manifestEntry = manifestItems.get(idref);
    if (!manifestEntry || manifestEntry.mediaType !== 'application/xhtml+xml') continue;

    // 略過純目錄導航頁 (nav.xhtml)，因為我們已經獨立提取了 TOC
    if (manifestEntry.href.includes('nav.xhtml')) continue;

    const chapterFile = zip.file(manifestEntry.fullPath);
    if (!chapterFile) continue;

    const currentChapterDir = manifestEntry.fullPath.includes('/')
      ? manifestEntry.fullPath.slice(0, manifestEntry.fullPath.lastIndexOf('/'))
      : '';

    const chapterHtmlText = await chapterFile.async('text');
    const chapterDoc = domParser.parseFromString(chapterHtmlText, 'text/html');

    // 替換所有圖片 src 為 Data URL
    chapterDoc.querySelectorAll('img').forEach(img => {
      const rawSrc = img.getAttribute('src');
      if (rawSrc) {
        const fullImgPath = normalizeZipPath(currentChapterDir, rawSrc);
        const resolvedDataUrl = imageMap.get(fullImgPath) ||
          imageMap.get(rawSrc.replace(/^\.\.\//, '')) ||
          imageMap.get(rawSrc.split('/').pop() || '');
        if (resolvedDataUrl) {
          img.setAttribute('src', resolvedDataUrl);
        }
      }
    });

    const bodyEl = chapterDoc.body || chapterDoc.documentElement;
    const semanticNodes = collectEpubSemanticElements(bodyEl);

    // 找這個檔案預設的第一個章節標題
    const fileDefaultTitle = tocEntries.find(e => e.fileTarget === manifestEntry.fullPath && !e.anchor)?.title ||
      chapterDoc.querySelector('h1')?.textContent?.trim() ||
      chapterDoc.title ||
      `章節 ${sIdx + 1}`;

    // 每個 XHTML 檔案開頭開啟一個代表該頁面的章節（若尚未有標題）
    currentSection = null;

    for (const el of semanticNodes) {
      const tag = el.tagName.toUpperCase();

      // 1. 遇到 H1 或 H2 標題：動態切割出精確的章節單元！
      if (tag === 'H1' || tag === 'H2') {
        const titleCandidate = el.textContent?.trim() || '';
        // 略過全書總書名，避免誤作章節
        if (titleCandidate && titleCandidate !== bookTitle) {
          const headerLevel = tag === 'H1' ? 1 : 2;
          const secIdx = sectionCounter++;
          currentSection = {
            id: `sec_${secIdx}`,
            title: titleCandidate,
            level: headerLevel,
            page: Math.max(1, Math.ceil(secIdx * 0.8)),
            progress: 0,
            isRead: false,
            paragraphs: [],
            figures: []
          };
          sections.push(currentSection);
          continue;
        }
      }

      // 確保當前有承接段落的章節
      const sec = ensureSection(fileDefaultTitle);

      // 2. 獨立圖片與圖表 (FIGURE / IMG / 或包著 IMG 的節點)
      const imgEl = tag === 'IMG' ? el : el.querySelector('img');
      if (imgEl) {
        const src = imgEl.getAttribute('src') || '';
        const captionRaw = el.querySelector('figcaption')?.textContent?.trim() || imgEl.getAttribute('alt')?.trim() || '圖表';
        const cleanCaption = captionRaw.replace(/[\r\n]+/g, ' ').trim() || '圖表';
        const figNum = `Figure ${figureCounter++}`;

        const figItem: FigureItem = {
          id: `fig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: cleanCaption,
          caption: cleanCaption,
          figureNumber: figNum,
          imageUrl: src
        };

        if (!sec.figures) sec.figures = [];
        sec.figures.push(figItem);
        allFigures.push(figItem);

        // 輸出嚴格單行的標準 Markdown 圖片語法，絕不帶任何多餘換行
        sec.paragraphs.push(`![${cleanCaption}](${src})`);
        continue;
      }

      // 3. 一般段落 / 程式碼區塊 / 表格
      const pText = elementToMarkdown(el);
      if (pText) {
        sec.paragraphs.push(pText);
      }
    }

    const currentPercent = 60 + Math.round(((sIdx + 1) / spineItemRefs.length) * 35);
    onProgress?.({
      step: `解析全書結構 (${sIdx + 1}/${spineItemRefs.length}): ${fileDefaultTitle.slice(0, 18)}...`,
      percent: currentPercent
    });
  }

  // 濾除完全無內文與圖表的空章節
  const validSections = sections.filter(s => s.paragraphs.length > 0 || (s.figures && s.figures.length > 0));

  if (validSections.length === 0) {
    validSections.push({
      id: 'sec_1',
      title: bookTitle,
      level: 1,
      page: 1,
      progress: 0,
      isRead: false,
      paragraphs: ['（本書內容為空或無法自檔案提取結構）']
    });
  }

  let paperDoc: PaperDocument = {
    id: `epub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'web',
    title: bookTitle,
    authors,
    venue: 'EPUB 電子書',
    readingSpeedWpm: 260,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: description || (validSections[0]?.paragraphs[0]?.slice(0, 280) || 'EPUB 數位出版品'),
      chineseSummary: ''
    },
    sections: validSections,
    companionData: {},
    figureList: allFigures.length > 0 ? allFigures : undefined
  };

  // 為所有章節注入基本伴讀資料模板
  validSections.forEach((sec) => {
    paperDoc.companionData[sec.id] = {
      intuition: {
        title: `關於「${sec.title}」的核心探討`,
        tag: '技術精讀',
        content: [
          '點擊段落右側「繁體中文對照」或下方伴讀按鈕，由 AI 自動解析本節的工程架構直覺與設計思維。'
        ]
      },
      terminology: [
        { term: sec.title.split(' ')[0] || '核心概念', explanation: '點擊下方「學術術語對齊」按鈕，由 AI 自動提取關鍵名詞台灣繁體對照', color: '#fabd2f' }
      ],
      socraticQuestions: []
    };
  });

  // 如果啟用了繁體中文轉換
  if (toTraditional) {
    onProgress?.({ step: '正在進行台灣繁體中文標準詞彙對齊 (OpenCC)...', percent: 98 });
    paperDoc = convertDocumentToTraditional(paperDoc);
  }

  onProgress?.({ step: '匯入完成！', percent: 100 });

  return paperDoc;
}
