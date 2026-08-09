<script setup lang="ts">
/**
 * FloatingAIWordPanel — AI 生成词浮动面板
 *
 * 复用 runAIWordGeneration() 生成词，渲染到 Teleport 浮动面板中：
 * - 头部为可拖拽把手（pointerdown/move/up + setPointerCapture），面板用 translate 定位
 * - 词列表整行可点击：点击即把该词添加为当前视图的节点
 * - 底部操作区：「全部添加」「重新生成」「关闭」
 *
 * 添加节点换算：视口中心屏幕坐标 → 世界坐标（world = (screen - offset) / scale），
 * 再经 useCommands().createNode 创建并入历史栈；批量操作用 beginBatch/commitBatch 合并为单条历史。
 */
import { ref, computed } from 'vue'
import { NScrollbar, NButton, NSpin } from 'naive-ui'
import { useActiveView } from '@/composables/useActiveView'
import { useStageSize } from '@/composables/useStageSize'
import { useCommands } from '@/composables/useCommands'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { t } from '@/composables/useT'
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '@/constants'

const { visible, loading, error, words, open, close, regenerate } = useAIWordPanel()
const active = useActiveView()
const commands = useCommands()
const { stageWidth, stageHeight } = useStageSize()

// ── 视口中心世界坐标 ──

/** 视口中心的世界坐标（左上角定位基准） */
function viewportCenterWorld(): { x: number; y: number } {
  const cx = stageWidth.value / 2
  const cy = stageHeight.value / 2
  return {
    x: (cx - active.view.stageX) / active.view.stageScale,
    y: (cy - active.view.stageY) / active.view.stageScale,
  }
}

// ── 添加节点 ──

/** 添加单个词为节点（左上角居中于视口中心）并选中 */
function addWord(word: string): void {
  const { x: cx, y: cy } = viewportCenterWorld()
  const nodeX = cx - DEFAULT_NODE_WIDTH / 2
  const nodeY = cy - DEFAULT_NODE_HEIGHT / 2
  const id = commands.createNode(active.project.currentNodeId, nodeX, nodeY, word)
  active.view.selectNode(id)
}

/** 全部添加：网格排布（列数 3），合并为单条历史，添加后不关闭面板 */
function addAll(): void {
  const cols = 3
  const gapX = DEFAULT_NODE_WIDTH + 24
  const gapY = DEFAULT_NODE_HEIGHT + 24
  const { x: cx, y: cy } = viewportCenterWorld()
  // 整个网格左上角对齐视口中心
  const startX = cx
  const startY = cy
  const ids: string[] = []
  commands.beginBatch()
  try {
    words.value.forEach((word, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const id = commands.createNode(
        active.project.currentNodeId,
        startX + col * gapX,
        startY + row * gapY,
        word,
      )
      ids.push(id)
    })
  } finally {
    commands.commitBatch()
  }
  // 选中最后创建的节点
  if (ids.length > 0) {
    active.view.selectNode(ids[ids.length - 1])
  }
}

// ── 拖动（头部为把手） ──

const dragState = ref<{ px: number; py: number; ox: number; oy: number } | null>(null)
const offset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const panelStyle = computed(() => ({
  transform: `translate(calc(-50% + ${offset.value.x}px), calc(-50% + ${offset.value.y}px))`,
}))

function onHeaderPointerDown(e: PointerEvent): void {
  dragState.value = {
    px: e.clientX,
    py: e.clientY,
    ox: offset.value.x,
    oy: offset.value.y,
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onHeaderPointerMove(e: PointerEvent): void {
  const d = dragState.value
  if (!d) return
  offset.value = {
    x: d.ox + (e.clientX - d.px),
    y: d.oy + (e.clientY - d.py),
  }
}

function onHeaderPointerUp(): void {
  dragState.value = null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-word">
      <div v-if="visible" class="ai-word" :style="panelStyle">
        <!-- 头部（拖拽把手） -->
        <div
          class="ai-word__header"
          @pointerdown="onHeaderPointerDown"
          @pointermove="onHeaderPointerMove"
          @pointerup="onHeaderPointerUp"
          @pointercancel="onHeaderPointerUp"
        >
          <span class="ai-word__title">{{ t('aiWord.title') }}</span>
          <button class="ai-word__close" @click="close" :title="t('aiWord.close')">×</button>
        </div>

        <!-- 主体 -->
        <div class="ai-word__body">
          <!-- 加载中 -->
          <div v-if="loading" class="ai-word__state">
            <NSpin size="small" />
            <span class="ai-word__hint">{{ t('aiWord.loading') }}</span>
          </div>

          <!-- 错误 -->
          <div v-else-if="error" class="ai-word__state">
            <span class="ai-word__error">{{ t('aiWord.error', { message: error }) }}</span>
            <NButton size="small" @click="regenerate">{{ t('aiWord.retry') }}</NButton>
          </div>

          <!-- 成功 -->
          <template v-else>
            <div v-if="words.length === 0" class="ai-word__state">
              <span class="ai-word__hint">{{ t('aiWord.empty') }}</span>
            </div>
            <NScrollbar v-else class="ai-word__scroll">
              <ul class="ai-word__list">
                <li
                  v-for="(word, idx) in words"
                  :key="idx"
                  class="ai-word__item"
                  @click="addWord(word)"
                >
                  <span class="ai-word__word">{{ word }}</span>
                  <button
                    class="ai-word__add"
                    :title="t('aiWord.add')"
                    @click.stop="addWord(word)"
                  >
                    ＋
                  </button>
                </li>
              </ul>
            </NScrollbar>

            <!-- 底部操作区 -->
            <div class="ai-word__actions">
              <NButton size="small" type="primary" @click="addAll">{{ t('aiWord.addAll') }}</NButton>
              <NButton size="small" @click="regenerate">{{ t('aiWord.regenerate') }}</NButton>
              <NButton size="small" @click="close">{{ t('aiWord.close') }}</NButton>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-word {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 2100;
  width: 300px;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  user-select: none;
  transition: opacity 0.18s ease;
}

.ai-word__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  cursor: grab;
}

.ai-word__header:active {
  cursor: grabbing;
}

.ai-word__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.ai-word__close {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.ai-word__close:hover {
  color: var(--color-text);
}

.ai-word__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-word__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
}

.ai-word__hint {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ai-word__error {
  font-size: 13px;
  color: var(--color-danger);
  text-align: center;
  word-break: break-all;
}

.ai-word__scroll {
  max-height: 260px;
}

.ai-word__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-word__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.ai-word__item:hover {
  background-color: var(--color-primary-soft);
}

.ai-word__word {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-word__add {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}

.ai-word__add:hover {
  color: var(--color-primary-pressed);
}

.ai-word__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}

/* ── 过渡动画 ── */
.ai-word-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.ai-word-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.ai-word-enter-from {
  opacity: 0;
  transform: translate(calc(-50% + 0px), calc(-50% + 0px)) translateY(4px);
}

.ai-word-leave-to {
  opacity: 0;
  transform: translate(calc(-50% + 0px), calc(-50% + 0px)) translateY(-2px);
}
</style>