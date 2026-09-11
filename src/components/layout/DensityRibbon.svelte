<script lang="ts">
  export let focusTrack: string = '§ 3.2 Attention Mechanism · Depth Level: Formal Derivation';
  export let flowWpm: number = 265;
  export let embeddingDim: number = 384;
</script>

<div class="h-8 bg-[#1d2021] border-b border-[#3c3836] px-4 flex items-center justify-between shrink-0 shadow-sm select-none">
  <div class="flex items-center gap-2">
    <span class="inline-flex items-center gap-1 text-[#fabd2f] font-mono text-[10px] uppercase tracking-wider bg-[#32302f] border border-[#504945] px-1.5 py-0.5 rounded font-medium">
      <span class="material-symbols-outlined text-[12px] animate-pulse text-[#fe8019]">radar</span> Saccadic Focus Track
    </span>
    <span class="text-[#a89984] font-mono text-[11px] truncate">{focusTrack}</span>
  </div>

  <div class="flex items-center gap-3">
    <div class="flex items-center gap-1 font-mono text-[11px] text-[#a89984]">
      <span class="material-symbols-outlined text-[13px] text-[#b8bb26]">speed</span>
      <span>閱讀心流速率: <strong class="text-[#ebdbb2] font-semibold">{flowWpm} wpm</strong></span>
    </div>
    <div class="h-3 w-px bg-[#504945]"></div>
    <div class="flex items-center gap-1 font-mono text-[11px] text-[#fabd2f]">
      <span class="material-symbols-outlined text-[13px] text-[#fe8019]">bolt</span>
      <span>Local Embeddings: Active ({embeddingDim}-dim)</span>
    </div>
  </div>
</div>
