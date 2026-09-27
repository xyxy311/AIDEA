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
} from 'naive-ui'
import AppShell from '@/components/layout/AppShell.vue'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import { DEFAULT_NAIVE_BASE, resolveNaiveLocale, resolveNaiveDateLocale } from '@/composables/naiveLocale'

const theme = useThemeStore()
const i18n = useI18nStore()

// 当前界面语言的 naive-ui 兜底语言 id：来自语言元数据 @meta.naiveBase（内置读种子、运行时读登记项）。
// naive 文案永不并入自编 locale，只按 naiveBase 对接。
const currentNaiveBase = computed(() => {
  const entry = i18n.available.find((l) => l.id === theme.locale)
  return entry?.naiveBase ?? DEFAULT_NAIVE_BASE
})

// naive-ui 内置组件文案（通用按钮词 / 日期格式等）跟随界面语言切换：
// 经 computed 响应式读取 theme.locale → naiveBase，语言变化即热更新；theme 绑定维持原有独立处理。
const naiveLocale = computed(() => resolveNaiveLocale(currentNaiveBase.value))
const naiveDateLocale = computed(() => resolveNaiveDateLocale(currentNaiveBase.value))
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
