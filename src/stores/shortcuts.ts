/**
 * 快捷键 Store
 *
 * 职责：
 * - 保存用户对可自定义动作的覆盖绑定（仅存覆盖，未覆盖回退默认）
 * - 序号修饰键（seqModKey，默认 't'）：决定 "1-9" 是应用预设还是打标签
 * - 持久化到 localStorage，并进行自愈（坏值/非法/冗余条目回退默认、清理冲突）
 * - assign(id, chord)：冲突校验（全局唯一），冲突则拒绝并返回冲突方
 * - reset(id) / resetAll()：恢复默认
 *
 * 纯字符串表示：值为 utils/shortcuts.ts 的规范化 chord 字符串。
 *
 * 冲突检测覆盖三处：
 *   1. assign：候选键与锁定键（RESERVED_CHORDS）冲突 → 拒绝
 *   2. assign：候选裸单键与序号修饰键冲突 → 拒绝
 *   3. setSeqModKey：序号修饰键与锁定键单键或自定义动作裸单键冲突 → 拒绝
 *
 * 插件动作合并：uiRegistry.shortcutActions 中的插件动作（key = `${pluginId}:${id}`）
 * 并入有效绑定表（有 defaultChord 的作默认，覆盖优先）；assign 的冲突校验范围同样
 * 覆盖插件动作。
 *
 * 插件覆盖存储路由（本 store 只路由不托管）：含 ':' 的覆盖条目由 pluginConfig 独立
 * 存储（`aidea-plugin-config.<pluginId>.shortcuts`，key = 动作短 id），不混存本 store
 * 的内置覆盖持久化（aidea-shortcuts）——插件禁用/重启期间覆盖随插件文件保留，重装
 * 自动恢复：
 *   - setup 顶部先跑 migrateShortcutOverrides()（须先于 overrides 的 useStorage 读取，
 *     否则旧混存条目会先被读入内存、经 validate/写回污染回归）；
 *   - validate 丢弃 overrides 中含 ':' 的残留条目（本 key 只承载内置覆盖，插件覆盖
 *     独立存储且不受本 validate 影响）；
 *   - bindings 合并各插件文件的 shortcuts 段（`${pluginId}:${actionId}` 归属，与默认
 *     表未知 key 同规则过滤）；
 *   - assign / reset / resetAll 按首个 ':' 路由：插件动作写 pluginConfig，内置动作写
 *     本 overrides；resetAll 同时清两源（含未启用插件）。
 */
import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import {
  CUSTOM_SHORTCUTS,
  CUSTOM_SHORTCUT_IDS,
  DEFAULT_SEQ_MOD_KEY,
  RESERVED_CHORDS,
  type ShortcutDef,
} from '@/constants/shortcuts'
import { isValidChord, parseChord } from '@/utils/shortcuts'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { usePluginConfigStore } from '@/stores/pluginConfig'
import { migrateShortcutOverrides, readPluginConfig, writePluginConfig } from '@/utils/pluginConfig'

/** 用户覆盖绑定持久化 key */
const STORAGE_BINDINGS = 'aidea-shortcuts'
/** 序号修饰键持久化 key */
const STORAGE_SEQMOD = 'aidea-shortcuts-seqmod'

/**
 * 旧内置 AI 快捷键 id → ai 插件动作短 id 映射。
 * 旧版 AI 生成/清除为内置动作（aiGenerate/aiClear），插件化后为 ai:generate/ai:clear。
 */
const LEGACY_AI_SHORTCUT_IDS: Record<string, string> = {
  aiGenerate: 'generate',
  aiClear: 'clear',
}

/**
 * 一次性存量迁移（幂等）：旧内置 AI 快捷键的用户覆盖条目搬入 ai 插件配置文件 shortcuts 段。
 * 仅当 aidea-shortcuts 中存在 aiGenerate/aiClear 条目（用户改过键）时执行：
 * 读-改-写 `aidea-plugin-config.ai`（迁移值优先），并从旧文件删除对应条目；
 * 无条目则不写任何文件（ai 插件默认键直接生效）。纯 localStorage 层、同步执行，
 * 须先于 overrides 的 useStorage 读取与 validate（未知 id 丢弃规则）调用。
 */
function migrateLegacyAIShortcutOverrides(): void {
  // 读旧混存（解析失败 / 结构不符按空处理）
  let legacy: Record<string, unknown> = {}
  try {
    const raw = localStorage.getItem(STORAGE_BINDINGS)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) legacy = parsed as Record<string, unknown>
    }
  } catch {
    legacy = {}
  }

  // 找出旧 AI 条目（值须为合法字符串 chord）；无条目幂等返回（不建任何插件文件）
  const moved: Record<string, string> = {}
  const legacyIds = new Set<string>()
  for (const [oldId, actionId] of Object.entries(LEGACY_AI_SHORTCUT_IDS)) {
    legacyIds.add(oldId)
    const chord = legacy[oldId]
    if (typeof chord === 'string' && chord.length > 0) moved[actionId] = chord
  }
  if (Object.keys(moved).length === 0) return

  // 合并写入 ai 插件配置文件 shortcuts 段（迁移值优先；读-改-写保留该文件已有条目）
  const cfg = readPluginConfig('ai')
  cfg.shortcuts = { ...cfg.shortcuts, ...moved }
  writePluginConfig('ai', cfg)

  // 从旧文件删除已迁移条目（其余覆盖原样保留）
  const kept: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(legacy)) {
    if (!legacyIds.has(k)) kept[k] = v
  }
  localStorage.setItem(STORAGE_BINDINGS, JSON.stringify(kept))
}

