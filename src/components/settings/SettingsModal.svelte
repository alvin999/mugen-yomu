<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchProviderModels, FALLBACK_MODELS, type ProviderModelItem } from '../../services/aiService';
  import { THEMES, currentTheme, setTheme } from '../../stores/themeStore';
  import { vimConfigStore, updateVimConfig } from '../../stores/vimCursorStore';
  import {
    getEmbeddingPreference,
    setEmbeddingPreference,
    type EmbeddingEnginePreference
  } from '../../services/embedding/hybridEmbeddingService';

  interface Props {
    isOpen?: boolean;
    currentProvider?: string;
    currentModel?: string;
    apiKey?: string;
    ollamaUrl?: string;
    onsave?: (data: { provider: string; model: string; apiKey: string; ollamaUrl: string }) => void;
    onclose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    currentProvider = $bindable('groq'),
    currentModel = $bindable('llama-3.3-70b-versatile'),
    apiKey = $bindable(''),
    ollamaUrl = $bindable('http://localhost:11434'),
    onsave,
    onclose
  }: Props = $props();

  const providers = [
    { id: 'groq', name: 'Groq LPU (極速推薦)', defaultModel: 'llama-3.3-70b-versatile', badge: 'Ultra-Fast' },
    { id: 'google', name: 'Google Gemini', defaultModel: 'gemini-1.5-pro' },
    { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022' },
    { id: 'openai', name: 'OpenAI GPT', defaultModel: 'gpt-4o' },
    { id: 'deepseek', name: 'DeepSeek Official', defaultModel: 'deepseek-reasoner' },
    { id: 'ollama', name: 'Local Ollama', defaultModel: 'llama3.3:70b' }
  ];

  let availableModels: ProviderModelItem[] = [];
  import {
    getVaultSecurityMode,
    isVaultUnlocked,
    hasMasterPinSet,
    unlockVaultWithPin,
    lockVault,
    setMasterPin,
    getApiKey,
    setApiKey,
    switchVaultSecurityMode,
    clearAllStoredKeys,
    type VaultSecurityMode
  } from '../../services/crypto/keyVaultService';

  let isLoadingModels: boolean = false;
  let fetchStatus: 'idle' | 'success' | 'error' = 'idle';
  let fetchErrorMsg: string = '';
  let debounceTimer: any = null;
  let embeddingPref: EmbeddingEnginePreference = 'api-first';

  // 金鑰安全與加密狀態
  let vaultMode: VaultSecurityMode = 'device-auto';
  let isUnlocked: boolean = true;
  let showApiKey: boolean = false;
  let pinInput: string = '';
  let newPinInput: string = '';
  let confirmPinInput: string = '';
  let isSettingNewPin: boolean = false;
  let vaultNotice: string = '';
  let vaultError: string = '';

  onMount(async () => {
    if (typeof window !== 'undefined') {
      embeddingPref = getEmbeddingPreference();
      const savedProvider = localStorage.getItem('mugen_provider') || 'groq';
      currentProvider = savedProvider;

      // 載入安全模式與解鎖狀態
      vaultMode = getVaultSecurityMode();
      isUnlocked = isVaultUnlocked();

      // 透過安全庫非同步取得金鑰
      const savedKey = await getApiKey(currentProvider);
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
      vaultNotice = newMode === 'device-auto' ? '已切換至「裝置透明加密」保護' : '已切換至「明文相容模式」';
      setTimeout(() => (vaultNotice = ''), 3000);
    } catch (e: any) {
      vaultError = e.message || '切換安全模式失敗';
    }
  }

  async function applyMasterPin() {
    vaultError = '';
    if (!newPinInput || newPinInput.length < 4) {
      vaultError = '主 PIN 碼長度至少需為 4 位';
      return;
    }
    if (newPinInput !== confirmPinInput) {
      vaultError = '兩次輸入的 PIN 碼不相符';
      return;
    }

    try {
      await switchVaultSecurityMode('master-pin', { newPin: newPinInput });
      vaultMode = 'master-pin';
      isUnlocked = true;
      isSettingNewPin = false;
      newPinInput = '';
      confirmPinInput = '';
      vaultNotice = '已啟用「主密碼 / PIN 強化保護」，密鑰已加密存放';
      setTimeout(() => (vaultNotice = ''), 3000);
    } catch (e: any) {
      vaultError = e.message || '設置主 PIN 碼失敗';
    }
  }

  async function handleUnlockVault() {
    vaultError = '';
    if (!pinInput) {
      vaultError = '請輸入解鎖 PIN 碼';
      return;
    }

    const success = await unlockVaultWithPin(pinInput);
    if (success) {
      isUnlocked = true;
      pinInput = '';
      vaultNotice = '金鑰庫已成功解鎖！';
      apiKey = await getApiKey(currentProvider);
      if (apiKey && apiKey.trim().length > 5) {
        refreshModels();
      }
      setTimeout(() => (vaultNotice = ''), 3000);
    } else {
      vaultError = 'PIN 碼錯誤，無法解鎖金鑰';
    }
  }

  function handleLockVault() {
    lockVault();
    isUnlocked = false;
    apiKey = '';
    vaultNotice = '金鑰庫已立即鎖定，記憶體快取已安全釋放';
    setTimeout(() => (vaultNotice = ''), 3000);
  }

  async function handleWipeAllKeys() {
    if (confirm('確定要安全抹除所有本機 API 金鑰與加密憑證嗎？此動作無法復原。')) {
      await clearAllStoredKeys();
      apiKey = '';
      vaultNotice = '所有金鑰與憑證已安全抹除！';
      setTimeout(() => (vaultNotice = ''), 3000);
    }
  }

  async function saveSettings() {
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

    close();
  }

  function close() {
    isOpen = false;
    onclose?.();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fade-in" aria-modal="true" role="dialog">
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

        <!-- API Key Input with Mask Toggle & Security Badge -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <label for="settings-api-key-input" class="font-mono text-[11px] text-[#d5c4a1]">
                {currentProvider === 'groq' ? 'Groq API Key' : `${currentProvider.toUpperCase()} API Key`}
              </label>
              {#if currentProvider !== 'ollama'}
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono {vaultMode === 'plaintext' ? 'bg-[#3c3836] text-[#a89984]' : vaultMode === 'device-auto' ? 'bg-[#8ec07c]/20 text-[#8ec07c] border border-[#8ec07c]/40' : 'bg-[#fe8019]/20 text-[#fe8019] border border-[#fe8019]/40'}">
                  <span class="material-symbols-outlined text-[11px]">
                    {vaultMode === 'plaintext' ? 'lock_open' : vaultMode === 'device-auto' ? 'lock' : 'key'}
                  </span>
                  <span>
                    {vaultMode === 'plaintext' ? '明文儲存' : vaultMode === 'device-auto' ? 'AES-GCM 透明加密' : (isUnlocked ? 'PIN 已解鎖' : 'PIN 鎖定中')}
                  </span>
                </span>
              {/if}
            </div>

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
            <div class="relative flex items-center">
              <input
                id="settings-api-key-input"
                class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] pl-3 pr-10 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs placeholder:text-[#a89984]/40"
                type={showApiKey ? 'text' : 'password'}
                placeholder={currentProvider === 'groq' ? 'gsk_...' : 'sk-...'}
                bind:value={apiKey}
                on:input={handleKeyInput}
                disabled={vaultMode === 'master-pin' && !isUnlocked}
              />
              <button
                type="button"
                class="absolute right-2.5 text-[#a89984] hover:text-[#ebdbb2] transition-colors p-1 flex items-center justify-center cursor-pointer"
                on:click={() => (showApiKey = !showApiKey)}
                title={showApiKey ? '隱藏金鑰' : '顯示明文'}
              >
                <span class="material-symbols-outlined text-[16px]">
                  {showApiKey ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          {/if}

          {#if vaultMode === 'master-pin' && !isUnlocked}
            <span class="font-mono text-[10px] text-[#fe8019] flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">lock</span>
              金鑰庫處於鎖定狀態，請在下方輸入 PIN 碼解鎖後使用。
            </span>
          {:else}
            <span class="font-mono text-[10px] text-[#a89984]">
              輸入金鑰後將自動連線官方端點讀取最新可用模型清單
            </span>
          {/if}
        </div>

        <!-- 🔒 Key Security & Encryption Vault Section -->
        <div class="flex flex-col gap-2 p-3 bg-[#1d2021] border border-[#3c3836] rounded-lg">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1.5 font-medium">
              <span class="material-symbols-outlined text-[15px] text-[#8ec07c]">shield</span>
              <span>BYOK API 金鑰本機加密保存 (KeyVault)</span>
            </span>
            <button
              type="button"
              class="font-mono text-[10px] text-[#fb4934] hover:underline flex items-center gap-0.5 cursor-pointer"
              on:click={handleWipeAllKeys}
              title="清除所有儲存之金鑰與解密憑證"
            >
              <span class="material-symbols-outlined text-[12px]">delete_forever</span>
              <span>抹除所有金鑰</span>
            </button>
          </div>

          <!-- 模式切換三個選項按鈕 -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <!-- 裝置透明加密 -->
            <button
              type="button"
              class="p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer {vaultMode === 'device-auto' ? 'bg-[#3c3836] border-[#8ec07c] text-[#ebdbb2]' : 'bg-[#282828] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
              on:click={() => handleModeSelect('device-auto')}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[11px] {vaultMode === 'device-auto' ? 'text-[#8ec07c]' : ''}">裝置透明加密</span>
                {#if vaultMode === 'device-auto'}
                  <span class="material-symbols-outlined text-[13px] text-[#8ec07c]">check_circle</span>
                {/if}
              </div>
              <span class="text-[9px] text-[#a89984]">AES-GCM 免輸密碼自動加解密</span>
            </button>

            <!-- 主 PIN 碼強化 -->
            <button
              type="button"
              class="p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer {vaultMode === 'master-pin' ? 'bg-[#3c3836] border-[#fe8019] text-[#ebdbb2]' : 'bg-[#282828] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
              on:click={() => handleModeSelect('master-pin')}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[11px] {vaultMode === 'master-pin' ? 'text-[#fe8019]' : ''}">主 PIN 碼強化</span>
                {#if vaultMode === 'master-pin'}
                  <span class="material-symbols-outlined text-[13px] text-[#fe8019]">check_circle</span>
                {/if}
              </div>
              <span class="text-[9px] text-[#a89984]">自訂密碼 PBKDF2 衍生金鑰</span>
            </button>

            <!-- 明文模式 -->
            <button
              type="button"
              class="p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer {vaultMode === 'plaintext' ? 'bg-[#3c3836] border-[#d5c4a1] text-[#ebdbb2]' : 'bg-[#282828] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
              on:click={() => handleModeSelect('plaintext')}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[11px]">明文相容模式</span>
                {#if vaultMode === 'plaintext'}
                  <span class="material-symbols-outlined text-[13px] text-[#d5c4a1]">check_circle</span>
                {/if}
              </div>
              <span class="text-[9px] text-[#a89984]">原生 localStorage（不加密）</span>
            </button>
          </div>

          <!-- 主 PIN 碼交互操作區塊 -->
          {#if vaultMode === 'master-pin'}
            <div class="mt-1 p-2.5 bg-[#282828] border border-[#504945] rounded-md flex flex-col gap-2">
              {#if isSettingNewPin}
                <div class="flex flex-col gap-1.5">
                  <span class="font-medium text-[#ebdbb2] text-[11px]">設定主解鎖 PIN 碼 (至少 4 位)：</span>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      class="bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-2.5 py-1.5 rounded text-xs focus:border-[#fe8019] focus:outline-none"
                      placeholder="輸入新 PIN 碼"
                      bind:value={newPinInput}
                    />
                    <input
                      type="password"
                      class="bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-2.5 py-1.5 rounded text-xs focus:border-[#fe8019] focus:outline-none"
                      placeholder="再次確認 PIN 碼"
                      bind:value={confirmPinInput}
                    />
                  </div>
                  <div class="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      class="px-2.5 py-1 text-[10px] text-[#a89984] hover:text-[#ebdbb2]"
                      on:click={() => (isSettingNewPin = false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1 bg-[#fe8019] text-[#1d2021] font-semibold rounded text-[10px] hover:bg-[#d65d0e] transition-colors"
                      on:click={applyMasterPin}
                    >
                      確認並加密金鑰
                    </button>
                  </div>
                </div>
              {:else if !isUnlocked}
                <div class="flex items-center gap-2">
                  <input
                    type="password"
                    class="flex-1 bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-2.5 py-1.5 rounded text-xs focus:border-[#fe8019] focus:outline-none"
                    placeholder="輸入 PIN 碼解鎖金鑰庫..."
                    bind:value={pinInput}
                    on:keydown={(e) => e.key === 'Enter' && handleUnlockVault()}
                  />
                  <button
                    type="button"
                    class="px-3 py-1.5 bg-[#8ec07c] hover:bg-[#b8bb26] text-[#1d2021] font-semibold rounded text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    on:click={handleUnlockVault}
                  >
                    <span class="material-symbols-outlined text-[14px]">lock_open</span>
                    <span>解鎖</span>
                  </button>
                </div>
              {:else}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-[#8ec07c] font-medium text-[11px]">
                    <span class="material-symbols-outlined text-[15px]">verified</span>
                    <span>金鑰庫已解鎖 (本分頁記憶體 Session 有效)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="text-[10px] text-[#fabd2f] hover:underline cursor-pointer"
                      on:click={() => (isSettingNewPin = true)}
                    >
                      變更 PIN 碼
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 bg-[#3c3836] hover:bg-[#504945] text-[#ebdbb2] rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      on:click={handleLockVault}
                    >
                      <span class="material-symbols-outlined text-[12px]">lock</span>
                      <span>立即鎖定</span>
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- 通知與錯誤訊息 -->
          {#if vaultNotice}
            <div class="font-mono text-[10px] text-[#8ec07c] flex items-center gap-1">
              <span class="material-symbols-outlined text-[12px]">check</span>
              <span>{vaultNotice}</span>
            </div>
          {/if}
          {#if vaultError}
            <div class="font-mono text-[10px] text-[#fb4934] flex items-center gap-1">
              <span class="material-symbols-outlined text-[12px]">error</span>
              <span>{vaultError}</span>
            </div>
          {/if}
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

        <!-- Semantic Vector & Embedding Engine Section -->
        <div class="flex flex-col gap-2 pt-2 border-t border-[#3c3836]">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] text-[#d5c4a1] flex items-center gap-1.5 font-medium">
              <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">radar</span>
              <span>語意向量搜尋與端側嵌入引擎 (Hybrid Embeddings)</span>
            </span>
            <span class="font-mono text-[10px] text-[#fabd2f]">
              {embeddingPref === 'local-only' ? '端側 ONNX (384-dim)' : '智慧混合 (API 優先)'}
            </span>
          </div>

          <div class="bg-[#1d2021] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-2">
            <!-- 模式選擇 -->
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="p-2 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer {embeddingPref === 'local-only' ? 'bg-[#3c3836] border-[#8ec07c] text-[#fbf1c7]' : 'bg-[#282828] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
                on:click={() => embeddingPref = 'local-only'}
              >
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold flex items-center gap-1 {embeddingPref === 'local-only' ? 'text-[#8ec07c]' : 'text-[#ebdbb2]'}">
                    <span class="material-symbols-outlined text-[14px]">offline_bolt</span>
                    純端側 ONNX (推薦)
                  </span>
                  {#if embeddingPref === 'local-only'}
                    <span class="material-symbols-outlined text-[13px] text-[#8ec07c]">check_circle</span>
                  {/if}
                </div>
                <p class="text-[10px] leading-tight text-[#a89984]">
                  瀏覽器端 384-dim 本機推論，100% 離線免金鑰、零依賴、開箱即用、絕不報錯
                </p>
              </button>

              <button
                type="button"
                class="p-2 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer {embeddingPref === 'api-first' ? 'bg-[#3c3836] border-[#fabd2f] text-[#fbf1c7]' : 'bg-[#282828] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
                on:click={() => embeddingPref = 'api-first'}
              >
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold flex items-center gap-1 {embeddingPref === 'api-first' ? 'text-[#fabd2f]' : 'text-[#ebdbb2]'}">
                    <span class="material-symbols-outlined text-[14px]">cloud_sync</span>
                    雲端 API 向量 (進階)
                  </span>
                  {#if embeddingPref === 'api-first'}
                    <span class="material-symbols-outlined text-[13px] text-[#fabd2f]">check_circle</span>
                  {/if}
                </div>
                <p class="text-[10px] leading-tight text-[#a89984]">
                  需配置支援 Embedding 權限之 API Key；若 API 異常時將自動無縫退避至端側 ONNX
                </p>
              </button>
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
