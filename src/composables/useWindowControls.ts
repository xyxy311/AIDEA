/**
 * useWindowControls —— Electron 无边框窗口控制的唯一 renderer 访问点（架构红线）。
 * preload 桥 window.aideaWindow 恒存在，模块加载时读取一次；窗口按钮不登记 topbar 品类表、
 * 不参与 layout（被拖走/移除会导致窗口失控），由 RightTopBar 固定渲染 WindowControls.vue。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** 窗口控制桥的最小形状（与 Electron preload 注入的 window.aideaWindow 契约一致） */
interface AideaWindowBridge {
  /** 最小化窗口 */
  minimize(): void
  /** 最大化 / 还原切换 */
  toggleMaximize(): void
  /** 关闭窗口（关闭前确认等策略由 main 侧决定） */
  close(): void
  /** 查询当前是否最大化 */
  isMaximized(): Promise<boolean>
  /** 订阅最大化状态变更（如系统标题栏双击、Win+Up 等）；返回取消订阅函数 */
  onMaximizedChange(cb: (maximized: boolean) => void): () => void
}

// 纯桌面形态恒存在：模块加载时读取一次（preload 注入先于应用脚本执行）
const bridge = (window as unknown as { aideaWindow: AideaWindowBridge }).aideaWindow

/** useWindowControls 的返回形状 */
export interface WindowControls {
  /** 当前是否最大化（挂载时查询初值 + 订阅变更同步） */
  isMaximized: Ref<boolean>
  /** 最小化 */
  minimize(): void
  /** 最大化 / 还原切换 */
  toggleMaximize(): void
  /** 关闭 */
  close(): void
}

/**
 * 窗口控制的唯一入口，须在组件 setup 上下文调用
 * （内部注册 mounted 查询初值 / unmounted 取消订阅的生命周期）。
 */
export function useWindowControls(): WindowControls {
  const isMaximized = ref(false)

  // 挂载时查询初值（IPC 异步）+ 订阅后续变更；卸载时取消订阅防泄漏
  onMounted(async () => {
    try {
      isMaximized.value = await bridge.isMaximized()
    } catch (e) {
      // IPC 失败不阻塞 UI：保持 false（未最大化是安全默认），仅记录便于排查
      console.error('[window] 查询窗口最大化状态失败', e)
    }
  })
  const unsubscribe = bridge.onMaximizedChange((maximized) => {
    isMaximized.value = maximized
  })
  onUnmounted(() => unsubscribe())

  return {
    isMaximized,
    minimize: () => bridge.minimize(),
    toggleMaximize: () => bridge.toggleMaximize(),
    close: () => bridge.close(),
  }
}