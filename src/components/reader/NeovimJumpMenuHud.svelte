<script lang="ts">
  import { jumpStackStore, closeJumpMenu, setJumpMenuSelectedIndex, type JumpPoint } from '../../stores/jumpStackStore';

  interface Props {
    onselectJumpPoint: (point: JumpPoint) => void;
    onjumpReturn?: (toStart: boolean) => void;
  }

  let { onselectJumpPoint, onjumpReturn }: Props = $props();

  let listContainerEl: HTMLElement | null = $state(null);

  // 當選中項目變更時，安全平滑滾動至可視區域中
  $effect(() => {
    const idx = $jumpStackStore.selectedIndex;
    if (listContainerEl && idx >= 0) {
      const items = listContainerEl.querySelectorAll<HTMLButtonElement>('[data-jump-item]');
      if (items[idx]) {
        items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  });

  function handleSelect(point: JumpPoint) {
    closeJumpMenu();
    onselectJumpPoint(point);
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
      case 'nav':
        return { label: '行位瀏覽', color: 'bg-[#d3869b]/15 border-[#d3869b]/50 text-[#d3869b]' };
      default:
        return { label: '閱讀錨點', color: 'bg-[#fe8019]/15 border-[#fe8019]/50 text-[#fe8019]' };
    }
  }
</script>

{#if $jumpStackStore.isMenuOpen}
  {@const displayedJumps = $jumpStackStore.stack.slice(0, 9)}
  {@const selectedIdx = $jumpStackStore.selectedIndex}
  <!-- 底部懸浮面板（無全螢幕暗色遮罩，不干擾主畫面閱讀） -->
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-2xl bg-[#1d2021]/95 backdrop-blur-md border border-[#fe8019]/60 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col font-mono text-[#ebdbb2] animate-slide-up"
    role="dialog"
    aria-modal="false"
    aria-label="歷史記錄"
  >
    <!-- HUD Header -->
    <div class="px-4 py-2.5 bg-[#141617]/90 border-b border-[#3c3836] flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-[#fe8019]/20 border border-[#fe8019]/50 flex items-center justify-center text-[#fe8019]">
          <span class="material-symbols-outlined text-[15px]">swap_calls</span>
        </div>
        <div class="flex flex-col">
          <span class="text-xs font-bold text-[#ebdbb2] tracking-wide flex items-center gap-2">
            <span>MUGEN JUMP STACK</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-[#fe8019]/15 text-[#fe8019] border border-[#fe8019]/30">行首與字元定位</span>
          </span>
          <span class="text-[9px] text-[#a89984]">底部浮動導航 · j/k 瀏覽 · 數字鍵 [1-9] 直達 · ESC / 再次按 ' 收起</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-[10px] px-2 py-0.5 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">
          {displayedJumps.length > 0 ? `第 ${selectedIdx + 1} / 共 ${displayedJumps.length} 項` : '0 項'}
        </span>
        <button
          type="button"
          class="px-2 py-0.5 rounded bg-[#282828] hover:bg-[#32302f] border border-[#3c3836] text-[#a89984] hover:text-[#ebdbb2] text-[10px] cursor-pointer"
          onclick={closeJumpMenu}
        >
          ESC 收起
        </button>
      </div>
    </div>

    <!-- HUD Jump List -->
    <div bind:this={listContainerEl} class="p-2 max-h-56 overflow-y-auto flex flex-col gap-1.5">
      {#if displayedJumps.length === 0}
        <div class="py-6 px-4 flex flex-col items-center justify-center text-center gap-1.5 text-[#a89984]">
          <span class="material-symbols-outlined text-2xl text-[#504945]">history_toggle_off</span>
          <p class="text-xs font-medium text-[#ebdbb2]">目前尚無跳躍記錄</p>
          <p class="text-[11px] max-w-md leading-relaxed text-[#a89984]">
            當您在文章中移動或點選不同行時，系統將自動精確記錄至行號與個別字元。隨時按 <kbd class="px-1 py-0.2 bg-[#282828] rounded border border-[#3c3836] text-[#fabd2f]">''</kbd>（跳至行首）或 <kbd class="px-1 py-0.2 bg-[#282828] rounded border border-[#3c3836] text-[#fabd2f]">``</kbd>（跳至字元）可原路返回。
          </p>
        </div>
      {:else}
        {#each displayedJumps as jump, idx (jump.id)}
          {@const badge = getSourceBadge(jump.source)}
          <button
            data-jump-item
            type="button"
            tabindex="-1"
            class="w-full px-3 py-2 rounded-lg border text-left transition-all flex items-center justify-between gap-3 cursor-pointer {selectedIdx === idx ? 'bg-[#32302f] border-[#fe8019] shadow-md ring-1 ring-[#fe8019]/60' : 'bg-[#141617]/60 border-[#282828] hover:border-[#3c3836] hover:bg-[#282828]/60'}"
            onclick={() => handleSelect(jump)}
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <!-- 導航選擇指標 (選中時顯示醒目箭頭) -->
              <span class="text-xs font-bold w-3.5 shrink-0 transition-opacity {selectedIdx === idx ? 'text-[#fe8019] opacity-100' : 'opacity-0'}">▶</span>

              <!-- 數字快速鍵徽章 -->
              <kbd class="shrink-0 w-5 h-5 rounded flex items-center justify-center font-bold text-xs {selectedIdx === idx ? 'bg-[#fe8019] text-[#1d2021]' : 'bg-[#282828] text-[#fabd2f] border border-[#3c3836]'}">
                {idx + 1}
              </kbd>

              <div class="flex flex-col min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-semibold truncate {selectedIdx === idx ? 'text-[#fe8019]' : 'text-[#ebdbb2]'}">
                    {jump.sectionTitle ? `§ ${jump.sectionTitle}` : `章節 ${jump.sectionId}`}
                  </span>
                  <!-- 來源標籤 -->
                  <span class="text-[9px] px-1.5 py-0.2 rounded border {badge.color}">
                    {badge.label}
                  </span>
                  <!-- 精確行號與字元位置標籤 -->
                  <span class="text-[9px] px-1.5 py-0.2 rounded bg-[#282828] border border-[#d79921]/40 text-[#fabd2f]">
                    {jump.lineIndex !== undefined ? `第 ${jump.lineIndex + 1} 行 · ` : ''}第 {jump.charIndex} 字
                  </span>
                </div>
                <!-- 游標所在處鄰近上下文預覽 -->
                <span class="text-[11px] {selectedIdx === idx ? 'text-[#ebdbb2]' : 'text-[#a89984]'} truncate mt-0.5 font-sans">
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
    <div class="px-4 py-2 bg-[#141617]/90 border-t border-[#3c3836] flex items-center justify-between text-[10px] text-[#a89984] flex-wrap gap-2">
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

      <div class="flex items-center gap-3 text-[10px]">
        <span class="flex items-center gap-1 text-[#fe8019]">
          <kbd class="px-1 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">''</kbd>
          <span>跳轉行首</span>
        </span>
        <span class="text-[#504945]">·</span>
        <span class="flex items-center gap-1 text-[#8ec07c]">
          <kbd class="px-1 rounded bg-[#282828] border border-[#3c3836] text-[#fabd2f]">``</kbd>
          <span>精確跳轉字元</span>
        </span>
      </div>
    </div>
  </div>
{/if}
