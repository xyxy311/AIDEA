<script setup lang="ts">
/**
 * AppShell — 应用布局外壳
 *
 * 布局结构：
 *   ┌─────────────── MenuBar ───────────────┐
 *   ├─ LeftSidebar ─┬─ Toolbar ─┬─ RightSB ─┤
 *   │               ├─ Canvas ──┤           │
 *   └───────────────┴───────────┴───────────┘
 */
import { ref } from 'vue'
import MenuBar from './MenuBar.vue'
import LeftSidebar from '@/components/panels/LeftSidebar.vue'
import RightSidebar from '@/components/panels/RightSidebar.vue'
import SettingsModal from '@/components/panels/SettingsModal.vue'
import Toolbar from '@/components/toolbar/Toolbar.vue'
import WhiteboardCanvas from '@/components/canvas/WhiteboardCanvas.vue'

const leftCollapsed = ref(false)
const rightCollapsed = ref(false)
const showSettings = ref(false)
</script>

<template>
  <div class="app-shell">
    <!-- 菜单栏 -->
    <MenuBar @open-settings="showSettings = true" />

    <!-- 主体区域 -->
    <div class="app-body">
      <!-- 左侧边栏 -->
      <LeftSidebar
        :collapsed="leftCollapsed"
        @toggle="leftCollapsed = !leftCollapsed"
      />

      <!-- 中央画布区域 -->
      <div class="app-center">
        <Toolbar />
        <main class="app-main">
          <WhiteboardCanvas />
        </main>
      </div>

      <!-- 右侧边栏 -->
      <RightSidebar
        :collapsed="rightCollapsed"
        @toggle="rightCollapsed = !rightCollapsed"
      />
    </div>

    <!-- 设置面板 -->
    <SettingsModal
      :show="showSettings"
      @close="showSettings = false"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.app-main {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
