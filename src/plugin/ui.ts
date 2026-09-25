/**
 * ui.ts —— 插件注册面（面板 / 顶栏按钮 / 设置栏目 / 右键菜单项 / 快捷键动作 / 模态面板 / 浮动层）。
 * 插件 setup(ctx) 经 ctx.register 现场注册运行组件对象，转发写入 **uiRegistry 登记总表**
 * （stores/uiRegistry.ts，key = `${pluginId}:${id}`，排布由 layout store 纯派生）。
 * 本模块还负责：组装 PluginRegisterApi（短 id 校验，冲突/非法 → warn 并跳过）、模态与浮动层
 * 运行时 API（open 收短 id，内部拼前缀转发 modal / pluginFloating store）、顶栏按钮 → 等价逻辑
 * 组件（wrapTopBarButton）与 setup 抛错时的批量回滚（rollbackPluginUi）。
 * 命名空间约束：pluginId 与各注册短 id 不得含 ':'，归一用 ':' 连接。
 */
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import type { TopBarZone } from '@/constants/topbar'
import type { ShortcutScope } from '@/types/shortcuts'
import type { ModalRegistration } from '@/types/modal'
import TopBarButton from '@/components/common/TopBarButton.vue'
import { useUiRegistryStore } from '@/stores/uiRegistry'
import { useModalStore } from '@/stores/modal'
import { usePluginFloatingStore } from '@/stores/pluginFloating'
import { useShortcutsStore } from '@/stores/shortcuts'
import { CUSTOM_SHORTCUTS } from '@/constants/shortcuts'
import { isValidChord } from '@/utils/shortcuts'

/**
 * 下拉菜单单项（结构上与 TopBarButton 的 TopBarMenuOption 兼容）。
 * 改用自包含结构而非 naive-ui 的 DropdownOption：全局 `declare module '*.vue'` 只暴露 default，
 * 无法具名 import；且 DropdownOption 为递归联合，经类型交集进 Map 存储会触发 TS「过深实例化」。
 * 渲染侧（wrapTopBarButton）经 unknown 桥接给 TopBarButton.menu。
 */
export interface PluginTopBarMenuOption {
  key?: string | number
  label?: string | number
  type?: 'default' | 'group' | 'divider' | 'render'
  disabled?: boolean
  children?: PluginTopBarMenuOption[]
  onSelect?: () => void
}

// ── 插件 UI 注册项类型（插件的声明形状）──

/** 插件面板：与内置面板同约束（纯内容组件，无自带 header/hideHeader/title） */
export interface PluginPanelRegistration {
  /** 插件内短 id；注册表内归一为 `${pluginId}:${id}` */
  id: string
  /** 纯字符串标题（DockPanel 的 title prop 支持字符串覆盖） */
  title: string
  /** ionicons 同款形态（Vue 图标组件） */
  icon: Component
  /** 面板内容组件（复用 built-in 纯化约定） */
  component: Component
  /** 默认放置侧，缺省 'right' */
  defaultPlacement?: 'left' | 'right'
}

/** 插件顶栏按钮：描述符，主程序经 TopBarButton 外壳渲染 */
export interface PluginTopBarButtonRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  /** tooltip 文案 */
  title: string
  icon: Component
  /** 渲染侧统一 try/catch */
  onClick: () => void
  /** 缺省 'left' */
  zone?: TopBarZone
  variant?: 'default' | 'primary'
  /** 惰性取值函数（渲染期实时求值） */
  disabled?: () => boolean
  /** 可选 split-button 下拉（复用 TopBarButton） */
  menu?: PluginTopBarMenuOption[]
}

/**
 * 插件设置栏目：与内置 Settings Section 同形态（纯内容，import settings-shared.css）。
 * 硬约束：**一个插件至多一个设置栏目**（同插件二次注册被拒——registry 返回
 * { ok:false, conflict:'id' }；多组配置在同一栏目组件内分区分组呈现，参照 AISettingsPanel）。
 */
export interface PluginSettingsCategoryRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  title: string
  component: Component
}

