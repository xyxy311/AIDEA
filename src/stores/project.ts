import { ref, computed } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useViewStore } from '@/stores/view'

/**
 * 项目 Store - 管理项目级导航与元数据
 *
 * 职责：
 * - 当前活跃视图 ID（查看哪个节点的子级）
 * - 项目名（根节点 text 的单一数据源派生）
 * - 节点树展开状态（左侧导航树的全局展开 / 收起）
 * - viewStore 实例的生命周期（销毁）
 *
 * 不存储节点 / 连线数据（归 nodeStore），不存储视口 / 选中（归 viewStore）。
 */
export const useProjectStore = defineStore('project', () => {
  const nodeStore = useNodeStore()

  // ── 活跃视图 ──

  /** 当前活跃视图 ID（查看哪个节点的子级），初始为根节点 */
  const activeViewId = ref<string>(ROOT_NODE_ID)

  /** 根视图 ID（项目节点，不可删除） */
  const rootViewId = computed(() => ROOT_NODE_ID)

  // ── 项目名（根节点 text 单一数据源）──

  /** 项目名 = 根节点 text */
  const projectName = computed(() => nodeStore.rootNode?.text ?? '未命名项目')

  /** 设置项目名 = 修改根节点 text */
  function setProjectName(name: string): void {
    nodeStore.setNodeText(ROOT_NODE_ID, name)
  }

  // ── 树展开状态（全局导航态）──

  /** 展开的节点 ID 集合（根节点默认展开） */
  const expandedIds = ref<Set<string>>(new Set([ROOT_NODE_ID]))

  /** 切换展开 / 收起 */
  function toggleExpand(id: string): void {
    const next = new Set(expandedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedIds.value = next
  }

  /** 展开（不切换收起） */
  function expand(id: string): void {
    if (expandedIds.value.has(id)) return
    const next = new Set(expandedIds.value)
    next.add(id)
    expandedIds.value = next
  }

  // ── 视图切换 ──

  /**
   * 切换活跃视图到指定节点。
   * 仅当该节点存在时切换，并重置目标视图的交互状态。
   */
  function switchView(id: string): void {
    if (!nodeStore.nodes.has(id)) return
    activeViewId.value = id
    useViewStore(id).resetViewState()
  }

  // ── viewStore 实例销毁 ──

  /**
   * 销毁指定视图对应的 viewStore 实例（从 Pinia 内部 Map 中删除）。
   * 节点被删除时，其对应的视图 store 应一并销毁以释放内存。
   */
  function destroyView(id: string): void {
    const pinia = getActivePinia()
    if (pinia) {
      ;((pinia as unknown) as { _s: Map<string, unknown> })._s.delete(`view-${id}`)
    }
  }

  /** 批量销毁视图 store 实例 */
  function destroyViews(ids: string[]): void {
    for (const id of ids) destroyView(id)
  }

  return {
    // 活跃视图
    activeViewId,
    rootViewId,
    // 项目名
    projectName,
    setProjectName,
    // 树展开
    expandedIds,
    toggleExpand,
    expand,
    // 视图切换
    switchView,
    // viewStore 生命周期
    destroyView,
    destroyViews,
  }
})
