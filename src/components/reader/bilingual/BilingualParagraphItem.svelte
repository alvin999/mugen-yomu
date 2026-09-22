<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChapterSection } from '../../../types/document';
  import type { NormalizedParagraphItem } from '../../../utils/paragraphUtils';
  import { renderMath, escapeHtml, copyLatexToClipboard } from '../../../utils/katexUtils';
  import { countWords } from '../../../stores/flowStore';

  export let item: NormalizedParagraphItem;
  export let sec: ChapterSection;
  export let totalTextParas: number = 1;
  export let readingMode: 'bilingual' | 'split' | 'zen' | 'figures' = 'bilingual';
  export let isParaFocused: boolean = false;
  export let isPacerActive: boolean = false;
  export let targetPacingWpm: number = 240;
  export let showTranslation: boolean = false;
  export let isTranslating: boolean = false;
  export let isTyping: boolean = false;
  export let translationText: string = '';
  export let translationSource: string = '';
  export let translationNotice: string = '';
  export let copyToastText: string | null = null;

  const dispatch = createEventDispatcher<{
    paragraphClick: { secId: string; pIndex: number; text: string; clickCharIdx?: number };
    askCompanion: { sec: ChapterSection; pIndex: number; text: string };
    toggleTranslation: { secId: string; pIndex: number; text: string };
    retranslate: { secId: string; pIndex: number; text: string };
    openLightbox: { url: string; caption?: string };
    copyLatex: { latex: string };
    copyTranslation: { text: string };
    saveNote: { title: string; text: string };
    skipTyping: void;
    openSettings: void;
  }>();

  function parseLinksAndText(rawText: string, currentMode: string): string {
    if (!rawText) return '';
    const linkRegex = /(?<!!)\[([^\[\]]+)\]\(((?:https?:\/\/|#)[^\s'")]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const res: string[] = [];

    while ((m = linkRegex.exec(rawText)) !== null) {
      if (m.index > last) {
        res.push(escapeHtml(rawText.slice(last, m.index)));
      }
      const anchor = escapeHtml(m[1]);
      const url = m[2].replace(/"/g, '&quot;');
      const cleanAnchor = anchor.trim();
      const isCitation = /^\[?\d+(?:[,\s–\-]+\d+)*\]?$/.test(cleanAnchor) || url.includes('#B') || url.includes('foods-') || url.includes('arxiv');
      if (isCitation) {
        const displayNum = cleanAnchor.replace(/^\[|\]$/g, '');
        const probeBtn = currentMode !== 'zen'
          ? `<button type="button" class="cite-probe-btn text-[#a89984] hover:text-[#fe8019] px-0.5 rounded cursor-pointer transition-transform hover:scale-125 text-[11px]" title="向 AI 伴讀助理探詢此引文背景與論證目的" data-citation="[${displayNum}]">🤖</button>`
          : '';
        res.push(`<span class="inline-flex items-center gap-0.5 mx-0.5 align-baseline group/cite bg-[#1d2021]/80 px-1 py-0.2 rounded border border-[#504945]/60 hover:border-[#fe8019] transition-all"><a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[#fabd2f] hover:text-[#fe8019] underline decoration-[#fabd2f]/40 hover:decoration-[#fe8019] font-mono text-[12px] font-bold cursor-pointer" title="查看引文來源：${url}">[${displayNum}]</a>${probeBtn}</span>`);
      } else {
        res.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center text-[#8ec07c] hover:text-[#b8bb26] underline decoration-[#8ec07c]/40 hover:decoration-[#b8bb26] transition-colors font-medium px-0.5 rounded hover:bg-[#8ec07c]/10 cursor-pointer" title="${url}">${anchor}</a>`);
      }
      last = linkRegex.lastIndex;
    }

    if (last < rawText.length) {
      res.push(escapeHtml(rawText.slice(last)));
    }

    return res.join('');
  }

  function formatParagraphWithMath(text: string, currentMode: string): string {
    if (!text) return '';
    if (!text.includes('$')) {
      return parseLinksAndText(text, currentMode);
    }

    const parts: string[] = [];
    let lastIndex = 0;
    const regex = /\$([^$\n]+?)\$/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(parseLinksAndText(text.slice(lastIndex, match.index), currentMode));
      }
      const mathContent = match[1];
      parts.push(renderMath(mathContent, false));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(parseLinksAndText(text.slice(lastIndex), currentMode));
    }

    return parts.join('');
  }

  /**
   * 對段落內一個點按事件，計算點擊位置最接近的字元 index
   * 利用 caretRangeFromPoint / caretPositionFromPoint 準確定位
   */
  function getClickCharIdx(e: MouseEvent, textRootEl: HTMLElement | null): number {
    if (!textRootEl) return 0;
    try {
      // 標準方法 (Chrome/Safari)
      if ((document as any).caretRangeFromPoint) {
        const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY) as Range | null;
        if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
          return getCharIndexInTextRoot(textRootEl, range.startContainer as Text, range.startOffset);
        }
      }
      // Firefox 備案
      if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
        if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
          return getCharIndexInTextRoot(textRootEl, pos.offsetNode as Text, pos.offset);
        }
      }
    } catch (err) {
      // 靜默失敗回到 0
    }
    return 0;
  }

  /**
   * 計算特定文字節點 (textNode) 內 offset 在整個 textRoot 下所有文字節點累積的全局 char index
   */
  function getCharIndexInTextRoot(root: HTMLElement, targetNode: Text, targetOffset: number): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text)) {
      if (node === targetNode) {
        return charCount + Math.max(0, targetOffset);
      }
      charCount += (node.nodeValue || '').length;
    }
    return charCount;
  }

  function handleParagraphWrapperClick(e: MouseEvent, pIndex: number, paraText: string) {
    e.stopPropagation();
    // 若正在選取文字（滑鼠拖曳反白），不觸發段落焦點切換，保護選取狀態
    if (typeof window !== 'undefined') {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        return;
      }
    }
    // 計算點擊字元 index：尋找段落內 .para-main-text 元素
    const paraEl = (e.currentTarget as HTMLElement);
    const textRoot = paraEl.querySelector<HTMLElement>('.para-main-text') || paraEl.querySelector<HTMLElement>('p');
    const clickCharIdx = getClickCharIdx(e, textRoot);
    dispatch('paragraphClick', { secId: sec.id, pIndex, text: paraText, clickCharIdx });
  }
