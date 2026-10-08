<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchProviderModels, FALLBACK_MODELS, type ProviderModelItem } from '../../services/aiService';
  import { THEMES, currentTheme, setTheme } from '../../stores/themeStore';
  import {
    vimConfigStore,
    updateVimConfig,
    type CursorShape,
    type PulseMode
  } from '../../stores/vimCursorStore';
  import { t } from '../../stores/localeStore';
  import {
    getEmbeddingPreference,
    setEmbeddingPreference,
    type EmbeddingEnginePreference
  } from '../../services/embedding/hybridEmbeddingService';
  import {
    getVaultSecurityMode,
    isVaultUnlocked,
    unlockVaultWithPin,
    lockVault,
    getApiKey,
    setApiKey,
    switchVaultSecurityMode,
    clearAllStoredKeys,
    type VaultSecurityMode
  } from '../../services/crypto/keyVaultService';

  interface Props {
    onbackToWorkspace?: () => void;
    onsave?: (data: { provider: string; model: string; apiKey: string; ollamaUrl: string }) => void;
  }

  let {
    onbackToWorkspace,
    onsave
  }: Props = $props();

  type SettingTab = 'ai' | 'vim' | 'vector' | 'vault' | 'appearance';
  let activeTab = $state<SettingTab>('ai');

  const providers = [
    { id: 'groq', name: 'Groq LPU', defaultModel: 'llama-3.3-70b-versatile', badge: 'Ultra-Fast' },
    { id: 'google', name: 'Google Gemini', defaultModel: 'gemini-1.5-pro' },
    { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022' },
    { id: 'openai', name: 'OpenAI GPT', defaultModel: 'gpt-4o' },
    { id: 'deepseek', name: 'DeepSeek Official', defaultModel: 'deepseek-reasoner' },
    { id: 'ollama', name: 'Local Ollama', defaultModel: 'llama3.3:70b' }
  ];

  let currentProvider = $state('groq');
  let currentModel = $state('llama-3.3-70b-versatile');
  let apiKey = $state('');
  let ollamaUrl = $state('http://localhost:11434');
  let availableModels = $state<ProviderModelItem[]>([]);
  let isLoadingModels = $state(false);
  let fetchStatus = $state<'idle' | 'success' | 'error'>('idle');
  let fetchErrorMsg = $state('');
  let debounceTimer: any = null;
  let embeddingPref = $state<EmbeddingEnginePreference>('api-first');

  // 金鑰安全與加密狀態
  let vaultMode = $state<VaultSecurityMode>('device-auto');
  let isUnlocked = $state(true);
  let showApiKey = $state(false);
  let pinInput = $state('');
  let newPinInput = $state('');
  let confirmPinInput = $state('');
  let isSettingNewPin = $state(false);
  let vaultNotice = $state('');
  let vaultError = $state('');

  // 儲存成功 Toast 提示
  let toastMsg = $state('');
  let toastTimer: any = null;

  function showToast(msg: string) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg = '';
    }, 3200);
  }

  onMount(async () => {
    if (typeof window !== 'undefined') {
      embeddingPref = getEmbeddingPreference();
      currentProvider = localStorage.getItem('mugen_provider') || 'groq';

      vaultMode = getVaultSecurityMode();
      isUnlocked = isVaultUnlocked();

      const savedKey = await getApiKey(currentProvider);
      if (savedKey) apiKey = savedKey;

      currentModel = localStorage.getItem('mugen_model') || 'llama-3.3-70b-versatile';
      availableModels = FALLBACK_MODELS[currentProvider] || [];

      if (apiKey && apiKey.trim().length > 5) {
        refreshModels();
      }
    }
  });

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
        throw new Error($t('settingsModal.errors.modelFetchFailed'));
      }
    } catch (err: any) {
      console.warn('讀取模型清單失敗，切換為預設模型:', err);
      availableModels = FALLBACK_MODELS[currentProvider] || [];
      fetchStatus = 'error';
      fetchErrorMsg = err.message || $t('settingsModal.errors.modelFetchError');
    } finally {
      isLoadingModels = false;
    }
  }

  async function handleProviderChange(providerId: string) {
    currentProvider = providerId;
    apiKey = await getApiKey(providerId);

    const prov = providers.find(p => p.id === providerId);
    currentModel = prov ? prov.defaultModel : 'llama-3.3-70b-versatile';

    availableModels = FALLBACK_MODELS[providerId] || [];
    fetchStatus = 'idle';
    fetchErrorMsg = '';

    if (currentProvider === 'ollama' || (apiKey && apiKey.trim().length > 5)) {
      refreshModels();
    }
  }

  async function handleModeSelect(newMode: VaultSecurityMode) {
    vaultNotice = '';
    vaultError = '';
    if (newMode === vaultMode) return;

    if (newMode === 'master-pin') {
      isSettingNewPin = true;
      newPinInput = '';
      confirmPinInput = '';
      return;
    }

    try {
      await switchVaultSecurityMode(newMode);
      vaultMode = newMode;
      isUnlocked = isVaultUnlocked();
      isSettingNewPin = false;
      vaultNotice = newMode === 'device-auto' ? $t('settingsModal.notices.deviceAuto') : $t('settingsModal.notices.plain');
      setTimeout(() => (vaultNotice = ''), 3000);
    } catch (e: any) {
      vaultError = e.message || $t('settingsModal.errors.switchFailed');
    }
  }

  async function applyMasterPin() {
    vaultError = '';
    if (!newPinInput || newPinInput.length < 4) {
      vaultError = $t('settingsModal.errors.pinMinLen');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      vaultError = $t('settingsModal.errors.pinMismatch');
      return;
    }

    try {
      await switchVaultSecurityMode('master-pin', { newPin: newPinInput });
      vaultMode = 'master-pin';
      isUnlocked = true;
      isSettingNewPin = false;
      newPinInput = '';
      confirmPinInput = '';
      vaultNotice = $t('settingsModal.notices.pinMode');
      setTimeout(() => (vaultNotice = ''), 3000);
    } catch (e: any) {
      vaultError = e.message || $t('settingsModal.errors.pinSetupFailed');
    }
  }

  async function handleUnlockVault() {
    vaultError = '';
    if (!pinInput) {
      vaultError = $t('settingsModal.errors.pinRequired');
      return;
    }

    const success = await unlockVaultWithPin(pinInput);
    if (success) {
      isUnlocked = true;
      pinInput = '';
      vaultNotice = $t('settingsModal.notices.unlocked');
      apiKey = await getApiKey(currentProvider);
      if (apiKey && apiKey.trim().length > 5) {
        refreshModels();
      }
      setTimeout(() => (vaultNotice = ''), 3000);
    } else {
      vaultError = $t('settingsModal.errors.pinIncorrect');
    }
  }

  function handleLockVault() {
    lockVault();
    isUnlocked = false;
    apiKey = '';
    vaultNotice = $t('settingsModal.notices.locked');
    setTimeout(() => (vaultNotice = ''), 3000);
  }

  async function handleWipeAllKeys() {
    if (confirm($t('settingsModal.wipeConfirm'))) {
      await clearAllStoredKeys();
      apiKey = '';
      vaultNotice = $t('settingsModal.notices.wiped');
      setTimeout(() => (vaultNotice = ''), 3000);
    }
  }

  async function saveAllSettings() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mugen_provider', currentProvider);
      if (currentProvider !== 'ollama') {
        await setApiKey(currentProvider, apiKey);
      }
      localStorage.setItem('mugen_model', currentModel);
      setEmbeddingPreference(embeddingPref);
    }

    onsave?.({
      provider: currentProvider,
      model: currentModel,
      apiKey,
      ollamaUrl
    });

    showToast($t('settingsModal.saveSuccess') || '設定已成功儲存！');
  }

  // 游標形態選項
  const cursorShapes: { id: CursorShape; label: string; desc: string; icon: string }[] = [
    { id: 'block', label: '實心方塊 (Block)', desc: '經典終端高對比，聚焦文字字元核心', icon: 'square' },
    { id: 'hollow', label: '空心外框 (Hollow)', desc: '文字完全無遮蔽，乾淨俐落高對比外廓', icon: 'crop_square' },
    { id: 'underline', label: '閱讀底線 (Underline)', desc: '貼齊文字基線，專為速讀訓練設計的導航規', icon: 'horizontal_rule' }
  ];

  // 靜態脈動選項
  const pulseModes: { id: PulseMode; label: string; desc: string; icon: string }[] = [
    { id: 'blink', label: '經典閃爍 (Blink)', desc: '1.1s 溫和淡入淡出，移動時自動鎖定常亮避震', icon: 'flash_on' },
    { id: 'breathe', label: '禪意呼吸 (Breathe)', desc: '3.0s 週期深邃雙層光暈綻放，營造專注心流', icon: 'air' },
    { id: 'steady', label: '常駐微光 (Steady)', desc: '靜止時無任何波動，安靜無干擾的常亮錨點', icon: 'light_mode' }
  ];
