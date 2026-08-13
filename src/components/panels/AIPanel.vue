<script setup lang="ts">
/**
 * AIPanel - AI 面板（左侧活动栏面板之一，替换原 ViewTextPanel）
 *
 * 为 AI 提交流程准备上下文与配置：
 * - 全局提示词：项目级背景，v-model 直绑 project.globalPrompt。
 * - 当前视图设置：本地可编辑副本（进入面板 / 切换视图时从 project 重载），
 *   经「保存」提交到 project.setNodeAIConfig，「恢复默认」清空覆盖回退默认。
 * - 上下文预览：buildAIContext 实时生成，只读 + 复制。
 * - 精确模式：额外提供「连词成句」按钮，把结构化上下文转自然语言。
 * - 底部：发散当前视图 / 生成词（结果由 runXX 打印到控制台，本面板不渲染进画布）。
 *
 * 只做 UI 编排，不触碰 AI 调用 / store 数据层写逻辑之外的任何东西。
 */
import { ref, computed, reactive, watch, onMounted } from 'vue'
import type { Ref } from 'vue'
import {
  NSelect,
  NSwitch,
  NButton,
  NInput,
  NEmpty,
  NScrollbar,
  NSpin,
  NAlert,
} from 'naive-ui'
import type { AIConfig } from '@/types/ai'
import { useProjectStore } from '@/stores/project'
import { useNodeStore } from '@/stores/node'
import { VIEW_TEXT_ALGORITHMS } from '@/utils/viewText'
import {
  buildAIContext,
  runAISentenceMaking,
  runAIAssist,
  runAIWordGeneration,
} from '@/composables/useAIAssist'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { t } from '@/composables/useT'

const project = useProjectStore()
const nodeStore = useNodeStore()
const { show } = useAIWordPanel()

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
 * 当前节点 AI 配置的本地可编辑副本。
 * 进入面板 / currentNodeId 变化时从 project.getAIConfig 重载；
 * 改动不会实时写 store，经「保存」统一提交。
 */
const currentCfg = reactive<AIConfig>(JSON.parse(JSON.stringify(project.getAIConfig(project.currentNodeId))))

/** 从 project 重载本地副本（进入面板 / 切换视图时调用） */
function reloadConfig(): void {
  const cfg = project.getAIConfig(project.currentNodeId)
  currentCfg.localPrompt = cfg.localPrompt
  currentCfg.includeConnections = cfg.includeConnections
  currentCfg.mode = cfg.mode
  currentCfg.viewTextAlgoId = cfg.viewTextAlgoId
}

// 切换当前视图时重载本地副本（避免把上一个节点的设置带到新视图）
watch(() => project.currentNodeId, reloadConfig)
onMounted(reloadConfig)

/** 全局提示词输入：经 setGlobalPrompt 写 store（内部 markDataDirty），保证项目 dirty 正确标记 */
function onGlobalPromptInput(val: string): void {
  project.setGlobalPrompt(val)
}

/** 保存本视图设置 */
function saveConfig(): void {
  project.setNodeAIConfig(project.currentNodeId, { ...currentCfg })
  savedFlash.value = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (savedFlash.value = false), 1500)
}
const savedFlash = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

/** 恢复默认：清空该节点覆盖，并把本地副本重置为默认配置 */
function resetConfig(): void {
  project.clearNodeAIConfig(project.currentNodeId)
  const d = project.defaultAIConfig
  currentCfg.localPrompt = d.localPrompt
  currentCfg.includeConnections = d.includeConnections
  currentCfg.mode = d.mode
  currentCfg.viewTextAlgoId = d.viewTextAlgoId
}

/** 上下文预览：随本地副本实时计算（只读） */
const previewText = computed(() =>
  buildAIContext(nodeStore, project.currentNodeId, { ...currentCfg }),
)

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

// ── 精确模式：连词成句 ──

/** 连词成句结果（本地 ref，可复制） */
const sentenceResult = ref('')
const sentenceLoading = ref(false)
const sentenceError = ref('')
const sentenceCopy = makeCopier(sentenceResult)

/** 连词成句：把当前结构化上下文交给模型转自然语言描述 */
async function runSentence(): Promise<void> {
  if (!previewText.value) return
  sentenceLoading.value = true
  sentenceError.value = ''
  sentenceResult.value = ''
  try {
    sentenceResult.value = await runAISentenceMaking(previewText.value)
  } catch (err) {
    sentenceError.value = err instanceof Error ? err.message : String(err)
  } finally {
    sentenceLoading.value = false
  }
}

// ── 底部操作按钮 ──

/** 发散当前视图（结果打印到控制台） */
const divergeLoading = ref(false)
const divergeError = ref('')
async function runDiverge(): Promise<void> {
  if (divergeLoading.value) return
  divergeLoading.value = true
  divergeError.value = ''
  try {
    await runAIAssist()
  } catch (err) {
    divergeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    divergeLoading.value = false
  }
}

