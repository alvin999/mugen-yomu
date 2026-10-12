<script lang="ts">
  import { jumpStackStore, closeJumpMenu, setJumpMenuSelectedIndex, type JumpPoint } from '../../stores/jumpStackStore';

  interface Props {
    onselectJumpPoint: (point: JumpPoint) => void;
    onjumpReturn?: (toStart: boolean) => void;
  }

  let { onselectJumpPoint, onjumpReturn }: Props = $props();

  let displayedJumps = $derived($jumpStackStore.stack.slice(0, 9));
  let selectedIdx = $derived($jumpStackStore.selectedIndex);

  function handleSelect(point: JumpPoint) {
    closeJumpMenu();
    onselectJumpPoint(point);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!$jumpStackStore.isMenuOpen) return;

    // 再次按下 ' 立即執行 '' 跳轉回溯（段首）
    if (e.key === "'") {
      e.preventDefault();
      e.stopPropagation();
      closeJumpMenu();
      onjumpReturn?.(true);
      return;
    }

    // 再次按下 ` 立即執行 `` 跳轉回溯（精確位置）
    if (e.key === '`') {
      e.preventDefault();
      e.stopPropagation();
      closeJumpMenu();
      onjumpReturn?.(false);
      return;
    }

    // 數字鍵 1-9 直達
    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= displayedJumps.length) {
      e.preventDefault();
      e.stopPropagation();
      handleSelect(displayedJumps[num - 1]);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeJumpMenu();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      e.stopPropagation();
      if (displayedJumps.length > 0) {
        setJumpMenuSelectedIndex((selectedIdx + 1) % displayedJumps.length);
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (displayedJumps.length > 0) {
        setJumpMenuSelectedIndex((selectedIdx - 1 + displayedJumps.length) % displayedJumps.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (displayedJumps[selectedIdx]) {
        handleSelect(displayedJumps[selectedIdx]);
      }
      return;
    }
  }

  function formatTimeAgo(ts: number): string {
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 30) return '剛剛';
    if (diff < 60) return `${diff} 秒前`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} 分鐘前`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} 小時前`;
  }

  function getSourceBadge(source: JumpPoint['source']): { label: string; color: string } {
    switch (source) {
      case 'semantic':
        return { label: '語意搜尋', color: 'bg-[#b8bb26]/15 border-[#b8bb26]/50 text-[#b8bb26]' };
      case 'jump':
        return { label: 'Vim 跳躍', color: 'bg-[#fabd2f]/15 border-[#fabd2f]/50 text-[#fabd2f]' };
      case 'scroll':
        return { label: '半頁視野', color: 'bg-[#83a598]/15 border-[#83a598]/50 text-[#83a598]' };
      case 'click':
        return { label: '滑鼠點擊', color: 'bg-[#8ec07c]/15 border-[#8ec07c]/50 text-[#8ec07c]' };
      default:
        return { label: '閱讀錨點', color: 'bg-[#fe8019]/15 border-[#fe8019]/50 text-[#fe8019]' };
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if $jumpStackStore.isMenuOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
    onclick={closeJumpMenu}
  >
    <!-- Modal Card (Gruvbox Neovim Telescope Theme) -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-xl bg-[#1d2021] border border-[#fe8019]/50 rounded-xl shadow-2xl overflow-hidden flex flex-col font-mono text-[#ebdbb2]"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- HUD Header -->
      <div class="px-4 py-3 bg-[#141617] border-b border-[#3c3836] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
            <span class="material-symbols-outlined text-[15px]">swap_calls</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-bold text-[#ebdbb2] tracking-wide">NEOVIM JUMP STACK</span>
            <span class="text-[9px] text-[#a89984]">跳躍歷史堆疊 · 數字鍵 [1-9] 直達</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] px-2 py-0.5 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">
            {displayedJumps.length} / {$jumpStackStore.stack.length} 點
          </span>
          <button
            type="button"
            class="px-1.5 py-0.5 rounded bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-[10px] cursor-pointer"
            onclick={closeJumpMenu}
          >
            ESC
          </button>
        </div>
      </div>

      <!-- HUD Jump List -->
      <div class="p-2 max-h-[60vh] overflow-y-auto flex flex-col gap-1">
        {#if displayedJumps.length === 0}
          <div class="py-12 px-6 flex flex-col items-center justify-center text-center gap-2 text-[#a89984]">
            <span class="material-symbols-outlined text-3xl text-[#504945]">history_toggle_off</span>
            <p class="text-xs font-medium text-[#ebdbb2]">目前尚無跳躍記錄</p>
            <p class="text-[11px] max-w-sm leading-relaxed">
              當您點擊不同段落、使用語意搜尋、文首/文末跳轉（gg / G）或半頁快速導航時，系統將自動記錄跳躍點。隨時按 <kbd class="px-1 py-0.2 bg-[#282828] rounded border border-[#3c3836] text-[#fabd2f]">''</kbd> 或 <kbd class="px-1 py-0.2 bg-[#282828] rounded border border-[#3c3836] text-[#fabd2f]">``</kbd> 可原路返回。
            </p>
          </div>
        {:else}
          {#each displayedJumps as jump, idx}
            {@const isSelected = selectedIdx === idx}
            {@const badge = getSourceBadge(jump.source)}
            <button
              type="button"
              class="w-full px-3 py-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-3 cursor-pointer {isSelected ? 'bg-[#32302f] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/40' : 'bg-[#141617]/50 border-[#282828] hover:border-[#3c3836] hover:bg-[#282828]/60'}"
              onclick={() => handleSelect(jump)}
              onmouseenter={() => setJumpMenuSelectedIndex(idx)}
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <!-- 數字快速鍵徽章 -->
                <kbd class="shrink-0 w-5 h-5 rounded flex items-center justify-center font-bold text-xs {isSelected ? 'bg-[#fe8019] text-[#1d2021]' : 'bg-[#282828] text-[#fabd2f] border border-[#3c3836]'}">
                  {idx + 1}
                </kbd>

                <div class="flex flex-col min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold truncate {isSelected ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">
                      {jump.sectionTitle ? `§ ${jump.sectionTitle}` : `章節 ${jump.sectionId}`}
                    </span>
                    <span class="text-[9px] px-1.5 py-0.2 rounded border {badge.color}">
                      {badge.label}
                    </span>
                  </div>
                  <span class="text-[11px] text-[#a89984] truncate mt-0.5 font-sans">
                    {jump.textSnippet || '（無預覽文字）'}
                  </span>
                </div>
              </div>

              <!-- 右側進度與時間 -->
              <div class="flex flex-col items-end shrink-0 gap-0.5">
                <span class="text-[10px] font-bold text-[#fabd2f] bg-[#282828] px-1.5 py-0.2 rounded border border-[#3c3836]">
                  {jump.progressPercent}%
                </span>
                <span class="text-[9px] text-[#7c6f64]">
                  {formatTimeAgo(jump.timestamp)}
                </span>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- HUD Footer 快捷鍵指南 -->
      <div class="px-4 py-2 bg-[#141617] border-t border-[#3c3836] flex items-center justify-between text-[10px] text-[#a89984] flex-wrap gap-2">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="px-1 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">1-9</kbd>
            <span>直達</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">j / k</kbd>
            <span>導航</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">Enter</kbd>
            <span>選取</span>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[#fe8019]">'' 或 `` : 往返上一跳躍點</span>
        </div>
      </div>
    </div>
  </div>
{/if}
