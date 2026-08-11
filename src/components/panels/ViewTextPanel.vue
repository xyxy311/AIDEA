<script setup lang="ts">
/**
 * ViewTextPanel - 转化为文本面板（左侧活动栏面板之一）
 *
 * 把当前视图（project.currentNodeId 的直接子级）按空间位置编排成格式化文本，
 * 供 AI / 其它上下文函数理解项目内容。本次不接通 AI，仅提供生成与复制。
 *
 * 算法来自 utils/viewText.ts 的注册表（VIEW_TEXT_ALGORITHMS），本组件只读表，
 * 通过统一调度器 buildViewText 分发；参数控件依据所选算法的 params schema 动态渲染。
 */
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { NSelect, NInputNumber, NSwitch, NButton, NInput, NEmpty, NScrollbar } from 'naive-ui'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { VIEW_TEXT_ALGORITHMS, getViewTextAlgorithm, buildViewText } from '@/utils/viewText'
import { t } from '@/composables/useT'

const project = useProjectStore()
const nodeStore = useNodeStore()

/** 当前视图节点（直接子级） */
const viewNodes = computed(() => nodeStore.childrenOf(project.currentNodeId))

/** 算法下拉选项（来自注册表） */
const algorithmOptions = computed(() =>
  VIEW_TEXT_ALGORITHMS.map((a) => ({ label: t(a.labelKey), value: a.id })),
)

/** 当前选中算法 id（默认第一个注册算法） */
const algoId = ref(VIEW_TEXT_ALGORITHMS[0]?.id ?? 'rowCluster')

/** 当前算法定义（未命中回退到第一个注册算法） */
const currentAlgo = computed(
  () => getViewTextAlgorithm(algoId.value) ?? VIEW_TEXT_ALGORITHMS[0],
)

/** 参数值字典（按当前算法 params schema 初始化） */
const paramValues = reactive<Record<string, number | boolean | string>>({})

/** 用当前算法 schema 的默认值初始化参数字典 */
function initParams(): void {
  for (const key of Object.keys(paramValues)) delete paramValues[key]
  for (const p of currentAlgo.value?.params ?? []) {
    paramValues[p.key] = p.default
  }
}

// 切换算法时重置为该算法默认值；挂载时初始化
watch(algoId, initParams)
onMounted(initParams)

/** 把 select 参数的 options 映射为 NSelect 所需的 { label, value } 数组 */
function selectOptions(p: { options?: Array<{ labelKey: string; value: string }> }) {
  return (p.options ?? []).map((o) => ({ label: t(o.labelKey), value: o.value }))
}

/** 生成结果文本 */
const result = ref('')

/** 生成按钮是否可用 */
const canGenerate = computed(() => viewNodes.value.length > 0)

/** 生成文本：取当前视图节点 → 调度器（携带当前参数） → 写入 result */
function generate(): void {
  if (!canGenerate.value) return
  result.value = buildViewText(viewNodes.value, algoId.value, { ...paramValues })
}

/** 复制状态（成功后按钮短暂显示"已复制"） */
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

/** 复制结果到剪贴板 */
async function copyResult(): Promise<void> {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1500)
  } catch {
    // 剪贴板不可用时静默失败（保留按钮原样）
  }
}
</script>

<template>
  <div class="view-text-panel">
    <div class="view-text-config">
      <div class="config-row">
        <label class="config-label">{{ t('viewTextPanel.algorithm') }}</label>
        <NSelect v-model:value="algoId" size="small" class="config-control" :options="algorithmOptions" />
      </div>

      <div v-for="p in currentAlgo?.params ?? []" :key="p.key" class="config-row">
        <label class="config-label">{{ t(p.labelKey) }}</label>
        <NInputNumber
          v-if="p.type === 'number'"
          v-model:value="paramValues[p.key] as number"
          :step="p.step"
          size="small"
          class="config-control"
        />
        <NSwitch v-else-if="p.type === 'boolean'" v-model:value="paramValues[p.key] as boolean" size="small" />
        <NSelect
          v-else-if="p.type === 'select'"
          v-model:value="paramValues[p.key] as string"
          size="small"
          class="config-control"
          :options="selectOptions(p)"
        />
      </div>

      <NButton size="small" type="primary" block :disabled="!canGenerate" class="generate-btn" @click="generate">
        {{ t('viewTextPanel.generate') }}
      </NButton>
    </div>

    <NScrollbar class="view-text-result">
      <NEmpty v-if="viewNodes.length === 0" :description="t('viewTextPanel.empty')" size="small" />
      <template v-else>
        <div class="result-toolbar">
          <NButton size="tiny" :disabled="!result" @click="copyResult">
            {{ copied ? t('viewTextPanel.copied') : t('viewTextPanel.copy') }}
          </NButton>
        </div>
        <NInput
          v-model:value="result"
          type="textarea"
          readonly
          :autosize="{ minRows: 8, maxRows: 24 }"
          :placeholder="t('viewTextPanel.resultPlaceholder')"
          class="result-input"
        />
      </template>
    </NScrollbar>
  </div>
</template>

<style scoped>
.view-text-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.view-text-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-label {
  flex-shrink: 0;
  width: 88px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.config-control {
  flex: 1;
  min-width: 0;
}

.generate-btn {
  margin-top: 4px;
}

.view-text-result {
  flex: 1;
}

.result-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 6px 8px 0;
}

.result-input {
  margin: 4px 8px 8px;
  width: calc(100% - 16px);
}
</style>