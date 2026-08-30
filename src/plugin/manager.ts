/**
 * manager.ts —— 插件生命周期：装载 / 启禁用 / 错误隔离（按 manifest.id 路由）
 *
 * 与加载方式解耦：只依赖 PluginSource（可变层）。启停**不卸载代码文件**，
 * 而是不调 setup（禁用状态）、触发 onDispose + teardown（卸载清理）。
 *
 * 本模块不感知 pinia：记录快照经 onChange 订阅暴露，启停意愿经注入的 storage 持久化——
 * 便于在 vitest 中仅构造源码即测试（不依赖 localStorage / Vite glob）。
 */
import type { PluginAdapter, AideaPlugin } from './adapter'
import { SDK_VERSION } from '@/types'
import type { PluginSource, PluginSourceEntry } from './source'
import type { InternalPluginContext } from './context'
import { createPluginContext } from './context'

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
  entry: PluginSourceEntry
  /** 已加载的原始模块（读 manifest / 取 default） */
  module?: { default?: AideaPlugin; [k: string]: unknown }
  /** active 时持有的插件模块（含 setup / teardown） */
  plugin?: AideaPlugin
}

/** 启停意愿的持久化（当前由 pinia store 落地到 localStorage('aidea-plugins')） */
export interface PluginStorage {
  /** 读取"已启用集合"（id → enabled） */
  get(): Record<string, boolean>
  /** 单插件启停切换时持久化（不禁止中间态为 false 的写入） */
  set(id: string, enabled: boolean): void
}

export interface PluginManagerOptions {
  source: PluginSource
  /** 单一适配层实例，所有插件共享（无命名空间） */
  adapter: PluginAdapter
  storage: PluginStorage
}

export class PluginManager {
  private readonly source: PluginSource
  private readonly adapter: PluginAdapter
  private readonly storage: PluginStorage
  private readonly records = new Map<string, PluginRecord>()
  private readonly contexts = new Map<string, InternalPluginContext>()
  private readonly listeners = new Set<(records: PluginRecord[]) => void>()

  constructor(options: PluginManagerOptions) {
    this.source = options.source
    this.adapter = options.adapter
    this.storage = options.storage
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
    const enabledSet = this.storage.get()
    for (const entry of this.source.list()) {
      const record = await this.loadRecord(entry, enabledSet[entry.id] ?? false)
      this.records.set(record.id, record)
      if (record.enabled && record.status !== 'error') {
        await this.activate(record.id)
      }
    }
    this.emit()
  }

  /**
   * 切换启停（**仅持久化 → 重启应用生效**），不做动态卸载注册。
   * 运行时间表按启动时的 enabled 快照决定。
   */
  setEnabled(id: string, enabled: boolean): void {
    this.storage.set(id, enabled)
    const record = this.records.get(id)
    if (record) record.enabled = enabled
    this.emit()
  }

  /** 单插件装载：读 manifest 建记录（不运行 setup）。独立 try/catch 保证错误隔离。 */
  private async loadRecord(entry: PluginSourceEntry, enabled: boolean): Promise<PluginRecord> {
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
      this.contexts.delete(id)
      return
    }

    const plugin = record.module?.default
    if (!plugin || typeof plugin.setup !== 'function') {
      record.status = 'error'
      record.error = '插件模块缺少 setup（入口需默认导出 AideaPlugin）'
      this.contexts.delete(id)
      return
    }

    const context = createPluginContext(this.adapter, plugin.manifest)
    try {
      plugin.setup(context)
      record.status = 'active'
      record.error = undefined
      record.plugin = plugin
      this.contexts.set(id, context)
    } catch (e) {
      context.dispose()
      record.status = 'error'
      record.error = `setup 抛错：${toMessage(e)}`
      record.plugin = undefined
      this.contexts.delete(id)
    }
  }

  /** 卸载：触发 onDispose + teardown → 置回 installed。单插件清理异常不抛出。 */
  private deactivate(id: string): void {
    const record = this.records.get(id)
    if (!record) return

    const context = this.contexts.get(id)
    if (context) {
      context.dispose()
      this.contexts.delete(id)
    }
    try {
      record.plugin?.teardown?.()
    } catch (e) {
      console.warn('[plugin] teardown 抛错', e)
    }
    record.plugin = undefined
    record.error = undefined
    record.status = 'installed'
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