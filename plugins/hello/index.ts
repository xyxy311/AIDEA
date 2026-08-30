/**
 * 示例插件：hello —— 演示按域分类的应用 api（node / connection / tag / project / view）。
 *
 * 要点：
 * 1. 插件经 `ctx.adapter.api` 的**分类子对象**查询数据或执行命令。
 * 2. 插件自己需要"多步命令"时写成普通函数（本插件内部私有），仅供自身使用，
 *    **无需注册**（命令已并入 api）。
 * 3. 写方法自动入历史（可撤销）；`project.beginBatch/commitBatch` 合并单条历史。
 */
import type { AideaPlugin, PluginContext, PluginApi } from '@/plugin/adapter'
import { SDK_VERSION } from '@/plugin/adapter'

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

const plugin: AideaPlugin = {
  manifest: {
    id: 'hello',
    name: '示例插件',
    version: '0.1.0',
    description: '演示适配层分类 api：查询 + 执行命令 + 插件内部私有命令',
    author: 'aidea',
    sdkVersion: SDK_VERSION,
  },

  setup(ctx: PluginContext): void {
    const api = ctx.adapter.api

    // ── ① 查询（只读，按域分类）──
    const view = api.view.active()
    const root = api.node.get('root')
    console.log('[hello] 当前视图', view, '根节点', root?.text)

    // ── ② 节点写（自动入历史，可撤销）──
    const nodeId = api.node.create(view.viewedNodeId, 120, 120, '来自插件的节点')
    api.node.setText(nodeId, '来自插件的节点（可撤销）')
    api.node.setStyle([nodeId], { borderColor: '#e91e63' })
    api.node.applyPreset(nodeId, { borderColor: '#4caf50' })

    // ── ③ 插件私有命令（组合 api 动作，无需注册）──
    summarize(api, view.viewedNodeId)

    // ── ④ project 批量：多步合并为一条历史 ──
    api.project.beginBatch()
    api.node.create(view.viewedNodeId, 260, 120, '批量一')
    api.node.create(view.viewedNodeId, 260, 220, '批量二')
    api.project.commitBatch()

    // ── ⑤ 视图 / 历史 ──
    api.view.select(nodeId)
    api.project.undo()
    api.project.redo()
  },
}

export default plugin