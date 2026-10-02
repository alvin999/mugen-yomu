import type { PaperDocument, ChapterSection } from '../../types/document';
import { detectSiteName } from './botDetector';

/**
 * 從任意 URL 或字串萃取 DOI (Digital Object Identifier)
 */
export function extractDoiFromUrl(url: string): string | null {
  try {
    const decoded = decodeURIComponent(url);
    // 標準 DOI 正則表達式：10.XXXX/...
    const doiMatch = decoded.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
    if (doiMatch) {
      // 移除結尾可能多帶的標點符號
      return doiMatch[1].replace(/[.,;)]+$/, '');
    }
  } catch {}
  return null;
}

/**
 * 檢查是否為已知學術出版商網址
 */
export function isAcademicUrl(url: string): boolean {
  const host = new URL(url, 'https://localhost').hostname.toLowerCase();
  const academicDomains = [
    'sciencedirect.com',
    'elsevier.com',
    'nature.com',
    'springer.com',
    'link.springer.com',
    'ieeexplore.ieee.org',
    'wiley.com',
    'onlinelibrary.wiley.com',
    'dl.acm.org',
    'tandfonline.com',
    'cell.com',
    'pnas.org',
    'academic.oup.com',
    'journals.sagepub.com',
    'jstor.org',
    'frontiersin.org',
    'mdpi.com',
    'plos.org',
    'doi.org'
  ];
  return academicDomains.some(d => host.includes(d));
}

/**
 * 透過 Semantic Scholar API 查詢論文中繼資訊
 */
async function fetchFromSemanticScholar(identifier: string): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const endpoint = `https://api.semanticscholar.org/graph/v1/paper/${identifier}?fields=title,abstract,authors,year,venue,openAccessPdf,externalIds,url`;
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return data;
      }
    }
  } catch (e) {
    // 逾時或查詢失敗時安靜略過
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

/**
 * 透過 Crossref API 查詢 DOI 資訊
 */
async function fetchFromCrossref(doi: string): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const endpoint = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data?.message?.title?.[0]) {
        return data.message;
      }
    }
  } catch (e) {
    // 略過
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

/**
 * 將學術開放 API 回傳之資料組合成標準 PaperDocument
 */
export async function tryAcademicFallback(url: string): Promise<PaperDocument | null> {
  const doi = extractDoiFromUrl(url);
  const siteName = detectSiteName(url);
  let paperData: any = null;
  let resolvedDoi = doi;

  // 1. 優先嘗試以 DOI 查詢 Semantic Scholar
  if (doi) {
    paperData = await fetchFromSemanticScholar(doi);
  }

  // 2. 若無 DOI 或查無結果，嘗試使用完整 URL 作為 Semantic Scholar 查詢鍵
  if (!paperData && isAcademicUrl(url)) {
    paperData = await fetchFromSemanticScholar(`URL:${encodeURIComponent(url)}`);
    if (paperData?.externalIds?.DOI) {
      resolvedDoi = paperData.externalIds.DOI;
    }
  }

  // 3. 若 Semantic Scholar 查無但有 DOI，嘗試 Crossref
  if (!paperData && resolvedDoi) {
    const crossrefData = await fetchFromCrossref(resolvedDoi);
    if (crossrefData) {
      const title = crossrefData.title?.[0] || 'Academic Paper';
      const authors = (crossrefData.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
      const venue = crossrefData['container-title']?.[0] || siteName;
      const abstractText = (crossrefData.abstract || '').replace(/<[^>]+>/g, '').trim();

      paperData = {
        title,
        abstract: abstractText,
        authors: authors.map((name: string) => ({ name })),
        venue,
        year: crossrefData.published?.['date-parts']?.[0]?.[0] || '',
        externalIds: { DOI: resolvedDoi }
      };
    }
  }

  if (!paperData || !paperData.title) {
    return null;
  }

  // 組裝為 Mugen Yomu 的 PaperDocument
  const title = paperData.title.trim();
  const authorsList = (paperData.authors || []).map((a: any) => a.name).filter(Boolean);
  const venueStr = paperData.venue ? `${paperData.venue}${paperData.year ? ` (${paperData.year})` : ''}` : siteName;
  const abstractEn = paperData.abstract?.trim() || '本學術文獻已透過學術開放中繼資料庫完成檢索與定位。完整內文可參閱開放存取 PDF 或原文連結。';

  const sections: ChapterSection[] = [];

  // 第 1 節：論文核心摘要 (Abstract)
  sections.push({
    id: 'sec-abstract',
    title: '1. Abstract (論文核心摘要)',
    level: 1,
    progress: 0,
    isRead: false,
    paragraphs: [abstractEn]
  });

  // 第 2 節：出版中繼資訊與閱讀說明
  const metaParagraphs: string[] = [
    `**文獻來源期刊**：${venueStr}`,
    `**研究學者**：${authorsList.length > 0 ? authorsList.join(', ') : '未提供'}`,
    `**原文連結**：[點擊前往官方網頁閱讀完整內文](${url})`
  ];

  if (resolvedDoi) {
    metaParagraphs.push(`**數位物件識別碼 (DOI)**：https://doi.org/${resolvedDoi}`);
  }

  if (paperData.openAccessPdf?.url) {
    metaParagraphs.push(`**開放存取 (Open Access) 完整 PDF**：系統已自動偵測到合法的開放存取 PDF 檔案。您可以直接閱讀或下載官方全文：[下載 Open Access 全文 PDF](${paperData.openAccessPdf.url})`);
  }

  metaParagraphs.push(`> 💡 **提示**：由於 ${siteName} 官方網站具備強式反爬蟲驗證挑戰（如 Cloudflare Captcha），系統已自動降級為學術開放資料庫模式（Semantic Scholar / Crossref），為您無縫萃取核心論文資訊。若欲閱讀完整章節，亦可使用「貼上內文」或「上傳本機 PDF」功能。`);

  sections.push({
    id: 'sec-metadata',
    title: '2. Publication Details & Open Access (出版與開放存取資訊)',
    level: 1,
    progress: 0,
    isRead: false,
    paragraphs: metaParagraphs
  });

  const doc: PaperDocument = {
    id: `academic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'web',
    title,
    authors: authorsList,
    venue: venueStr,
    arxivId: resolvedDoi ? `DOI: ${resolvedDoi}` : undefined,
    doi: resolvedDoi || undefined,
    abstract: {
      english: abstractEn,
      chineseSummary: ''
    },
    sections,
    companionData: {},
    sourceUrl: url,
    pdfUrl: paperData.openAccessPdf?.url || undefined,
    figureList: []
  };


  return doc;
}
