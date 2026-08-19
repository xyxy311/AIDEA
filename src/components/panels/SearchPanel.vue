<script setup lang="ts">
/**
 * SearchPanel - 节点搜索面板（左侧活动栏面板之一）
 *
 * 输入关键字，全局搜索所有节点文本（排除根节点），下方列出匹配节点：
 * - 每行两行展示：标题行 + 命中行片段（命中在首行时不重复展示 body）
 * - 命中片段高亮显示
 * - 单击 → 进入该节点子视图
 *
 * 搜索逻辑为纯函数（utils/search.ts），本组件只负责输入、渲染与导航。
 */
import { ref, computed, watch, nextTick, onMounted, h } from 'vue'
import { NInput, NScrollbar, NEmpty, NSelect } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { useTagsStore } from '@/stores/tags'
import { searchNodes, type SearchScope } from '@/utils/search'
import { t } from '@/composables/useT'
import { pendingSearchFocus } from '@/composables/useSearchFocus'
import NodeItem from '@/components/common/NodeItem.vue'

const project = useProjectStore()
const nodeStore = useNodeStore()
const tagsStore = useTagsStore()

const query = ref('')

/** 搜索范围：整个项目 / 当前视图 */
const scope = ref<SearchScope>('project')

/** 按标签过滤：选中的标签 id 集合（AND 语义，空/未选 = 不过滤） */
const selectedTagIds = ref<string[]>([])

/** 范围下拉选项 */
const scopeOptions = computed(() => [
  { label: t('leftSidebar.searchScopeProject'), value: 'project' },
  { label: t('leftSidebar.searchScopeView'), value: 'view' },
])

/** 标签下拉选项：value=id，label 由 render-label 渲染色点前缀（呼应"色=标签"） */
const tagOptions = computed(() =>
  tagsStore.tagList.map((tag) => ({
    label: tag.name,
    value: tag.id,
    tagColor: tag.color,
  })),
)

/** 标签下拉选项渲染：名称前附色点（数据色，来自 Tag.color） */
function renderTagLabel(option: { label: string; tagColor?: string }) {
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, [
    h('span', {
      style: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: option.tagColor ?? '#9ca3af',
        flexShrink: '0',
      },
    }),
    option.label,
  ])
}

/** 搜索输入框 ref（供聚焦） */
const inputEl = ref<InstanceType<typeof NInput> | null>(null)

/** 消费待处理聚焦标志并聚焦到输入框（下一帧执行，确保输入框已渲染） */
function consumeFocus(): void {
  if (!pendingSearchFocus.value) return
  pendingSearchFocus.value = false
  nextTick(() => inputEl.value?.focus?.())
}

// 面板已打开时：Ctrl/Cmd + F 触发 watch 聚焦
watch(pendingSearchFocus, consumeFocus)

// 面板收起时未挂载、watch 未生效；挂载后消费待处理标志，保证按一次 Ctrl+F 即聚焦
onMounted(consumeFocus)

/**
 * 跨面板清理：标签定义被删除（TagsPanel 删标签）后，selectedTagIds 可能残留
 * 已删除的 id，导致搜索时 tagIds.every 对全部节点返回 false、结果为空。
 * 监听 tagList 变化，把已不存在的标签 id 从选中集合中剔除。
 */
watch(
  () => tagsStore.tagList,
  (list) => {
    const validIds = new Set(list.map((tag) => tag.id))
    selectedTagIds.value = selectedTagIds.value.filter((id) => validIds.has(id))
  },
)

/**
 * 搜索结果。
 * nodeStore.nodes 为 reactive(Map)，文本修改 / 增删节点会自动触发重算。
 * scope='view' 时仅搜索当前视图（project.currentNodeId）的直接子级。
 * selectedTagIds 变化同样会触发重算（AND 语义：须同时包含全部所选标签）。
 */
const results = computed(() =>
  searchNodes(Array.from(nodeStore.nodes.values()), query.value, {
    scope: scope.value,
    viewedNodeId: project.currentNodeId,
    tagIds: selectedTagIds.value,
  }),
)

function handleSwitch(nodeId: string): void {
  project.switchView(nodeId)
}
</script>

<template>
  <div class="search-panel">
    <!-- 搜索区域 -->
    <div class="search-input-wrap">
      <div class="search-toolbar">
        <NSelect
          v-model:value="scope"
          :options="scopeOptions"
          size="small"
          class="scope-select"
        />
      </div>
      <NInput
        ref="inputEl"
        v-model:value="query"
        class="search-input"
        size="small"
        clearable
        :placeholder="t('leftSidebar.searchPlaceholder')"
      >
        <template #prefix><SearchOutline class="search-icon" /></template>
      </NInput>

      <!-- 按标签过滤（无标签定义时不显示，避免空下拉干扰） -->
      <NSelect
        v-if="tagsStore.tagList.length > 0"
        v-model:value="selectedTagIds"
        multiple
        filterable
        clearable
        size="small"
        class="tag-filter-select"
        :options="tagOptions"
        :render-label="renderTagLabel"
        :placeholder="t('leftSidebar.searchTagPlaceholder')"
      />
    </div>

    <NScrollbar class="search-scroll">
      <!-- 未输入 -->
      <div v-if="!query.trim()" class="search-empty">
        <NEmpty :description="t('leftSidebar.searchHint')" size="small" />
      </div>

      <!-- 无结果 -->
      <div v-else-if="results.length === 0" class="search-empty">
        <NEmpty :description="t('leftSidebar.searchEmpty')" size="small" />
      </div>

      <!-- 结果列表 -->
      <div v-else class="search-list">
        <div
          v-for="res in results"
          :key="res.nodeId"
          class="search-item"
          :class="{ active: res.nodeId === project.currentNodeId }"
          @click="handleSwitch(res.nodeId)"
        >
          <!-- NodeItem 统一渲染标题 + 标签 + 路径 + 悬停提示（标题/正文高亮经 slot 注入） -->
          <NodeItem :node="nodeStore.getNode(res.nodeId)!">
            <!-- 标题行高亮分段 -->
            <template #title>
              <template v-for="(seg, i) in res.title" :key="i">
                <mark v-if="seg.match" class="hl">{{ seg.text }}</mark>
                <span v-else>{{ seg.text }}</span>
              </template>
            </template>
            <!-- 命中行片段（命中在首行时不展示） -->
            <template #body v-if="res.body">
              <template v-for="(seg, i) in res.body" :key="i">
                <mark v-if="seg.match" class="hl">{{ seg.text }}</mark>
                <span v-else>{{ seg.text }}</span>
              </template>
            </template>
          </NodeItem>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 搜索区域 */
.search-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

/* 范围下拉工具行 */
.search-toolbar {
  display: flex;
  align-items: center;
}

.scope-select {
  width: 100%;
}

.search-input {
  width: 100%;
}

/* 按标签过滤下拉：与 scope/input 同宽同 size，间距沿用 wrap 的 gap */
.tag-filter-select {
  width: 100%;
}

.search-icon {
  font-size: 14px;
  color: var(--color-text-muted);
}

.search-scroll {
  flex: 1;
}

.search-empty {
  padding: 24px 0;
}

.search-list {
  padding: 4px;
}

.search-item {
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: var(--color-hover);
}

.search-item.active {
  background: var(--color-active-bg);
  border: 1px solid var(--color-active-border);
}

/* 命中高亮：主色淡底 + 主色文字 */
.hl {
  background: var(--color-primary-soft);
  color: var(--color-primary-pressed);
  border-radius: 2px;
  padding: 0 1px;
}
</style>