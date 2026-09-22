<script lang="ts">
  import SettingsModal from '../settings/SettingsModal.svelte';
</script>

<!-- 轉發至實際功能的 SettingsModal.svelte 組件 -->
<SettingsModal
  {...$$props}
  on:close
  on:save
/>
