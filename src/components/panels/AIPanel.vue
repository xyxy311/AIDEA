<script setup lang="ts">
/**
 * AIPanel - AI 面板（左侧活动栏面板之一）
 *
 * 负责 AI 提交流程的 UI 编排，AI 生成逻辑与状态由 useAIWordPanel 统一管理：
 * - 全局提示词：项目级背景，直绑 project.globalPrompt（自动保存）。
 * - 当前视图设置：localPrompt / viewTextAlgoId 本地可编辑副本 + 深层 watch 自动保存；
 *   快速/精确模式由 useAIWordPanel 管理（setAIMode 写回 project）。
 * - 上下文预览 / 连词成句 / 直接生成 / 重新生成：全部经 useAIWordPanel 无参方法驱动，
 *   本组件只绑定状态并触发。
 */
import { ref, computed, reactive, watch, onMounted } from 'vue'
import type { Ref } from 'vue'
import {
  NSelect,
  NButton,
  NInput,
  NEmpty,
  NScrollbar,
  NSpin,
  NAlert,
} from 'naive-ui'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { VIEW_TEXT_ALGORITHMS } from '@/utils/viewText'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { t } from '@/composables/useT'

const project = useProjectStore()
const nodeStore = useNodeStore()
const {
  mode,
  previewText,
  sentenceText,
  generating,
  regenerating,
  sentenceLoading,
  error,
  directGenerate,
  regenerate,
  sentenceMaking,
  generatePreview,
  setAIMode,
  syncAIMode,
} = useAIWordPanel()

/** 当前视图节点（直接子级），用于空态判断 */
const viewNodes = computed(() => nodeStore.childrenOf(project.currentNodeId))

/** 空间布局算法下拉选项（来自注册表） */
const algorithmOptions = computed(() =>
  VIEW_TEXT_ALGORITHMS.map((a) => ({ label: t(a.labelKey), value: a.id })),
)

/** 处理模式选项：快速 / 精确（精确 = 先连词成句） */
const modeOptions = computed(() => [
  { label: t('aiPanel.modeFast'), value: 'fast' },
  { label: t('aiPanel.modePrecise'), value: 'precise' },
])

/**
 * 非模式字段的本地可编辑副本（localPrompt / viewTextAlgoId）。
 * 进入面板 / currentNodeId 变化时从 project.getAIConfig 重载；
 * 改动经深层 watch 自动保存（无需手动保存）。
 */
const currentCfg = reactive<{ localPrompt: string; viewTextAlgoId: string }>({
  localPrompt: project.getAIConfig(project.currentNodeId).localPrompt,
  viewTextAlgoId: project.getAIConfig(project.currentNodeId).viewTextAlgoId,
})

/** 从 project 重载本地副本，并同步 useAIWordPanel 的 AI 模式（切换视图时调用） */
function reloadConfig(): void {
  const cfg = project.getAIConfig(project.currentNodeId)
  currentCfg.localPrompt = cfg.localPrompt
  currentCfg.viewTextAlgoId = cfg.viewTextAlgoId
  syncAIMode()
}

// 切换当前视图时重载本地副本（避免把上一个节点的设置带到新视图）
watch(() => project.currentNodeId, reloadConfig)
onMounted(reloadConfig)

/** 配置改动自动保存到 project（深层 watch，覆盖各输入项；mode 取 useAIWordPanel 当前值） */
watch(
  currentCfg,
  () => {
    project.setNodeAIConfig(project.currentNodeId, {
      localPrompt: currentCfg.localPrompt,
      mode: mode.value,
      viewTextAlgoId: currentCfg.viewTextAlgoId,
    })
  },
  { deep: true },
)

/** 全局提示词输入：经 setGlobalPrompt 写 store（内部 markDataDirty），保证项目 dirty 正确标记 */
function onGlobalPromptInput(val: string): void {
  project.setGlobalPrompt(val)
}

/** 恢复默认：清空该节点覆盖，并把本地副本与 AI 模式重置为默认配置 */
function resetConfig(): void {
  project.clearNodeAIConfig(project.currentNodeId)
  const d = project.defaultAIConfig
  currentCfg.localPrompt = d.localPrompt
  currentCfg.viewTextAlgoId = d.viewTextAlgoId
  setAIMode(d.mode)
}

/**
 * 通用复制逻辑：把文本写入剪贴板并短暂显示「已复制」。
 * 剪贴板不可用时静默失败，保留按钮原样。
 */
function makeCopier(target: Ref<string>) {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  async function copy(): Promise<void> {
    if (!target.value) return
    try {
      await navigator.clipboard.writeText(target.value)
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => (copied.value = false), 1500)
    } catch {
      // 剪贴板不可用，静默
    }
  }
  return { copied, copy }
}

/** 预览结果复制（复用「已复制」交互） */
const previewCopy = makeCopier(previewText)
/** 连词成句结果复制 */
const sentenceCopy = makeCopier(sentenceText)
</script>

