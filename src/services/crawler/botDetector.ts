import type { PaperDocument } from '../../types/document';

/**
 * 反爬蟲驗證挑戰錯誤結構
 */
export class BotChallengeError extends Error {
  public isBotChallenge = true;
  public siteName: string;
  public originalUrl: string;
  public detectedType: 'cloudflare' | 'captcha' | 'waf_blocked' | 'academic_paywall';
  public doi?: string;

  constructor(options: {
    message: string;
    siteName?: string;
    originalUrl: string;
    detectedType?: 'cloudflare' | 'captcha' | 'waf_blocked' | 'academic_paywall';
    doi?: string;
  }) {
    super(options.message);
    this.name = 'BotChallengeError';
    this.siteName = options.siteName || detectSiteName(options.originalUrl);
    this.originalUrl = options.originalUrl;
    this.detectedType = options.detectedType || 'captcha';
    this.doi = options.doi;
  }
}

/**
 * 依網址辨識學術期刊或網站名稱
 */
export function detectSiteName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('sciencedirect.com') || host.includes('elsevier.com')) return 'ScienceDirect (Elsevier)';
    if (host.includes('nature.com')) return 'Nature Portfolio';
    if (host.includes('springer.com') || host.includes('link.springer.com')) return 'Springer Nature';
    if (host.includes('ieee.org') || host.includes('ieeexplore.ieee.org')) return 'IEEE Xplore';
    if (host.includes('wiley.com')) return 'Wiley Online Library';
    if (host.includes('acm.org') || host.includes('dl.acm.org')) return 'ACM Digital Library';
    if (host.includes('tandfonline.com')) return 'Taylor & Francis Online';
    if (host.includes('cell.com')) return 'Cell Press';
    if (host.includes('pnas.org')) return 'PNAS';
    if (host.includes('oup.com')) return 'Oxford Academic';
    if (host.includes('sagepub.com')) return 'SAGE Journals';
    if (host.includes('jstor.org')) return 'JSTOR';
    return host;
  } catch {
    return '目標網站';
  }
}

/**
 * 常見 Bot 驗證特徵詞彙
 */
const BOT_TITLE_PATTERNS = [
  /are you a robot/i,
  /just a moment/i,
  /attention required/i,
  /human verification/i,
  /verify you are human/i,
  /security check/i,
  /access denied/i,
  /cloudflare/i,
  /challenge-platform/i,
  /checking your browser/i,
  /please confirm you are a human/i
];

const BOT_BODY_PATTERNS = [
  /please confirm you are a human/i,
  /completing the captcha challenge/i,
  /cf-chl-widget/i,
  /challenge-platform/i,
  /cf-turnstile/i,
  /hcaptcha/i,
  /g-recaptcha/i,
  /ray id:/i,
  /perimeterx/i,
  /px-captcha/i,
  /kasada/i,
  /enable javascript and cookies to continue/i,
  /incident id:/i,
  /reference number:\s*[a-z0-9]+/i
];

/**
 * 檢驗原始 HTML 是否為機器人驗證或阻擋頁面
 */
export function isBotChallengeHtml(html: string): boolean {
  if (!html || typeof html !== 'string') return false;

  // 1. 若長度過短且包含異常阻擋詞
  if (html.length < 2000) {
    if (BOT_BODY_PATTERNS.some(p => p.test(html)) || BOT_TITLE_PATTERNS.some(p => p.test(html))) {
      return true;
    }
  }

  // 2. 檢測常見 Cloudflare / Captcha 關鍵元素或文字
  let matchesCount = 0;
  for (const pattern of BOT_BODY_PATTERNS) {
    if (pattern.test(html)) {
      matchesCount++;
      if (matchesCount >= 2) return true;
    }
  }

  // 3. 專門針對 "Are you a robot?" 標題或 "Please confirm you are a human"
  if (/are you a robot/i.test(html) && /confirm you are a human|captcha/i.test(html)) {
    return true;
  }

  return false;
}

/**
 * 檢驗 Markdown 文本是否為機器人驗證或阻擋頁面
 */
export function isBotChallengeMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const lower = text.toLowerCase();
  if (lower.includes('are you a robot') || lower.includes('please confirm you are a human')) {
    return true;
  }
  if (lower.includes('just a moment...') && lower.includes('cloudflare')) {
    return true;
  }
  if (lower.includes('attention required! | cloudflare')) {
    return true;
  }

  // 若內文字數很少且含有 captcha 與 human
  if (text.length < 500 && (lower.includes('captcha') || lower.includes('robot')) && lower.includes('human')) {
    return true;
  }

  return false;
}

/**
 * 檢驗已解析出的 PaperDocument 是否其實是誤萃取的驗證頁面
 */
export function isBotChallengeDocument(doc: PaperDocument): boolean {
  if (!doc) return false;

  const titleLower = (doc.title || '').toLowerCase();
  for (const pattern of BOT_TITLE_PATTERNS) {
    if (pattern.test(titleLower)) return true;
  }

  const abstractLower = (doc.abstract?.english || '').toLowerCase();
  if (
    abstractLower.includes('please confirm you are a human') ||
    abstractLower.includes('completing the captcha challenge') ||
    abstractLower.includes('are you a robot')
  ) {
    return true;
  }

  // 若段落數極少（例如 <= 2）且段落內容命中
  const allParagraphs = doc.sections.flatMap(s => s.paragraphs).join(' ').toLowerCase();
  if (
    allParagraphs.includes('please confirm you are a human') ||
    allParagraphs.includes('completing the captcha challenge')
  ) {
    return true;
  }

  return false;
}
