<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fetchProviderModels, FALLBACK_MODELS, type ProviderModelItem } from '../../services/aiService';
  import { THEMES, currentTheme, setTheme } from '../../stores/themeStore';
  import { vimConfigStore, updateVimConfig } from '../../stores/vimCursorStore';

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

      const savedKey = localStorage.getItem(`mugen_key_${currentProvider}`) || localStorage.getItem(`mugen_api_key_${currentProvider}`);
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

  // Auto-fetch with 800ms debounce when API key or provider changes
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
        if (!availableModels.some(m => m.id === currentModel)) {
          currentModel = availableModels[0].id;
        }
      } else {
        throw new Error('未取得模型清單');
      }
    } catch (err: any) {
      console.warn('讀取模型清單失敗，切換為預設模型:', err);
      availableModels = FALLBACK_MODELS[currentProvider] || [];
      fetchStatus = 'error';
      fetchErrorMsg = err.message || '連線讀取失敗，已載入本機預設模型';
    } finally {
      isLoadingModels = false;
    }
  }

  function handleProviderChange(providerId: string) {
    currentProvider = providerId;
    apiKey = localStorage.getItem(`mugen_key_${providerId}`) || localStorage.getItem(`mugen_api_key_${providerId}`) || '';
    
    const prov = providers.find(p => p.id === providerId);
    currentModel = prov ? prov.defaultModel : 'llama-3.3-70b-versatile';
    
    availableModels = FALLBACK_MODELS[providerId] || [];
    fetchStatus = 'idle';
    fetchErrorMsg = '';

    if (currentProvider === 'ollama' || (apiKey && apiKey.trim().length > 5)) {
      refreshModels();
    }
  }

  function saveSettings() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mugen_provider', currentProvider);
      if (apiKey) {
        localStorage.setItem(`mugen_key_${currentProvider}`, apiKey);
        localStorage.setItem(`mugen_api_key_${currentProvider}`, apiKey);
      }
      localStorage.setItem('mugen_model', currentModel);
    }

    dispatch('save', {
      provider: currentProvider,
      model: currentModel,
      apiKey,
      ollamaUrl
    });

    close();
  }

  function close() {
    isOpen = false;
    dispatch('close');
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fade-in">
    <!-- 主彈窗容器：嚴格限制 max-h-[85vh]，內容可捲動，Header/Footer 永不被擠壓遮擋 -->
    <div class="w-full max-w-xl max-h-[85vh] bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col">
      
      <!-- Header (固定頂部) -->
      <div class="p-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-[18px]">settings</span>
          </div>
          <div class="flex flex-col">
            <h3 class="text-sm font-bold text-[#ebdbb2]">系統偏好與模型設定 (Settings)</h3>
            <span class="font-mono text-[10px] text-[#a89984]">自訂 AI 密鑰、閱讀主題與 Vim 導航</span>
          </div>
        </div>

        <button
          class="w-7 h-7 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors cursor-pointer"
          on:click={close}
          title="關閉"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Content (彈性捲動內容區) -->
      <div class="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
        
        <!-- Privacy Guarantee -->
        <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5">
          <span class="material-symbols-outlined text-[18px] text-[#b8bb26] shrink-0 mt-0.5">verified_user</span>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-[#ebdbb2]">零伺服器隱私保證 (Zero-Server Knowledge)</span>
            <span class="text-[#a89984] leading-relaxed">
              您的 API 金鑰僅存放於本機瀏覽器 LocalStorage，所有伴讀請求直接向官方端點發起。
            </span>
          </div>
        </div>

        <!-- Provider Select -->
        <div class="flex flex-col gap-1.5">
          <span class="font-mono text-[11px] text-[#d5c4a1]">選擇 AI Provider</span>
          <div class="grid grid-cols-2 gap-2">
            {#each providers as p}
              <button
                class="px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer {currentProvider === p.id ? 'bg-[#3c3836] border-[#fe8019] text-[#fe8019] font-semibold' : 'bg-[#1d2021] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
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
            <label for="settings-api-key-input" class="font-mono text-[11px] text-[#d5c4a1]">
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
              id="settings-api-key-input"
              class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs"
              type="text"
              placeholder="http://localhost:11434"
              bind:value={ollamaUrl}
              on:input={handleKeyInput}
            />
          {:else}
            <input
              id="settings-api-key-input"
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

        <!-- Model Selection with Auto-fetch -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="settings-model-select" class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1.5">
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

            {#if apiKey && currentProvider !== 'ollama'}
              <button
                class="font-mono text-[10px] text-[#8ec07c] hover:underline flex items-center gap-0.5 cursor-pointer"
                on:click={refreshModels}
              >
                <span class="material-symbols-outlined text-[11px]">refresh</span>
                <span>重新檢查</span>
              </button>
            {/if}
          </div>

          <div class="relative">
            <select
              id="settings-model-select"
              class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs cursor-pointer appearance-none"
              bind:value={currentModel}
            >
              {#each availableModels as m}
                <option value={m.id} class="bg-[#1d2021] text-[#ebdbb2]">
                  {m.name || m.id} {m.contextWindow ? `(${Math.round(m.contextWindow / 1000)}k ctx)` : ''}
                </option>
              {/each}
            </select>
            <span class="material-symbols-outlined text-[16px] text-[#a89984] absolute right-3 top-2.5 pointer-events-none">
              expand_more
            </span>
          </div>

          {#if fetchErrorMsg}
            <span class="font-mono text-[10px] text-[#fabd2f]">{fetchErrorMsg}</span>
          {/if}
        </div>

        <!-- Vim Cursor & Dynamic Bounce Section -->
        <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1.5 font-medium">
              <span class="material-symbols-outlined text-[15px] text-[#fe8019]">terminal</span>
              <span>Vim 游標瀏覽與動態彈跳效果</span>
            </span>
            <span class="font-mono text-[10px] text-[#8ec07c]">
              {$vimConfigStore.isVimEnabled ? '已啟用' : '已關閉'}
            </span>
          </div>

          <div class="bg-[#1d2021] border border-[#3c3836] p-3 rounded-lg flex flex-col gap-2.5">
            <!-- Vim 模式主開關 -->
            <label class="flex items-center justify-between cursor-pointer select-none">
              <div class="flex flex-col pr-3">
                <span class="text-[11px] font-medium text-[#ebdbb2]">啟用 Vim 鍵盤瀏覽 (h, j, k, l)</span>
                <span class="text-[10px] text-[#a89984]">按 j/k 垂直行換行（到達段落末/首時跨段落）、h/l 水平移動字元、t 切換譯文</span>
              </div>
              <input
                type="checkbox"
                class="accent-[#fe8019] h-4 w-4 rounded cursor-pointer shrink-0"
                checked={$vimConfigStore.isVimEnabled}
                on:change={(e) => updateVimConfig({ isVimEnabled: e.currentTarget.checked })}
              />
            </label>

            <!-- 閃爍游標開關 -->
            <label class="flex items-center justify-between cursor-pointer select-none border-t border-[#3c3836]/60 pt-2">
              <div class="flex flex-col pr-3">
                <span class="text-[11px] font-medium text-[#ebdbb2]">真實呼吸閃爍方塊游標 (Blinking Block Cursor)</span>
                <span class="text-[10px] text-[#a89984]">模擬終端機方塊游標呼吸閃爍，移動時維持常亮、停止 400ms 後呼吸閃爍</span>
              </div>
              <input
                type="checkbox"
                class="accent-[#fe8019] h-4 w-4 rounded cursor-pointer shrink-0"
                checked={$vimConfigStore.isBlinkEnabled}
                on:change={(e) => updateVimConfig({ isBlinkEnabled: e.currentTarget.checked })}
              />
            </label>
            <!-- 游標彈跳強度滑桿 -->
            <div class="flex flex-col gap-1.5 border-t border-[#3c3836]/60 pt-2">
              <div class="flex items-center justify-between text-[10px] font-mono">
                <div class="flex flex-col">
                  <span class="text-[#ebdbb2] font-medium">游標彈跳強度 (Bounce Strength)</span>
                  <span class="text-[#a89984] text-[9px]">調節 Spring 物理回彈力度與梯形動態形變（設為 0% 即無彈跳瞬移到位）</span>
                </div>
                <span class="text-[#fabd2f] font-bold shrink-0">
                  {($vimConfigStore.bounceStrength ?? 60) === 0 ? '0% (無彈跳)' : `${$vimConfigStore.bounceStrength ?? 60}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                class="accent-[#fe8019] w-full cursor-pointer h-1.5 bg-[#3c3836] rounded-lg"
                value={$vimConfigStore.bounceStrength ?? 60}
                on:input={(e) => updateVimConfig({ bounceStrength: parseInt(e.currentTarget.value, 10) })}
              />
            </div>
          </div>
        </div>

        <!-- Theme & Appearance Section -->
        <div class="flex flex-col gap-1.5 pt-2 border-t border-[#3c3836]">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px] text-[#fe8019]">palette</span>
              <span>介面與閱讀主題 (Appearance & Theme)</span>
            </span>
            <span class="font-mono text-[10px] text-[#a89984]">
              {THEMES.find(t => t.id === $currentTheme)?.zhName || '經典暖墨'}
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 bg-[#1d2021] rounded-lg border border-[#3c3836]">
            {#each THEMES as t}
              <button
                type="button"
                class="px-2.5 py-2 rounded-lg border text-left flex flex-col gap-1.5 transition-all cursor-pointer {t.id === $currentTheme ? 'bg-[#3c3836] border-[#fe8019] shadow-sm' : 'bg-[#282828] border-[#3c3836] hover:border-[#504945] hover:bg-[#32302f]'}"
                on:click={() => setTheme(t.id)}
              >
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-0.5 p-0.5 bg-[#141617] rounded border border-[#504945] shrink-0">
                    {#each t.previewColors as color}
                      <span class="w-1.5 h-3 rounded-xs" style="background-color: {color};"></span>
                    {/each}
                  </div>
                  {#if t.id === $currentTheme}
                    <span class="material-symbols-outlined text-[13px] text-[#fe8019]">check_circle</span>
                  {/if}
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-medium text-[11px] truncate {t.id === $currentTheme ? 'text-[#fe8019] font-bold' : 'text-[#ebdbb2]'}">
                    {t.zhName}
                  </span>
                  <span class="font-mono text-[9px] text-[#a89984] truncate">
                    {t.name}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        </div>

      </div>

      <!-- Footer Actions (固定底部，永遠可見可按) -->
      <div class="p-3.5 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-end gap-2 shrink-0">
        <button
          class="px-4 py-1.5 rounded-lg text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors cursor-pointer"
          on:click={close}
        >
          取消
        </button>
        <button
          class="px-5 py-1.5 rounded-lg bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold transition-colors shadow-sm cursor-pointer"
          on:click={saveSettings}
        >
          儲存設定
        </button>
      </div>

    </div>
  </div>
{/if}
