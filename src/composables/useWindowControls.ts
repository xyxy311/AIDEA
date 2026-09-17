/**
 * useWindowControls —— Electron 无边框窗口控制（最小化 / 最大化-还原 / 关闭）
 *
 * ⚠ 全 renderer 唯一的 `window.aideaWindow` 桥访问点（架构红线，与
 * src/plugin/sources/desktop.ts 的 window.aideaDesktop 同一模式）：
 * - web 形态无桥（undefined）→ available = false，三个动作 no-op，isMaximized 恒 false，
 *   静默降级，行为与无此文件等价；
 * - Electron preload 经 contextBridge 注入先于应用脚本执行，因此模块加载时读取一次即可，
 *   运行期无需（也不应）重复探测。
 *
 * 除本文件外，renderer 任何代码不得访问 window.aideaWindow。窗口控制按钮组是固定
 * 窗口 chrome：不登记 constants/topbar.ts 品类表、不参与 layout store 与拖拽排序——
 * 被拖走或移除会导致窗口失控（对应组件 WindowControls.vue 由 RightTopBar 固定渲染）。
 *
 * 桥契约由 Electron 侧（electron/shared/bridge.ts + preload，并行 lane）正式声明；
 * 在其类型落地前，这里用交叉类型断言局部描述桥形状——结构与契约一致，正式声明
 * （Window.aideaWindow 获得全局类型）落地后本文件无需改动即可继续编译。
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

// 模块加载时读取一次（web 形态 undefined → null；preload 注入先于应用脚本执行）
const bridge = (window as Window & { aideaWindow?: AideaWindowBridge }).aideaWindow ?? null

/** useWindowControls 的返回形状 */
export interface WindowControls {
  /** 窗口桥是否可用（Electron 桌面形态 true；web false，按钮组据此整组隐藏） */
  available: boolean
  /** 当前是否最大化（挂载时查询初值 + 订阅变更同步；无桥恒 false） */
  isMaximized: Ref<boolean>
  /** 最小化（无桥 no-op） */
  minimize(): void
  /** 最大化 / 还原切换（无桥 no-op） */
  toggleMaximize(): void
  /** 关闭（无桥 no-op） */
  close(): void
}

/**
 * 窗口控制的唯一入口，须在组件 setup 上下文调用
 * （内部注册 mounted 查询初值 / unmounted 取消订阅的生命周期）。
 */
export function useWindowControls(): WindowControls {
  const isMaximized = ref(false)

  if (bridge) {
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
  }

  return {
    available: bridge !== null,
    isMaximized,
    // 无桥时 bridge 为 null，可选链调用即 no-op
    minimize: () => bridge?.minimize(),
    toggleMaximize: () => bridge?.toggleMaximize(),
    close: () => bridge?.close(),
  }
}