/** 插件快捷键动作：经 ctx.register.registerShortcutAction 注册（登记进 uiRegistry.shortcutActions） */
export interface PluginShortcutActionRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  /** 成品文案（插件不接主 i18n，设置面板直接展示该字符串） */
  label: string
  /** 触发作用域：'always' 在输入框/编辑守卫之前；'canvas' 在守卫之后 */
  scope: ShortcutScope
  /** 可选默认绑定（规范化 chord；须不与保留键/既有绑定冲突才被接受） */
  defaultChord?: string
  /** 触发时执行（无事件参数） */
  run: () => void
}

/** 插件右键菜单项显示位置：空白画布（无选中）或有选中节点 */
export type PluginContextMenuScope = 'canvas' | 'selection'

/** 插件右键菜单项：经 ctx.register.registerContextMenuItem 注册（登记进 uiRegistry.contextMenuItems） */
export interface PluginContextMenuItemRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  /** 显示位置：'canvas'=无选中分支；'selection'=有选中节点分支 */
  scope: PluginContextMenuScope
  /** 成品文案（插件不接主 i18n，菜单直接展示该字符串） */
  label: string
  /** 可选图标组件（@vicons/ionicons5 同款形态） */
  icon?: Component
  /** 危险操作样式（红色文字） */
  danger?: boolean
  /** 可选显示守卫：返回 false 则该项不出现（ctx.selectedNodeIds 为展开拷贝） */
  when?: (ctx: { selectedNodeIds: string[] }) => boolean
  /** 点击执行；收到选中节点 id 数组（展开拷贝，可安全改写） */
  run: (ctx: { selectedNodeIds: string[] }) => void
  /** 子菜单项工厂（与 run 互斥：children 存在时父项仅作分组入口）。收与 run 相同的选中上下文。 */
  children?: (sel: { selectedNodeIds: string[] }) => PluginContextMenuChildItem[]
}

/** 插件右键菜单子项：children 工厂的元素形状，主程序映射为 ContextMenu 消费的叶子项（key/label/icon/danger/action 同名透传） */
export interface PluginContextMenuChildItem {
  /** 子项 key（菜单内唯一性由插件保证，主程序不加分隔前缀） */
  key: string
  /** 显示文案 */
  label: string
  /** 可选图标组件（@vicons/ionicons5 同款形态） */
  icon?: Component
  /** 危险操作样式（红色文字） */
  danger?: boolean
  /** 点击执行 */
  action: () => void
}

/** 插件浮动层：注册进 uiRegistry.floatingLayers，宿主 PluginFloatingHost 逐条渲染（通用件 FloatingWindow 提供窗口壳） */
export interface PluginFloatingLayerRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  /** 窗口把手条标题（可选；宿主窗口顶部拖拽把手条展示，无则把手条不渲染标题文本） */
  title?: string
  /** 浮动层内容组件（纯内容组件；显隐经插件浮动运行时 API，窗口 chrome 归宿主） */
  component: Component
}

// ── 插件可获得的能力面（ctx.register，仅插件 setup 内可用）──

/** 插件注册面（只增不改，稳定层；数据操作不走这里——经全局 adapter）。前三类返回 void（冲突由 registry warn + 拒绝）；右键菜单项 / 快捷键动作返回注册结果 */
export interface PluginRegisterApi {
  registerPanel(entry: PluginPanelRegistration): void
  registerTopBarButton(entry: PluginTopBarButtonRegistration): void
  /**
   * 注册设置栏目（登记进 uiRegistry.settingsCategories）。**一个插件至多一个设置栏目**：
   * 同插件二次注册（含换短 id）→ registry 拒绝并 warn（conflict:'id'），本方法仍返回 void。
   */
  registerSettingsCategory(entry: PluginSettingsCategoryRegistration): void
  /** 注册右键菜单项；短 id 非法 / key 冲突 → { ok:false, conflict:'id' }（同时 console.warn） */
  registerContextMenuItem(entry: PluginContextMenuItemRegistration): { ok: boolean; conflict?: 'id' }
  /**
   * 注册插件快捷键动作（登记进 uiRegistry.shortcutActions，key = `${pluginId}:${id}`）。
   * 四级校验失败返回 { ok:false, conflict } 并 console.warn，不抛错：
   * 'id' = 短 id 非法或 key 已注册；'chord' = defaultChord 非法 / 保留键 / 与既有绑定冲突。
   * 注册不改写用户已有绑定；用户改键在设置面板进行（对完整登记 key 直接生效）。
   */
  registerShortcutAction(entry: PluginShortcutActionRegistration): { ok: boolean; conflict?: 'id' | 'chord' | 'reserved' | 'binding' }
  /** 注册模态面板（仅登记；打开/关闭走 ctx.modal 运行时）；短 id 非法 / key 冲突 → { ok:false, conflict:'id' }（同时 console.warn） */
  registerModal(def: ModalRegistration): { ok: boolean; conflict?: 'id' }
  /** 注册全局浮动层（宿主 PluginFloatingHost 逐条渲染，窗口 chrome 归宿主，显隐经 ctx.floating）；返回 void（冲突由 registry warn + 拒绝） */
  registerFloatingLayer(entry: PluginFloatingLayerRegistration): void
}

