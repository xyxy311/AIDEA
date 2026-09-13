/**
 * manager.ts —— 插件「加载 + 生命周期」单一模块
 *
 * 合并原 source.ts（静态 glob 收集）与 context.ts（上下文组装），收敛过度抽象的接口：
 * - 插件收集收口在 sources/（builtin 编译期 glob + desktop 桥扫描），本模块经
 *   `export { collectPluginEntries } from './sources'` 暴露 Promise 形式聚合；
 *   装载本身测试可注入假 entries，不依赖 Vite glob。
 * - 启停意愿经 `getEnabled` 回调只读进入（持久化写入是 store 专属职责）。
 * - 启停**不卸载代码文件**，而是不调 setup（禁用状态）；setup 抛错走 onDispose → dispose() 回滚（活路径）。
 *
 * 本模块不感知 pinia：记录快照经 onChange 订阅暴露，启停意愿经注入的 getEnabled 读取——
 * 便于在 vitest 中仅构造源码即测试（不依赖 localStorage / Vite glob）。
 */
import type { AideaPlugin, PluginContext, PluginManifest } from './adapter'
import { SDK_VERSION } from '@/types/plugin'
import { createPluginRegister, createPluginModalApi, createPluginFloatingApi, rollbackPluginUi } from './ui'

/** 单个待装载插件：id（manifest 路由键）+ loader（取插件模块）。这是内部/注入的装载项。 */
export interface PluginEntry {
  id: string
  loader: () => Promise<{ default?: AideaPlugin; [k: string]: unknown }>
  /** 来源标记：builtin=随包内置（聚合层填充）；local=桌面本地目录（desktop 源填充） */
  source?: 'builtin' | 'local'
}

// 内置源提供 pluginIdFromPath 的唯一定义（本模块 re-export 保持既有测试引用不变）
export { pluginIdFromPath } from './sources/builtin'

// 插件收集的聚合收口：内置源 ∪ 桌面本地源（id 冲突内置优先），见 sources/index.ts
export { collectPluginEntries } from './sources'

/** PluginContext 内部形态：额外携带触发全部 onDispose 回调的 dispose() */
interface InternalPluginContext extends PluginContext {
  /** 卸载：依次执行插件经 onDispose 注册的所有清理函数（单条抛错不影响其余） */
  dispose(): void
}

/** 组装 PluginContext：注入注册面 / 模态与浮动层运行时（plugin/ui.ts）+ manifest，收集 onDispose 清理函数 */
function createPluginContext(manifest: PluginManifest): InternalPluginContext {
  const disposers: Array<() => void> = []

  return {
    manifest,
    onDispose(fn: () => void): void {
      disposers.push(fn)
    },
    register: createPluginRegister(manifest.id),
    // 模态运行时：open 收短 id，先查登记表（未登记 → warn + false）再拼 `${pluginId}:${id}`；
    // teardown 后误调无需失效——入口校验直接拒绝（运行期注册表不变，见 createPluginModalApi 注释）
    modal: createPluginModalApi(manifest.id),
    // 浮动层运行时：open/toggle 同样收短 id 先查登记表（fail fast），close/isVisible 幂等只读；
    // 与 modal 同工厂模式，语义见 createPluginFloatingApi 注释
    floating: createPluginFloatingApi(manifest.id),
    dispose(): void {
      for (const fn of disposers.splice(0)) {
        try {
          fn()
        } catch (e) {
          // 单条清理函数抛错不阻断其余清理
          console.warn('[plugin] onDispose 回调抛错', e)
        }
      }
    },
  }
}

/** 插件运行时状态：installed=已安装但未启用 / active=运行中 / error=装载或启用失败 */
export type PluginStatus = 'installed' | 'active' | 'error'

/** 插件运行时记录（管理面板渲染的单一数据源） */
export interface PluginRecord {
  id: string
  name: string
  version: string
  description: string
  /** 已解析的清单作者 */
  author: string
  /** 生命周期状态 */
  status: PluginStatus
  /** 持久化"启用意愿"；active 需要 enabled=true（启停经重启应用生效） */
  enabled: boolean
  /** 来源：builtin=随包内置；local=桌面本地目录（plugins 目录扫描） */
  source: 'builtin' | 'local'
  /** 错误态下的单插件错误信息 */
  error?: string
  /** 源提供的装载入口 */
  entry: PluginEntry
  /** 已加载的原始模块（读 manifest / 取 default） */
  module?: { default?: AideaPlugin; [k: string]: unknown }
}

