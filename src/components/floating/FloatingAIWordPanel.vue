<script setup lang="ts">
/**
 * FloatingAIWordPanel — AI 生成词浮动面板
 *
 * 本面板只展示共享状态内容 + 添加/关闭，不调用 AI 生成逻辑。
 * 内容（words/error）由 useAIWordPanel 共享单例提供，无加载态；
 * 生成由 AIPanel / 键盘快捷键完成，完成后再经 show(words) 注入。
 *
 * 渲染到 Teleport 浮动面板中：
 * - 头部为可拖拽把手（pointerdown/move/up + setPointerCapture），面板用 translate 定位
 * - 词列表整行可点击：点击即把该词添加为当前视图的节点
 * - 底部操作区：「全部添加」「关闭」
 *
 * 添加节点换算：视口中心屏幕坐标 → 世界坐标（world = (screen - offset) / scale），
 * 再经 useCommands().createNode 创建并入历史栈；批量操作用 beginBatch/commitBatch 合并为单条历史。
 * 添加逻辑已抽取到 useAIWordAdd，此处直接复用。
 */
import { ref, computed } from 'vue'
import { NScrollbar, NButton } from 'naive-ui'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { useAIWordAdd } from '@/composables/useAIWordAdd'
import { t } from '@/composables/useT'

const { visible, error, words, close } = useAIWordPanel()
const { addWord, addAll } = useAIWordAdd()

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
          <!-- 错误 -->
          <div v-if="error" class="ai-word__state">
            <span class="ai-word__error">{{ t('aiWord.error', { message: error }) }}</span>
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
              <NButton size="small" type="primary" @click="addAll(words)">{{ t('aiWord.addAll') }}</NButton>
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