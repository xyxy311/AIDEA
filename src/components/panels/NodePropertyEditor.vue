<script setup lang="ts">
/**
 * NodePropertyEditor - 节点属性编辑面板：修改选中节点的文本与外观样式。
 * 预设管理已移至左侧「预设管理」面板与浮动编辑器，此处不再展示。
 */
import { ref, computed, nextTick, h } from 'vue'
import {
  NInput,
  NColorPicker,
  NForm,
  NFormItem,
  NText,
  NDivider,
  NTag,
  NSelect,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import { useActiveView } from '@/composables/useActiveView'
import { t } from '@/composables/useT'
import { useTagsStore } from '@/stores/tags'
import { useNodeStore } from '@/stores/node'
import { DEFAULT_NODE_STYLE } from '@/constants'
import { extractReferenceName } from '@/utils/reference'
import { useReferenceAutocomplete, type AutocompleteCandidate } from '@/composables/useReferenceAutocomplete'
import TextAutocomplete from '@/components/canvas/TextAutocomplete.vue'

const active = useActiveView()
const tagsStore = useTagsStore()
const message = useMessage()
const nodeStore = useNodeStore()

// ── @ 补全（共享逻辑 + 输入框 ref / 下拉定位） ──
const autocomplete = useReferenceAutocomplete()
const inputRef = ref()
const dropdownPos = ref({ x: 0, y: 0 })
/** 重名冲突时强制 NInput 重建重读 get 值 */
const forceTextKey = ref(0)

/** 定位在内部 textarea 元素下方 */
function updateDropdownPos(): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  if (!ta) return
  const rect = ta.getBoundingClientRect()
  dropdownPos.value = { x: rect.left, y: rect.top + rect.height }
}

/** naive NInput @input 签名：接收 (value: string) */
function onNInputInput(value: string): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const cursor = ta?.selectionStart ?? value.length
  autocomplete.handleInput(value, cursor)
  if (autocomplete.visible.value) updateDropdownPos()
}

/** 点击补全候选：插入引用名并重置光标 */
function handleAutocompleteSelect(candidate: AutocompleteCandidate): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const text = node.value?.text ?? ''
  const cursor = ta?.selectionStart ?? text.length
  const result = autocomplete.insertCandidate(text, cursor, candidate.name)
  currentText.value = result.insertedText
  autocomplete.close()
  nextTick(() => {
    const t = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
    t?.setSelectionRange(result.newCursorPos, result.newCursorPos)
    t?.focus()
  })
}

/** naive NInput @keydown：处理补全键盘导航 */
function onNInputKeydown(e: KeyboardEvent): void {
  const ta = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
  const text = currentText.value
  const cursor = ta?.selectionStart ?? text.length
  const result = autocomplete.handleKeydown(e, text, cursor)
  if (result === 'handled') return
  if (result !== 'unhandled' && typeof result === 'object') {
    e.preventDefault()
    currentText.value = result.insertedText // 触发 setter（插入的是已有引用名不会冲突）
    nextTick(() => {
      const t = inputRef.value?.textareaElRef as HTMLTextAreaElement | undefined
      t?.setSelectionRange(result.newCursorPos, result.newCursorPos)
    })
    return
  }
}

// 选中的节点信息
const node = computed(() => active.nodeStore.getNode(active.view.selectedNodeId))
const selectedCount = computed(() => active.view.selectedNodeIds.size)

const currentText = computed({
  get: () => node.value?.text ?? '',
  set: (val: string) => {
    if (!node.value) return
    // 校验引用名重名（单选时；多选时 setNodesText 会整体失败，这里也拦）
    const refName = extractReferenceName(val)
    const selectedId = active.view.selectedNodeId
    if (refName && selectedId && nodeStore.isReferenceNameTaken(refName, selectedId)) {
      autocomplete.close()
      message.warning(t('nodeEditor.referenceNameConflict', { name: refName }))
      // 回滚：通过 forceKey 强制 NInput 重新读取 get 值
      forceTextKey.value++
      return
    }
    active.updateSelectedNodesText(val)
  },
})

const currentBorderColor = computed({
  get: () => node.value?.borderColor ?? DEFAULT_NODE_STYLE.borderColor,
  set: (val: string | null) => {
    if (!node.value || !val) return
    active.updateSelectedNodesStyle({ borderColor: val })
  },
})

const colorPickerMode = 'hex' as const

// ── 标签（单选节点可编辑；多选节点禁用并提示） ──

/** 标签下拉选项：label=名称带色点，value=标签 id */
const tagOptions = computed(() =>
  tagsStore.tagList.map((tag) => ({
    label: tag.name,
    value: tag.id,
    tagColor: tag.color,
  })),
)

