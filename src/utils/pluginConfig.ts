/**
 * 插件配置持久化（纯 localStorage 层，不 import store）。
 * 每插件一个独立文件 `aidea-plugin-config.<pluginId>`，结构为 { version, data, shortcuts }；
 * shortcuts 存插件快捷键动作的用户覆盖（不再混存主应用快捷键），随插件独立保存。
 * 自愈对齐 presets resetStorage：坏 JSON / 结构不符 → removeItem + 回退默认。
 */

/** 插件配置存储 key 前缀（完整 key = `${STORAGE_PREFIX}${pluginId}`） */
const STORAGE_PREFIX = 'aidea-plugin-config.'
/** 旧版快捷键覆盖混存 key（迁移源） */
const LEGACY_BINDINGS_KEY = 'aidea-shortcuts'

/** 插件配置文件结构（持久化单文件） */
export interface PluginConfigFile {
  version: 1
  /** 插件自定义配置（plugin/api/config 的 data 段） */
  data: Record<string, unknown>
  /** 插件快捷键动作的用户覆盖（key = 动作短 id，value = 规范化 chord） */
  shortcuts: Record<string, string>
}

/** 某插件的配置存储 key */
function storageKey(pluginId: string): string {
  return `${STORAGE_PREFIX}${pluginId}`
}

/** 默认空文件 */
function emptyConfigFile(): PluginConfigFile {
  return { version: 1, data: {}, shortcuts: {} }
}

/**
 * 结构校验：version===1、data/shortcuts 为键值对象（排除数组）、shortcuts 值全为 string。
 * data 段值为任意 JSON，不做逐值校验。
 */
function isValidConfigFile(value: unknown): value is PluginConfigFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Record<string, unknown>
  if (file.version !== 1) return false
  if (typeof file.data !== 'object' || file.data === null || Array.isArray(file.data)) return false
  if (typeof file.shortcuts !== 'object' || file.shortcuts === null || Array.isArray(file.shortcuts)) return false
  return Object.values(file.shortcuts).every((v) => typeof v === 'string')
}

/**
 * 读某插件配置：文件缺失回退空文件；坏 JSON / 结构不符 → removeItem + 回退空文件。
 */
export function readPluginConfig(pluginId: string): PluginConfigFile {
  const key = storageKey(pluginId)
  let parsed: unknown
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return emptyConfigFile()
    parsed = JSON.parse(raw)
  } catch {
    // 坏 JSON：删文件并回退默认
    localStorage.removeItem(key)
    return emptyConfigFile()
  }
  if (!isValidConfigFile(parsed)) {
    localStorage.removeItem(key)
    return emptyConfigFile()
  }
  return parsed
}

/** 写某插件配置（整文件覆盖写） */
export function writePluginConfig(pluginId: string, cfg: PluginConfigFile): void {
  localStorage.setItem(storageKey(pluginId), JSON.stringify(cfg))
}

/**
 * 一次性存量迁移：把旧混存在 aidea-shortcuts（`${pluginId}:${actionId}` 条目）的插件覆盖
 * 搬入各插件文件，aidea-shortcuts 写回仅含内置覆盖的裁剪版（坏 JSON 场景写回空对象）。
 * 须在 shortcuts store 的覆盖读取与 validate 之前调用，否则 validate 丢弃规则会误删存量。
 */
export function migrateShortcutOverrides(): void {
  // 1. 读旧混存（解析失败 / 结构不符按空处理）
  let raw: string | null = null
  let legacy: Record<string, unknown> = {}
  try {
    raw = localStorage.getItem(LEGACY_BINDINGS_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) legacy = parsed as Record<string, unknown>
    }
  } catch {
    legacy = {}
  }

  // 2. 拆分：含 ':' 的条目按首个 ':' 分为 pluginId / actionId
  const moved: Record<string, Record<string, string>> = {}
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(legacy)) {
    const idx = key.indexOf(':')
    if (idx > 0) {
      const pluginId = key.slice(0, idx)
      const actionId = key.slice(idx + 1)
      ;(moved[pluginId] ??= {})[actionId] = String(value)
    } else {
      kept[key] = String(value)
    }
  }

  // 3. 合并写入各插件文件（迁移值优先：同 actionId 覆盖该插件已有 shortcuts 条目）
  for (const [pluginId, shortcuts] of Object.entries(moved)) {
    const cfg = readPluginConfig(pluginId)
    cfg.shortcuts = { ...cfg.shortcuts, ...shortcuts }
    writePluginConfig(pluginId, cfg)
  }

  // 4. 写回裁剪版：仅当旧文件存在时执行（无文件不凭空创建；坏 JSON 写回空对象自愈）
  if (raw !== null) {
    localStorage.setItem(LEGACY_BINDINGS_KEY, JSON.stringify(kept))
  }
}
