<script setup lang="ts">
/**
 * WindowControls - Electron 无边框窗口控制按钮组（最小化 / 最大化-还原 / 关闭）
 *
 * 固定窗口 chrome（区别于品类表注册按钮）：不登记 constants/topbar.ts、不参与
 * TopBarZone 拖拽排序与跨区放置——被拖走或移除会导致窗口失控。由 RightTopBar
 * 固定渲染在 node-count 之后（顶部条最右端）。
 *
 * - 视觉与 TopBarButton 同一视觉语言：32px 圆角按钮、20px 图标、NTooltip bottom、
 *   hover var(--color-hover) 反馈；关闭按钮 hover 红底（var(--color-danger)）+
 *   反白图标（Windows 惯例红底关闭）；
 * - 关闭走应用内统一未保存确认（projectFile.confirmDiscard：干净直接过、脏则弹
 *   确认对话框），确认放弃后才调桥关闭——main 侧契约：IPC.WINDOW_CLOSE =
 *   renderer 已确认的关闭（destroy() 强制关闭，不再二次弹窗）；
 * - 最大化态仅切换图标（无 active 指示条——窗口按钮无激活语义）；
 * - 根容器 -webkit-app-region: no-drag：按钮组是窗口 chrome，绝不能随顶部条拖动区被拖走。
 */
import { inject } from 'vue'
import { NTooltip } from 'naive-ui'
import { RemoveOutline, SquareOutline, CopyOutline, CloseOutline } from '@vicons/ionicons5'
import { useWindowControls } from '@/composables/useWindowControls'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'

const { isMaximized, minimize, toggleMaximize, close } = useWindowControls()

// 从 AppShell 注入的项目文件操作（单实例共享状态，注入方式对齐 OpenButton 等按钮组件）
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

/**
 * 关闭窗口：先走应用内统一未保存确认，确认放弃后才调桥关闭。
 * - 干净项目：confirmDiscard 直接返回 true → 立即调桥；
 * - 脏项目：confirmDiscard 弹确认对话框，用户确认放弃 → 调桥；取消 → 中止不关；
 * - projectFile 缺失（如测试环境无 AppShell 注入）：跳过确认直接调桥兜底。
 */
async function handleClose(): Promise<void> {
  if (projectFile && !(await projectFile.confirmDiscard())) return
  close()
}
</script>

<template>
  <!-- 窗口 chrome 按钮组：no-drag 退出窗口拖动区，绝不参与窗口拖动 -->
  <div class="window-controls">
    <NTooltip placement="bottom">
      <template #trigger>
        <button type="button" class="win-btn" @click="minimize">
          <RemoveOutline class="win-btn-icon" />
        </button>
      </template>
      {{ t('toolbar.minimize') }}
    </NTooltip>

    <!-- 最大化 / 还原：随 isMaximized 切换图标（方框=最大化，双框=还原），tooltip 文案同步切换 -->
    <NTooltip placement="bottom">
      <template #trigger>
        <button type="button" class="win-btn" @click="toggleMaximize">
          <SquareOutline v-if="!isMaximized" class="win-btn-icon" />
          <CopyOutline v-else class="win-btn-icon" />
        </button>
      </template>
      {{ isMaximized ? t('toolbar.restore') : t('toolbar.maximize') }}
    </NTooltip>

    <!-- 关闭：先经应用内未保存确认（确认放弃后才调桥，main 侧 destroy() 强制关闭）；hover 红底 + 反白图标（Windows 惯例） -->
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
/* 按钮组容器：no-drag 显式退出顶部条拖动区；组内间距与 TopBarZone 的 gap 一致 */
.window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* 与 TopBarButton .top-btn 同一视觉语言：32px 圆角、透明底、弱化透明度 */
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
  /* 双保险：即使命中容器外的按钮本体也绝不触发窗口拖动 */
  -webkit-app-region: no-drag;
}

.win-btn-icon {
  width: 20px;
  height: 20px;
  pointer-events: none; /* 让点击穿透到按钮本体 */
}

/* 悬停：亮起 + 淡背景（与 TopBarButton hover 一致） */
.win-btn:hover {
  opacity: 1;
  background: var(--color-hover);
}

/* 关闭按钮：hover 红底 + 反白图标（Windows 惯例），声明在后覆盖通用 hover */
.win-btn-close:hover {
  background: var(--color-danger);
  color: var(--color-on-primary);
}
</style>
