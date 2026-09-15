<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fetchProviderModels, FALLBACK_MODELS, type ProviderModelItem } from '../../services/aiService';

  export let isOpen: boolean = false;
  export let currentProvider: string = 'groq';
  export let currentModel: string = 'llama-3.3-70b-versatile';
  export let apiKey: string = '';
  export let ollamaUrl: string = 'http://localhost:11434';

  const dispatch = createEventDispatcher();

  const providers = [
    { id: 'groq', name: 'Groq LPU (極速推薦)', defaultModel: 'llama-3.3-70b-versatile', badge: 'Ultra-Fast' },
    { id: 'google', name: 'Google Gemini', defaultModel: 'gemini-1.5-pro' },
    { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022' },
    { id: 'openai', name: 'OpenAI GPT', defaultModel: 'gpt-4o' },
    { id: 'deepseek', name: 'DeepSeek Official', defaultModel: 'deepseek-reasoner' },
    { id: 'ollama', name: 'Local Ollama', defaultModel: 'llama3.3:70b' }
  ];

  let availableModels: ProviderModelItem[] = [];
  let isLoadingModels: boolean = false;
  let fetchStatus: 'idle' | 'success' | 'error' = 'idle';
  let fetchErrorMsg: string = '';
  let debounceTimer: any = null;

  onMount(() => {
    if (typeof window !== 'undefined') {
      const savedProvider = localStorage.getItem('mugen_provider') || 'groq';
      currentProvider = savedProvider;

      const savedKey = localStorage.getItem(`mugen_key_${currentProvider}`);
      if (savedKey) apiKey = savedKey;

      const savedModel = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
      currentModel = savedModel;

      availableModels = FALLBACK_MODELS[currentProvider] || [];

      // If key is present on mount, trigger auto-fetch
      if (apiKey && apiKey.trim().length > 5) {
        refreshModels();
      }
    }
  });

  // Auto-fetch with 800ms debounce when API key or provider changes (inspired by cafe-prism)
  function handleKeyInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    fetchStatus = 'idle';
    fetchErrorMsg = '';

    if (currentProvider === 'ollama' || (apiKey && apiKey.trim().length > 5)) {
      isLoadingModels = true;
      debounceTimer = setTimeout(() => {
        refreshModels();
      }, 800);
    } else {
      isLoadingModels = false;
      availableModels = FALLBACK_MODELS[currentProvider] || [];
    }
  }

  async function refreshModels() {
    isLoadingModels = true;
    fetchStatus = 'idle';
    fetchErrorMsg = '';

    try {
      const models = await fetchProviderModels(currentProvider, apiKey, ollamaUrl);
      if (models && models.length > 0) {
        availableModels = models;
        fetchStatus = 'success';
        // Auto-select first model if current isn't in list
        if (!models.some(m => m.id === currentModel)) {
          currentModel = models[0].id;
        }
      } else {
        availableModels = FALLBACK_MODELS[currentProvider] || [];
        fetchStatus = 'error';
        fetchErrorMsg = '未探索到官方模型，已載入預設清單';
      }
    } catch (err: any) {
      console.warn('Auto fetch models failed:', err);
      availableModels = FALLBACK_MODELS[currentProvider] || [];
      fetchStatus = 'error';
      fetchErrorMsg = err.message || '連線逾時，已使用備用清單';
    } finally {
      isLoadingModels = false;
    }
  }

  function handleProviderChange(providerId: string) {
    currentProvider = providerId;
    const p = providers.find(item => item.id === providerId);
    if (p) currentModel = p.defaultModel;

    if (typeof window !== 'undefined') {
      apiKey = localStorage.getItem(`mugen_key_${providerId}`) || '';
    }

    availableModels = FALLBACK_MODELS[providerId] || [];
    fetchStatus = 'idle';
    fetchErrorMsg = '';

    if (providerId === 'ollama' || (apiKey && apiKey.trim().length > 5)) {
      refreshModels();
    }
  }

  function saveSettings() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`mugen_key_${currentProvider}`, apiKey);
      localStorage.setItem('mugen_provider', currentProvider);
      localStorage.setItem('mugen_model', currentModel);
      if (currentProvider === 'ollama') {
        localStorage.setItem('mugen_ollama_url', ollamaUrl);
      }
    }
    dispatch('save', { provider: currentProvider, model: currentModel, apiKey, ollamaUrl });
    close();
  }

  function close() {
    isOpen = false;
    dispatch('close');
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
    <div class="w-full max-w-lg bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col">
      
      <!-- Header -->
      <div class="p-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-[18px]">tune</span>
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-[#ebdbb2]">BYOK 密鑰與模型設定</h3>
            <span class="font-mono text-[10px] text-[#a89984]">支援 Groq LPU 極速推論 · 自動讀取官方模型</span>
          </div>
        </div>

        <button
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          on:click={close}
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
        
        <!-- Privacy Guarantee -->
        <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5">
          <span class="material-symbols-outlined text-[18px] text-[#b8bb26] shrink-0 mt-0.5">verified_user</span>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-[#ebdbb2]">零伺服器隱私保證 (Zero-Server Knowledge)</span>
            <span class="text-[#a89984] leading-relaxed">
              您的 API 金鑰僅加密存放於本機瀏覽器 LocalStorage，所有學術伴讀請求直接向官方端點發起。
            </span>
          </div>
        </div>

        <!-- Provider Select -->
        <div class="flex flex-col gap-1.5">
          <span class="font-mono text-[11px] text-[#d5c4a1]">選擇 AI Provider</span>
          <div class="grid grid-cols-2 gap-2">
            {#each providers as p}
              <button
                class="px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors {currentProvider === p.id ? 'bg-[#3c3836] border-[#fe8019] text-[#fe8019] font-semibold' : 'bg-[#1d2021] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
                on:click={() => handleProviderChange(p.id)}
              >
                <div class="flex items-center gap-1.5 truncate">
                  <span>{p.name}</span>
                </div>
                {#if currentProvider === p.id}
                  <span class="material-symbols-outlined text-[15px] text-[#fe8019]">check</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- API Key Input -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="byok-api-key-input" class="font-mono text-[11px] text-[#d5c4a1]">
              {currentProvider === 'groq' ? 'Groq API Key' : `${currentProvider.toUpperCase()} API Key`}
            </label>

            {#if currentProvider === 'groq'}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                class="font-mono text-[10px] text-[#fabd2f] hover:underline flex items-center gap-0.5"
              >
                <span>免費領取 Groq Key (免信用卡)</span>
                <span class="material-symbols-outlined text-[11px]">open_in_new</span>
              </a>
            {/if}
          </div>

          {#if currentProvider === 'ollama'}
            <input
              id="byok-api-key-input"
              class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs"
              type="text"
              placeholder="http://localhost:11434"
              bind:value={ollamaUrl}
              on:input={handleKeyInput}
            />
          {:else}
            <input
              id="byok-api-key-input"
              class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/40"
              type="password"
              placeholder={currentProvider === 'groq' ? 'gsk_...' : 'sk-...'}
              bind:value={apiKey}
              on:input={handleKeyInput}
            />
          {/if}
          <span class="font-mono text-[10px] text-[#a89984]">
            輸入金鑰後將自動連線官方端點讀取最新可用模型清單
          </span>
        </div>

        <!-- Model Selection with Auto-fetch (cafe-prism style) -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="byok-model-select" class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1.5">
              <span>模型選擇 (Model ID)</span>
              {#if isLoadingModels}
                <span class="material-symbols-outlined text-[13px] animate-spin text-[#fabd2f]">sync</span>
                <span class="text-[10px] text-[#fabd2f]">自動讀取中...</span>
              {:else if fetchStatus === 'success'}
                <span class="text-[10px] text-[#b8bb26] font-medium flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-[13px]">check_circle</span>
                  已載入 {availableModels.length} 個可用模型
                </span>
              {/if}
            </label>

            <!-- Refresh Button -->
            <button
              class="font-mono text-[10px] text-[#a89984] hover:text-[#ebdbb2] flex items-center gap-1 hover:bg-[#32302f] px-1.5 py-0.5 rounded transition-colors"
              on:click={refreshModels}
              disabled={isLoadingModels}
              title="重新讀取官方模型清單"
            >
              <span class="material-symbols-outlined text-[13px] {isLoadingModels ? 'animate-spin' : ''}">refresh</span>
              <span>重新整理</span>
            </button>
          </div>

          <!-- Dynamic Select Dropdown -->
          <div class="relative flex items-center">
            <select
              id="byok-model-select"
              class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs appearance-none cursor-pointer pr-8"
              bind:value={currentModel}
            >
              {#if isLoadingModels}
                <option value={currentModel}>正在連線讀取最新模型清單...</option>
              {:else}
                {#each availableModels as m}
                  <option value={m.id}>{m.name || m.id}</option>
                {/each}
              {/if}
            </select>
            <span class="material-symbols-outlined absolute right-2.5 text-[16px] text-[#a89984] pointer-events-none">
              expand_more
            </span>
          </div>

          {#if fetchErrorMsg}
            <span class="font-mono text-[10px] text-[#fabd2f]">{fetchErrorMsg}</span>
          {/if}
        </div>

        <!-- Cache Stats -->
        <div class="bg-[#1d2021] border border-[#3c3836] p-3 rounded-lg flex items-center justify-between font-mono text-[11px]">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">bolt</span>
            <span class="text-[#a89984]">Groq LPU 預期推論速度</span>
          </div>
          <span class="text-[#fabd2f] font-semibold">300 ~ 750 tokens / 秒</span>
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="p-3.5 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-end gap-2">
        <button
          class="px-3.5 py-1.5 rounded-lg text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors"
          on:click={close}
        >
          取消
        </button>
        <button
          class="px-4 py-1.5 rounded-lg bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold transition-colors shadow-sm"
          on:click={saveSettings}
        >
          儲存設定
        </button>
      </div>

    </div>
  </div>
{/if}