<template>
  <div class="ai-panel">
    <NScrollbar class="ai-scroll">
      <div v-if="viewNodes.length === 0" class="ai-empty">
        <NEmpty :description="t('aiPanel.empty')" size="small" />
      </div>

      <template v-else>
        <!-- 全局提示词（自动保存） -->
        <div class="ai-section">
          <label class="section-label">{{ t('aiPanel.globalPrompt') }}</label>
          <NInput
            :value="project.globalPrompt"
            @update:value="onGlobalPromptInput"
            type="textarea"
            size="small"
            :autosize="{ minRows: 2, maxRows: 6 }"
            :placeholder="t('aiPanel.globalPromptPlaceholder')"
          />
        </div>

        <!-- 当前视图设置（自动保存） -->
        <div class="ai-section">
          <label class="section-label">{{ t('aiPanel.sectionView') }}</label>

          <div class="config-row">
            <label class="config-label">{{ t('aiPanel.localPrompt') }}</label>
            <NInput
              v-model:value="currentCfg.localPrompt"
              type="textarea"
              size="small"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :placeholder="t('aiPanel.localPromptPlaceholder')"
            />
          </div>

          <div class="config-row">
            <label class="config-label">{{ t('aiPanel.mode') }}</label>
            <NSelect
              :value="mode"
              size="small"
              class="config-control"
              :options="modeOptions"
              @update:value="(v) => setAIMode(v as 'fast' | 'precise')"
            />
          </div>

          <div class="config-row">
            <label class="config-label">{{ t('aiPanel.viewTextAlgo') }}</label>
            <NSelect
              v-model:value="currentCfg.viewTextAlgoId"
              size="small"
              class="config-control"
              :options="algorithmOptions"
            />
          </div>

          <div class="config-row actions-row">
            <NButton size="small" class="reset-btn" @click="resetConfig">
              {{ t('aiPanel.reset') }}
            </NButton>
          </div>
        </div>

        <!-- 上下文预览（可编辑） -->
        <div class="ai-section">
          <div class="section-header">
            <label class="section-label">{{ t('aiPanel.preview') }}</label>
            <div class="header-actions">
              <NButton size="tiny" @click="generatePreview">
                {{ t('aiPanel.generatePreview') }}
              </NButton>
              <NButton size="tiny" :disabled="!previewText" @click="previewCopy.copy">
                {{ previewCopy.copied.value ? t('aiPanel.copied') : t('aiPanel.copy') }}
              </NButton>
            </div>
          </div>
          <NInput
            v-model:value="previewText"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 18 }"
            class="preview-input"
            :placeholder="t('aiPanel.previewPlaceholder')"
          />
        </div>

        <!-- 精确模式：连词成句（输入可编辑，输出到第二个可编辑文本框） -->
        <div v-if="mode === 'precise'" class="ai-section">
          <div class="section-header">
            <label class="section-label">{{ t('aiPanel.sentence') }}</label>
            <div class="header-actions">
              <NButton
                size="tiny"
                type="primary"
                :loading="sentenceLoading"
                :disabled="sentenceLoading || regenerating"
                @click="sentenceMaking"
              >
                {{ sentenceLoading ? t('aiPanel.sentenceLoading') : t('aiPanel.sentence') }}
              </NButton>
              <NButton size="tiny" :disabled="!sentenceText" @click="sentenceCopy.copy">
                {{ sentenceCopy.copied.value ? t('aiPanel.copied') : t('aiPanel.copy') }}
              </NButton>
            </div>
          </div>
          <NSpin v-if="sentenceLoading" size="small" class="sentence-spin" />
          <NInput
            v-else
            v-model:value="sentenceText"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 12 }"
            class="preview-input"
            :placeholder="t('aiPanel.sentencePlaceholder')"
          />
        </div>

        <!-- 底部操作 -->
        <div class="ai-section bottom-actions">
          <NButton
            size="small"
            block
            type="primary"
            :loading="generating"
            :disabled="generating || regenerating"
            @click="directGenerate"
          >
            {{ generating ? t('aiPanel.directGenerateLoading') : t('aiPanel.directGenerate') }}
          </NButton>
          <NButton
            size="small"
            block
            :loading="regenerating"
            :disabled="generating || regenerating"
            @click="regenerate"
          >
            {{ regenerating ? t('aiPanel.regenerateLoading') : t('aiPanel.regenerate') }}
          </NButton>
          <NAlert
            v-if="error"
            type="error"
            :title="error"
            size="small"
            class="bottom-error"
          />
        </div>
      </template>
    </NScrollbar>
  </div>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.ai-scroll {
  flex: 1;
}

.ai-empty {
  padding: 24px 0;
}

/* 分区：纵向一堆，间隔用 border 分隔（呼应 SearchPanel 的简洁风格） */
.ai-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.config-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.config-label {
  flex-shrink: 0;
  width: 88px;
  padding-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.config-control {
  flex: 1;
  min-width: 0;
}

.actions-row {
  margin-top: 2px;
}

.reset-btn {
  align-self: flex-start;
}

.preview-input {
  width: 100%;
}

.bottom-error {
  width: 100%;
}

.sentence-spin {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.bottom-actions {
  gap: 6px;
}
</style>