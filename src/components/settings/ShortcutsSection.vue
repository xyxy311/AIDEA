<script setup lang="ts">
/**
 * ShortcutsSection — 设置面板「快捷键」分区
 *
 * 罗列**内置**可自定义动作（CUSTOM_SHORTCUTS），每个动作一行：显示当前绑定键
 * （点击进入「按键录制」——下一次按键即设置为新绑定），并提供「恢复默认」。
 * 底部提供序号修饰键（seq）行与「恢复全部默认」。
 * 动作行的录制 / 冲突 / 恢复逻辑封装在 ShortcutActionRow 组件（本区仅传 actionKey + label）。
 *
 * **插件动作已独占转移**：uiRegistry.shortcutActions 的插件动作不再出现在本区，
 * 改由插件自身设置栏目经 `adapter.api.shortcuts.pluginActions(pluginId)` +
 * ShortcutActionRow 渲染（主应用快捷键栏目只管内置动作）。
 * resetAll 仍为全局操作：清空全部覆盖（含插件动作的覆盖），语义不变。
 */
import { NButton, NIcon, useDialog } from 'naive-ui'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { RefreshOutline } from '@vicons/ionicons5'
import ShortcutActionRow from '@/components/common/ShortcutActionRow.vue'
import { useShortcutsStore } from '@/stores/shortcuts'
import { CUSTOM_SHORTCUTS } from '@/constants/shortcuts'
import { formatChord, toChordString, isModifierOnly } from '@/utils/shortcuts'
import { t } from '@/composables/useT'
import '@/components/settings/settings-shared.css'

const shortcuts = useShortcutsStore()
const dialog = useDialog()

/** 动作行统一模型：key 为绑定 id（内置 = 短 id） */
interface ActionRow {
  key: string
  label: string
}

/** 动作行列表：仅内置 CUSTOM_SHORTCUTS（label 经 t(labelKey)）；插件动作见插件自身设置栏目 */
const actionRows = computed<ActionRow[]>(() =>
  CUSTOM_SHORTCUTS.map((def) => ({ key: def.id, label: t(def.labelKey) })),
)

/** 是否正在录制序号修饰键 */
const recordingSeq = ref(false)
/** 序号修饰键行错误提示（动作行错误下沉到 ShortcutActionRow 组件局部） */
const seqError = ref<string | null>(null)

// ── 序号修饰键录制键盘监听（捕获阶段，先于全局快捷键触发） ──

function onCaptureKeydown(e: KeyboardEvent): void {
  if (!recordingSeq.value) return

  const chord = toChordString(e)

  // 修饰独占（仅 Ctrl/Shift/Alt…）时继续等待最终键
  if (isModifierOnly(chord)) return

  e.preventDefault()
  e.stopImmediatePropagation()

  // Esc 取消录制
  if (e.key === 'Escape') {
    recordingSeq.value = false
    return
  }

  const res = shortcuts.setSeqModKey(chord)
  if (res.ok) {
    seqError.value = null
  } else if (res.reason === 'invalid') {
    seqError.value = t('shortcuts.seqInvalid')
  } else if (res.reason === 'locked') {
    seqError.value = t('shortcuts.seqConflictLocked')
  } else {
    seqError.value = t('shortcuts.seqConflict', { name: t(res.conflict.labelKey) })
  }
  recordingSeq.value = false
}

function startRecordSeq(): void {
  recordingSeq.value = true
  seqError.value = null
}

/** 恢复全部默认：确认后调用 resetAll（全局操作：含插件动作覆盖） */
function handleResetAll(): void {
  dialog.warning({
    title: t('shortcuts.resetAll'),
    content: t('shortcuts.resetAllConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      shortcuts.resetAll()
      seqError.value = null
    },
  })
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
    <!-- 内置动作行（插件动作已独占转移到插件自身设置栏目） -->
    <ShortcutActionRow
      v-for="row in actionRows"
      :key="row.key"
      :action-key="row.key"
      :label="row.label"
    />

    <!-- 序号修饰键（T + 1-9 打标签） -->
    <div class="setting-row" :class="{ 'is-recording': recordingSeq }">
      <div class="setting-cell">
        <div class="setting-label">{{ t('shortcuts.seqMod') }}</div>
        <div class="setting-desc">{{ t('shortcuts.seqModHint') }}</div>
        <div v-if="seqError" class="setting-error">{{ seqError }}</div>
      </div>
      <div class="setting-actions">
        <span class="shortcut-kbd" @click="startRecordSeq">
          {{ recordingSeq ? t('shortcuts.recording') : formatChord(shortcuts.seqModKey) }}
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

/* 可点击的当前键展示（点击进入录制；seq 行专用——内置动作行样式在 ShortcutActionRow） */
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
