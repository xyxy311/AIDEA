<script setup lang="ts">
/**
 * ShortcutsSection — 设置面板「快捷键」分区
 *
 * 罗列所有可自定义动作，每个动作一行：显示当前绑定键（点击进入「按键录制」——
 * 下一次按键即设置为新绑定），并提供「恢复默认」。
 * 底部提供「恢复全部默认」。
 *
 * 录制采用 window 捕获阶段的 keydown 监听，并 stopImmediatePropagation，
 * 避免录制期间按键误触全局快捷键。
 */
import { NButton, NIcon, useDialog } from 'naive-ui'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { RefreshOutline } from '@vicons/ionicons5'
import { useShortcutsStore } from '@/stores/shortcuts'
import { CUSTOM_SHORTCUTS } from '@/constants/shortcuts'
import { formatChord, toChordString, isModifierOnly } from '@/utils/shortcuts'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const shortcuts = useShortcutsStore()
const dialog = useDialog()

/** 正在录制哪个动作 / 序号修饰键；null 表示不在录制 */
const recording = ref<'action' | string | null>(null)
/** 录制中的动作 id（与 recording 配合，action 模式下存动作 id） */
const recordingActionId = ref<string | null>(null)
/** 冲突 / 非法提示文案 key（可按 id 存多个） */
const errors = ref<Record<string, string>>({})

/** 是否正在录制动作绑定 */
const isActionRecording = computed(() => recording.value === 'action')

// ── 录制键盘监听（捕获阶段，先于全局快捷键触发） ──

function onCaptureKeydown(e: KeyboardEvent): void {
  if (recording.value === null) return

  const isSeq = recording.value === 'seq'
  const id = recordingActionId.value
  const chord = toChordString(e)

  // 修饰独占（仅 Ctrl/Shift/Alt…）时继续等待最终键
  if (isModifierOnly(chord)) return

  e.preventDefault()
  e.stopImmediatePropagation()

  // Esc 取消录制
  if (e.key === 'Escape') {
    recording.value = null
    recordingActionId.value = null
    return
  }

  if (isSeq) {
    const res = shortcuts.setSeqModKey(chord)
    if (res.ok) {
      clearError('seq')
    } else if (res.reason === 'invalid') {
      setError('seq', t('shortcuts.seqInvalid'))
    } else if (res.reason === 'locked') {
      setError('seq', t('shortcuts.seqConflictLocked'))
    } else {
      setError('seq', t('shortcuts.seqConflict', { name: t(res.conflict.labelKey) }))
    }
    recording.value = null
    return
  }

  // 动作绑定
  if (!id) return
  const result = shortcuts.assign(id, chord)
  if (result.ok) {
    clearError(id)
  } else if (result.conflict === 'locked') {
    setError(id, t('shortcuts.conflictLocked'))
  } else if (result.conflict === 'seqMod') {
    setError(id, t('shortcuts.conflictSeqMod'))
  } else {
    setError(id, t('shortcuts.conflict', { name: t(result.conflict.labelKey) }))
  }
  recording.value = null
  recordingActionId.value = null
}

function startRecordAction(id: string): void {
  // 若正录制其它项，先静默取消
  recording.value = 'action'
  recordingActionId.value = id
  clearError(id)
}

function startRecordSeq(): void {
  recording.value = 'seq'
  recordingActionId.value = null
  clearError('seq')
}

function handleReset(id: string): void {
  shortcuts.reset(id)
  clearError(id)
}

/** 恢复全部默认：确认后调用 resetAll */
function handleResetAll(): void {
  dialog.warning({
    title: t('shortcuts.resetAll'),
    content: t('shortcuts.resetAllConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      shortcuts.resetAll()
      errors.value = {}
    },
  })
}

function setError(key: string, msg: string): void {
  errors.value = { ...errors.value, [key]: msg }
}
function clearError(key: string): void {
  if (errors.value[key]) {
    const next = { ...errors.value }
    delete next[key]
    errors.value = next
  }
}

onMounted(() => {
  window.addEventListener('keydown', onCaptureKeydown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onCaptureKeydown, true)
})
</script>

<template>
  <div class="settings-controls settings-shortcuts">
    <div
      v-for="def in CUSTOM_SHORTCUTS"
      :key="def.id"
      class="setting-row"
      :class="{ 'is-recording': isActionRecording && recordingActionId === def.id }"
    >
      <div class="setting-cell">
        <div class="setting-label">{{ t(def.labelKey) }}</div>
        <div v-if="errors[def.id]" class="setting-error">
          {{ errors[def.id] }}
        </div>
      </div>
      <div class="setting-actions">
        <span class="shortcut-kbd" @click="startRecordAction(def.id)">
          {{ isActionRecording && recordingActionId === def.id
             ? t('shortcuts.recording') : formatChord(shortcuts.getBinding(def.id)) }}
        </span>
        <NButton
          size="tiny"
          quaternary
          class="reset-btn"
          :title="t('shortcuts.reset')"
          @click.stop="handleReset(def.id)"
        >
          <NIcon><RefreshOutline /></NIcon>
        </NButton>
      </div>
    </div>

    <!-- 序号修饰键（T + 1-9 打标签） -->
    <div class="setting-row" :class="{ 'is-recording': recording === 'seq' }">
      <div class="setting-cell">
        <div class="setting-label">{{ t('shortcuts.seqMod') }}</div>
        <div class="setting-desc">{{ t('shortcuts.seqModHint') }}</div>
        <div v-if="errors.seq" class="setting-error">{{ errors.seq }}</div>
      </div>
      <div class="setting-actions">
        <span class="shortcut-kbd" @click="startRecordSeq">
          {{ recording === 'seq' ? t('shortcuts.recording') : formatChord(shortcuts.seqModKey) }}
        </span>
        <NButton
          size="tiny"
          quaternary
          class="reset-btn"
          :title="t('shortcuts.reset')"
          @click.stop="shortcuts.resetSeqModKey()"
        >
          <NIcon><RefreshOutline /></NIcon>
        </NButton>
      </div>
    </div>

    <div class="setting-row row-stack reset-all-row">
      <div class="setting-cell">
        <div class="setting-label">{{ t('shortcuts.resetAll') }}</div>
        <span class="settings-hint">{{ t('shortcuts.resetAllHint') }}</span>
      </div>
      <NButton size="small" @click="handleResetAll">
        {{ t('shortcuts.resetAll') }}
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
  animation: shortcuts-blink 1s ease-in-out infinite;
}

@keyframes shortcuts-blink {
  0%, 100% { background-color: var(--color-primary-soft); }
  50% { background-color: var(--color-hover); }
}

.setting-error {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-error, #d03050);
}

.reset-all-row {
  align-items: center;
}
</style>