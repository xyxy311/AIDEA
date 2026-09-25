<script setup lang="ts">
/**
 * ContextMenu - 右键上下文菜单：position:fixed 定位在视口坐标，超出边界自动翻转；
 * 经 Teleport 到 body 避免被父级 overflow 裁切；父级项 hover 展开任意层子菜单，
 * 递归组件仅叶子项触发 select/close。
 */
import {
  ref,
  watch,
  nextTick,
  onUnmounted,
  onMounted,
  defineComponent,
  h,
} from 'vue'
import type { PropType, VNode } from 'vue'
import type { ContextMenuItem } from '@/composables/useContextMenu'

// ── Props ──
const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

// ── Emits ──
const emit = defineEmits<{
  select: [item: ContextMenuItem]
  close: []
}>()

// ── Refs ──
/** 菜单 DOM 元素引用 */
const menuRef = ref<HTMLElement | null>(null)

/** 翻转后的定位样式 */
const positionStyle = ref({ left: '0px', top: '0px' })

// ── 事件处理 ──
/** 点击菜单项：disabled 不响应；父级项只负责展开子菜单，叶子项才 select + close */
function handleItemClick(item: ContextMenuItem): void {
  if (item.disabled) return
  if (item.children && item.children.length > 0) return
  emit('select', item)
  emit('close')
}

/**
 * 边界翻转：测量菜单实际尺寸，超出视口右侧/底部则向左/上展开（保留 8px 边距）。
 */
function updatePosition(): void {
  if (!menuRef.value) return
  const rect = menuRef.value.getBoundingClientRect()
  const { innerWidth, innerHeight } = window
  let adjustedX = props.x
  let adjustedY = props.y

  // 超出右侧 → 向左展开
  if (adjustedX + rect.width > innerWidth - 8) {
    adjustedX = Math.max(8, innerWidth - rect.width - 8)
  }
  // 超出底部 → 向上展开
  if (adjustedY + rect.height > innerHeight - 8) {
    adjustedY = Math.max(8, innerHeight - rect.height - 8)
  }

  positionStyle.value = {
    left: `${adjustedX}px`,
    top: `${adjustedY}px`,
  }
}

/** 点击菜单外部 → emit close */
function onDocumentMouseDown(e: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

/** 按 Escape → emit close */
function onDocumentKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
  }
}

// ── 递归子菜单渲染 ──
// 子菜单始终挂载但默认 visibility:hidden，父项 hover 时显示（避免切换挂载、仅在挂载时测翻转）。

/* eslint-disable @typescript-eslint/no-unused-vars */
let SubMenu: ReturnType<typeof defineComponent>
/* eslint-enable @typescript-eslint/no-unused-vars */

/** 渲染单个菜单项（含其下的子菜单容器） */
function renderMenuItem(item: ContextMenuItem): VNode {
  const hasChildren = !!(item.children && item.children.length > 0)
  return h(
    'div',
    {
      class: [
        'context-menu-item',
        { 'context-menu-item--disabled': item.disabled },
        { 'context-menu-item--danger': item.danger },
      ],
      onClick: () => handleItemClick(item),
    },
    [
      item.icon ? h(item.icon, { class: 'context-menu-item__icon' }) : null,
      h('span', { class: 'context-menu-item__label' }, item.label),
      hasChildren
        ? h('span', { class: 'context-menu-item__arrow' }, '▸')
        : null,
      hasChildren
        ? h(SubMenu, { items: item.children as ContextMenuItem[] })
        : null,
    ],
  )
}

SubMenu = defineComponent({
  name: 'SubMenu',
  props: {
    items: { type: Array as PropType<ContextMenuItem[]>, required: true },
    /** 最外层列表不参与子菜单翻转定位 */
    isRoot: { type: Boolean, default: false },
  },
  setup(subProps) {
    const listRef = ref<HTMLElement | null>(null)
    const flip = ref({ x: false, y: false })

    /** 测量子菜单是否超出视口右/下边缘，超出则向左/上翻转（8px 边距） */
    function calcFlip(): void {
      const el = listRef.value
      if (!el || subProps.isRoot) return
      const rect = el.getBoundingClientRect()
      const { innerWidth, innerHeight } = window
      flip.value = {
        x: rect.right > innerWidth - 8,
        y: rect.bottom > innerHeight - 8,
      }
    }

    onMounted(calcFlip)

    return () =>
      h(
        'div',
        {
          ref: listRef,
          class: [
            subProps.isRoot ? 'context-menu__list' : 'context-menu-sub',
            { 'context-menu-sub--flip-x': !subProps.isRoot && flip.value.x },
            { 'context-menu-sub--flip-y': !subProps.isRoot && flip.value.y },
          ],
        },
        subProps.items.map((item) => renderMenuItem(item)),
      )
  },
})

// ── 生命周期与监听 ──
/** visible/x/y 变化时测量并计算位置；同步添加/移除全局事件监听 */
watch(
  [() => props.visible, () => props.x, () => props.y],
  ([visible]) => {
    if (visible) {
      // 等 DOM 渲染完成后测量实际尺寸
      nextTick(updatePosition)
      document.addEventListener('mousedown', onDocumentMouseDown)
      document.addEventListener('keydown', onDocumentKeyDown)
    } else {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  },
)

/** 卸载时清理全局事件 */
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu"
        :style="positionStyle"
      >
        <!-- 递归渲染菜单项 -->
        <SubMenu :items="items" is-root />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  min-width: 160px;
  padding: 4px 0;
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  font-size: 14px;
  user-select: none;
  overflow: visible; /* 子菜单绝对定位向右展开，需允许溢出 */
}

/* 以下元素由 render 函数 h() 动态创建（非模板元素），无 scopeId，统一用 :deep(...) 穿透 */
:deep(.context-menu-item) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.12s ease;
  white-space: nowrap;
}

:deep(.context-menu-item:hover:not(.context-menu-item--disabled)) {
  background-color: var(--color-bg);
}

:deep(.context-menu-item--disabled) {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

:deep(.context-menu-item--danger) {
  color: var(--color-danger);
}

:deep(.context-menu-item--danger:hover:not(.context-menu-item--disabled)) {
  background-color: var(--color-bg);
}

:deep(.context-menu-item__icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.context-menu-item__label) {
  flex: 1;
}

/* 展开箭头（父级项右侧） */
:deep(.context-menu-item__arrow) {
  flex-shrink: 0;
  margin-left: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 子菜单容器：默认隐藏、父项 hover 时显示；向右展开并按需翻转 */
:deep(.context-menu-sub) {
  position: absolute;
  left: 100%;
  top: 0;
  padding: 4px 0;
  min-width: 160px;
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  z-index: 1;
  font-size: 14px;
  /* 默认隐藏保持布局以利测量 */
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

:deep(.context-menu-item:hover > .context-menu-sub),
:deep(.context-menu-item:focus-within > .context-menu-sub) {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

/* 超出视口右侧 → 向左翻转 */
:deep(.context-menu-sub--flip-x) {
  left: auto;
  right: 100%;
}

/* 超出视口底部 → 向上翻转 */
:deep(.context-menu-sub--flip-y) {
  top: auto;
  bottom: 0;
}

/* ── 过渡动画：淡入 + 轻微上移 ── */
.context-menu-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.context-menu-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.context-menu-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.context-menu-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
</style>