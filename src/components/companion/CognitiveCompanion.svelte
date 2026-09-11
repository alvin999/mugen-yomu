<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SectionCompanionData } from '../../stores/documentStore';

  export let activeContextText: string = '§ 3.2.1 Scaled Dot-Product';
  export let companionData: SectionCompanionData | undefined = undefined;

  const dispatch = createEventDispatcher();

  let promptInput: string = '';
  let isThinking: boolean = false;

  interface MessageItem {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    time: string;
    cached?: boolean;
  }

  let messages: MessageItem[] = [
    {
      id: 'init_1',
      sender: 'ai',
      text: `已就緒！我正在感知您目前聚焦的章節「${activeContextText}」。您可以直接點選下方的蘇格拉底啟發問題，或對論文推導細節展開追問。`,
      time: '剛剛',
      cached: true
    }
  ];

  // Default fallback questions if not present in section
  $: activeQuestions = companionData?.socraticQuestions || [
    {
      id: 'default_1',
      icon: 'help_outline',
      color: 'text-[#fabd2f]',
      text: '本節的核心創新點與先前研究相比有哪些根本差異？',
      answerSummary: '本節主要聚焦於解決前人架構面臨的效率瓶頸，以更緊湊的計算拓撲達到更高的並行度。'
    },
    {
      id: 'default_2',
      icon: 'functions',
      color: 'text-[#8ec07c]',
      text: '文中所列之數學變數與超參數設定有何理論直覺？',
      answerSummary: '超參數通常基於方差歸一化考量，旨在確保正向傳播時數值穩定，避免推入非線性函數的飽和區。'
    }
  ];

  function sendQuestion(qText: string, presetAnswer?: string) {
    if (!qText.trim()) return;

    const userMsg: MessageItem = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: qText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages = [...messages, userMsg];

    isThinking = true;

    // Simulate AI generation with intelligent local cache fallback
    setTimeout(() => {
      const responseText = presetAnswer ||
        `針對「${qText}」的深入剖析：\n` +
        `在 ${activeContextText} 的語境中，作者主要利用代數變換將高維複雜度約束在正交子空間內。` +
        `這種設計使得梯度在反向傳播時不易發生彌散，同時具備高度硬體友善性。`;

      const aiMsg: MessageItem = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: responseText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cached: true
      };
      messages = [...messages, aiMsg];
      isThinking = false;
      dispatch('askQuestion', { query: qText, reply: responseText });
    }, 450);
  }

  function handleSubmit() {
    if (!promptInput.trim()) return;
    const q = promptInput;
    promptInput = '';
    sendQuestion(q);
  }

  function handleSaveMessageToNotes(text: string) {
    dispatch('quickAction', { action: 'saveSnippet', payload: text });
    alert('已將伴讀解答收錄至本機精讀筆記！');
  }
</script>

