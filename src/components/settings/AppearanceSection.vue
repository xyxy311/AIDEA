<script setup lang="ts">
/**
 * AppearanceSection — 设置面板「外观」分区：深色模式开关 + 内置主色单选 + 界面语言下拉框。
 */
import { NSwitch, NRadioGroup, NRadioButton, NSelect } from 'naive-ui'
import { computed } from 'vue'
import type { AccentSchemeId } from '@/config/colorSchemes'
import type { LocaleId } from '@/types/locale'
import { accentSchemes } from '@/config/colorSchemes'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const theme = useThemeStore()
// 运行时语言表（内置 zh-CN + 运行时装载登记的语言，即插即用）
const i18nStore = useI18nStore()

/** 当前明暗模式下各主色调的色块颜色 */
const dotColors = computed(() => {
  const mode = theme.isDark ? 'dark' : 'light'
  return {
    emerald: accentSchemes.emerald.variants[mode].cssVars['--color-primary'],
    blue: accentSchemes.blue.variants[mode].cssVars['--color-primary'],
  }
})

/** 语言选择器选项：来自 i18nStore.available（label 为语言自名，不可翻译） */
const localeOptions = computed(() =>
  i18nStore.available.map((l) => ({ label: l.label, value: l.id })),
)
</script>

<template>
  <div class="settings-controls">
    <div class="setting-row">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.darkMode') }}</div>
        <div class="setting-desc">{{ t('settings.darkModeHint') }}</div>
      </div>
      <NSwitch :value="theme.isDark" @update:value="() => theme.toggle()" />
    </div>

    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.accent') }}</div>
      </div>
      <NRadioGroup
        :value="theme.accentId"
        @update:value="(v: AccentSchemeId) => theme.setAccent(v)"
      >
        <NRadioButton value="emerald">
          <span class="accent-option">
            <span class="accent-dot" :style="{ background: dotColors.emerald }" />
            {{ t('settings.accentEmerald') }}
          </span>
        </NRadioButton>
        <NRadioButton value="blue">
          <span class="accent-option">
            <span class="accent-dot" :style="{ background: dotColors.blue }" />
            {{ t('settings.accentBlue') }}
          </span>
        </NRadioButton>
      </NRadioGroup>
    </div>

    <div class="setting-row row-stack">
      <div class="setting-cell">
        <div class="setting-label">{{ t('settings.language') }}</div>
      </div>
      <NSelect
        class="lang-select"
        :value="theme.locale"
        :options="localeOptions"
        :consistent-menu-width="false"
        @update:value="(v: LocaleId) => theme.setLocale(v)"
      />
    </div>
  </div>
</template>

<style scoped>
/* 语言下拉框：与该行控件区右对齐，固定宽度保持行内布局紧凑 */
.lang-select {
  width: 160px;
}
</style>