<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { SectionCompanionData } from '../../stores/documentStore';
  import { callProviderChatWithResilience, type ChatMessage } from '../../services/aiService';
  import { retrieveRelevantContextForAI } from '../../services/embedding/hybridEmbeddingService';
  import { getApiKey, getStoredApiKeySync } from '../../services/crypto/keyVaultService';
  import { renderNoteMarkdown } from '../../utils/markdownNoteRenderer';
  import { t } from '../../stores/localeStore';
  import { get } from 'svelte/store';

  interface Props {
    activeContextText?: string;
    companionData?: SectionCompanionData | undefined;
    paperId?: string;
    paperTitle?: string;
    activeParagraphText?: string;
    selectedText?: string;
    focusedParagraphKey?: string;
    isGeneratingIntuition?: boolean;
    isGeneratingSyntax?: boolean;
    isGeneratingTerminology?: boolean;
    ontriggerGenerate?: (detail: { type: 'intuition' | 'syntax' | 'terminology' }) => void;
    onaskQuestion?: (detail: { query: string; reply: string; cached?: boolean }) => void;
    onquickAction?: (detail: { action: string; payload?: any }) => void;
    onlocateSource?: (detail: { paragraphKey: string }) => void;
    onopenSettings?: () => void;
  }

  let {
    activeContextText = '§ 3.2.1 Scaled Dot-Product',
    companionData = undefined,
    paperId = '',
    paperTitle = '',
    activeParagraphText = '',
    selectedText = '',
    focusedParagraphKey = '',
    isGeneratingIntuition = false,
    isGeneratingSyntax = false,
    isGeneratingTerminology = false,
    ontriggerGenerate,
    onaskQuestion,
    onquickAction,
    onlocateSource,
    onopenSettings
  }: Props = $props();

  let promptInput = $state('');
  let isThinking = $state(false);
  let apiKey = $state('');
  let ollamaUrl = $state('http://localhost:11434');
  let activeModel = $state('llama-3.3-70b-versatile');
  let activeProvider = $state('groq');

  // 雙模式頁籤：'chat'（伴讀對話流）與 'insights'（結構解析卡片）
  let activeTab = $state<'chat' | 'insights'>('chat');

  // 對話滾動與狀態鎖
  let chatContainerEl = $state<HTMLElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let isAtBottom = $state(true);
  let hasUnseenMessages = $state(false);
  let copiedId = $state<string | null>(null);

  // 卡片滾動與高亮聚焦狀態
  let intuitionCardEl = $state<HTMLElement | null>(null);
  let syntaxCardEl = $state<HTMLElement | null>(null);
  let terminologyCardEl = $state<HTMLElement | null>(null);
  let highlightedCard = $state<'intuition' | 'syntax' | 'terminology' | null>(null);
  let highlightTimer: any = null;

  export async function focusCard(cardType: 'intuition' | 'syntax' | 'terminology') {
    activeTab = 'insights';
    await tick();

    highlightedCard = cardType;
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedCard = null;
    }, 2400);

    const targetEl =
      cardType === 'intuition'
        ? intuitionCardEl
        : cardType === 'syntax'
          ? syntaxCardEl
          : terminologyCardEl;

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  export async function askWithCustomPrompt(promptText: string) {
    activeTab = 'chat';
    promptInput = promptText;
    handleSubmit();
  }

  interface MessageItem {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    time: string;
    cached?: boolean;
    tag?: string;
  }

  let messages = $state<MessageItem[]>([
    {
      id: 'init_1',
      sender: 'ai',
      text: get(t)('companion.welcomeMessage'),
      time: get(t)('companion.justNow'),
      cached: true,
      tag: get(t)('companion.localCognitiveCore')
    }
  ]);

  onMount(() => {
    refreshKeyFromStorage();
  });

  export async function refreshKeyFromStorage() {
    if (typeof window !== 'undefined') {
      activeProvider = localStorage.getItem('mugen_provider') || 'groq';
      apiKey = getStoredApiKeySync(activeProvider) || localStorage.getItem(`mugen_key_${activeProvider}`) || localStorage.getItem('mugen_key_groq') || '';
      activeModel = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
      ollamaUrl = localStorage.getItem('mugen_ollama_url') || 'http://localhost:11434';
      if (!apiKey && activeProvider !== 'ollama') {
        apiKey = await getApiKey(activeProvider);
      }
    }
  }

  // Default fallback questions if not present in section
  let activeQuestions = $derived(companionData?.socraticQuestions || [
    {
      id: 'default_1',
      icon: 'help_outline',
      color: 'text-[#fabd2f]',
      text: get(t)('companion.socraticQ1'),
      answerSummary: get(t)('companion.socraticA1')
    },
    {
      id: 'default_2',
      icon: 'functions',
      color: 'text-[#8ec07c]',
      text: get(t)('companion.socraticQ2'),
      answerSummary: get(t)('companion.socraticA2')
    }
  ]);

  // 判斷是否為尚未經 AI 解析之初始預設範本
  let isPlaceholderIntuition = $derived(
    !companionData?.intuition ||
    companionData.intuition.title.includes('的核心探討') ||
    companionData.intuition.tag === '待 AI 解析' ||
    (companionData.intuition.content &&
      companionData.intuition.content.length > 0 &&
      (companionData.intuition.content[0].includes('重點闡述了') ||
        companionData.intuition.content[0].includes('尚未進行')))
  );

  let isPlaceholderTerminology = $derived(
    !companionData?.terminology ||
    companionData.terminology.length === 0 ||
    (companionData.terminology.length === 1 &&
      (companionData.terminology[0].explanation.includes('關鍵學術概念與定義') ||
        companionData.terminology[0].explanation.includes('自動萃取本節專有名詞')))
  );

  // 萃取中文對照名稱（若資料無獨立 zh 欄位則由釋義標點解析）
  function extractZhTerm(term: { term: string; zh?: string; explanation: string }): string | null {
    if (term.zh && term.zh.trim()) return term.zh.trim();
    const match = term.explanation.match(/^([^：:()（）]{2,20})[：:]\s*(.*)$/);
    if (match) {
      return match[1].trim();
    }
    return null;
  }

  // 萃取清理後的學術釋義內容
  function extractCleanExp(term: { term: string; zh?: string; explanation: string }, zhTerm: string | null): string {
    if (!zhTerm) return term.explanation;
    if (term.explanation.startsWith(zhTerm + '：') || term.explanation.startsWith(zhTerm + ':')) {
      return term.explanation.slice(zhTerm.length + 1).trim();
    }
    return term.explanation;
  }

  function handleChatScroll() {
    if (!chatContainerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerEl;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    isAtBottom = distanceToBottom < 70;
    if (isAtBottom) {
      hasUnseenMessages = false;
    }
  }

  async function scrollToBottom(smooth = true, force = false) {
    await tick();
    if (!chatContainerEl) return;
    if (force || isAtBottom) {
      chatContainerEl.scrollTo({
        top: chatContainerEl.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      hasUnseenMessages = false;
    } else {
      hasUnseenMessages = true;
    }
  }

  async function sendQuestion(qText: string, presetAnswer?: string) {
    if (!qText.trim()) return;

    activeTab = 'chat';
    refreshKeyFromStorage();

    const userMsg: MessageItem = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: qText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages = [...messages, userMsg];

    // 發送提問後強制貼底滾動，並保持輸入框聚焦
    scrollToBottom(true, true);
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.focus();
    }

    isThinking = true;

    const isLocalOllama = activeProvider === 'ollama';
    // 1. If API Key is present or Ollama local is chosen, invoke live AI!
    if ((apiKey && apiKey.trim().length > 5) || isLocalOllama) {
      try {
        // 1. 動態限制對話歷史輪數：Groq (6k TPM) 保留最新 2 輪，避免累積歷史過長
        const maxTurns = activeProvider === 'groq' ? 2 : 4;
        const history: ChatMessage[] = messages.slice(-maxTurns).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

        // 2. 輸入原文長度安全修剪，防止直接被 Groq TPM 拒收
        const maxParaLen = activeProvider === 'groq' ? 850 : 1600;
        const maxSelLen = activeProvider === 'groq' ? 300 : 600;
        const safePara = activeParagraphText && activeParagraphText.trim().length > maxParaLen
          ? activeParagraphText.trim().slice(0, maxParaLen) + get(t)('companion.truncatedOriginal')
          : activeParagraphText?.trim();
        const safeSel = selectedText && selectedText.trim().length > maxSelLen
          ? selectedText.trim().slice(0, maxSelLen) + get(t)('companion.truncatedSelection')
          : selectedText?.trim();

        let contextualPrompt = '';
        if (paperTitle) {
          contextualPrompt += `【當前研讀文獻】：${paperTitle}\n`;
        }
        contextualPrompt += `【當前章節】：${activeContextText}\n`;
        if (safeSel) {
          contextualPrompt += `【讀者當前聚焦反白字句】：\n"${safeSel}"\n`;
        }
        if (safePara) {
          contextualPrompt += `【讀者當前研讀段落原文 (Evidence Context)】：\n"${safePara}"\n`;
        }

        // 嘗試自動調用本機語意向量檢索相關文獻證據 (Local RAG)
        let hasRagEvidence = false;
        if (paperId) {
          try {
            const ragEvidence = await retrieveRelevantContextForAI(paperId, qText, 2);
            if (ragEvidence && ragEvidence.trim().length > 0) {
              contextualPrompt += `\n${ragEvidence}\n`;
              hasRagEvidence = true;
            }
          } catch (ragErr) {
            console.warn('[CognitiveCompanion] RAG retrieval skipped:', ragErr);
          }
        }

        contextualPrompt += `\n【讀者提問】：${qText}\n` +
          `【回答指示】：\n` +
          `${get(t)('companion.promptInstruction')}\n` +
          `2. 必須嚴格依據上方讀者研讀的原文段落與文獻脈絡進行論證。\n` +
          `3. 數學推導請使用精確之 LaTeX 格式包覆（例如 $W_Q, W_K$ 或 $$...$$）。\n` +
          `4. 若有跨概念銜接，請一併點出此設計在科研工程實務上的核心優勢。`;

        // 組合歷史對話與當前含有學術上下文的提示訊息
        const fullMessages: ChatMessage[] = [
          ...history.slice(0, -1),
          {
            role: 'user',
            content: contextualPrompt
          }
        ];

        const result = await callProviderChatWithResilience(
          activeProvider,
          fullMessages,
          apiKey,
          activeModel,
          ollamaUrl
        );

        let displayTag = `${result.model} · ${result.latencyMs}ms`;
        if (hasRagEvidence) {
          displayTag = `${get(t)('companion.ragEnhancedTag')} · ${displayTag}`;
        }
        if (result.fallbackNotice) {
          displayTag = `${displayTag} · ${result.fallbackNotice}`;
        }

        const aiMsg: MessageItem = {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: result.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cached: result.cached,
          tag: displayTag
        };

        messages = [...messages, aiMsg];
        scrollToBottom(true, false);
        onaskQuestion?.({ query: qText, reply: result.reply, cached: result.cached });
      } catch (err: any) {
        console.warn(`${activeProvider} API call failed, fallback to local scholar engine:`, err);
        const rawMsg = String(err?.message || '');
        const friendlyError = rawMsg.includes('unexpected EOF') || rawMsg.includes('stream reading')
          ? 'Groq 雲端佇列繁忙 (unexpected EOF)'
          : (rawMsg || '連線異常');
        fallbackLocalResponse(qText, presetAnswer, `${activeProvider.toUpperCase()} ${get(t)('companion.connectionBlocked', { error: friendlyError })}`);
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
    let responseText = presetAnswer;
    if (!responseText) {
      if (activeParagraphText && (activeParagraphText.includes('were not reported') || qText.includes('流速') || qText.includes('壓力'))) {
        responseText = `> 「原文：The corresponding flow rates (F) for the pressure-controlled experiments were not reported.」\n\n` +
          `📌 **內文直接依據**：作者在文中明確指出，被引用的先前研究（[22, 23, 24]）在進行 7 至 11 bar 的增壓實驗時，**並未報告或記錄對應的流速 (F)**。\n\n` +
          `💡 **科學機制與物理直覺**：\n` +
          `1. **流速未受控的影響**：若只控制壓力而未恆定流速，當壓力調高時咖啡粉餅容易被過度壓實（Puck Compaction），導致流阻劇增、流速反向驟降，使得杯中總萃取質量不增反降。\n` +
          `2. **引文 [25] 的理論銜接**：作者緊接著引用 Lee et al. [[25]]，正是點出粉餅內部孔隙結構會產生「非均勻流動與通道效應（Channeling）」，進一步解釋了萃取不穩定的物理成因。`;
      } else {
        responseText = `針對「${qText}」的學術深度剖析：\n` +
          `在 ${activeContextText} 的脈絡中，作者旨在透過正交子空間將計算複雜度從序列展開降至矩陣並行。` +
          `這種設計有效阻絕了長序列下的梯度衰減問題。`;
      }
    }

    const aiMsg: MessageItem = {
      id: `ai_${Date.now()}`,
      sender: 'ai',
      text: responseText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cached: true,
      tag: customTag || get(t)('companion.localExpertCoreTag')
    };
    messages = [...messages, aiMsg];
    scrollToBottom(true, false);
    onaskQuestion?.({ query: qText, reply: responseText });
  }

  function handleSubmit() {
    if (!promptInput.trim()) return;
    const q = promptInput;
    promptInput = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
    sendQuestion(q);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 130) + 'px';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      textareaEl?.blur();
    }
  }

  async function handleCopyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }

  function handleClearChat() {
    messages = [
      {
        id: `init_${Date.now()}`,
        sender: 'ai',
        text: get(t)('companion.resetConversationMessage', { chapter: activeContextText }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cached: true,
        tag: get(t)('companion.localCognitiveCore')
      }
    ];
    scrollToBottom(false, true);
  }

  function handleSaveMessageToNotes(text: string) {
    onquickAction?.({ action: 'saveSnippet', payload: text });
    alert(get(t)('companion.savedToNotesToast'));
  }

  function handleSendFocusContext(type: 'selected' | 'paragraph') {
    if (type === 'selected' && selectedText) {
      sendQuestion(get(t)('companion.askSelectionAnalysis', { text: selectedText.trim() }));
    } else if (type === 'paragraph' && activeParagraphText) {
      sendQuestion(get(t)('companion.askParagraphAnalysis'));
    }
  }

  function handleQuoteToInput(text: string) {
    const snippet = text.trim();
    const shortSnippet = snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet;
    promptInput = get(t)('companion.askSelectionPromptPrefix', { text: shortSnippet });
    activeTab = 'chat';
    if (textareaEl) {
      textareaEl.focus();
      handleInput({ target: textareaEl } as any);
    }
  }

  function handleOpenSettings() {
    onopenSettings?.();
  }
</script>

<aside class="h-full flex flex-col bg-[#1d2021] border-l border-[#3c3836] shadow-sm overflow-hidden select-none relative">
  <!-- Companion Header & Sync State -->
  <div class="p-2.5 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-2.5 h-2.5 rounded-full bg-[#fe8019] animate-pulse"></div>
      <span class="text-xs font-bold text-[#ebdbb2] flex items-center gap-1 font-sans">
        {$t('companion.title')} <span class="font-mono text-[10px] text-[#fabd2f] font-normal">Active</span>
      </span>
    </div>

    <!-- Provider & Model Pill -->
    <div class="flex items-center gap-1.5 text-[#a89984]">
      <span class="font-mono text-[9px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-1.5 py-0.5 rounded truncate max-w-[120px]">
        {activeProvider === 'groq' ? '⚡ Groq LPU' : activeProvider.toUpperCase()}
      </span>
    </div>
  </div>

  <!-- Mode Navigation Tabs: Insights vs Dialogue -->
  <div class="px-2.5 py-1.5 bg-[#141617] border-b border-[#3c3836] flex items-center justify-between shrink-0">
    <div class="flex items-center gap-1 bg-[#1d2021] p-0.5 rounded-lg border border-[#3c3836]">
      <button
        type="button"
        class="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer {activeTab === 'insights' ? 'bg-[#32302f] text-[#fabd2f] shadow-sm font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        onclick={() => activeTab = 'insights'}
      >
        <span class="material-symbols-outlined text-[13px]">psychology</span>
        <span>{$t('companion.insights')}</span>
      </button>
      <button
        type="button"
        class="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer relative {activeTab === 'chat' ? 'bg-[#32302f] text-[#fe8019] shadow-sm font-semibold' : 'text-[#a89984] hover:text-[#ebdbb2]'}"
        onclick={() => { activeTab = 'chat'; scrollToBottom(true, true); }}
      >
        <span class="material-symbols-outlined text-[13px]">forum</span>
        <span>{$t('companion.tabChat')}</span>
        {#if hasUnseenMessages && activeTab !== 'chat'}
          <span class="w-1.5 h-1.5 rounded-full bg-[#fe8019] absolute top-1 right-1"></span>
        {/if}
      </button>
    </div>

    <div class="flex items-center gap-1">
      {#if activeTab === 'chat'}
        <button
          type="button"
          class="text-[#a89984] hover:text-[#fabd2f] text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-[#282828] transition-colors cursor-pointer"
          onclick={handleClearChat}
          title={$t('companion.newChatTooltip')}
        >
          <span class="material-symbols-outlined text-[12px]">restart_alt</span>
          <span>{$t('companion.newChat')}</span>
        </button>
      {/if}
    </div>
  </div>

  {#if activeTab === 'insights'}
    <!-- Tab 1: Structured Insights Container -->
    <div class="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-3">
      <!-- 1. Scientific Intuition Card -->
      <div
        id="companion-intuition-card"
        bind:this={intuitionCardEl}
        class="bg-[#282828] border {highlightedCard === 'intuition' ? 'border-[#fabd2f] ring-2 ring-[#fabd2f]/40 shadow-lg' : 'border-[#3c3836]'} rounded-xl p-3 flex flex-col gap-2.5 shadow-sm transition-all duration-300"
      >
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#fabd2f] font-bold uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#fabd2f]">psychology</span>
            {$t('companion.intuitionTitle')}
          </span>
          <div class="flex items-center gap-2">
            {#if companionData?.intuition?.tag}
              <span class="font-mono text-[9px] bg-[#fabd2f]/15 border border-[#fabd2f]/30 text-[#fabd2f] px-1.5 py-0.5 rounded font-medium">
                {isPlaceholderIntuition ? $t('companion.startAi') : companionData.intuition.tag}
              </span>
            {/if}
            <button
              class="text-[#a89984] hover:text-[#fabd2f] text-[11px] flex items-center gap-0.5 cursor-pointer disabled:opacity-50 transition-colors"
              disabled={isGeneratingIntuition}
              onclick={() => ontriggerGenerate?.({ type: 'intuition' })}
              title={$t('companion.tabIntuition')}
            >
              <span class="material-symbols-outlined text-[13px] {isGeneratingIntuition ? 'animate-spin text-[#fabd2f]' : ''}">refresh</span>
              <span class="text-[10px]">{isGeneratingIntuition ? $t('companion.generatingPhysics') : (isPlaceholderIntuition ? $t('companion.startAi') : $t('companion.reanalyze'))}</span>
            </button>
          </div>
        </div>

        {#if isGeneratingIntuition}
          <div class="space-y-2 py-1 animate-pulse">
            <div class="h-3.5 bg-[#3c3836] rounded w-3/5"></div>
            <div class="h-14 bg-[#1d2021] rounded w-full"></div>
          </div>
        {:else if isPlaceholderIntuition}
          <div class="bg-[#1d2021] border border-[#fabd2f]/30 rounded-lg p-2.5 flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-[16px] text-[#fabd2f] shrink-0 mt-0.5">auto_awesome</span>
              <div class="flex flex-col gap-0.5">
                <h4 class="text-xs font-semibold text-[#ebdbb2]">{$t('companion.noIntuitionTitle')}</h4>
              </div>
            </div>
            <button
              class="w-full flex items-center justify-center gap-1.5 bg-[#32302f] hover:bg-[#3c3836] text-[#fabd2f] hover:text-[#fabd2f] border border-[#fabd2f]/40 hover:border-[#fabd2f]/70 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer shadow-sm"
              disabled={isGeneratingIntuition}
              onclick={() => ontriggerGenerate?.({ type: 'intuition' })}
            >
              <span class="material-symbols-outlined text-[14px]">psychology</span>
              <span>{$t('companion.btnGenerateIntuition')}</span>
            </button>
          </div>
        {:else if companionData?.intuition}
          <h4 class="text-xs font-semibold text-[#ebdbb2]">
            {companionData.intuition.title}
          </h4>

          <div class="text-xs text-[#d5c4a1] leading-relaxed bg-[#1d2021] border border-[#3c3836] p-2.5 rounded-lg text-justify flex flex-col gap-1.5">
            {#each companionData.intuition.content as p}
              <p>{p}</p>
            {/each}
          </div>
        {:else}
          <div class="bg-[#1d2021] border border-[#fabd2f]/30 rounded-lg p-2.5 flex flex-col gap-2">
            <p class="text-xs text-[#a89984]">{$t('companion.noIntuitionCard')}</p>
            <button
              class="flex items-center justify-center gap-1.5 bg-[#fabd2f] hover:bg-[#fe8019] text-[#1d2021] font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
              disabled={isGeneratingIntuition}
              onclick={() => ontriggerGenerate?.({ type: 'intuition' })}
            >
              <span class="material-symbols-outlined text-[14px]">lightbulb</span>
              <span>{$t('companion.generateSectionIntuition')}</span>
            </button>
          </div>
        {/if}
      </div>

      <!-- 2. Long Sentence Structural Breakdown (Syntax Tree) -->
      <div
        id="companion-syntax-card"
        bind:this={syntaxCardEl}
        class="bg-[#282828] border {highlightedCard === 'syntax' ? 'border-[#8ec07c] ring-2 ring-[#8ec07c]/40 shadow-lg' : 'border-[#3c3836]'} rounded-xl p-3 flex flex-col gap-2 shadow-sm transition-all duration-300"
      >
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#8ec07c] font-bold uppercase tracking-wider flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px] text-[#8ec07c]">account_tree</span>
            {$t('companion.syntaxTreeTitle')}
          </span>
          <div class="flex items-center gap-2">
            {#if companionData?.syntaxTree?.line}
              <span class="font-mono text-[10px] text-[#a89984]">{companionData.syntaxTree.line}</span>
            {/if}
            <button
              class="text-[#a89984] hover:text-[#8ec07c] text-[11px] flex items-center gap-0.5 cursor-pointer disabled:opacity-50 transition-colors"
              disabled={isGeneratingSyntax}
              onclick={() => ontriggerGenerate?.({ type: 'syntax' })}
              title="SVO Syntax Tree"
            >
              <span class="material-symbols-outlined text-[13px] {isGeneratingSyntax ? 'animate-spin text-[#8ec07c]' : ''}">refresh</span>
              <span class="text-[10px]">{isGeneratingSyntax ? $t('companion.dissectingSyntax') : $t('companion.reanalyze')}</span>
            </button>
          </div>
        </div>

        {#if isGeneratingSyntax}
          <div class="space-y-2 py-1 animate-pulse">
            <div class="h-3 bg-[#3c3836] rounded w-2/3"></div>
            <div class="h-8 bg-[#1d2021] rounded w-full"></div>
            <div class="h-6 bg-[#32302f] rounded w-full"></div>
          </div>
        {:else if companionData?.syntaxTree && companionData.syntaxTree.svo && companionData.syntaxTree.svo.length > 0}
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
        {:else}
          <button
            class="flex items-center justify-center gap-1.5 bg-[#32302f] hover:bg-[#3c3836] text-[#8ec07c] border border-[#8ec07c]/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            disabled={isGeneratingSyntax}
            onclick={() => ontriggerGenerate?.({ type: 'syntax' })}
          >
            <span class="material-symbols-outlined text-[14px]">psychology</span>
            <span>{$t('companion.btnDissectSyntax')}</span>
          </button>
        {/if}
      </div>

      <!-- 3. Precise Academic Term Alignment -->
      <div
        id="companion-terminology-card"
        bind:this={terminologyCardEl}
        class="bg-[#282828] border {highlightedCard === 'terminology' ? 'border-[#83a598] ring-2 ring-[#83a598]/40 shadow-lg' : 'border-[#3c3836]'} rounded-xl p-3 flex flex-col gap-2.5 shadow-sm transition-all duration-300"
      >
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] text-[#a89984] uppercase tracking-wider flex items-center gap-1 font-bold">
            <span class="material-symbols-outlined text-[14px] text-[#83a598]">translate</span>
            {$t('companion.tabTerminology')} (Terminology)
          </span>
          <button
            class="text-[#a89984] hover:text-[#83a598] text-[11px] flex items-center gap-0.5 cursor-pointer disabled:opacity-50 transition-colors"
            disabled={isGeneratingTerminology}
            onclick={() => ontriggerGenerate?.({ type: 'terminology' })}
            title={$t('companion.tabTerminology')}
          >
            <span class="material-symbols-outlined text-[13px] {isGeneratingTerminology ? 'animate-spin text-[#83a598]' : ''}">refresh</span>
            <span class="text-[10px]">{isGeneratingTerminology ? $t('companion.aligningTerms') : (isPlaceholderTerminology ? $t('companion.startAlignTerms') : $t('companion.realignTerms'))}</span>
          </button>
        </div>

        {#if isGeneratingTerminology}
          <div class="space-y-2 py-1 animate-pulse">
            <div class="h-12 bg-[#1d2021] rounded-lg w-full"></div>
            <div class="h-12 bg-[#1d2021] rounded-lg w-full"></div>
          </div>
        {:else if isPlaceholderTerminology}
          <div class="bg-[#1d2021] border border-[#83a598]/30 rounded-lg p-2.5 flex flex-col gap-2">
            <button
              class="w-full flex items-center justify-center gap-1.5 bg-[#32302f] hover:bg-[#3c3836] text-[#83a598] hover:text-[#83a598] border border-[#83a598]/40 hover:border-[#83a598]/70 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer shadow-sm"
              disabled={isGeneratingTerminology}
              onclick={() => ontriggerGenerate?.({ type: 'terminology' })}
            >
              <span class="material-symbols-outlined text-[14px]">translate</span>
              <span>{$t('companion.btnGenerateTerms')}</span>
            </button>
          </div>
        {:else if companionData?.terminology && companionData.terminology.length > 0}
          <div class="flex flex-col gap-2">
            {#each companionData.terminology as term}
              {@const zhTerm = extractZhTerm(term)}
              {@const cleanExp = extractCleanExp(term, zhTerm)}
              {@const termColor = term.color || '#fabd2f'}
              <div class="flex flex-col gap-1.5 bg-[#1d2021] border border-[#3c3836] hover:border-[#504945] p-2.5 rounded-lg text-xs transition-colors">
                <div class="flex items-baseline justify-between gap-2 flex-wrap">
                  <div class="flex items-baseline gap-1.5 flex-wrap">
                    <span class="font-mono text-[#ebdbb2] font-semibold text-xs tracking-wide select-all">
                      {term.term}
                    </span>
                    {#if zhTerm}
                      <span class="text-[#a89984] text-[10px]">↔</span>
                      <span class="font-medium text-xs" style="color: {termColor}">
                        {zhTerm}
                      </span>
                    {/if}
                  </div>
                  <span
                    class="font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 font-medium"
                    style="color: {termColor}; border-color: {termColor}40; background-color: {termColor}15;"
                  >
                    {$t('companion.originalCompare')}
                  </span>
                </div>
                {#if cleanExp}
                  <p
                    class="text-[11px] leading-relaxed text-[#d5c4a1] break-words pl-2 border-l-2"
                    style="border-color: {termColor};"
                  >
                    {cleanExp}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-[#a89984]">{$t('companion.noTermsCard')}</p>
          <button
            class="flex items-center justify-center gap-1.5 bg-[#32302f] hover:bg-[#3c3836] text-[#83a598] hover:text-[#83a598] border border-[#83a598]/30 hover:border-[#83a598]/60 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            disabled={isGeneratingTerminology}
            onclick={() => ontriggerGenerate?.({ type: 'terminology' })}
          >
            <span class="material-symbols-outlined text-[14px]">menu_book</span>
            <span>{$t('companion.extractSectionTerms')}</span>
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Tab 2: Full-height Dedicated Dialogue Stream -->
    <div class="flex-1 flex flex-col min-h-0 relative">
      <!-- Messages, Live Context & Socratic Inquiries Scroll Area -->
      <div
        bind:this={chatContainerEl}
        onscroll={handleChatScroll}
        class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3.5 relative"
      >
        <!-- 1. Active Context Awareness Radar (Grounding Evidence) -->
        <div class="bg-[#141617] border border-[#3c3836] rounded-xl p-2.5 flex flex-col gap-2 shadow-inner shrink-0">
          <div class="flex items-center justify-between font-mono text-[10px]">
            <span class="flex items-center gap-1 text-[#fe8019] font-bold">
              <span class="material-symbols-outlined text-[13px] text-[#fe8019] animate-pulse">radar</span>
              <span>{$t('companion.liveContext')}</span>
            </span>
            <span class="text-[#a89984] text-[9px] truncate max-w-[140px]">{activeContextText}</span>
          </div>

          {#if selectedText}
            <div class="flex flex-col gap-1.5 bg-[#fe8019]/10 border border-[#fe8019]/30 rounded-lg p-2 text-[11px] text-[#fabd2f]">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px] text-[#fe8019]">highlight</span>
                  <span class="text-[9px] font-mono text-[#fe8019] font-bold uppercase tracking-wider">{$t('companion.selectionAnchored')}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="text-[10px] text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-0.5"
                    onclick={() => handleQuoteToInput(selectedText)}
                    title={$t('companion.quoteSelection')}
                  >
                    <span class="material-symbols-outlined text-[11px]">edit_note</span>
                    <span>{$t('companion.quoteSelection')}</span>
                  </button>
                  <button
                    type="button"
                    class="bg-[#fe8019] hover:bg-[#fabd2f] text-[#1d2021] font-bold text-[10px] px-2 py-0.5 rounded shadow-sm cursor-pointer transition-all flex items-center gap-1 hover:scale-105"
                    onclick={() => handleSendFocusContext('selected')}
                    title={$t('companion.sendSelectionForAnalysis')}
                  >
                    <span class="material-symbols-outlined text-[11px]">send</span>
                    <span>{$t('companion.sendSelectionForAnalysis')}</span>
                  </button>
                </div>
              </div>
              <p class="font-serif italic text-[#ebdbb2] line-clamp-3 text-[11px] leading-relaxed pl-1.5 border-l-2 border-[#fe8019]/50 select-text">
                "{selectedText}"
              </p>
            </div>
          {:else if activeParagraphText}
            <div class="flex flex-col gap-1.5 bg-[#282828] border border-[#504945]/70 rounded-lg p-2 text-[11px] text-[#d5c4a1]">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">description</span>
                  <span class="text-[9px] font-mono text-[#fabd2f] font-bold">{$t('companion.activeSectionGrounding')}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  {#if focusedParagraphKey}
                    <button
                      type="button"
                      class="text-[9px] text-[#8ec07c] hover:underline cursor-pointer flex items-center gap-0.5 mr-0.5"
                      onclick={() => onlocateSource?.({ paragraphKey: focusedParagraphKey })}
                      title={$t('companion.locateSection')}
                    >
                      <span>{$t('companion.locateSection')}</span>
                      <span class="material-symbols-outlined text-[10px]">my_location</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="text-[10px] text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-0.5"
                    onclick={() => handleQuoteToInput(activeParagraphText)}
                    title={$t('companion.quoteParagraphTooltip')}
                  >
                    <span class="material-symbols-outlined text-[11px]">edit_note</span>
                    <span>{$t('companion.quoteSelection')}</span>
                  </button>
                  <button
                    type="button"
                    class="bg-[#fabd2f] hover:bg-[#fe8019] text-[#1d2021] font-bold text-[10px] px-2 py-0.5 rounded shadow-sm cursor-pointer transition-all flex items-center gap-1 hover:scale-105"
                    onclick={() => handleSendFocusContext('paragraph')}
                    title={$t('companion.sendParagraphForAnalysisTooltip')}
                  >
                    <span class="material-symbols-outlined text-[11px]">send</span>
                    <span>{$t('companion.sendSelectionForAnalysis')}</span>
                  </button>
                </div>
              </div>
              <p class="font-serif italic text-[#a89984] line-clamp-2 text-[11px] leading-relaxed pl-1.5 border-l-2 border-[#fabd2f]/50 select-text">
                "{activeParagraphText}"
              </p>
            </div>
          {:else}
            <div class="flex items-center justify-between text-[10px] text-[#7c6f64] font-mono italic px-0.5">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[11px]">info</span>
                <span>{$t('companion.clickParagraphHint')}</span>
              </span>
              <button
                type="button"
                class="text-[10px] text-[#fabd2f] hover:underline not-italic cursor-pointer flex items-center gap-0.5"
                onclick={() => sendQuestion(get(t)('companion.askSectionInquiry', { chapter: activeContextText }))}
                title={$t('companion.analyzeSectionTooltip')}
              >
                <span class="material-symbols-outlined text-[11px]">send</span>
                <span>{$t('companion.analyzeSectionBtn')}</span>
              </button>
            </div>
          {/if}
        </div>

        <!-- 2. Proactive Socratic Inquiries -->
        <div class="flex flex-col gap-1.5 shrink-0 bg-[#282828]/50 border border-[#3c3836] p-2.5 rounded-xl">
          <div class="flex items-center justify-between font-mono text-[10px] text-[#d3869b] uppercase tracking-wider font-bold">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">tips_and_updates</span> {$t('companion.socraticInquiries')}
            </span>
            <span class="text-[9px] text-[#a89984] normal-case font-normal">{$t('companion.clickToAsk')}</span>
          </div>

          <div class="flex flex-col gap-1.5 mt-0.5">
            {#each activeQuestions as sq}
              <button
                class="w-full text-left bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] hover:border-[#504945] p-2 rounded-lg text-[#d5c4a1] hover:text-[#ebdbb2] transition-all flex items-start gap-2 group cursor-pointer"
                onclick={() => sendQuestion(sq.text, sq.answerSummary)}
              >
                <span class="material-symbols-outlined text-[14px] {sq.color} mt-0.5 shrink-0 group-hover:scale-110 transition-transform">{sq.icon}</span>
                <span class="text-xs leading-snug">{sq.text}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Section Divider for Chat Stream -->
        <div class="flex items-center gap-2 pt-1 font-mono text-[9px] text-[#a89984] uppercase tracking-wider font-semibold">
          <div class="h-px bg-[#3c3836] flex-1"></div>
          <span>{$t('companion.dialogueStream')}</span>
          <div class="h-px bg-[#3c3836] flex-1"></div>
        </div>
        {#each messages as msg}
          <div class="flex flex-col gap-1 {msg.sender === 'user' ? 'items-end' : 'items-start'}">
            <div class="flex items-center gap-1.5 px-1 font-mono text-[9px] text-[#a89984]">
              <span>{msg.sender === 'user' ? $t('companion.userSender') : $t('companion.aiSender')}</span>
              <span>· {msg.time}</span>
              {#if msg.tag}
                <span class="{msg.cached ? 'text-[#b8bb26]' : 'text-[#fe8019]'} font-semibold">[{msg.tag}]</span>
              {/if}
            </div>

            <div class="max-w-[95%] p-3 rounded-xl text-xs leading-relaxed {msg.sender === 'user' ? 'bg-[#fe8019] text-[#1d2021] font-medium rounded-tr-none shadow' : 'bg-[#282828] border border-[#3c3836] text-[#ebdbb2] rounded-tl-none shadow-sm'}">
              {#if msg.sender === 'ai'}
                <div class="academic-markdown select-text leading-relaxed">
                  {@html renderNoteMarkdown(msg.text)}
                </div>

                <div class="mt-2.5 pt-1.5 border-t border-[#3c3836] flex items-center justify-between gap-2">
                  {#if focusedParagraphKey}
                    <button
                      type="button"
                      class="text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer"
                      onclick={() => onlocateSource?.({ paragraphKey: focusedParagraphKey })}
                      title={$t('companion.locateAnchorTooltip')}
                    >
                      <span class="material-symbols-outlined text-[12px]">my_location</span>
                      <span>{$t('companion.locateSection')}</span>
                    </button>
                  {:else}
                    <span></span>
                  {/if}

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="text-[10px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5 cursor-pointer transition-colors"
                      onclick={() => handleCopyMessage(msg.id, msg.text)}
                      title={$t('companion.copyAnswerTooltip')}
                    >
                      <span class="material-symbols-outlined text-[12px]">{copiedId === msg.id ? 'check' : 'content_copy'}</span>
                      <span>{copiedId === msg.id ? $t('common.copied') : $t('common.copy')}</span>
                    </button>

                    <button
                      type="button"
                      class="text-[10px] text-[#a89984] hover:text-[#fabd2f] flex items-center gap-0.5 cursor-pointer transition-colors"
                      onclick={() => handleSaveMessageToNotes(msg.text)}
                      title={$t('companion.saveToNotesTooltip')}
                    >
                      <span class="material-symbols-outlined text-[12px]">note_add</span>
                      <span>{$t('derivations.saveToNotes')}</span>
                    </button>
                  </div>
                </div>
              {:else}
                <p class="whitespace-pre-wrap select-text">{msg.text}</p>
              {/if}
            </div>
          </div>
        {/each}

        {#if isThinking}
          <div class="flex items-center gap-2 p-2.5 bg-[#282828] border border-[#fe8019]/40 rounded-xl text-xs text-[#fabd2f] font-mono animate-pulse shadow-sm">
            <span class="material-symbols-outlined text-[16px] animate-spin text-[#fe8019]">bolt</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-bold">{$t('companion.reasoningModel', { provider: activeProvider === 'groq' ? 'Groq LPU' : activeProvider.toUpperCase() })}</span>
              <span class="text-[10px] text-[#a89984]">{$t('companion.reasoningDesc')}</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Floating Jump-to-Bottom Badge when user scrolls up and new content arrives -->
      {#if hasUnseenMessages && !isAtBottom}
        <button
          type="button"
          class="absolute bottom-4 right-4 z-20 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 hover:scale-105 transition-all cursor-pointer animate-bounce"
          onclick={() => scrollToBottom(true, true)}
        >
          <span class="material-symbols-outlined text-[14px]">arrow_downward</span>
          <span>{$t('companion.latestReply')}</span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Copilot Bottom Action Input Form -->
  <div class="p-2.5 bg-[#141617] border-t border-[#3c3836] shrink-0 flex flex-col gap-2">
    <!-- Quick buttons -->
    <div class="flex items-center gap-1.5">
      <button
        class="flex-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
        onclick={() => sendQuestion(get(t)('companion.askDerivationDetailed', { chapter: activeContextText }))}
      >
        <span class="material-symbols-outlined text-[12px] text-[#fabd2f]">calculate</span> {$t('companion.askDerivationDetails')}
      </button>
      <button
        class="flex-1 bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] px-2 py-1 rounded font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
        onclick={() => onquickAction?.({ action: 'exportNotes' })}
      >
        <span class="material-symbols-outlined text-[12px] text-[#fe8019]">note_add</span> {$t('companion.exportToNotes')}
      </button>
    </div>

    <!-- Input Form (Auto-expanding Textarea) -->
    <div class="relative flex items-end bg-[#282828] border border-[#3c3836] focus-within:border-[#fe8019] focus-within:bg-[#32302f] rounded-lg transition-colors p-1">
      <textarea
        bind:this={textareaEl}
        bind:value={promptInput}
        rows="1"
        class="w-full bg-transparent text-[#ebdbb2] placeholder:text-[#a89984]/70 text-xs px-2 py-1 focus:outline-none transition-all resize-none max-h-32 min-h-[30px] leading-relaxed"
        placeholder={(apiKey || activeProvider === 'ollama') ? $t('companion.inputPlaceholderWithKey', { provider: activeProvider.toUpperCase() }) : $t('companion.inputPlaceholderWithoutKey')}
        oninput={handleInput}
        onkeydown={handleKeydown}
      ></textarea>
      <button
        type="button"
        class="w-7 h-7 rounded bg-[#fe8019] text-[#1d2021] flex items-center justify-center hover:opacity-90 transition-opacity font-bold cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed mb-0.5"
        disabled={!promptInput.trim()}
        onclick={handleSubmit}
        title={$t('companion.sendTooltip')}
      >
        <span class="material-symbols-outlined text-[15px]">arrow_upward</span>
      </button>
    </div>

    <div class="flex items-center justify-between text-[#a89984] font-mono text-[9px] px-0.5">
      <span class="text-[#fabd2f]">
        {(apiKey || activeProvider === 'ollama') ? `${activeProvider.toUpperCase()} (${activeModel.slice(0, 16)})` : $t('companion.localKnowledgeSensing')}
      </span>
      <span class="text-[#7c6f64]">{$t('companion.inputKeyboardShortcuts')}</span>
    </div>
  </div>
</aside>
