<script setup lang="ts">
/**
 * OpenButton - 打开项目按钮（注册于左顶部条）
 *
 * 主点击 = 打开项目；split-button 小三角下拉 = 新建项目 / 打开最近文件。
 */
import { computed, inject } from 'vue'
import { FolderOpenOutline } from '@vicons/ionicons5'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'
import TopBarButton, { type TopBarMenuOption } from '@/components/common/TopBarButton.vue'

// 从 AppShell 注入的项目文件操作（单实例共享状态）
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

/** 「打开最近文件」子菜单项（由 recentFiles 动态生成，空列表时禁用） */
const recentMenuOptions = computed<TopBarMenuOption[]>(() => {
  const list = projectFile?.recentFiles.value ?? []
  return list.map((f) => ({
    key: f.id,
    label: f.name,
    onSelect: () => projectFile?.openRecentFile(f.name),
  }))
})

/** 「打开项目」下拉菜单：新建 + 打开最近文件 */
const menu = computed<TopBarMenuOption[]>(() => [
  { key: 'new', label: t('menuBar.newProject'), onSelect: () => projectFile?.newProject() },
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
</template>