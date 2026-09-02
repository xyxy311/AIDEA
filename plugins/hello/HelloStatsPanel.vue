<script setup lang="ts">
/**
 * HelloStatsPanel —— 示例插件「统计助手」面板（纯内容组件，无自带 header，由外层 DockPanel 提供壳）。
 *
 * 演示：
 * - 只读查询：`createPluginApi()` 的 view/project stats（当前视图子级数 / 连线数 / 字数、总节点 / 引用）。
 * - additions 项目化数据：adapter 共享 api 的 additions 为只读域（写方法抛错），
 *   因此这里用 `createAdditionsApi('hello')` 构造插件作用域的 additions api，演示 set/get/undo。
 *   普通意图下插件应经 setup 的 `ctx.adapter.api.additions` 获得作用域 api；此处面板独立于 setup
 *   运行，故手动构造同作用域实例。
 * 文本朴素，样式用项目通用 token（var(--color-*)）。
 */
import { ref, onMounted } from 'vue'
import { NButton, NText } from 'naive-ui'
import { createPluginApi } from '@/plugin/adapter'
import { createAdditionsApi } from '@/plugin/api'

const api = createPluginApi()
const additions = createAdditionsApi('hello')

/** 演示键（插件作用域内短键，api 内部自动加 `hello:` 前缀） */
const DEMO_KEY = 'demo'

/** 当前 additions demo 值（JSON 字符串展示） */
const demoValue = ref<string | null>(null)

/** 当前视图 / 项目统计（可响应式重算） */
const viewStats = () => api.view.stats()
const projectStats = () => api.project.stats()

function refreshDemo(): void {
  const v = additions.get(DEMO_KEY)
  demoValue.value = v === undefined || v === null ? null : JSON.stringify(v)
}

/** 写入示例 additions（一次 set = 单条历史） */
function writeDemo(): void {
  additions.set(DEMO_KEY, { ts: Date.now(), note: '来自示例插件' })
  refreshDemo()
}

/** 用撤销回退最后一步 additions 写入（演示 api.project.undo() 可回退 additions） */
function undoDemo(): void {
  api.project.undo()
  refreshDemo()
}

onMounted(refreshDemo)
</script>

<template>
  <div class="hello-stats">
    <div class="stats-row"><NText depth="3">当前视图</NText><NText>{{ viewStats().viewedNodeId }}</NText></div>
    <div class="stats-row"><NText depth="3">直接子级数</NText><NText>{{ viewStats().childCount }}</NText></div>
    <div class="stats-row"><NText depth="3">连线数</NText><NText>{{ viewStats().connectionCount }}</NText></div>
    <div class="stats-row"><NText depth="3">引用数（#）</NText><NText>{{ viewStats().directReferenceCount }}</NText></div>
    <div class="stats-row"><NText depth="3">子级字数</NText><NText>{{ viewStats().totalWords }}</NText></div>
    <div class="divider" />
    <div class="stats-row"><NText depth="3">项目总节点</NText><NText>{{ projectStats().totalNodes }}</NText></div>
    <div class="stats-row"><NText depth="3">项目引用数</NText><NText>{{ projectStats().totalReferences }}</NText></div>

    <div class="divider" />
    <div class="additions-block">
      <div class="additions-title">示例 additions（键 <code>demo</code>）</div>
      <div class="additions-value">
        <span v-if="demoValue">{{ demoValue }}</span>
        <span v-else class="additions-empty">（空）</span>
      </div>
      <div class="additions-actions">
        <NButton size="small" type="primary" @click="writeDemo">写入示例 additions</NButton>
        <NButton size="small" @click="undoDemo">撤销（回退 additions）</NButton>
      </div>
      <div class="additions-hint">说明：additions 进项目保存、可经「撤销」回退。</div>
    </div>
  </div>
</template>

<style scoped>
.hello-stats {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.divider {
  border-top: 1px solid var(--color-border);
  margin: 4px 0;
}

.additions-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.additions-title {
  font-size: 13px;
  color: var(--color-text);
}

.additions-value {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-hover);
  font-size: 12px;
  overflow-wrap: break-word;
}

.additions-actions {
  display: flex;
  gap: 8px;
}

.additions-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.additions-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>