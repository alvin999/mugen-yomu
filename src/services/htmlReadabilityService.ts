import { Readability } from '@mozilla/readability';
import type { PaperDocument, ChapterSection, FigureItem } from '../types/document';
import { resolveUrl } from './markdownParserService';

/**
 * 自 pre 或 code 標籤的 class 屬性辨識程式語言
 */
function extractLanguageFromClass(className: string): string {
  if (!className) return '';
  // 常見 class 格式：
  // 1. src src-python (Emacs Org-mode)
  // 2. language-python / lang-python / hljs-python (Prism / Highlight.js)
  // 3. python / bash / rust
  const match = className.match(/(?:^|\s)(?:src-|language-|lang-|hljs-)?([a-zA-Z0-9_+-]+)(?:\s|$)/i);
  if (match) {
    const raw = match[1].toLowerCase();
    if (['src', 'highlight', 'code', 'snippet'].includes(raw)) return '';
    return raw;
  }
  return '';
}

/**
 * 將 DOM 元素內的相對鏈結或圖片轉為絕對路徑
 */
function absolutizeUrls(container: Element, baseUrl: string) {
  try {
    container.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#') && !href.startsWith('mailto:')) {
        a.href = new URL(href, baseUrl).href;
      }
    });
    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        img.src = resolveUrl(src, baseUrl);
      }
    });
  } catch (e) {
    console.warn('URL absolutize warning:', e);
  }
}

export function inspectReadability(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const reader = new Readability(doc);
  const article = reader.parse();
  return {
    title: article?.title,
    length: article?.content?.length,
    hasKey: article?.content?.includes('tree_leaf_sort_key'),
    sample: article?.content?.slice(0, 1000)
  };
}

/**
 * 將內文節點轉換為易於閱讀與富文字渲染的段落字串 (包含 Markdown 鏈結與行內 code)
 */
function nodeToParagraphContent(element: Element): string {
  // 若為 code block
  if (element.tagName === 'PRE') {
    const codeEl = element.querySelector('code');
    const className = (element.className || '') + ' ' + (codeEl?.className || '');
    const lang = extractLanguageFromClass(className);
    const codeText = element.textContent || '';
    return lang ? `\`\`\`${lang}\n${codeText}\n\`\`\`` : `\`\`\`\n${codeText}\n\`\`\``;
  }

  // 處理包含超連結與行內代碼的元素
  const parts: string[] = [];
  element.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent || '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === 'A') {
        const href = el.getAttribute('href') || '#';
        parts.push(`[${el.textContent || ''}](${href})`);
      } else if (tag === 'CODE') {
        parts.push(`\`${el.textContent || ''}\``);
      } else if (tag === 'STRONG' || tag === 'B') {
        parts.push(`**${el.textContent || ''}**`);
      } else if (tag === 'EM' || tag === 'I') {
        parts.push(`*${el.textContent || ''}*`);
      } else if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '圖片';
        parts.push(`![${alt}](${src})`);
      } else {
        parts.push(el.textContent || '');
      }
    }
  });

  return parts.join('').trim();
}

/**
 * 走訪器：遞迴穿透容器元素 (DIV, SECTION 等)，精確收集扁平化語意單元
 */
function collectSemanticElements(element: Element, result: Element[] = []): Element[] {
  if (!element) return result;

  // 略過頁面目錄 (TOC)
  const elId = element.id || '';
  const elClass = element.className || '';
  const role = element.getAttribute('role') || '';
  if (
    elId === 'table-of-contents' ||
    role === 'doc-toc' ||
    (typeof elClass === 'string' && (elClass.includes('table-of-contents') || elClass.includes('toc')))
  ) {
    return result;
  }

  const tag = element.tagName.toUpperCase();

  // 核心區塊元素：不再往下拆解，直接作為單一語意區塊
  if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'FIGURE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE'].includes(tag)) {
    result.push(element);
    return result;
  }

  if (tag === 'P') {
    // 若 P 內部包著 PRE，往下拆解
    if (element.querySelector('pre')) {
      for (const child of Array.from(element.children)) {
        collectSemanticElements(child, result);
      }
      return result;
    }
    result.push(element);
    return result;
  }

  // 容器元素 (DIV, SECTION, ARTICLE, MAIN, BODY 等)：遞迴遍歷子節點
  for (const child of Array.from(element.children)) {
    collectSemanticElements(child, result);
  }

  return result;
}

