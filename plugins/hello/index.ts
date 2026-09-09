/**
 * 示例插件：hello —— 演示插件注册面（面板 / 顶栏按钮 / 设置栏目 / 右键菜单项 / 快捷键动作）、
 * 全局 adapter 数据操作与 additions 项目化数据。
 *
 * 要点：
 * 1. 数据操作经全局单例：`import { adapter } from '@/plugin/adapter'`——
 *    `adapter.api.*` 查询 / 执行命令；`scope.additions.*` 读写本插件命名空间数据
 *    （scope = adapter.for(manifest.id)，additions 自动加 `hello:` 前缀）；
 *    `scope.config.*` 读写插件自身配置（`aidea-plugin-config.hello` 独立存储，
 *    应用级持久化、不入项目历史，如 greet 的问候语前缀）。
 * 2. UI / 动作注册经 setup(ctx) 的 ctx.register.*（registerShortcutAction /
 *    registerContextMenuItem 可探测注册结果，ok=false 时打印被拒原因）。
 * 3. 插件自己需要"多步命令"时写成普通函数（本插件内部私有），仅供自身使用，
 *    **无需注册**（命令已并入 api）。
 * 4. 写方法自动入历史（可撤销）；`adapter.api.project.beginBatch/commitBatch` 合并单条历史。
 * 5. **启动副作用收敛**：setup 只做「只读查询 console.log + 注册」，避免每次启动污染项目数据。
 *    写演示（创建节点 / batch / additions 写 / undo 等）由面板 / 顶栏按钮触发。
 */
import type { AideaPlugin, PluginApi, PluginContext, PluginManifest } from '@/plugin/adapter'
import { adapter, SDK_VERSION } from '@/plugin/adapter'
import { StatsChartOutline, ColorWandOutline } from '@vicons/ionicons5'
import HelloStatsPanel from './HelloStatsPanel.vue'
import HelloSettingsPanel from './HelloSettingsPanel.vue'
import HelloAboutModal from './HelloAboutModal.vue'

/** 插件清单（常量先行：模块顶层用它声明命名空间作用域，避免硬编码重复） */
const manifest: PluginManifest = {
  id: 'hello',
  name: '示例插件',
  version: '0.4.0',
  description: '演示插件注册面（面板 / 顶栏按钮 / 设置栏目 / 右键菜单项 / 模态面板）、快捷键动作注册与 additions 项目化数据（启动只读查询，写动作由 UI 触发）',
  author: 'aidea',
  sdkVersion: SDK_VERSION,
}

/** 本插件命名空间作用域：for 有模块级缓存（同 id 返回同一实例），additions 自动加 `hello:` 前缀 */
const scope = adapter.for(manifest.id)

/**
 * 插件内部私有"命令"（复用 api 的组合动作）——无需注册。
 * 在 focus 节点的右下方，把其直接子级文本拼成一句概览节点。
 */
function summarize(api: PluginApi, focusId: string): string | null {
  const focus = api.node.get(focusId)
  if (!focus) return null
  const children = api.node.children(focusId)
  const summaryText = children.map((c) => c.text ?? '').join('、')
  if (!summaryText) return null

  const id = api.node.create(focusId, focus.x + focus.width + 40, focus.y, summaryText)
  api.node.setText(id, `概览：${summaryText}`)
  return id
}

/**
 * 写演示动作（由顶栏按钮触发，不再在启动时执行）：
 * 创建节点 + 改文本 / 样式 / 应用预设 + 插件私有命令 + project 批量合并为单条历史
 * + additions 插件命名空间写。
 */
function runWriteDemo(api: PluginApi): void {
  const view = api.view.active()

  // 节点写（自动入历史，可撤销）
  const nodeId = api.node.create(view.viewedNodeId, 120, 120, '来自插件的节点')
  api.node.setText(nodeId, '来自插件的节点（可撤销）')
  api.node.setStyle([nodeId], { borderColor: '#e91e63' })
  api.node.applyPreset(nodeId, { borderColor: '#4caf50' })

  // 插件私有命令（组合 api 动作，无需注册）
  summarize(api, view.viewedNodeId)

  // project 批量：多步合并为一条历史
  api.project.beginBatch()
  api.node.create(view.viewedNodeId, 260, 120, '批量一')
  api.node.create(view.viewedNodeId, 260, 220, '批量二')
  api.project.commitBatch()

  // 插件命名空间数据（scope.additions）：完整键为 `hello:lastRun`，随项目保存、可撤销
  scope.additions.set('lastRun', { ts: Date.now() })

  // 视图 / 历史
  api.view.select(nodeId)
  api.project.undo()
  api.project.redo()
}

