/**
 * 規範化學術圖片 URL（處理 MDPI CDN 轉址、括號清理等）
 */
export function normalizeAcademicImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/^<|>$/g, '');
  if (url.includes('mdpi.com') && (url.includes('/images/') || url.includes('/html/') || /\.(?:png|jpe?g|webp|svg|gif)/i.test(url))) {
    url = url.replace(/https?:\/\/(?:www\.)?mdpi\.com\//i, 'https://pub.mdpi-res.com/');
  }
  return url;
}

/**
 * 從段落文字中萃取 Markdown 圖片標籤資訊
 */
export function extractImageInfo(text: string): { url: string; alt: string } | null {
  if (!text) return null;
  const trimmed = text.trim();

  // 1. 巢狀超連結圖片：[![alt](imgUrl)](linkUrl)
  const linkedMatch = trimmed.match(/^\[!\[(.*?)\]\((.*?)\)\]\((.*?)\)$/);
  if (linkedMatch) {
    const url = linkedMatch[2].split(' ')[0].replace(/['"]/g, '');
    return { alt: linkedMatch[1] || '學術圖表', url: normalizeAcademicImageUrl(url) };
  }

  // 2. 標準 Markdown 圖片：![alt](imgUrl)
  const match = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
  if (match) {
    const url = match[2].split(' ')[0].replace(/['"]/g, '');
    return { alt: match[1] || '學術圖表', url: normalizeAcademicImageUrl(url) };
  }

  return null;
}
