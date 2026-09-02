/**
 * 示例插件：hello —— 演示插件 UI 注册（面板 / 顶栏按钮 / 设置栏目）与 additions 项目化数据。
 *
 * 要点：
 * 1. 插件经 `ctx.adapter.api` 的**分类子对象**查询数据或执行命令。
 * 2. 插件自己需要"多步命令"时写成普通函数（本插件内部私有），仅供自身使用，
 *    **无需注册**（命令已并入 api）。
 * 3. 写方法自动入历史（可撤销）；`project.beginBatch/commitBatch` 合并单条历史。
 * 4. **启动副作用收敛**：setup 只做「只读查询 console.log + 注册三类 UI」，
 *    避免每次启动污染项目数据。写演示（创建节点 / batch / undo 等）由面板 / 顶栏按钮触发。
 */
import type { AideaPlugin, PluginContext, PluginApi } from '@/plugin/adapter'
import { SDK_VERSION } from '@/plugin/adapter'
import { StatsChartOutline, ColorWandOutline } from '@vicons/ionicons5'
import HelloStatsPanel from './HelloStatsPanel.vue'
import HelloSettingsPanel from './HelloSettingsPanel.vue'

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
 * 创建节点 + 改文本 / 样式 / 应用预设 + 插件私有命令 + project 批量合并为单条历史。
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

  // 视图 / 历史
  api.view.select(nodeId)
  api.project.undo()
  api.project.redo()
}

const plugin: AideaPlugin = {
  manifest: {
    id: 'hello',
    name: '示例插件',
    version: '0.2.0',
    description: '演示插件 UI 注册（面板 / 顶栏按钮 / 设置栏目）与 additions 项目化数据（启动只读查询，写动作由 UI 触发）',
    author: 'aidea',
    sdkVersion: SDK_VERSION,
  },

  setup(ctx: PluginContext): void {
    // ── ① 启动副作用收敛：仅只读查询 console.log（不污染项目数据）──
    const view = ctx.adapter.api.view.active()
    const root = ctx.adapter.api.node.get('root')
    console.log('[hello] 当前视图', view, '根节点', root?.text)

    // ── ② 注册三类 UI（面板 / 顶栏按钮 / 设置栏目）──
    ctx.adapter.ui.registerPanel({
      id: 'stats',
      title: '统计助手',
      icon: StatsChartOutline,
      component: HelloStatsPanel,
      defaultPlacement: 'right',
    })

    ctx.adapter.ui.registerTopBarButton({
      id: 'hello-action',
      title: '示例动作',
      icon: ColorWandOutline,
      zone: 'left',
      variant: 'default',
      onClick: () => {
        // 写演示由用户触发执行，避免启动即污染项目数据
        console.log('[hello] 触发示例动作（写演示）')
        runWriteDemo(ctx.adapter.api)
      },
    })

    ctx.adapter.ui.registerSettingsCategory({
      id: 'hello-config',
      title: '示例插件配置',
      component: HelloSettingsPanel,
    })
  },
}

export default plugin