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
import { ref, computed } from 'vue'
import { NInput, NScrollbar, NEmpty } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { searchNodes } from '@/utils/search'
import { t } from '@/composables/useT'

const project = useProjectStore()
const nodeStore = useNodeStore()

const query = ref('')

/**
 * 搜索结果。
 * nodeStore.nodes 为 reactive(Map)，文本修改 / 增删节点会自动触发重算。
 */
const results = computed(() =>
  searchNodes(Array.from(nodeStore.nodes.values()), query.value),
)

function handleSwitch(nodeId: string): void {
  project.switchView(nodeId)
}
</script>

<template>
  <div class="search-panel">
    <!-- 面板标题栏 -->
    <div class="panel-header">
      <span class="panel-title">{{ t('leftSidebar.search') }}</span>
    </div>

    <!-- 搜索输入框 -->
    <div class="search-input-wrap">
      <NInput
        v-model:value="query"
        class="search-input"
        size="small"
        clearable
        :placeholder="t('leftSidebar.searchPlaceholder')"
      >
        <template #prefix><SearchOutline class="search-icon" /></template>
      </NInput>
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
          <!-- 标题行 -->
          <p class="search-title">
            <template v-for="(seg, i) in res.title" :key="i">
              <mark v-if="seg.match" class="hl">{{ seg.text }}</mark>
              <span v-else>{{ seg.text }}</span>
            </template>
          </p>
          <!-- 命中行片段（命中在首行时不展示） -->
          <p v-if="res.body" class="search-body">
            <template v-for="(seg, i) in res.body" :key="i">
              <mark v-if="seg.match" class="hl">{{ seg.text }}</mark>
              <span v-else>{{ seg.text }}</span>
            </template>
          </p>
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

/* 标题栏 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 搜索输入框 */
.search-input-wrap {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
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

/* 标题行：单行省略号 */
.search-title {
  margin: 0;
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 命中行片段：单行省略号，颜色略淡 */
.search-body {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 命中高亮：主色淡底 + 主色文字 */
.hl {
  background: var(--color-primary-soft);
  color: var(--color-primary-pressed);
  border-radius: 2px;
  padding: 0 1px;
}
</style>