export interface PluginManagerOptions {
  /** 装载候选集合（测试可注入假 entries） */
  entries: PluginEntry[]
  /** 只读的"已启用集合"（id → enabled），持久化写入是 store 专属职责 */
  getEnabled: () => Record<string, boolean>
}

export class PluginManager {
  private readonly entries: PluginEntry[]
  private readonly getEnabled: () => Record<string, boolean>
  private readonly records = new Map<string, PluginRecord>()
  private readonly listeners = new Set<(records: PluginRecord[]) => void>()

  constructor(options: PluginManagerOptions) {
    this.entries = options.entries
    this.getEnabled = options.getEnabled
  }

  /** 订阅记录快照变化（返回取消订阅函数） */
  onChange(fn: (records: PluginRecord[]) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getRecords(): PluginRecord[] {
    return [...this.records.values()]
  }

  /** 引导装载：扫描全部插件，启用启用的调 setup（单插件失败仅置 error，不影响其他） */
  async installAll(): Promise<void> {
    const enabledSet = this.getEnabled()
    for (const entry of this.entries) {
      const record = await this.loadRecord(entry, enabledSet[entry.id] ?? false)
      this.records.set(record.id, record)
      if (record.enabled && record.status !== 'error') {
        await this.activate(record.id)
      }
    }
    this.emit()
  }

  /**
   * 切换启停（**仅更新启用意愿 → 重启应用生效**），不做动态卸载注册。
   * 运行时间表按启动时的 getEnabled 快照决定。
   */
  setEnabled(id: string, enabled: boolean): void {
    const record = this.records.get(id)
    if (record) record.enabled = enabled
    this.emit()
  }

  /** 单插件装载：读 manifest 建记录（不运行 setup）。独立 try/catch 保证错误隔离。 */
  private async loadRecord(entry: PluginEntry, enabled: boolean): Promise<PluginRecord> {
    const base: PluginRecord = {
      id: entry.id,
      name: entry.id,
      version: '',
      description: '',
      author: '',
      status: 'installed',
      enabled,
      entry,
      // source 由装载入口透传；未经聚合层注入的条目（测试直构）按内置兜底
      source: entry.source ?? 'builtin',
    }
    try {
      const mod = await entry.loader()
      const manifest = mod.default?.manifest
      if (!manifest || !manifest.id) {
        return { ...base, status: 'error', error: '无效的插件清单（缺少 manifest.id）' }
      }
      if (manifest.id !== entry.id) {
        return {
          ...base, // 保留装载源 id（=entry.id）作为路由键
          name: manifest.name ?? manifest.id,
          version: manifest.version ?? '',
          description: manifest.description ?? '',
          author: manifest.author ?? '',
          status: 'error',
          error: `插件 id(${manifest.id}) 与装载源(${entry.id})不匹配`,
        }
      }
      return {
        ...base,
        id: manifest.id,
        name: manifest.name ?? manifest.id,
        version: manifest.version ?? '',
        description: manifest.description ?? '',
        author: manifest.author ?? '',
        module: mod,
      }
    } catch (e) {
      return { ...base, status: 'error', error: toMessage(e) }
    }
  }

  /** 激活：SDK 版本校验 → 建上下文 → 调 setup。失败置 error 并清理。 */
  private async activate(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) return

    const manifest = record.module?.default?.manifest
    if (manifest && manifest.sdkVersion !== SDK_VERSION) {
      record.status = 'error'
      record.error = `SDK 版本不匹配：插件需要 ${manifest.sdkVersion ?? '？'}，当前 ${SDK_VERSION}`
      return
    }

    const plugin = record.module?.default
    if (!plugin || typeof plugin.setup !== 'function') {
      record.status = 'error'
      record.error = '插件模块缺少 setup（入口需默认导出 AideaPlugin）'
      return
    }

    const context = createPluginContext(plugin.manifest)
    try {
      plugin.setup(context)
      record.status = 'active'
      record.error = undefined
    } catch (e) {
      context.dispose()
      // 回滚 setup 半程已注册的 UI（防半激活插件残留面板/按钮/设置栏目）
      rollbackPluginUi(record.id)
      record.status = 'error'
      record.error = `setup 抛错：${toMessage(e)}`
    }
  }

  private emit(): void {
    const snapshot = this.getRecords()
    for (const fn of this.listeners) {
      fn(snapshot)
    }
  }
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}