/** 生成词（唤醒浮动面板并注入内容） */
const generateLoading = ref(false)
const generateError = ref('')
async function runGenerateWords(): Promise<void> {
  if (generateLoading.value) return
  generateLoading.value = true
  generateError.value = ''
  try {
    const raw = await runAIWordGeneration()
    const words = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    show(words)
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : String(err)
  } finally {
    generateLoading.value = false
  }
}
</script>

<template>
  <div class="ai-panel">
    <NScrollbar class="ai-scroll">
      <div v-if="viewNodes.length === 0" class="ai-empty">
        <NEmpty :description="t('aiPanel.empty')" size="small" />
      </div>

      <template v-else>
        <!-- 全局提示词 -->
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

        <!-- 当前视图设置 -->
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

          <div class="config-row switch-row">
            <label class="config-label">{{ t('aiPanel.includeConnections') }}</label>
            <NSwitch v-model:value="currentCfg.includeConnections" size="small" />
          </div>

          <div class="config-row">
            <label class="config-label">{{ t('aiPanel.mode') }}</label>
            <NSelect
              v-model:value="currentCfg.mode"
              size="small"
              class="config-control"
              :options="modeOptions"
            />
          </div>

          <!-- 不带连线时才需要空间布局算法 -->
          <div v-if="currentCfg.includeConnections === false" class="config-row">
            <label class="config-label">{{ t('aiPanel.viewTextAlgo') }}</label>
            <NSelect
              v-model:value="currentCfg.viewTextAlgoId"
              size="small"
              class="config-control"
              :options="algorithmOptions"
            />
          </div>

          <div class="config-row actions-row">
            <NButton size="small" type="primary" class="save-btn" @click="saveConfig">
              {{ savedFlash ? t('aiPanel.saveDone') : t('aiPanel.save') }}
            </NButton>
            <NButton size="small" @click="resetConfig">{{ t('aiPanel.reset') }}</NButton>
          </div>
        </div>

        <!-- 上下文预览 -->
        <div class="ai-section">
          <div class="section-header">
            <label class="section-label">{{ t('aiPanel.preview') }}</label>
            <NButton size="tiny" :disabled="!previewText" @click="previewCopy.copy">
              {{ previewCopy.copied.value ? t('aiPanel.copied') : t('aiPanel.copy') }}
            </NButton>
          </div>
          <NInput
            :value="previewText"
            type="textarea"
            readonly
            :autosize="{ minRows: 6, maxRows: 18 }"
            class="preview-input"
          />
        </div>

        <!-- 精确模式：连词成句 -->
        <div v-if="currentCfg.mode === 'precise'" class="ai-section">
          <div class="section-header">
            <label class="section-label">{{ t('aiPanel.sentence') }}</label>
            <NButton
              size="tiny"
              type="primary"
              :loading="sentenceLoading"
              :disabled="!previewText || sentenceLoading"
              @click="runSentence"
            >
              {{ sentenceLoading ? t('aiPanel.sentenceLoading') : t('aiPanel.sentence') }}
            </NButton>
          </div>

          <NAlert
            v-if="sentenceError"
            type="error"
            :title="t('aiPanel.sentenceError', { message: sentenceError })"
            size="small"
            class="sentence-error"
          />

          <template v-if="sentenceResult">
            <div class="section-header">
              <NButton size="tiny" :disabled="!sentenceResult" @click="sentenceCopy.copy">
                {{ sentenceCopy.copied.value ? t('aiPanel.copied') : t('aiPanel.copy') }}
              </NButton>
            </div>
            <NInput
              :value="sentenceResult"
              type="textarea"
              readonly
              :autosize="{ minRows: 4, maxRows: 12 }"
              class="preview-input"
            />
          </template>
          <NSpin v-else-if="sentenceLoading" size="small" class="sentence-spin" />
        </div>

        <!-- 底部操作 -->
        <div class="ai-section bottom-actions">
          <NButton
            size="small"
            block
            :loading="divergeLoading"
            :disabled="divergeLoading"
            @click="runDiverge"
          >
            {{ t('aiPanel.diverge') }}
          </NButton>
          <NButton
            size="small"
            block
            :loading="generateLoading"
            :disabled="generateLoading"
            @click="runGenerateWords"
          >
            {{ t('aiPanel.generateWords') }}
          </NButton>
          <NAlert
            v-if="divergeError || generateError"
            type="error"
            :title="divergeError || generateError"
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

/* switch 行：开关贴左对齐即可，不需要占满宽度 */
.switch-row {
  align-items: center;
}

.actions-row {
  margin-top: 2px;
}

.save-btn {
  flex: 1;
}

.preview-input {
  width: 100%;
}

.sentence-error,
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