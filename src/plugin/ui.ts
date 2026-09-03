/**
 * ui.ts —— 插件 UI 注册子系统（面板 / 顶栏按钮 / 设置栏目）
 *
 * 插件 setup(ctx) 经 ctx.adapter.ui 现场注册**运行时组件对象**。
 * 注册去向统一为 **uiRegistry 登记总表**（stores/uiRegistry.ts）：
 * 内置目录（PANEL_CATALOG / TOP_BAR_CATALOG / SETTINGS_CATALOG）已在 store 初始化时
 * seed 进同一张表；插件条目（origin='plugin'，key = `${pluginId}:${id}`）经本模块
 * 转发写入 uiRegistry，排布（顺序 / 归类 / 持久化）由 layout store 纯派生，无需任何落位调用。
 *
 * 本模块负责：
 * - 定义插件 UI 注册项类型（Registration）——条目类型（Ui*Entry）已移至 uiRegistry 统一导出。
 * - 按插件作用域组装 PluginUiApi（createPluginUiApi）：校验短 id，冲突/非法时
 *   console.warn 并跳过（不抛错，其余注册项继续生效）。
 * - 顶栏按钮描述符 → 等价逻辑组件（wrapTopBarButton），供 uiRegistry 存储，TopBarZone 零改动渲染。
 * - setup 抛错时的批量回滚（rollbackPluginUi → registry.removePlugin）。
 *
 * 命名空间约束：pluginId 与各注册短 id 不得含 ':'（归一用 ':' 连接）。
 * 本模块只接收插件 setup 现场传入的运行对象，不持有任何编译期模块引用。
 */
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import type { TopBarZone } from '@/constants/topbar'
import TopBarButton from '@/components/common/TopBarButton.vue'
import { useUiRegistryStore } from '@/stores/uiRegistry'

/**
 * 下拉菜单单项（结构上与 TopBarButton 的 TopBarMenuOption 兼容）。
 *
 * 两个原因改用自包含结构、不直接引用 naive-ui 的 DropdownOption：
 * 1. 全局 `declare module '*.vue'` 环境声明只暴露 default，无法 `import type` 自
 *    TopBarButton.vue 的具名类型。
 * 2. naive-ui 的 DropdownOption 为递归联合（自引用 children），若经由类型交集
 *    （Entry 归因 extends 等）进入 Map 存储，会在结构性验算上触发 TS「过深实例化」。
 *    自包含接口的递归是惰性展开的，不会触发该上限。
 * 渲染侧（wrapTopBarButton）把它交给 TopBarButton.menu 时经 unknown 桥接。
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

/** 插件设置栏目：与内置 Settings Section 同形态（纯内容，import settings-shared.css） */
export interface PluginSettingsCategoryRegistration {
  /** 插件内短 id；归一为 `${pluginId}:${id}` */
  id: string
  title: string
  component: Component
}

// ── 插件可获得的能力面（adapter.ui）──

/** 插件 UI 注册 API（只增不改，稳定层）。注册方法均返回 void；冲突检测交由 registry（warn + 拒绝） */
export interface PluginUiApi {
  registerPanel(entry: PluginPanelRegistration): void
  registerTopBarButton(entry: PluginTopBarButtonRegistration): void
  registerSettingsCategory(entry: PluginSettingsCategoryRegistration): void
}

// ── 内部校验与工厂 ──

/** 短 id 合法性：非空 + 不含 ':' + 不含空白 */
function isValidShortId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.includes(':') && !/\s/.test(id)
}

/**
 * 按插件作用域组装 PluginUiApi。
 * 非法短 id / key 冲突：console.warn 并跳过（不抛错，其余注册项继续生效）。
 * 注册最终落位到 uiRegistry 登记总表（origin='plugin'，key = `${pluginId}:${id}`）。
 */
export function createPluginUiApi(pluginId: string): PluginUiApi {
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
      if (!registry().registerPluginSettingsCategory(pluginId, entry)) {
        console.warn(`[plugin] ${pluginId} 设置栏目「${entry.id}」注册冲突，已跳过（其余注册项继续生效）`)
      }
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