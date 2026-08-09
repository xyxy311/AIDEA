<script setup lang="ts">
/**
 * SettingsModal — 设置面板
 *
 * 窗口式外观，不可拖拽移动，仅 UI 占位。
 */
import { NModal, NCard, NDivider, NSwitch, NSpace, NText, NRadioGroup, NRadioButton, NButton, useDialog } from 'naive-ui'
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import { accentSchemes, type AccentSchemeId } from '@/config/colorSchemes'
import { t } from '@/composables/useT'
import { computed } from 'vue'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const theme = useThemeStore()
const layout = useLayoutStore()
const dialog = useDialog()

/** 当前明暗模式下各主色调的色块颜色 */
const dotColors = computed(() => {
  const mode = theme.isDark ? 'dark' : 'light'
  return {
    emerald: accentSchemes.emerald.variants[mode].cssVars['--color-primary'],
    blue: accentSchemes.blue.variants[mode].cssVars['--color-primary'],
  }
})

/** 恢复默认布局：先弹确认框，确认后调用 layout.resetDock() */
function handleResetLayout(): void {
  dialog.warning({
    title: t('settings.resetLayout'),
    content: t('settings.resetLayoutConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => layout.resetDock(),
  })
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="true"
    @update:show="(v: boolean) => { if (!v) emit('close') }"
  >
    <NCard :title="t('settings.title')" style="width: 480px" closable @close="emit('close')">
      <NSpace vertical size="medium">
        <div>
          <NText strong>{{ t('settings.appearance') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>{{ t('settings.darkMode') }}</NText>
            <NSwitch :value="theme.isDark" @update:value="() => theme.toggle()" />
          </NSpace>
          <NSpace justify="space-between" align="center" style="width: 100%; margin-top: 10px">
            <NText>{{ t('settings.accent') }}</NText>
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
          </NSpace>
        </div>
        <div>
          <NText strong>{{ t('settings.layout') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NButton @click="handleResetLayout">{{ t('settings.resetLayout') }}</NButton>
        </div>
        <div>
          <NText strong>{{ t('settings.canvas') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NSpace justify="space-between" align="center" style="width: 100%">
            <NText>{{ t('settings.showGrid') }}</NText>
            <NSwitch :value="false" />
          </NSpace>
          <NSpace justify="space-between" align="center" style="width: 100%; margin-top: 8px">
            <NText>{{ t('settings.snapToGrid') }}</NText>
            <NSwitch :value="false" />
          </NSpace>
        </div>
        <div>
          <NText strong>{{ t('settings.shortcuts') }}</NText>
          <NDivider style="margin: 8px 0" />
          <NText depth="3">{{ t('settings.customShortcutsSoon') }}</NText>
        </div>
      </NSpace>
    </NCard>
  </NModal>
</template>

<style scoped>
.accent-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.accent-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
