<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let currentPath: string = 'reading-workspace';
  export let memoryUsageMb: number = 64.2;
  export let paperCount: number = 3;
  export let isCollapsed: boolean = false;

  const dispatch = createEventDispatcher();

  const navItems = [
    { id: 'reading-workspace', label: 'Reading Workspace', icon: 'menu_book' },
    { id: 'paper-repository', label: 'Paper Repository', icon: 'library_books', badge: true },
    { id: 'citation-graph', label: 'Citation Graph', icon: 'hub' },
    { id: 'cognitive-notes', label: 'Cognitive Notes', icon: 'draw' },
    { id: 'prompt-formula-lab', label: 'Formula Lab', icon: 'functions' }
  ];

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    dispatch('toggleCollapse', { isCollapsed });
  }

  function handleNavClick(id: string) {
    currentPath = id;
    if (id === 'paper-repository') {
      dispatch('openRepository');
    } else {
      dispatch('navigate', { path: id });
    }
  }
</script>

<aside
  class="fixed left-0 top-0 h-full bg-[#141617] border-r border-[#3c3836] z-50 flex flex-col justify-between py-3 select-none transition-all duration-300 ease-in-out {isCollapsed ? 'w-16' : 'w-60'}"
>
  <div class="flex flex-col gap-3">
    <!-- Top Header & Collapse Toggle -->
    <div class="flex items-center justify-between {isCollapsed ? 'px-2 justify-center' : 'px-3'}">
      {#if !isCollapsed}
        <span class="font-mono text-[10px] uppercase tracking-wider text-[#a89984] truncate">Cognitive Rail</span>
        <div class="flex items-center gap-1">
          <span class="font-mono text-[10px] text-[#fabd2f] bg-[#282828] border border-[#504945] px-1 py-0.2 rounded font-medium">v2.4</span>
          <button
            class="w-6 h-6 rounded flex items-center justify-center text-[#a89984] hover:text-[#ebdbb2] hover:bg-[#282828] transition-colors"
            on:click={toggleCollapse}
            title="收合成 64px 緊湊導航條"
          >
            <span class="material-symbols-outlined text-[16px]">menu_open</span>
          </button>
        </div>
      {:else}
        <button
          class="w-10 h-10 rounded-lg flex items-center justify-center text-[#fe8019] bg-[#282828] border border-[#3c3836] hover:bg-[#32302f] transition-colors shadow-sm"
          on:click={toggleCollapse}
          title="展開導航欄 (240px)"
        >
          <span class="material-symbols-outlined text-[20px]">menu</span>
        </button>
      {/if}
    </div>

    <!-- Navigation Menu Items -->
    <nav class="flex flex-col gap-1 {isCollapsed ? 'px-1.5' : 'px-2'}">
      {#each navItems as item}
        <button
          class="w-full flex items-center rounded-lg text-left transition-colors relative group {isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} {currentPath === item.id ? 'bg-[#3c3836] text-[#fe8019] font-semibold border-l-2 border-[#fe8019]' : 'text-[#a89984] hover:bg-[#282828] hover:text-[#ebdbb2]'}"
          on:click={() => handleNavClick(item.id)}
          title={item.label}
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[18px]">{item.icon}</span>
            {#if !isCollapsed}
              <span class="text-[13px] truncate">{item.label}</span>
            {/if}
          </div>

          {#if item.badge}
            {#if !isCollapsed}
              <span class="font-mono text-[10px] bg-[#282828] border border-[#504945] text-[#fabd2f] px-1.5 py-0.2 rounded font-medium">
                {paperCount}
              </span>
            {:else}
              <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#fabd2f]"></span>
            {/if}
          {/if}

          <!-- Tooltip on collapsed hover -->
          {#if isCollapsed}
            <div class="absolute left-16 bg-[#1d2021] text-[#ebdbb2] border border-[#504945] px-2 py-1 rounded shadow-xl text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              {item.label}
            </div>
          {/if}
        </button>
      {/each}
    </nav>
  </div>

  <!-- Bottom Memory Bank & Sync Engine -->
  <div class="{isCollapsed ? 'px-2' : 'px-3'} flex flex-col gap-2">
    {#if !isCollapsed}
      <div class="bg-[#282828] border border-[#3c3836] p-2.5 rounded-lg flex flex-col gap-1.5 shadow-sm">
        <div class="flex items-center justify-between text-[#a89984]">
          <span class="font-mono text-[10px] truncate">Local Memory</span>
          <span class="font-mono text-[10px] text-[#fabd2f] font-medium">{memoryUsageMb} MB</span>
        </div>
        <div class="w-full bg-[#1d2021] h-1.5 rounded-full overflow-hidden">
          <div class="bg-[#fabd2f] h-full w-[42%] transition-all"></div>
        </div>
      </div>

      <div class="flex items-center justify-between text-[#a89984] text-[10px] font-mono pt-1">
        <span class="hover:text-[#ebdbb2] cursor-pointer">Sync · Idle</span>
        <span class="material-symbols-outlined text-[13px] text-[#b8bb26]">cloud_done</span>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[#282828] border border-[#3c3836]" title="Memory: {memoryUsageMb} MB · Sync Idle">
        <span class="material-symbols-outlined text-[16px] text-[#fabd2f]">database</span>
        <span class="font-mono text-[8px] text-[#a89984]">{memoryUsageMb}M</span>
      </div>
    {/if}
  </div>
</aside>
