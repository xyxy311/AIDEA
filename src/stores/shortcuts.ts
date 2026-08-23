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

/** 用户覆盖绑定持久化 key */
const STORAGE_BINDINGS = 'aidea-shortcuts'
/** 序号修饰键持久化 key */
const STORAGE_SEQMOD = 'aidea-shortcuts-seqmod'

/** assign 结果 */
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
  /** 用户覆盖绑定（仅存被改动的动作） */
  const overrides = useStorage<Record<string, string>>(STORAGE_BINDINGS, {})

  /** 序号修饰键：按住它再按 1-9 表示打标签（默认 t） */
  const seqModKey = useStorage<string>(STORAGE_SEQMOD, DEFAULT_SEQ_MOD_KEY)

  // ── 自愈：仅保留合法、未知 id 的覆盖条目，并清理相互冲突的条目 ──
  function validate(): void {
    const next: Record<string, string> = {}
    const used = new Set(RESERVED_CHORDS)
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

  /** 有效绑定：覆盖优先，未覆盖回退默认 */
  const bindings = computed<Record<string, string>>(() => {
    const out = defaultBindings()
    for (const id of CUSTOM_SHORTCUT_IDS) {
      const over = overrides.value[id]
      if (over !== undefined && isValidChord(over)) out[id] = over
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
   * 冲突规则：非法输入 / 与锁定键 / 与序号修饰键（裸单键）/ 与其它自定义动作 → 拒绝。
   */
  function assign(id: string, chord: string): AssignResult {
    if (!CUSTOM_SHORTCUT_IDS.includes(id) || !isValidChord(chord)) {
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
    // 与其它自定义动作冲突
    for (const other of CUSTOM_SHORTCUTS) {
      if (other.id === id) continue
      if (getBinding(other.id) === chord) {
        return { ok: false, conflict: { id: other.id, labelKey: other.labelKey } }
      }
    }
    overrides.value = { ...overrides.value, [id]: chord }
    return { ok: true }
  }

  /** 恢复某动作到默认绑定 */
  function reset(id: string): void {
    const { [id]: _removed, ...rest } = overrides.value
    overrides.value = rest
  }

  /** 恢复全部为默认（含序号修饰键） */
  function resetAll(): void {
    overrides.value = {}
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
  }
})