/**
 * 当前节点的标签 id 集合（可写）。
 * 取/写都过滤悬空引用（可能含已删除标签的 id，见 types/node.ts 注释），
 * 渲染时用 getTag 过滤 undefined，避免下拉出现无效 chip。
 */
const selectedTagIds = computed({
  // 多选时返回所有选中节点共同包含的标签（交集）；单选即该节点自身标签。过滤悬空引用。
  get: () => {
    const ids = Array.from(active.view.selectedNodeIds)
    if (ids.length === 0) return []
    let common: string[] | null = null
    for (const id of ids) {
      const n = active.nodeStore.getNode(id)
      const tags: string[] = (n?.tagIds ?? []).filter((tid) => tagsStore.getTag(tid))
      if (common === null) common = [...tags]
      else common = common.filter((tid) => tags.includes(tid))
    }
    return common ?? []
  },
  set: (val: string[]) => {
    const ids = Array.from(active.view.selectedNodeIds)
    if (ids.length === 0) return
    // 变更前各节点共同标签（用于判定用户取消勾选的标签）
    const prevCommon = selectedTagIds.value
    const perNode = ids.map((id) => {
      const n = active.nodeStore.getNode(id)
      const cur = n?.tagIds ?? []
      // 移除「原本共同含、本次被取消」的标签
      const removed = prevCommon.filter((tid) => !val.includes(tid))
      // 补上选中的、该节点尚未含的标签
      const next = cur.filter((tid) => !removed.includes(tid))
      for (const tid of val) if (!next.includes(tid)) next.push(tid)
      return next
    })
    active.updateSelectedNodesTagsPerNode(perNode)
  },
})

/** 取下拉选项的自定义色点色（Vue 模板不支持类型断言，故抽取为函数） */
function tagOptionColor(option: { tagColor?: string }): string {
  return option.tagColor ?? '#9ca3af'
}

/** 标签下拉选项渲染：名称前附色点（数据色，来自 Tag.color） */
function renderTagLabel(option: { label: string; tagColor?: string }) {
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, [
    h('span', {
      style: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: tagOptionColor(option),
        flexShrink: '0',
      },
    }),
    option.label,
  ])
}
</script>

<template>
  <div class="property-editor" v-if="node">
    <!-- 多选提示 -->
    <div class="multi-select-hint">
      <NTag size="small" type="info" :bordered="false">
        {{ t('nodeEditor.selectedCount', { count: selectedCount }) }}
      </NTag>
    </div>

    <NForm label-placement="top" size="small">
      <!-- 文本 -->
      <NFormItem :label="t('nodeEditor.textContent')">
        <NInput
          :key="forceTextKey"
          ref="inputRef"
          v-model:value="currentText"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :placeholder="t('nodeEditor.textPlaceholder')"
          @input="onNInputInput"
          @keydown="onNInputKeydown"
        />
        <TextAutocomplete
          :visible="autocomplete.visible.value"
          :x="dropdownPos.x"
          :y="dropdownPos.y"
          :candidates="autocomplete.candidates.value"
          :active-index="autocomplete.activeIndex.value"
          @select="handleAutocompleteSelect"
          @close="autocomplete.close"
        />
      </NFormItem>

      <NDivider style="margin: 8px 0" />

      <!-- 外观样式 -->
      <NText depth="3" style="font-size: 12px; font-weight: 600">{{ t('nodeEditor.appearance') }}</NText>

      <NFormItem :label="t('nodeEditor.borderColor')">
        <NColorPicker
          v-model:value="currentBorderColor"
          :modes="[colorPickerMode]"
          :show-alpha="true"
          size="small"
        />
      </NFormItem>
    </NForm>

    <!-- 标签区 -->
    <NDivider style="margin: 8px 0" />
    <NText depth="3" class="section-title">{{ t('nodeEditor.tags') }}</NText>

    <!-- 无标签定义 -->
    <div v-if="tagsStore.tagList.length === 0" class="tag-hint">
      <NText depth="3">{{ t('nodeEditor.tagsEmpty') }}</NText>
    </div>

    <!-- 任意选中数均可编辑 -->
    <NSelect
      v-else
      v-model:value="selectedTagIds"
      multiple
      filterable
      clearable
      size="small"
      :options="tagOptions"
      :render-label="renderTagLabel"
      :placeholder="t('nodeEditor.tagsPlaceholder')"
    />
  </div>

  <div v-else class="property-empty">
    <NText depth="3" style="font-size: 13px">{{ t('nodeEditor.selectNodeHint') }}</NText>
  </div>
</template>

<style scoped>
.property-editor {
  padding: 8px 12px;
}

.section-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0;
}

/* ── 标签区 ── */

.tag-hint {
  padding: 6px 2px;
  font-size: 12px;
}

.multi-select-hint {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.property-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
}
</style>