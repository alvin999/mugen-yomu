<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let isOpen: boolean = false;
  export let currentProvider: string = 'anthropic';
  export let currentModel: string = 'claude-3-5-sonnet-20241022';
  export let apiKey: string = '';

  const dispatch = createEventDispatcher();

  const providers = [
    { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022' },
    { id: 'google', name: 'Google Gemini', defaultModel: 'gemini-1.5-pro' },
    { id: 'openai', name: 'OpenAI GPT', defaultModel: 'gpt-4o' },
    { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-reasoner' },
    { id: 'ollama', name: 'Local Ollama / vLLM', defaultModel: 'llama3.3:70b' }
  ];

  onMount(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem(`mugen_key_${currentProvider}`);
      if (savedKey) apiKey = savedKey;
    }
  });

  function saveSettings() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`mugen_key_${currentProvider}`, apiKey);
      localStorage.setItem('mugen_provider', currentProvider);
      localStorage.setItem('mugen_model', currentModel);
    }
    dispatch('save', { provider: currentProvider, model: currentModel, apiKey });
    close();
  }

  function close() {
    isOpen = false;
    dispatch('close');
  }

  function handleProviderChange(providerId: string) {
    currentProvider = providerId;
    const p = providers.find(item => item.id === providerId);
    if (p) currentModel = p.defaultModel;
    if (typeof window !== 'undefined') {
      apiKey = localStorage.getItem(`mugen_key_${providerId}`) || '';
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
    <div class="w-full max-w-lg bg-[#282828] border border-[#504945] rounded-xl shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-4 bg-[#1d2021] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full bg-[#fabd2f]"></div>
          <h3 class="text-sm font-bold text-[#ebdbb2]">BYOK (Bring Your Own Key) 設定</h3>
        </div>
        <button class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f]" on:click={close}>
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 flex flex-col gap-4 text-xs">
        <div class="bg-[#32302f] border border-[#3c3836] p-3 rounded-lg flex items-start gap-2.5">
          <span class="material-symbols-outlined text-[18px] text-[#b8bb26] shrink-0 mt-0.5">verified_user</span>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-[#ebdbb2]">極致隱私保證 (Zero-Server Knowledge)</span>
            <span class="text-[#a89984] leading-relaxed">
              您的 API Token 僅存放於本機瀏覽器 LocalStorage，所有 AI 請求直接向官方 Provider 發起，絕不經過任何中間收集伺服器。
            </span>
          </div>
        </div>

        <!-- Provider Select -->
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[11px] text-[#d5c4a1]">選擇 AI Provider</label>
          <div class="grid grid-cols-2 gap-2">
            {#each providers as p}
              <button
                class="px-2.5 py-2 rounded-lg border text-left flex items-center justify-between transition-colors {currentProvider === p.id ? 'bg-[#3c3836] border-[#fe8019] text-[#fe8019] font-semibold' : 'bg-[#1d2021] border-[#3c3836] text-[#a89984] hover:bg-[#32302f]'}"
                on:click={() => handleProviderChange(p.id)}
              >
                <span>{p.name}</span>
                {#if currentProvider === p.id}
                  <span class="material-symbols-outlined text-[14px]">check</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Model Name -->
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[11px] text-[#d5c4a1]">模型名稱 (Model ID)</label>
          <input
            class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs"
            type="text"
            bind:value={currentModel}
          />
        </div>

        <!-- API Key Input -->
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[11px] text-[#d5c4a1]">API Token / Key</label>
          <input
            class="w-full bg-[#1d2021] border border-[#3c3836] text-[#ebdbb2] px-3 py-2 rounded-lg focus:outline-none focus:border-[#fe8019] font-mono text-xs"
            type="password"
            placeholder="sk-..."
            bind:value={apiKey}
          />
          <span class="font-mono text-[10px] text-[#a89984]">支援使用各平台之免費額度 Key</span>
        </div>

        <!-- Cache Stats -->
        <div class="bg-[#1d2021] border border-[#3c3836] p-3 rounded-lg flex items-center justify-between font-mono text-[11px]">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[15px] text-[#fabd2f]">database</span>
            <span class="text-[#a89984]">本機 IndexedDB 快取命中</span>
          </div>
          <span class="text-[#fabd2f] font-semibold">2,410 tokens (已節省 $0.14)</span>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="p-3 bg-[#1d2021] border-t border-[#3c3836] flex items-center justify-end gap-2">
        <button class="px-3 py-1.5 rounded-lg text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#32302f] transition-colors" on:click={close}>
          取消
        </button>
        <button class="px-4 py-1.5 rounded-lg bg-[#fe8019] hover:bg-[#d65d0e] text-[#1d2021] font-semibold transition-colors shadow-sm" on:click={saveSettings}>
          儲存設定
        </button>
      </div>
    </div>
  </div>
{/if}
