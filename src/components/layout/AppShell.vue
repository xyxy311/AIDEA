<script setup lang="ts">
/**
 * AppShell - 应用外壳布局
 *
 * 顶部固定工具栏 + 下方弹性填充画布区域。
 * 使用 CSS flex 布局，工具栏 56px 固定高度，画布占据剩余空间。
 */
import Toolbar from '@/components/toolbar/Toolbar.vue'
import WhiteboardCanvas from '@/components/canvas/WhiteboardCanvas.vue'
</script>

<template>
  <div class="app-shell">
    <Toolbar />
    <main class="app-main">
      <WhiteboardCanvas />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
