<script setup lang="ts">
/**
 * App - 应用根组件
 *
 * 挂载 AppShell 布局，在此处注入全局样式。
 * 所有功能逻辑下放至子组件，App.vue 仅负责顶级组合。
 */
import { computed } from 'vue'
import {
  NConfigProvider,
  NGlobalStyle,
  NMessageProvider,
  NDialogProvider,
  // naive-ui 自带的多语言包：界面文案（zhCN/enUS）与日期文案（dateZhCN/dateEnUS）
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
} from 'naive-ui'
import AppShell from '@/components/layout/AppShell.vue'
import { useThemeStore } from '@/stores/theme'
import type { LocaleId } from '@/types/locale'

const theme = useThemeStore()

// naive-ui 内置多语言包映射表（LocaleId -> naive-ui 自带文案 / 日期文案）：
// 未来新增语言时在两表中各补一行即可（值取自 naive-ui 的导出）。
const NAIVE_LOCALES: Record<LocaleId, typeof zhCN> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}
const NAIVE_DATE_LOCALES: Record<LocaleId, typeof dateZhCN> = {
  'zh-CN': dateZhCN,
  'en-US': dateEnUS,
}

// naive-ui 内置组件文案（通用按钮词 / 日期格式等）跟随界面语言切换：
// 经 computed 响应式读取 themeStore.locale（用户在设置 → 外观 → 语言切换），
// 语言变化即热更新 NConfigProvider 注入的自带文案；theme 绑定维持原有独立处理。
const naiveLocale = computed(() => NAIVE_LOCALES[theme.locale])
const naiveDateLocale = computed(() => NAIVE_DATE_LOCALES[theme.locale])
</script>

<template>
  <NConfigProvider
    :theme="theme.scheme.theme"
    :theme-overrides="theme.scheme.naiveOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <NMessageProvider>
      <NDialogProvider>
        <NGlobalStyle />
        <AppShell />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