/**
 * 插件模态运行时面（ctx.modal / adapter.for(id).modal 两个注入位共用）：open 收插件内短 id，
 * 校验登记表后拼 `${pluginId}:${id}` 转发 modal store。
 */
export interface PluginModalApi {
  /**
   * 打开本插件经 registerModal 登记的模态面板（id 为插件内短 id）。
   * 未登记 → console.warn + false（fail fast，防幽灵 key）；已登记 → 拼 key 转发 modal store，
   * 沿用其单实例策略：同 key 幂等 true，已有其他模态打开 → warn + false。
   */
  open(id: string): boolean
  /** 关闭当前打开的模态（无模态打开时幂等） */
  close(): void
}

/**
 * 插件浮动层运行时面（ctx.floating / adapter.for(id).floating 两个注入位共用，与
 * PluginModalApi 同构）：收插件内短 id，内部拼 `${pluginId}:${id}` 转发 pluginFloating
 * store（多实例，逐条目独立显隐；开关只由插件负责——浮动层无主应用关闭路径，关闭按钮
 * /逻辑由插件内容自备）。
 */
export interface PluginFloatingApi {
  /**
   * 打开本插件经 registerFloatingLayer 登记的浮动层（id 为插件内短 id）。
   * 未登记 → console.warn + false（fail fast，防登记表与状态失配）；已登记 → 拼 key 转发
   * pluginFloating store：open 幂等 true（多实例无冲突裁决）。
   */
  open(id: string): boolean
  /** 关闭浮动层（幂等：未打开 / 未登记均无副作用，不做登记表校验——close 语义本就允许无害失败） */
  close(id: string): void
  /** 切换显隐；未登记 → console.warn + false（fail fast 同 open）；已登记返回切换后的可见性 */
  toggle(id: string): boolean
  /** 是否可见（纯查询：未登记 / 从未打开 = false，不做登记表校验、不产生副作用） */
  isVisible(id: string): boolean
}

// ── 内部校验与工厂 ──

/** 短 id 合法性：非空 + 不含 ':' + 不含空白 */
function isValidShortId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.includes(':') && !/\s/.test(id)
}

/**
 * 查询哪个动作（内置返回短 id；插件动作返回完整登记 key `${pluginId}:${id}`）绑定到该 chord。
 * 仅用于 registerShortcutAction 的 defaultChord 冲突校验（api/shortcuts.ts 的同名只读方法面向插件）。
 */
function findActionByChord(chord: string): string | null {
  const store = useShortcutsStore()
  for (const def of CUSTOM_SHORTCUTS) {
    if (store.getBinding(def.id) === chord) return def.id
  }
  const registry = useUiRegistryStore()
  for (const key of registry.shortcutActions.keys()) {
    if (store.getBinding(key) === chord) return key
  }
  return null
}

/**
 * 按插件作用域组装注册面 PluginRegisterApi（经 manager 组装 PluginContext 时注入 ctx.register）。
 * 非法短 id / key 冲突：console.warn 并跳过（不抛错，其余注册项继续生效）。
 * 注册最终落位到 uiRegistry 登记总表（origin='plugin'，key = `${pluginId}:${id}`）。
 */
