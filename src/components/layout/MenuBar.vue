<script setup lang="ts">
/**
 * MenuBar - 顶部左侧图标栏（原菜单栏的图标化）
 *
 * 取消原「文件/编辑」下拉菜单样式，改为一排纯图标按钮（从左到右）：
 *   新建项目 → 打开 → 保存 → 撤销 → 重做 → 设置
 * 每个按钮经 IconBar 封装渲染，悬停有文字提示；撤销/重做按 canUndo/canRedo 禁用。
 *
 * 项目文件操作经 inject('projectFile')（AppShell 注入），撤销/重做经命令层。
 */
import { computed, inject } from 'vue'
import {
  AddOutline,
  FolderOpenOutline,
  SaveOutline,
  ArrowUndoOutline,
  ArrowRedoOutline,
  SettingsOutline,
} from '@vicons/ionicons5'
import { useCommands } from '@/composables/useCommands'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'
import IconBar, { type IconBarItem } from './IconBar.vue'

const emit = defineEmits<{
  openSettings: []
}>()

const commands = useCommands()

// 从 AppShell 注入的项目文件操作（单实例共享状态）
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

/** 左侧功能按钮配置（数组驱动 IconBar，未来加按钮只需在此追加一项） */
const items = computed<IconBarItem[]>(() => [
  {
    id: 'new-project',
    icon: AddOutline,
    title: t('menuBar.newProject'),
    onClick: () => projectFile?.newProject(),
  },
  {
    id: 'open',
    icon: FolderOpenOutline,
    title: t('menuBar.open'),
    onClick: () => projectFile?.openProject(),
  },
  {
    id: 'save',
    icon: SaveOutline,
    title: t('menuBar.save'),
    onClick: () => projectFile?.saveProject(),
  },
  {
    id: 'undo',
    icon: ArrowUndoOutline,
    title: t('menuBar.undo'),
    onClick: () => commands.undo(),
    disabled: !commands.canUndo.value,
  },
  {
    id: 'redo',
    icon: ArrowRedoOutline,
    title: t('menuBar.redo'),
    onClick: () => commands.redo(),
    disabled: !commands.canRedo.value,
  },
  {
    id: 'settings',
    icon: SettingsOutline,
    title: t('menuBar.settings'),
    onClick: () => emit('openSettings'),
  },
])
</script>

<template>
  <!-- 左侧分区：只承载 IconBar，边框/背景由 AppShell 顶部条统一提供 -->
  <div class="menu-bar">
    <IconBar :items="items" />
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0; /* 保持自然宽度：被 WheelScroll 包裹时超出可按滚轮横向滚动 */
}
</style>