const plugin: AideaPlugin = {
  manifest,

  setup(ctx: PluginContext): void {
    // ── ① 启动副作用收敛：仅只读查询 console.log（不污染项目数据）──
    const view = adapter.api.view.active()
    const root = adapter.api.node.get('root')
    console.log('[hello] 当前视图', view, '根节点', root?.text, '已有 additions 键', scope.additions.keys())

    // ── ② 经注册面注册三类 UI（面板 / 顶栏按钮 / 设置栏目）──
    ctx.register.registerPanel({
      id: 'stats',
      title: '统计助手',
      icon: StatsChartOutline,
      component: HelloStatsPanel,
      defaultPlacement: 'right',
    })

    ctx.register.registerTopBarButton({
      id: 'hello-action',
      title: '示例动作',
      icon: ColorWandOutline,
      zone: 'left',
      variant: 'default',
      onClick: () => {
        // 写演示由用户触发执行，避免启动即污染项目数据
        console.log('[hello] 触发示例动作（写演示）')
        runWriteDemo(adapter.api)
      },
    })

    ctx.register.registerSettingsCategory({
      id: 'hello-config',
      title: '示例插件配置',
      component: HelloSettingsPanel,
    })

    // ── ③ 注册快捷键动作（Ctrl/Cmd+Shift+G 问候；mod+shift+g 未占用保留键与内置绑定）──
    const shortcutRes = ctx.register.registerShortcutAction({
      id: 'greet',
      label: 'Hello 问候',
      scope: 'canvas',
      defaultChord: 'mod+shift+g',
      run: () => {
        // 问候语前缀经插件自身配置（scope.config，get 未配置回退 '你好'）；设置面板改前缀即时生效
        const prefix = scope.config.get('greetingPrefix', '你好')
        console.info(`[hello] ${prefix}，快捷键触发`)
      },
    })
    if (!shortcutRes.ok) {
      console.warn('[hello] 快捷键动作注册被拒：', shortcutRes.conflict)
    }

    // ── ④ 注册右键菜单项（有选中节点时出现在菜单末尾）──
    const menuRes = ctx.register.registerContextMenuItem({
      id: 'hello-item',
      scope: 'selection',
      label: 'Hello 演示',
      run: ({ selectedNodeIds }) => {
        console.info('[hello] 右键菜单触发，选中节点：', selectedNodeIds)
      },
    })
    if (!menuRes.ok) {
      console.warn('[hello] 右键菜单项注册被拒：', menuRes.conflict)
    }

    // ── ⑤ 注册模态面板（完整 key `hello:about`；内容为最小说明组件 HelloAboutModal）──
    const modalRes = ctx.register.registerModal({
      id: 'about',
      title: '关于示例插件',
      component: HelloAboutModal,
    })
    if (!modalRes.ok) {
      console.warn('[hello] 模态面板注册被拒：', modalRes.conflict)
    }

    // ── ⑥ 打开模态入口 a)：右键菜单项（canvas scope，空白画布即可见）→
    //    ctx.modal.open 收插件内短 id，内部自动拼 `hello:` 前缀 ──
    const aboutRes = ctx.register.registerContextMenuItem({
      id: 'hello-about-item',
      scope: 'canvas',
      label: '关于示例插件',
      run: () => {
        // 单实例冲突（已有其他模态打开）→ false，store 内 warn，这里补一条插件侧提示
        const ok = ctx.modal.open('about')
        if (!ok) console.warn('[hello] 打开「关于」模态失败：可能有其他模态打开中')
      },
    })
    if (!aboutRes.ok) {
      console.warn('[hello] 右键菜单项注册被拒：', aboutRes.conflict)
    }
  },
}

export default plugin
