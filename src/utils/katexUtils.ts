import katex from 'katex';

/**
 * 轉義 HTML 特殊字元，防止 XSS 與標籤渲染異常
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 容錯與清理 LaTeX 語法異常（如空的上下標、化學式雙層上下標等）
 */
export function sanitizeLatex(latex: string): string {
  if (!latex) return '';
  return latex
    // 1. 消除空白的上下標：_{}, ^{}, _{ }, ^{ }
    .replace(/_\{(\s*)\}/g, '')
    .replace(/\^\{(\s*)\}/g, '')
    // 2. 消除空下標空上標組合：_{}^{}, ^{}_{}
    .replace(/_\{(\s*)\}\^\{(\s*)\}/g, '')
    .replace(/\^\{(\s*)\}_\{(\s*)\}/g, '')
    // 3. 修正化學式中常出現的雙層上下標（如 ^{+}_{}^{} 轉為 ^{+}）
    .replace(/\^\{([^}]+)\}_\{(\s*)\}\^\{(\s*)\}/g, '^{$1}')
    .replace(/_\{([^}]+)\}\^\{(\s*)\}_\{(\s*)\}/g, '_{$1}')
    // 4. 消除連續重複上標 / 下標
    .replace(/\^\{([^}]+)\}\s*\^\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `^{${g1} ${g2}}` : `^{${g1}}`)
    .replace(/_\{([^}]+)\}\s*_\{([^}]*)\}/g, (_m, g1, g2) => g2.trim() ? `_{${g1} ${g2}}` : `_{${g1}}`)
    // 5. 容錯 \left\{ 與 \right\}
    .replace(/\\left\{/g, '\\left\\{')
    .replace(/\\right\}/g, '\\right\\}');
}

/**
 * 使用 KaTeX 將 LaTeX 字串轉為 HTML
 */
export function renderMath(latex: string, displayMode: boolean = false): string {
  if (!latex) return '';
  try {
    const cleanLatex = sanitizeLatex(latex);
    return katex.renderToString(cleanLatex, {
      displayMode,
      throwOnError: false
    });
  } catch (err) {
    console.warn('KaTeX rendering error:', err);
    return `<span class="text-[#fb4934] font-mono">${escapeHtml(latex)}</span>`;
  }
}

/**
 * 萃取區塊方程式 ($$ ... $$)
 */
export function extractBlockFormula(para: string): string | null {
  if (!para) return null;
  const trimmed = para.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  return null;
}

/**
 * 複製 LaTeX 原始碼至剪貼簿
 */
export async function copyLatexToClipboard(latex: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(latex);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
