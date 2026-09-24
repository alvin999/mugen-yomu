<script lang="ts">
  import { onMount } from 'svelte';
  import hljs from 'highlight.js';

  export let code: string = '';
  export let language: string = '';
  export let paperTheme: 'parchment' | 'dark' = 'parchment';
  export let dataParaKey: string = '';
  export let dataSecId: string = '';

  let isCopied = false;
  let copyTimeout: any = null;

  $: cleanCode = (code || '').trim();

  // 智慧語法高亮與語言識別
  $: highlightResult = (() => {
    if (!cleanCode) return { language: 'plaintext', html: '' };

    try {
      if (language && hljs.getLanguage(language)) {
        const res = hljs.highlight(cleanCode, { language });
        return { language: res.language || language, html: res.value };
      }
      // 自動偵測語言 (例如 Python, Bash, C, JavaScript 等)
      const res = hljs.highlightAuto(cleanCode, ['python', 'bash', 'c', 'cpp', 'javascript', 'typescript', 'rust', 'go', 'json', 'html', 'css', 'sql']);
      return { language: res.language || 'code', html: res.value };
    } catch {
      return { language: language || 'code', html: escapeHtml(cleanCode) };
    }
  })();

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cleanCode);
      isCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        isCopied = false;
      }, 2000);
    }
  }
</script>

<div
  class="my-3 rounded-lg overflow-hidden border font-mono text-[13px] leading-relaxed transition-all shadow-sm {
    paperTheme === 'parchment'
      ? 'bg-[#f5f0e6] border-[#ded5c5] text-[#282828]'
      : 'bg-[#181a1b] border-[#3c3836] text-[#ebdbb2]'
  }"
  data-para-key={dataParaKey}
  data-sec-id={dataSecId}
  data-para-text={cleanCode}
>
  <!-- Code Block Header: Language Badge & Copy Button -->
  <div class="px-3 py-1.5 flex items-center justify-between border-b text-[10px] select-none {
    paperTheme === 'parchment'
      ? 'bg-[#eee7d8] border-[#ded5c5] text-[#7c6f64]'
      : 'bg-[#141617] border-[#3c3836] text-[#a89984]'
  }">
    <div class="flex items-center gap-1.5 font-bold tracking-wider uppercase">
      <span class="w-2 h-2 rounded-full {paperTheme === 'parchment' ? 'bg-[#b57614]' : 'bg-[#fe8019]'}"></span>
      <span>{highlightResult.language || 'CODE'}</span>
    </div>

    <button
      class="px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 text-[11px] font-mono {
        isCopied
          ? 'text-[#b8bb26] font-bold'
          : (paperTheme === 'parchment' ? 'hover:bg-[#e2dac8] text-[#504945]' : 'hover:bg-[#282828] text-[#d5c4a1]')
      }"
      on:click={handleCopy}
      title="複製程式碼"
    >
      <span class="material-symbols-outlined text-[13px]">{isCopied ? 'check' : 'content_copy'}</span>
      <span>{isCopied ? '已複製' : '複製'}</span>
    </button>
  </div>

  <!-- Highlighted Code Viewport -->
  <pre class="p-3.5 overflow-x-auto select-text scrollbar-thin"><code class="hljs block whitespace-pre">{@html highlightResult.html}</code></pre>
</div>

<style>
  /* Gruvbox & Parchment 自適應語法高亮顏色 */
  :global(.hljs-keyword),
  :global(.hljs-selector-tag),
  :global(.hljs-built_in) {
    color: #fe8019; /* 關鍵字橘色 */
    font-weight: 600;
  }
  :global(.hljs-string),
  :global(.hljs-meta) {
    color: #b8bb26; /* 字串橄欖綠 */
  }
  :global(.hljs-title),
  :global(.hljs-title.class_),
  :global(.hljs-title.function_) {
    color: #8ec07c; /* 函式/類別青色 */
    font-weight: 600;
  }
  :global(.hljs-comment),
  :global(.hljs-quote) {
    color: #928374; /* 註解質感灰 */
    font-style: italic;
  }
  :global(.hljs-number),
  :global(.hljs-literal) {
    color: #d3869b; /* 數字粉紫色 */
  }
  :global(.hljs-variable),
  :global(.hljs-params) {
    color: #83a598; /* 參數變數冰藍 */
  }
  :global(.hljs-subst),
  :global(.hljs-attr) {
    color: #fabd2f; /* 屬性亮黃 */
  }
</style>
