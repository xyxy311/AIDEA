/**
 * 内置插件：ai —— AI 发散（原主程序 AI 功能的插件化迁移）
 *
 * 功能面（与原主程序版本对齐）：
 * - AI 面板（左侧活动栏面板）：全局提示词 / 视图级 AI 设置 / 上下文预览 / 连词成句 / 生成触发
 * - AI 设置（设置栏目，单栏目三分区）：① AI 连接（baseURL / model / apiKey / 超时 / 温度 +
 *   恢复默认）② 快捷键改键（ShortcutActionRow）③ 发散方向管理（CRUD / 排序 / 默认方向）；
 *   一个插件至多一个设置栏目（SDK 硬约束），三分区收敛在 AISettingsPanel 内
 * - 生成词浮动面板（插件浮动层，宿主窗口 + 显隐经浮动运行时 API）
 * - 画布右键「发散」子菜单（selection scope，children 按方向展开）与 I / C 快捷键
 *
 * 要点（对齐 hello 插件约定）：
 * 1. 数据操作经全局 adapter：`adapter.api.*` 查询/写节点；`scope.additions` 读写本插件
 *    命名空间的项目级数据（完整键 `ai:projectConfig` 等，随项目保存、可撤销）；
 *    `scope.config` 读写插件自身偏好（`aidea-plugin-config.ai`，应用级持久化、不入项目历史）。
 * 2. UI / 动作注册全部在 setup(ctx) 的 ctx.register.* 内完成；注册结果不 ok 时 console.warn。
 * 3. **启动副作用收敛**：setup 只做注册，不读项目数据、不触发生成；生成等写操作由
 *    UI / 快捷键 / 右键菜单触发。
 * 4. 各 store / composable 内部经 `adapter.for(AI_PLUGIN_ID)` 获取同一缓存 scope 实例
 *    （for 有模块级缓存，additions/config 自动加 `ai:` 前缀）。
 */
import type { AideaPlugin, PluginContext, PluginManifest } from '@/plugin/adapter'
import { adapter, SDK_VERSION } from '@/plugin/adapter'
import { SparklesOutline } from '@vicons/ionicons5'
import { t } from './i18n' // 插件自有语言包：本插件全部文案（含 leftSidebar./settings./shortcuts./canvas. 分区）的唯一解析入口
import AIPanel from './components/AIPanel.vue'
import FloatingAIWordPanel from './components/FloatingAIWordPanel.vue'
import AISettingsPanel from './components/AISettingsPanel.vue'
import { useAIDirectionsStore } from './stores/aiDirections'
import { useAIWordPanel } from './composables/useAIWordPanel'
import { AI_PLUGIN_ID, AI_WORDS_LAYER_ID } from './constants'

/** 插件清单（常量先行：模块顶层用它声明命名空间作用域，避免硬编码重复） */
const manifest: PluginManifest = {
  id: AI_PLUGIN_ID,
  name: 'AI 发散',
  version: '1.0.0',
  description:
    '调用本地/兼容 OpenAI 端点的大模型发散灵感：AI 面板、发散方向管理、生成词浮动面板、画布右键发散与 I/C 快捷键',
  author: 'aidea',
  sdkVersion: SDK_VERSION,
}

/**
 * 本插件命名空间作用域：for 有模块级缓存（同 id 返回同一实例），
 * additions/config 自动加 `ai:` 前缀。入口未直接使用——stores / composables
 * 内部经 adapter.for(AI_PLUGIN_ID) 取到同一实例；此处声明以确立命名空间归属。
 */
const scope = adapter.for(manifest.id)

/** 选中节点 id → 非空文本数组（发散起点；对齐原 useCanvasEvents 的 from 组装逻辑） */
function fromTextsOf(selectedNodeIds: string[]): string[] {
  return selectedNodeIds
    .map((id) => adapter.api.node.get(id)?.text)
    .filter((s): s is string => !!s && s.trim().length > 0)
}

const plugin: AideaPlugin = {
  manifest,

  setup(ctx: PluginContext): void {
    // ── ① 面板：AI 面板（左侧活动栏，与原 PANEL_CATALOG 一致 SparklesOutline / defaultPlacement left）──
    ctx.register.registerPanel({
      id: 'panel',
      title: t('leftSidebar.ai'),
      icon: SparklesOutline,
      component: AIPanel,
      defaultPlacement: 'left',
    })

    // ── ② 设置栏目：「AI 设置」（单栏目三分区 = AI 连接 / 快捷键 / 发散方向，
    //    见 AISettingsPanel；SDK 硬约束一个插件至多一个设置栏目，二次注册会被拒）──
    ctx.register.registerSettingsCategory({
      id: 'settings',
      title: t('settings.aiSettings'),
      component: AISettingsPanel,
    })

    // ── ③ 快捷键：I 直接生成 / C 清除生成词 ──
    //（主程序旧内置绑定 aiGenerate/aiClear 拆除前，默认键可能因占用被拒 → warn 不致命）
    const aiWord = useAIWordPanel()
    const generateRes = ctx.register.registerShortcutAction({
      id: 'generate',
      label: t('shortcuts.actionAIGenerate'),
      scope: 'canvas',
      defaultChord: 'i',
      run: () => {
        void aiWord.directGenerate()
      },
    })
    if (!generateRes.ok) {
      console.warn('[ai] 快捷键动作「generate」注册被拒：', generateRes.conflict)
    }

    const clearRes = ctx.register.registerShortcutAction({
      id: 'clear',
      label: t('shortcuts.actionAIClear'),
      scope: 'canvas',
      defaultChord: 'c',
      run: () => aiWord.clear(),
    })
    if (!clearRes.ok) {
      console.warn('[ai] 快捷键动作「clear」注册被拒：', clearRes.conflict)
    }

    // ── ④ 右键菜单：发散（selection scope，children 子菜单按方向展开；父项不执行）──
    //（run 为类型必填，children 存在时父项仅作分组入口，故给空实现）
    const menuRes = ctx.register.registerContextMenuItem({
      id: 'divergence',
      scope: 'selection',
      label: t('canvas.divergence'),
      run: () => {},
      children: ({ selectedNodeIds }) =>
        useAIDirectionsStore().directionList.map((d) => ({
          key: `divergence-${d.id}`,
          label: d.title,
          action: () => {
            void aiWord.generateDirectional(fromTextsOf(selectedNodeIds), d)
          },
        })),
    })
    if (!menuRes.ok) {
      console.warn('[ai] 右键菜单项「divergence」注册被拒：', menuRes.conflict)
    }

    // ── ⑤ 浮动层：AI 生成词浮动面板（宿主 PluginFloatingHost 逐条渲染，窗口壳由通用件
    //    FloatingWindow（components/common）提供；显隐经 ctx.floating / scope.floating，默认隐藏 open 才可见）──
    ctx.register.registerFloatingLayer({
      id: AI_WORDS_LAYER_ID,
      title: t('aiWord.title'),
      component: FloatingAIWordPanel,
    })

    // scope 仅作命名空间确立（见上方声明注释），避免 lint 语义歧义的显式引用
    void scope
  },
}

export default plugin
