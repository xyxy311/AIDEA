/**
 * manager.ts —— 插件「加载 + 生命周期」单一模块
 *
 * 合并原 source.ts（静态 glob 收集）与 context.ts（上下文组装），收敛过度抽象的接口：
 * - 踩点收集（`collectPluginEntries`）在模块内完成并产出 `PluginEntry[]`；
 *   测试可注入假 entries，不依赖 Vite glob。
 * - 启停意愿经 `getEnabled` 回调只读进入（持久化写入是 store 专属职责）。
 * - 启停**不卸载代码文件**，而是不调 setup（禁用状态）；setup 抛错走 onDispose → dispose() 回滚（活路径）。
 *
 * 本模块不感知 pinia：记录快照经 onChange 订阅暴露，启停意愿经注入的 getEnabled 读取——
 * 便于在 vitest 中仅构造源码即测试（不依赖 localStorage / Vite glob）。
 */
import type { PluginAdapter, AideaPlugin, PluginContext, PluginManifest } from './adapter'
import { SDK_VERSION } from '@/types/plugin'

/** 单个待装载插件：id（manifest 路由键）+ loader（取插件模块）。这是内部/注入的装载项。 */
export interface PluginEntry {
  id: string
  loader: () => Promise<{ default?: AideaPlugin; [k: string]: unknown }>
}

/** 从编译期路径推断插件 id：取 `…/<name>/index.ts` 中的 <name> */
export function pluginIdFromPath(path: string): string {
  const match = /([^/]+)\/index\.(ts|js|vue)$/.exec(path)
  return match ? match[1] : path
}

/**
 * 编译期 glob 收集 `../../plugins/**` 各插件入口，产出 `PluginEntry[]`。
 * loader 惰性 `import` 对应模块，与 Vue 组件一样受 dev HMR 监看。
 */
export function collectPluginEntries(): PluginEntry[] {
  const modules = import.meta.glob('../../plugins/**/index.{ts,js}')
  return Object.entries(modules).map(([path, loader]) => ({
    id: pluginIdFromPath(path),
    loader: loader as PluginEntry['loader'],
  }))
}

/** PluginContext 内部形态：额外携带触发全部 onDispose 回调的 dispose() */
interface InternalPluginContext extends PluginContext {
  /** 卸载：依次执行插件经 onDispose 注册的所有清理函数（单条抛错不影响其余） */
  dispose(): void
}

/** 组装 PluginContext：注入共享适配层 + manifest，收集 onDispose 清理函数 */
function createPluginContext(adapter: PluginAdapter, manifest: PluginManifest): InternalPluginContext {
  const disposers: Array<() => void> = []

  return {
    adapter,
    manifest,
    onDispose(fn: () => void): void {
      disposers.push(fn)
    },
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
  /** 单一适配层实例，所有插件共享（无命名空间） */
  adapter: PluginAdapter
  /** 只读的"已启用集合"（id → enabled），持久化写入是 store 专属职责 */
  getEnabled: () => Record<string, boolean>
}

export class PluginManager {
  private readonly entries: PluginEntry[]
  private readonly adapter: PluginAdapter
  private readonly getEnabled: () => Record<string, boolean>
  private readonly records = new Map<string, PluginRecord>()
  private readonly listeners = new Set<(records: PluginRecord[]) => void>()

  constructor(options: PluginManagerOptions) {
    this.entries = options.entries
    this.adapter = options.adapter
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

    const context = createPluginContext(this.adapter, plugin.manifest)
    try {
      plugin.setup(context)
      record.status = 'active'
      record.error = undefined
    } catch (e) {
      context.dispose()
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