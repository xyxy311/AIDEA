<script setup lang="ts">
/**
 * FloatingAIWordStrip — AI 生成词底部小字条（轻量模式）
 *
 * Teleport 到 body，position:fixed 吸附画布底部居中。与浮动面板共用 useAIWordPanel 状态，
 * displayMode 二选一（strip / panel），由 AppShell 按 displayMode 决定渲染哪个。
 *
 * 状态渲染：
 * - loading：一行小字「正在生成…」
 * - error：小字错误 + hover 显示「重试」
 * - words：纵向小字列表，整词点击即添加到视口中心（复用 useAIWordAdd.addWord）
 *   —— 词条过长时省略号显示，hover 经 title 查看完整内容
 * - 右上角 hover 才出现的极简控制：重生成 icon + 关闭/清除
 *
 * 添加节点逻辑与浮动面板完全一致，抽取自 useAIWordAdd。
 */
import { NSpin, NButton } from 'naive-ui'
import { RefreshOutline, CloseOutline } from '@vicons/ionicons5'
import { useAIWordPanel } from '@/composables/useAIWordPanel'
import { useAIWordAdd } from '@/composables/useAIWordAdd'
import { t } from '@/composables/useT'

const { visible, loading, error, words, clear, regenerate } = useAIWordPanel()
const { addWord } = useAIWordAdd()
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-word-strip">
      <div v-if="visible" class="ai-word-strip">
        <!-- 加载中 -->
        <div v-if="loading" class="ai-word-strip__state">
          <NSpin size="small" />
          <span class="ai-word-strip__hint">{{ t('aiWord.loading') }}</span>
        </div>

        <!-- 错误 -->
        <div v-else-if="error" class="ai-word-strip__state">
          <span class="ai-word-strip__error" :title="error">{{ t('aiWord.error', { message: error }) }}</span>
          <NButton size="tiny" text @click="regenerate">{{ t('aiWord.retry') }}</NButton>
        </div>

        <!-- 成功 -->
        <template v-else>
          <div v-if="words.length === 0" class="ai-word-strip__state">
            <span class="ai-word-strip__hint">{{ t('aiWord.empty') }}</span>
          </div>
          <ul v-else class="ai-word-strip__list">
            <li
              v-for="(word, idx) in words"
              :key="idx"
              class="ai-word-strip__item"
              :title="word"
              @click="addWord(word)"
            >
              <span class="ai-word-strip__word">{{ word }}</span>
            </li>
          </ul>
        </template>

        <!-- 右上角 hover 才出现的极简控制 -->
        <div class="ai-word-strip__controls">
          <button
            class="ai-word-strip__control"
            :title="t('aiWord.regenerate')"
            @click="regenerate"
          >
            <RefreshOutline class="ai-word-strip__icon" />
          </button>
          <button
            class="ai-word-strip__control"
            :title="t('aiWord.clear')"
            @click="clear"
          >
            <CloseOutline class="ai-word-strip__icon" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-word-strip {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 2100;
  max-width: 480px;
  min-width: 220px;
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  user-select: none;
}

/* hover 才显示右上角控制组 */
.ai-word-strip__controls {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ai-word-strip:hover .ai-word-strip__controls {
  opacity: 1;
}

.ai-word-strip__control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
}

.ai-word-strip__control:hover {
  color: var(--color-text);
  background-color: var(--color-primary-soft);
}

.ai-word-strip__icon {
  width: 14px;
  height: 14px;
}

/* ── 状态区（loading / error / empty）── */
.ai-word-strip__state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.ai-word-strip__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.ai-word-strip__error {
  font-size: 12px;
  color: var(--color-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* ── 纵向小字列表（最大高度 200px，滚动）── */
.ai-word-strip__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-word-strip__item {
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background-color 0.15s;
}

.ai-word-strip__item:hover {
  background-color: var(--color-primary-soft);
}

/* ── 过渡动画：从底部滑入 ── */
.ai-word-strip-enter-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.ai-word-strip-leave-active {
  transition:
    opacity 0.1s ease-in,
    transform 0.1s ease-in;
}

.ai-word-strip-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

.ai-word-strip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>