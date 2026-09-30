<script setup lang="ts">
// OpenButton - 打开项目按钮（左顶条）；主点击打开项目，split-button 下拉新建/最近文件/从文本插入。
import { computed, inject, ref } from 'vue'
import { FolderOpenOutline } from '@vicons/ionicons5'
import { useMessage } from 'naive-ui'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'
import TopBarButton, { type TopBarMenuOption } from '@/components/common/TopBarButton.vue'
import TextInsertModal from '@/components/topbar/TextInsertModal.vue'

// 经 inject 取 AppShell 注入的项目文件操作
const projectFile = inject<ProjectFileApi | undefined>('projectFile')
const message = useMessage()

const recentMenuOptions = computed<TopBarMenuOption[]>(() => {
  const list = projectFile?.recentFiles.value ?? []
  return list.map((f) => ({
    key: f.id,
    label: f.name,
    onSelect: () => projectFile?.openRecentFile(f.name),
  }))
})

// 从文本插入模态开关（下拉项触发；确认/关闭后复位）
const showTextInsert = ref(false)

/** 模态确认：插入并给反馈（成功后关闭） */
function handleTextInsert(content: string): void {
  const count = projectFile?.insertNodeText(content) ?? 0
  showTextInsert.value = false
  if (count > 0) {
    message.success(t('menuBar.insertTextDone', { count }))
  } else {
    message.warning(t('menuBar.insertTextEmpty'))
  }
}

const menu = computed<TopBarMenuOption[]>(() => [
  { key: 'new', label: t('menuBar.newProject'), onSelect: () => projectFile?.newProject() },
  {
    key: 'insert-text',
    label: t('menuBar.insertText'),
    onSelect: () => {
      showTextInsert.value = true
    },
  },
  {
    key: 'open-recent',
    label: t('menuBar.openRecent'),
    disabled: recentMenuOptions.value.length === 0,
    children: recentMenuOptions.value.length > 0 ? recentMenuOptions.value : undefined,
  },
])
</script>

<template>
  <TopBarButton
    :icon="FolderOpenOutline"
    :title="t('menuBar.open')"
    :menu="menu"
    @click="projectFile?.openProject()"
  />
  <TextInsertModal :show="showTextInsert" @close="showTextInsert = false" @insert="handleTextInsert" />
</template>