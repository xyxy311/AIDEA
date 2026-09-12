<script setup lang="ts">
/**
 * FloatingWindow — 浮动窗口公共外壳（通用件，与 ModalShell 对称：模态壳 vs 浮窗壳）
 *
 * 与 ModalShell 的分工：ModalShell 管「模态」（遮罩 / 标题栏关闭钮 / Esc / NModal），
 * 本组件管「自由浮动窗口」的壳（定位 / 拖动 / 把手条 / 转场 / 层级 / 越界钳制 / Teleport）——
 * 显隐与内容由使用方传入，壳内不感知任何业务：
 * - 显隐：由 show prop 驱动（v-if + Transition 出入场）；关闭重开回视口中心——
 *   拖动偏移是本组件本地 ref（v-if 卸载即重置），使用方无需关心位置状态；
 *   （宿主常驻渲染本组件，故位置在应用会话内跨 show 切换有记忆；不做跨会话持久化）
 * - 标题：title prop 有才渲染把手条文本；**不放关闭按钮**——浮动窗的关闭入口由
 *   使用方在内容区自备（关闭语义属于内容，不属于壳）；
 * - 拖动：顶部把手条整条可拖（pointerdown/move/up + setPointerCapture + pointercancel
 *   全套，grab/grabbing 光标）；偏移经 CSS 变量参与 transform，出入场位移可与拖动
 *   偏移叠加（原实现 inline style 覆盖 class transform 的缺陷在此修正）；
 * - 越界钳制（防拖出程序边界关不掉，程序边界 = 视口）：① 拖动中 clamp——pointerdown
 *   时测量并缓存窗口尺寸（拖动中尺寸不变），move 只做算术钳制；② show 变 true 时
 *   clamp——复用上次位置前越界检测（面板尺寸可能已变化 / 视口可能 resize 过），
 *   nextTick 等 DOM 挂载后测量 offsetWidth/offsetHeight 再钳制，offset 为 0（首次
 *   打开）时同样执行、幂等无害；③ window resize 监听——show=true 的窗口在视口变化
 *   后重新 clamp，onUnmounted 移除监听。钳制只改写 CSS 变量偏移，与 transform 结构
 *   及 plugin-float-* 转场类兼容（enter-from 的 translateY 位移与 clamp 并存不冲突）；
 *   核心算法抽纯函数 clampFloatingOffset（utils/floatingWindow.ts，可单测穷举边界；
 *   窗口尺寸为 0 的无布局环境自然退化为不限制）；
 * - 转场：plugin-float-* 出入场（迁自原 ai-word-enter/leave 泛化，类名沿用）；
 * - 层级：z-index 1900，低于模态（ModalShell → NModal，naive-ui 默认自 2000 起递增）
 *   ——模态打开 = 独占交互，其遮罩盖住浮动窗口；
 * - Teleport to body：窗口脱离任何父级 overflow/transform 上下文。
 *
 * 纯通用件：不 import 任何 store / 插件代码（对照 ModalShell 全经 props 传入），
 * 只依赖 vue、utils/floatingWindow 与样式 token（var(--color-*)）。当前使用方：
 * PluginFloatingHost（插件浮动层宿主，把 pluginFloating store 的 isVisible 映射为 show）。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { clampFloatingOffset } from '@/utils/floatingWindow'

const props = defineProps<{
  /** 显隐（单一数据源由使用方驱动；false 卸载窗口，拖动偏移随之重置回视口中心） */
  show: boolean
  /** 把手条标题文本（可选；有才渲染，无则把手条只有拖拽面） */
  title?: string
}>()

/** 窗口根（v-if 内容；测量 offsetWidth/offsetHeight 用，show=false 时为 null） */
const rootRef = ref<HTMLElement | null>(null)

// ── 拖动（顶部把手条整条为把手；偏移为本地状态，不进任何 store）──

/** 拖动会话：起点指针 / 起点偏移 + pointerdown 时缓存的窗口尺寸（拖动中尺寸不变，move 只做算术） */
const dragState = ref<{ px: number; py: number; ox: number; oy: number; w: number; h: number } | null>(null)
const offset = ref<{ x: number; y: number }>({ x: 0, y: 0 })

/** 偏移经 CSS 变量下发（transform 在 class 内统一组合，转场动画可与偏移叠加） */
const windowStyle = computed(() => ({
  '--float-x': `${offset.value.x}px`,
  '--float-y': `${offset.value.y}px`,
}))

/**
 * 重新测量窗口尺寸并钳制当前偏移（show 挂载后 / 视口 resize 路径：每次实测；
 * 拖动路径不经过此函数——尺寸已在 pointerdown 缓存）。
 */
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

// ② show 变 true：复用上次位置前越界检测（面板尺寸可能已变化 / 视口可能 resize 过）；
// nextTick 等 v-if 根节点挂载（DOM 挂载、尺寸最新）后测量 + 钳制。offset 为 0（首次
// 打开）时同样执行——在界内钳制结果不变，幂等无害。
watch(
  () => props.show,
  (show) => {
    if (!show) return
    void nextTick(clampWithMeasure)
  },
  { immediate: true },
)

// ③ show=true 的窗口在视口变化后重新 clamp（防止 resize 后窗口出界）；卸载时移除监听
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
  /* 布局由使用方内容组件自管（纯内容约定），壳层不做间距/尺寸约束 */
}

/* ── 过渡动画（原 ai-word-enter/leave 泛化改名；位移与拖动偏移经变量叠加） ── */
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
