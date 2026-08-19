<script setup lang="ts">
/**
 * NodeItem - 纯展示组件
 *
 * 用于「可引用节点面板」与「搜索面板」统一展示节点行内容：
 * - 标题（首行）＋ 标签胶囊 ＋ 路径 + 悬停工具提示。
 * - 不持有面板交互与数据适配逻辑：面板经 `#title` / `#body` 插槽注入标题/正文，
 *   NodeItem 抽象了标题省略、标签渲染与路径展示，并负责 Tooltip。
 *
 * 纯展示逻辑（路径截断/拼接）在 utils/nodePath，可单测；
 * 标签数据经 node.tagIds → tagsStore 推导，路径数据经 nodeStore 推导。
 */
import { computed } from 'vue'
import { NTooltip } from 'naive-ui'
import type { WhiteboardNode } from '@/types/node'
import { useNodeStore, ROOT_NODE_ID } from '@/stores/node'
import { useTagsStore } from '@/stores/tags'
import {
  TAG_CAPSULE_MAX,
  TAG_CAPSULE_RADIUS,
  TAG_CAPSULE_FONT_SIZE,
  TAG_CAPSULE_PADDING_X,
} from '@/constants'
import { getContrastTextColor } from '@/utils/color'
import { buildDisplayPath } from '@/utils/nodePath'
import { t } from '@/composables/useT'

const props = withDefaults(
  defineProps<{
    node: WhiteboardNode // 待展示节点（根节点 text 即项目名）
    showPath?: boolean // 默认 true：展示路径行 / 悬停提示中的路径
    showTags?: boolean // 默认 true：标题行右侧展示标签胶囊
  }>(),
  { showPath: true, showTags: true },
)

// ── slots 声明（#title / #body 均带 { node } 默认作用域） ──
defineSlots<{
  title?: (scope: { node: WhiteboardNode }) => unknown
  body?: (scope: { node: WhiteboardNode }) => unknown
}>()

const nodeStore = useNodeStore()
const tagsStore = useTagsStore()

/** 节点文本首行（标题/提示词用） */
const firstLine = computed(() => props.node.text.split('\n')[0].trim() || '')

// ── 路径推导 ──
// nodeStore.pathToRoot 返回 [自身, ..., root]（自身在前、root 在后）。
// slice(1).reverse() 得 [root, ..., 最近父]；再滤掉根节点 id，
// 得到「根 → 最近父、不含根名」的名字数组（buildDisplayPath 用前导 "/" 表示根）。
const ancestorNames = computed<string[]>(() => {
  const ids = nodeStore
    .pathToRoot(props.node.id)
    .slice(1) // 去掉自身
    .reverse() // root 在前、最近父在后
    .filter((id) => id !== ROOT_NODE_ID) // 根名不参与展示，用前导 "/" 代指根
  return ids.map((id) => nodeStore.getNode(id)?.text?.split('\n')[0].trim() ?? '')
})

/** 完整路径（tooltip 用，自带前导 "/"） */
const fullPath = computed(() => buildDisplayPath(ancestorNames.value).full)

/** 展示路径（截断后的串，路径行用，自带前导 "/"；根直接子级为 "/"） */
const displayPath = computed(() => buildDisplayPath(ancestorNames.value).display)

/**
 * 路径是否展示：非根节点即有路径（两面板都不含 root，故恒显示；最浅为 "/"）。
 * 防御：根自身（parentId === null）不显示路径行、tooltip 内也不显示路径项。
 */
const hasPath = computed(() => props.node.parentId !== null)

// ── 标签推导 ──
// node.tagIds → getTag 过滤悬空引用；仅展示前 TAG_CAPSULE_MAX 个 + 溢出 "+N"
const validTags = computed(() =>
  props.node.tagIds.map((id) => tagsStore.getTag(id)).filter((t) => !!t),
)