</script>

<div class="flex-1 w-full h-full flex flex-col md:flex-row bg-[#1d2021] text-[#ebdbb2] overflow-hidden select-text">
  <!-- Left Settings Navigation Sidebar (240px) -->
  <aside class="w-full md:w-64 bg-[#141617] border-r border-[#3c3836] flex flex-col justify-between p-4 shrink-0 select-none">
    <div class="flex flex-col gap-4">
      <!-- Back to Workspace Button -->
      <button
        class="w-full px-3 py-2 rounded-lg bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#fe8019] hover:text-[#fabd2f] text-xs font-mono font-medium flex items-center justify-between transition-colors cursor-pointer shadow-sm"
        onclick={onbackToWorkspace}
      >
        <span class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>{$t('nav.backToWorkspace')}</span>
        </span>
        <span class="text-[10px] text-[#a89984] font-mono">ESC</span>
      </button>

      <!-- Sidebar Title -->
      <div class="flex items-center gap-2 px-1 pt-1">
        <div class="w-7 h-7 rounded-lg bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
          <span class="material-symbols-outlined text-[18px]">tune</span>
        </div>
        <div class="flex flex-col">
          <h2 class="text-sm font-bold text-[#ebdbb2] leading-tight">系統設定</h2>
          <span class="font-mono text-[9px] text-[#a89984]">MUGEN YOMU STUDIO</span>
        </div>
      </div>

      <!-- Navigation Category Tabs -->
      <nav class="flex flex-col gap-1 mt-2">
        <button
          class="w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium text-left transition-colors cursor-pointer {activeTab === 'ai' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => activeTab = 'ai'}
        >
          <span class="material-symbols-outlined text-[18px]">smart_toy</span>
          <span>AI 模型與金鑰 (BYOK)</span>
        </button>

        <button
          class="w-full px-3 py-2.5 rounded-lg flex items-center justify-between text-xs font-medium text-left transition-colors cursor-pointer {activeTab === 'vim' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => activeTab = 'vim'}
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[18px]">navigation</span>
            <span>Vim 游標動力學</span>
          </div>
          <span class="font-mono text-[9px] bg-[#fe8019]/15 border border-[#fe8019]/40 text-[#fe8019] px-1 py-0.2 rounded font-semibold">
            {$vimConfigStore.isVimEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          class="w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium text-left transition-colors cursor-pointer {activeTab === 'vector' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => activeTab = 'vector'}
        >
          <span class="material-symbols-outlined text-[18px]">hub</span>
          <span>語意向量檢索引擎</span>
        </button>

        <button
          class="w-full px-3 py-2.5 rounded-lg flex items-center justify-between text-xs font-medium text-left transition-colors cursor-pointer {activeTab === 'vault' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => activeTab = 'vault'}
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[18px]">lock</span>
            <span>金鑰安全保險庫</span>
          </div>
          {#if vaultMode === 'master-pin'}
            <span class="material-symbols-outlined text-[14px] {isUnlocked ? 'text-[#b8bb26]' : 'text-[#fb4934]'}">
              {isUnlocked ? 'lock_open' : 'lock'}
            </span>
          {/if}
        </button>

        <button
          class="w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium text-left transition-colors cursor-pointer {activeTab === 'appearance' ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          onclick={() => activeTab = 'appearance'}
        >
          <span class="material-symbols-outlined text-[18px]">palette</span>
          <span>外觀與主題風格</span>
        </button>
      </nav>
    </div>

    <!-- Bottom Meta Info -->
    <div class="p-3 bg-[#1d2021] border border-[#3c3836] rounded-xl flex flex-col gap-1.5">
      <div class="flex items-center justify-between text-[10px] font-mono text-[#a89984]">
        <span>架構規格</span>
        <span class="text-[#b8bb26]">Client-Side Only</span>
      </div>
      <p class="text-[10px] text-[#928374] leading-relaxed">
        所有 API Key 與設定僅儲存於您的瀏覽器本地，絕不上傳至任何第三方中繼伺服器。
      </p>
    </div>
  </aside>

  <!-- Right Settings Content Area -->
  <main class="flex-1 h-full overflow-y-auto p-6 md:p-8 flex flex-col gap-6 max-w-4xl">
    <!-- Top Action Bar with Save Button & Toast -->
    <div class="flex items-center justify-between pb-4 border-b border-[#3c3836]">
      <div>
        <h1 class="text-xl font-bold text-[#ebdbb2]">
          {#if activeTab === 'ai'}AI 模型與金鑰配置 (BYOK)
          {:else if activeTab === 'vim'}Vim 心流游標導航動力學
          {:else if activeTab === 'vector'}語意向量與混合檢索配置
          {:else if activeTab === 'vault'}金鑰隱私安全與加密保險庫
          {:else}外觀風格與主題色彩
          {/if}
        </h1>
        <p class="text-xs text-[#a89984] mt-1">
          {#if activeTab === 'ai'}設定支援 Groq、Gemini、Claude、OpenAI 等大模型之伴讀與推導金鑰。
          {:else if activeTab === 'vim'}自訂正統 Vim 鍵盤導引動力學、多幾何形態錨點與禪意呼吸光暈。
          {:else if activeTab === 'vector'}配置本機端側 ONNX 向量嵌入與雲端語意雷達之混合權重。
          {:else if activeTab === 'vault'}採用 AES-GCM 端側硬體加密，完全掌控 API 金鑰存取生命週期。
          {:else}自由挑選專為長篇論文調校之 14 款沉浸式深暗、柔亮與羊皮紙主題。
          {/if}
        </p>
      </div>

      <div class="flex items-center gap-3">
        {#if toastMsg}
          <span class="font-mono text-xs text-[#b8bb26] bg-[#b8bb26]/10 border border-[#b8bb26]/40 px-2.5 py-1 rounded-md animate-fade-in flex items-center gap-1.5 shadow-sm">
            <span class="material-symbols-outlined text-[14px]">check_circle</span>
            <span>{toastMsg}</span>
          </span>
        {/if}
        <button
          class="px-4 py-2 bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
          onclick={saveAllSettings}
        >
          <span class="material-symbols-outlined text-[16px]">save</span>
          <span>儲存全部變更</span>
        </button>
      </div>
    </div>

    <!-- Tab 1: AI Models & BYOK -->
    {#if activeTab === 'ai'}
      <div class="flex flex-col gap-6">
        <!-- Provider Grid -->
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-3">
          <label class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono">
            {$t('settingsModal.providerLabel')}
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {#each providers as prov}
              <button
                type="button"
                class="flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer {currentProvider === prov.id ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
                onclick={() => handleProviderChange(prov.id)}
              >
                <div class="flex items-center justify-between w-full">
                  <span class="font-medium text-xs {currentProvider === prov.id ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">{prov.name}</span>
                  {#if prov.badge}
                    <span class="font-mono text-[9px] bg-[#fe8019]/20 text-[#fe8019] border border-[#fe8019]/40 px-1 rounded font-bold">{prov.badge}</span>
                  {/if}
                </div>
                <span class="font-mono text-[10px] text-[#a89984] mt-1 truncate w-full">{prov.defaultModel}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- API Key & Ollama Config -->
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <label for="input-api-key" class="text-xs font-semibold text-[#ebdbb2] flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-[#fe8019]">vpn_key</span>
              <span>{currentProvider === 'ollama' ? 'Ollama API 端點位址' : $t('settingsModal.apiKeyLabel', { provider: providers.find(p => p.id === currentProvider)?.name || currentProvider })}</span>
            </label>
            <span class="font-mono text-[10px] text-[#b8bb26] bg-[#b8bb26]/10 border border-[#b8bb26]/30 px-2 py-0.5 rounded">
              {$t('settingsModal.clientOnlyBadge')}
            </span>
          </div>

          {#if currentProvider === 'ollama'}
            <input
              id="input-ollama-url"
              type="text"
              class="w-full bg-[#1d2021] border border-[#504945] rounded-lg px-3 py-2 text-xs font-mono text-[#ebdbb2] focus:border-[#fe8019] focus:outline-none"
              placeholder="http://localhost:11434"
              bind:value={ollamaUrl}
              oninput={handleKeyInput}
            />
          {:else}
            <div class="relative">
              <input
                id="input-api-key"
                type={showApiKey ? 'text' : 'password'}
                class="w-full bg-[#1d2021] border border-[#504945] rounded-lg pl-3 pr-10 py-2.5 text-xs font-mono text-[#ebdbb2] focus:border-[#fe8019] focus:outline-none"
                placeholder={currentProvider === 'groq' ? 'gsk_...' : currentProvider === 'google' ? 'AIzaSy...' : 'sk-...'}
                bind:value={apiKey}
                oninput={handleKeyInput}
              />
              <button
                type="button"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a89984] hover:text-[#ebdbb2] transition-colors cursor-pointer"
                onclick={() => showApiKey = !showApiKey}
                title={showApiKey ? $t('settingsModal.maskKey') : $t('settingsModal.showKey')}
              >
                <span class="material-symbols-outlined text-[16px]">{showApiKey ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          {/if}
        </div>

        <!-- Model Selection -->
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <label for="select-model" class="text-xs font-semibold text-[#ebdbb2] flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">psychology</span>
              <span>{$t('settingsModal.modelLabel')}</span>
            </label>
            <button
              type="button"
              class="font-mono text-[10px] text-[#fe8019] hover:text-[#fabd2f] flex items-center gap-1 transition-colors cursor-pointer"
              onclick={refreshModels}
              disabled={isLoadingModels}
            >
              <span class="material-symbols-outlined text-[13px] {isLoadingModels ? 'animate-spin' : ''}">sync</span>
              <span>{isLoadingModels ? $t('settingsModal.fetchingModels') : $t('settingsModal.refreshModels')}</span>
            </button>
          </div>

          <div class="relative">
            <select
              id="select-model"
              class="w-full bg-[#1d2021] border border-[#504945] rounded-lg px-3 py-2.5 text-xs font-mono text-[#ebdbb2] focus:border-[#fe8019] focus:outline-none cursor-pointer appearance-none"
              bind:value={currentModel}
            >
              {#each availableModels as model}
                <option value={model.id}>
                  {model.name} {model.contextWindow ? `(${model.contextWindow})` : ''}
                </option>
              {/each}
            </select>
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#a89984] pointer-events-none text-[16px]">expand_more</span>
          </div>

          {#if fetchStatus === 'error'}
            <div class="text-[11px] text-[#fb4934] bg-[#fb4934]/10 border border-[#fb4934]/30 p-2.5 rounded-lg flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px]">error_outline</span>
              <span>{fetchErrorMsg}</span>
            </div>
          {/if}
        </div>
      </div>

    <!-- Tab 2: Vim Cursor Dynamics (階段一核心實作) -->
    {:else if activeTab === 'vim'}
      <div class="flex flex-col gap-6">
        <!-- Master Toggle -->
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex items-center justify-between">
          <div class="flex flex-col gap-1 pr-4">
            <span class="text-sm font-semibold text-[#ebdbb2] flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-[#fe8019]">navigation</span>
              <span>{$t('settingsModal.enableVim')}</span>
            </span>
            <span class="text-xs text-[#a89984]">{$t('settingsModal.enableVimDesc')}</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              class="sr-only peer"
              checked={$vimConfigStore.isVimEnabled}
              onchange={(e) => updateVimConfig({ isVimEnabled: e.currentTarget.checked })}
            />
            <div class="w-11 h-6 bg-[#1d2021] border border-[#504945] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#a89984] peer-checked:after:bg-[#1d2021] peer-checked:bg-[#fe8019] after:border-[#3c3836] after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        {#if $vimConfigStore.isVimEnabled}
          <!-- 幾何形態選擇卡片 (Cursor Shapes) -->
          <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-3">
            <label class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">shapes</span>
              <span>游標幾何形態 (Cursor Shapes)</span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {#each cursorShapes as item}
                <button
                  type="button"
                  class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {($vimConfigStore.shape || 'block') === item.id ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
                  onclick={() => updateVimConfig({ shape: item.id })}
                >
                  <div class="flex items-center justify-between w-full">
                    <span class="font-medium text-xs {($vimConfigStore.shape || 'block') === item.id ? 'text-[#fe8019]' : 'text-[#ebdbb2]'} flex items-center gap-1.5">
                      <span class="material-symbols-outlined text-[16px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    {#if ($vimConfigStore.shape || 'block') === item.id}
                      <span class="material-symbols-outlined text-[16px] text-[#fe8019]">check</span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">{item.desc}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 靜態脈動模式 (Pulse Modes) -->
          <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-3">
            <label class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-[#fe8019]">animation</span>
              <span>靜態脈動動效 (Pulse Mode)</span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {#each pulseModes as item}
                <button
                  type="button"
                  class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {($vimConfigStore.pulseMode || 'blink') === item.id ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
                  onclick={() => updateVimConfig({ pulseMode: item.id, isBlinkEnabled: item.id !== 'steady' })}
                >
                  <div class="flex items-center justify-between w-full">
                    <span class="font-medium text-xs {($vimConfigStore.pulseMode || 'blink') === item.id ? 'text-[#fe8019]' : 'text-[#ebdbb2]'} flex items-center gap-1.5">
                      <span class="material-symbols-outlined text-[16px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    {#if ($vimConfigStore.pulseMode || 'blink') === item.id}
                      <span class="material-symbols-outlined text-[16px] text-[#fe8019]">check</span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">{item.desc}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 外觀細緻微調拉桿 (Sliders) -->
          <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-5">
            <span class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono">
              動力學與外觀微調 (Physics & Fine-Tuning)
            </span>

            <!-- 彈跳強度 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-[#ebdbb2] font-medium">梯形彈簧彈跳強度 (Bounce Strength)</span>
                <span class="font-mono text-[#fe8019]">{$vimConfigStore.bounceStrength ?? 60}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                class="w-full accent-[#fe8019] bg-[#1d2021] rounded-lg cursor-pointer"
                value={$vimConfigStore.bounceStrength ?? 60}
                oninput={(e) => updateVimConfig({ bounceStrength: parseInt(e.currentTarget.value, 10) })}
              />
              <span class="text-[10px] text-[#a89984]">0% 為純過阻尼快速吸附，數值愈高愈具備如果凍般的超調回彈 (Overshoot Spring)。</span>
            </div>

            <!-- 筆觸線寬 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-[#ebdbb2] font-medium">框線 / 底線粗細 (Stroke Thickness)</span>
                <span class="font-mono text-[#fe8019]">{($vimConfigStore.thickness ?? 1.5).toFixed(1)} px</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.5"
                class="w-full accent-[#fe8019] bg-[#1d2021] rounded-lg cursor-pointer"
                value={$vimConfigStore.thickness ?? 1.5}
                oninput={(e) => updateVimConfig({ thickness: parseFloat(e.currentTarget.value) })}
              />
            </div>

            <!-- 微光暈擴散 -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-[#ebdbb2] font-medium">心流微光暈半徑 (Flow Glow Radius)</span>
                <span class="font-mono text-[#fe8019]">{$vimConfigStore.glowRadius ?? 0} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                class="w-full accent-[#fe8019] bg-[#1d2021] rounded-lg cursor-pointer"
                value={$vimConfigStore.glowRadius ?? 0}
                oninput={(e) => updateVimConfig({ glowRadius: parseInt(e.currentTarget.value, 10) })}
              />
            </div>

            <!-- 跨段落平滑捲動 -->
            <div class="flex items-center justify-between pt-2 border-t border-[#3c3836]">
              <div class="flex flex-col pr-3">
                <span class="text-xs font-medium text-[#ebdbb2]">跨段落平滑捲動 (Smooth Viewport Scroll)</span>
                <span class="text-[10px] text-[#a89984]">長距離導航時提供流暢視線跟隨，關閉則為極致零延遲瞬移。</span>
              </div>
              <input
                type="checkbox"
                class="accent-[#fe8019] w-4 h-4 rounded cursor-pointer"
                checked={$vimConfigStore.isSmoothScrollEnabled}
                onchange={(e) => updateVimConfig({ isSmoothScrollEnabled: e.currentTarget.checked })}
              />
            </div>
          </div>

          <!-- 即時互動預覽沙盒 (Preview Sandbox) -->
          <div class="bg-[#141617] border border-[#fe8019]/40 p-5 rounded-xl flex flex-col gap-3 shadow-inner">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs text-[#fe8019] flex items-center gap-1.5 font-semibold">
                <span class="material-symbols-outlined text-[16px]">visibility</span>
                <span>即時游標效果沙盒 (Live Interactive Sandbox)</span>
              </span>
              <span class="font-mono text-[10px] text-[#a89984]">形變阻尼與呼吸渲染展示</span>
            </div>
            <div class="p-4 bg-[#1d2021] rounded-lg border border-[#3c3836] text-xs leading-relaxed text-[#ebdbb2] select-none">
              <p>
                「手指引導視線閱讀，眼睛會自然跟隨指尖移動，能減少視線回跳並提升專注與沉浸感。」
              </p>
              <div class="mt-3 flex items-center gap-3 font-mono text-[11px] text-[#a89984]">
                <span>目前形態：<strong class="text-[#fabd2f]">{$vimConfigStore.shape}</strong></span>
                <span>脈動動效：<strong class="text-[#fabd2f]">{$vimConfigStore.pulseMode}</strong></span>
                <span>筆觸粗細：<strong class="text-[#fabd2f]">{$vimConfigStore.thickness}px</strong></span>
              </div>
            </div>
          </div>
        {/if}
      </div>

    <!-- Tab 3: Semantic & Embedding -->
    {:else if activeTab === 'vector'}
      <div class="flex flex-col gap-6">
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-3">
          <label class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono">
            {$t('settingsModal.embeddingEngineTitle')}
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {embeddingPref === 'api-first' ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
              onclick={() => embeddingPref = 'api-first'}
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-medium text-xs {embeddingPref === 'api-first' ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">
                  {$t('settingsModal.embeddingApiFirst')}
                </span>
                <span class="font-mono text-[9px] bg-[#fabd2f]/20 text-[#fabd2f] border border-[#fabd2f]/40 px-1 rounded">768 Dim</span>
              </div>
              <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">
                {$t('settingsModal.embeddingApiDesc')}
              </span>
            </button>

            <button
              type="button"
              class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {embeddingPref === 'local-only' ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
              onclick={() => embeddingPref = 'local-only'}
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-medium text-xs {embeddingPref === 'local-only' ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">
                  {$t('settingsModal.embeddingLocalOnly')}
                </span>
                <span class="font-mono text-[9px] bg-[#8ec07c]/20 text-[#8ec07c] border border-[#8ec07c]/40 px-1 rounded">384 Dim</span>
              </div>
              <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">
                {$t('settingsModal.embeddingLocalDesc')}
              </span>
            </button>
          </div>
        </div>

        <div class="bg-[#141617] border border-[#3c3836] p-4 rounded-xl flex items-center gap-3 text-xs text-[#a89984]">
          <span class="material-symbols-outlined text-[20px] text-[#8ec07c]">verified_user</span>
          <span>向量特徵與語意索引均永久快取於瀏覽器 IndexedDB，跨對話重訪零 Token 開銷。</span>
        </div>
      </div>

    <!-- Tab 4: Key Security Vault -->
    {:else if activeTab === 'vault'}
      <div class="flex flex-col gap-6">
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-4">
          <span class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono">
            金鑰存取防護模式 (Security Level)
          </span>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {vaultMode === 'device-auto' ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
              onclick={() => handleModeSelect('device-auto')}
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-medium text-xs {vaultMode === 'device-auto' ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">裝置透明加密</span>
                <span class="material-symbols-outlined text-[16px] text-[#8ec07c]">lock</span>
              </div>
              <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">本機專屬隨機密鑰，自動解密無阻礙，兼顧安全與體驗。</span>
            </button>

            <button
              type="button"
              class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {vaultMode === 'master-pin' ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
              onclick={() => handleModeSelect('master-pin')}
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-medium text-xs {vaultMode === 'master-pin' ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">主 PIN 碼強化</span>
                <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">pin</span>
              </div>
              <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">每次工作階段需輸入自訂 PIN 碼，軍事級金鑰保密。</span>
            </button>

            <button
              type="button"
              class="flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer {vaultMode === 'plaintext' ? 'bg-[#3c3836] border-[#fb4934] shadow-md ring-1 ring-[#fb4934]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
              onclick={() => handleModeSelect('plaintext')}
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-medium text-xs {vaultMode === 'plaintext' ? 'text-[#fb4934]' : 'text-[#ebdbb2]'}">標準模式</span>
                <span class="material-symbols-outlined text-[16px] text-[#928374]">no_encryption</span>
              </div>
              <span class="text-[11px] text-[#a89984] mt-2 leading-relaxed">直接以 LocalStorage 儲存，供開發測試或極簡環境使用。</span>
            </button>
          </div>

          {#if vaultNotice}
            <div class="text-xs text-[#b8bb26] bg-[#b8bb26]/10 border border-[#b8bb26]/30 p-2.5 rounded-lg flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">check_circle</span>
              <span>{vaultNotice}</span>
            </div>
          {/if}

          {#if vaultError}
            <div class="text-xs text-[#fb4934] bg-[#fb4934]/10 border border-[#fb4934]/30 p-2.5 rounded-lg flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">error</span>
              <span>{vaultError}</span>
            </div>
          {/if}

          <!-- PIN Setup / Unlock Controls -->
          {#if isSettingNewPin}
            <div class="p-4 bg-[#1d2021] border border-[#fabd2f]/40 rounded-xl flex flex-col gap-3">
              <span class="text-xs font-semibold text-[#fabd2f]">設定主安全 PIN 碼</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  placeholder="輸入新 PIN 碼 (至少 4 位數)"
                  class="bg-[#282828] border border-[#504945] rounded-lg px-3 py-2 text-xs font-mono text-[#ebdbb2] focus:border-[#fe8019] focus:outline-none"
                  bind:value={newPinInput}
                />
                <input
                  type="password"
                  placeholder="再次確認新 PIN 碼"
                  class="bg-[#282828] border border-[#504945] rounded-lg px-3 py-2 text-xs font-mono text-[#ebdbb2] focus:border-[#fe8019] focus:outline-none"
                  bind:value={confirmPinInput}
                />
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 bg-[#fabd2f] text-[#1d2021] font-semibold rounded-lg text-xs hover:bg-[#d79921] transition-colors cursor-pointer"
                  onclick={applyMasterPin}
                >
                  確認啟用 PIN 碼
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 bg-[#282828] text-[#a89984] hover:text-[#ebdbb2] rounded-lg text-xs transition-colors cursor-pointer"
                  onclick={() => isSettingNewPin = false}
                >
                  取消
                </button>
              </div>
            </div>
          {:else if vaultMode === 'master-pin'}
            <div class="p-4 bg-[#1d2021] border border-[#3c3836] rounded-xl flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[20px] {isUnlocked ? 'text-[#b8bb26]' : 'text-[#fb4934]'}">
                  {isUnlocked ? 'lock_open' : 'lock'}
                </span>
                <span class="text-xs text-[#ebdbb2]">
                  當前狀態：<strong>{isUnlocked ? '已解鎖 (金鑰已載入)' : '已鎖定 (金鑰受到保護)'}</strong>
                </span>
              </div>

              {#if isUnlocked}
                <button
                  type="button"
                  class="px-3 py-1.5 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] rounded-lg text-xs transition-colors cursor-pointer"
                  onclick={handleLockVault}
                >
                  立即鎖定保險庫
                </button>
              {:else}
                <div class="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="輸入 PIN 碼"
                    class="bg-[#282828] border border-[#504945] rounded-lg px-3 py-1.5 text-xs font-mono text-[#ebdbb2] w-32 focus:border-[#fe8019] focus:outline-none"
                    bind:value={pinInput}
                  />
                  <button
                    type="button"
                    class="px-3 py-1.5 bg-[#fe8019] text-[#1d2021] font-semibold rounded-lg text-xs hover:bg-[#d65d0e] transition-colors cursor-pointer"
                    onclick={handleUnlockVault}
                  >
                    解鎖
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Emergency Wipe -->
          <div class="pt-4 border-t border-[#3c3836] flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-xs font-semibold text-[#fb4934]">緊急銷毀金鑰 (Emergency Wipe)</span>
              <span class="text-[10px] text-[#a89984]">徹底清除本地所有快取金鑰與 PIN 密鑰資料。</span>
            </div>
            <button
              type="button"
              class="px-3 py-1.5 bg-[#fb4934]/15 hover:bg-[#fb4934]/25 border border-[#fb4934]/40 text-[#fb4934] rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              onclick={handleWipeAllKeys}
            >
              清除所有本地金鑰
            </button>
          </div>
        </div>
      </div>

    <!-- Tab 5: Appearance & Themes -->
    {:else if activeTab === 'appearance'}
      <div class="flex flex-col gap-6">
        <div class="bg-[#282828] border border-[#3c3836] p-5 rounded-xl flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[#ebdbb2] uppercase tracking-wider font-mono">
              全站配色主題 (Theme Palettes)
            </span>
            <span class="font-mono text-[10px] text-[#a89984]">共 {THEMES.length} 款專業主題</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {#each THEMES as thm}
              <button
                type="button"
                class="flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer {thm.id === $currentTheme ? 'bg-[#3c3836] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#1d2021] border-[#3c3836] hover:border-[#504945]'}"
                onclick={() => setTheme(thm.id)}
              >
                <div class="flex items-center justify-between w-full">
                  <span class="font-medium text-xs {thm.id === $currentTheme ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">{thm.zhName}</span>
                  {#if thm.id === $currentTheme}
                    <span class="material-symbols-outlined text-[16px] text-[#fe8019]">check</span>
                  {/if}
                </div>
                <span class="font-mono text-[10px] text-[#a89984] mt-0.5">{thm.name}</span>

                <!-- Color Swatch -->
                <div class="flex items-center gap-1 mt-3 p-1 bg-[#141617] rounded-lg border border-[#3c3836] w-fit">
                  {#each thm.previewColors as color}
                    <span class="w-3.5 h-4 rounded-sm shadow-xs" style="background-color: {color};"></span>
                  {/each}
                </div>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>
