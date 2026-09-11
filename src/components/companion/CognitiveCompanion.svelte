<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { SectionCompanionData } from '../../stores/documentStore';
  import { callProviderChat, type ChatMessage } from '../../services/aiService';

  export let activeContextText: string = '§ 3.2.1 Scaled Dot-Product';
  export let companionData: SectionCompanionData | undefined = undefined;

  const dispatch = createEventDispatcher();

  let promptInput: string = '';
  let isThinking: boolean = false;
  let apiKey: string = '';
  let ollamaUrl: string = 'http://localhost:11434';
  let activeModel: string = 'llama-3.3-70b-versatile';
  let activeProvider: string = 'groq';

  interface MessageItem {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    time: string;
    cached?: boolean;
    tag?: string;
  }

  let messages: MessageItem[] = [
    {
      id: 'init_1',
      sender: 'ai',
      text: `伴讀認知助理已就緒！我正在感知章節「${activeContextText}」。您可以直接點選下方的蘇格拉底啟發問題，或對論文推導細節展開深入提問。`,
      time: '剛剛',
      cached: true,
      tag: '本機認知核心'
    }
  ];

  onMount(() => {
    refreshKeyFromStorage();
  });

  export function refreshKeyFromStorage() {
    if (typeof window !== 'undefined') {
      activeProvider = localStorage.getItem('mugen_provider') || 'groq';
      apiKey = localStorage.getItem(`mugen_key_${activeProvider}`) || localStorage.getItem('mugen_key_groq') || '';
      activeModel = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
      ollamaUrl = localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434';
    }
  }

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

  async function sendQuestion(qText: string, presetAnswer?: string) {
    if (!qText.trim()) return;

    refreshKeyFromStorage();

    const userMsg: MessageItem = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: qText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages = [...messages, userMsg];

    isThinking = true;

    const isLocalOllama = activeProvider === 'ollama';
    // 1. If API Key is present or Ollama local is chosen, invoke live AI!
    if ((apiKey && apiKey.trim().length > 5) || isLocalOllama) {
      try {
        const history: ChatMessage[] = messages.slice(-5).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

        const contextualPrompt = `[當前研讀章節: ${activeContextText}]\n${qText}`;
        history.push({ role: 'user', content: contextualPrompt });

        const result = await callProviderChat(activeProvider, history, apiKey, activeModel, ollamaUrl);

        const aiMsg: MessageItem = {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: result.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cached: result.cached,
          tag: result.cached
            ? `本機快取 · ${result.model} · ${result.latencyMs}ms`
            : `${result.provider.toUpperCase()} (${result.model}) · ${result.latencyMs}ms`
        };

        messages = [...messages, aiMsg];
        dispatch('askQuestion', { query: qText, reply: result.reply, cached: result.cached });
      } catch (err: any) {
        console.warn(`${activeProvider} API call failed, fallback to local scholar engine:`, err);
        fallbackLocalResponse(qText, presetAnswer, `${activeProvider.toUpperCase()} 連線異常: ${err.message || '已切換至本機備用'}`);
      } finally {
        isThinking = false;
      }
    } else {
      // 2. Offline Expert Scholar Engine
      setTimeout(() => {
        fallbackLocalResponse(qText, presetAnswer);
        isThinking = false;
      }, 350);
    }
  }

  function fallbackLocalResponse(qText: string, presetAnswer?: string, customTag?: string) {
    const responseText = presetAnswer ||
      `針對「${qText}」的學術深度剖析：\n` +
      `在 ${activeContextText} 的脈絡中，作者旨在透過正交子空間將計算複雜度從序列展開降至矩陣並行。` +
      `這種設計有效阻絕了長序列下的梯度衰減問題。`;

    const aiMsg: MessageItem = {
      id: `ai_${Date.now()}`,
      sender: 'ai',
      text: responseText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cached: true,
      tag: customTag || '本機專家智庫 · 16ms'
    };
    messages = [...messages, aiMsg];
    dispatch('askQuestion', { query: qText, reply: responseText });
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

  function handleOpenSettings() {
    dispatch('openSettings');
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

    <!-- Provider & Model Pill -->
    <div class="flex items-center gap-1.5 text-[#a89984]">
      <span class="font-mono text-[9px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-1.5 py-0.5 rounded truncate max-w-[120px]">
        {activeProvider === 'groq' ? '⚡ Groq LPU' : activeProvider.toUpperCase()}
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
      <div class="flex items-center justify-between px-1 font-mono text-[10px] text-[#a89984] uppercase tracking-wider font-bold">
        <span>伴讀對話流 (Q&A Stream)</span>
        {#if !apiKey && activeProvider !== 'ollama'}
          <button
            class="text-[#fabd2f] hover:underline flex items-center gap-0.5 normal-case"
            on:click={handleOpenSettings}
          >
            <span class="material-symbols-outlined text-[12px]">key</span>
            設定 {activeProvider.toUpperCase()} Key
          </button>
        {/if}
      </div>

      <div class="flex flex-col gap-2.5">
        {#each messages as msg}
          <div class="flex flex-col gap-1 {msg.sender === 'user' ? 'items-end' : 'items-start'}">
            <div class="flex items-center gap-1.5 px-1 font-mono text-[9px] text-[#a89984]">
              <span>{msg.sender === 'user' ? '讀者' : 'AI 伴讀智庫'}</span>
              <span>· {msg.time}</span>
              {#if msg.tag}
                <span class="{msg.cached ? 'text-[#b8bb26]' : 'text-[#fe8019]'} font-semibold">[{msg.tag}]</span>
              {/if}
            </div>

            <div class="max-w-[94%] p-2.5 rounded-xl text-xs leading-relaxed {msg.sender === 'user' ? 'bg-[#fe8019] text-[#1d2021] font-medium rounded-tr-none' : 'bg-[#282828] border border-[#3c3836] text-[#ebdbb2] rounded-tl-none shadow-sm'}">
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
            <span class="material-symbols-outlined text-[15px] animate-spin text-[#fe8019]">bolt</span>
            <span>{activeProvider === 'groq' ? 'Groq LPU' : activeProvider.toUpperCase()} 正在展開學術推理中...</span>
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
        placeholder={(apiKey || activeProvider === 'ollama') ? `${activeProvider.toUpperCase()} 伴讀推論中... (Enter 發送)` : "提問或追問推導... (Enter 發送)"}
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
      <span class="text-[#fabd2f]">
        {(apiKey || activeProvider === 'ollama') ? `${activeProvider.toUpperCase()} (${activeModel.slice(0, 16)}) 連線中` : '本地知識庫感知中'}
      </span>
      <span class="text-[#b8bb26] font-medium">延遲 &lt; 200ms</span>
    </div>
  </div>
</aside>
