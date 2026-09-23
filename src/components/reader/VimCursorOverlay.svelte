<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { vimCursorState, vimConfigStore } from '../../stores/vimCursorStore';

  // ── DOM 元素 ──────────────────────────────────────────────────
  let cursorDiv: HTMLDivElement | null = null;

  // ── 統一 rAF 迴圈 ────────────────────────────────────────────
  let animId: number | null = null;
  let mounted = false;  // SSR 防護：確保瀏覽器 API 只在 client 端呼叫

  // ── Spring 物理狀態 ───────────────────────────────────────────
  // dispX/dispY：游標目前「顯示位置」（彈簧輸出，直接寫入 cursorDiv.style）
  // velX/velY：彈簧速度
  // targetX/targetY：目標位置（來自 store.rect）
  let dispX = 0, dispY = 0;
  let velX  = 0, velY  = 0;
  let targetX = 0, targetY = 0;
  let targetW = 9, targetH = 18;
  let springActive = false;
  let initialized  = false;

  // ── Store 監聽：決定要 spring 還是瞬移 ───────────────────────
  $: {
    const r    = $vimCursorState.rect;
    const prev = $vimCursorState.prevRect;
    const strength = Math.max(0, Math.min(100, $vimConfigStore.bounceStrength ?? 60)) / 100;

    if (r) {
      const nW = Math.max(9, r.width);
      const nH = Math.max(18, r.height);

      if (!initialized) {
        // 首次初始化：不做動畫，直接就位
        dispX = r.left; dispY = r.top;
        targetX = r.left; targetY = r.top;
        targetW = nW;    targetH = nH;
        initialized = true;
        applyDivStyle(1, 1, 0, 0);
      } else if (prev === null || strength === 0) {
        // 捲動同步或彈跳強度設為 0 → 瞬移，重置速度，無彈跳
        targetX = r.left; targetY = r.top;
        targetW = nW;     targetH = nH;
        dispX = r.left;   dispY = r.top;
        velX  = 0;        velY  = 0;
        springActive = false;
        applyDivStyle(1, 1, 0, 0);
      } else {
        // 鍵盤移動（hjkl / 點擊）且彈跳強度 > 0 → 啟動 spring
        targetX = r.left; targetY = r.top;
        targetW = nW;     targetH = nH;
        springActive = true;
      }

      if (springActive && !animId && mounted) {
        animId = requestAnimationFrame(animLoop);
      }
    }
  }

  // ── 動畫主迴圈（spring 物理 + 梯形透視形變）──
  function animLoop() {
    const springDone = stepSpring();

    if (!springDone) {
      animId = requestAnimationFrame(animLoop);
    } else {
      animId = null;
    }
  }

  // ── Spring 物理步進 ───────────────────────────────────────────
  // 返回 true 代表已收斂（不再需要更新）
  function stepSpring(): boolean {
    if (!springActive) {
      applyDivStyle(1, 1, 0, 0);
      return true;
    }

    const strength = Math.max(0, Math.min(100, $vimConfigStore.bounceStrength ?? 60)) / 100;
    if (strength === 0) {
      dispX = targetX; dispY = targetY;
      velX  = 0;       velY  = 0;
      springActive = false;
      applyDivStyle(1, 1, 0, 0);
      return true;
    }

    const dx = targetX - dispX;
    const dy = targetY - dispY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const dist = Math.hypot(dx, dy);

    // ── 換行與長距離自適應平滑阻尼（Distance-Adaptive Damping）──
    // 當移動距離超過單詞/行距（> 35px）時，平滑調升阻尼並限制過大牽引力，
    // 解決換行時（如行末跳回行首數百像素）彈跳過大與甩尾問題
    const longDistRatio = Math.min(1, Math.max(0, (dist - 35) / 100));

    // 柔性拉力曲線（Soft Spring Pull）：短距 100% 線性，長距平滑牽引
    const pullX = Math.sign(dx) * (absDx <= 35 ? absDx : (35 + Math.pow(absDx - 35, 0.65) * 2.8));
    const pullY = Math.sign(dy) * (absDy <= 30 ? absDy : (30 + Math.pow(absDy - 30, 0.65) * 2.5));

    // 依據強度調配剛性與速度保留率：
    // 低強度 (如 5%) 呈現「過阻尼快速吸附」（零震盪、零回彈、平滑俐落）；
    // 中高強度平滑過渡至「彈簧欠阻尼」（活潑彈跳與果凍回彈）
    const stiffnessX = 0.52 - 0.24 * strength;
    const stiffnessY = 0.56 - 0.22 * strength;
    const dampingX   = (0.24 + 0.58 * Math.pow(strength, 0.9)) * (1 - longDistRatio * 0.35);
    const dampingY   = (0.22 + 0.54 * Math.pow(strength, 0.9)) * (1 - longDistRatio * 0.25);

    velX = (velX + pullX * stiffnessX) * dampingX;
    velY = (velY + pullY * stiffnessY) * dampingY;
    dispX += velX;
    dispY += velY;

    // ── 梯形透視與動態形變（速度飽和防扭曲）──────────────────────
    const absVX = Math.abs(velX);
    const absVY = Math.abs(velY);
    // 速度飽和限制，避免長距換行時形變與傾角爆表
    const satVX = Math.min(16, absVX);
    const satVY = Math.min(16, absVY);

    // 1. Squash & Stretch（長距換行時微幅收斂形變，維持俐落質感）
    const k = 0.08 * strength * (1 - longDistRatio * 0.35);
    let sx = Math.max(0.65, Math.min(1.65, 1 + satVX * k - satVY * k * 0.35));
    let sy = Math.max(0.65, Math.min(1.65, 1 + satVY * k - satVX * k * 0.35));

    // 2. 3D 透視梯形旋轉角（角度平滑受控）
    const rotX = Math.max(-20, Math.min(20, (velY >= 0 ? satVY : -satVY) * 1.3 * strength));
    const rotY = Math.max(-20, Math.min(20, (velX >= 0 ? -satVX : satVX) * 1.3 * strength));

    applyDivStyle(sx, sy, rotX, rotY);

    // 收斂判斷：低強度時適度放寬次像素收斂門檻，避免尾端拖延，就位更乾脆俐落
    const tolDist = 0.15 + (1 - strength) * 0.22;
    const tolVel  = 0.04 + (1 - strength) * 0.05;
    const converged = absDx < tolDist && absDy < tolDist &&
                      absVX < tolVel  && absVY < tolVel;
    if (converged) {
      dispX = targetX; dispY = targetY;
      velX  = 0;       velY  = 0;
      springActive = false;
      applyDivStyle(1, 1, 0, 0); // 回到端正矩形
    }
    return converged;
  }

  // ── 直接操作 DOM（每幀極速更新尺寸、位置與梯形透視）──────────
  function applyDivStyle(sx: number, sy: number, rotX: number = 0, rotY: number = 0) {
    if (!cursorDiv) return;

    const baseW = Math.max(10, targetW);
    const baseH = Math.max(20, targetH);

    // 計算形變後尺寸
    const w = Math.max(4, Math.round(baseW * sx));
    const h = Math.max(8, Math.round(baseH * sy));

    // 補償偏移：讓游標以 dispX/dispY 為中心點縮放
    const ox = Math.round((baseW - w) / 2);
    const oy = Math.round((baseH - h) / 2);

    cursorDiv.style.left   = `${Math.round(dispX) + ox}px`;
    cursorDiv.style.top    = `${Math.round(dispY) + oy}px`;
    cursorDiv.style.width  = `${w}px`;
    cursorDiv.style.height = `${h}px`;

    // 透過 3D 透視產生自然動態
    if (rotX !== 0 || rotY !== 0) {
      cursorDiv.style.transform = `perspective(200px) rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg)`;
    } else {
      cursorDiv.style.transform = 'none';
    }
  }

  onMount(() => {
    mounted = true;
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
  });

  $: isVimActive = $vimConfigStore.isVimEnabled && $vimCursorState.active;
  $: isBlinking  = $vimConfigStore.isBlinkEnabled && !$vimCursorState.isMoving;

  // display 可見性：用獨立 reactive 語句直接操作 DOM
  $: if (cursorDiv && mounted) {
    cursorDiv.style.display = isVimActive ? 'block' : 'none';
  }
</script>

<!--
  游標方塊：動態屬性由 applyDivStyle() 直接操作 DOM 更新，
  結合呼吸閃爍與物理平滑動態
-->
<div
  bind:this={cursorDiv}
  class="fixed pointer-events-none select-none {isBlinking ? 'animate-vim-blink' : ''}"
  style="
    z-index: 35;
    display: none;
    left: 0;
    top: 0;
    width: 9px;
    height: 18px;
    background-color: rgba(254, 128, 25, 0.22);
    outline: 1.5px solid rgba(254, 128, 25, 0.92);
    outline-offset: -1px;
    border-radius: 1.5px;
    transform-origin: center center;
  "
  aria-hidden="true"
></div>

<style>
  /* IntelliJ 精緻淡入淡出閃爍 */
  @keyframes vim-blink-kf {
    0%   { opacity: 1; }
    52%  { opacity: 1; }
    63%  { opacity: 0; }
    88%  { opacity: 0; }
    100% { opacity: 1; }
  }
  .animate-vim-blink {
    animation: vim-blink-kf 1.1s ease-in-out infinite;
  }
</style>
