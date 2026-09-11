<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let currentPath: string = 'reading-workspace';
  export let memoryUsageMb: number = 64.2;
  export let paperCount: number = 3;

  const dispatch = createEventDispatcher();

  const navItems = [
    { id: 'reading-workspace', label: 'Reading Workspace', icon: 'menu_book' },
    { id: 'paper-repository', label: 'Paper Repository', icon: 'library_books', badge: true },
    { id: 'citation-graph', label: 'Citation Graph', icon: 'hub' },
    { id: 'cognitive-notes', label: 'Cognitive Notes', icon: 'draw' },
    { id: 'prompt-formula-lab', label: 'Formula Lab', icon: 'functions' }
  ];

  function handleNavClick(id: string) {
    currentPath = id;
    if (id === 'paper-repository') {
      dispatch('openRepository');
    } else {
      dispatch('navigate', { path: id });
    }
  }
</script>

<aside class="fixed left-0 top-0 h-full w-64 bg-[#141617] border-r border-[#3c3836] z-50 flex flex-col justify-between py-3 select-none">
  <div class="flex flex-col gap-3">
    <!-- Top Brand & Version -->
    <div class="px-4 flex items-center justify-between">
      <span class="font-mono text-[11px] uppercase tracking-wider text-[#a89984]">Cognitive Navigation</span>
      <span class="font-mono text-[11px] text-[#fabd2f] bg-[#282828] border border-[#504945] px-1.5 py-0.5 rounded font-medium">v2.4</span>
    </div>

    <!-- Navigation Menu Items -->
    <nav class="flex flex-col gap-1 px-2">
      {#each navItems as item}
        <button
          class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors {currentPath === item.id ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => handleNavClick(item.id)}
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[18px]">{item.icon}</span>
            <span class="text-[13px]">{item.label}</span>
          </div>

          {#if item.badge}
            <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-1.5 py-0.2 rounded font-medium">
              {paperCount}
            </span>
          {/if}
        </button>
      {/each}
    </nav>
  </div>

  <!-- Bottom Memory Bank & Sync Engine -->
  <div class="px-4 flex flex-col gap-2">
    <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
      <div class="flex items-center justify-between text-[#a89984]">
        <span class="font-mono text-[11px]">Local Memory Bank</span>
        <span class="font-mono text-[11px] text-[#fabd2f] font-medium">{memoryUsageMb} MB</span>
      </div>
      <div class="w-full bg-[#1d2021] h-1.5 rounded-full overflow-hidden">
        <div class="bg-[#fabd2f] h-full w-[42%] transition-all"></div>
      </div>
    </div>

    <div class="flex items-center justify-between text-[#a89984] text-[11px] font-mono pt-1">
      <span class="hover:text-[#ebdbb2] cursor-pointer">Sync Engine · Idle</span>
      <span class="material-symbols-outlined text-[14px] text-[#b8bb26]">cloud_done</span>
    </div>
  </div>
</aside>