export function createPluginRegister(pluginId: string): PluginRegisterApi {
  const registry = useUiRegistryStore

  /** 校验某注册项的短 id；非法时 warn 并返回 false */
  function requireValidId(kind: string, id: string): boolean {
    if (!isValidShortId(id)) {
      console.warn(
        `[plugin] ${pluginId} 注册${kind}失败：短 id「${id}」非法（须非空且不含 ':' 与空白字符）`,
      )
      return false
    }
    return true
  }

  return {
    registerPanel(entry) {
      if (!requireValidId('面板', entry.id)) return
      if (!registry().registerPluginPanel(pluginId, entry)) {
        console.warn(`[plugin] ${pluginId} 面板「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
    },

    registerTopBarButton(entry) {
      if (!requireValidId('顶栏按钮', entry.id)) return
      const wrapped = wrapTopBarButton(entry)
      if (
        !registry().registerPluginTopBarButton(pluginId, {
          id: entry.id,
          title: entry.title,
          component: wrapped,
          defaultZone: entry.zone ?? 'left',
        })
      ) {
        console.warn(`[plugin] ${pluginId} 顶栏按钮「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
    },

    registerSettingsCategory(entry) {
      if (!requireValidId('设置栏目', entry.id)) return
      const res = registry().registerPluginSettingsCategory(pluginId, entry)
      if (!res.ok) {
        console.warn(`[plugin] ${pluginId} 设置栏目「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
    },

    registerContextMenuItem(entry) {
      if (!requireValidId('右键菜单项', entry.id)) return { ok: false, conflict: 'id' }
      const res = registry().registerPluginContextMenuItem(pluginId, entry)
      if (!res.ok) {
        console.warn(`[plugin] ${pluginId} 右键菜单项「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
      return res
    },

    /**
     * 注册插件快捷键动作（自 api/shortcuts.ts 迁移；四级校验语义不变）：
     * 1. 短 id 非法（空 / 含 ':' / 含空白）→ { ok:false, conflict:'id' }
     * 2. key 已注册 → { ok:false, conflict:'id' }
     * 3. defaultChord 给出时：非法 chord / 保留键 / 与任何动作当前生效绑定冲突 → { ok:false, conflict:'chord' }
     * 4. 通过 → 登记 → { ok:true }（registry 内再兜底一次 id / 冲突校验）
     */
    registerShortcutAction(entry) {
      if (!requireValidId('快捷键动作', entry.id)) return { ok: false, conflict: 'id' }
      const store = useShortcutsStore()
      const key = `${pluginId}:${entry.id}`
      // 2. key 冲突
      if (registry().shortcutActions.has(key)) {
        console.warn(`[plugin] ${pluginId} 快捷键动作「${entry.id}」注册冲突：${key} 已存在，已跳过`)
        return { ok: false, conflict: 'id' }
      }
      // 3. defaultChord：合法性 / 保留键 / 与全部动作当前生效绑定冲突（内置 + 已注册插件动作）
      if (entry.defaultChord !== undefined) {
        const chord = entry.defaultChord
        const taken =
          !isValidChord(chord) || store.isReserved(chord).reserved || findActionByChord(chord) !== null
        if (taken) {
          console.warn(
            `[plugin] ${pluginId} 快捷键动作「${entry.id}」默认键「${chord}」不可用（非法 / 保留键 / 与既有绑定冲突），已跳过`,
          )
          return { ok: false, conflict: 'chord' }
        }
      }
      // 4. 登记（registry 内再兜底一次 id / 冲突校验）
      const res = registry().registerPluginShortcutAction(pluginId, entry)
      if (!res.ok) {
        console.warn(`[plugin] ${pluginId} 快捷键动作「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
        return res
      }
      return { ok: true }
    },

    registerModal(entry) {
      if (!requireValidId('模态面板', entry.id)) return { ok: false, conflict: 'id' }
      const res = registry().registerPluginModal(pluginId, entry)
      if (!res.ok) {
        console.warn(`[plugin] ${pluginId} 模态面板「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
      return res
    },

    registerFloatingLayer(entry) {
      if (!requireValidId('浮动层', entry.id)) return
      if (!registry().registerPluginFloatingLayer(pluginId, entry)) {
        console.warn(`[plugin] ${pluginId} 浮动层「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
    },
  }
}

/**
 * 按插件作用域组装模态运行时 PluginModalApi（两个注入位共用同一工厂：manager 注入 ctx.modal，
 * adapter.for(id) 注入 scope.modal）。方法体内才触碰 pinia（惰性 useStore）。
 * open 先查登记表：未登记 → warn + false（fail fast）；teardown 后误调被入口拒绝（运行期
 * 注册表不变：启停仅持久化重启生效），无需显式失效。
 */
export function createPluginModalApi(pluginId: string): PluginModalApi {
  return {
    open(id: string): boolean {
      // 惰性取登记表：短 id 拼插件前缀成完整登记 key（与 uiRegistry.modals 表的 key 规则一致）
      const key = `${pluginId}:${id}`
      if (!useUiRegistryStore().modals.has(key)) {
        console.warn(`[plugin] 插件「${pluginId}」打开未注册的模态「${id}」，已拒绝`)
        return false
      }
      return useModalStore().open(key)
    },
    close(): void {
      useModalStore().close()
    },
  }
}

/**
 * 按插件作用域组装浮动层运行时 PluginFloatingApi（两个注入位共用同一工厂，与
 * createPluginModalApi 同构）。方法体内才触碰 pinia（惰性 useStore）。
 * open / toggle 先查登记表：未登记 → warn + false（fail fast）；close / isVisible 幂等只读，
 * 不做校验（无害失败语义天然成立）。
 */
export function createPluginFloatingApi(pluginId: string): PluginFloatingApi {
  return {
    open(id: string): boolean {
      // 惰性取登记表：短 id 拼插件前缀成完整登记 key（与 uiRegistry.floatingLayers 表的 key 规则一致）
      const key = `${pluginId}:${id}`
      if (!useUiRegistryStore().floatingLayers.has(key)) {
        console.warn(`[plugin] 插件「${pluginId}」打开未注册的浮动层「${id}」，已拒绝`)
        return false
      }
      return usePluginFloatingStore().open(key)
    },
    close(id: string): void {
      usePluginFloatingStore().close(`${pluginId}:${id}`)
    },
    toggle(id: string): boolean {
      const key = `${pluginId}:${id}`
      if (!useUiRegistryStore().floatingLayers.has(key)) {
        console.warn(`[plugin] 插件「${pluginId}」切换未注册的浮动层「${id}」，已拒绝`)
        return false
      }
      return usePluginFloatingStore().toggle(key)
    },
    isVisible(id: string): boolean {
      return usePluginFloatingStore().isVisible(`${pluginId}:${id}`)
    },
  }
}

/**
 * 回滚某插件的全部 UI 注册（setup 半程抛错时调用）。
 * 经 uiRegistry.removePlugin 清理 origin='plugin' 且 pluginId 匹配的条目；
 * 布局派生自动收缩，无需额外落位操作。任一步抛错仅 console.warn，不向外抛。
 */
export function rollbackPluginUi(pluginId: string): void {
  try {
    useUiRegistryStore().removePlugin(pluginId)
  } catch (e) {
    console.warn('[plugin] 回滚插件 UI 注册失败', e)
  }
}

/** 组件名合法化：把 key 中非法字符替换为 '_'（供 defineComponent name 使用） */
function legalizeComponentName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * 把插件顶栏按钮描述符包装为等价逻辑组件（供 uiRegistry 存储，TopBarZone 零改动渲染）。
 * onClick 统一 try/catch 隔离；disabled 为惰性取值，渲染期实时求值。
 */
export function wrapTopBarButton(entry: PluginTopBarButtonRegistration): Component {
  return defineComponent({
    name: legalizeComponentName(`PluginTopButton_${entry.id}`),
    setup() {
      return () =>
        h(TopBarButton, {
          icon: entry.icon,
          title: entry.title,
          variant: entry.variant,
          disabled: entry.disabled?.() ?? false,
          // menu 为自包含结构，交给 naive 的递归 TopBarMenuOption[] 时经 never 桥接
          menu: entry.menu as never,
          onClick: () => {
            try {
              entry.onClick()
            } catch (e) {
              console.error(`[plugin] 顶栏按钮「${entry.id}」点击抛错`, e)
            }
          },
        })
    },
  })
}