<aside class="h-full flex flex-col bg-[#1d2021] border-l border-[#3c3836] shadow-sm overflow-hidden select-none">
  <!-- Companion Header & Sync State -->
  <div class="p-2.5 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-2.5 h-2.5 rounded-full bg-[#fe8019] animate-pulse"></div>
      <span class="text-xs font-bold text-[#ebdbb2] flex items-center gap-1 font-sans">
        伴讀認知助理 <span class="font-mono text-[10px] text-[#fabd2f] font-normal">Active</span>
      </span>
    </div>

    <div class="flex items-center gap-1 text-[#a89984]">
      <span class="font-mono text-[9px] bg-[#282828] border border-[#504945] text-[#b8bb26] px-1.5 py-0.5 rounded">
        Zero-Delay
      </span>
    </div>
  </div>

  <!-- Realtime Content Cards Container -->
  <div class="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-3">
    <!-- Active Context Awareness Badge -->
    <div class="flex items-center gap-1.5 px-1 font-mono text-[10px] text-[#fe8019] truncate">
      <span class="material-symbols-outlined text-[13px] shrink-0">my_location</span>
      <span class="truncate">當前伴讀感應區：{activeContextText}</span>
    </div>

    <!-- 1. Scientific Intuition Card -->
    {#if companionData?.intuition}
      <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#fabd2f] font-bold uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">psychology</span>
            白話科研直覺 (Intuition)
          </span>
          <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/30 text-[#fabd2f] px-1.5 py-0.5 rounded font-medium">
            {companionData.intuition.tag}
          </span>
        </div>

        <h4 class="text-xs font-semibold text-[#ebdbb2]">
          {companionData.intuition.title}
        </h4>

        <div class="text-xs text-[#d5c4a1] leading-relaxed bg-[#1d2021] border border-[#3c3836] p-2.5 rounded-lg text-justify flex flex-col gap-1.5">
          {#each companionData.intuition.content as p}
            <p>{p}</p>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 2. Long Sentence Structural Breakdown (Syntax Tree) -->
    {#if companionData?.syntaxTree}
      <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex flex-col gap-2 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#8ec07c] font-bold uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
            長難句語法拆解 (Syntax Tree)
          </span>
          <span class="font-mono text-[10px] text-[#a89984]">{companionData.syntaxTree.line}</span>
        </div>

        <div class="font-mono text-[10px] text-[#a89984] bg-[#1d2021] border border-[#3c3836] p-2 rounded leading-snug">
          "{companionData.syntaxTree.snippet}"
        </div>

        <div class="flex flex-col gap-1 text-[11px]">
          {#each companionData.syntaxTree.svo as item}
            <div class="flex items-start gap-1.5 bg-[#32302f] border border-[#3c3836] p-1.5 rounded">
              <span class="font-mono text-[10px] font-bold shrink-0 {item.color}">{item.role}</span>
              <div class="flex flex-col">
                <span class="text-[#ebdbb2] font-medium">{item.text}</span>
                <span class="text-[#a89984] text-[10px]">{item.zh}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 3. Precise Academic Term Alignment -->
    {#if companionData?.terminology && companionData.terminology.length > 0}
      <div class="bg-[#282828] border border-[#3c3836] rounded-xl p-3 flex flex-col gap-2 shadow-sm">
        <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1 font-bold">
          <span class="material-symbols-outlined text-[14px] text-[#83a598]">translate</span>
          學術術語精準對齊 (Terminology)
        </span>
        <div class="flex flex-col gap-1.5">
          {#each companionData.terminology as term}
            <div class="flex items-center justify-between bg-[#1d2021] border border-[#3c3836] px-2 py-1.5 rounded text-xs">
              <span class="text-[#ebdbb2] font-medium">{term.term}</span>
              <span class="font-medium" style="color: {term.color}">{term.explanation}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 4. Proactive Socratic Inquiries -->
    <div class="flex flex-col gap-1.5">
      <span class="font-mono text-[10px] text-[#d3869b] uppercase tracking-wider px-1 font-bold flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]">tips_and_updates</span> 主動引導探索 (Socratic Inquiries)
      </span>

      {#each activeQuestions as sq}
        <button
          class="w-full text-left bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] p-2 rounded-lg text-[#d5c4a1] hover:text-[#ebdbb2] transition-all flex items-start gap-2 group"
          on:click={() => sendQuestion(sq.text, sq.answerSummary)}
        >
          <span class="material-symbols-outlined text-[14px] {sq.color} mt-0.5 shrink-0 group-hover:scale-110 transition-transform">{sq.icon}</span>
          <span class="text-xs leading-snug">{sq.text}</span>
        </button>
      {/each}
    </div>

    <!-- 5. Interactive Chat Stream History -->
    <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
      <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider px-1 font-bold flex items-center justify-between">
        <span>伴讀問答對話流 (Q&A Stream)</span>
        <span class="font-mono text-[9px] text-[#fabd2f]">{messages.length} 則探討</span>
      </span>

      <div class="flex flex-col gap-2.5">
        {#each messages as msg}
          <div class="flex flex-col gap-1 {msg.sender === 'user' ? 'items-end' : 'items-start'}">
            <div class="flex items-center gap-1.5 px-1 font-mono text-[9px] text-[#a89984]">
              <span>{msg.sender === 'user' ? '您' : 'AI 伴讀智庫'}</span>
              <span>· {msg.time}</span>
              {#if msg.cached}
                <span class="text-[#b8bb26]">[快取命中]</span>
              {/if}
            </div>

            <div class="max-w-[92%] p-2.5 rounded-xl text-xs leading-relaxed {msg.sender === 'user' ? 'bg-[#fe8019] text-[#1d2021] font-medium rounded-tr-none' : 'bg-[#282828] border border-[#3c3836] text-[#ebdbb2] rounded-tl-none shadow-sm'}">
              <p class="whitespace-pre-wrap">{msg.text}</p>
              
              {#if msg.sender === 'ai'}
                <div class="mt-2 pt-1 border-t border-[#3c3836] flex items-center justify-end">
                  <button
                    class="text-[10px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5"
                    on:click={() => handleSaveMessageToNotes(msg.text)}
                  >
                    <span class="material-symbols-outlined text-[12px]">note_add</span>
                    收錄至筆記
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if isThinking}
          <div class="flex items-center gap-2 p-2 bg-[#282828] border border-[#3c3836] rounded-lg text-xs text-[#fabd2f] font-mono animate-pulse">
            <span class="material-symbols-outlined text-[15px] animate-spin">sync</span>
            <span>伴讀正在結合當前段落展開數理推理...</span>
          </div>
        {/if}
      </div>
    </div>

  </div>

  <!-- Copilot Bottom Action Input Form -->
  <div class="p-2.5 bg-[#141617] border-t border-[#3c3836] shrink-0 flex flex-col gap-2">
    <!-- Quick buttons -->
    <div class="flex items-center gap-1.5">
      <button
        class="flex-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded font-mono text-[10px] flex items-center justify-center gap-1 transition-colors"
        on:click={() => sendQuestion(`請針對「${activeContextText}」展開最詳盡的數學推導證明與極限分析`)}
      >
        <span class="material-symbols-outlined text-[12px] text-[#fabd2f]">calculate</span> 追問推導細節
      </button>
      <button
        class="flex-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded font-mono text-[10px] flex items-center justify-center gap-1 transition-colors"
        on:click={() => dispatch('quickAction', { action: 'exportNotes' })}
      >
        <span class="material-symbols-outlined text-[12px] text-[#fe8019]">note_add</span> 輸出精讀筆記
      </button>
    </div>

    <!-- Input Form -->
    <form on:submit|preventDefault={handleSubmit} class="relative flex items-center">
      <input
        class="w-full bg-[#282828] border border-[#3c3836] text-[#ebdbb2] placeholder:text-[#a89984]/70 text-xs pl-2.5 pr-7 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] focus:bg-[#32302f] transition-colors"
        placeholder="對當前段落或推導深入提問... (Enter 發送)"
        type="text"
        bind:value={promptInput}
      />
      <button
        type="submit"
        class="absolute right-1 w-6 h-6 rounded bg-[#fe8019] text-[#1d2021] flex items-center justify-center hover:opacity-90 transition-opacity font-bold"
      >
        <span class="material-symbols-outlined text-[14px]">arrow_upward</span>
      </button>
    </form>

    <div class="flex items-center justify-between text-[#a89984] font-mono text-[9px] px-0.5">
      <span>本機快取命中 · 延遲 18ms</span>
      <span class="text-[#b8bb26] font-medium">智慧上下文感知中</span>
    </div>
  </div>
</aside>
