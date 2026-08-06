<script setup lang="ts">
/**
 * FloatingColorStrip — 浮动编辑器水平预设横条
 *
 * 按选中类型渲染：
 * - 节点：纯色圆点色块
 * - 连线：迷你线段小样（实线/虚线/点线 + 有向箭头）
 *
 * 点击应用预设；右键色块弹出上下文菜单（编辑/删除）；尾部 + 添加预设。
 * 删除动作在组件内直接调 presetsStore，编辑/添加通过事件上抛。
 */
import { computed } from 'vue'
import { NScrollbar } from 'naive-ui'
import type { NodePresetStyle, ConnectionPresetStyle, LineStyle } from '@/types'
import { useContextMenu, type ContextMenuItem } from '@/composables/useContextMenu'
import ContextMenu from '@/components/canvas/ContextMenu.vue'
import { usePresetsStore } from '@/stores/presets'
import { t } from '@/composables/useT'

const props = defineProps<{
  type: 'node' | 'connection'
  /** 当前选中项颜色（用于选中态高亮比对） */
  currentColor: string
}>()

const emit = defineEmits<{
  apply: [preset: NodePresetStyle | ConnectionPresetStyle]
  add: []
  edit: [preset: NodePresetStyle | ConnectionPresetStyle]
}>()

const presetsStore = usePresetsStore()
const contextMenu = useContextMenu()

const list = computed(() =>
  props.type === 'node'
    ? (presetsStore.nodePresets as NodePresetStyle[])
    : (presetsStore.connectionPresets as ConnectionPresetStyle[]),
)

/** 连线预设迷你小样的 dasharray（小尺寸线段需较小 dash） */
function getDashArray(style: LineStyle): string {
  if (style === 'solid') return ''
  if (style === 'dashed') return '6,4'
  return '2,3'
}

/** 是否与当前选中颜色匹配（选中态高亮） */
function isActive(preset: NodePresetStyle | ConnectionPresetStyle): boolean {
  if (props.type === 'node') return (preset as NodePresetStyle).borderColor === props.currentColor
  return (preset as ConnectionPresetStyle).strokeColor === props.currentColor
}

function onSwatchClick(preset: NodePresetStyle | ConnectionPresetStyle): void {
  emit('apply', preset)
}

/** 右键色块 → 上下文菜单（编辑 / 删除） */
function onSwatchContext(e: MouseEvent, preset: NodePresetStyle | ConnectionPresetStyle): void {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.open(e.clientX, e.clientY, [
    {
      key: 'edit',
      label: t('floatingEditor.edit'),
      action: () => emit('edit', preset),
    },
    {
      key: 'delete',
      label: t('floatingEditor.delete'),
      danger: true,
      action: () => {
        if (props.type === 'node') {
          presetsStore.deleteNodePreset((preset as NodePresetStyle).id)
        } else {
          presetsStore.deleteConnectionPreset((preset as ConnectionPresetStyle).id)
        }
      },
    },
  ])
}

function handleMenuSelect(item: ContextMenuItem): void {
  item.action?.()
  contextMenu.close()
}
</script>

<template>
  <div class="floating-strip">
    <NScrollbar x-scrollable class="floating-strip__scrollbar">
      <div class="floating-strip__scroll">
        <div
          v-for="p in list"
          :key="p.id"
          class="floating-strip__swatch"
          :class="{
            'floating-strip__swatch--node': type === 'node',
            'floating-strip__swatch--conn': type === 'connection',
            'is-active': isActive(p),
          }"
          :title="p.name"
          @click="onSwatchClick(p)"
          @contextmenu.prevent="onSwatchContext($event, p)"
        >
          <!-- 节点：纯色圆点 -->
          <span
            v-if="type === 'node'"
            class="floating-strip__dot"
            :style="{ backgroundColor: (p as NodePresetStyle).borderColor }"
          />
          <!-- 连线：迷你线段小样 -->
          <svg v-else class="floating-strip__line" width="30" height="16" viewBox="0 0 30 16">
            <line
              x1="2"
              y1="8"
              x2="22"
              y2="8"
              :stroke="(p as ConnectionPresetStyle).strokeColor"
              :stroke-width="Math.min(Math.max((p as ConnectionPresetStyle).strokeWidth, 2), 5)"
              :stroke-dasharray="getDashArray((p as ConnectionPresetStyle).lineStyle)"
              stroke-linecap="round"
            />
            <polygon
              v-if="(p as ConnectionPresetStyle).directed"
              points="21,4 27,8 21,12"
              :fill="(p as ConnectionPresetStyle).strokeColor"
            />
          </svg>
        </div>
      </div>
    </NScrollbar>

    <button
      class="floating-strip__add"
      :title="t('floatingEditor.addPreset')"
      @click="emit('add')"
    >
      +
    </button>

    <ContextMenu
      :visible="contextMenu.visible.value"
      :x="contextMenu.x.value"
      :y="contextMenu.y.value"
      :items="contextMenu.items.value"
      @select="handleMenuSelect"
      @close="contextMenu.close"
    />
  </div>
</template>

<style scoped>
.floating-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.floating-strip__scrollbar {
  flex: 1;
  min-width: 0;
}

.floating-strip__scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  padding: 2px 2px 6px;
}

.floating-strip__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  border: 2px solid transparent;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease,
    transform 0.12s ease;
}

.floating-strip__swatch:hover {
  transform: scale(1.08);
}

.floating-strip__swatch.is-active {
  border-color: var(--color-selected-ring);
  box-shadow: 0 0 0 1px var(--color-selected-ring);
}

.floating-strip__swatch--node {
  width: 26px;
  height: 26px;
  border-radius: 50%;
}

.floating-strip__swatch--conn {
  width: 34px;
  height: 24px;
  border-radius: 6px;
}

.floating-strip__dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.floating-strip__line {
  display: block;
  flex-shrink: 0;
}

.floating-strip__add {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.floating-strip__add:hover {
  background-color: var(--color-hover);
  color: var(--color-text);
  border-color: var(--color-primary);
}
</style>