/** 实际渲染的胶囊列表（截断到 TAG_CAPSULE_MAX 个） */
const tagCapsules = computed(() => validTags.value.slice(0, TAG_CAPSULE_MAX))

/** 溢出数量（标签总数 - 展示上限，大于 0 时渲染 "+N"） */
const overflowCount = computed(() => validTags.value.length - TAG_CAPSULE_MAX)
</script>

<template>
  <!-- 悬停提示延迟 1000ms：降低鼠标扫过行时频繁弹层的干扰 -->
  <NTooltip position="top" :delay="1000" :disabled="false">
    <template #trigger>
      <div class="ni-item">
        <!-- 标题行：标题内容（可被 slot 覆盖）+ 标签胶囊 -->
        <div class="ni-title">
          <div class="ni-title-content">
            <slot name="title" :node="node">{{ firstLine }}</slot>
          </div>
          <!-- 标签胶囊（标题行右侧） -->
          <div v-if="showTags && tagCapsules.length" class="ni-tags">
            <span
              v-for="tag in tagCapsules"
              :key="tag.id"
              class="ni-capsule"
              :style="{
                background: tag.color,
                color: getContrastTextColor(tag.color),
                borderRadius: `${TAG_CAPSULE_RADIUS}px`,
                fontSize: `${TAG_CAPSULE_FONT_SIZE}px`,
                padding: `0 ${TAG_CAPSULE_PADDING_X}px`,
              }"
            >
              {{ tag.name }}
            </span>
            <!-- 溢出计数：总数超上限时显示 "+N"（chrome 色，略淡） -->
            <span v-if="overflowCount > 0" class="ni-capsule ni-capsule-overflow">
              +{{ overflowCount }}
            </span>
          </div>
        </div>

        <!-- 可选正文行（如搜索命中片段）；未提供则整行隐藏，样式由 .ni-body 统一负责 -->
        <div v-if="$slots.body" class="ni-body">
          <slot name="body" :node="node" />
        </div>

        <!-- 路径行：ancestorNames 为空（根自身等防御场景）时隐藏 -->
        <div v-if="showPath && hasPath" class="ni-path">{{ displayPath }}</div>
      </div>
    </template>

    <!-- 悬停提示：完整路径 + 标签 + 名称 -->
    <div class="ni-tooltip">
      <div v-if="hasPath">{{ t('nodeItem.path') }}：{{ fullPath }}</div>
      <div v-if="showTags && validTags.length">{{ t('nodeItem.tags') }}：{{ validTags.map((tag) => tag.name).join('、') }}</div>
      <div>{{ t('nodeItem.title') }}：{{ firstLine }}</div>
    </div>
  </NTooltip>
</template>

<style scoped>
/* 组件顶层样式——面板侧把 NodeItem 放进 flex 行时，占满剩余宽度并允许省略 */
.ni-item {
  flex: 1;
  min-width: 0;
}

/* 标题行：纵向排列的容器（标题 + 标签），标题字色、无换行省略 */
.ni-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 标题内容容器：占满剩余宽度，单行省略 */
.ni-title-content {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--color-text);
}

/* 标签胶囊容器（标题行右侧，不参与省略） */
.ni-tags {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* 标签胶囊本体：颜色来自数据色（Tag.color），文字对比色经 getContrastTextColor 派生 */
.ni-capsule {
  border-radius: 9px;
  font-size: 11px;
  padding: 0 6px;
  margin-left: 2px;
  line-height: 1.6;
  white-space: nowrap;
}

/* 溢出计数 "+N"：用 chrome 色淡显（区别于普通数据色胶囊） */
.ni-capsule-overflow {
  background: var(--color-hover);
  color: var(--color-text-muted);
  border: 1px solid var(--color-text-muted);
}

/* 可选正文行：颜色略淡、单行省略 */
.ni-body {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 2px 0 0;
}

/* 路径行：字色最淡、单行省略 */
.ni-path {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

/* 悬停提示内容：多行纵向排列 */
.ni-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}
</style>