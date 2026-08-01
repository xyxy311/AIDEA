<script setup lang="ts">
/**
 * MenuBar - 顶部菜单栏
 *
 * 文件菜单：新建项目、保存、导出
 * 编辑菜单：撤销、重做、设置
 */
import { h, computed, type Component } from 'vue'
import { NDropdown, NButton, type DropdownOption } from 'naive-ui'
import { AddOutline, SaveOutline, ArrowUndoOutline, ArrowRedoOutline, SettingsOutline } from '@vicons/ionicons5'
import { useCommands } from '@/composables/useCommands'

const emit = defineEmits<{
  openSettings: []
}>()

const commands = useCommands()

function renderIcon(icon: Component) {
  return () => h(icon)
}

const fileOptions: DropdownOption[] = [
  { label: '新建项目', key: 'new-project', icon: renderIcon(AddOutline) },
  { type: 'divider', key: 'd1' },
  { label: '保存', key: 'save', icon: renderIcon(SaveOutline) },
]

// 动态生成 editOptions：canUndo/canRedo 控制禁用状态
const editOptions = computed<DropdownOption[]>(() => [
  { label: '撤销', key: 'undo', icon: renderIcon(ArrowUndoOutline), disabled: !commands.canUndo.value },
  { label: '重做', key: 'redo', icon: renderIcon(ArrowRedoOutline), disabled: !commands.canRedo.value },
  { type: 'divider', key: 'd2' },
  { label: '设置', key: 'settings', icon: renderIcon(SettingsOutline) },
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
  // 预留：其他功能暂不实现
  console.log('[MenuBar]', key)
}
</script>

<template>
  <div class="menu-bar">
    <NDropdown trigger="click" :options="fileOptions" @select="handleSelect">
      <NButton text class="menu-btn">文件</NButton>
    </NDropdown>
    <NDropdown trigger="click" :options="editOptions" @select="handleSelect">
      <NButton text class="menu-btn">编辑</NButton>
    </NDropdown>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  gap: 2px;
}

.menu-btn {
  font-size: 13px;
  color: #1f2937;
  padding: 2px 10px;
  border-radius: 4px;
}

.menu-btn:hover {
  background: #e5e7eb;
}
</style>
