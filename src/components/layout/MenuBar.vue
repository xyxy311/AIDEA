<script setup lang="ts">
/**
 * MenuBar - 顶部菜单栏
 *
 * 文件菜单：新建项目、保存、导出
 * 编辑菜单：撤销、重做、设置
 */
import { h, computed, inject, type Component } from 'vue'
import { NDropdown, NButton, type DropdownOption } from 'naive-ui'
import { AddOutline, SaveOutline, FolderOpenOutline, ArrowUndoOutline, ArrowRedoOutline, SettingsOutline } from '@vicons/ionicons5'
import { useCommands } from '@/composables/useCommands'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'

const emit = defineEmits<{
  openSettings: []
}>()

const commands = useCommands()

// 从 AppShell 注入的项目文件操作（单实例共享状态）
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

function renderIcon(icon: Component) {
  return () => h(icon)
}

const fileOptions = computed<DropdownOption[]>(() => [
  { label: t('menuBar.newProject'), key: 'new-project', icon: renderIcon(AddOutline) },
  { type: 'divider', key: 'd1' },
  { label: t('menuBar.open'), key: 'open', icon: renderIcon(FolderOpenOutline) },
  { type: 'divider', key: 'd2' },
  { label: t('menuBar.save'), key: 'save', icon: renderIcon(SaveOutline) },
])

// 动态生成 editOptions：canUndo/canRedo 控制禁用状态
const editOptions = computed<DropdownOption[]>(() => [
  { label: t('menuBar.undo'), key: 'undo', icon: renderIcon(ArrowUndoOutline), disabled: !commands.canUndo.value },
  { label: t('menuBar.redo'), key: 'redo', icon: renderIcon(ArrowRedoOutline), disabled: !commands.canRedo.value },
  { type: 'divider', key: 'd3' },
  { label: t('menuBar.settings'), key: 'settings', icon: renderIcon(SettingsOutline) },
])

function handleSelect(key: string): void {
  if (key === 'settings') {
    emit('openSettings')
    return
  }
  if (key === 'undo') {
    commands.undo()
    return
  }
  if (key === 'redo') {
    commands.redo()
    return
  }
  if (key === 'new-project') {
    projectFile?.newProject()
    return
  }
  if (key === 'open') {
    projectFile?.openProject()
    return
  }
  if (key === 'save') {
    projectFile?.saveProject()
    return
  }
}
</script>

<template>
  <div class="menu-bar">
    <NDropdown trigger="click" :options="fileOptions" @select="handleSelect">
      <NButton text class="menu-btn">{{ t('menuBar.file') }}</NButton>
    </NDropdown>
    <NDropdown trigger="click" :options="editOptions" @select="handleSelect">
      <NButton text class="menu-btn">{{ t('menuBar.edit') }}</NButton>
    </NDropdown>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 2px;
}

.menu-btn {
  font-size: 13px;
  color: var(--color-text);
  padding: 2px 10px;
  border-radius: 4px;
}

.menu-btn:hover {
  background: var(--color-bg);
}
</style>
