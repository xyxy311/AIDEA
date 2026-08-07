<script setup lang="ts">
/**
 * FloatingPropertyEditor — Word 风格浮动属性编辑器
 *
 * 选中节点 / 连线时在选中物旁弹出，专注高频样式操作：
 * - 自由改色（NColorPicker）
 * - 颜色预设横条（FloatingColorStrip）
 * - 连线额外：线型 / 粗细 / 有向
 *
 * 定位：Teleport 到 body + position:fixed，避免被 overflow:hidden 裁切。
 * 头部可作拖拽把手（pointerdown/move/up + setPointerCapture）。
 * 无位置记忆：选中变化时 offset 归零，每次选中重新锚定。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { NColorPicker, NSelect, NInputNumber, NCheckbox } from 'naive-ui'
import type { NodePresetStyle, ConnectionPresetStyle } from '@/types'
import { useActiveView } from '@/composables/useActiveView'
import { useNodeStore } from '@/stores/node'
import {
  LINE_STYLE_OPTIONS,
  CONNECTION_MAX_STROKE_WIDTH,
  DEFAULT_NODE_STYLE,
  CONNECTION_STROKE_COLOR,
} from '@/constants'
import { t } from '@/composables/useT'
import { useFloatingPropertyEditor } from '@/composables/useFloatingPropertyEditor'
import FloatingColorStrip from './FloatingColorStrip.vue'
import FloatingPresetEditor from './FloatingPresetEditor.vue'

const active = useActiveView()
const nodeStore = useNodeStore()
const { hasSelection, selectionType, basePosition, offset } = useFloatingPropertyEditor()

const colorMode = 'hex' as const

// ── 选中项数据 ──

const node = computed(() => {
  const id = active.view.selectedNodeId
  return id ? nodeStore.getNode(id) : null
})

const conn = computed(() => {
  const id = active.view.selectedConnectionId
  if (!id) return null
  return nodeStore.findConnectionById(id)?.connection ?? null
})

const currentBorderColor = computed<string | null>({
  get: () => node.value?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  set: (val: string | null) => {
    if (val) active.updateSelectedNodesStyle({ borderColor: val })
  },
})

const currentConnColor = computed<string | null>({
  get: () => conn.value?.strokeColor ?? CONNECTION_STROKE_COLOR,
  set: (val: string | null) => {
    if (val) active.updateSelectedConnectionsStyle({ strokeColor: val })
  },
})

const lineStyle = computed({
  get: () => conn.value?.lineStyle ?? 'solid' as const,
  set: (v: unknown) => {
    if (v) active.updateSelectedConnectionsStyle({ lineStyle: v as 'solid' | 'dashed' | 'dotted' })
  },
})

const strokeWidth = computed({
  get: () => conn.value?.strokeWidth ?? 2,
  set: (v: number | null) => {
    if (v != null) active.updateSelectedConnectionsStyle({ strokeWidth: v })
  },
})

const directed = computed({
  get: () => conn.value?.directed ?? true,
  set: (v: boolean) => active.updateSelectedConnectionsStyle({ directed: v }),
})

// ── 预设应用 ──

function applyNodePreset(preset: NodePresetStyle | ConnectionPresetStyle): void {
  active.updateSelectedNodesStyle({ borderColor: (preset as NodePresetStyle).borderColor })
}

function applyConnectionPreset(preset: NodePresetStyle | ConnectionPresetStyle): void {
  const p = preset as ConnectionPresetStyle
  // 应用连线预设：applyText 为真时把预设名称写入连线文字
  active.updateSelectedConnectionsStyle({
    lineStyle: p.lineStyle,
    strokeWidth: p.strokeWidth,
    strokeColor: p.strokeColor,
    directed: p.directed,
    ...(p.applyText ? { text: p.name } : {}),
  })
}

// ── 预设弹层 ──

const presetEditorShow = ref(false)
const presetEditorType = ref<'node' | 'connection'>('node')
const presetEditing = ref<NodePresetStyle | ConnectionPresetStyle | null>(null)

function openAddPreset(type: 'node' | 'connection'): void {
  presetEditorType.value = type
  presetEditing.value = null
  presetEditorShow.value = true
}

function openEditPreset(preset: NodePresetStyle | ConnectionPresetStyle): void {
  presetEditorType.value = selectionType.value === 'node' ? 'node' : 'connection'
  presetEditing.value = preset
  presetEditorShow.value = true
}

// ── 定位（锚点 + 拖动偏移 → translate 居中 → 视口夹取） ──

const panelRef = ref<HTMLElement | null>(null)
/** 鼠标是否在面板上（不在时半透明，用于弱化视觉干扰） */
const isHovered = ref(false)
const panelStyle = ref<{ left: string; top: string; transform: string }>({
  left: '0px',
  top: '0px',
  transform: 'translate(-50%, -100%)',
})

