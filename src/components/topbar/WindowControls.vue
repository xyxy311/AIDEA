<script setup lang="ts">
/**
 * WindowControls - Electron 无边框窗口控制按钮组（最小化/最大化-还原/关闭）。
 * 固定窗口 chrome：不登记 topbar 品类表、不参与 TopBarZone 拖拽，由 RightTopBar 固定渲染在最右端；根容器与按钮均 no-drag，防被窗口拖动区带走。
 */
import { inject } from 'vue'
import { NTooltip } from 'naive-ui'
import { RemoveOutline, SquareOutline, CopyOutline, CloseOutline } from '@vicons/ionicons5'
import { useWindowControls } from '@/composables/useWindowControls'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'

const { isMaximized, minimize, toggleMaximize, close } = useWindowControls()

// 经 inject 取 AppShell 注入的项目文件操作
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

/**
 * 关闭窗口：先经应用内统一未保存确认，确认放弃后才调桥关闭；
 * projectFile 缺失（如测试环境）则跳过确认直接兜底关闭。
 */
async function handleClose(): Promise<void> {
  if (projectFile && !(await projectFile.confirmDiscard())) return
  close()
}
</script>

<template>
  <!-- 窗口 chrome 按钮组：no-drag 退出窗口拖动区，防被拖走 -->
  <div class="window-controls">
    <NTooltip placement="bottom">
      <template #trigger>
        <button type="button" class="win-btn" @click="minimize">
          <RemoveOutline class="win-btn-icon" />
        </button>
      </template>
      {{ t('toolbar.minimize') }}
    </NTooltip>

    <!-- 最大化 / 还原：随 isMaximized 切换图标 -->
    <NTooltip placement="bottom">
      <template #trigger>
        <button type="button" class="win-btn" @click="toggleMaximize">
          <SquareOutline v-if="!isMaximized" class="win-btn-icon" />
          <CopyOutline v-else class="win-btn-icon" />
        </button>
      </template>
      {{ isMaximized ? t('toolbar.restore') : t('toolbar.maximize') }}
    </NTooltip>

    <!-- 关闭：经未保存确认后才调桥；hover 红底反白（Windows 惯例） -->
    <NTooltip placement="bottom">
      <template #trigger>
        <button type="button" class="win-btn win-btn-close" @click="handleClose">
          <CloseOutline class="win-btn-icon" />
        </button>
      </template>
      {{ t('toolbar.close') }}
    </NTooltip>
  </div>
</template>

<style scoped>
/* 容器 no-drag 退出顶部条拖动区；组内间距与 TopBarZone 的 gap 一致 */
.window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* 与 TopBarButton .top-btn 同一视觉语言 */
.win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
  flex-shrink: 0;
  /* 双保险：按钮本体也绝不触发窗口拖动 */
  -webkit-app-region: no-drag;
}

.win-btn-icon {
  width: 20px;
  height: 20px;
  pointer-events: none; /* 让点击穿透到按钮本体 */
}

/* 悬停：亮起 + 淡背景 */
.win-btn:hover {
  opacity: 1;
  background: var(--color-hover);
}

/* 关闭按钮：hover 红底反白，声明在后覆盖通用 hover */
.win-btn-close:hover {
  background: var(--color-danger);
  color: var(--color-on-primary);
}
</style>
