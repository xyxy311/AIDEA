<script setup lang="ts">
/**
 * FloatingWindow — 自由浮动窗口外壳（与 ModalShell 对称：模态壳 vs 浮窗壳）。
 * 定位/把手条拖动/越界钳制/层级/Teleport 均由壳负责，显隐与内容由使用方传入；
 * 不 import 任何 store/插件。
 * 拖动偏移为本地 ref（show 变 true 时 nextTick 实测尺寸并钳制，纯函数 clampFloatingOffset）；
 * z-index 1900 低于模态；不放关闭按钮（关闭语义归内容方）。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { clampFloatingOffset } from '@/utils/floatingWindow'

const props = defineProps<{
  /** 显隐（单一数据源由使用方驱动；false 卸载窗口，拖动偏移随之重置回视口中心） */
  show: boolean
  /** 把手条标题文本（可选；有才渲染，无则把手条只有拖拽面） */
  title?: string
}>()

/** 窗口根（v-if 内容；测量尺寸用，show=false 时为 null） */
const rootRef = ref<HTMLElement | null>(null)

// ── 拖动（顶部把手条整条为把手；偏移为本地状态，不进任何 store）──

/** 拖动会话：起点指针/起点偏移 + pointerdown 时缓存窗口尺寸（拖动中尺寸不变，move 只做算术钳制） */
const dragState = ref<{ px: number; py: number; ox: number; oy: number; w: number; h: number } | null>(null)
const offset = ref<{ x: number; y: number }>({ x: 0, y: 0 })

/** 偏移经 CSS 变量下发，避免 inline style 覆盖 class 的 transform */
const windowStyle = computed(() => ({
  '--float-x': `${offset.value.x}px`,
  '--float-y': `${offset.value.y}px`,
}))

/** 重测窗口尺寸并钳制偏移（show 挂载后 / resize 路径；拖动路径已缓存尺寸，不经过此函数） */
function clampWithMeasure(): void {
  const el = rootRef.value
  if (!el) return
  offset.value = clampFloatingOffset(
    window.innerWidth,
    window.innerHeight,
    el.offsetWidth,
    el.offsetHeight,
    offset.value.x,
    offset.value.y,
  )
}

function onGripPointerDown(e: PointerEvent): void {
  // pointerdown 时测量并缓存窗口尺寸（拖动中尺寸不变）；move 中只做钳制算术
  const el = rootRef.value
  dragState.value = {
    px: e.clientX,
    py: e.clientY,
    ox: offset.value.x,
    oy: offset.value.y,
    w: el?.offsetWidth ?? 0,
    h: el?.offsetHeight ?? 0,
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onGripPointerMove(e: PointerEvent): void {
  const d = dragState.value
  if (!d) return
  offset.value = clampFloatingOffset(
    window.innerWidth,
    window.innerHeight,
    d.w,
    d.h,
    d.ox + (e.clientX - d.px),
    d.oy + (e.clientY - d.py),
  )
}

function onGripPointerUp(): void {
  dragState.value = null
}

// ── 越界钳制触发点 ②③（①拖动中见 onGripPointerMove）──

// ② show 变 true：nextTick 等根节点挂载后实测尺寸再钳制；offset 为 0（首次打开）时幂等无害。
watch(
  () => props.show,
  (show) => {
    if (!show) return
    void nextTick(clampWithMeasure)
  },
  { immediate: true },
)

// ③ show=true 的窗口在视口变化后重新钳制；卸载时移除监听
function onWindowResize(): void {
  if (props.show) clampWithMeasure()
}

onMounted(() => window.addEventListener('resize', onWindowResize))
onUnmounted(() => window.removeEventListener('resize', onWindowResize))
</script>

<template>
  <Teleport to="body">
    <Transition name="plugin-float">
      <div v-if="show" ref="rootRef" class="plugin-float" :style="windowStyle">
        <!-- 顶部拖拽把手条（整条始终是把手；title 有才渲染文本，无关闭按钮——关闭由使用方内容自备） -->
        <div
          class="plugin-float__grip"
          @pointerdown="onGripPointerDown"
          @pointermove="onGripPointerMove"
          @pointerup="onGripPointerUp"
          @pointercancel="onGripPointerUp"
        >
          <span v-if="title" class="plugin-float__title">{{ title }}</span>
        </div>

        <!-- 内容区：使用方 slot 注入（错误边界等组装也在使用方） -->
        <div class="plugin-float__body">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.plugin-float {
  position: fixed;
  left: 50%;
  top: 50%;
  /* 低于模态（NModal 自 2000 起递增）：模态打开 = 独占交互，遮罩盖住浮动窗口 */
  z-index: 1900;
  width: 300px;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  user-select: none;
  /* 视口中心 + 拖动偏移（变量由 inline style 下发） */
  transform: translate(calc(-50% + var(--float-x, 0px)), calc(-50% + var(--float-y, 0px)));
  transition: opacity 0.18s ease;
  /* 高度兜底：内容再高窗口也不超出视口（全局 border-box，max-height 含 padding/border）。
     min(80vh, 640px)：80vh 保证小视口下留 20% 余量可见周边；640px 是大屏绝对上限，
     防极端内容（超长文本）把窗口撑得过于庞大。实际滚动由使用方内容自备（见 body）。 */
  max-height: min(80vh, 640px);
  /* 纵向布局：把手条固定、body 弹性收缩，使内容高度受 max-height 约束 */
  display: flex;
  flex-direction: column;
}

.plugin-float__grip {
  display: flex;
  align-items: center;
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  cursor: grab;
  /* 触屏拖动：阻止浏览器手势接管 pointer 事件流 */
  touch-action: none;
  /* 把手条是窗口 chrome，固定高度不参与收缩（收缩空间全部让给内容区） */
  flex-shrink: 0;
}

.plugin-float__grip:active {
  cursor: grabbing;
}

.plugin-float__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.plugin-float__body {
  display: flex;
  flex-direction: column;
  /* 布局由使用方内容组件自管（纯内容约定），壳层不做间距约束；
     但高度受壳 max-height 约束：flex 收缩链打通（min-height: 0 允许收缩到
     剩余空间），内容组件据此把滚动交给自己的滚动容器 */
  flex: 1 1 auto;
  min-height: 0;
  /* 最后防线：内容组件没有自备滚动容器时壳兜底滚动，保证任何内容可达
     （不用 hidden——那会裁剪出新的不可达内容）。正常使用方内容自管滚动时
     内容不溢出 body，此兜底不会出现滚动条、无感。 */
  overflow: auto;
}

/* ── 过渡动画：出入场位移与拖动偏移经 CSS 变量叠加 ── */
.plugin-float-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.plugin-float-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.plugin-float-enter-from {
  opacity: 0;
  transform: translate(calc(-50% + var(--float-x, 0px)), calc(-50% + var(--float-y, 0px))) translateY(4px);
}

.plugin-float-leave-to {
  opacity: 0;
  transform: translate(calc(-50% + var(--float-x, 0px)), calc(-50% + var(--float-y, 0px))) translateY(-2px);
}
</style>
