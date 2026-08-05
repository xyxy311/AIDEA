<script setup lang="ts">
/**
 * ContextMenu - 右键上下文菜单组件
 *
 * 以 position:fixed 定位在视口坐标 (x, y) 处，
 * 超出视口边界时自动翻转方向。
 * 使用 Teleport 渲染到 body 避免被父级 overflow:hidden 裁切。
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import type { ContextMenuItem } from '@/composables/useContextMenu'

// ── Props ──
const props = defineProps<{
  visible: boolean
  /** 浏览器视口坐标 clientX */
  x: number
  /** 浏览器视口坐标 clientY */
  y: number
  /** 菜单项列表 */
  items: ContextMenuItem[]
}>()

// ── Emits ──
const emit = defineEmits<{
  select: [item: ContextMenuItem]
  close: []
}>()

// ── Refs ──
/** 菜单 DOM 元素引用，用于尺寸测量和外部点击判断 */
const menuRef = ref<HTMLElement | null>(null)

/** 翻转后的定位样式 */
const positionStyle = ref({ left: '0px', top: '0px' })

// ── 事件处理 ──

/** 点击菜单项：非 disabled 时 emit select 和 close */
function handleItemClick(item: ContextMenuItem): void {
  if (item.disabled) return
  emit('select', item)
  emit('close')
}

/**
 * 边界翻转计算
 *
 * 测量菜单实际尺寸，若超出视口右侧则向左展开（left 对齐右边界），
 * 若超出视口底部则向上展开（top 对齐下边界）。
 * 保留 8px 边距避免贴边。
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

// ── 生命周期与监听 ──

/**
 * 监听 visible / x / y 变化：
 * - visible 变为 true 时，测量并计算翻转后的位置
 * - x/y 变化时重新计算位置
 * 同时添加/移除全局事件监听
 */
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

/** 组件卸载时清理全局事件 */
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
        <div
          v-for="item in items"
          :key="item.key"
          class="context-menu-item"
          :class="{
            'context-menu-item--disabled': item.disabled,
            'context-menu-item--danger': item.danger,
          }"
          @click="handleItemClick(item)"
        >
          <!-- 图标（约 16px） -->
          <component
            :is="item.icon"
            v-if="item.icon"
            class="context-menu-item__icon"
          />
          <span class="context-menu-item__label">{{ item.label }}</span>
        </div>
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
  /* 防止菜单内容溢出圆角 */
  overflow: hidden;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.12s ease;
  white-space: nowrap;
}

.context-menu-item:hover:not(.context-menu-item--disabled) {
  background-color: var(--color-bg);
}

.context-menu-item--disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.context-menu-item--danger {
  color: var(--color-danger);
}

.context-menu-item--danger:hover:not(.context-menu-item--disabled) {
  background-color: var(--color-bg);
}

.context-menu-item__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.context-menu-item__label {
  flex: 1;
}

/* ── 过渡动画 ── */
/* 淡入 + 轻微上移 */
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
