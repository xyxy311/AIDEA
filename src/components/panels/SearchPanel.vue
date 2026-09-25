<script setup lang="ts">
/**
 * SearchPanel - 节点搜索面板：输入关键字全局搜索节点文本，列出匹配节点并高亮命中片段，
 * 支持范围（项目/当前视图）与按标签过滤，单击进入对应子视图。搜索逻辑为纯函数 utils/search.ts。
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

/** 标签下拉选项：value=id，label 由 render-label 渲染色点前缀 */
const tagOptions = computed(() =>
  tagsStore.tagList.map((tag) => ({
    label: tag.name,
    value: tag.id,
    tagColor: tag.color,
  })),
)

/** 下拉选项渲染：名称前附色点 */
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

/** 消费待处理聚焦标志并聚焦输入框（下一帧执行，确保已渲染） */
function consumeFocus(): void {
  if (!pendingSearchFocus.value) return
  pendingSearchFocus.value = false
  nextTick(() => inputEl.value?.focus?.())
}

// 面板打开时 watch 聚焦；收起未挂载时靠 onMounted 消费，保证按一次 Ctrl+F 即聚焦
watch(pendingSearchFocus, consumeFocus)
onMounted(consumeFocus)

/**
 * 跨面板清理：标签被删除后 selectedTagIds 可能残留已删 id，导致搜索结果变空，监听 tagList 剔除。
 */
watch(
  () => tagsStore.tagList,
  (list) => {
    const validIds = new Set(list.map((tag) => tag.id))
    selectedTagIds.value = selectedTagIds.value.filter((id) => validIds.has(id))
  },
)

/**
 * 搜索结果。nodeStore.nodes 为 reactive(Map)，文本/增删节点自动触发重算；
 * scope='view' 仅搜当前视图直接子级；selectedTagIds 为 AND 语义（须同时含全部所选标签）。
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
      <div v-if="!query.trim()" class="search-empty">
        <NEmpty :description="t('leftSidebar.searchHint')" size="small" />
      </div>

      <div v-else-if="results.length === 0" class="search-empty">
        <NEmpty :description="t('leftSidebar.searchEmpty')" size="small" />
      </div>

      <div v-else class="search-list">
        <div
          v-for="res in results"
          :key="res.nodeId"
          class="search-item"
          :class="{ active: res.nodeId === project.currentNodeId }"
          @click="handleSwitch(res.nodeId)"
        >
          <NodeItem :node="nodeStore.getNode(res.nodeId)!">
            <template #title>
              <template v-for="(seg, i) in res.title" :key="i">
                <mark v-if="seg.match" class="hl">{{ seg.text }}</mark>
                <span v-else>{{ seg.text }}</span>
              </template>
            </template>
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