watch([hasSelection, basePosition], async () => {
  if (!hasSelection.value) {
    // 面板隐藏时重置 hover 态，避免下次出现时残留不透明
    isHovered.value = false
    return
  }
  await nextTick()
  const el = panelRef.value
  const base = basePosition.value
  if (!el || !base) return
  const rect = el.getBoundingClientRect()
  let x = base.x
  let y = base.y
  const M = 8
  if (rect.left < M) x += M - rect.left
  if (rect.right > window.innerWidth - M) x -= rect.right - window.innerWidth + M
  if (rect.top < M) y += M - rect.top
  if (rect.bottom > window.innerHeight - M) y -= rect.bottom - window.innerHeight + M
  panelStyle.value = {
    left: `${x}px`,
    top: `${y}px`,
    transform: 'translate(-50%, -100%)',
  }
})

// ── 拖动（头部为把手） ──

const dragState = ref<{ px: number; py: number; ox: number; oy: number } | null>(null)

function onHeaderPointerDown(e: PointerEvent): void {
  dragState.value = {
    px: e.clientX,
    py: e.clientY,
    ox: offset.value.x,
    oy: offset.value.y,
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onHeaderPointerMove(e: PointerEvent): void {
  const d = dragState.value
  if (!d) return
  offset.value = {
    x: d.ox + (e.clientX - d.px),
    y: d.oy + (e.clientY - d.py),
  }
}

function onHeaderPointerUp(): void {
  dragState.value = null
}
</script>

<template>
  <FloatingPresetEditor
    :show="presetEditorShow"
    :type="presetEditorType"
    :editing="presetEditing"
    @close="presetEditorShow = false"
    @saved="presetEditorShow = false"
  />

  <Teleport to="body">
    <Transition name="float-editor">
      <div
        v-if="hasSelection"
        ref="panelRef"
        class="float-editor"
        :class="{ 'is-dimmed': !isHovered }"
        :style="panelStyle"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
        <!-- 头部（拖拽把手） -->
        <div
          class="float-editor__header"
          @pointerdown="onHeaderPointerDown"
          @pointermove="onHeaderPointerMove"
          @pointerup="onHeaderPointerUp"
          @pointercancel="onHeaderPointerUp"
        >
          <span class="float-editor__title">
            {{ selectionType === 'node' ? t('floatingEditor.nodeTitle') : t('floatingEditor.connectionTitle') }}
          </span>
          <span class="float-editor__grip">⋮⋮</span>
        </div>

        <div class="float-editor__body">
          <!-- 节点 -->
          <template v-if="selectionType === 'node'">
            <NColorPicker
              v-model:value="currentBorderColor"
              :modes="[colorMode]"
              :show-alpha="true"
              size="small"
              class="float-editor__color"
            />
            <FloatingColorStrip
              type="node"
              :current-color="currentBorderColor ?? ''"
              @apply="applyNodePreset"
              @add="openAddPreset('node')"
              @edit="openEditPreset"
            />
          </template>

          <!-- 连线 -->
          <template v-else-if="selectionType === 'connection'">
            <NColorPicker
              v-model:value="currentConnColor"
              :modes="[colorMode]"
              :show-alpha="false"
              size="small"
              class="float-editor__color"
            />
            <FloatingColorStrip
              type="connection"
              :current-color="currentConnColor ?? ''"
              @apply="applyConnectionPreset"
              @add="openAddPreset('connection')"
              @edit="openEditPreset"
            />

            <div class="float-editor__controls">
              <NSelect
                v-model:value="lineStyle"
                :options="LINE_STYLE_OPTIONS"
                size="small"
                class="float-editor__line"
              />
              <NInputNumber
                v-model:value="strokeWidth"
                :min="1"
                :max="CONNECTION_MAX_STROKE_WIDTH"
                show-button
                size="small"
                class="float-editor__width"
              />
              <NCheckbox v-model:checked="directed">{{ t('floatingEditor.directed') }}</NCheckbox>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.float-editor {
  position: fixed;
  z-index: 2000;
  width: 300px;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  user-select: none;
  transition: opacity 0.18s ease;
}

/* 鼠标不在面板上时半透明，移入恢复不透明 */
.float-editor.is-dimmed {
  opacity: 0.25;
}

.float-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  cursor: grab;
}

.float-editor__header:active {
  cursor: grabbing;
}

.float-editor__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.float-editor__grip {
  color: var(--color-text-muted);
  font-size: 12px;
  letter-spacing: -3px;
  line-height: 1;
}

.float-editor__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.float-editor__color {
  width: 100%;
}

.float-editor__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.float-editor__line {
  flex: 1;
  min-width: 0;
}

.float-editor__width {
  width: 84px;
  flex-shrink: 0;
}

/* ── 过渡动画 ── */
.float-editor-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.float-editor-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.float-editor-enter-from {
  opacity: 0;
  transform: translate(-50%, -100%) translateY(4px);
}

.float-editor-leave-to {
  opacity: 0;
  transform: translate(-50%, -100%) translateY(-2px);
}
</style>