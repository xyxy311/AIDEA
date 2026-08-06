import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useProjectStore } from '@/stores/project'
import { useViewStore } from '@/stores/view'
import type { WhiteboardNode } from '@/types'
import type { DataPatch, HistoryEntry, NodeChange, ConnectionChange } from '@/utils/command'
import { deepClone } from '@/utils/command'

/** 历史栈最大深度 */
const MAX_HISTORY = 50

/** 连续编辑合并时间窗口（毫秒） */
const COALESCE_WINDOW = 1000

/**
 * History Store - 撤销/重做栈管理
 *
 * 职责：
 * - 管理 past/future 栈
 * - 应用 DataPatch 到 nodeStore（直接操作已暴露的 nodes Map，不向 nodeStore 加方法）
 * - 视图协调（执行后当前视图节点无效时沿祖先链回退）
 * - batch 事务（复合操作合并为单条历史）
 * - coalesce 合并（连续同 key 编辑合并为一条）
 *
 * 命令不含视图信息；视图协调统一为「当前视图节点无效则沿 pathToRoot 回退」。
 */
export const useHistoryStore = defineStore('history', () => {
  const nodeStore = useNodeStore()
  const project = useProjectStore()

  // ── State ──
  const past = ref<HistoryEntry[]>([])
  const future = ref<HistoryEntry[]>([])

  // ── Getters ──
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // ── batch 事务状态 ──
  let batchPatch: DataPatch | null = null

  // ── 内部：直接操作 nodeStore.nodes 的私有函数 ──
  // 这些函数绕过 nodeStore 的业务逻辑（fitNodeToText 等），
  // 实现 undo/redo 的精确状态恢复。nodeStore 保持原样不加任何方法。

  /**
   * 将 target 中的字段逐一赋值到 obj。
   * 比 Object.assign(obj, deepClone(target)) 更精确：
   * undefined 值会删除属性（JSON.stringify 会丢弃 undefined，
   * 导致 Object.assign 无法恢复 undefined 字段）。
   */
  function assignFields(
    obj: Record<string, unknown>,
    target: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(target)) {
      const val = target[key]
      if (val === undefined) {
        delete obj[key]
      } else {
        obj[key] = deepClone(val)
      }
    }
  }

  function applyNodeChange(nc: NodeChange, isUndo: boolean): void {
    const target = isUndo ? nc.old : nc.new
    if (nc.type === 'add') {
      if (isUndo) {
        // 撤销创建 = 删除节点
        nodeStore.nodes.delete(nc.id)
      } else {
        // 重做创建 = 恢复节点
        nodeStore.nodes.set(nc.id, deepClone(nc.new!) as WhiteboardNode)
      }
    } else if (nc.type === 'remove') {
      if (isUndo) {
        // 撤销删除 = 恢复节点（含其 connections 数组）
        nodeStore.nodes.set(nc.id, deepClone(nc.old!) as WhiteboardNode)
      } else {
        // 重做删除 = 删除节点
        nodeStore.nodes.delete(nc.id)
      }
    } else if (nc.type === 'modify') {
      // modify: 逐一赋值变化字段（支持 undefined 恢复）
      const node = nodeStore.nodes.get(nc.id)
      if (node && target) {
        assignFields(
          node as Record<string, unknown>,
          target as Record<string, unknown>,
        )
      }
    }
  }

  function applyConnChange(cc: ConnectionChange, isUndo: boolean): void {
    const parent = nodeStore.nodes.get(cc.parentId)
    if (!parent) return

    if (cc.type === 'add') {
      if (isUndo) {
        // 撤销创建连线 = 删除
        parent.connections = parent.connections.filter((c) => c.id !== cc.connectionId)
      } else {
        // 重做创建连线 = 添加
        if (!parent.connections.some((c) => c.id === cc.connectionId)) {
          parent.connections.push(deepClone(cc.connection!))
        }
      }
    } else if (cc.type === 'remove') {
      if (isUndo) {
        // 撤销删除连线 = 恢复
        if (!parent.connections.some((c) => c.id === cc.connectionId)) {
          parent.connections.push(deepClone(cc.connection!))
        }
      } else {
        // 重做删除连线 = 删除
        parent.connections = parent.connections.filter((c) => c.id !== cc.connectionId)
      }
    } else if (cc.type === 'modify') {
      const target = isUndo ? cc.old : cc.new
      const conn = parent.connections.find((c) => c.id === cc.connectionId)
      if (conn && target) {
        assignFields(
          conn as Record<string, unknown>,
          target as Record<string, unknown>,
        )
      }
    }
  }

  /** 应用 patch（正向 redo 或反向 undo） */
  function applyPatch(patch: DataPatch, isUndo: boolean): void {
    if (isUndo) {
      // undo: 逆序应用（先 conn 后 node，逆序遍历）
      for (let i = patch.connChanges.length - 1; i >= 0; i--) {
        applyConnChange(patch.connChanges[i], true)
      }
      for (let i = patch.nodeChanges.length - 1; i >= 0; i--) {
        applyNodeChange(patch.nodeChanges[i], true)
      }
    } else {
      // redo: 正序应用（先 node 后 conn，正序遍历）
      for (const nc of patch.nodeChanges) {
        applyNodeChange(nc, false)
      }
      for (const cc of patch.connChanges) {
        applyConnChange(cc, false)
      }
    }
  }

  // ── 视图协调 ──

  /**
   * 包裹一个数据操作 fn，执行后统一处理视图协调：
   * 1. 销毁被删除节点的内联视图实例
   * 2. 若当前 currentNodeId 节点无效，沿执行前记录的 pathToRoot 回退到最近存在的祖先
   * 3. 清理 expandedIds 中已不存在的节点
   *
   * 命令层的 deleteNodes/clearNodeChildren 和 history 的 undo/redo 都通过此函数包裹。
   */
  function runWithViewCoord(fn: () => void, patch?: DataPatch): void {
    // 执行前记录当前视图的祖先链（此时节点还在，pathToRoot 有效）
    const pathToRoot = nodeStore.pathToRoot(project.currentNodeId)
    const beforeIds = new Set(nodeStore.nodes.keys())

    fn()

    const afterIds = new Set(nodeStore.nodes.keys())

    const mainView = useViewStore('main')

    // 计算当前仍有效的连线 ID 集合（连线嵌套在父节点 connections 数组）
    const validConnectionIds = new Set<string>()
    for (const node of nodeStore.nodes.values()) {
      for (const c of node.connections) validConnectionIds.add(c.id)
    }

    // 0. 清理选中：移除已不存在节点/连线的选中
    //    删除 / undo-redo 后 selectedNodeIds 可能仍持有被删除的节点，
    //    导致全局 Transformer 残留附着在失效节点上。仅当选中集合变化时替换 Set，
    //    使 CanvasStage 对 selectedNodeIds 的 watch 触发并重新附着（含清空）Transformer。
    mainView.pruneSelection(afterIds, validConnectionIds)

    // 1. 销毁无效的内联视图实例
    //    - 宿主节点被删除
    //    - 宿主节点不再是主视图当前节点的直接子级（如被组合 / reparent 到其他层级）
    for (const iv of [...mainView.inlineViews]) {
      const hostNode = nodeStore.getNode(iv.nodeId)
      if (!hostNode || hostNode.parentId !== project.currentNodeId) {
        project.destroyView(iv.viewId)
        mainView.removeInlineView(iv.nodeId)
      }
    }

    // 2. 同步被 modify 尺寸的内联视图宿主节点的 inlineViews 尺寸 = 节点当前尺寸
    //    undo/redo 节点尺寸后，inlineViews 尺寸（视图状态，不入 undo）需同步回节点尺寸，
    //    否则内联视图渲染尺寸与节点数据不一致。fit 导致的临时尺寸差异会被覆盖（可重新触发 fit）。
    if (patch) {
      const sizeModifiedIds = new Set(
        patch.nodeChanges
          .filter(
            (nc): nc is NodeChange & { type: 'modify' } =>
              nc.type === 'modify' && !!nc.new && ('width' in nc.new || 'height' in nc.new),
          )
          .map((nc) => nc.id),
      )
      if (sizeModifiedIds.size > 0) {
        for (const iv of mainView.inlineViews) {
          if (sizeModifiedIds.has(iv.nodeId)) {
            const hostNode = nodeStore.getNode(iv.nodeId)
            if (hostNode) {
              mainView.updateInlineViewSize(iv.nodeId, hostNode.width, hostNode.height)
            }
          }
        }
      }
    }

    // 3. 视图回退：当前节点无效时，沿祖先链找最近存在的祖先
    if (!afterIds.has(project.currentNodeId)) {
      // pathToRoot[0] 是当前节点（已无效），从 [1]（父级）开始找
      let target = ROOT_NODE_ID
      for (let i = 1; i < pathToRoot.length; i++) {
        if (afterIds.has(pathToRoot[i])) {
          target = pathToRoot[i]
          break
        }
      }
      project.switchView(target)
    }

    // 4. 清理 expandedIds
    project.pruneExpanded(afterIds)
  }

  // ── Public API ──

  /**
   * 推入命令到历史栈。
   *
   * - 若处于 batch 中，追加到 batchPatch 而非入栈
   * - 若 coalesceKey 与栈顶相同且在时间窗口内，合并 modify 的 new 值到栈顶
   * - 否则入栈，清空 future，超限丢弃最早
   */
  function pushCommand(patch: DataPatch, opts?: { coalesceKey?: string }): void {
    // batch 模式：追加到当前 batch
    if (batchPatch) {
      batchPatch.nodeChanges.push(...patch.nodeChanges)
      batchPatch.connChanges.push(...patch.connChanges)
      return
    }

    const now = Date.now()

    // coalesce 合并
    if (opts?.coalesceKey && past.value.length > 0) {
      const top = past.value[past.value.length - 1]
      if (top.coalesceKey === opts.coalesceKey && now - top.timestamp < COALESCE_WINDOW) {
        // 合并：用新 patch 的 new 值更新栈顶
        mergePatch(top.patch, patch)
        top.timestamp = now
        // 合并后清空 future（新操作产生）
        future.value = []
        return
      }
    }

    // 正常入栈
    past.value.push({
      patch,
      coalesceKey: opts?.coalesceKey,
      timestamp: now,
    })

    // 新操作产生，清空 redo 栈
    future.value = []

    // 超限丢弃最早
    if (past.value.length > MAX_HISTORY) {
      past.value.shift()
    }
  }

  /**
   * 合并新 patch 到栈顶 patch（coalesce 用）。
   * 对于 modify 类型的同 id nodeChange，更新 new 值。
   * 对于 modify 类型的同 parentId+connectionId connChange，更新 new 值。
   * 新 id 的 change 追加到栈顶。
   */
  function mergePatch(target: DataPatch, source: DataPatch): void {
    for (const snc of source.nodeChanges) {
      if (snc.type !== 'modify') {
        target.nodeChanges.push(snc)
        continue
      }
      const existing = target.nodeChanges.find(
        (t) => t.type === 'modify' && t.id === snc.id,
      )
      if (existing) {
        // 更新 new（保留 old 不变）
        existing.new = { ...existing.new, ...snc.new }
      } else {
        target.nodeChanges.push(snc)
      }
    }
    for (const scc of source.connChanges) {
      if (scc.type !== 'modify') {
        target.connChanges.push(scc)
        continue
      }
      const existing = target.connChanges.find(
        (t) =>
          t.type === 'modify' &&
          t.parentId === scc.parentId &&
          t.connectionId === scc.connectionId,
      )
      if (existing) {
        existing.new = { ...existing.new, ...scc.new }
      } else {
        target.connChanges.push(scc)
      }
    }
  }

  /** 撤销 */
  function undo(): void {
    if (past.value.length === 0) return
    const entry = past.value.pop()!
    runWithViewCoord(
      () => {
        applyPatch(entry.patch, true)
      },
      entry.patch,
    )
    future.value.push(entry)
  }

  /** 重做 */
  function redo(): void {
    if (future.value.length === 0) return
    const entry = future.value.pop()!
    runWithViewCoord(
      () => {
        applyPatch(entry.patch, false)
      },
      entry.patch,
    )
    past.value.push(entry)
  }

  /** 清空历史（新建项目时调用） */
  function clear(): void {
    past.value = []
    future.value = []
    batchPatch = null
  }

  // ── batch 事务 ──

  /**
   * 开启 batch 事务。
   * 事务内所有 pushCommand 追加到同一个 patch，commitBatch 时合并为单条历史。
   * 用于复合操作（如 Shift 连线创建 = 创建节点 + 创建连线）。
   *
   * 注意：beginBatch 后必须 commitBatch 或 rollbackBatch，否则后续命令都会被吞。
   */
  function beginBatch(): void {
    batchPatch = { nodeChanges: [], connChanges: [] }
  }

  /** 提交 batch 事务，合并为单条历史入栈 */
  function commitBatch(): void {
    if (!batchPatch) return
    const patch = batchPatch
    batchPatch = null
    if (patch.nodeChanges.length > 0 || patch.connChanges.length > 0) {
      pushCommand(patch)
    }
  }

  /** 回滚 batch 事务（丢弃，不入栈） */
  function rollbackBatch(): void {
    batchPatch = null
  }

  return {
    past,
    future,
    canUndo,
    canRedo,
    pushCommand,
    undo,
    redo,
    clear,
    beginBatch,
    commitBatch,
    rollbackBatch,
    // 暴露 runWithViewCoord 供命令层使用
    runWithViewCoord,
  }
})
