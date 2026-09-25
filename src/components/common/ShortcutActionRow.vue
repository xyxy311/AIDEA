<script setup lang="ts">
/**
 * ShortcutActionRow — 单个快捷键动作的改键行（可复用）：label + 错误提示 + 键帽点击录制
 * + 录制中高亮 + 恢复默认。内置动作（短 id）与插件动作（完整 key）共用同一条录制/冲突/恢复流程。
 * 录制用 window 捕获阶段 keydown + stopImmediatePropagation，避免录制期间误触全局快捷键；
 * 组件局部错误状态（按自身 actionKey），多实例共存安全——同一时刻只有一个录制实例消费按键。
 */
import { NButton, NIcon } from 'naive-ui'
import { onMounted, onUnmounted, ref } from 'vue'
import { RefreshOutline } from '@vicons/ionicons5'
import { useShortcutsStore } from '@/stores/shortcuts'
import { formatChord, toChordString, isModifierOnly } from '@/utils/shortcuts'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const props = defineProps<{
  /** 动作的完整登记 key（内置 = 短 id；插件 = `${pluginId}:${id}`） */
  actionKey: string
  /** 成品展示文案（内置动作由使用方经 t(labelKey) 解析后传入） */
  label: string
}>()

const shortcuts = useShortcutsStore()

/** 是否处于录制态（录制中下一次有效按键即设置为新绑定） */
const recording = ref(false)
/** 冲突 / 非法提示（组件局部，只服务自身 actionKey） */
const error = ref<string | null>(null)

// ── 录制键盘监听（捕获阶段，先于全局快捷键触发）──

function onCaptureKeydown(e: KeyboardEvent): void {
  if (!recording.value) return

  const chord = toChordString(e)

  // 修饰独占（仅 Ctrl/Shift/Alt…）时继续等待最终键
  if (isModifierOnly(chord)) return

  e.preventDefault()
  e.stopImmediatePropagation()

  // Esc 取消录制
  if (e.key === 'Escape') {
    recording.value = false
    return
  }

  // 动作绑定：冲突结果按原逻辑映射为错误文案（插件动作 labelKey 实为成品 label，t() 幂等）
  const result = shortcuts.assign(props.actionKey, chord)
  if (result.ok) {
    error.value = null
  } else if (result.conflict === 'locked') {
    error.value = t('shortcuts.conflictLocked')
  } else if (result.conflict === 'seqMod') {
    error.value = t('shortcuts.conflictSeqMod')
  } else {
    error.value = t('shortcuts.conflict', { name: t(result.conflict.labelKey) })
  }
  recording.value = false
}

function startRecord(): void {
  recording.value = true
  error.value = null
}

/** 恢复默认绑定（清除该动作的用户覆盖） */
function handleReset(): void {
  shortcuts.reset(props.actionKey)
  error.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onCaptureKeydown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onCaptureKeydown, true)
})
</script>

<template>
  <div class="setting-row" :class="{ 'is-recording': recording }">
    <div class="setting-cell">
      <div class="setting-label">{{ label }}</div>
      <div v-if="error" class="setting-error">{{ error }}</div>
    </div>
    <div class="setting-actions">
      <span class="shortcut-kbd" @click="startRecord">
        {{ recording ? t('shortcuts.recording') : formatChord(shortcuts.getBinding(actionKey)) }}
      </span>
      <NButton
        size="tiny"
        quaternary
        class="reset-btn"
        :title="t('shortcuts.reset')"
        @click.stop="handleReset"
      >
        <NIcon><RefreshOutline /></NIcon>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.setting-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 可点击的当前键展示（点击进入录制） */
.shortcut-kbd {
  min-width: 64px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-hover);
  color: var(--color-text);
  font-size: 12px;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.shortcut-kbd:hover {
  border-color: var(--color-primary);
}

.reset-btn {
  flex-shrink: 0;
}

/* 录制中高亮 */
.setting-row.is-recording .shortcut-kbd {
  border-color: var(--color-primary);
  color: var(--color-primary);
  animation: shortcut-row-blink 1s ease-in-out infinite;
}

@keyframes shortcut-row-blink {
  0%, 100% { background-color: var(--color-primary-soft); }
  50% { background-color: var(--color-hover); }
}

.setting-error {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-error, #d03050);
}
</style>
