<script setup lang="ts">
/**
 * SaveButton - 保存项目按钮（注册于左顶部条）
 *
 * 主点击 = 保存；split-button 小三角下拉 = 另存为。
 */
import { computed, inject } from 'vue'
import { SaveOutline } from '@vicons/ionicons5'
import type { ProjectFileApi } from '@/composables/useProjectFile'
import { t } from '@/composables/useT'
import TopBarButton, { type TopBarMenuOption } from '@/components/common/TopBarButton.vue'

// 从 AppShell 注入的项目文件操作（单实例共享状态）
const projectFile = inject<ProjectFileApi | undefined>('projectFile')

/** 「保存」下拉菜单：另存为 */
const menu = computed<TopBarMenuOption[]>(() => [
  { key: 'save-as', label: t('menuBar.saveAs'), onSelect: () => projectFile?.saveAsProject() },
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