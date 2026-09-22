<script lang="ts">
  import { vimCursorState, vimConfigStore, updateVimConfig, setVimHelpOpen } from '../../stores/vimCursorStore';
  import { flowStore } from '../../stores/flowStore';

  export let readingMode: string = 'bilingual';

  $: isHelpOpen = $vimCursorState.isHelpOpen;

  function toggleHelp() {
    setVimHelpOpen(!isHelpOpen);
  }

  function toggleVim() {
    updateVimConfig({ isVimEnabled: !$vimConfigStore.isVimEnabled });
  }

  function toggleBlink() {
    updateVimConfig({ isBlinkEnabled: !$vimConfigStore.isBlinkEnabled });
  }
</script>

<!-- 浮動 Neovim 閱讀狀態列 (Statusline HUD) -->
{#if $vimConfigStore.isVimEnabled}
  <div class="fixed bottom-3 right-6 z-40 flex flex-col items-end gap-1.5 font-mono select-none pointer-events-auto animate-fade-in">
    <!-- 快捷鍵速查卡 (Floating Cheat Sheet Modal) -->
    {#if isHelpOpen}
      <div class="mb-2 w-80 bg-[#1d2021]/95 backdrop-blur-md border border-[#504945] rounded-xl shadow-2xl p-3.5 text-[11px] text-[#ebdbb2] animate-scale-in">
        <div class="flex items-center justify-between border-b border-[#3c3836] pb-2 mb-2.5">
          <div class="flex items-center gap-1.5 font-bold text-[#fe8019]">
            <span class="material-symbols-outlined text-[16px]">terminal</span>
            <span>Vim 游標導引快捷鍵</span>
          </div>
          <button
            class="text-[#a89984] hover:text-[#ebdbb2] text-[14px] px-1"
            on:click={toggleHelp}
            title="關閉速查卡"
          >✕</button>
        </div>

        <div class="space-y-2 text-[#d5c4a1]">
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fabd2f] font-bold">h / l</span>
            <span class="text-[#a89984]">左 / 右移動字元（或跨詞）</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fabd2f] font-bold">j / k</span>
            <span class="text-[#a89984]">下 / 上換行或跨段落閱讀</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fabd2f] font-bold">w / b</span>
            <span class="text-[#a89984]">跳至下一詞 / 上一詞</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fabd2f] font-bold">0 / $</span>
            <span class="text-[#a89984]">跳至行首 / 行末</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fabd2f] font-bold">gg / G</span>
            <span class="text-[#a89984]">跳至章節首段 / 文末</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#8ec07c] font-bold">t</span>
            <span class="text-[#a89984]">展開 / 收合當前段落繁中譯文</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#8ec07c] font-bold">a</span>
            <span class="text-[#a89984]">向 AI 伴讀助理探詢當前焦點段落</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#8ec07c] font-bold">y</span>
            <span class="text-[#a89984]">複製當前段落原文或 LaTeX 公式</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-[#fe8019] font-bold">?</span>
            <span class="text-[#a89984]">切換顯示此快速指南</span>
          </div>
        </div>

        <div class="mt-3 pt-2.5 border-t border-[#3c3836] flex items-center justify-between text-[10px] text-[#a89984]">
          <span class="text-[#fabd2f]">
            彈跳強度: {($vimConfigStore.bounceStrength ?? 60) === 0 ? '關閉' : `${$vimConfigStore.bounceStrength ?? 60}%`}
          </span>
          <label class="flex items-center gap-1.5 cursor-pointer hover:text-[#ebdbb2]">
            <input type="checkbox" checked={$vimConfigStore.isBlinkEnabled} on:change={toggleBlink} class="accent-[#fe8019]" />
            <span>閃爍游標</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- 底部膠囊狀態條 (Neovim Statusline Pill) -->
    <div class="flex items-center gap-1.5 bg-[#1d2021]/90 backdrop-blur-md border border-[#504945]/80 hover:border-[#fe8019]/60 px-3 py-1 rounded-full shadow-lg text-[11px] transition-all">
      <!-- 模式標籤 -->
      <span class="bg-[#fe8019] text-[#1d2021] font-bold px-1.5 py-0.2 rounded-xs text-[10px]">
        NORMAL
      </span>

      <!-- 游標座標資訊 -->
      {#if $vimCursorState.active}
        <span class="text-[#fabd2f] font-semibold">
          §{$vimCursorState.sectionId || '1'} ¶{$vimCursorState.paraIndex + 1}
        </span>
      {/if}

      <!-- 心流速率動態指標 -->
      <div class="h-3 w-px bg-[#504945]"></div>
      <div class="flex items-center gap-1 text-[#8ec07c]" title="即時心流閱讀速率">
        <span class="material-symbols-outlined text-[12px] animate-pulse">speed</span>
        <span>{$flowStore.currentWpm} wpm</span>
      </div>

      <!-- 快捷鍵幫助按鈕 -->
      <button
        type="button"
        class="ml-1 text-[#a89984] hover:text-[#fe8019] cursor-pointer transition-colors"
        on:click={toggleHelp}
        title="按 ? 或點擊查看 Vim 閱讀快捷鍵"
      >
        <span class="material-symbols-outlined text-[14px]">help_outline</span>
      </button>
    </div>
  </div>
{/if}