/**
 * 核心：使用 Mozilla Readability 進行純 DOM 語意解析
 * 絕不經過任何 unwrapLine / join(' ') 的啟發式破壞，100% 保留代碼換行、縮排與註解！
 */
export function parseHtmlWithReadability(html: string, originalUrl: string): PaperDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 設定 baseUrl
  try {
    const base = doc.createElement('base');
    base.href = originalUrl;
    doc.head.appendChild(base);
  } catch {}

  // 核心保護：防止 Mozilla Readability 內建的 REGEX_STRIP_UNLIKELY (/comment/i)
  // 將 <pre> 內的語法高亮註解 (如 class="org-comment", class="comment") 誤判為網頁留言區而整行剔除！
  doc.querySelectorAll('pre, code').forEach(pre => {
    pre.querySelectorAll('*').forEach(child => {
      if (child.className && typeof child.className === 'string' && /comment/i.test(child.className)) {
        child.className = child.className.replace(/comment/gi, 'code-cmt-safe');
      }
    });
  });

  // 執行 Mozilla Readability 解析
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error('Mozilla Readability 未能成功萃取文章主要內文');
  }

  const title = article.title || doc.title || new URL(originalUrl).hostname;
  const domainName = new URL(originalUrl).hostname;

  // 解析 Readability 輸出的 HTML 片段
  const contentDoc = parser.parseFromString(article.content, 'text/html');
  const container = contentDoc.body;
  absolutizeUrls(container, originalUrl);

  const sections: ChapterSection[] = [];
  const allFigures: FigureItem[] = [];
  let currentSection: ChapterSection | null = null;
  let sectionCounter = 1;
  let figureCounter = 1;
  const abstractParagraphs: string[] = [];

  function ensureCurrentSection(fallbackTitle: string = '1. Introduction'): ChapterSection {
    if (!currentSection) {
      const secIdx = sectionCounter++;
      currentSection = {
        id: `sec_${secIdx}`,
        title: fallbackTitle,
        level: 1,
        page: 1,
        progress: 0,
        isRead: false,
        paragraphs: [],
        formulas: [],
        figures: []
      };
      sections.push(currentSection);
    }
    return currentSection;
  }

  // 取得完整語意節點列表（穿透所有巢狀 div）
  const semanticElements = collectSemanticElements(container);

  for (const el of semanticElements) {
    const tag = el.tagName.toUpperCase();

    // 1. 標題 (H1 ~ H6) -> 劃分章節
    if (tag.startsWith('H') && tag.length === 2) {
      const headerTitle = el.textContent?.trim() || `章節 ${sectionCounter}`;
      const headerLevel = parseInt(tag.slice(1), 10);
      const secIdx = sectionCounter++;
      currentSection = {
        id: `sec_${secIdx}`,
        title: headerTitle,
        level: headerLevel,
        page: Math.max(1, Math.ceil(secIdx * 0.9)),
        progress: 0,
        isRead: false,
        paragraphs: [],
        formulas: [],
        figures: []
      };
      sections.push(currentSection);
      continue;
    }

    // 2. 獨立程式碼區塊 (PRE) -> 完整保留所有換行、縮排、空格與註解！
    if (tag === 'PRE') {
      const codeEl = el.querySelector('code');
      const className = (el.className || '') + ' ' + (codeEl?.className || '');
      const lang = extractLanguageFromClass(className);
      // textContent 會完整還原包括 <span class="org-comment"> 等所有節點的文字、換行與縮排
      const rawCode = el.textContent || '';
      
      if (rawCode.trim()) {
        const codeBlock = lang ? `\`\`\`${lang}\n${rawCode}\n\`\`\`` : `\`\`\`\n${rawCode}\n\`\`\``;
        if (currentSection) {
          currentSection.paragraphs.push(codeBlock);
        } else {
          abstractParagraphs.push(codeBlock);
        }
      }
      continue;
    }

    // 3. 獨立圖片或圖表 (FIGURE / IMG)
    const imgEl = tag === 'IMG' ? el : el.querySelector('img');
    if (imgEl && el.textContent?.trim().length === 0) {
      const src = imgEl.getAttribute('src') || '';
      const resolvedSrc = resolveUrl(src, originalUrl);
      const figCaption = el.querySelector('figcaption')?.textContent?.trim() || imgEl.getAttribute('alt') || '文獻圖表';
      const figNum = `Figure ${figureCounter++}`;

      const figItem: FigureItem = {
        id: `fig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: figCaption,
        caption: figCaption,
        figureNumber: figNum,
        imageUrl: resolvedSrc
      };
      allFigures.push(figItem);

      const sec = ensureCurrentSection();
      if (!sec.figures) sec.figures = [];
      sec.figures.push(figItem);
      sec.paragraphs.push(`![${figCaption}](${resolvedSrc})`);
      continue;
    }

    // 4. 自然內文段落 (P, UL, OL, BLOCKQUOTE, TABLE)
    // 每個 DOM 段落天然獨立，絕對不需要進行 unwrapLine 拍平！
    const paraText = nodeToParagraphContent(el);
    if (paraText) {
      if (currentSection) {
        currentSection.paragraphs.push(paraText);
      } else {
        abstractParagraphs.push(paraText);
      }
    }
  }

  // 若未產生任何章節，建立預設章節
  if (sections.length === 0) {
    sections.push({
      id: 'sec_1',
      title: title || '1. Document Body',
      level: 1,
      page: 1,
      progress: 0,
      isRead: false,
      paragraphs: abstractParagraphs.length > 0 ? abstractParagraphs : ['（本篇文獻未能取得內文段落）']
    });
  } else if (abstractParagraphs.length > 0 && sections[0]) {
    sections[0].paragraphs = [...abstractParagraphs, ...sections[0].paragraphs];
  }

  // 構造 PaperDocument
  const paperDoc: PaperDocument = {
    id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'web',
    title,
    sourceUrl: originalUrl,
    authors: article.byline ? [article.byline] : [domainName],
    venue: article.siteName || domainName,
    readingSpeedWpm: 250,
    depthLevel: 'Cognitive Synthesis',
    abstract: {
      english: article.excerpt || (sections[0]?.paragraphs[0]?.slice(0, 300) || '線上網頁結構化萃取文獻'),
      chineseSummary: '' // 預設留空，等待使用者按需點擊生成，節省免費配額
    },
    sections,
    companionData: {},
    figureList: allFigures.length > 0 ? allFigures : undefined
  };

  // 為所有章節注入基本伴讀資料模板
  sections.forEach((sec) => {
    paperDoc.companionData[sec.id] = {
      intuition: {
        title: `關於「${sec.title}」的核心探討`,
        tag: '待 AI 解析',
        content: [
          '本節尚未進行 AI 科研直覺推導。點擊伴讀卡片或段落下方「白話科學直覺」按鈕，由 AI 深入解析本節的核心設計動機、痛點與工程直覺。'
        ]
      },
      terminology: [
        { term: sec.title.split(' ')[0] || 'Term', explanation: '點擊伴讀卡片或段落下方「學術術語對齊」按鈕，由 AI 自動萃取本節專有名詞對照字典', color: '#fabd2f' }
      ],
      socraticQuestions: [
        {
          id: `q_${sec.id}_1`,
          icon: 'help_outline',
          color: 'text-[#fe8019]',
          text: `作者在「${sec.title}」章節中最核心的論點是什麼？能否以一句話概括？`,
          answerSummary: '本章節旨在確立該主題之理論立論基礎，並排除先前研究之潛在干擾變數。'
        }
      ]
    };
  });

  return paperDoc;
}
