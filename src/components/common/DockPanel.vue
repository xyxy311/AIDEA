<script setup lang="ts">
/**
 * DockPanel — 通用面板外壳组件（唯一面板包裹层）
 *
 * 左侧面板区、右侧 dock、活动栏图标均复用本组件来承载「面板外壳」职责：
 * - 标题栏显隐（showHeader）
 * - 活动栏图标（从 uiRegistry 登记总表读取，与 ActivityBar 同源）
 * - 标题（默认从登记条目 titleKey / 插件 title 读取，可用 title prop 覆盖）
 * - 关闭按钮显隐（showClose）
 * - 拖拽手柄（draggable），用于换位 / 跨容器移动
 * - 边距与滚动（NScrollbar x-scrollable）
 *
 * 面板内容组件由 uiRegistry 登记录入的条目 component 提供（纯内容，无自带 header），
 * 本组件不直接持有面板业务逻辑。
 *
 * 本组件不直接调用布局 store，拖拽与关闭都 emit 给父级处理，保持通用性。
 */
import { computed } from 'vue'
import { NButton, NScrollbar } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'
import { type PanelKey } from '@/constants/panels'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { t } from '@/composables/useT'
import PluginErrorBoundary from '@/components/plugin/PluginErrorBoundary.vue'

const props = withDefaults(
  defineProps<{
    /** 面板 id（内置面板 id 或插件面板 key） */
    panelId: PanelKey
    /** 是否显示标题栏，默认 true */
    showHeader?: boolean
    /** 是否显示关闭按钮，默认 true */
    showClose?: boolean
    /** 是否显示拖拽手柄（可拖拽），默认 true */
    draggable?: boolean
    /** 覆盖标题（默认从品类表 titleKey / 插件 title 读取） */
    title?: string
    /** 覆盖关闭按钮 tooltip（默认「关闭面板」；左侧单面板区传「收起面板」） */
    closeHint?: string
  }>(),
  {
    showHeader: true,
    showClose: true,
    draggable: true,
    title: undefined,
    closeHint: undefined,
  },
)

const emit = defineEmits<{
  (e: 'dragStart', panelId: PanelKey, ev: DragEvent): void
  (e: 'close', panelId: PanelKey): void
}>()

/** uiRegistry 登记总表（内置已 seed，插件注册进同一张表）——icon / 标题 / 内容组件单一来源 */
const registry = useUiRegistryStore()
const meta = computed(() => registry.panels.get(props.panelId))

/** 解析标题：优先 prop 覆盖，否则插件 title 字符串，再否则内置 titleKey i18n */
const title = computed(
  () =>
    props.title ??
    meta.value?.title ??
    (meta.value?.titleKey ? t(meta.value.titleKey) : ''),
)

/** 关闭按钮 tooltip：优先 prop 覆盖，否则默认「关闭面板」 */
const closeHint = computed(() => props.closeHint ?? t('dock.closePanel'))

/** 关闭按钮点击 → 触发 close 事件 */
function onClose(): void {
  emit('close', props.panelId)
}
</script>

<template>
  <div class="dock-panel">
    <div v-if="showHeader" class="dock-panel-header">
      <span
        v-if="draggable"
        class="drag-handle"
        draggable="true"
        title="拖拽以移动面板"
        @dragstart.stop="emit('dragStart', panelId, $event)"
        @click.stop
      >
        ⋮⋮
      </span>
      <component :is="meta?.icon" class="panel-icon" />
      <span class="dock-panel-title">{{ title }}</span>
      <NButton
        v-if="showClose !== false"
        class="dock-panel-close"
        size="tiny"
        quaternary
        :title="closeHint"
        @click="onClose"
      >
        <template #icon>
          <CloseOutline />
        </template>
      </NButton>
    </div>
    <div class="dock-panel-body">
      <NScrollbar x-scrollable class="dock-panel-scroll">
        <!-- 插件面板外包错误边界，渲染异常隔离到占位，不拖垮整体 -->
        <PluginErrorBoundary
          v-if="meta?.pluginId"
          :plugin-id="meta.pluginId"
          :name="meta?.title ?? (meta?.titleKey ? t(meta.titleKey) : '')"
        >
          <component :is="meta?.component" />
        </PluginErrorBoundary>
        <component v-else :is="meta?.component" />
      </NScrollbar>
    </div>
  </div>
</template>

<style scoped>
.dock-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dock-panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 4px;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  flex-shrink: 0;
}

/* 活动栏图标（与 ActivityBar 同源，小号展示） */
.panel-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.dock-panel-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.dock-panel-close {
  flex-shrink: 0;
}

.dock-panel-body {
  flex: 1;
  min-height: 0;
  /* 高度不足时由内部 NScrollbar 滚动（纵向默认 + 横向 x-scrollable） */
  overflow: hidden;
}

/* NScrollbar 撑满 body 高度，便于内容滚动 */
.dock-panel-scroll {
  height: 100%;
}

/* 拖拽手柄样式（仿 DraggableSortList 的 .drag-handle） */
.drag-handle {
  cursor: grab;
  color: var(--color-text-muted);
  font-size: 14px;
  letter-spacing: -3px;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}

.drag-handle:hover {
  color: var(--color-text-secondary);
}

.drag-handle:active {
  cursor: grabbing;
}
</style>