import { renderMath, escapeHtml } from './katexUtils';

/**
 * 簡易而安全的 Markdown + KaTeX 筆記渲染引擎
 * 專為學術精讀筆記設計，支援標題、代碼塊、清單、引文與 LaTeX 數學公式（相容 $$, \[\], $, \(\) 等各類模型輸出）
 */
export function renderNoteMarkdown(content: string): string {
  if (!content) return '<p class="text-[#7c6f64] italic text-xs">暫無內容</p>';

  const lines = content.split('\n');
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let inMathBlock = false;
  let mathDelimiter: '$$' | '\\]' = '$$';
  let mathBlockContent: string[] = [];

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

    // 2. 多行區塊數學公式處理 ($$ 或 \[ ... \] 或 $$)
    if (inMathBlock) {
      if (trimmed.endsWith(mathDelimiter) || trimmed === mathDelimiter) {
        const contentWithoutEnd = trimmed.endsWith(mathDelimiter)
          ? trimmed.slice(0, -mathDelimiter.length).trim()
          : '';
        if (contentWithoutEnd) mathBlockContent.push(contentWithoutEnd);
        const rendered = renderMath(mathBlockContent.join('\n').trim(), true);
        htmlParts.push(`<div class="my-3 py-2 px-3 bg-[#141617] border border-[#3c3836] rounded-lg text-center overflow-x-auto text-[#fabd2f] select-text shadow-inner">${rendered}</div>`);
        mathBlockContent = [];
        inMathBlock = false;
      } else {
        mathBlockContent.push(line);
      }
      continue;
    }

    // 3. 空行
    if (!trimmed) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // 4. 單行區塊數學公式 ($$ ... $$ 或 \[ ... \])
    const singleBlockMatch = trimmed.match(/^(\$\$|\\\[)([\s\S]+?)(\$\$|\\\])$/);
    if (singleBlockMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const rendered = renderMath(singleBlockMatch[2].trim(), true);
      htmlParts.push(`<div class="my-3 py-2 px-3 bg-[#141617] border border-[#3c3836] rounded-lg text-center overflow-x-auto text-[#fabd2f] select-text shadow-inner">${rendered}</div>`);
      continue;
    }

    // 5. 多行區塊數學公式開始 ($$ 或 \[)
    if (trimmed === '$$' || (trimmed.startsWith('$$') && !trimmed.slice(2).includes('$$'))) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      inMathBlock = true;
      mathDelimiter = '$$';
      const rest = trimmed.slice(2).trim();
      if (rest) mathBlockContent.push(rest);
      continue;
    }

    if (trimmed === '\\[' || (trimmed.startsWith('\\[') && !trimmed.slice(2).includes('\\]'))) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      inMathBlock = true;
      mathDelimiter = '\\]';
      const rest = trimmed.slice(2).trim();
      if (rest) mathBlockContent.push(rest);
      continue;
    }

    // 6. 檢查 Markdown 表格 (| 表頭1 | 表頭2 |)
    if (trimmed.includes('|') && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const tableResult = parseTable(lines, i);
      if (tableResult) {
        htmlParts.push(tableResult.html);
        i = tableResult.nextIndex;
        continue;
      }
    }

    // 7. 標題 (#, ##, ###)
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

    // 8. 引用區塊 (> quote)
    if (trimmed.startsWith('>')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      const quoteText = renderInline(trimmed.replace(/^>\s*/, ''));
      htmlParts.push(`<blockquote class="border-l-2 border-[#fe8019] pl-3 py-1 my-2 text-xs text-[#d5c4a1] bg-[#141617]/40 rounded-r italic">${quoteText}</blockquote>`);
      continue;
    }

    // 9. 水平分隔線 (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push('<hr class="my-3 border-t border-[#3c3836]" />');
      continue;
    }

    // 10. 清單項目 (- item, * item, • item, 1. item)
    const bulletMatch = trimmed.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        htmlParts.push('<ul class="list-disc list-inside my-1.5 space-y-1 text-xs text-[#ebdbb2]">');
        inList = true;
      }
      const itemText = renderInline(bulletMatch[2]);
      htmlParts.push(`<li>${itemText}</li>`);
      continue;
    }

    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    // 11. 一般段落
    htmlParts.push(`<p class="my-1.5 text-xs text-[#d5c4a1] leading-relaxed select-text">${renderInline(line)}</p>`);
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  if (inMathBlock && mathBlockContent.length > 0) {
    const rendered = renderMath(mathBlockContent.join('\n').trim(), true);
    htmlParts.push(`<div class="my-3 py-2 px-3 bg-[#141617] border border-[#3c3836] rounded-lg text-center overflow-x-auto text-[#fabd2f] select-text shadow-inner">${rendered}</div>`);
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    htmlParts.push(`<pre class="bg-[#141617] border border-[#3c3836] rounded-lg p-3 my-2 text-xs font-mono text-[#ebdbb2] overflow-x-auto"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }

  return htmlParts.join('\n');
}

/**
 * 處理行內樣式：行內代碼、粗體、斜體、KaTeX 行內數學公式 ($...$, \(...\), 行內 \[...\])
 */
function renderInline(text: string): string {
  if (!text) return '';

  // 1. 處理行內獨立區塊公式 \[ ... \] (若出現在清單或句子中)
  let result = text.replace(/\\\[([\s\S]+?)\\\]/g, (_match, latex) => {
    return `<div class="my-2 py-1.5 px-3 bg-[#141617] border border-[#3c3836] rounded text-center overflow-x-auto text-[#fabd2f] select-text">${renderMath(latex.trim(), true)}</div>`;
  });

  // 2. 處理行內數學公式 \(latex\)
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_match, latex) => {
    return `<span class="inline-block px-0.5 text-[#fabd2f] font-mono">${renderMath(latex.trim(), false)}</span>`;
  });

  // 3. 處理行內數學公式 $latex$ (排除轉義的 \$)
  result = result.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_match, latex) => {
    return `<span class="inline-block px-0.5 text-[#fabd2f] font-mono">${renderMath(latex.trim(), false)}</span>`;
  });

  // 4. 行內代碼 `code`
  result = result.replace(/`([^`\n]+?)`/g, (_match, code) => {
    return `<code class="px-1.5 py-0.5 rounded bg-[#141617] text-[#fe8019] font-mono text-[11px] border border-[#3c3836]">${escapeHtml(code)}</code>`;
  });

  // 5. 粗體 **bold**
  result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong class="font-bold text-[#ebdbb2]">$1</strong>');

  // 6. 斜體 *italic*
  result = result.replace(/\*([^*]+?)\*/g, '<em class="italic text-[#d5c4a1]">$1</em>');

  return result;
}

/**
 * 安全切分 Markdown 表格行，保護代碼區塊與轉義的管道符號
 */
function splitTableRow(str: string): string[] {
  let s = str.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  let inBacktick = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    const prevChar = i > 0 ? s[i - 1] : '';

    if (char === '`' && prevChar !== '\\') {
      inBacktick = !inBacktick;
      current += char;
    } else if (char === '|' && !inBacktick && prevChar !== '\\') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * 檢查是否為有效的 Markdown 表格分隔線 (如 |---|:---:|---:|)
 */
function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-') || !trimmed.includes('|')) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every(cell => /^:?-+:?$/.test(cell.trim()));
}

/**
 * 解析 GFM Markdown 表格並產出深色 Gruvbox 風格 HTML
 */
function parseTable(lines: string[], startIndex: number): { html: string; nextIndex: number } | null {
  const headerLine = lines[startIndex].trim();
  if (startIndex + 1 >= lines.length) return null;
  const delimiterLine = lines[startIndex + 1].trim();

  // 驗證 delimiterLine 是否為有效表格分隔線
  if (!isDelimiterRow(delimiterLine)) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  const delimiterCells = splitTableRow(delimiterLine);

  const alignments = delimiterCells.map(cell => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  const bodyRows: string[][] = [];
  let curr = startIndex + 2;
  while (curr < lines.length) {
    const rowLine = lines[curr].trim();
    if (!rowLine || !rowLine.includes('|') || rowLine.startsWith('```') || rowLine.startsWith('#')) {
      break;
    }
    bodyRows.push(splitTableRow(rowLine));
    curr++;
  }

  let tableHtml = '<div class="my-3 overflow-x-auto rounded-lg border border-[#3c3836] bg-[#141617]/80 shadow-md">';
  tableHtml += '<table class="w-full text-left text-xs border-collapse">';
  tableHtml += '<thead><tr class="bg-[#282828] border-b border-[#3c3836] text-[#fabd2f] font-semibold tracking-wide">';

  headers.forEach((h, idx) => {
    const align = alignments[idx] || 'left';
    const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
    tableHtml += `<th class="px-3.5 py-2.5 border-r border-[#3c3836]/60 last:border-r-0 ${alignClass}">${renderInline(h)}</th>`;
  });
  tableHtml += '</tr></thead>';

  tableHtml += '<tbody class="divide-y divide-[#3c3836]/40">';
  bodyRows.forEach((row, rowIdx) => {
    const rowBg = rowIdx % 2 === 1 ? 'bg-[#1d2021]/60' : 'bg-transparent';
    tableHtml += `<tr class="${rowBg} hover:bg-[#32302f]/50 transition-colors">`;
    headers.forEach((_, idx) => {
      const cell = row[idx] || '';
      const align = alignments[idx] || 'left';
      const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
      tableHtml += `<td class="px-3.5 py-2 text-[#ebdbb2] border-r border-[#3c3836]/30 last:border-r-0 ${alignClass} leading-relaxed">${renderInline(cell)}</td>`;
    });
    tableHtml += '</tr>';
  });
  tableHtml += '</tbody></table></div>';

  return { html: tableHtml, nextIndex: curr - 1 };
}