/** assign 结果（conflict 对象的 labelKey：内置动作是 i18n key；插件动作填成品 label——t() 未命中回退即展示原文） */
export type AssignResult =
  | { ok: true }
  | { ok: false; conflict: 'locked' }
  | { ok: false; conflict: 'seqMod' }
  | { ok: false; conflict: { id: string; labelKey: string } }

/** 设置序号修饰键的结果 */
export type SeqModResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked' }
  | { ok: false; reason: 'custom'; conflict: { id: string; labelKey: string } }

/** 默认绑定（id → 字符串） */
function defaultBindings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of CUSTOM_SHORTCUTS) out[def.id] = def.default
  return out
}

/** 某个裸单键是否为「非修饰、不含序号」的合法序号修饰键候选 */
function isPlainSingleKey(key: string): boolean {
  return isValidChord(key) && !key.includes('+') && !/^[1-9]$/.test(key)
}

/** 判断某裸单键是否与锁定键冲突（仅比较单键的锁定 chord），返回冲突定义或 null */
function findLockedKeyConflict(key: string): boolean {
  return RESERVED_CHORDS.some((c) => !c.includes('+') && c === key)
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  // ── 存量迁移先行：必须在 overrides 的 useStorage 读取之前 ──
  // 把旧混存在 aidea-shortcuts 中的插件覆盖条目搬入各插件配置文件；晚于此读取会让旧
  // 条目先进入内存，再经 validate 丢弃/写回造成回归。纯 localStorage 层，同步执行。
  migrateShortcutOverrides()
  // 同批迁移：旧内置 AI 快捷键覆盖条目（aiGenerate/aiClear）搬入 ai 插件配置文件
  migrateLegacyAIShortcutOverrides()

  /** 插件配置（插件覆盖独立存储的写入方；含 ':' 路由目标） */
  const pluginConfigs = usePluginConfigStore()

  /** 用户覆盖绑定（仅存被改动的动作；只承载内置覆盖，插件覆盖走 pluginConfig 独立存储） */
  const overrides = useStorage<Record<string, string>>(STORAGE_BINDINGS, {})

  /** 序号修饰键：按住它再按 1-9 表示打标签（默认 t） */
  const seqModKey = useStorage<string>(STORAGE_SEQMOD, DEFAULT_SEQ_MOD_KEY)

  // ── 自愈：仅保留合法、未知 id 的覆盖条目，并清理相互冲突的条目 ──
  function validate(): void {
    const next: Record<string, string> = {}
    const used = new Set(RESERVED_CHORDS)
    // 含 ':' 的条目为本 key 的历史残留（插件覆盖已迁入 pluginConfig 独立存储）——
    // 一律丢弃避免写回污染（下面按 CUSTOM_SHORTCUT_IDS 白名单重建天然排除它们；
    // 插件覆盖不受本 validate 影响，随插件文件保留）
    for (const id of CUSTOM_SHORTCUT_IDS) {
      const chord = overrides.value[id]
      if (chord === undefined) continue
      if (!isValidChord(chord)) continue
      if (used.has(chord)) continue // 与锁定键或其他覆盖冲突 → 丢弃
      next[id] = chord
      used.add(chord)
    }
    overrides.value = next

    // 序号修饰键必须是单个合法独立键；否则回退默认
    if (!isPlainSingleKey(seqModKey.value)) {
      seqModKey.value = DEFAULT_SEQ_MOD_KEY
    }
  }

  /** 有效绑定：默认（内置 + 插件动作 defaultChord）之上，覆盖优先 */
  const bindings = computed<Record<string, string>>(() => {
    const out = defaultBindings()
    // 插件注册动作并入默认表（仅取有 defaultChord 的；key = 完整登记 key）
    const registry = useUiRegistryStore()
    for (const [key, entry] of registry.shortcutActions) {
      if (entry.def.defaultChord) out[key] = entry.def.defaultChord
    }
    // 插件覆盖并入：pluginConfig 各插件文件的 shortcuts 段（key = 动作短 id），
    // 须拼为完整登记 key（`${pluginId}:${actionId}`）再合并——直接 Object.assign 会因
    // 短 id 撞名跨插件互覆，且匹配不上 out 的完整 key（会被未知 key 规则忽略）。
    // configs 为深度响应式 Map，此处迭代 + 读键可被追踪（改覆盖即改 bindings）。
    const pluginOverrides: Record<string, string> = {}
    for (const [pluginId, cfg] of pluginConfigs.configs) {
      for (const [actionId, chord] of Object.entries(cfg.shortcuts)) {
        pluginOverrides[`${pluginId}:${actionId}`] = chord
      }
    }
    // 覆盖优先（内置 id 与插件完整 key 统一处理；不在 out 中的未知 key 忽略；
    // 两源 key 空间不相交——含 ':' 为插件、不含为内置）
    for (const [id, over] of Object.entries({ ...pluginOverrides, ...overrides.value })) {
      if (id in out && over !== undefined && isValidChord(over)) out[id] = over
    }
    return out
  })

  /** 取某动作的有效绑定 */
  function getBinding(id: string): string {
    return bindings.value[id] ?? defaultBindings()[id] ?? ''
  }

  /** 某 chord 是否被锁定键占用 */
  function isReserved(chord: string): { reserved: boolean } {
    return { reserved: RESERVED_CHORDS.includes(chord) }
  }

  /** 某裸单键与哪个自定义动作的「裸单键绑定」冲突；无冲突返回 null */
  function findCustomBareKeyConflict(key: string): ShortcutDef | null {
    for (const def of CUSTOM_SHORTCUTS) {
      if (getBinding(def.id) === key) return def
    }
    return null
  }

  /**
   * 赋值：冲突校验通过则写入覆盖并持久化。
   * id 须为已知动作（内置可自定义动作或已注册插件动作的完整登记 key）。
   * 冲突规则：非法输入 / 与锁定键 / 与序号修饰键（裸单键）/ 与其它动作（内置 + 插件）→ 拒绝。
   */
  function assign(id: string, chord: string): AssignResult {
    const registry = useUiRegistryStore()
    const known = CUSTOM_SHORTCUT_IDS.includes(id) || registry.shortcutActions.has(id)
    if (!known || !isValidChord(chord)) {
      return { ok: false, conflict: 'locked' }
    }
    if (RESERVED_CHORDS.includes(chord)) {
      return { ok: false, conflict: 'locked' }
    }
    // 裸单键与序号修饰键冲突
    const parsed = parseChord(chord)
    if (parsed && !parsed.mod && !parsed.alt && !parsed.shift && parsed.key === seqModKey.value) {
      return { ok: false, conflict: 'seqMod' }
    }
    // 与其它动作（内置 + 插件）冲突；插件动作 labelKey 填成品 label（t() 未命中回退即显示原文）
    for (const other of CUSTOM_SHORTCUTS) {
      if (other.id === id) continue
      if (getBinding(other.id) === chord) {
        return { ok: false, conflict: { id: other.id, labelKey: other.labelKey } }
      }
    }
    for (const [otherKey, entry] of registry.shortcutActions) {
      if (otherKey === id) continue
      if (getBinding(otherKey) === chord) {
        return { ok: false, conflict: { id: otherKey, labelKey: entry.def.label } }
      }
    }
    // 存储路由：插件动作（完整 key 含 ':'）写 pluginConfig 独立存储；内置动作写本覆盖
    if (id.includes(':')) {
      const idx = id.indexOf(':')
      pluginConfigs.setShortcutOverride(id.slice(0, idx), id.slice(idx + 1), chord)
    } else {
      overrides.value = { ...overrides.value, [id]: chord }
    }
    return { ok: true }
  }

  /**
   * 恢复某动作到默认绑定。
   * 存储路由：插件动作删 pluginConfig 单条（key 拆为 pluginId/actionId）；内置动作删本覆盖。
   */
  function reset(id: string): void {
    if (id.includes(':')) {
      const idx = id.indexOf(':')
      pluginConfigs.removeShortcutOverride(id.slice(0, idx), id.slice(idx + 1))
      return
    }
    const { [id]: _removed, ...rest } = overrides.value
    overrides.value = rest
  }

  /**
   * 恢复全部为默认（含序号修饰键）。
   * 全量重置语义：同时清内置覆盖与全部插件覆盖（含未启用插件的覆盖）。
   */
  function resetAll(): void {
    overrides.value = {}
    pluginConfigs.clearShortcutOverrides()
  }

  /**
   * 设置序号修饰键。
   * 必须是单个普通键；且不能与锁定键单键或自定义动作裸单键绑定冲突。
   */
  function setSeqModKey(key: string): SeqModResult {
    if (!isPlainSingleKey(key)) return { ok: false, reason: 'invalid' }
    if (findLockedKeyConflict(key)) return { ok: false, reason: 'locked' }
    const custom = findCustomBareKeyConflict(key)
    if (custom) {
      return { ok: false, reason: 'custom', conflict: { id: custom.id, labelKey: custom.labelKey } }
    }
    seqModKey.value = key
    return { ok: true }
  }

  /** 恢复序号修饰键为默认 */
  function resetSeqModKey(): void {
    seqModKey.value = DEFAULT_SEQ_MOD_KEY
  }

  validate()

  return {
    overrides,
    seqModKey,
    bindings,
    getBinding,
    isReserved,
    assign,
    reset,
    resetAll,
    setSeqModKey,
    resetSeqModKey,
    validate,
  }
})