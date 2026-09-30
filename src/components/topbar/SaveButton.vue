<script setup lang="ts">
// SaveButton - 保存项目按钮（左顶条）；主点击保存，split-button 下拉另存为。
import { computed, inject } from 'vue'
import { SaveOutline } from '@vicons/ionicons5'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'
import TopBarButton, { type TopBarMenuOption } from '@/components/common/TopBarButton.vue'

// 经 inject 取 AppShell 注入的项目文件操作
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

const menu = computed<TopBarMenuOption[]>(() => [
  { key: 'save-as', label: t('menuBar.saveAs'), onSelect: () => projectFile?.saveAsProject() },
  {
    key: 'export-to-text',
    label: t('menuBar.exportToText'),
    onSelect: () => projectFile?.exportToText(),
  },
])
</script>

<template>
  <TopBarButton
    :icon="SaveOutline"
    :title="t('menuBar.save')"
    :menu="menu"
    @click="projectFile?.saveProject()"
  />
</template>