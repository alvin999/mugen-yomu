import { renderMath, escapeHtml } from './katexUtils';

/**
 * 簡易而安全的 Markdown + KaTeX 筆記渲染引擎
 * 專為學術精讀筆記設計，支援標題、代碼塊、清單、引文與 LaTeX 數學公式
 */
export function renderNoteMarkdown(content: string): string {
  if (!content) return '<p class="text-[#7c6f64] italic text-xs">暫無內容</p>';

  const lines = content.split('\n');
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. 代碼區塊 (``` ... ```)
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        htmlParts.push(`<pre class="bg-[#141617] border border-[#3c3836] rounded-lg p-3 my-2 text-xs font-mono text-[#ebdbb2] overflow-x-auto select-text leading-relaxed"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 2. 空行
    if (!trimmed) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // 3. 獨立區塊數學公式 ($$ ... $$)
    const blockMathMatch = trimmed.match(/^\$\$([\s\S]+?)\$\$$/);
    if (blockMathMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const rendered = renderMath(blockMathMatch[1].trim(), true);
      htmlParts.push(`<div class="my-3 py-2 text-center overflow-x-auto text-[#fabd2f] select-text">${rendered}</div>`);
      continue;
    }

    // 4. 標題 (#, ##, ###)
    if (trimmed.startsWith('# ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h1 class="text-base font-bold text-[#fe8019] mt-3 mb-1.5 pb-1 border-b border-[#3c3836]">${renderInline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h2 class="text-sm font-bold text-[#fabd2f] mt-2.5 mb-1">${renderInline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h3 class="text-xs font-bold text-[#ebdbb2] mt-2 mb-1">${renderInline(trimmed.slice(4))}</h3>`);
      continue;
    }

    // 5. 引用區塊 (> quote)
    if (trimmed.startsWith('>')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      const quoteText = renderInline(trimmed.replace(/^>\s*/, ''));
      htmlParts.push(`<blockquote class="border-l-2 border-[#fe8019] pl-3 py-1 my-2 text-xs text-[#d5c4a1] bg-[#141617]/40 rounded-r italic">${quoteText}</blockquote>`);
      continue;
    }

    // 6. 無序清單 (- item, * item)
    if (trimmed.match(/^[-*]\s+/)) {
      if (!inList) {
        htmlParts.push('<ul class="list-disc list-inside my-1.5 space-y-1 text-xs text-[#ebdbb2]">');
        inList = true;
      }
      const itemText = renderInline(trimmed.replace(/^[-*]\s+/, ''));
      htmlParts.push(`<li>${itemText}</li>`);
      continue;
    }

    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    // 7. 一般段落
    htmlParts.push(`<p class="my-1.5 text-xs text-[#d5c4a1] leading-relaxed select-text">${renderInline(line)}</p>`);
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    htmlParts.push(`<pre class="bg-[#141617] border border-[#3c3836] rounded-lg p-3 my-2 text-xs font-mono text-[#ebdbb2] overflow-x-auto"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }

  return htmlParts.join('\n');
}

/**
 * 處理行內樣式：行內代碼、粗體、斜體、KaTeX 行內數學公式 ($...$)
 */
function renderInline(text: string): string {
  if (!text) return '';

  // 1. 處理行內數學公式 $latex$
  let result = text.replace(/\$([^\$\n]+?)\$/g, (_match, latex) => {
    return `<span class="inline-block px-0.5 text-[#fabd2f] font-mono">${renderMath(latex.trim(), false)}</span>`;
  });

  // 2. 行內代碼 `code`
  result = result.replace(/`([^`\n]+?)`/g, (_match, code) => {
    return `<code class="px-1.5 py-0.5 rounded bg-[#141617] text-[#fe8019] font-mono text-[11px] border border-[#3c3836]">${escapeHtml(code)}</code>`;
  });

  // 3. 粗體 **bold**
  result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong class="font-bold text-[#ebdbb2]">$1</strong>');

  // 4. 斜體 *italic*
  result = result.replace(/\*([^*]+?)\*/g, '<em class="italic text-[#d5c4a1]">$1</em>');

  return result;
}
