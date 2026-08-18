<script setup lang="ts">
/**
 * AppearanceSection — 设置面板「外观」分区
 *
 * 深色模式开关 + 内置主色（内置色）单选。
 */
import { NSwitch, NRadioGroup, NRadioButton } from 'naive-ui'
import { computed } from 'vue'
import type { AccentSchemeId } from '@/config/colorSchemes'
import { accentSchemes } from '@/config/colorSchemes'
import { useThemeStore } from '@/stores/theme'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const theme = useThemeStore()

/** 当前明暗模式下各主色调的色块颜色 */
const dotColors = computed(() => {
  const mode = theme.isDark ? 'dark' : 'light'
  return {
    emerald: accentSchemes.emerald.variants[mode].cssVars['--color-primary'],
    blue: accentSchemes.blue.variants[mode].cssVars['--color-primary'],
  }
})
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
  </div>
</template>