</script>

{#if item.type === 'subheading'}
  <!-- Academic Subheading -->
  <div class="mt-4 mb-1 flex items-center gap-2 border-b border-[#3c3836]/60 pb-1.5 pt-1">
    <span class="w-1.5 h-3.5 bg-[#fe8019] rounded-xs shrink-0"></span>
    <h3 class="font-serif font-bold text-[16px] text-[#ebdbb2] tracking-tight">
      {item.text}
    </h3>
  </div>

{:else if item.type === 'image' && item.url}
  <!-- Inline Markdown Image Figure Card -->
  <figure class="my-2 p-4 bg-[#1d2021] border border-[#504945] rounded-xl flex flex-col items-center gap-3 shadow-md group/img">
    <div class="w-full flex items-center justify-between text-xs font-mono text-[#fabd2f] border-b border-[#3c3836] pb-2">
      <span class="flex items-center gap-1.5 font-bold">
        <span class="material-symbols-outlined text-[15px] text-[#fe8019]">image</span>
        {item.alt || '論文架構分析圖表'}
      </span>
      <div class="flex items-center gap-2 text-[#a89984]">
        <button
          class="hover:text-[#fe8019] flex items-center gap-1 text-[11px] cursor-pointer"
          on:click|stopPropagation={() => dispatch('openLightbox', { url: item.url || '', caption: item.alt })}
          title="放大檢視"
        >
          <span class="material-symbols-outlined text-[13px]">fullscreen</span>
          <span>放大鏡</span>
        </button>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-[#ebdbb2] flex items-center gap-0.5 text-[11px]"
          title="在新分頁開啟"
        >
          <span class="material-symbols-outlined text-[13px]">open_in_new</span>
        </a>
      </div>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="w-full flex items-center justify-center p-2 rounded bg-[#141617] border border-[#3c3836] overflow-hidden cursor-zoom-in"
      on:click|stopPropagation={() => dispatch('openLightbox', { url: item.url || '', caption: item.alt })}
    >
      <img
        src={item.url}
        alt={item.alt || ''}
        referrerpolicy="no-referrer"
        class="max-h-[380px] max-w-full object-contain rounded transition-transform group-hover/img:scale-[1.01]"
        loading="lazy"
      />
    </div>

    {#if item.alt}
      <figcaption class="text-xs text-[#a89984] font-serif italic text-center max-w-[90%] leading-relaxed">
        {item.alt}
      </figcaption>
    {/if}
  </figure>

{:else if item.type === 'formula' && item.latex}
  <!-- Inline KaTeX Block Formula Card -->
  <div
    id={`eq-${sec.id}-${item.originalIndex}`}
    data-equation-number={item.number ? item.number.replace(/[^0-9a-zA-Z]/g, '') : ''}
    data-raw-number={item.number || ''}
    data-formula-latex={item.latex || ''}
    class="my-3 p-4 bg-[#1d2021] border border-[#504945] rounded-xl flex flex-col items-center justify-center relative shadow-inner group/display-math transition-all duration-300"
  >
    <div class="w-full flex items-center justify-between text-xs font-mono text-[#fabd2f] border-b border-[#3c3836]/60 pb-2 mb-2">
      <span class="flex items-center gap-1.5 font-semibold">
        <span class="material-symbols-outlined text-[15px] text-[#fe8019]">functions</span>
        <span>核心方程式 (Mathematical Equation)</span>
        {#if item.number}
          <span class="font-mono text-[#fe8019] bg-[#fe8019]/10 border border-[#fe8019]/30 px-2 py-0.5 rounded font-bold ml-1">
            {item.number}
          </span>
        {/if}
      </span>
      <div class="flex items-center gap-2">
        {#if copyToastText}
          <span class="font-mono text-[10px] text-[#b8bb26] bg-[#b8bb26]/15 border border-[#b8bb26]/40 px-2 py-0.5 rounded animate-fade-in">
            {copyToastText}
          </span>
        {/if}
        <button
          class="text-[#a89984] hover:text-[#ebdbb2] text-[11px] flex items-center gap-1 cursor-pointer transition-colors bg-[#282828] border border-[#3c3836] px-2 py-0.5 rounded"
          on:click|stopPropagation={() => dispatch('copyLatex', { latex: item.latex || '' })}
          title="複製 LaTeX 程式原始碼"
        >
          <span class="material-symbols-outlined text-[13px]">content_copy</span>
          <span>複製 LaTeX</span>
        </button>
      </div>
    </div>
    <div class="w-full flex items-center justify-between py-2 overflow-x-auto text-[#ebdbb2] px-2">
      <div class="text-[19px] px-2 select-text mx-auto">
        {@html renderMath(item.latex, true)}
      </div>
      {#if item.number}
        <span class="font-mono text-[#fabd2f] font-semibold text-sm select-none shrink-0 pl-3">
          {item.number}
        </span>
      {/if}
    </div>
  </div>

{:else if item.type === 'text' && item.text}
  {@const pIndex = item.originalIndex}
  {@const key = `${sec.id}_${pIndex}`}
  {@const para = item.text}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    id={`para-${key}`}
    class="flex flex-col gap-2 group/para relative rounded-lg p-2.5 transition-all duration-200 {isParaFocused ? (totalTextParas === 1 ? 'bg-[#32302f]/80 shadow-xs' : 'bg-[#32302f] ring-1 ring-[#fe8019]/50 shadow-sm') : 'hover:bg-[#282828]/50'}"
    data-para-key={key}
    data-para-text={para}
    data-sec-id={sec.id}
    on:click={(e) => handleParagraphWrapperClick(e, pIndex, para)}
  >
    {#if isParaFocused && isPacerActive}
      <!-- Saccadic Flow Pacer Visual Beam Guide -->
      <div class="absolute -left-1 top-2 bottom-2 w-1 rounded-full bg-[#3c3836]/60 overflow-hidden pointer-events-none z-10" title="閱讀心流視線導引">
        <div
          class="w-full bg-gradient-to-b from-[#fabd2f] via-[#fe8019] to-[#d65d0e] shadow-[0_0_8px_#fe8019] rounded-full animate-saccadic-scan"
          style="animation-duration: {Math.max(2.8, Math.min(25, Math.round((countWords(para) / Math.max(120, targetPacingWpm)) * 60)))}s;"
        ></div>
      </div>
    {/if}

    <!-- Paragraph Quick Micro-Toolbar -->
    <div class="flex items-center justify-between opacity-0 group-hover/para:opacity-100 {isParaFocused ? '!opacity-100' : ''} transition-opacity duration-150 text-[11px] font-mono text-[#a89984] border-b border-[#3c3836]/40 pb-1 mb-0.5">
      <div class="flex items-center gap-1.5">
        <span class="text-[#fe8019] font-bold">¶ {pIndex + 1}</span>
        {#if isParaFocused && readingMode !== 'zen'}
          <span class="text-[10px] bg-[#fe8019]/15 text-[#fe8019] border border-[#fe8019]/40 px-1.5 py-0.2 rounded font-sans">研讀焦點</span>
        {/if}
        {#if isParaFocused && isPacerActive}
          <span class="text-[10px] bg-[#fe8019]/15 text-[#fe8019] border border-[#fe8019]/40 px-1.5 py-0.2 rounded font-mono flex items-center gap-1">
            <span class="material-symbols-outlined text-[11px] animate-pulse text-[#fabd2f]">auto_read_play</span>
            <span>{targetPacingWpm} wpm 節奏中</span>
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-1.5">
        {#if readingMode !== 'zen'}
          <button
            type="button"
            class="flex items-center gap-1 bg-[#1d2021] hover:bg-[#3c3836] text-[#fabd2f] hover:text-[#fe8019] border border-[#504945] px-2 py-0.5 rounded cursor-pointer transition-colors shadow-xs"
            on:click|stopPropagation={() => dispatch('askCompanion', { sec, pIndex, text: para })}
            title="將此段設為研讀焦點並向 AI 伴讀提問"
          >
            <span class="material-symbols-outlined text-[13px]">psychology</span>
            <span>伴讀提問</span>
          </button>
        {/if}
        <button
          type="button"
          class="flex items-center gap-1 bg-[#1d2021] hover:bg-[#3c3836] text-[#8ec07c] hover:text-[#b8bb26] border border-[#504945] px-2 py-0.5 rounded cursor-pointer transition-colors shadow-xs"
          on:click|stopPropagation={() => dispatch('toggleTranslation', { secId: sec.id, pIndex, text: para })}
          title="切換繁體中文精確翻譯"
        >
          <span class="material-symbols-outlined text-[13px]">translate</span>
          <span>{showTranslation ? '收起翻譯' : '逐段對照'}</span>
        </button>
      </div>
    </div>

    <!-- English paragraph with inline KaTeX math and typography -->
    <p class="para-main-text font-serif text-[17px] text-[#ebdbb2]/95 leading-[33px] text-justify w-full tracking-[0.01em] select-text break-words">
      {@html formatParagraphWithMath(para, readingMode)}
    </p>

    <!-- Inline Translated Card -->
    {#if showTranslation}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="mt-1 p-4 bg-[#1d2021] border-l-4 border-[#fabd2f] rounded-r-xl flex flex-col gap-2 shadow-lg text-[#ebdbb2] animate-fade-in cursor-default"
        on:click={() => { if (isTyping) dispatch('skipTyping'); }}
        title={isTyping ? "點擊可立即跳過打字動畫顯示全文" : ""}
      >
        <div class="flex items-center justify-between text-[11px] font-mono text-[#a89984] border-b border-[#3c3836]/60 pb-2">
          <span class="flex items-center gap-1.5 text-[#fabd2f] font-semibold">
            {#if isTyping}
              <span class="material-symbols-outlined text-[15px] animate-spin text-[#fe8019]">sync</span>
              <span>繁體中文對照 · 即時生成中...</span>
            {:else}
              <span class="material-symbols-outlined text-[15px]">translate</span>
              <span>繁體中文對照</span>
            {/if}
          </span>
          <div class="flex items-center gap-2">
            {#if translationSource}
              <span class="text-[10px] text-[#8ec07c] bg-[#282828] px-2 py-0.5 rounded border border-[#504945]">
                {translationSource}
              </span>
            {/if}
            <button
              type="button"
              class="hover:text-[#fe8019] flex items-center gap-0.5 cursor-pointer text-[#a89984] transition-colors"
              on:click|stopPropagation={() => dispatch('copyTranslation', { text: translationText })}
              title="複製繁體譯文"
            >
              <span class="material-symbols-outlined text-[13px]">content_copy</span>
              <span>複製</span>
            </button>
            <button
              type="button"
              class="hover:text-[#fabd2f] flex items-center gap-0.5 cursor-pointer text-[#a89984] transition-colors"
              on:click|stopPropagation={() => dispatch('saveNote', {
                title: `對照筆記 · §${sec.title.split(' ')[0]} ¶${pIndex + 1}`,
                text: `> ${para}\n\n**中文譯文**：\n${translationText}`
              })}
              title="將本段中英對照存入筆記庫"
            >
              <span class="material-symbols-outlined text-[13px]">save</span>
              <span>存筆記</span>
            </button>
            <button
              type="button"
              class="hover:text-[#8ec07c] flex items-center gap-0.5 cursor-pointer text-[#a89984] transition-colors"
              on:click|stopPropagation={() => dispatch('retranslate', { secId: sec.id, pIndex, text: para })}
              title="重新向 AI 請求翻譯"
            >
              <span class="material-symbols-outlined text-[13px]">refresh</span>
              <span>重新翻譯</span>
            </button>
          </div>
        </div>

        {#if translationNotice}
          <div class="text-[11px] text-[#fabd2f] bg-[#fabd2f]/10 border border-[#fabd2f]/30 px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="material-symbols-outlined text-[14px] shrink-0 text-[#fe8019]">info</span>
              <span class="leading-tight">{translationNotice}</span>
            </div>
            {#if translationNotice.includes('尚未設定') || translationNotice.includes('BYOK') || translationNotice.includes('金鑰')}
              <button
                type="button"
                class="font-mono text-[10px] bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold px-2 py-0.5 rounded cursor-pointer transition-colors shadow-xs ml-auto shrink-0 flex items-center gap-1"
                on:click|stopPropagation={() => dispatch('openSettings')}
              >
                <span class="material-symbols-outlined text-[12px]">tune</span>
                <span>前往設定金鑰</span>
              </button>
            {/if}
          </div>
        {/if}

        <div class="text-base text-[#ebdbb2] leading-relaxed select-text font-serif">
          {#if isTranslating && !translationText}
            <div class="flex items-center gap-2 text-xs text-[#a89984] py-2">
              <span class="inline-block w-3.5 h-3.5 border-2 border-[#fabd2f] border-t-transparent rounded-full animate-spin"></span>
              <span>正在向學術模型請求地道繁體中文翻譯...</span>
            </div>
          {:else}
            <p class="leading-[29px] text-[#ebdbb2]/90">
              {@html formatParagraphWithMath(translationText, readingMode)}
              {#if isTyping}
                <span class="inline-block w-1.5 h-4 bg-[#fe8019] ml-0.5 align-middle animate-pulse"></span>
              {/if}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
